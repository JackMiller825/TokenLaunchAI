import { env } from "../env";

export async function openAiJson(input: { schemaName: string; schema: Record<string, unknown>; system: string; user: string }) {
  if (!env.openaiKey) return null;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.openaiModel,
      temperature: 0.2,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: input.schemaName, strict: true, schema: input.schema },
      },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI HTTP ${response.status}: ${detail.slice(0, 300)}`);
  }
  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned an empty response.");
  return { json: JSON.parse(content) as unknown, model: env.openaiModel };
}

export function unsupportedClaims(text: string, allowedAddresses: string[]) {
  const found = text.match(/0x[a-fA-F0-9]{40}/g) ?? [];
  const allowed = new Set(allowedAddresses.map((item) => item.toLowerCase()));
  return found.filter((item) => !allowed.has(item.toLowerCase()));
}
