import "server-only"
import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai"

// Lite models with minimal thinking answer in well under a second, which keeps Tilly
// conversational. Older pinned models (e.g. gemini-2.5-*) are closed to new API keys
// and any one model can 503 under load, so walk down this list on 404/429/5xx/timeouts.
// Every listed model must accept thinkingLevel; "-latest" aliases reject it.
const MODELS = [
  ...new Set(
    [process.env.GEMINI_MODEL, "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash"]
      .filter(Boolean) as string[],
  ),
]
const ATTEMPT_MS = 6_000
const BUDGET_MS = 18_000

let client: GoogleGenAI | null = null

export function geminiEnabled() {
  return Boolean(process.env.GEMINI_API_KEY)
}

function retryable(err: unknown) {
  if (err instanceof ApiError) return err.status === 404 || err.status === 429 || err.status >= 500
  return err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError" || /abort|timed? ?out/i.test(err.message))
}

export async function generateJson<T>(systemInstruction: string, input: unknown, schema: unknown): Promise<T> {
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  let lastError: unknown
  const deadline = Date.now() + BUDGET_MS
  for (const model of MODELS) {
    const left = deadline - Date.now()
    if (left < 2_000) break
    try {
      const res = await client.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: JSON.stringify(input) }] }],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseJsonSchema: schema,
          temperature: 0.6,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          abortSignal: AbortSignal.timeout(Math.min(ATTEMPT_MS, left)),
        },
      })
      const text = res.text
      if (!text) throw new Error(`Gemini (${model}) returned an empty response`)
      return JSON.parse(text) as T
    } catch (err) {
      lastError = err
      if (!retryable(err)) throw err
      console.warn(`[gemini] ${model} unavailable, trying next model:`, err instanceof Error ? err.message : err)
    }
  }
  throw lastError ?? new Error("Gemini timed out")
}
