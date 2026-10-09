export interface UserKBItem {
    id: string;
    name: string;
    source_filename: string;
    created_at: string;
    entry_count: number;
    chapters: string[];
}
export interface KBEntry {
    id: number;
    zh: string | null;
    bo: string | null;
    mu: string | null;
    ph: string | null;
    en: string | null;
    cat: string | null;
    question: string | null;
    answer: string | null;
}
export declare function initUserKbTables(): void;
export declare function listUserKb(): UserKBItem[];
export declare function importFile(fileData: Buffer, filename: string): {
    success: true;
    kb_id: string;
    name: string;
    entry_count: number;
    chapters: string[];
} | {
    success: false;
    error: string;
};
export declare function getEntries(kbId: string, limit?: number, offset?: number, chapter?: string): KBEntry[];
export declare function deleteUserKb(kbId: string): {
    success: boolean;
    deleted?: boolean;
    error?: string;
};
