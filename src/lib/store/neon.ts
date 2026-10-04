import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { neon, type NeonQueryFunction } from "@neondatabase/serverless"
import { buildSeed } from "../seed"
import { applyChanges } from "../schedule"
import { changeSeries, materializeSeries, removeOccurrences } from "../recurrence"
import { addDays, validDate } from "../time"
import type { CalendarEvent, EventSeries, CheckIn, Project, Settings, Task, TimeLog, WeekData } from "../types"
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
    sql`INSERT INTO users (id, name, guidance_mode, check_in_enabled, ai_planner_enabled, today_insights_enabled, analytics_patterns_enabled, screen_time_enabled)
        VALUES (${USER_ID}, 'Demo student', ${s.settings.guidanceMode}, ${s.settings.checkInEnabled},
                ${s.settings.aiPlannerEnabled}, ${s.settings.todayInsightsEnabled}, ${s.settings.analyticsPatternsEnabled}, ${s.settings.screenTimeEnabled})`,
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
    insertEvents(sql, s.events),
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

function eventRows(events: CalendarEvent[]) {
  return events.map((e) => ({ id: e.id, project_id: e.projectId, task_id: e.taskId, title: e.title,
    date: e.date, start_min: e.startMin, end_min: e.endMin, status: e.status, actual_minutes: e.actualMinutes,
    kind: e.kind, moved_from_date: e.movedFromDate, moved_from_start_min: e.movedFromStartMin,
    location: e.location, meeting_url: e.meetingUrl, notes: e.notes, series_id: e.seriesId,
    occurrence_date: e.occurrenceDate, is_exception: e.isException }))
}

function insertEvents(sql: Sql, events: CalendarEvent[]) {
  return sql`INSERT INTO events (id, user_id, project_id, task_id, title, date, start_min, end_min, status,
    actual_minutes, kind, moved_from_date, moved_from_start_min, location, meeting_url, notes, series_id, occurrence_date, is_exception)
    SELECT r.id, ${USER_ID}, r.project_id, r.task_id, r.title, r.date, r.start_min, r.end_min, r.status,
      r.actual_minutes, r.kind, r.moved_from_date, r.moved_from_start_min, r.location, r.meeting_url, r.notes, r.series_id, r.occurrence_date, r.is_exception
    FROM jsonb_to_recordset(${JSON.stringify(eventRows(events))}::jsonb) AS r(
      id text, project_id text, task_id text, title text, date date, start_min int, end_min int, status text,
      actual_minutes int, kind text, moved_from_date date, moved_from_start_min int, location text,
      meeting_url text, notes text, series_id text, occurrence_date date, is_exception boolean)
    ON CONFLICT (id) DO UPDATE SET
      date = EXCLUDED.date, start_min = EXCLUDED.start_min, end_min = EXCLUDED.end_min,
      status = CASE WHEN events.actual_minutes > 0 AND EXCLUDED.status <> 'skipped'
        THEN CASE WHEN events.actual_minutes >= EXCLUDED.end_min - EXCLUDED.start_min THEN 'completed' ELSE 'partial' END
        ELSE EXCLUDED.status END,
      title = EXCLUDED.title, project_id = EXCLUDED.project_id, task_id = EXCLUDED.task_id, kind = EXCLUDED.kind,
      location = EXCLUDED.location, meeting_url = EXCLUDED.meeting_url, notes = EXCLUDED.notes,
      series_id = EXCLUDED.series_id, occurrence_date = EXCLUDED.occurrence_date, is_exception = EXCLUDED.is_exception,
      moved_from_date = EXCLUDED.moved_from_date, moved_from_start_min = EXCLUDED.moved_from_start_min`
}

