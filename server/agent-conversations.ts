import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export type AgentConversationRole = 'user' | 'assistant';
export type AgentConversationSource = 'ragflow' | 'local' | 'web' | 'qwen';

export interface AgentConversationSourceItem {
  id: string;
  title: string;
  excerpt?: string;
  similarity?: number;
  chapter?: string;
  kind?: string;
  url?: string;
  domain?: string;
}

export interface AgentConversationMessage {
  id: string;
  role: AgentConversationRole;
  content: string;
  createdAt: number;
  source?: AgentConversationSource;
  evidenceCount?: number;
  model?: string;
  sources?: AgentConversationSourceItem[];
  warning?: string;
  grounded?: boolean;
  modelBased?: boolean;
}

interface StoredConversation {
  clientId: string;
  agentType: string;
  updatedAt: number;
  messages: AgentConversationMessage[];
}

interface ConversationStore {
  version: 1;
  conversations: Record<string, StoredConversation>;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const DATA_FILE = path.join(DATA_DIR, 'agent-conversations.json');
const MAX_MESSAGES = 120;

function emptyStore(): ConversationStore {
  return { version: 1, conversations: {} };
}

function readStore(): ConversationStore {
  try {
    if (!fs.existsSync(DATA_FILE)) return emptyStore();
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as Partial<ConversationStore>;
    return {
      version: 1,
      conversations: parsed.conversations && typeof parsed.conversations === 'object'
        ? parsed.conversations
        : {},
    };
  } catch (error) {
    console.error('[AgentConversation] Failed to read store:', error);
    return emptyStore();
  }
}

function writeStore(store: ConversationStore) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temporaryFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(temporaryFile, DATA_FILE);
}

export function normalizeConversationClientId(value: unknown): string {
  const clientId = String(value || '').trim();
  return /^[A-Za-z0-9_-]{8,96}$/.test(clientId) ? clientId : '';
}

function conversationKey(clientId: string, agentType: string) {
  return `${clientId}::${agentType}`;
}

function cloneMessages(messages: AgentConversationMessage[]) {
  return JSON.parse(JSON.stringify(messages)) as AgentConversationMessage[];
}

export function getAgentConversation(clientId: string, agentType: string) {
  const conversation = readStore().conversations[conversationKey(clientId, agentType)];
  return {
    clientId,
    agentType,
    updatedAt: conversation?.updatedAt || 0,
    messages: cloneMessages(conversation?.messages || []),
  };
}

export function appendAgentConversationMessage(
  clientId: string,
  agentType: string,
  message: AgentConversationMessage,
) {
  const store = readStore();
  const key = conversationKey(clientId, agentType);
  const current = store.conversations[key] || {
    clientId,
    agentType,
    updatedAt: 0,
    messages: [],
  };

  const existing = current.messages.find((item) => item.id === message.id);
  if (!existing) current.messages.push(message);
  current.messages = current.messages.slice(-MAX_MESSAGES);
  current.updatedAt = Date.now();
  store.conversations[key] = current;
  writeStore(store);
  return message;
}

export function importAgentConversation(
  clientId: string,
  agentType: string,
  messages: AgentConversationMessage[],
) {
  const store = readStore();
  const key = conversationKey(clientId, agentType);
  if (store.conversations[key]?.messages?.length) {
    return getAgentConversation(clientId, agentType);
  }

  const deduplicated = messages
    .filter((message, index, all) => all.findIndex((candidate) => candidate.id === message.id) === index)
    .slice(-MAX_MESSAGES);
  store.conversations[key] = {
    clientId,
    agentType,
    updatedAt: Date.now(),
    messages: deduplicated,
  };
  writeStore(store);
  return getAgentConversation(clientId, agentType);
}

export function clearAgentConversation(clientId: string, agentType: string) {
  const store = readStore();
  const key = conversationKey(clientId, agentType);
  const existed = Boolean(store.conversations[key]);
  if (existed) {
    delete store.conversations[key];
    writeStore(store);
  }
  return existed;
}
