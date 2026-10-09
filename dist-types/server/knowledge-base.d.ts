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
export declare function initKnowledgeBase(): void;
export declare function searchKnowledge(query: string, limit?: number): KnowledgeEntry[];
export declare function searchKnowledgeLiteral(query: string, limit?: number): KnowledgeEntry[];
export declare function decomposeKnowledge(query: string, limit?: number): KnowledgeEntry[];
export declare function formatKnowledgeContext(results: KnowledgeEntry[]): string;
export declare function getKnowledgeStats(): {
    total: number;
    categories: string[];
};
export declare function getChapters(): {
    name: string;
    count: number;
}[];
export declare function getEntriesByChapter(chapter: string, limit?: number): KnowledgeEntry[];
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
export declare function generateQuiz(chapter?: string, count?: number, mode?: string): QuizQuestion[];
