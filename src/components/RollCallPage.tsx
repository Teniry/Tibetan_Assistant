import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessagePlugin } from 'tdesign-react';
import { readSheet } from 'read-excel-file/browser';
import {
  ArrowLeft,
  Check,
  ClipboardList,
  Dices,
  Download,
  FileSpreadsheet,
  History,
  LoaderCircle,
  RefreshCcw,
  RotateCcw,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  UsersRound,
} from 'lucide-react';
import { apiUrl } from '../api-config';

interface RollCallPageProps {
  onBack: () => void;
}

interface StudentInput {
  name: string;
  studentNo: string;
  group: string;
}

interface ClassroomStudent extends StudentInput {
  id: string;
  createdAt: string;
}

interface RollCallHistoryItem {
  id: string;
  studentId: string;
  name: string;
  round: number;
  selectedAt: string;
}

interface ClassroomView {
  version: 1;
  students: ClassroomStudent[];
  currentRound: number;
  calledStudentIds: string[];
  history: RollCallHistoryItem[];
  remainingCount: number;
  calledCount: number;
}

interface DrawResponse extends ClassroomView {
  selected: ClassroomStudent | null;
  roundComplete: boolean;
}

const EMPTY_CLASSROOM: ClassroomView = {
  version: 1,
  students: [],
  currentRound: 1,
  calledStudentIds: [],
  history: [],
  remainingCount: 0,
  calledCount: 0,
};

const HEADER_NAMES = new Set(['姓名', '学生姓名', '名字', 'name', 'studentname']);
const HEADER_NUMBERS = new Set(['学号', '编号', '学生编号', 'studentno', 'studentnumber', 'id']);
const HEADER_GROUPS = new Set(['分组', '小组', '组别', '班级', 'group', 'class']);

function cleanCell(value: unknown): string {
  if (value instanceof Date) return value.toLocaleDateString('zh-CN');
  return String(value ?? '').trim();
}

function normalizeHeader(value: unknown): string {
  return cleanCell(value).toLowerCase().replace(/[\s_-]/g, '');
}

function parseDelimitedLine(line: string): string[] {
  const delimiter = line.includes('\t') ? '\t' : line.includes('，') && !line.includes(',') ? '，' : ',';
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseTextRows(text: string): unknown[][] {
  return text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(parseDelimitedLine);
}

function parseStudentRows(rows: unknown[][]): StudentInput[] {
  const cleanedRows = rows
    .map(row => row.map(cleanCell))
    .filter(row => row.some(Boolean));
  if (cleanedRows.length === 0) return [];

  const firstRow = cleanedRows[0].map(normalizeHeader);
  const nameColumn = firstRow.findIndex(cell => HEADER_NAMES.has(cell));
  const numberColumn = firstRow.findIndex(cell => HEADER_NUMBERS.has(cell));
  const groupColumn = firstRow.findIndex(cell => HEADER_GROUPS.has(cell));
  const hasHeader = nameColumn >= 0 || numberColumn >= 0 || groupColumn >= 0;
  const dataRows = hasHeader ? cleanedRows.slice(1) : cleanedRows;

  return dataRows
    .map((row): StudentInput => {
      if (hasHeader) {
        return {
          name: nameColumn >= 0 ? cleanCell(row[nameColumn]) : '',
          studentNo: numberColumn >= 0 ? cleanCell(row[numberColumn]) : '',
          group: groupColumn >= 0 ? cleanCell(row[groupColumn]) : '',
        };
      }
      if (row.length === 1) {
        return { name: cleanCell(row[0]), studentNo: '', group: '' };
      }
      const first = cleanCell(row[0]);
      const second = cleanCell(row[1]);
      const firstLooksLikeNumber = /\d/.test(first) && /^[\w-]+$/.test(first);
      return firstLooksLikeNumber
        ? { studentNo: first, name: second, group: cleanCell(row[2]) }
        : { name: first, studentNo: second, group: cleanCell(row[2]) };
    })
    .filter(student => student.name);
}

async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `请求失败（${response.status}）`);
  }
  return data as T;
}

function formatHistoryTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function RollCallPage({ onBack }: RollCallPageProps) {
  const [classroom, setClassroom] = useState<ClassroomView>(EMPTY_CLASSROOM);
  const [manualInput, setManualInput] = useState('');
  const [replaceOnImport, setReplaceOnImport] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<ClassroomStudent | null>(null);
  const [previewName, setPreviewName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const calledIds = useMemo(() => new Set(classroom.calledStudentIds), [classroom.calledStudentIds]);

  const loadClassroom = useCallback(async () => {
    try {
      const response = await fetch(apiUrl('/api/classroom/roll-call'));
      setClassroom(await readResponse<ClassroomView>(response));
    } catch (error: any) {
      MessagePlugin.error(error?.message || '加载课堂名单失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClassroom();
  }, [loadClassroom]);

  const importStudents = async (students: StudentInput[], source: string) => {
    if (students.length === 0) {
      MessagePlugin.warning('没有识别到有效姓名，请检查名单格式');
      return;
    }
    if (students.length > 1000) {
      MessagePlugin.warning('一次最多导入 1000 名学生');
      students = students.slice(0, 1000);
    }
    setSaving(true);
    try {
      const response = await fetch(apiUrl('/api/classroom/roll-call/students'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students, replace: replaceOnImport }),
      });
      const data = await readResponse<ClassroomView & { addedCount: number; skippedCount: number }>(response);
      setClassroom(data);
      setSelectedStudent(null);
      setPreviewName('');
      if (source === '手动录入') setManualInput('');
      MessagePlugin.success(
        `${source}完成：新增 ${data.addedCount} 人${data.skippedCount ? `，跳过 ${data.skippedCount} 条重复或空数据` : ''}`,
      );
    } catch (error: any) {
      MessagePlugin.error(error?.message || '导入学生名单失败');
    } finally {
      setSaving(false);
    }
  };

  const handleManualImport = () => {
    importStudents(parseStudentRows(parseTextRows(manualInput)), '手动录入');
  };

  const handleFileImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.csv') && !lowerName.endsWith('.txt') && !lowerName.endsWith('.xlsx')) {
      MessagePlugin.error('仅支持 CSV、TXT 或 XLSX 名单文件');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      MessagePlugin.error('名单文件不能超过 5MB');
      return;
    }

    setSaving(true);
    try {
      const rows = lowerName.endsWith('.xlsx')
        ? await readSheet(file)
        : parseTextRows(await file.text());
      await importStudents(parseStudentRows(rows as unknown[][]), file.name);
    } catch (error: any) {
      MessagePlugin.error(`读取名单失败：${error?.message || '文件格式不正确'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDraw = async () => {
    if (drawing || classroom.students.length === 0) return;
    if (classroom.remainingCount === 0) {
      MessagePlugin.info('本轮已全部点完，请先开始下一轮');
      return;
    }

    setDrawing(true);
    setSelectedStudent(null);
    const candidates = classroom.students.filter(student => !calledIds.has(student.id));
    let previewIndex = 0;
    const interval = window.setInterval(() => {
      if (candidates.length > 0) {
        previewIndex = (previewIndex + 1) % candidates.length;
        setPreviewName(candidates[previewIndex].name);
      }
    }, 80);

    try {
      const responsePromise = fetch(apiUrl('/api/classroom/roll-call/draw'), { method: 'POST' })
        .then(response => readResponse<DrawResponse>(response));
      const [data] = await Promise.all([
        responsePromise,
        new Promise(resolve => window.setTimeout(resolve, 900)),
      ]);
      window.clearInterval(interval);
      setClassroom(data);
      setSelectedStudent(data.selected);
      setPreviewName(data.selected?.name || '本轮已完成');
      if (data.selected) {
        MessagePlugin.success(`已抽中：${data.selected.name}`);
      }
    } catch (error: any) {
      window.clearInterval(interval);
      setPreviewName('');
      MessagePlugin.error(error?.message || '随机点名失败');
    } finally {
      setDrawing(false);
    }
  };

  const resetRound = async () => {
    if (!window.confirm(`确定结束第 ${classroom.currentRound} 轮，并让全班重新进入抽取池吗？`)) return;
    try {
      const response = await fetch(apiUrl('/api/classroom/roll-call/reset-round'), { method: 'POST' });
      setClassroom(await readResponse<ClassroomView>(response));
      setSelectedStudent(null);
      setPreviewName('');
      MessagePlugin.success('已开始新一轮点名');
    } catch (error: any) {
      MessagePlugin.error(error?.message || '开始下一轮失败');
    }
  };

  const deleteStudent = async (student: ClassroomStudent) => {
    if (!window.confirm(`确定从名单中删除“${student.name}”吗？`)) return;
    try {
      const response = await fetch(apiUrl(`/api/classroom/roll-call/students/${encodeURIComponent(student.id)}`), {
        method: 'DELETE',
      });
      setClassroom(await readResponse<ClassroomView>(response));
      if (selectedStudent?.id === student.id) setSelectedStudent(null);
    } catch (error: any) {
      MessagePlugin.error(error?.message || '删除学生失败');
    }
  };

  const clearStudents = async () => {
    if (!window.confirm('确定清空全部学生名单吗？历史点名记录会保留。')) return;
    try {
      const response = await fetch(apiUrl('/api/classroom/roll-call/students'), { method: 'DELETE' });
      setClassroom(await readResponse<ClassroomView>(response));
      setSelectedStudent(null);
      setPreviewName('');
      MessagePlugin.success('名单已清空');
    } catch (error: any) {
      MessagePlugin.error(error?.message || '清空名单失败');
    }
  };

  const clearHistory = async () => {
    if (!window.confirm('确定清空全部点名历史吗？')) return;
    try {
      const response = await fetch(apiUrl('/api/classroom/roll-call/history'), { method: 'DELETE' });
      setClassroom(await readResponse<ClassroomView>(response));
      MessagePlugin.success('点名历史已清空');
    } catch (error: any) {
      MessagePlugin.error(error?.message || '清空历史失败');
    }
  };

  const downloadTemplate = () => {
    const csv = '\uFEFF姓名,学号,分组\n学生甲,2026001,第一组\n学生乙,2026002,第一组\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = '课堂点名名单模板.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const resultName = previewName || selectedStudent?.name || '等待抽取';
  const roundComplete = classroom.students.length > 0 && classroom.remainingCount === 0;

  return (
    <div className="roll-call-page flex flex-col flex-1 min-h-0">
      <div className="roll-call-toolbar">
        <button className="roll-call-back" onClick={onBack} aria-label="返回学习首页"><ArrowLeft size={19} /></button>
        <div className="roll-call-title">
          <span><Dices size={21} /></span>
          <div>
            <h1>课堂随机点名</h1>
            <p>教师教学助手 · 名单与点名记录自动保存</p>
          </div>
        </div>
        <div className="round-pill">第 {classroom.currentRound} 轮</div>
      </div>

      <div className="roll-call-scroll">
        <div className="roll-call-layout">
          <section className="roll-call-stage">
            <div className="roll-call-stage-copy">
              <span className="stage-eyebrow"><UserCheck size={14} /> 本轮不重复抽取</span>
              <h2>{drawing ? '正在随机选择…' : roundComplete ? '本轮点名已完成' : '准备好了吗？'}</h2>
              <p>{roundComplete ? '全班本轮均已点到，可开始下一轮。' : `名单中还有 ${classroom.remainingCount} 人等待点名。`}</p>
            </div>

            <div className={`roll-call-result ${drawing ? 'is-drawing' : ''} ${selectedStudent ? 'has-result' : ''}`}>
              <div className="result-orbit"><Dices size={27} /></div>
              <span>本次抽取</span>
              <strong>{resultName}</strong>
              {selectedStudent && (
                <small>
                  {[selectedStudent.studentNo, selectedStudent.group].filter(Boolean).join(' · ') || '请回答老师的问题'}
                </small>
              )}
            </div>

            <div className="roll-call-actions">
              <button
                className="draw-button"
                onClick={handleDraw}
                disabled={drawing || classroom.students.length === 0 || roundComplete}
              >
                {drawing ? <LoaderCircle className="spin" size={19} /> : <Dices size={19} />}
                {drawing ? '正在抽取' : roundComplete ? '本轮已完成' : '开始随机点名'}
              </button>
              <button className="new-round-button" onClick={resetRound} disabled={drawing || classroom.students.length === 0}>
                <RefreshCcw size={17} /> 开始下一轮
              </button>
            </div>

            <div className="roll-call-stats">
              <div><UsersRound size={17} /><strong>{classroom.students.length}</strong><span>名单人数</span></div>
              <div><Check size={17} /><strong>{classroom.calledCount}</strong><span>本轮已点</span></div>
              <div><RotateCcw size={17} /><strong>{classroom.remainingCount}</strong><span>本轮待点</span></div>
            </div>
          </section>

          <section className="roster-import-card">
            <div className="roll-call-section-heading">
              <div><span>01</span><div><h2>录入课堂名单</h2><p>支持姓名逐行粘贴或批量文件导入</p></div></div>
              <button onClick={downloadTemplate}><Download size={15} /> 下载模板</button>
            </div>

            <textarea
              value={manualInput}
              onChange={event => setManualInput(event.target.value)}
              placeholder={'每行一个姓名，例如：\n学生甲\n学生乙\n\n也可填写：学号,姓名,分组'}
              aria-label="手动录入学生名单"
            />

            <div className="import-mode-row">
              <label>
                <input
                  type="checkbox"
                  checked={replaceOnImport}
                  onChange={event => setReplaceOnImport(event.target.checked)}
                />
                <span>{replaceOnImport ? '导入时替换原名单' : '导入时追加到原名单'}</span>
              </label>
              <small>重复学号或姓名会自动跳过</small>
            </div>

            <div className="import-actions">
              <button className="manual-import-button" onClick={handleManualImport} disabled={saving || !manualInput.trim()}>
                <UserPlus size={17} /> 添加到名单
              </button>
              <button className="file-import-button" onClick={() => fileInputRef.current?.click()} disabled={saving}>
                {saving ? <LoaderCircle className="spin" size={17} /> : <FileSpreadsheet size={17} />}
                导入 CSV / TXT / XLSX
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFileImport}
                hidden
              />
            </div>

            <div className="format-tip"><Upload size={15} /> 文件首行可使用“姓名、学号、分组”，仅“姓名”一列也可以。</div>
          </section>

          <section className="roster-list-card">
            <div className="roll-call-section-heading">
              <div><span>02</span><div><h2>当前名单</h2><p>{classroom.students.length} 人 · 绿色标记表示本轮已点</p></div></div>
              {classroom.students.length > 0 && <button className="danger-text-button" onClick={clearStudents}><Trash2 size={14} /> 清空名单</button>}
            </div>

            {loading ? (
              <div className="roll-call-empty"><LoaderCircle className="spin" size={24} /><p>正在加载名单</p></div>
            ) : classroom.students.length === 0 ? (
              <div className="roll-call-empty"><ClipboardList size={30} /><h3>还没有课堂名单</h3><p>在上方手动输入姓名，或导入表格开始点名。</p></div>
            ) : (
              <div className="roster-table-wrap">
                <table className="roster-table">
                  <thead><tr><th>序号</th><th>姓名</th><th>学号</th><th>分组</th><th>本轮状态</th><th /></tr></thead>
                  <tbody>
                    {classroom.students.map((student, index) => {
                      const called = calledIds.has(student.id);
                      return (
                        <tr key={student.id} className={called ? 'is-called' : ''}>
                          <td>{String(index + 1).padStart(2, '0')}</td>
                          <td><strong>{student.name}</strong></td>
                          <td>{student.studentNo || '—'}</td>
                          <td>{student.group || '—'}</td>
                          <td><span className={`student-status ${called ? 'is-called' : ''}`}>{called ? <><Check size={12} /> 已点</> : '待点'}</span></td>
                          <td><button onClick={() => deleteStudent(student)} aria-label={`删除${student.name}`}><Trash2 size={14} /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <aside className="roll-call-history-card">
            <div className="roll-call-section-heading compact">
              <div><History size={18} /><div><h2>点名记录</h2><p>最近 {Math.min(classroom.history.length, 50)} 条</p></div></div>
              {classroom.history.length > 0 && <button className="icon-clear-button" onClick={clearHistory} aria-label="清空点名记录"><Trash2 size={14} /></button>}
            </div>
            {classroom.history.length === 0 ? (
              <div className="history-empty"><Dices size={23} /><p>抽取后会自动记录</p></div>
            ) : (
              <div className="history-list">
                {classroom.history.slice(0, 50).map((item, index) => (
                  <div key={item.id} className="history-row">
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <div><strong>{item.name}</strong><small>第 {item.round} 轮 · {formatHistoryTime(item.selectedAt)}</small></div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
