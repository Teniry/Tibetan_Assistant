import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from '../api-config';

export interface LearningProgress {
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

const EMPTY_PROGRESS: LearningProgress = {
  streakDays: 0,
  weeklySeconds: 0,
  masteryPercent: null,
  quizAttempts: 0,
  answeredQuestions: 0,
  correctAnswers: 0,
  currentChapter: null,
  currentWordIndex: 0,
  currentChapterViewedWords: 0,
  totalViewedWords: 0,
  lastActivityAt: null,
};

async function readProgressResponse(response: Response): Promise<LearningProgress> {
  if (!response.ok) throw new Error(`学习进度接口返回 ${response.status}`);
  return response.json();
}

export function useLearningProgress() {
  const [progress, setProgress] = useState<LearningProgress>(EMPTY_PROGRESS);
  const [loading, setLoading] = useState(true);
  const lastInteractionRef = useRef(Date.now());

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(apiUrl('/api/learning-progress'));
      setProgress(await readProgressResponse(response));
    } catch (error) {
      console.warn('[Learning Progress] 加载失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const recordActivity = useCallback(async (seconds: number) => {
    try {
      const response = await fetch(apiUrl('/api/learning-progress/activity'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seconds }),
      });
      setProgress(await readProgressResponse(response));
    } catch (error) {
      console.warn('[Learning Progress] 记录学习时长失败:', error);
    }
  }, []);

  const recordQuiz = useCallback(async (correct: number, answered: number) => {
    try {
      const response = await fetch(apiUrl('/api/learning-progress/quiz'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correct, answered }),
      });
      setProgress(await readProgressResponse(response));
    } catch (error) {
      console.warn('[Learning Progress] 记录测验结果失败:', error);
    }
  }, []);

  const recordChapter = useCallback(async (chapter: string, wordIndex: number, wordId?: number) => {
    try {
      const response = await fetch(apiUrl('/api/learning-progress/chapter'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapter, wordIndex, wordId }),
      });
      setProgress(await readProgressResponse(response));
    } catch (error) {
      console.warn('[Learning Progress] 记录章节进度失败:', error);
    }
  }, []);

  useEffect(() => {
    void refresh().then(() => recordActivity(0));

    const markInteraction = () => {
      lastInteractionRef.current = Date.now();
    };
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(event => window.addEventListener(event, markInteraction, { passive: true }));

    // 页面可见且 5 分钟内发生过操作时，每 30 秒累计一次有效学习时长。
    const timer = window.setInterval(() => {
      const isRecentlyActive = Date.now() - lastInteractionRef.current <= 5 * 60 * 1000;
      if (document.visibilityState === 'visible' && isRecentlyActive) {
        void recordActivity(30);
      }
    }, 30_000);

    return () => {
      window.clearInterval(timer);
      events.forEach(event => window.removeEventListener(event, markInteraction));
    };
  }, [recordActivity, refresh]);

  return {
    progress,
    loading,
    refresh,
    recordQuiz,
    recordChapter,
  };
}
