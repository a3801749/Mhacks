import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { neon, type NeonQueryFunction } from "@neondatabase/serverless"
import { buildSeed } from "../seed"
import { applyChanges } from "../schedule"
import type { CalendarEvent, CheckIn, Project, Settings, Task, TimeLog, WeekData } from "../types"
import { PROJECT_COLORS, type EventPatch, type Store } from "./types"
import { RequestError } from "../errors"

const USER_ID = "u-demo"

type Sql = NeonQueryFunction<false, false>

const globalForNeon = globalThis as unknown as { __calendarNeon?: { sql: Sql; ready?: Promise<void> } }

function client() {
  if (!globalForNeon.__calendarNeon) {
    globalForNeon.__calendarNeon = { sql: neon(process.env.DATABASE_URL!) }
  }
  return globalForNeon.__calendarNeon
}

async function ensureReady(today: string) {
  const c = client()
  if (!c.ready) {
    c.ready = (async () => {
      const schema = readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8")
      const statements = schema
        .replace(/--.*$/gm, "")
        .split(";")
        .map((s) => s.trim())
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
    sql`INSERT INTO users (id, name, guidance_mode, check_in_enabled, ai_planner_enabled, screen_time_enabled)
        VALUES (${USER_ID}, 'Demo student', ${s.settings.guidanceMode}, ${s.settings.checkInEnabled},
                ${s.settings.aiPlannerEnabled}, ${s.settings.screenTimeEnabled})`,
    ...s.projects.map(
      (p) =>
        sql`INSERT INTO projects (id, user_id, name, color, course, type, priority, notes, pinned, pin_count, pin_order,
                                  target_minutes, assigned_date, due_date, progress_percent, completed_date)
            VALUES (${p.id}, ${USER_ID}, ${p.name}, ${p.color}, ${p.course}, ${p.type}, ${p.priority}, ${p.notes},
                    ${p.pinned}, ${p.pinCount}, ${p.pinOrder}, ${p.targetMinutes}, ${p.assignedDate}, ${p.dueDate},
                    ${p.progressPercent}, ${p.completedDate})`,
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
    ...s.checkIns.map(
      (c) => sql`INSERT INTO check_ins (user_id, date, rating, note) VALUES (${USER_ID}, ${c.date}, ${c.rating}, ${c.note})`,
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
  const [users, projects, tasks, events, logs, checkIns] = await Promise.all([
    sql`SELECT guidance_mode, check_in_enabled, ai_planner_enabled, screen_time_enabled FROM users WHERE id = ${USER_ID}`,
    sql`SELECT id, name, color, course, type, priority, notes, pinned, pin_count, pin_order, target_minutes, progress_percent,
               to_char(assigned_date, 'YYYY-MM-DD') AS assigned_date, to_char(due_date, 'YYYY-MM-DD') AS due_date,
               to_char(completed_date, 'YYYY-MM-DD') AS completed_date
        FROM projects WHERE user_id = ${USER_ID} ORDER BY id`,
    sql`SELECT t.id, t.project_id, t.title, t.estimate_minutes, t.done
        FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.user_id = ${USER_ID} ORDER BY t.id`,
    sql`SELECT id, project_id, task_id, title, to_char(date, 'YYYY-MM-DD') AS date, start_min, end_min, status,
               actual_minutes, kind, to_char(moved_from_date, 'YYYY-MM-DD') AS moved_from_date, moved_from_start_min
        FROM events WHERE user_id = ${USER_ID} ORDER BY date, start_min`,
    sql`SELECT l.id, l.task_id, l.event_id, l.minutes, l.note, l.created_at
        FROM time_logs l JOIN tasks t ON t.id = l.task_id JOIN projects p ON p.id = t.project_id
        WHERE p.user_id = ${USER_ID} ORDER BY l.created_at`,
    sql`SELECT to_char(date, 'YYYY-MM-DD') AS date, rating, note FROM check_ins WHERE user_id = ${USER_ID} ORDER BY date`,
  ])
  const u = users[0]
  return {
    source: "neon",
    settings: {
      guidanceMode: (u?.guidance_mode ?? "coach") as Settings["guidanceMode"],
      checkInEnabled: u?.check_in_enabled ?? true,
      aiPlannerEnabled: u?.ai_planner_enabled ?? true,
      screenTimeEnabled: u?.screen_time_enabled ?? false,
    },
    checkIns: checkIns.map((r): CheckIn => ({ date: r.date, rating: r.rating, note: r.note })),
    projects: projects.map(
      (r): Project => ({
        id: r.id,
        name: r.name,
        color: r.color,
        course: r.course,
        type: r.type,
        priority: r.priority,
        notes: r.notes,
        pinned: r.pinned,
        pinCount: r.pin_count,
        pinOrder: r.pin_order,
        targetMinutes: r.target_minutes,
        assignedDate: r.assigned_date,
        dueDate: r.due_date,
        progressPercent: r.progress_percent,
        completedDate: r.completed_date,
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
    // Lock the block and commit its total and ledger entry in one statement.
    const rows = await sql`
      WITH event AS (
        SELECT id, task_id, actual_minutes, end_min - start_min AS length FROM events
        WHERE id = ${eventId} AND user_id = ${USER_ID} FOR UPDATE
      ), totals AS (
        SELECT event.*, GREATEST(0, actual_minutes + ${minutes}) AS actual FROM event
      ), changed AS (
        UPDATE events e SET actual_minutes = totals.actual,
          status = CASE WHEN totals.actual = 0 THEN 'planned'
                        WHEN totals.actual >= totals.length THEN 'completed' ELSE 'partial' END
        FROM totals WHERE e.id = totals.id
        RETURNING e.id, e.task_id, totals.actual - totals.actual_minutes AS applied
      ), logged AS (
        INSERT INTO time_logs (id, task_id, event_id, minutes, note)
        SELECT ${`l-${randomUUID()}`}, task_id, id, applied, ${note} FROM changed
        WHERE task_id IS NOT NULL AND applied <> 0
        RETURNING id
      ) SELECT id FROM changed`
    if (rows.length === 0) throw new Error("Event not found")
    return load()
  },

  async updateLog(logId, patch) {
    const { sql } = client()
    const [result] = await sql`
      WITH entry AS (
        SELECT l.id, l.minutes, l.event_id FROM time_logs l
        JOIN tasks t ON t.id = l.task_id JOIN projects p ON p.id = t.project_id
        WHERE l.id = ${logId} AND p.user_id = ${USER_ID} FOR UPDATE OF l
      ), event AS (
        SELECT e.id, e.actual_minutes, e.end_min - e.start_min AS length FROM events e
        JOIN entry ON entry.event_id = e.id FOR UPDATE OF e
      ), changed AS (
        UPDATE time_logs l SET minutes = COALESCE(${patch.minutes ?? null}::int, l.minutes),
          note = COALESCE(${patch.note ?? null}, l.note)
        FROM entry WHERE l.id = entry.id AND NOT EXISTS (
          SELECT 1 FROM event WHERE actual_minutes + COALESCE(${patch.minutes ?? null}::int, entry.minutes) - entry.minutes < 0
        )
        RETURNING l.id, l.event_id, l.minutes - entry.minutes AS delta
      ), totals AS (
        SELECT event.*, GREATEST(0, event.actual_minutes + changed.delta) AS actual
        FROM event JOIN changed ON changed.event_id = event.id
      ), shifted AS (
        UPDATE events e SET actual_minutes = totals.actual,
          status = CASE WHEN totals.actual = 0 THEN 'planned'
                        WHEN totals.actual >= totals.length THEN 'completed' ELSE 'partial' END
        FROM totals WHERE e.id = totals.id RETURNING e.id
      ) SELECT (SELECT id FROM entry) AS id, EXISTS (SELECT 1 FROM changed) AS applied`
    if (!result.id) throw new Error("Log entry not found")
    if (!result.applied) throw new RequestError("This edit would make the block's logged time negative. Adjust its removal entries first.", 409)
    return load()
  },

  async deleteLog(logId) {
    const { sql } = client()
    const [result] = await sql`
      WITH entry AS (
        SELECT l.id, l.minutes, l.event_id FROM time_logs l
        JOIN tasks t ON t.id = l.task_id JOIN projects p ON p.id = t.project_id
        WHERE l.id = ${logId} AND p.user_id = ${USER_ID} FOR UPDATE OF l
      ), event AS (
        SELECT e.id, e.actual_minutes, e.end_min - e.start_min AS length FROM events e
        JOIN entry ON entry.event_id = e.id FOR UPDATE OF e
      ), removed AS (
        DELETE FROM time_logs l USING entry WHERE l.id = entry.id AND NOT EXISTS (
          SELECT 1 FROM event WHERE actual_minutes - entry.minutes < 0
        ) RETURNING l.id, l.event_id, l.minutes
      ), totals AS (
        SELECT event.*, GREATEST(0, event.actual_minutes - removed.minutes) AS actual
        FROM event JOIN removed ON removed.event_id = event.id
      ), shifted AS (
        UPDATE events e SET actual_minutes = totals.actual,
          status = CASE WHEN totals.actual = 0 THEN 'planned'
                        WHEN totals.actual >= totals.length THEN 'completed' ELSE 'partial' END
        FROM totals WHERE e.id = totals.id RETURNING e.id
      ) SELECT (SELECT id FROM entry) AS id, EXISTS (SELECT 1 FROM removed) AS applied`
    if (!result.id) throw new Error("Log entry not found")
    if (!result.applied) throw new RequestError("Deleting this entry would make the block's logged time negative. Adjust its removal entries first.", 409)
    return load()
  },

  async reorderPins(projectIds) {
    const { sql } = client()
    if (projectIds.length > 0) {
      await sql.transaction(
        projectIds.map((id, i) => sql`UPDATE projects SET pin_order = ${i} WHERE id = ${id} AND user_id = ${USER_ID}`),
      )
    }
    return load()
  },

  async updateEvent(eventId, patch: EventPatch) {
    const { sql } = client()
    const has = (key: keyof EventPatch) => Object.prototype.hasOwnProperty.call(patch, key)
    await sql`
      UPDATE events SET
        status = COALESCE(${patch.status ?? null}, status),
        date = COALESCE(${patch.date ?? null}::date, date),
        start_min = COALESCE(${patch.startMin ?? null}::int, start_min),
        end_min = COALESCE(${patch.endMin ?? null}::int, end_min),
        moved_from_date = CASE WHEN ${has("movedFromDate")} THEN ${patch.movedFromDate ?? null}::date ELSE moved_from_date END,
        moved_from_start_min = CASE WHEN ${has("movedFromStartMin")} THEN ${patch.movedFromStartMin ?? null}::int ELSE moved_from_start_min END
      WHERE id = ${eventId} AND user_id = ${USER_ID}`
    return load()
  },

  async deleteEvent(eventId) {
    const { sql } = client()
    const [result] = await sql`
      WITH event AS (
        SELECT id, actual_minutes, status FROM events WHERE id = ${eventId} AND user_id = ${USER_ID} FOR UPDATE
      ), removed AS (
        DELETE FROM events e USING event WHERE e.id = event.id AND event.actual_minutes = 0
          AND event.status <> 'completed' AND NOT EXISTS (SELECT 1 FROM time_logs WHERE event_id = event.id)
        RETURNING e.id
      ) SELECT EXISTS (SELECT 1 FROM event) AS found, EXISTS (SELECT 1 FROM removed) AS deleted`
    if (result.found && !result.deleted) throw new RequestError("This block has recorded work and cannot be removed by Undo.", 409)
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
    const changedIds = new Set(changes.map((c) => c.eventId))
    return { ...await load(), createdEventIds: next.filter((e) => !before.has(e.id)).map((e) => e.id),
      previousEvents: week.events.filter((e) => changedIds.has(e.id)) }
  },

  async updateSettings(settings) {
    const { sql } = client()
    await sql`UPDATE users SET guidance_mode = ${settings.guidanceMode}, check_in_enabled = ${settings.checkInEnabled},
                 ai_planner_enabled = ${settings.aiPlannerEnabled}, screen_time_enabled = ${settings.screenTimeEnabled}
              WHERE id = ${USER_ID}`
    return load()
  },

  async updateProject(projectId, patch) {
    const { sql } = client()
    const has = (k: keyof typeof patch) => Object.prototype.hasOwnProperty.call(patch, k)
    const rows = await sql`
      UPDATE projects SET
        name = COALESCE(${patch.name ?? null}, name),
        course = COALESCE(${patch.course ?? null}, course),
        type = COALESCE(${patch.type ?? null}, type),
        priority = COALESCE(${patch.priority ?? null}, priority),
        notes = COALESCE(${patch.notes ?? null}, notes),
        pin_count = CASE WHEN ${patch.pinned === true} AND NOT pinned THEN pin_count + 1 ELSE pin_count END,
        pin_order = CASE WHEN ${patch.pinned === true} AND NOT pinned
          THEN (SELECT COALESCE(MAX(pin_order), -1) + 1 FROM projects WHERE user_id = ${USER_ID} AND pinned)
          ELSE pin_order END,
        pinned = COALESCE(${patch.pinned ?? null}::boolean, pinned),
        target_minutes = COALESCE(${patch.targetMinutes ?? null}::int, target_minutes),
        assigned_date = COALESCE(${patch.assignedDate ?? null}::date, assigned_date),
        due_date = COALESCE(${patch.dueDate ?? null}::date, due_date),
        progress_percent = CASE WHEN ${has("progressPercent")} THEN ${patch.progressPercent ?? null}::int ELSE progress_percent END,
        completed_date = CASE WHEN ${has("completedDate")} THEN ${patch.completedDate ?? null}::date ELSE completed_date END
      WHERE id = ${projectId} AND user_id = ${USER_ID}
      RETURNING id`
    if (rows.length === 0) throw new Error("Assignment not found")
    return load()
  },

  async createProject(input) {
    const { sql } = client()
    const [{ count }] = await sql`SELECT count(*)::int AS count FROM projects WHERE user_id = ${USER_ID}`
    const id = `p-${Date.now().toString(36)}`
    await sql.transaction([
      sql`INSERT INTO projects (id, user_id, name, color, course, type, priority, notes, target_minutes,
                                assigned_date, due_date)
          VALUES (${id}, ${USER_ID}, ${input.name}, ${PROJECT_COLORS[count % PROJECT_COLORS.length]}, ${input.course},
                  ${input.type}, ${input.priority ?? "completion"}, ${input.notes ?? ""}, ${input.targetMinutes},
                  ${input.assignedDate}, ${input.dueDate})`,
      sql`INSERT INTO tasks (id, project_id, title, estimate_minutes)
          VALUES (${`t-${Date.now().toString(36)}`}, ${id}, ${input.firstTask}, ${input.targetMinutes})`,
    ])
    return load()
  },

  async saveCheckIn(date, rating, note) {
    const { sql } = client()
    await sql`INSERT INTO check_ins (user_id, date, rating, note) VALUES (${USER_ID}, ${date}, ${rating}, ${note})
              ON CONFLICT (user_id, date) DO UPDATE SET rating = EXCLUDED.rating, note = EXCLUDED.note`
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
