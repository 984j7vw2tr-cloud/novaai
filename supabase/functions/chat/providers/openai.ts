import {
  type AIProvider,
  type ProviderEvent,
  ProviderError,
  type ProviderRequest,
} from './types.ts';

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
          // 道具の呼び出し（AIの発言）は OpenAI の形 {id, type, function:{name, arguments}} にして送る
          messages: req.messages.map((m) =>
            'tool_calls' in m
              ? {
                  role: 'assistant',
                  content: m.content,
                  tool_calls: m.tool_calls.map((c) => ({
                    id: c.id,
                    type: 'function',
                    function: { name: c.name, arguments: c.arguments },
                  })),
                }
              : m,
          ),
          stream: true,
          stream_options: { include_usage: true },
          max_completion_tokens: req.maxOutputTokens,
          ...(req.reasoningEffort ? { reasoning_effort: req.reasoningEffort } : {}),
          ...(req.tools?.length
            ? {
                tools: req.tools.map((t) => ({
                  type: 'function',
                  function: { name: t.name, description: t.description, parameters: t.parameters },
                })),
              }
            : {}),
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

      // 道具の呼び出しは少しずつ届くので、番号ごとに組み立ててから最後にまとめて返す
      const calls = new Map<number, { id: string; name: string; arguments: string }>();
      const flushCalls = function* () {
        for (const c of calls.values()) {
          if (c.name) yield { type: 'tool_call' as const, call: c };
        }
        calls.clear();
      };

      // Server-Sent Events（"data: {...}" の行が続く形式）を1行ずつ読む
      for await (const data of readSseData(res.body)) {
        if (data === '[DONE]') {
          yield* flushCalls();
          return;
        }
        let chunk: OpenAIChunk;
        try {
          chunk = JSON.parse(data);
        } catch {
          continue;
        }
        const text = chunk.choices?.[0]?.delta?.content;
        if (text) yield { type: 'delta', text };
        for (const tc of chunk.choices?.[0]?.delta?.tool_calls ?? []) {
          const cur = calls.get(tc.index) ?? { id: '', name: '', arguments: '' };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name += tc.function.name;
          if (tc.function?.arguments) cur.arguments += tc.function.arguments;
          calls.set(tc.index, cur);
        }
        if (chunk.usage) {
          yield {
            type: 'usage',
            inputTokens: chunk.usage.prompt_tokens ?? 0,
            outputTokens: chunk.usage.completion_tokens ?? 0,
            // 同じ指示文のくり返しは「キャッシュ」として安くなる（料金計算用）
            cachedInputTokens: chunk.usage.prompt_tokens_details?.cached_tokens ?? 0,
          };
        }
      }
      // [DONE] が来ずに終わったときも、組み立てた道具の呼び出しを返す
      yield* flushCalls();
    },
  };
}

type OpenAIChunk = {
  choices?: {
    delta?: {
      content?: string | null;
      tool_calls?: {
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }[];
    };
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number } | null;
  } | null;
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
