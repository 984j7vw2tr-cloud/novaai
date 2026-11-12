import {
  type AIProvider,
  type ContentPart,
  type ProviderEvent,
  ProviderError,
  type ProviderMessage,
  type ProviderRequest,
} from './types.ts';

/**
 * OpenAI の Responses API をストリーミングで呼び出す。
 * Chat Completions との違い：
 * - ウェブ検索（web_search）を OpenAI 側で行える（AIが必要なときだけ自分で検索する）
 * - 道具（画像を作る など）を使うときも「深く考える」を切らなくてよい
 * 会話の内容は OpenAI 側に保存しない（store: false）。
 */
export function createOpenAIResponsesProvider(options: {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}): AIProvider {
  const baseUrl = (options.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const doFetch = options.fetchImpl ?? fetch;

  return {
    name: 'openai-responses',
    toolsWithReasoning: true,
    async *stream(req: ProviderRequest): AsyncGenerator<ProviderEvent> {
      const tools: unknown[] = [];
      if (req.webSearch) tools.push({ type: 'web_search' });
      for (const t of req.tools ?? []) {
        tools.push({
          type: 'function',
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        });
      }
      const res = await doFetch(`${baseUrl}/responses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: req.model,
          input: toInput(req.messages),
          stream: true,
          store: false,
          max_output_tokens: req.maxOutputTokens,
          ...(req.reasoningEffort ? { reasoning: { effort: req.reasoningEffort } } : {}),
          ...(tools.length ? { tools } : {}),
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

      let searching = false;
      for await (const data of readSseData(res.body)) {
        if (data === '[DONE]') return;
        let ev: ResponsesEvent;
        try {
          ev = JSON.parse(data);
        } catch {
          continue;
        }
        switch (ev.type) {
          case 'response.output_text.delta':
            if (ev.delta) yield { type: 'delta', text: ev.delta };
            break;
          case 'response.web_search_call.in_progress':
          case 'response.web_search_call.searching':
            // 検索を始めた（アプリに「ウェブで検索しています…」を出す）。1回の回答で1度だけ知らせる
            if (!searching) {
              searching = true;
              yield { type: 'status', status: 'searching' };
            }
            break;
          case 'response.output_text.annotation.added': {
            const a = ev.annotation;
            if (a?.type === 'url_citation' && a.url) {
              yield { type: 'source', url: a.url, title: a.title ?? '' };
            }
            break;
          }
          case 'response.output_item.done': {
            const item = ev.item;
            if (item?.type === 'function_call' && item.name) {
              yield {
                type: 'tool_call',
                call: { id: item.call_id ?? '', name: item.name, arguments: item.arguments ?? '' },
              };
            } else if (item?.type === 'web_search_call') {
              yield { type: 'search_done' };
            }
            break;
          }
          case 'response.completed':
          case 'response.incomplete': {
            const u = ev.response?.usage;
            if (u) {
              yield {
                type: 'usage',
                inputTokens: u.input_tokens ?? 0,
                outputTokens: u.output_tokens ?? 0,
                cachedInputTokens: u.input_tokens_details?.cached_tokens ?? 0,
              };
            }
            return;
          }
          case 'response.failed':
          case 'error': {
            const err = ev.response?.error ?? ev.error ?? { code: ev.code, message: ev.message };
            throw new ProviderError(
              500,
              err?.code ?? undefined,
              err?.message ?? 'OpenAI response failed',
            );
          }
        }
      }
    },
  };
}

/** 共通の会話の形を、Responses API の input の形に直す */
export function toInput(messages: ProviderMessage[]): unknown[] {
  const out: unknown[] = [];
  for (const m of messages) {
    if (m.role === 'tool') {
      out.push({ type: 'function_call_output', call_id: m.tool_call_id, output: m.content });
    } else if ('tool_calls' in m) {
      if (m.content) out.push({ role: 'assistant', content: m.content });
      for (const c of m.tool_calls) {
        out.push({ type: 'function_call', call_id: c.id, name: c.name, arguments: c.arguments });
      }
    } else if (typeof m.content === 'string') {
      out.push({ role: m.role, content: m.content });
    } else if (m.role === 'assistant') {
      // AIの発言は文章だけ渡す
      const text = m.content
        .filter((p): p is Extract<ContentPart, { type: 'text' }> => p.type === 'text')
        .map((p) => p.text)
        .join('\n');
      out.push({ role: 'assistant', content: text });
    } else {
      out.push({ role: m.role, content: m.content.map(toInputPart) });
    }
  }
  return out;
}

function toInputPart(p: ContentPart) {
  switch (p.type) {
    case 'text':
      return { type: 'input_text', text: p.text };
    case 'image_url':
      return { type: 'input_image', image_url: p.image_url.url };
    case 'file':
      return { type: 'input_file', filename: p.file.filename, file_data: p.file.file_data };
  }
}

type ResponsesEvent = {
  type: string;
  delta?: string;
  annotation?: { type?: string; url?: string; title?: string };
  item?: {
    type?: string;
    name?: string;
    call_id?: string;
    arguments?: string;
  };
  response?: {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      input_tokens_details?: { cached_tokens?: number } | null;
    } | null;
    error?: { code?: string; message?: string } | null;
  };
  error?: { code?: string; message?: string };
  code?: string;
  message?: string;
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
