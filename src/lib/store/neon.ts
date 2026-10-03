import { readFileSync } from "node:fs"
import path from "node:path"
import { neon, type NeonQueryFunction } from "@neondatabase/serverless"
import { buildSeed } from "../seed"
import { applyChanges } from "../schedule"
import type { CalendarEvent, Project, Settings, Task, TimeLog, WeekData } from "../types"
import type { EventPatch, Store } from "./types"

const USER_ID = "u-demo"

type Sql = NeonQueryFunction<false, false>

const globalForNeon = globalThis as unknown as { __ebbNeon?: { sql: Sql; ready?: Promise<void> } }

function client() {
  if (!globalForNeon.__ebbNeon) {
    globalForNeon.__ebbNeon = { sql: neon(process.env.DATABASE_URL!) }
  }
  return globalForNeon.__ebbNeon
}

async function ensureReady(today: string) {
  const c = client()
  if (!c.ready) {
    c.ready = (async () => {
      const schema = readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8")
      const statements = schema
        .split(";")
        .map((s) => s.replace(/--.*$/gm, "").trim())
        .filter(Boolean)
      for (const stmt of statements) await c.sql.query(stmt)
      const rows = await c.sql`SELECT 1 FROM users WHERE id = ${USER_ID}`
      if (rows.length === 0) await seed(c.sql, today)
    })().catch((err) => {
      c.ready = undefined
      throw err
    })
  }
  await c.ready
}

async function seed(sql: Sql, today: string) {
  const s = buildSeed(today)
  await sql.transaction([
    sql`INSERT INTO users (id, name, guidance_mode) VALUES (${USER_ID}, 'Demo student', ${s.settings.guidanceMode})`,
    ...s.projects.map(
      (p) =>
        sql`INSERT INTO projects (id, user_id, name, color, target_minutes, due_date)
            VALUES (${p.id}, ${USER_ID}, ${p.name}, ${p.color}, ${p.targetMinutes}, ${p.dueDate})`,
    ),
    ...s.tasks.map(
      (t) =>
        sql`INSERT INTO tasks (id, project_id, title, estimate_minutes, done)
            VALUES (${t.id}, ${t.projectId}, ${t.title}, ${t.estimateMinutes}, ${t.done})`,
    ),
    ...s.events.map((e) => insertEvent(sql, e)),
    ...s.logs.map(
      (l) =>
        sql`INSERT INTO time_logs (id, task_id, event_id, minutes, note, created_at)
            VALUES (${l.id}, ${l.taskId}, ${l.eventId}, ${l.minutes}, ${l.note}, ${l.createdAt})`,
    ),
  ])
}

function insertEvent(sql: Sql, e: CalendarEvent) {
  return sql`INSERT INTO events (id, user_id, project_id, task_id, title, date, start_min, end_min, status,
                                 actual_minutes, kind, moved_from_date, moved_from_start_min)
             VALUES (${e.id}, ${USER_ID}, ${e.projectId}, ${e.taskId}, ${e.title}, ${e.date}, ${e.startMin},
                     ${e.endMin}, ${e.status}, ${e.actualMinutes}, ${e.kind}, ${e.movedFromDate},
                     ${e.movedFromStartMin})
             ON CONFLICT (id) DO UPDATE SET
               date = EXCLUDED.date, start_min = EXCLUDED.start_min, end_min = EXCLUDED.end_min,
               status = EXCLUDED.status, moved_from_date = EXCLUDED.moved_from_date,
               moved_from_start_min = EXCLUDED.moved_from_start_min`
}

