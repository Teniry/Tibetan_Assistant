import { apiUrl } from './api-config';
import type { DigitalHumanId } from './digital-humans';

export interface SharedConversationSource {
  id: string;
  title: string;
  excerpt?: string;
  similarity?: number;
  chapter?: string;
  kind?: 'knowledge-base' | 'trusted-web';
  url?: string;
  domain?: string;
}

export interface SharedConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  source?: 'ragflow' | 'local' | 'web' | 'qwen';
  evidenceCount?: number;
  model?: string;
  sources?: SharedConversationSource[];
  warning?: string;
  grounded?: boolean;
  modelBased?: boolean;
}

export interface SharedConversation {
  clientId: string;
  agentType: DigitalHumanId;
  updatedAt: number;
  messages: SharedConversationMessage[];
}

const CLIENT_ID_KEY = 'muya-chat-client-id';
const DRAFT_KEY_PREFIX = 'muya-agent-draft-';
const DRAFT_EVENT = 'muya-agent-draft-change';

function draftKey(agentType: DigitalHumanId): string {
  return `${DRAFT_KEY_PREFIX}${agentType}`;
}

export function getAgentConversationDraft(agentType: DigitalHumanId): string {
  try {
    return localStorage.getItem(draftKey(agentType)) || '';
  } catch {
    return '';
  }
}

export function setAgentConversationDraft(agentType: DigitalHumanId, value: string): void {
  try {
    localStorage.setItem(draftKey(agentType), value);
    window.dispatchEvent(new CustomEvent(DRAFT_EVENT, { detail: { agentType, value } }));
  } catch {
    // 浏览器禁用本地存储时仍允许正常输入，只是不进行跨页面草稿同步。
  }
}

export function subscribeAgentConversationDraft(
  agentType: DigitalHumanId,
  listener: (value: string) => void,
): () => void {
  const onDraft = (event: Event) => {
    const detail = (event as CustomEvent<{ agentType?: string; value?: string }>).detail;
    if (detail?.agentType === agentType) listener(String(detail.value || ''));
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === draftKey(agentType)) listener(event.newValue || '');
  };
  window.addEventListener(DRAFT_EVENT, onDraft);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(DRAFT_EVENT, onDraft);
    window.removeEventListener('storage', onStorage);
  };
}

export function getChatClientId(): string {
  const existing = localStorage.getItem(CLIENT_ID_KEY);
  if (existing && /^[A-Za-z0-9_-]{8,96}$/.test(existing)) return existing;
  const generated = typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `client-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  localStorage.setItem(CLIENT_ID_KEY, generated);
  return generated;
}

export async function fetchAgentConversation(
  agentType: DigitalHumanId,
  signal?: AbortSignal,
): Promise<SharedConversation> {
  const clientId = getChatClientId();
  const response = await fetch(apiUrl(`/api/agent-conversations/${agentType}?clientId=${encodeURIComponent(clientId)}`), { signal });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `Failed to load conversation (${response.status})`);
  return payload as SharedConversation;
}

export async function clearAgentConversation(agentType: DigitalHumanId): Promise<void> {
  const clientId = getChatClientId();
  const response = await fetch(apiUrl(`/api/agent-conversations/${agentType}?clientId=${encodeURIComponent(clientId)}`), {
    method: 'DELETE',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `Failed to clear conversation (${response.status})`);
}

export async function importLegacyAgentConversation(
  agentType: DigitalHumanId,
  messages: SharedConversationMessage[],
): Promise<SharedConversation> {
  const clientId = getChatClientId();
  const response = await fetch(apiUrl(`/api/agent-conversations/${agentType}/import`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, messages }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `Failed to import conversation (${response.status})`);
  return payload as SharedConversation;
}
