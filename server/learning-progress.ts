import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = path.join(__dirname, '..', 'data', 'learning-progress.json');
const TIME_ZONE = 'Asia/Shanghai';

interface ChapterProgress {
  lastWordIndex: number;
  viewedWordIds: number[];
  visitedAt: string;
}

interface LearningProgressStore {
  version: 1;
  activeDates: string[];
  dailyActiveSeconds: Record<string, number>;
  quiz: {
    attempts: number;
    answered: number;
    correct: number;
    lastCompletedAt: string | null;
  };
  currentChapter: string | null;
  currentWordIndex: number;
  chapterProgress: Record<string, ChapterProgress>;
  lastActivityAt: string | null;
}

export interface LearningProgressView {
  streakDays: number;
  weeklySeconds: number;
  masteryPercent: number | null;
  quizAttempts: number;
  answeredQuestions: number;
  correctAnswers: number;
  currentChapter: string | null;
  currentWordIndex: number;
  currentChapterViewedWords: number;
  totalViewedWords: number;
  lastActivityAt: string | null;
}

const createDefaultStore = (): LearningProgressStore => ({
  version: 1,
  activeDates: [],
  dailyActiveSeconds: {},
  quiz: {
    attempts: 0,
    answered: 0,
    correct: 0,
    lastCompletedAt: null,
  },
  currentChapter: null,
  currentWordIndex: 0,
  chapterProgress: {},
  lastActivityAt: null,
});

function dateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function shiftDate(key: string, days: number): string {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizeStore(value: Partial<LearningProgressStore> | null | undefined): LearningProgressStore {
  const fallback = createDefaultStore();
  if (!value || typeof value !== 'object') return fallback;
  return {
    ...fallback,
    ...value,
    version: 1,
    activeDates: Array.isArray(value.activeDates)
      ? [...new Set(value.activeDates.filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item)))].sort()
      : [],
    dailyActiveSeconds: value.dailyActiveSeconds && typeof value.dailyActiveSeconds === 'object'
      ? value.dailyActiveSeconds
      : {},
    quiz: {
      ...fallback.quiz,
      ...(value.quiz || {}),
    },
    chapterProgress: value.chapterProgress && typeof value.chapterProgress === 'object'
      ? value.chapterProgress
      : {},
  };
}

function readStore(): LearningProgressStore {
  try {
    if (!fs.existsSync(DATA_PATH)) return createDefaultStore();
    return normalizeStore(JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')));
  } catch (error) {
    console.warn('[Learning Progress] 读取失败，将使用空白记录:', error);
    return createDefaultStore();
  }
}

function writeStore(store: LearningProgressStore): void {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  const tempPath = `${DATA_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tempPath, DATA_PATH);
}

function markToday(store: LearningProgressStore): void {
  const today = dateKey();
  if (!store.activeDates.includes(today)) {
    store.activeDates.push(today);
    store.activeDates.sort();
  }
  store.lastActivityAt = new Date().toISOString();
}

function calculateStreak(activeDates: string[]): number {
  const active = new Set(activeDates);
  const today = dateKey();
  let cursor = active.has(today) ? today : shiftDate(today, -1);
  let streak = 0;
  while (active.has(cursor)) {
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }
  return streak;
}

function calculateWeeklySeconds(store: LearningProgressStore): number {
  const today = dateKey();
  const todayDate = new Date(`${today}T12:00:00Z`);
  const dayOfWeek = todayDate.getUTCDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = shiftDate(today, -daysFromMonday);
  return Object.entries(store.dailyActiveSeconds).reduce((total, [day, seconds]) => {
    if (day < monday || day > today) return total;
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    return total + safeSeconds;
  }, 0);
}

function toView(store: LearningProgressStore): LearningProgressView {
  const currentProgress = store.currentChapter ? store.chapterProgress[store.currentChapter] : undefined;
  const viewedIds = new Set<number>();
  Object.values(store.chapterProgress).forEach(progress => {
    (progress.viewedWordIds || []).forEach(id => viewedIds.add(id));
  });
  return {
    streakDays: calculateStreak(store.activeDates),
    weeklySeconds: calculateWeeklySeconds(store),
    masteryPercent: store.quiz.answered > 0
      ? Math.round((store.quiz.correct / store.quiz.answered) * 100)
      : null,
    quizAttempts: store.quiz.attempts,
    answeredQuestions: store.quiz.answered,
    correctAnswers: store.quiz.correct,
    currentChapter: store.currentChapter,
    currentWordIndex: store.currentWordIndex,
    currentChapterViewedWords: currentProgress?.viewedWordIds?.length || 0,
    totalViewedWords: viewedIds.size,
    lastActivityAt: store.lastActivityAt,
  };
}

export function getLearningProgress(): LearningProgressView {
  return toView(readStore());
}

export function recordLearningActivity(seconds = 0): LearningProgressView {
  const store = readStore();
  markToday(store);
  const safeSeconds = Math.min(Math.max(Math.round(Number(seconds) || 0), 0), 60);
  if (safeSeconds > 0) {
    const today = dateKey();
    store.dailyActiveSeconds[today] = (store.dailyActiveSeconds[today] || 0) + safeSeconds;
  }
  writeStore(store);
  return toView(store);
}

export function recordQuizResult(correct: number, answered: number): LearningProgressView {
  const store = readStore();
  markToday(store);
  const safeAnswered = Math.min(Math.max(Math.round(Number(answered) || 0), 0), 100);
  const safeCorrect = Math.min(Math.max(Math.round(Number(correct) || 0), 0), safeAnswered);
  if (safeAnswered > 0) {
    store.quiz.attempts += 1;
    store.quiz.answered += safeAnswered;
    store.quiz.correct += safeCorrect;
    store.quiz.lastCompletedAt = new Date().toISOString();
  }
  writeStore(store);
  return toView(store);
}

export function recordChapterProgress(chapter: string, wordIndex = 0, wordId?: number): LearningProgressView {
  const safeChapter = String(chapter || '').trim().slice(0, 120);
  const store = readStore();
  markToday(store);
  if (safeChapter) {
    const existing = store.chapterProgress[safeChapter] || {
      lastWordIndex: 0,
      viewedWordIds: [],
      visitedAt: new Date().toISOString(),
    };
    existing.lastWordIndex = Math.max(0, Math.round(Number(wordIndex) || 0));
    existing.visitedAt = new Date().toISOString();
    const safeWordId = Math.round(Number(wordId));
    if (Number.isFinite(safeWordId) && safeWordId > 0 && !existing.viewedWordIds.includes(safeWordId)) {
      existing.viewedWordIds.push(safeWordId);
    }
    store.chapterProgress[safeChapter] = existing;
    store.currentChapter = safeChapter;
    store.currentWordIndex = existing.lastWordIndex;
  }
  writeStore(store);
  return toView(store);
}
