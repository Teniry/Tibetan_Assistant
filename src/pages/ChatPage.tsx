import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tag } from 'tdesign-react';
import { Database, CheckCircle, AlertCircle, Sparkles, Wifi, WifiOff } from 'lucide-react';
import { Model, Session, PermissionMode, PermissionRequest } from '../types';
import type { ApiStatus } from '../hooks/useApiStatus';
import type { LearningProgress } from '../hooks/useLearningProgress';
import { NewChatView } from '../components/NewChatView';
import { ChatMessages } from '../components/ChatMessages';
import { ChatInput } from '../components/ChatInput';

interface ChatPageProps {
  currentSession: Session | undefined;
  models: Model[];
  selectedModel: string;
  isLoading: boolean;
  inputValue: string;
  permissionRequest: PermissionRequest | null;
  permissionMode: PermissionMode;
  apiStatus: ApiStatus;
  learningProgress: LearningProgress;
  onSendMessage: (message: string, newChatOptions?: NewChatOptions, onNavigate?: (path: string) => void) => void;
  onStop: () => void;
  onInputChange: (value: string) => void;
  onModelChange: (modelId: string) => void;
  onPermissionAllow: () => void;
  onPermissionDeny: () => void;
  onPermissionModeChange: (mode: PermissionMode) => void;
  onResendMessage?: (messageId: string) => void;
  onEditAndResendMessage?: (messageId: string, newContent: string) => void;
}

interface NewChatOptions {
  agentId: string;
  cwd: string;
  permissionMode: PermissionMode;
}

