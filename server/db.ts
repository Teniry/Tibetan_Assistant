import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// JSON 文件存储路径
const dataDir = path.join(__dirname, '..', 'data');
const dbFilePath = path.join(dataDir, 'app-data.json');

// ============= 类型定义 =============

export interface DbSession {
  id: string;
  title: string;
  model: string;
  sdk_session_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  model: string | null;
  created_at: string;
  tool_calls: string | null;
}

interface AppData {
  sessions: DbSession[];
  messages: DbMessage[];
}

// ============= 数据读写 =============

function readData(): AppData {
  try {
    if (!fs.existsSync(dbFilePath)) {
      return { sessions: [], messages: [] };
    }
    const raw = fs.readFileSync(dbFilePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { sessions: [], messages: [] };
  }
}

function writeData(data: AppData): void {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(dbFilePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ============= 会话操作 =============

export function getAllSessions(): DbSession[] {
  const data = readData();
  return data.sessions.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export function getSession(id: string): DbSession | undefined {
  const data = readData();
  return data.sessions.find(s => s.id === id);
}

export function createSession(session: DbSession): DbSession {
  const data = readData();
  data.sessions.push(session);
  writeData(data);
  return session;
}

export function updateSession(id: string, updates: Partial<Pick<DbSession, 'title' | 'model' | 'sdk_session_id'>>): boolean {
  const data = readData();
  const session = data.sessions.find(s => s.id === id);
  if (!session) return false;

  if (updates.title !== undefined) session.title = updates.title;
  if (updates.model !== undefined) session.model = updates.model;
  if (updates.sdk_session_id !== undefined) session.sdk_session_id = updates.sdk_session_id;
  session.updated_at = new Date().toISOString();
  writeData(data);
  return true;
}

export function deleteSession(id: string): boolean {
  const data = readData();
  const idx = data.sessions.findIndex(s => s.id === id);
  if (idx === -1) return false;

  data.sessions.splice(idx, 1);
  // 级联删除消息
  data.messages = data.messages.filter(m => m.session_id !== id);
  writeData(data);
  return true;
}

// ============= 消息操作 =============

export function getMessagesBySession(sessionId: string): DbMessage[] {
  const data = readData();
  return data.messages
    .filter(m => m.session_id === sessionId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function createMessage(message: DbMessage): DbMessage {
  const data = readData();
  data.messages.push(message);

  // 更新会话的 updated_at
  const session = data.sessions.find(s => s.id === message.session_id);
  if (session) {
    session.updated_at = new Date().toISOString();
  }

  writeData(data);
  return message;
}

export function updateMessage(id: string, updates: Partial<Pick<DbMessage, 'content' | 'tool_calls'>>): boolean {
  const data = readData();
  const message = data.messages.find(m => m.id === id);
  if (!message) return false;

  if (updates.content !== undefined) message.content = updates.content;
  if (updates.tool_calls !== undefined) message.tool_calls = updates.tool_calls;
  writeData(data);
  return true;
}

export function deleteMessage(id: string): boolean {
  const data = readData();
  const idx = data.messages.findIndex(m => m.id === id);
  if (idx === -1) return false;
  data.messages.splice(idx, 1);
  writeData(data);
  return true;
}

export function createMessages(messages: DbMessage[]): void {
  const data = readData();
  data.messages.push(...messages);

  // 如果有消息，更新对应会话的 updated_at
  if (messages.length > 0) {
    const session = data.sessions.find(s => s.id === messages[0].session_id);
    if (session) {
      session.updated_at = new Date().toISOString();
    }
  }
  writeData(data);
}

export function clearAllData(): void {
  writeData({ sessions: [], messages: [] });
}

export default dbFilePath;
