export type AgentConversationRole = 'user' | 'assistant';
export type AgentConversationSource = 'ragflow' | 'local' | 'web' | 'qwen';
export interface AgentConversationSourceItem {
    id: string;
    title: string;
    excerpt?: string;
    similarity?: number;
    chapter?: string;
    kind?: string;
    url?: string;
    domain?: string;
}
export interface AgentConversationMessage {
    id: string;
    role: AgentConversationRole;
    content: string;
    createdAt: number;
    source?: AgentConversationSource;
    evidenceCount?: number;
    model?: string;
    sources?: AgentConversationSourceItem[];
    warning?: string;
    grounded?: boolean;
    modelBased?: boolean;
}
export declare function normalizeConversationClientId(value: unknown): string;
export declare function getAgentConversation(clientId: string, agentType: string): {
    clientId: string;
    agentType: string;
    updatedAt: number;
    messages: AgentConversationMessage[];
};
export declare function appendAgentConversationMessage(clientId: string, agentType: string, message: AgentConversationMessage): AgentConversationMessage;
export declare function importAgentConversation(clientId: string, agentType: string, messages: AgentConversationMessage[]): {
    clientId: string;
    agentType: string;
    updatedAt: number;
    messages: AgentConversationMessage[];
};
export declare function clearAgentConversation(clientId: string, agentType: string): boolean;