export function ChatPage({
  currentSession,
  models,
  selectedModel,
  isLoading,
  inputValue,
  permissionRequest,
  permissionMode,
  apiStatus,
  learningProgress,
  onSendMessage,
  onStop,
  onInputChange,
  onModelChange,
  onPermissionAllow,
  onPermissionDeny,
  onPermissionModeChange,
  onResendMessage,
  onEditAndResendMessage,
}: ChatPageProps) {
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // 新对话页面状态
  const [newChatAgentId, setNewChatAgentId] = useState('default');
  const [newChatCwd, setNewChatCwd] = useState('');

  // RAGFlow 检索状态
  const [ragflowStatus, setRagflowStatus] = useState<{
    hasResults: boolean;
    resultCount: number;
    source?: 'ragflow' | 'local';
    warning?: string;
    fallbackToQwen?: boolean;
  } | null>(null);

  // 在线/离线状态从 App 层传入
  const isOnline = apiStatus.isOnline;
  const apiStatusMsg = apiStatus.message;

  // 智能自动滚动：仅当用户在底部时才滚动
  const shouldAutoScroll = useRef(true);
  const lastUserMessageCount = useRef(0);

  // 当新增用户消息时，自动滚到底部并重置标记
  useEffect(() => {
    const msgs = currentSession?.messages;
    if (!msgs) return;
    const userMsgCount = msgs.filter(m => m.role === 'user').length;
    if (userMsgCount > lastUserMessageCount.current) {
      shouldAutoScroll.current = true;
      lastUserMessageCount.current = userMsgCount;
      // 发送新消息后立即滚到底部
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
      }, 50);
    }
  }, [currentSession?.messages]);

  // 检测用户手动滚动：滚到底部 → 开启自动跟滚，滚上去 → 关闭
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      // 用较小的阈值（30px），更精准检测用户意图
      const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 30;
      shouldAutoScroll.current = isAtBottom;
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // 流式输出时，仅当 shouldAutoScroll 时才滚动（不做 smooth，避免滚动事件干扰）
  useEffect(() => {
    if (shouldAutoScroll.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
    }
  }, [currentSession?.messages]);

  // 监听 SSE 中的 kb_status 事件
  useEffect(() => {
    const handleKbStatus = (event: CustomEvent) => {
      setRagflowStatus(event.detail);
      // 3秒后自动隐藏
      setTimeout(() => setRagflowStatus(null), 5000);
    };
    window.addEventListener('kb_status', handleKbStatus as EventListener);
    return () => window.removeEventListener('kb_status', handleKbStatus as EventListener);
  }, []);

  // 处理发送消息
  const handleSend = useCallback((message: string) => {
    if (!currentSession) {
      // 新对话
      onSendMessage(message, {
        agentId: newChatAgentId,
        cwd: newChatCwd,
        permissionMode: permissionMode,
      }, (path) => {
        // 重置新对话选项
        setNewChatAgentId('default');
        setNewChatCwd('');
        navigate(path);
      });
    } else {
      onSendMessage(message);
    }
  }, [currentSession, newChatAgentId, newChatCwd, permissionMode, onSendMessage, navigate]);

  const showNewChatView = !currentSession || currentSession.messages.length === 0;

  return (
    <>
      {/* RAGFlow 检索状态提示条 */}
      {ragflowStatus && (
        <div 
          className="px-6 py-2 flex items-center gap-2 text-sm"
          style={{ 
            backgroundColor: ragflowStatus.hasResults 
              ? 'rgba(5, 150, 105, 0.08)' 
              : 'rgba(245, 158, 11, 0.08)',
          }}
        >
          {ragflowStatus.fallbackToQwen
            ? <Sparkles size={16} style={{ color: '#b45309' }} />
            : <Database size={16} style={{ color: ragflowStatus.hasResults ? '#059669' : '#f59e0b' }} />}
          <span style={{ color: ragflowStatus.hasResults ? '#059669' : '#f59e0b' }}>
            {ragflowStatus.hasResults 
              ? `${ragflowStatus.source === 'ragflow' ? 'RAGFlow' : '本地兜底库'}命中 ${ragflowStatus.resultCount} 条可靠资料`
              : ragflowStatus.fallbackToQwen
                ? `${ragflowStatus.source === 'ragflow' ? 'RAGFlow' : '本地知识库'}未命中可靠资料，已切换到通义千问通用知识并标注来源`
                : ragflowStatus.warning
                  ? `知识库检索暂时不可用，未切换通用回答`
                  : `${ragflowStatus.source === 'ragflow' ? 'RAGFlow' : '本地知识库'}未命中可靠资料，且通义千问未配置`}
          </span>
          {ragflowStatus.hasResults ? (
            <CheckCircle size={14} style={{ color: '#059669' }} />
          ) : ragflowStatus.fallbackToQwen ? (
            <Sparkles size={14} style={{ color: '#b45309' }} />
          ) : (
            <AlertCircle size={14} style={{ color: '#f59e0b' }} />
          )}
        </div>
      )}

      {/* 在线/离线模式指示器 */}
      {!showNewChatView && <div 
        className="px-6 py-1.5 flex items-center gap-2 text-xs border-b"
        style={{ 
          backgroundColor: isOnline ? 'rgba(5, 150, 105, 0.04)' : 'rgba(239, 68, 68, 0.04)',
          borderColor: 'var(--td-component-border)',
        }}
      >
        {isOnline ? (
          <>
            <Wifi size={12} style={{ color: '#059669' }} />
            <span style={{ color: '#059669' }}>在线模式 · 阿里云通义千问</span>
          </>
        ) : (
          <>
            <WifiOff size={12} style={{ color: '#ef4444' }} />
            <span style={{ color: '#ef4444' }}>
              离线模式 · {apiStatusMsg || '仅本地知识库'}
            </span>
          </>
        )}
      </div>}

      {/* 消息区域 */}
      <div ref={chatContainerRef} className={`chat-scroll-area flex-1 overflow-y-auto ${showNewChatView ? 'home-mode' : 'p-6'}`}>
        {showNewChatView ? (
          <NewChatView
            kbTotal={apiStatus.kbStats?.total || 4641}
            kbChapters={apiStatus.kbStats?.chapters?.length || 64}
            learningProgress={learningProgress}
            onOpenChapter={() => navigate('/agents/muxiaowen')}
            onOpenQuiz={() => navigate('/agents/muxiaoce')}
            onOpenKnowledge={() => navigate('/agents/muxiaozhi')}
          />
        ) : (
          <ChatMessages
            messages={currentSession!.messages}
            models={models}
            messagesEndRef={messagesEndRef}
            permissionRequest={permissionRequest}
            onPermissionAllow={onPermissionAllow}
            onPermissionDeny={onPermissionDeny}
            onResendMessage={onResendMessage}
            onEditAndResendMessage={onEditAndResendMessage}
          />
        )}
      </div>

      {/* 首页只保留三个数字人入口；旧会话页仍可继续原有通用会话。 */}
      {!showNewChatView && (
        <ChatInput
          inputValue={inputValue}
          selectedModel={selectedModel}
          models={models}
          isLoading={isLoading}
          permissionMode={permissionMode}
          onSend={handleSend}
          onStop={onStop}
          onChange={onInputChange}
          onModelChange={onModelChange}
          onPermissionModeChange={onPermissionModeChange}
        />
      )}
    </>
  );
}
