/** Minimal LLM client: OpenAI-compatible endpoint when configured, deterministic fallback otherwise. */

export interface LLMClient {
  complete(prompt: string): Promise<string>;
}

export class EchoFallback implements LLMClient {
  async complete(prompt: string): Promise<string> {
    // deterministic fallback so tests + offline demo never need a key
    return prompt.includes('PANELIST:') ? '' : '[mock]';
  }
}

export class OpenAICompat implements LLMClient {
  constructor(
    private apiKey: string,
    private baseUrl = process.env.QUORUM_LLM_BASE_URL || 'https://api.openai.com/v1',
    private model = process.env.QUORUM_LLM_MODEL || 'gpt-4o-mini',
  ) {}

  async complete(prompt: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.6,
      }),
    });
    if (!res.ok) throw new Error(`LLM failed: ${res.status}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return json.choices?.[0]?.message?.content ?? '';
  }
}

export function buildLLM(): LLMClient {
  const key = process.env.QUORUM_LLM_API_KEY || process.env.OPENAI_API_KEY;
  return key ? new OpenAICompat(key) : new EchoFallback();
}
