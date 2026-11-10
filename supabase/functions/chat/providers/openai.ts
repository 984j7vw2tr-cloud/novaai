import { type AIProvider, type ProviderEvent, ProviderError, type ProviderRequest } from './types.ts';

/** OpenAI の Chat Completions API をストリーミングで呼び出す */
export function createOpenAIProvider(options: {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}): AIProvider {
  const baseUrl = (options.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const doFetch = options.fetchImpl ?? fetch;

  return {
    name: 'openai',
    async *stream(req: ProviderRequest): AsyncGenerator<ProviderEvent> {
      const res = await doFetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: req.model,
          messages: req.messages,
          stream: true,
          stream_options: { include_usage: true },
          max_completion_tokens: req.maxOutputTokens,
        }),
        signal: req.signal,
      });

      if (!res.ok || !res.body) {
        let code: string | undefined;
        let message = `OpenAI responded ${res.status}`;
        try {
          const data = await res.json();
          code = data?.error?.code ?? data?.error?.type;
          if (data?.error?.message) message = String(data.error.message);
        } catch {
          // 本文がJSONでない場合はそのまま
        }
        throw new ProviderError(res.status, code, message);
      }

      // Server-Sent Events（"data: {...}" の行が続く形式）を1行ずつ読む
      for await (const data of readSseData(res.body)) {
        if (data === '[DONE]') return;
        let chunk: OpenAIChunk;
        try {
          chunk = JSON.parse(data);
        } catch {
          continue;
        }
        const text = chunk.choices?.[0]?.delta?.content;
        if (text) yield { type: 'delta', text };
        if (chunk.usage) {
          yield {
            type: 'usage',
            inputTokens: chunk.usage.prompt_tokens ?? 0,
            outputTokens: chunk.usage.completion_tokens ?? 0,
          };
        }
      }
    },
  };
}

type OpenAIChunk = {
  choices?: { delta?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
};

async function* readSseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        if (line.startsWith('data:')) yield line.slice(5).trim();
      }
    }
    const rest = buffer.trim();
    if (rest.startsWith('data:')) yield rest.slice(5).trim();
  } finally {
    reader.releaseLock();
  }
}
