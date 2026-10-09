import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PYTHON_SCRIPT = path.join(__dirname, 'kb_query.py');
const PYTHON_CMD = 'python3'; // Git Bash / Linux / macOS
const PYTHON_CMD_WIN = 'python'; // Windows fallback
const PYTHON_ENV = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' };

function runPython(args: string): any {
  // 尝试 python3，失败则用 python
  let cmd = `${PYTHON_CMD} "${PYTHON_SCRIPT}" ${args}`;
  try {
    const stdout = execSync(cmd, { encoding: 'utf-8', timeout: 15000, env: PYTHON_ENV });
    return JSON.parse(stdout.trim());
  } catch {
    // Windows 回退
    cmd = `${PYTHON_CMD_WIN} "${PYTHON_SCRIPT}" ${args}`;
    try {
      const stdout = execSync(cmd, { encoding: 'utf-8', timeout: 15000, env: PYTHON_ENV });
      return JSON.parse(stdout.trim());
    } catch (e: any) {
      console.error('[KB] Python execution failed:', e.message);
      return null;
    }
  }
}

export interface KnowledgeEntry {
  id: number;
  zh: string | null;
  bo: string | null;
  mu: string | null;
  ph: string | null;
  en: string | null;
  cat: string | null;
  question: string | null;
  answer: string | null;
  search_text: string | null;
  segment?: string;
}

// 初始化知识库（验证数据可用）
export function initKnowledgeBase(): void {
  const result = runPython('init');
  if (result && !result.error) {
    console.log(`[KB] Knowledge base ready: ${result.total} entries, ${result.categories.length} categories`);
  } else {
    console.warn('[KB] Knowledge base init warning:', result?.error || 'unknown error');
  }
}

// 搜索知识库
export function searchKnowledge(query: string, limit: number = 10): KnowledgeEntry[] {
  const escaped = query.replace(/"/g, '\\"');
  const result = runPython(`search "${escaped}" ${limit}`);
  if (result && Array.isArray(result)) {
    return result;
  }
  return [];
}

// 按完整中文/藏文/木雅语检索词做包含匹配，不把词组拆成短滑窗。
export function searchKnowledgeLiteral(query: string, limit: number = 20): KnowledgeEntry[] {
  const escaped = query.replace(/"/g, '\\"');
  const result = runPython(`literal_search "${escaped}" ${limit}`);
  return Array.isArray(result) ? result : [];
}

// 按中文知识库词条对待翻译句子做最长匹配拆解；不会生成知识库之外的翻译。
export function decomposeKnowledge(query: string, limit: number = 12): KnowledgeEntry[] {
  const escaped = query.replace(/"/g, '\\"');
  const result = runPython(`decompose "${escaped}" ${limit}`);
  return Array.isArray(result) ? result : [];
}

// 格式化为教学上下文
export function formatKnowledgeContext(results: KnowledgeEntry[]): string {
  if (results.length === 0) {
    return '（知识库未收录相关词汇）';
  }

  return results.map((item, index) => {
    const parts: string[] = [];
    parts.push(`词条${index + 1}：`);
    if (item.zh) parts.push(`zh=${item.zh}`);
    if (item.bo) parts.push(`bo=${item.bo}`);
    if (item.mu) parts.push(`mu=${item.mu}`);
    if (item.ph) parts.push(`ph=${item.ph}`);
    if (item.en) parts.push(`en=${item.en}`);
    if (item.cat) parts.push(`cat=${item.cat}`);
    return parts.join(' | ');
  }).join('\n');
}

// 获取知识库统计
export function getKnowledgeStats(): { total: number; categories: string[] } {
  const result = runPython('stats');
  if (result && !result.error) {
    return result;
  }
  return { total: 0, categories: [] };
}

// 获取章节列表
export function getChapters(): { name: string; count: number }[] {
  const result = runPython('chapters');
  if (result && Array.isArray(result)) {
    return result;
  }
  return [];
}

// 按章节查询词条（用于章节学习页面）
export function getEntriesByChapter(chapter: string, limit: number = 100): KnowledgeEntry[] {
  const safeChapter = chapter.replace(/"/g, '');
  const result = runPython(`entries_by_cat "${safeChapter}" ${limit}`);
  if (result && Array.isArray(result)) {
    return result;
  }
  return [];
}

// 生成测验题目
export interface QuizQuestion {
  id: number;
  zh: string;
  bo: string;
  mu: string;
  ph: string;
  en: string;
  cat: string;
  options: string[];
  correctIndex: number;
}

export function generateQuiz(chapter?: string, count: number = 5, mode: string = 'random'): QuizQuestion[] {
  const chapterArg = chapter || 'all';
  const result = runPython(`quiz ${chapterArg} ${count} ${mode}`);
  if (result && Array.isArray(result)) {
    return result;
  }
  return [];
}