async function load(): Promise<WeekData> {
  const { sql } = client()
  const [users, projects, tasks, events, logs] = await Promise.all([
    sql`SELECT guidance_mode FROM users WHERE id = ${USER_ID}`,
    sql`SELECT id, name, color, target_minutes, to_char(due_date, 'YYYY-MM-DD') AS due_date
        FROM projects WHERE user_id = ${USER_ID} ORDER BY id`,
    sql`SELECT t.id, t.project_id, t.title, t.estimate_minutes, t.done
        FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.user_id = ${USER_ID} ORDER BY t.id`,
    sql`SELECT id, project_id, task_id, title, to_char(date, 'YYYY-MM-DD') AS date, start_min, end_min, status,
               actual_minutes, kind, to_char(moved_from_date, 'YYYY-MM-DD') AS moved_from_date, moved_from_start_min
        FROM events WHERE user_id = ${USER_ID} ORDER BY date, start_min`,
    sql`SELECT l.id, l.task_id, l.event_id, l.minutes, l.note, l.created_at
        FROM time_logs l JOIN tasks t ON t.id = l.task_id JOIN projects p ON p.id = t.project_id
        WHERE p.user_id = ${USER_ID} ORDER BY l.created_at`,
  ])
  return {
    source: "neon",
    settings: { guidanceMode: (users[0]?.guidance_mode ?? "coach") as Settings["guidanceMode"] },
    projects: projects.map(
      (r): Project => ({
        id: r.id,
        name: r.name,
        color: r.color,
        targetMinutes: r.target_minutes,
        dueDate: r.due_date,
      }),
    ),
    tasks: tasks.map(
      (r): Task => ({
        id: r.id,
        projectId: r.project_id,
        title: r.title,
        estimateMinutes: r.estimate_minutes,
        done: r.done,
      }),
    ),
    events: events.map(
      (r): CalendarEvent => ({
        id: r.id,
        projectId: r.project_id,
        taskId: r.task_id,
        title: r.title,
        date: r.date,
        startMin: r.start_min,
        endMin: r.end_min,
        status: r.status,
        actualMinutes: r.actual_minutes,
        kind: r.kind,
        movedFromDate: r.moved_from_date,
        movedFromStartMin: r.moved_from_start_min,
      }),
    ),
    logs: logs.map(
      (r): TimeLog => ({
        id: r.id,
        taskId: r.task_id,
        eventId: r.event_id,
        minutes: r.minutes,
        note: r.note,
        createdAt: new Date(r.created_at).toISOString(),
      }),
    ),
  }
}

export const neonStore: Store = {
  async getWeek(today) {
    await ensureReady(today)
    return load()
  },

  async logTime(eventId, minutes, note) {
    const { sql } = client()
    const rows = await sql`
      UPDATE events SET
        actual_minutes = actual_minutes + ${minutes},
        status = CASE WHEN actual_minutes + ${minutes} >= end_min - start_min THEN 'completed' ELSE 'partial' END
      WHERE id = ${eventId} AND user_id = ${USER_ID}
      RETURNING task_id`
    if (rows.length === 0) throw new Error("Event not found")
    if (rows[0].task_id) {
      await sql`INSERT INTO time_logs (id, task_id, event_id, minutes, note)
                VALUES (${`l-${Date.now().toString(36)}`}, ${rows[0].task_id}, ${eventId}, ${minutes}, ${note})`
    }
    return load()
  },

  async updateEvent(eventId, patch: EventPatch) {
    const { sql } = client()
    await sql`
      UPDATE events SET
        status = COALESCE(${patch.status ?? null}, status),
        date = COALESCE(${patch.date ?? null}::date, date),
        start_min = COALESCE(${patch.startMin ?? null}::int, start_min),
        end_min = COALESCE(${patch.endMin ?? null}::int, end_min)
      WHERE id = ${eventId} AND user_id = ${USER_ID}`
    return load()
  },

  async setTaskDone(taskId, done) {
    const { sql } = client()
    await sql`UPDATE tasks SET done = ${done} WHERE id = ${taskId}`
    return load()
  },

  async applyChanges(changes) {
    const { sql } = client()
    const week = await load()
    const next = applyChanges(week.events, changes)
    const before = new Map(week.events.map((e) => [e.id, JSON.stringify(e)]))
    const dirty = next.filter((e) => before.get(e.id) !== JSON.stringify(e))
    if (dirty.length > 0) await sql.transaction(dirty.map((e) => insertEvent(sql, e)))
    return load()
  },

  async updateSettings(settings) {
    const { sql } = client()
    await sql`UPDATE users SET guidance_mode = ${settings.guidanceMode} WHERE id = ${USER_ID}`
    return load()
  },

  async reset(today) {
    const { sql } = client()
    await ensureReady(today)
    await sql`DELETE FROM users WHERE id = ${USER_ID}`
    await seed(sql, today)
    return load()
  },
}
