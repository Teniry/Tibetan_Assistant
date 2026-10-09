import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, Loader2, RotateCcw, Trophy, XCircle } from 'lucide-react';
import type { PortalPoint } from '../types';

interface Chapter {
  name: string;
  count: number;
}

interface QuizQuestion {
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

interface Answer {
  selected: number;
  correct: boolean;
}

interface Props {
  point: PortalPoint;
}

type Phase = 'setup' | 'quiz' | 'result';

export default function KnowledgeQuiz({ point }: Props) {
  const accent = point.chatAccentColor || '#9A6D36';
  const textColor = point.chatTextColor || '#2F2924';
  const mutedColor = point.chatMutedTextColor || '#82776D';
  const configuredCount = Math.min(20, Math.max(2, point.quizQuestionCount || 5));
  const [phase, setPhase] = useState<Phase>('setup');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapter, setChapter] = useState('all');
  const [count, setCount] = useState(configuredCount);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/kb-chapters')
      .then((response) => {
        if (!response.ok) throw new Error('章节读取失败');
        return response.json();
      })
      .then((data) => setChapters(Array.isArray(data) ? data.filter((item: Chapter) => item.count >= 4) : []))
      .catch(() => setChapters([]));
  }, []);

  useEffect(() => setCount(configuredCount), [configuredCount]);

  const correctCount = answers.filter((answer) => answer.correct).length;
  const wrongQuestions = useMemo(
    () => questions.filter((_, index) => answers[index] && !answers[index].correct),
    [questions, answers],
  );
  const weakChapters = useMemo(() => {
    const counts = new Map<string, number>();
    wrongQuestions.forEach((question) => counts.set(question.cat || '未分类', (counts.get(question.cat || '未分类') || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [wrongQuestions]);

  const startQuiz = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/quiz-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapter, count, mode: chapter === 'all' ? 'random' : 'chapter' }),
      });
      if (!response.ok) throw new Error(`抽题失败（${response.status}）`);
      const data = await response.json();
      if (!Array.isArray(data.questions) || data.questions.length === 0) throw new Error('该范围暂时没有足够题目');
      setQuestions(data.questions);
      setAnswers([]);
      setCurrentIndex(0);
      setSelected(null);
      setSubmitted(false);
      setPhase('quiz');
    } catch (requestError: any) {
      setError(requestError?.message || '知识库抽题失败');
    } finally {
      setLoading(false);
    }
  };

  const submitAnswer = () => {
    if (selected === null || submitted) return;
    const correct = selected === questions[currentIndex].correctIndex;
    setAnswers((current) => [...current, { selected, correct }]);
    setSubmitted(true);
  };

  const nextQuestion = () => {
    if (currentIndex >= questions.length - 1) {
      setPhase('result');
      void fetch('/api/learning-progress/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correct: correctCount, answered: answers.length }),
      }).catch(() => undefined);
      return;
    }
    setCurrentIndex((index) => index + 1);
    setSelected(null);
    setSubmitted(false);
  };

  const reset = () => {
    setPhase('setup');
    setQuestions([]);
    setAnswers([]);
    setCurrentIndex(0);
    setSelected(null);
    setSubmitted(false);
    setError('');
  };

  if (phase === 'setup') {
    return <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-5">
      <div className="w-full max-w-xl rounded-2xl p-5" style={{ background: 'rgba(255,253,248,.92)', border: '1px solid rgba(91,75,60,.16)', boxShadow: '0 16px 42px rgba(70,53,38,.10)' }}>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ color: accent, background: `${accent}20`, border: `1px solid ${accent}66` }}><Trophy size={22} /></div>
          <div><h3 className="text-base font-semibold" style={{ color: textColor }}>知识库在线测评</h3><p className="mt-0.5 text-xs" style={{ color: mutedColor }}>选择答案后立即判分，结束后查看错题与薄弱章节。</p></div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs" style={{ color: mutedColor }}>题目范围
            <select value={chapter} onChange={(event) => setChapter(event.target.value)} className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ color: textColor, background: '#FFFFFF', border: `1px solid ${accent}55` }}>
              <option value="all">全部章节（随机）</option>
              {chapters.map((item) => <option key={item.name} value={item.name}>{item.name}（{item.count}）</option>)}
            </select>
          </label>
          <label className="text-xs" style={{ color: mutedColor }}>题目数量
            <select value={count} onChange={(event) => setCount(Number(event.target.value))} className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ color: textColor, background: '#FFFFFF', border: `1px solid ${accent}55` }}>
              {[5, 10, 15, 20].map((value) => <option key={value} value={value}>{value} 题</option>)}
            </select>
          </label>
        </div>
        {error && <div className="mt-4 rounded-lg px-3 py-2 text-xs" style={{ color: '#A2473F', background: 'rgba(162,71,63,.10)', border: '1px solid rgba(162,71,63,.20)' }}>{error}</div>}
        <button type="button" onClick={() => void startQuiz()} disabled={loading} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-50" style={{ background: accent }}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Trophy size={16} />}{loading ? '正在从知识库抽题…' : '开始答题'}
        </button>
      </div>
    </div>;
  }

  if (phase === 'result') {
    const percent = questions.length ? Math.round((correctCount / questions.length) * 100) : 0;
    return <div className="min-h-0 flex-1 overflow-y-auto p-5">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl p-5 text-center" style={{ background: 'rgba(255,253,248,.92)', border: `1px solid ${accent}66`, boxShadow: '0 12px 34px rgba(70,53,38,.08)' }}>
          <Trophy size={34} className="mx-auto" style={{ color: accent }} />
          <div className="mt-2 text-3xl font-bold" style={{ color: textColor }}>{correctCount} / {questions.length}</div>
          <div className="mt-1 text-sm" style={{ color: mutedColor }}>正确率 {percent}%</div>
        </div>
        <div className="mt-4 rounded-2xl p-4" style={{ background: 'rgba(255,253,248,.88)', border: '1px solid rgba(91,75,60,.14)' }}>
          <h4 className="text-sm font-semibold" style={{ color: textColor }}>结果分析</h4>
          {wrongQuestions.length === 0 ? <p className="mt-2 text-sm" style={{ color: '#3F7853' }}>本次全部答对，可以更换章节继续练习。</p> : <>
            <p className="mt-2 text-xs" style={{ color: mutedColor }}>薄弱章节：{weakChapters.map(([name, value]) => `${name}（错${value}题）`).join('、')}</p>
            <div className="mt-3 space-y-2">{wrongQuestions.map((question) => <div key={question.id} className="rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(248,113,113,0.25)' }}>
              <div className="font-medium" style={{ color: '#A2473F' }}>{question.zh} · {question.cat}</div>
              <div className="mt-1" style={{ color: mutedColor }}>正确答案：{question.bo}{question.mu ? ` ｜ 木雅语：${question.mu}` : ''}{question.ph ? ` ｜ 音标：${question.ph}` : ''}{question.en ? ` ｜ 英文：${question.en}` : ''}</div>
            </div>)}</div>
            <p className="mt-3 text-xs" style={{ color: '#8C6535' }}>建议先复习错题所属章节，再按相同范围重新抽题。</p>
          </>}
        </div>
        <button type="button" onClick={reset} className="mx-auto mt-4 flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white" style={{ background: accent }}><RotateCcw size={15} />重新抽题</button>
      </div>
    </div>;
  }

  const question = questions[currentIndex];
  return <div className="min-h-0 flex-1 overflow-y-auto p-5">
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 flex items-center justify-between text-xs" style={{ color: mutedColor }}><span>{question.cat || '知识库题目'}</span><span>{currentIndex + 1} / {questions.length}</span></div>
      <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(91,75,60,.12)' }}><div className="h-full rounded-full transition-all" style={{ width: `${((currentIndex + 1) / questions.length) * 100}%`, background: accent }} /></div>
      <div className="mt-4 rounded-2xl p-5" style={{ background: 'rgba(255,253,248,.92)', border: '1px solid rgba(91,75,60,.15)', boxShadow: '0 12px 34px rgba(70,53,38,.08)' }}>
        <p className="text-xs" style={{ color: mutedColor }}>请选择下列中文对应的藏文</p>
        <h3 className="my-5 text-center text-3xl font-bold" style={{ color: textColor }}>{question.zh}</h3>
        <div className="space-y-2.5">{question.options.map((option, index) => {
          const isCorrect = submitted && index === question.correctIndex;
          const isWrong = submitted && index === selected && index !== question.correctIndex;
          const isSelected = !submitted && index === selected;
          return <button key={`${question.id}-${index}`} type="button" disabled={submitted} onClick={() => setSelected(index)} className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-colors" style={{ color: isCorrect ? '#2E6B44' : isWrong ? '#A2473F' : textColor, background: isCorrect ? 'rgba(52,130,79,.11)' : isWrong ? 'rgba(162,71,63,.10)' : isSelected ? `${accent}18` : 'rgba(255,255,255,.82)', border: `1px solid ${isCorrect ? '#4C9566' : isWrong ? '#C8685E' : isSelected ? accent : 'rgba(91,75,60,.16)'}` }}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold" style={{ color: isCorrect || isWrong || isSelected ? '#FFFFFF' : textColor, background: isCorrect ? '#4C9566' : isWrong ? '#C8685E' : isSelected ? accent : 'rgba(91,75,60,.10)' }}>{String.fromCharCode(65 + index)}</span>
            <span className="flex-1 text-lg">{option}</span>{isCorrect && <CheckCircle2 size={18} />}{isWrong && <XCircle size={18} />}
          </button>;
        })}</div>
        {submitted && <div className="mt-4 rounded-xl p-3 text-xs" style={{ color: selected === question.correctIndex ? '#2E6B44' : '#A2473F', background: selected === question.correctIndex ? 'rgba(52,130,79,.09)' : 'rgba(162,71,63,.09)', border: `1px solid ${selected === question.correctIndex ? 'rgba(52,130,79,.22)' : 'rgba(162,71,63,.22)'}` }}>
          <div className="font-semibold">{selected === question.correctIndex ? '回答正确' : '回答错误'}</div>
          <div className="mt-1" style={{ color: mutedColor }}>中文：{question.zh} ｜ 藏文：{question.bo}{question.mu ? ` ｜ 木雅语：${question.mu}` : ''}{question.ph ? ` ｜ 音标：${question.ph}` : ''}{question.en ? ` ｜ 英文：${question.en}` : ''}</div>
        </div>}
      </div>
      {!submitted ? <button type="button" onClick={submitAnswer} disabled={selected === null} className="mt-4 w-full rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-35" style={{ background: accent }}>提交答案</button>
        : <button type="button" onClick={nextQuestion} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white" style={{ background: accent }}>{currentIndex === questions.length - 1 ? '查看结果分析' : '下一题'}<ChevronRight size={16} /></button>}
    </div>
  </div>;
}