async function load(): Promise<WeekData> {
  const { sql } = client()
  const [users, projects, tasks, events, logs, checkIns, series] = await sql.transaction([
    sql`SELECT guidance_mode, check_in_enabled, ai_planner_enabled, today_insights_enabled, analytics_patterns_enabled, screen_time_enabled FROM users WHERE id = ${USER_ID}`,
    sql`SELECT id, name, color, course, type, priority, notes, pinned, pin_count, pin_order, target_minutes, progress_percent,
               to_char(assigned_date, 'YYYY-MM-DD') AS assigned_date, to_char(due_date, 'YYYY-MM-DD') AS due_date,
               to_char(completed_date, 'YYYY-MM-DD') AS completed_date
        FROM projects WHERE user_id = ${USER_ID} ORDER BY id`,
    sql`SELECT t.id, t.project_id, t.title, t.estimate_minutes, t.done
        FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.user_id = ${USER_ID} ORDER BY t.id`,
    sql`SELECT id, project_id, task_id, title, to_char(date, 'YYYY-MM-DD') AS date, start_min, end_min, status,
               actual_minutes, kind, location, meeting_url, notes, series_id, is_exception, to_char(occurrence_date, 'YYYY-MM-DD') AS occurrence_date, to_char(moved_from_date, 'YYYY-MM-DD') AS moved_from_date, moved_from_start_min
        FROM events WHERE user_id = ${USER_ID} ORDER BY date, start_min`,
    sql`SELECT l.id, l.task_id, l.event_id, l.minutes, l.note, l.created_at
        FROM time_logs l JOIN tasks t ON t.id = l.task_id JOIN projects p ON p.id = t.project_id
        WHERE p.user_id = ${USER_ID} ORDER BY l.created_at`,
    sql`SELECT to_char(date, 'YYYY-MM-DD') AS date, rating, note FROM check_ins WHERE user_id = ${USER_ID} ORDER BY date`,
    sql`SELECT definition FROM event_series WHERE user_id = ${USER_ID}`,
  ], { isolationLevel: "RepeatableRead", readOnly: true })
  const u = users[0]
  return {
    source: "neon",
    series: series.map((r) => r.definition as EventSeries),
    settings: {
      guidanceMode: (u?.guidance_mode ?? "coach") as Settings["guidanceMode"],
      checkInEnabled: u?.check_in_enabled ?? true,
      aiPlannerEnabled: u?.ai_planner_enabled ?? true,
      todayInsightsEnabled: u?.today_insights_enabled ?? true,
      analyticsPatternsEnabled: u?.analytics_patterns_enabled ?? true,
      screenTimeEnabled: false,
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
        location: r.location, meetingUrl: r.meeting_url, notes: r.notes, seriesId: r.series_id, occurrenceDate: r.occurrence_date, isException: r.is_exception,
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

async function saveSeriesState(before: WeekData, next: Pick<WeekData, "events" | "series">) {
  const { sql } = client()
  const previous = new Map(before.events.map((e) => [e.id, JSON.stringify(e)]))
  const retained = new Set(next.events.map((e) => e.id))
  const seriesIds = new Set(next.series.map((s) => s.id))
  const removed = before.events.filter((e) => !retained.has(e.id))
  const dirty = next.events.filter((e) => previous.get(e.id) !== JSON.stringify(e))
  try {
  await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext(${`tide-calendar:${USER_ID}`}))`,
    sql`SELECT 1 / CASE WHEN COALESCE((SELECT jsonb_object_agg(id, definition) FROM event_series WHERE user_id = ${USER_ID}), '{}'::jsonb)
      = ${JSON.stringify(Object.fromEntries(before.series.map((s) => [s.id, s])))}::jsonb THEN 1 ELSE 0 END AS unchanged`,
    sql`WITH expected AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(eventRows(removed))}::jsonb) AS r(
        id text, project_id text, task_id text, title text, date date, start_min int, end_min int, status text,
        actual_minutes int, kind text, moved_from_date date, moved_from_start_min int, location text,
        meeting_url text, notes text, series_id text, occurrence_date date, is_exception boolean)
    ), locked AS MATERIALIZED (
      SELECT e.* FROM events e JOIN expected x ON e.id = x.id WHERE e.user_id = ${USER_ID} FOR UPDATE OF e
    ) SELECT 1 / CASE WHEN (SELECT count(*) FROM locked) = ${removed.length}
      AND NOT EXISTS (SELECT 1 FROM locked e JOIN expected x ON e.id = x.id
        WHERE e.actual_minutes <> 0 OR ROW(e.title, e.date, e.start_min, e.end_min, e.status, e.kind, e.project_id, e.task_id, e.location, e.meeting_url, e.notes)
          IS DISTINCT FROM ROW(x.title, x.date, x.start_min, x.end_min, x.status, x.kind, x.project_id, x.task_id, x.location, x.meeting_url, x.notes)
          OR EXISTS (SELECT 1 FROM time_logs WHERE event_id = e.id)) THEN 1 ELSE 0 END AS unchanged`,
    ...next.series.filter((s) => JSON.stringify(s) !== JSON.stringify(before.series.find((p) => p.id === s.id))).map((s) => sql`INSERT INTO event_series (id, user_id, definition) VALUES (${s.id}, ${USER_ID}, ${JSON.stringify(s)}::jsonb)
      ON CONFLICT (id) DO UPDATE SET definition = EXCLUDED.definition`),
    sql`DELETE FROM events WHERE user_id = ${USER_ID} AND id = ANY(${removed.map((e) => e.id)}::text[])`,
    insertEvents(sql, dirty),
    ...before.series.filter((s) => !seriesIds.has(s.id)).map((s) => sql`DELETE FROM event_series WHERE id = ${s.id} AND user_id = ${USER_ID}`),
  ])
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "22012") throw new RequestError("Your calendar changed while saving. Refresh and try again.", 409)
    throw err
  }
}

export const neonStore: Store = {
  async getWeek(today, through) {
    await ensureReady(today)
    // The advisory lock serializes expansion with series/occurrence edits. A changed
    // definition is skipped and retried, rather than generating stale occurrences.
    for (let attempt = 0; attempt < 3; attempt++) {
      const week = await load()
      const next = materializeSeries(week.events, week.series, through ?? addDays(today, 366))
      const existing = new Set(week.events.map((e) => e.id))
      const added = next.filter((e) => !existing.has(e.id))
      if (!added.length) return week
      const { sql } = client()
      await sql.transaction([
        sql`SELECT pg_advisory_xact_lock(hashtext(${`tide-calendar:${USER_ID}`}))`,
        sql`INSERT INTO events
          (id, user_id, title, date, start_min, end_min, kind, location, meeting_url, notes, series_id, occurrence_date)
          SELECT e.id, ${USER_ID}, e.title, e.date, e.start_min, e.end_min, 'life', e.location, e.meeting_url, e.notes, e.series_id, e.occurrence_date
          FROM jsonb_to_recordset(${JSON.stringify(eventRows(added))}::jsonb) AS e(
            id text, title text, date date, start_min int, end_min int, location text, meeting_url text, notes text, series_id text, occurrence_date date)
          JOIN event_series s ON s.id = e.series_id AND s.user_id = ${USER_ID}
          WHERE s.definition = (${JSON.stringify(Object.fromEntries(week.series.map((s) => [s.id, s])))}::jsonb -> e.series_id)
          ON CONFLICT DO NOTHING`,
      ])
    }
    return load()
  },

  async logTime(eventId, minutes, note) {
    const { sql } = client()
    // Lock the block and commit its total and ledger entry in one statement.
    const [row] = await sql`
      WITH event AS (
        SELECT id, task_id, kind, actual_minutes, end_min - start_min AS length FROM events
        WHERE id = ${eventId} AND user_id = ${USER_ID} FOR UPDATE
      ), totals AS (
        SELECT event.*, GREATEST(0, actual_minutes + ${minutes}) AS actual FROM event WHERE kind = 'work'
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
      ) SELECT (SELECT id FROM event) AS id, (SELECT kind FROM event) AS kind`
    if (!row?.id) throw new Error("Event not found")
    if (row.kind !== "work") throw new RequestError("Focused time can only be logged on focus blocks")
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
        SELECT event.*, changed.delta, GREATEST(0, event.actual_minutes + changed.delta) AS actual
        FROM event JOIN changed ON changed.event_id = event.id
      ), shifted AS (
        UPDATE events e SET actual_minutes = totals.actual,
          status = CASE WHEN totals.actual = 0 THEN 'planned'
                        WHEN totals.actual >= totals.length THEN 'completed' ELSE 'partial' END
        FROM totals WHERE e.id = totals.id AND totals.delta <> 0 RETURNING e.id
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
    const result = await sql.transaction([
      sql`SELECT pg_advisory_xact_lock(hashtext(${`tide-calendar:${USER_ID}`}))`,
      sql`WITH updated AS (UPDATE events SET
        status = CASE WHEN COALESCE(${patch.status ?? null}, status) = 'skipped' THEN 'skipped'
          WHEN ${patch.status === "completed"} THEN 'completed'
          WHEN actual_minutes > 0 AND (${patch.status != null} OR ${patch.startMin != null} OR ${patch.endMin != null})
          THEN CASE WHEN actual_minutes >= COALESCE(${patch.endMin ?? null}::int, end_min) - COALESCE(${patch.startMin ?? null}::int, start_min) THEN 'completed' ELSE 'partial' END
          ELSE COALESCE(${patch.status ?? null}, status) END,
        title = COALESCE(${patch.title ?? null}, title),
        kind = COALESCE(${patch.kind ?? null}, kind),
        project_id = CASE WHEN ${has("projectId")} THEN ${patch.projectId ?? null} ELSE project_id END,
        task_id = CASE WHEN ${has("taskId")} THEN ${patch.taskId ?? null} ELSE task_id END,
        location = COALESCE(${patch.location ?? null}, location),
        meeting_url = COALESCE(${patch.meetingUrl ?? null}, meeting_url),
        notes = COALESCE(${patch.notes ?? null}, notes),
        is_exception = CASE WHEN series_id IS NOT NULL THEN COALESCE(${patch.isException ?? null}::boolean, true) ELSE is_exception END,
        date = COALESCE(${patch.date ?? null}::date, date),
        start_min = COALESCE(${patch.startMin ?? null}::int, start_min),
        end_min = COALESCE(${patch.endMin ?? null}::int, end_min),
        moved_from_date = CASE WHEN ${has("movedFromDate")} THEN ${patch.movedFromDate ?? null}::date ELSE moved_from_date END,
        moved_from_start_min = CASE WHEN ${has("movedFromStartMin")} THEN ${patch.movedFromStartMin ?? null}::int ELSE moved_from_start_min END
      WHERE id = ${eventId} AND user_id = ${USER_ID}
        AND COALESCE(${patch.endMin ?? null}::int, end_min) > COALESCE(${patch.startMin ?? null}::int, start_min)
        AND (NOT (${has("taskId")} AND task_id IS DISTINCT FROM ${patch.taskId ?? null}
              OR ${has("projectId")} AND project_id IS DISTINCT FROM ${patch.projectId ?? null}
              OR ${patch.kind !== undefined} AND kind IS DISTINCT FROM ${patch.kind ?? null})
             OR actual_minutes = 0 AND NOT EXISTS (SELECT 1 FROM time_logs WHERE event_id = ${eventId}))
        RETURNING id, series_id),
      bumped AS (UPDATE event_series SET definition = jsonb_set(definition, '{revision}', to_jsonb(COALESCE((definition->>'revision')::int, 0) + 1))
        WHERE id IN (SELECT series_id FROM updated WHERE series_id IS NOT NULL) RETURNING id)
      SELECT id FROM updated`,
    ])
    if (!result[1].length) throw new RequestError("The block changed while saving. Refresh and try again.", 409)
    return load()
  },

  async createSeries(input, today, replaceEventId) {
    const before = await load()
    if (replaceEventId) {
      const event = before.events.find((e) => e.id === replaceEventId)
      if (!event || event.seriesId || event.kind !== "life" || event.status !== "planned" || event.actualMinutes > 0 || before.logs.some((l) => l.eventId === replaceEventId)) {
        throw new RequestError("Only an unworked personal event can be converted into a repeating series")
      }
    }
    const series: EventSeries = { ...input, id: `series-${randomUUID()}`, stopBefore: null, excludedDates: [] }
    const next = { series: [...before.series, series], events: materializeSeries(before.events.filter((e) => e.id !== replaceEventId), [series], addDays(today, 366)) }
    await saveSeriesState(before, next)
    return load()
  },

  async editSeries(eventId, input, scope, today) {
    const before = await load()
    await saveSeriesState(before, changeSeries(before, eventId, input, scope, `series-${randomUUID()}`, today))
    return load()
  },

  async removeEvents(eventId, scope) {
    const before = await load()
    await saveSeriesState(before, removeOccurrences(before, eventId, scope))
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
    const rows = await sql`UPDATE tasks t SET done = ${done} FROM projects p
      WHERE t.id = ${taskId} AND t.project_id = p.id AND p.user_id = ${USER_ID} RETURNING t.id`
    if (rows.length === 0) throw new Error("Task not found")
    return load()
  },

  async applyChanges(changes) {
    const { sql } = client()
    const week = await load()
    const next = applyChanges(week.events, changes)
    const before = new Map(week.events.map((e) => [e.id, JSON.stringify(e)]))
    const dirty = next.filter((e) => before.get(e.id) !== JSON.stringify(e))
    if (dirty.length > 0) await sql.transaction([
      sql`SELECT pg_advisory_xact_lock(hashtext(${`tide-calendar:${USER_ID}`}))`,
      ...[...new Set(dirty.map((e) => e.seriesId).filter((id) => id !== null))].map((id) => sql`UPDATE event_series
        SET definition = jsonb_set(definition, '{revision}', to_jsonb(COALESCE((definition->>'revision')::int, 0) + 1)) WHERE id = ${id}`),
      insertEvents(sql, dirty),
    ])
    const changedIds = new Set(changes.map((c) => c.eventId))
    return { ...await load(), createdEventIds: next.filter((e) => !before.has(e.id)).map((e) => e.id),
      previousEvents: week.events.filter((e) => changedIds.has(e.id)) }
  },

  async updateSettings(settings) {
    const { sql } = client()
    await sql`UPDATE users SET guidance_mode = ${settings.guidanceMode}, check_in_enabled = ${settings.checkInEnabled},
                 ai_planner_enabled = ${settings.aiPlannerEnabled}, today_insights_enabled = ${settings.todayInsightsEnabled},
                 analytics_patterns_enabled = ${settings.analyticsPatternsEnabled}, screen_time_enabled = ${settings.screenTimeEnabled}
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
    const id = `p-${randomUUID()}`
    await sql.transaction([
      sql`INSERT INTO projects (id, user_id, name, color, course, type, priority, notes, target_minutes,
                                assigned_date, due_date)
          VALUES (${id}, ${USER_ID}, ${input.name}, ${PROJECT_COLORS[count % PROJECT_COLORS.length]}, ${input.course},
                  ${input.type}, ${input.priority ?? "completion"}, ${input.notes ?? ""}, ${input.targetMinutes},
                  ${input.assignedDate}, ${input.dueDate})`,
      sql`INSERT INTO tasks (id, project_id, title, estimate_minutes)
          VALUES (${`t-${randomUUID()}`}, ${id}, ${input.firstTask}, ${input.targetMinutes})`,
    ])
    return load()
  },

  async saveCheckIn(date, rating, note) {
    if (!validDate(date)) throw new RequestError("Invalid date")
    if (!Number.isInteger(rating) || rating < 1 || rating > 10) throw new RequestError("Rating must be 1–10")
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
