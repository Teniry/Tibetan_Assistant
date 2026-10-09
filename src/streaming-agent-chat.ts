import { apiUrl } from './api-config';

export interface StreamingAgentChatResponse {
  answer: string;
  agentType?: string;
  source?: 'ragflow' | 'local' | 'web' | 'qwen';
  evidenceCount?: number;
  sources?: any[];
  model?: string;
  grounded?: boolean;
  warning?: string;
  conversationMessageId?: string;
  [key: string]: any;
}

export async function streamAgentChat(
  body: Record<string, any>,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<StreamingAgentChatResponse> {
  const response = await fetch(apiUrl('/api/agent-chat'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/x-ndjson, application/json',
    },
    body: JSON.stringify({ ...body, stream: true }),
    signal,
  });

  if (!response.ok) {
    const rawError = await response.text();
    try {
      const parsed = JSON.parse(rawError);
      throw new Error(parsed?.error || `Request failed (${response.status})`);
    } catch (error: any) {
      if (error instanceof SyntaxError) throw new Error(rawError || `Request failed (${response.status})`);
      throw error;
    }
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/x-ndjson') || !response.body) {
    const payload = await response.json() as StreamingAgentChatResponse;
    if (!payload.answer) throw new Error(payload.error || 'The assistant returned an empty answer');
    onDelta(payload.answer);
    return payload;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let answer = '';
  let metadata: StreamingAgentChatResponse = { answer: '' };

  const consumeLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const event = JSON.parse(trimmed);
    if (event.type === 'meta') {
      const { type: _type, ...rest } = event;
      metadata = { ...metadata, ...rest };
      return;
    }
    if (event.type === 'delta') {
      const text = String(event.text || '');
      if (!text) return;
      answer += text;
      onDelta(text);
      return;
    }
    if (event.type === 'done') {
      metadata.conversationMessageId = event.conversationMessageId;
      return;
    }
    if (event.type === 'error') {
      throw new Error(event.error || 'Streaming response failed');
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) consumeLine(line);
    if (done) break;
  }
  if (buffer.trim()) consumeLine(buffer);
  if (!answer.trim()) throw new Error('The assistant returned an empty streaming answer');
  return { ...metadata, answer };
}
