import { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Select, Slider, Radio, Loading, MessagePlugin } from 'tdesign-react';
import {
  ArrowLeft, Play, CheckCircle2, XCircle, RotateCcw, GraduationCap,
  Shuffle, BookOpen, Clock, ChevronLeft, ChevronRight, Grid3x3, List, Trophy, Zap
} from 'lucide-react';

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

interface QuizPageProps {
  onBack: () => void;
  onQuizComplete?: (correct: number, answered: number) => void;
}

type Phase = 'config' | 'quiz' | 'result';
type ViewMode = 'single' | 'overview'; // 单题模式 / 答题卡模式

export function QuizPage({ onBack, onQuizComplete }: QuizPageProps) {
  const [phase, setPhase] = useState<Phase>('config');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapter, setSelectedChapter] = useState('all');
  const [questionCount, setQuestionCount] = useState(10);
  const [quizMode, setQuizMode] = useState<'random' | 'chapter'>('random');
  const [loadingChapters, setLoadingChapters] = useState(true);
  const [generating, setGenerating] = useState(false);

  // 测验状态
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [answers, setAnswers] = useState<{ questionId: number; selected: number; correct: boolean }[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('single');

  // 计时
  const [elapsedSec, setElapsedSec] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const attemptRecordedRef = useRef(false);

  useEffect(() => {
    fetch('/api/kb-chapters')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          // 只显示 30+ 词的章节，避免选项不足
          const rich = data.filter((c: Chapter) => c.count >= 4);
          setChapters(rich);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingChapters(false));
  }, []);

  // 计时器
  useEffect(() => {
    if (phase === 'quiz') {
      timerRef.current = setInterval(() => setElapsedSec(s => s + 1), 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const startQuiz = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/quiz-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapter: selectedChapter,
          count: questionCount,
          mode: quizMode,
        }),
      });
      const data = await res.json();
      if (data.questions && data.questions.length > 0) {
        setQuestions(data.questions);
        setCurrentIndex(0);
        setSelectedAnswer(null);
        setShowFeedback(false);
        setAnswers([]);
        setElapsedSec(0);
        setViewMode('single');
        attemptRecordedRef.current = false;
        setPhase('quiz');
      } else {
        MessagePlugin.warning('该章节词汇不足，请选择其他章节或减少题目数');
      }
    } catch {
      MessagePlugin.error('生成测验失败');
    } finally {
      setGenerating(false);
    }
  };

  const selectOption = (index: number) => {
    if (showFeedback) return;
    setSelectedAnswer(index);
  };

  const confirmAnswer = () => {
    if (selectedAnswer === null) {
      MessagePlugin.warning('请先选择一个答案');
      return;
    }
    const question = questions[currentIndex];
    const correct = selectedAnswer === question.correctIndex;
    setAnswers(prev => [...prev, { questionId: question.id, selected: selectedAnswer, correct }]);
    setShowFeedback(true);
  };

  const nextQuestion = () => {
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setShowFeedback(false);
      setViewMode('single');
    } else {
      // 最后一题 → 显示结果
      if (!attemptRecordedRef.current && answers.length > 0) {
        attemptRecordedRef.current = true;
        onQuizComplete?.(answers.filter(answer => answer.correct).length, answers.length);
      }
      setPhase('result');
    }
  };

  const prevQuestion = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      // 恢复该题的答题状态
      const prevAnswer = answers[currentIndex - 1];
      if (prevAnswer) {
        setSelectedAnswer(prevAnswer.selected);
        setShowFeedback(true);
      } else {
        setSelectedAnswer(null);
        setShowFeedback(false);
      }
      setViewMode('single');
    }
  };

  const goToQuestion = (idx: number) => {
    if (idx === currentIndex) {
      setViewMode('single');
      return;
    }
    setCurrentIndex(idx);
    const ans = answers[idx];
    if (ans) {
      setSelectedAnswer(ans.selected);
      setShowFeedback(true);
    } else {
      setSelectedAnswer(null);
      setShowFeedback(false);
    }
    setViewMode('single');
  };

  const resetQuiz = () => {
    setPhase('config');
    setQuestions([]);
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setShowFeedback(false);
    setAnswers([]);
    setElapsedSec(0);
    attemptRecordedRef.current = false;
  };

  // 退出答题（带确认）
  const confirmExit = () => {
    const done = answers.length;
    const total = questions.length;
    const msg = done === 0
      ? '确定要退出答题吗？当前进度将丢失。'
      : `确定要退出答题吗？当前已答 ${done}/${total} 题，结果将丢失。`;
    if (window.confirm(msg)) {
      resetQuiz();
    }
  };

  const correctCount = answers.filter(a => a.correct).length;
  const scorePercent = answers.length > 0 ? Math.round((correctCount / answers.length) * 100) : 0;
  const submittedCount = answers.length;

  // ============= 配置页面 =============
  if (phase === 'config') {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--td-component-border)' }}>
          <button onClick={onBack} className="p-1 rounded hover:opacity-70">
            <ArrowLeft size={20} style={{ color: 'var(--td-text-color-secondary)' }} />
          </button>
          <GraduationCap size={22} style={{ color: '#dc2626' }} />
          <h2 className="text-lg font-semibold" style={{ color: 'var(--td-text-color-primary)' }}>随堂测验</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="w-full max-w-2xl mx-auto space-y-6">
            {/* 头部介绍卡片 */}
            <div
              className="rounded-2xl p-8 text-white shadow-xl"
              style={{ background: 'linear-gradient(135deg, #dc2626 0%, #f87171 50%, #fbbf24 100%)' }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                  <GraduationCap size={26} color="white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">木雅语词汇在线考试</h3>
                  <p className="text-sm opacity-90">支持按章节 / 乱序随机抽取，多题型知识卡片</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-white/20">
                <div className="flex items-center gap-2 text-sm">
                  <BookOpen size={14} /> 64 个章节
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Zap size={14} /> 即时判分
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock size={14} /> 自动计时
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Trophy size={14} /> 答题回顾
                </div>
              </div>
            </div>

            {loadingChapters ? (
              <div className="flex justify-center py-12"><Loading size="medium" /></div>
            ) : (
              <>
                {/* 章节选择 */}
                <div>
                  <label className="text-sm font-medium mb-2 flex items-center gap-2" style={{ color: 'var(--td-text-color-primary)' }}>
                    <BookOpen size={14} />
                    选择章节
                  </label>
                  <Select
                    value={selectedChapter}
                    onChange={v => setSelectedChapter(v as string)}
                    style={{ width: '100%' }}
                    placeholder="选择要测验的章节"
                    filterable
                  >
                    <Select.Option key="all" value="all" label={`📚 全部章节（${chapters.reduce((s, c) => s + c.count, 0)} 词）`} />
                    {chapters.map(ch => (
                      <Select.Option key={ch.name} value={ch.name} label={`${ch.name}（${ch.count} 词）`} />
                    ))}
                  </Select>
                </div>

                {/* 题目数量 */}
                <div>
                  <label className="text-sm font-medium mb-2 flex items-center justify-between" style={{ color: 'var(--td-text-color-primary)' }}>
                    <span>题目数量</span>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(220, 38, 38, 0.1)', color: '#dc2626' }}>
                      {questionCount} 题
                    </span>
                  </label>
                  <Slider
                    value={questionCount}
                    onChange={v => setQuestionCount(v as number)}
                    min={5}
                    max={20}
                    step={1}
                    marks={{ 5: '5', 10: '10', 15: '15', 20: '20' }}
                  />
                </div>

                {/* 出题模式 */}
                <div>
                  <label className="text-sm font-medium mb-2 block" style={{ color: 'var(--td-text-color-primary)' }}>
                    出题模式
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setQuizMode('random')}
                      className="p-4 rounded-xl text-left transition-all"
                      style={{
                        border: `2px solid ${quizMode === 'random' ? '#dc2626' : 'var(--td-component-stroke)'}`,
                        backgroundColor: quizMode === 'random' ? 'rgba(220, 38, 38, 0.05)' : 'transparent',
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Shuffle size={16} style={{ color: quizMode === 'random' ? '#dc2626' : 'var(--td-text-color-secondary)' }} />
                        <span className="font-medium" style={{ color: 'var(--td-text-color-primary)' }}>乱序随机</span>
                      </div>
                      <p className="text-xs" style={{ color: 'var(--td-text-color-secondary)' }}>
                        从所选范围随机抽题，每道题都不固定
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuizMode('chapter')}
                      className="p-4 rounded-xl text-left transition-all"
                      style={{
                        border: `2px solid ${quizMode === 'chapter' ? '#dc2626' : 'var(--td-component-stroke)'}`,
                        backgroundColor: quizMode === 'chapter' ? 'rgba(220, 38, 38, 0.05)' : 'transparent',
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <BookOpen size={16} style={{ color: quizMode === 'chapter' ? '#dc2626' : 'var(--td-text-color-secondary)' }} />
                        <span className="font-medium" style={{ color: 'var(--td-text-color-primary)' }}>章节轮转</span>
                      </div>
                      <p className="text-xs" style={{ color: 'var(--td-text-color-secondary)' }}>
                        跨章节均匀抽取，每个章节都有题
                      </p>
                    </button>
                  </div>
                </div>

                <Button
                  block
                  size="large"
                  theme="primary"
                  loading={generating}
                  onClick={startQuiz}
                  icon={<Play size={18} />}
                  style={{ marginTop: 16, height: 52, fontSize: 16, backgroundColor: '#dc2626', borderColor: '#dc2626' }}
                >
                  开始考试
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============= 答题页面 =============
  if (phase === 'quiz') {
    const question = questions[currentIndex];
    const isAnswered = showFeedback;
    const isLast = currentIndex + 1 === questions.length;

    return (
      <div className="flex flex-col flex-1 min-h-0">
        {/* 顶部状态栏 */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b"
          style={{ borderColor: 'var(--td-component-border)', backgroundColor: 'var(--td-bg-color-container)' }}
        >
          <div className="flex items-center gap-3">
            <button onClick={confirmExit} className="p-1.5 rounded hover:opacity-70" title="退出答题">
              <ArrowLeft size={18} style={{ color: 'var(--td-text-color-secondary)' }} />
            </button>
            <GraduationCap size={18} style={{ color: '#dc2626' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--td-text-color-primary)' }}>
              第 {currentIndex + 1} / {questions.length} 题
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed' }}>
              {question.cat}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>
              <Clock size={14} />
              <span style={{ fontFamily: 'monospace' }}>{formatTime(elapsedSec)}</span>
            </div>
            <button
              onClick={() => setViewMode(viewMode === 'single' ? 'overview' : 'single')}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md transition-all"
              style={{
                backgroundColor: viewMode === 'overview' ? 'rgba(220, 38, 38, 0.1)' : 'var(--td-bg-color-component)',
                color: viewMode === 'overview' ? '#dc2626' : 'var(--td-text-color-secondary)',
              }}
              title="答题卡"
            >
              <Grid3x3 size={12} /> 答题卡
            </button>
          </div>
        </div>

        {/* 进度条 */}
        <div className="w-full h-1.5 flex-shrink-0" style={{ backgroundColor: 'var(--td-bg-color-component)' }}>
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${((currentIndex + 1) / questions.length) * 100}%`,
              background: 'linear-gradient(90deg, #dc2626, #f59e0b)',
            }}
          />
        </div>

        {/* 答题卡模式（占满中间区域） */}
        {viewMode === 'overview' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-3xl mx-auto">
              <div className="rounded-2xl p-6 mb-4" style={{ backgroundColor: 'var(--td-bg-color-container)', border: '1px solid var(--td-component-border)' }}>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--td-text-color-primary)' }}>
                  <Grid3x3 size={18} style={{ color: '#dc2626' }} />
                  答题卡（共 {questions.length} 题）
                </h3>
                <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2">
                  {questions.map((q, idx) => {
                    const ans = answers.find(a => a.questionId === q.id);
                    const isCurrent = idx === currentIndex;
                    let bg: string = 'var(--td-bg-color-component)';
                    let fg: string = 'var(--td-text-color-secondary)';
                    let border = 'transparent';
                    if (ans) {
                      bg = ans.correct ? 'rgba(5, 150, 105, 0.1)' : 'rgba(220, 38, 38, 0.1)';
                      fg = ans.correct ? '#059669' : '#dc2626';
                    }
                    if (isCurrent) border = '#dc2626';
                    return (
                      <button
                        key={q.id}
                        onClick={() => goToQuestion(idx)}
                        className="h-10 rounded-lg flex items-center justify-center text-sm font-medium transition-all hover:opacity-80"
                        style={{
                          backgroundColor: bg,
                          color: fg,
                          border: `2px solid ${border}`,
                        }}
                      >
                        {idx + 1}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-4 mt-4 pt-4 text-xs" style={{ color: 'var(--td-text-color-secondary)', borderTop: '1px solid var(--td-component-border)' }}>
                  <span>已答 {answers.length}/{questions.length}</span>
                  <span style={{ color: '#059669' }}>对 {answers.filter(a => a.correct).length}</span>
                  <span style={{ color: '#dc2626' }}>错 {answers.filter(a => !a.correct).length}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 单题模式：上方可滚动区域（题目+选项+反馈），下方固定导航栏 */}
        {viewMode === 'single' && (
          <>
            <div className="flex-1 overflow-y-auto p-6 pb-4">
              <div className="max-w-2xl mx-auto">
                {/* 题目卡片 */}
                <div
                  className="rounded-2xl p-8 mb-6 shadow-sm"
                  style={{ backgroundColor: 'var(--td-bg-color-container)', border: '1px solid var(--td-component-border)' }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <span
                      className="text-xs px-2.5 py-1 rounded-full font-medium"
                      style={{ backgroundColor: 'rgba(220, 38, 38, 0.1)', color: '#dc2626' }}
                    >
                      {String.fromCharCode(65 + currentIndex % 26)} · {question.cat}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>
                      题目 {currentIndex + 1} / {questions.length}
                    </span>
                  </div>
                  <p className="text-xs mb-3" style={{ color: 'var(--td-text-color-placeholder)' }}>
                    请选择下列中文对应的藏文翻译
                  </p>
                  <div className="text-center my-8">
                    <h2 className="text-5xl font-bold mb-3" style={{ color: 'var(--td-text-color-primary)' }}>
                      {question.zh}
                    </h2>
                    {question.en && (
                      <span className="text-sm italic" style={{ color: 'var(--td-text-color-placeholder)' }}>
                        {question.en}
                      </span>
                    )}
                  </div>
                </div>

                {/* 选项 */}
                <div className="space-y-3 mb-4">
                  {question.options.map((opt, idx) => {
                    let bg = 'var(--td-bg-color-container)';
                    let border = 'var(--td-component-border)';
                    let fg = 'var(--td-text-color-primary)';
                    let icon: React.ReactNode = null;
                    let circleBg = 'var(--td-bg-color-component)';
                    let circleFg = 'var(--td-text-color-secondary)';

                    if (isAnswered) {
                      if (idx === question.correctIndex) {
                        bg = 'rgba(5, 150, 105, 0.08)';
                        border = '#059669';
                        fg = '#059669';
                        icon = <CheckCircle2 size={20} color="#059669" />;
                        circleBg = '#059669';
                        circleFg = 'white';
                      } else if (idx === selectedAnswer) {
                        bg = 'rgba(220, 38, 38, 0.08)';
                        border = '#dc2626';
                        fg = '#dc2626';
                        icon = <XCircle size={20} color="#dc2626" />;
                        circleBg = '#dc2626';
                        circleFg = 'white';
                      }
                    } else if (selectedAnswer === idx) {
                      bg = 'rgba(124, 58, 237, 0.08)';
                      border = '#7c3aed';
                      icon = null;
                      circleBg = '#7c3aed';
                      circleFg = 'white';
                    }

                    return (
                      <button
                        key={idx}
                        onClick={() => selectOption(idx)}
                        disabled={isAnswered}
                        className="w-full p-4 rounded-xl text-left transition-all flex items-center gap-3"
                        style={{
                          backgroundColor: bg,
                          border: `2px solid ${border}`,
                          color: fg,
                          cursor: isAnswered ? 'default' : 'pointer',
                        }}
                      >
                        <span
                          className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                          style={{ backgroundColor: circleBg, color: circleFg }}
                        >
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <span
                          className="flex-1 text-xl"
                          style={{ fontFamily: '"Microsoft Himalaya", "Tibetan Machine Uni", sans-serif' }}
                        >
                          {opt}
                        </span>
                        {icon}
                      </button>
                    );
                  })}
                </div>

                {/* 答题反馈（紧凑、内联在选项下方） */}
                {isAnswered && (
                  <div
                    className="p-3 rounded-xl mb-4 text-sm"
                    style={{
                      backgroundColor: selectedAnswer === question.correctIndex
                        ? 'rgba(5, 150, 105, 0.06)'
                        : 'rgba(220, 38, 38, 0.06)',
                      border: `1px solid ${selectedAnswer === question.correctIndex ? '#059669' : '#dc2626'}`,
                    }}
                  >
                    <p className="font-semibold mb-1" style={{ color: selectedAnswer === question.correctIndex ? '#059669' : '#dc2626' }}>
                      {selectedAnswer === question.correctIndex ? '✓ 回答正确' : '✗ 答错了'}
                    </p>
                    <div className="space-y-0.5 text-xs" style={{ color: 'var(--td-text-color-secondary)' }}>
                      <p>
                        <span className="font-medium" style={{ color: '#059669' }}>藏文：</span>
                        <span style={{ fontFamily: '"Microsoft Himalaya", "Tibetan Machine Uni", sans-serif' }}>
                          {question.bo}
                        </span>
                      </p>
                      {question.mu && (
                        <p>
                          <span className="font-medium" style={{ color: '#7c3aed' }}>木雅语：</span>
                          <span>{question.mu}</span>
                        </p>
                      )}
                      {question.ph && <p><span className="font-medium">音标：</span> {question.ph}</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 固定底部导航栏（始终可见，永远不会被遮挡） */}
            <div
              className="flex-shrink-0 px-6 py-3 border-t"
              style={{ borderColor: 'var(--td-component-border)', backgroundColor: 'var(--td-bg-color-container)' }}
            >
              <div className="max-w-2xl mx-auto flex items-center justify-between gap-2">
                <Button
                  onClick={prevQuestion}
                  disabled={currentIndex === 0}
                  icon={<ChevronLeft size={16} />}
                  style={{
                    backgroundColor: 'var(--td-bg-color-component)',
                    color: currentIndex === 0 ? 'var(--td-text-color-placeholder)' : 'var(--td-text-color-primary)',
                  }}
                >
                  上一题
                </Button>

                {!isAnswered ? (
                  <Button
                    onClick={confirmAnswer}
                    theme="primary"
                    disabled={selectedAnswer === null}
                    style={{
                      backgroundColor: selectedAnswer === null ? 'var(--td-bg-color-component)' : '#dc2626',
                      borderColor: selectedAnswer === null ? 'var(--td-bg-color-component)' : '#dc2626',
                      color: selectedAnswer === null ? 'var(--td-text-color-placeholder)' : 'white',
                      flex: 1,
                      maxWidth: 240,
                    }}
                  >
                    {selectedAnswer === null ? '请先选择答案' : '提交答案'}
                  </Button>
                ) : (
                  <Button
                    onClick={nextQuestion}
                    theme="primary"
                    icon={isLast ? <Trophy size={16} /> : <ChevronRight size={16} />}
                    style={{ backgroundColor: '#dc2626', borderColor: '#dc2626', color: 'white', flex: 1, maxWidth: 240 }}
                  >
                    {isLast ? '查看结果' : '下一题'}
                  </Button>
                )}

                <Button
                  onClick={() => setViewMode('overview')}
                  icon={<Grid3x3 size={16} />}
                  style={{ backgroundColor: 'var(--td-bg-color-component)', color: 'var(--td-text-color-primary)' }}
                >
                  答题卡
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ============= 结果页 =============
  const grade =
    scorePercent >= 90 ? { label: '出类拔萃！', emoji: '🏆', color: '#059669' } :
    scorePercent >= 75 ? { label: '表现出色！', emoji: '⭐', color: '#0ea5e9' } :
    scorePercent >= 60 ? { label: '继续加油！', emoji: '📚', color: '#d97706' } :
    { label: '多多练习！', emoji: '✏️', color: '#dc2626' };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--td-component-border)' }}>
        <div className="flex items-center gap-3">
          <button onClick={resetQuiz} className="p-1.5 rounded hover:opacity-70">
            <ArrowLeft size={20} style={{ color: 'var(--td-text-color-secondary)' }} />
          </button>
          <Trophy size={22} style={{ color: '#dc2626' }} />
          <h2 className="text-lg font-semibold" style={{ color: 'var(--td-text-color-primary)' }}>考试成绩</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPhase('config')} className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg transition-all"
            style={{ backgroundColor: 'var(--td-bg-color-component)', color: 'var(--td-text-color-secondary)' }}>
            <List size={14} /> 重新配置
          </button>
          <button
            onClick={() => {
              // 用相同设置再考一次
              setPhase('config');
              setTimeout(() => startQuiz(), 50);
            }}
            className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg transition-all text-white"
            style={{ backgroundColor: '#dc2626' }}
          >
            <RotateCcw size={14} /> 再考一次
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          {/* 成绩总览 */}
          <div
            className="rounded-2xl p-8 mb-6 text-white text-center"
            style={{
              background:
                scorePercent >= 75
                  ? 'linear-gradient(135deg, #059669, #10b981)'
                  : scorePercent >= 60
                    ? 'linear-gradient(135deg, #d97706, #f59e0b)'
                    : 'linear-gradient(135deg, #dc2626, #f87171)',
            }}
          >
            <div className="text-6xl mb-2">{grade.emoji}</div>
            <div className="text-5xl font-bold mb-1">{scorePercent}<span className="text-2xl">分</span></div>
            <div className="text-lg font-semibold mb-3">{grade.label}</div>
            <div className="flex items-center justify-center gap-6 text-sm opacity-90 mt-4">
              <div className="flex items-center gap-1">
                <CheckCircle2 size={16} /> 答对 {correctCount}
              </div>
              <div className="flex items-center gap-1">
                <XCircle size={16} /> 答错 {answers.length - correctCount}
              </div>
              <div className="flex items-center gap-1">
                <Clock size={16} /> 用时 {formatTime(elapsedSec)}
              </div>
            </div>
          </div>

          {/* 答题卡回顾 */}
          <div className="rounded-2xl p-6 mb-6" style={{ backgroundColor: 'var(--td-bg-color-container)', border: '1px solid var(--td-component-border)' }}>
            <h3 className="text-base font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--td-text-color-primary)' }}>
              <Grid3x3 size={16} style={{ color: '#dc2626' }} />
              答题卡
            </h3>
            <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2 mb-4">
              {questions.map((q, idx) => {
                const ans = answers.find(a => a.questionId === q.id);
                const bg = ans ? (ans.correct ? 'rgba(5, 150, 105, 0.15)' : 'rgba(220, 38, 38, 0.15)') : 'var(--td-bg-color-component)';
                const fg = ans ? (ans.correct ? '#059669' : '#dc2626') : 'var(--td-text-color-placeholder)';
                return (
                  <div
                    key={q.id}
                    className="h-10 rounded-lg flex items-center justify-center text-sm font-medium"
                    style={{ backgroundColor: bg, color: fg }}
                  >
                    {idx + 1}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 错题回顾 */}
          {answers.filter(a => !a.correct).length > 0 && (
            <div className="rounded-2xl p-6 mb-6" style={{ backgroundColor: 'var(--td-bg-color-container)', border: '1px solid var(--td-component-border)' }}>
              <h3 className="text-base font-semibold mb-3 flex items-center gap-2" style={{ color: '#dc2626' }}>
                <XCircle size={16} />
                错题回顾（{answers.filter(a => !a.correct).length}）
              </h3>
              <div className="space-y-3">
                {answers.map((ans, idx) => {
                  if (ans.correct) return null;
                  const q = questions[idx];
                  return (
                    <div key={ans.questionId} className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(220, 38, 38, 0.05)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium" style={{ color: 'var(--td-text-color-primary)' }}>
                          {idx + 1}. {q.zh}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--td-bg-color-component)', color: 'var(--td-text-color-placeholder)' }}>
                          {q.cat}
                        </span>
                      </div>
                      <div className="text-sm flex flex-wrap gap-x-3" style={{ color: 'var(--td-text-color-secondary)' }}>
                        <span style={{ color: '#dc2626', textDecoration: 'line-through' }}>
                          你的答案：<span style={{ fontFamily: '"Microsoft Himalaya"' }}>{q.options[ans.selected]}</span>
                        </span>
                        <span style={{ color: '#059669' }}>
                          正确：<span style={{ fontFamily: '"Microsoft Himalaya"' }}>{q.bo}</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
