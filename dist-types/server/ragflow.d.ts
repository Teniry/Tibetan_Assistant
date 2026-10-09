export interface RagflowChunk {
    id: string;
    content: string;
    question: string;
    documentId: string;
    documentName: string;
    datasetId: string;
    similarity: number;
    termSimilarity: number;
    vectorSimilarity: number;
}
export interface RagflowRetrievalResult {
    chunks: RagflowChunk[];
    total: number;
}
export declare const RAGFLOW_CONFIG: {
    readonly baseUrl: string;
    readonly apiKey: string;
    readonly datasetIds: string[];
    readonly datasetName: string;
    readonly similarityThreshold: number;
    readonly vectorSimilarityWeight: number;
    readonly pageSize: number;
    readonly topK: number;
    readonly timeoutMs: number;
    readonly fallbackLocal: boolean;
};
export declare function isRagflowConfigured(): boolean;
export declare function getRagflowStatus(): {
    configured: boolean;
    missing: string[];
    datasetCount: number;
    datasetName: string;
    baseUrl: string;
    similarityThreshold: number;
    vectorSimilarityWeight: number;
    pageSize: number;
    fallbackLocal: boolean;
};
export declare function retrieveFromRagflow(question: string): Promise<RagflowRetrievalResult>;
export declare function formatRagflowContext(chunks: RagflowChunk[]): string;
export declare function buildRagflowEvidenceResponse(chunks: RagflowChunk[]): string;
