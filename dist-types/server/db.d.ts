declare const dbFilePath: string;
export interface DbSession {
    id: string;
    title: string;
    model: string;
    sdk_session_id: string | null;
    created_at: string;
    updated_at: string;
}
export interface DbMessage {
    id: string;
    session_id: string;
    role: 'user' | 'assistant';
    content: string;
    model: string | null;
    created_at: string;
    tool_calls: string | null;
}
export declare function getAllSessions(): DbSession[];
export declare function getSession(id: string): DbSession | undefined;
export declare function createSession(session: DbSession): DbSession;
export declare function updateSession(id: string, updates: Partial<Pick<DbSession, 'title' | 'model' | 'sdk_session_id'>>): boolean;
export declare function deleteSession(id: string): boolean;
export declare function getMessagesBySession(sessionId: string): DbMessage[];
export declare function createMessage(message: DbMessage): DbMessage;
export declare function updateMessage(id: string, updates: Partial<Pick<DbMessage, 'content' | 'tool_calls'>>): boolean;
export declare function deleteMessage(id: string): boolean;
export declare function createMessages(messages: DbMessage[]): void;
export declare function clearAllData(): void;
export default dbFilePath;
