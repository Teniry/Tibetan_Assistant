import fs from 'fs';
import path from 'path';
import { randomInt, randomUUID } from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = path.join(__dirname, '..', 'data', 'classroom-roll-call.json');

export interface ClassroomStudent {
  id: string;
  name: string;
  studentNo: string;
  group: string;
  createdAt: string;
}

interface RollCallHistoryItem {
  id: string;
  studentId: string;
  name: string;
  round: number;
  selectedAt: string;
}

interface ClassroomStore {
  version: 1;
  students: ClassroomStudent[];
  currentRound: number;
  calledStudentIds: string[];
  history: RollCallHistoryItem[];
}

export interface ClassroomView extends ClassroomStore {
  remainingCount: number;
  calledCount: number;
}

const createDefaultStore = (): ClassroomStore => ({
  version: 1,
  students: [],
  currentRound: 1,
  calledStudentIds: [],
  history: [],
});

function readStore(): ClassroomStore {
  try {
    if (!fs.existsSync(DATA_PATH)) return createDefaultStore();
    const raw = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')) as Partial<ClassroomStore>;
    const fallback = createDefaultStore();
    return {
      ...fallback,
      ...raw,
      version: 1,
      students: Array.isArray(raw.students) ? raw.students : [],
      calledStudentIds: Array.isArray(raw.calledStudentIds) ? raw.calledStudentIds : [],
      history: Array.isArray(raw.history) ? raw.history : [],
      currentRound: Math.max(1, Math.round(Number(raw.currentRound) || 1)),
    };
  } catch (error) {
    console.warn('[Roll Call] 读取课堂名单失败，将使用空白名单:', error);
    return createDefaultStore();
  }
}

function writeStore(store: ClassroomStore): void {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  const tempPath = `${DATA_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tempPath, DATA_PATH);
}

function toView(store: ClassroomStore): ClassroomView {
  const validIds = new Set(store.students.map(student => student.id));
  const calledIds = [...new Set(store.calledStudentIds.filter(id => validIds.has(id)))];
  return {
    ...store,
    calledStudentIds: calledIds,
    calledCount: calledIds.length,
    remainingCount: Math.max(0, store.students.length - calledIds.length),
  };
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

export function getClassroom(): ClassroomView {
  return toView(readStore());
}

export function addStudents(
  input: Array<{ name?: unknown; studentNo?: unknown; group?: unknown }>,
  replace = false,
): ClassroomView & { addedCount: number; skippedCount: number } {
  const store = readStore();
  if (replace) {
    const hadExistingRound = store.students.length > 0 || store.calledStudentIds.length > 0;
    store.students = [];
    store.calledStudentIds = [];
    if (hadExistingRound) store.currentRound += 1;
  }

  const existingKeys = new Set(
    store.students.map(student => student.studentNo
      ? `no:${student.studentNo.toLowerCase()}`
      : `name:${student.name.toLowerCase()}`),
  );
  let addedCount = 0;
  let skippedCount = 0;

  for (const item of input.slice(0, 1000)) {
    const name = cleanText(item?.name, 50);
    const studentNo = cleanText(item?.studentNo, 50);
    const group = cleanText(item?.group, 50);
    if (!name) {
      skippedCount += 1;
      continue;
    }
    const key = studentNo ? `no:${studentNo.toLowerCase()}` : `name:${name.toLowerCase()}`;
    if (existingKeys.has(key)) {
      skippedCount += 1;
      continue;
    }
    existingKeys.add(key);
    store.students.push({
      id: randomUUID(),
      name,
      studentNo,
      group,
      createdAt: new Date().toISOString(),
    });
    addedCount += 1;
  }

  writeStore(store);
  return { ...toView(store), addedCount, skippedCount };
}

export function removeStudent(studentId: string): ClassroomView {
  const store = readStore();
  store.students = store.students.filter(student => student.id !== studentId);
  store.calledStudentIds = store.calledStudentIds.filter(id => id !== studentId);
  writeStore(store);
  return toView(store);
}

export function clearStudents(): ClassroomView {
  const store = readStore();
  store.students = [];
  store.calledStudentIds = [];
  store.currentRound += 1;
  writeStore(store);
  return toView(store);
}

export function drawRandomStudent(): ClassroomView & {
  selected: ClassroomStudent | null;
  roundComplete: boolean;
} {
  const store = readStore();
  const called = new Set(store.calledStudentIds);
  const available = store.students.filter(student => !called.has(student.id));
  if (available.length === 0) {
    return { ...toView(store), selected: null, roundComplete: store.students.length > 0 };
  }

  const selected = available[randomInt(available.length)];
  store.calledStudentIds.push(selected.id);
  store.history.unshift({
    id: randomUUID(),
    studentId: selected.id,
    name: selected.name,
    round: store.currentRound,
    selectedAt: new Date().toISOString(),
  });
  store.history = store.history.slice(0, 500);
  writeStore(store);
  return {
    ...toView(store),
    selected,
    roundComplete: store.calledStudentIds.length === store.students.length,
  };
}

export function resetRound(): ClassroomView {
  const store = readStore();
  store.currentRound += 1;
  store.calledStudentIds = [];
  writeStore(store);
  return toView(store);
}

export function clearHistory(): ClassroomView {
  const store = readStore();
  store.history = [];
  writeStore(store);
  return toView(store);
}
