import "server-only"
import { memoryStore } from "./memory"
import { neonStore } from "./neon"
import type { Store } from "./types"

export function getStore(): Store {
  return process.env.DATABASE_URL ? neonStore : memoryStore
}

export function integrations() {
  return {
    gemini: Boolean(process.env.GEMINI_API_KEY),
    elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
    neon: Boolean(process.env.DATABASE_URL),
  }
}
