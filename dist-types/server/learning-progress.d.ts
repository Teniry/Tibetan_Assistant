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
export declare function getLearningProgress(): LearningProgressView;
export declare function recordLearningActivity(seconds?: number): LearningProgressView;
export declare function recordQuizResult(correct: number, answered: number): LearningProgressView;
export declare function recordChapterProgress(chapter: string, wordIndex?: number, wordId?: number): LearningProgressView;
