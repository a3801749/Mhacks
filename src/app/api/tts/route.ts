import type { NextRequest } from "next/server"
import { DEFAULT_VOICE } from "@/lib/voice"

export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) return Response.json({ error: "ElevenLabs not configured" }, { status: 501 })

  const { text } = (await req.json().catch(() => ({}))) as { text: string }
  if (!text?.trim()) return Response.json({ error: "No text" }, { status: 400 })

  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE.voiceId
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text: text.slice(0, 800),
        model_id: process.env.ELEVENLABS_MODEL_ID || DEFAULT_VOICE.modelId,
        voice_settings: DEFAULT_VOICE.settings,
      }),
    },
  )
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "")
    console.error("[elevenlabs]", res.status, detail)
    return Response.json({ error: "ElevenLabs request failed" }, { status: 502 })
  }
  return new Response(res.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } })
}
