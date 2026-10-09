export interface TrustedWebResult {
    id: string;
    title: string;
    url: string;
    content: string;
    score: number;
    domain: string;
}
export declare function getWebSearchStatus(): {
    configured: boolean;
    enabled: boolean;
    provider: "tavily";
    trustedDomains: string[];
    maxResults: number;
    missing: never[];
};
export declare function searchTrustedWeb(question: string, options?: {
    allowPublicFallback?: boolean;
}): Promise<TrustedWebResult[]>;
export declare function formatWebContext(results: TrustedWebResult[]): string;
export declare function buildWebEvidenceResponse(results: TrustedWebResult[]): string;
