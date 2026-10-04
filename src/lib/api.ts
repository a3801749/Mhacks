import "server-only"
import { toDateKey, validDate } from "./time"
import { RequestError } from "./errors"

export function todayFrom(value: unknown): string {
  return validDate(value) ? value : toDateKey(new Date())
}

export async function handle<T>(fn: () => Promise<T>) {
  try {
    return Response.json(await fn())
  } catch (err) {
    if (!(err instanceof RequestError)) console.error(err)
    const message = err instanceof Error ? err.message : "Something went wrong"
    return Response.json({ error: message }, { status: err instanceof RequestError ? err.status : 500 })
  }
}
