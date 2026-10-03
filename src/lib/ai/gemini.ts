import "server-only"
import { GoogleGenAI } from "@google/genai"

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash"

let client: GoogleGenAI | null = null

export function geminiEnabled() {
  return Boolean(process.env.GEMINI_API_KEY)
}

export async function generateJson<T>(systemInstruction: string, input: unknown, schema: unknown): Promise<T> {
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  const res = await client.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: JSON.stringify(input) }] }],
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseJsonSchema: schema,
      temperature: 0.6,
    },
  })
  const text = res.text
  if (!text) throw new Error("Gemini returned an empty response")
  return JSON.parse(text) as T
}
