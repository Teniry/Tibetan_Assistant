import { useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { apiUrl } from '../api-config';
import { Message, ToolCall, PermissionRequest, PermissionMode, Session, CustomAgent, ContentBlock } from '../types';

const STORAGE_KEYS = {
  draftInput: 'draftInput',
};

interface UseChatOptions {
  currentSession: Session | undefined;
  currentSessionId: string | null;
  selectedModel: string;
  getAgent: (id: string) => CustomAgent | undefined;
  addSession: (session: Session) => void;
  updateSession: (sessionId: string, updates: Partial<Session>) => void;
  updateSessionMessages: (sessionId: string, updater: (messages: Message[]) => Message[]) => void;
  updateSessionModel: (sessionId: string, modelId: string) => void;
  setCurrentSessionId: (id: string | null) => void;
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
}

interface NewChatOptions {
  agentId: string;
  cwd: string;
  permissionMode: PermissionMode;
}

export function useChat(options: UseChatOptions) {
  const {
    currentSession,
    currentSessionId,
    selectedModel,
    getAgent,
    updateSessionModel,
    setCurrentSessionId,
    setSessions,
  } = options;

  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const stoppedRef = useRef(false);
  const [inputValue, setInputValue] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.draftInput) || '';
  });
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null);

  // 保存输入框内容到 localStorage（防抖）
  const saveInput = useCallback((value: string) => {
    setInputValue(value);
  }, []);

  // 发送消息
  const sendMessage = useCallback(async (
    messageContent: string,
    newChatOptions?: NewChatOptions,
    onNavigate?: (path: string) => void
  ) => {
    if (!messageContent.trim() || isLoading) return;

    // 重置停止标记
    stoppedRef.current = false;

    let sessionId = currentSessionId;
    let currentCwd = currentSession?.cwd;
    let currentAgentId = currentSession?.agentId || 'default';
    let currentPermissionMode = currentSession?.permissionMode || 'default';
    
    // 如果没有当前会话，使用新对话页面的选项创建新会话
    if (!sessionId && newChatOptions) {
      const selectedAgent = getAgent(newChatOptions.agentId);
      const agentPermissionMode = selectedAgent?.permissionMode || 'default';
      const finalPermissionMode = newChatOptions.permissionMode !== 'default' 
        ? newChatOptions.permissionMode 
        : agentPermissionMode;
      
      const newSession: Session = {
        id: uuidv4(),
        title: messageContent.slice(0, 30) + (messageContent.length > 30 ? '...' : ''),
        model: selectedModel,
        agentId: newChatOptions.agentId,
        cwd: newChatOptions.cwd || undefined,
        permissionMode: finalPermissionMode,
        createdAt: new Date(),
        messages: []
      };
      
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(newSession.id);
      sessionId = newSession.id;
      currentCwd = newSession.cwd;
      currentAgentId = newSession.agentId || 'default';
      currentPermissionMode = newSession.permissionMode || 'default';
      
      updateSessionModel(newSession.id, selectedModel);
      
      onNavigate?.(`/chat/${newSession.id}`);
    }

    const tempUserMessageId = uuidv4();
    const tempAssistantMessageId = uuidv4();

    const userMessage: Message = {
      id: tempUserMessageId,
      role: 'user',
      content: messageContent,
      timestamp: new Date()
    };

    const assistantMessage: Message = {
      id: tempAssistantMessageId,
      role: 'assistant',
      content: '',
      model: selectedModel,
      timestamp: new Date(),
      isStreaming: true,
      contentBlocks: []
    };

    setSessions(prev => prev.map(s => {
      if (s.id === sessionId) {
        const newTitle = s.messages.length === 0 
          ? messageContent.slice(0, 30) + (messageContent.length > 30 ? '...' : '')
          : s.title;
        return {
          ...s,
          title: newTitle,
          messages: [...s.messages, userMessage, assistantMessage]
        };
      }
      return s;
    }));

    setInputValue('');
    localStorage.removeItem(STORAGE_KEYS.draftInput);
    setIsLoading(true);

    // 创建新的 AbortController 用于中断流
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const agent = getAgent(currentAgentId);
    const systemPrompt = agent?.systemPrompt;

    try {
      const response = await fetch(apiUrl('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: messageContent,
          model: selectedModel,
          systemPrompt,
          cwd: currentCwd,
          permissionMode: currentPermissionMode,
        }),
        signal: abortController.signal
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let usedModel = selectedModel;
      let currentToolCalls: ToolCall[] = [];
      let contentBlocks: ContentBlock[] = [];
      let currentTextBlock: string = '';  // 当前正在积累的文本块
      let realSessionId: string = sessionId!;
      let realAssistantMessageId = tempAssistantMessageId;

      if (reader) {
        while (true) {
          // 如果被中断，跳出循环
          if (abortController.signal.aborted) {
            console.log('[Chat] 用户已中断，停止读取流');
            break;
          }
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                if (data.type === 'init') {
                  realSessionId = data.sessionId;
                  realAssistantMessageId = data.assistantMessageId;
                  usedModel = data.model;
                  
                  if (realSessionId !== sessionId) {
                    setSessions(prev => prev.map(s => 
                      s.id === sessionId ? { ...s, id: realSessionId } : s
                    ));
                    setCurrentSessionId(realSessionId);
                    sessionId = realSessionId;
                  }
                  
                  setSessions(prev => prev.map(s => {
                    if (s.id === realSessionId) {
                      return {
                        ...s,
                        messages: s.messages.map(m => 
                          m.id === tempAssistantMessageId 
                            ? { ...m, id: realAssistantMessageId }
                            : m
                        )
                      };
                    }
                    return s;
                  }));
                } else if (data.type === 'text') {
                  fullContent += data.content;
                  currentTextBlock += data.content;
                  
                  // 更新或创建最后一个文本块
                  const lastBlock = contentBlocks[contentBlocks.length - 1];
                  if (lastBlock && lastBlock.type === 'text') {
                    lastBlock.text = currentTextBlock;
                  } else if (currentTextBlock) {
                    contentBlocks.push({ type: 'text', text: currentTextBlock });
                  }
                  
                  setSessions(prev => prev.map(s => {
                    if (s.id === realSessionId) {
                      return {
                        ...s,
                        messages: s.messages.map(m => 
                          m.id === realAssistantMessageId 
                            ? { ...m, content: fullContent, model: usedModel, toolCalls: [...currentToolCalls], contentBlocks: [...contentBlocks] }
                            : m
                        )
                      };
                    }
                    return s;
                  }));
                } else if (data.type === 'tool') {
                  // 如果有累积的文本，先结束当前文本块
                  currentTextBlock = '';
                  
                  const toolCall: ToolCall = {
                    id: data.id || uuidv4(),
                    name: data.name,
                    input: data.input,
                    status: 'running'
                  };
                  currentToolCalls.push(toolCall);
                  
                  // 添加工具调用块
                  contentBlocks.push({ type: 'tool_use', toolCall });
                  
                  setSessions(prev => prev.map(s => {
                    if (s.id === realSessionId) {
                      return {
                        ...s,
                        messages: s.messages.map(m => 
                          m.id === realAssistantMessageId 
                            ? { ...m, toolCalls: [...currentToolCalls], contentBlocks: [...contentBlocks] }
                            : m
                        )
                      };
                    }
                    return s;
                  }));
                } else if (data.type === 'tool_result') {
                  const toolId = data.toolId;
                  const toolIndex = toolId 
                    ? currentToolCalls.findIndex(t => t.id === toolId)
                    : currentToolCalls.length - 1;
                  
                  if (toolIndex >= 0) {
                    currentToolCalls[toolIndex].status = data.isError ? 'error' : 'completed';
                    currentToolCalls[toolIndex].isError = data.isError || false;
                    currentToolCalls[toolIndex].result = typeof data.content === 'string' 
                      ? data.content 
                      : JSON.stringify(data.content);
                    
                    // 同步更新 contentBlocks 中对应的工具调用
                    const blockIndex = contentBlocks.findIndex(
                      b => b.type === 'tool_use' && b.toolCall.id === currentToolCalls[toolIndex].id
                    );
                    if (blockIndex >= 0) {
                      (contentBlocks[blockIndex] as { type: 'tool_use'; toolCall: ToolCall }).toolCall = { ...currentToolCalls[toolIndex] };
                    }
                    
                    setSessions(prev => prev.map(s => {
                      if (s.id === realSessionId) {
                        return {
                          ...s,
                          messages: s.messages.map(m => 
                            m.id === realAssistantMessageId 
                              ? { ...m, toolCalls: [...currentToolCalls], contentBlocks: [...contentBlocks] }
                              : m
                          )
                        };
                      }
                      return s;
                    }));
                  }
                } else if (data.type === 'done') {
                  setSessions(prev => prev.map(s => {
                    if (s.id === realSessionId) {
                      return {
                        ...s,
                        messages: s.messages.map(m => 
                          m.id === realAssistantMessageId 
                            ? { ...m, isStreaming: false }
                            : m
                        )
                      };
                    }
                    return s;
                  }));
                } else if (data.type === 'permission_request') {
                  console.log('[Permission] Request received:', data);
                  setPermissionRequest({
                    requestId: data.requestId,
                    toolUseId: data.toolUseId,
                    toolName: data.toolName,
                    input: data.input,
                    sessionId: data.sessionId,
                    timestamp: data.timestamp
                  });
                } else if (data.type === 'kb_status') {
                  // 知识库检索状态事件
                  console.log('[KB] Status:', data);
                  window.dispatchEvent(new CustomEvent('kb_status', {
                    detail: {
                      hasResults: data.hasResults,
                      resultCount: data.resultCount,
                      source: data.source,
                      warning: data.warning,
                      fallbackToQwen: data.fallbackToQwen,
                    }
                  }));
                }
              } catch {
                // 忽略解析错误
              }
            }
          }
        }
      }
    } catch (error: any) {
      // 如果是用户主动中止（AbortError），不显示错误信息
      if (error?.name === 'AbortError' || stoppedRef.current) {
        console.log('[Chat] 用户主动终止，已停止生成');
        return;
      }
      console.error('Chat error:', error);
      const errorMsg = error instanceof TypeError && error.message.includes('fetch') 
        ? '⚠️ 无法连接到后端服务。请确保在终端运行 `npm run dev` 启动完整服务。' 
        : '❌ 发生错误，请重试。';
      setSessions(prev => prev.map(s => {
        if (s.id === sessionId) {
          return {
            ...s,
            messages: s.messages.map(m => 
              m.id === tempAssistantMessageId 
                ? { ...m, content: errorMsg, isStreaming: false }
                : m
            )
          };
        }
        return s;
      }));
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [currentSession, currentSessionId, selectedModel, getAgent, updateSessionModel, setCurrentSessionId, setSessions, isLoading]);

  // 处理停止事件 - 真正中断 SSE 流（立即生效，不等 reader.cancel）
  const handleStop = useCallback(() => {
    console.log('[Chat] 用户点击终止，立即中断');
    // 1. 标记停止（防止 catch 块误判为错误）
    stoppedRef.current = true;
    // 2. 立即停止 loading 状态（让按钮变回发送）
    setIsLoading(false);
    // 3. 立即标记当前 streaming 消息为非流式 + 追加终止标记（不等 fetch 退出）
    setSessions(prev => prev.map(s => {
      if (s.id === currentSessionId) {
        return {
          ...s,
          messages: s.messages.map(m =>
            m.isStreaming
              ? { ...m, isStreaming: false, content: m.content ? m.content + '\n\n⏹ **[已终止]**' : '⏹ **[已终止]**' }
              : m
          )
        };
      }
      return s;
    }));
    // 4. 最后才 abort fetch（这样 UI 已经先行）
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, [currentSessionId, setSessions]);

  // 重新回答：删除该用户消息及之后的全部消息，并重新发送
  const resendMessage = useCallback(async (messageId: string) => {
    const sessionId = currentSessionId;
    if (!sessionId) return;
    let content = '';
    setSessions(prev => {
      const sess = prev.find(s => s.id === sessionId);
      if (!sess) return prev;
      const idx = sess.messages.findIndex(m => m.id === messageId);
      if (idx < 0 || sess.messages[idx].role !== 'user') return prev;
      content = sess.messages[idx].content;
      return prev.map(s => {
        if (s.id !== sessionId) return s;
        return { ...s, messages: s.messages.slice(0, idx) };
      });
    });
    // 等状态提交后再发送
    if (content) {
      setTimeout(() => sendMessage(content), 50);
    }
  }, [currentSessionId, setSessions, sendMessage]);

  // 编辑并重新发送
  const editAndResendMessage = useCallback(async (messageId: string, newContent: string) => {
    const sessionId = currentSessionId;
    if (!sessionId || !newContent.trim()) return;
    setSessions(prev => {
      const sess = prev.find(s => s.id === sessionId);
      if (!sess) return prev;
      const idx = sess.messages.findIndex(m => m.id === messageId);
      if (idx < 0) return prev;
      return prev.map(s => {
        if (s.id !== sessionId) return s;
        const newMessages = s.messages.slice(0, idx).concat({
          ...s.messages[idx],
          content: newContent.trim(),
        });
        return { ...s, messages: newMessages };
      });
    });
    setTimeout(() => sendMessage(newContent.trim()), 50);
  }, [currentSessionId, setSessions, sendMessage]);

  // 处理权限允许
  const handlePermissionAllow = useCallback(async () => {
    if (!permissionRequest) return;
    
    console.log('[Permission] User allowed:', permissionRequest.requestId);
    
    await fetch(apiUrl('/api/permission-response'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: permissionRequest.requestId,
        behavior: 'allow'
      })
    });
    
    setPermissionRequest(null);
  }, [permissionRequest]);

  // 处理权限拒绝
  const handlePermissionDeny = useCallback(async () => {
    if (!permissionRequest) return;
    
    console.log('[Permission] User denied:', permissionRequest.requestId);
    
    await fetch(apiUrl('/api/permission-response'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: permissionRequest.requestId,
        behavior: 'deny',
        message: '用户拒绝了此操作'
      })
    });
    
    setPermissionRequest(null);
  }, [permissionRequest]);

  return {
    isLoading,
    inputValue,
    setInputValue: saveInput,
    permissionRequest,
    sendMessage,
    handleStop,
    handlePermissionAllow,
    handlePermissionDeny,
    resendMessage,
    editAndResendMessage,
  };
}
