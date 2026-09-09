export type AiExtractionConfig = {
  endpoint: string;
  apiKey: string;
  model: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxInputChars?: number;
  maxOutputBytes?: number;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
};

export type AiExtractionResult<T> = {
  data: T;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  model?: string;
};

export async function extractStructured<T>(
  pageText: string,
  instruction: string,
  config: AiExtractionConfig,
): Promise<AiExtractionResult<T>> {
  const maxInputChars = config.maxInputChars ?? 50000;
  const maxOutputBytes = config.maxOutputBytes ?? 256000;
  const input = pageText.slice(0, maxInputChars);
  const request = config.fetch ?? globalThis.fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 30000);

  try {
    const response = await request(`${config.endpoint.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        response_format: {
          type: 'json_schema',
          json_schema: { name: config.schemaName, strict: true, schema: config.schema },
        },
        messages: [
          { role: 'system', content: instruction },
          { role: 'user', content: input },
        ],
      }),
    });

    const raw = await response.text();
    if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}.`);
    if (new TextEncoder().encode(raw).byteLength > maxOutputBytes) throw new Error('AI provider response exceeds the configured limit.');

    const payload = JSON.parse(raw) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error('AI provider returned no structured content.');

    return {
      data: JSON.parse(content) as T,
      model: payload.model,
      usage: payload.usage ? {
        promptTokens: payload.usage.prompt_tokens,
        completionTokens: payload.usage.completion_tokens,
        totalTokens: payload.usage.total_tokens,
      } : undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}
