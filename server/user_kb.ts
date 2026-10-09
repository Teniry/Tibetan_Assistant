/**
 * 用户知识库管理模块（Python SQLite 桥接版）
 *
 * AutoDL 的基础镜像和 Node ABI 差异较大，直接加载 better-sqlite3 可能发生
 * Exit 139。这里复用项目已有的 Python sqlite3 实现，避免任何原生 Node 插件。
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PYTHON_SCRIPT = path.join(__dirname, 'user_kb.py');

export interface UserKBItem {
  id: string;
  name: string;
  source_filename: string;
  created_at: string;
  entry_count: number;
  chapters: string[];
}

export interface KBEntry {
  id: number;
  zh: string | null;
  bo: string | null;
  mu: string | null;
  ph: string | null;
  en: string | null;
  cat: string | null;
  question: string | null;
  answer: string | null;
}

function runPython<T>(command: string, args: string[] = [], payload?: unknown): T {
  const candidates = process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'];
  let result: any;
  for (const executable of candidates) {
    result = spawnSync(executable, [PYTHON_SCRIPT, command, ...args], {
      encoding: 'utf-8',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      input: payload === undefined ? undefined : JSON.stringify(payload),
      maxBuffer: 128 * 1024 * 1024,
    });
    if (!result.error || (result.error as NodeJS.ErrnoException).code !== 'ENOENT') break;
  }

  if (!result || result.error) {
    throw new Error(`Python 用户知识库模块启动失败：${result?.error?.message || '未找到可用 Python'}`);
  }
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || '用户知识库操作失败').trim());
  }

  try {
    return JSON.parse(result.stdout.trim()) as T;
  } catch {
    throw new Error(`用户知识库返回格式错误：${result.stdout.trim() || '空响应'}`);
  }
}

export function initUserKbTables(): void {
  runPython<{ success: boolean }>('init');
}

export function listUserKb(): UserKBItem[] {
  return runPython<UserKBItem[]>('list');
}

export function importFile(fileData: Buffer, filename: string):
  | { success: true; kb_id: string; name: string; entry_count: number; chapters: string[] }
  | { success: false; error: string } {
  return runPython('import', [], {
    filename,
    data: fileData.toString('base64'),
  });
}

export function getEntries(
  kbId: string,
  limit: number = 200,
  offset: number = 0,
  chapter?: string,
): KBEntry[] {
  return runPython<KBEntry[]>('entries', [kbId, String(limit), String(offset), chapter || '']);
}

export function deleteUserKb(kbId: string): { success: boolean; deleted?: boolean; error?: string } {
  return runPython('delete', [kbId]);
}
