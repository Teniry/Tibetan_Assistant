import { useState, useCallback } from 'react';
import { Loading, Tooltip, Input, Button } from 'tdesign-react';
import { ChatMarkdown } from '@tdesign-react/chat';
import {
  User, Copy, RotateCcw, Edit3,
  Check, X as XIcon
} from 'lucide-react';
import { Message, Model, PermissionRequest, ContentBlock } from '../types';
import { DIGITAL_HUMANS } from '../digital-humans';
import { ToolCallsCollapse } from './ToolCallsCollapse';
import { InlinePermissionCard } from './InlinePermissionCard';

interface ChatMessagesProps {
  messages: Message[];
  models: Model[];
  messagesEndRef: React.RefObject<HTMLDivElement>;
  // 内联权限确认相关
  permissionRequest?: PermissionRequest | null;
  onPermissionAllow?: () => void;
  onPermissionDeny?: () => void;
  // 用户消息操作
  onResendMessage?: (messageId: string) => void;
  onEditAndResendMessage?: (messageId: string, newContent: string) => void;
}

export function ChatMessages({
  messages,
  models,
  messagesEndRef,
  permissionRequest,
  onPermissionAllow,
  onPermissionDeny,
  onResendMessage,
  onEditAndResendMessage,
}: ChatMessagesProps) {
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');

  // 获取消息纯文本内容
  const getMessageText = (message: Message): string => {
    if (message.content) return message.content;
    if (message.contentBlocks) {
      return message.contentBlocks
        .filter(b => b.type === 'text')
        .map(b => (b as { type: 'text'; text: string }).text)
        .join('');
    }
    return '';
  };

  // 复制到剪贴板
  const copyMessage = useCallback(async (message: Message) => {
    const text = getMessageText(message);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(message.id);
      setTimeout(() => {
        setCopiedMessageId(prev => prev === message.id ? null : prev);
      }, 1500);
    } catch {
      // 降级方案
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopiedMessageId(message.id);
        setTimeout(() => setCopiedMessageId(null), 1500);
      } finally {
        document.body.removeChild(ta);
      }
    }
  }, []);

  // 开始编辑
  const startEdit = (message: Message) => {
    setEditingMessageId(message.id);
    setEditingContent(message.content);
  };

  // 取消编辑
  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditingContent('');
  };

  // 保存编辑（并重新提交）
  const saveEdit = (message: Message) => {
    if (!editingContent.trim()) return;
    onEditAndResendMessage?.(message.id, editingContent.trim());
    setEditingMessageId(null);
    setEditingContent('');
  };

  const formatModelName = (modelId: string) => {
    const model = models.find(m => m.modelId === modelId);
    const name = model?.name || modelId;
    return name
      .replace(/^(Claude|GPT|Gemini|Kimi|DeepSeek|Qwen|GLM)\s*/i, '')
      .replace(/-/g, ' ')
      .trim() || name;
  };

  // 渲染单个内容块
  const renderContentBlock = (block: ContentBlock, index: number, isStreaming?: boolean, isLast?: boolean) => {
    if (block.type === 'text') {
      return (
        <div
          key={`text-${index}`}
          className="px-4 py-3 leading-relaxed break-words"
          style={{
            backgroundColor: 'var(--td-bg-color-component)',
            color: 'var(--td-text-color-primary)',
            borderRadius: '16px 16px 16px 4px'
          }}
        >
          <div className="chat-markdown">
            <ChatMarkdown content={block.text} />
          </div>
          {isStreaming && isLast && (
            <span
              className="animate-cursor-blink ml-0.5"
              style={{ color: 'var(--td-brand-color)' }}
            >
              |
            </span>
          )}
        </div>
      );
    } else if (block.type === 'tool_use') {
      return (
        <ToolCallsCollapse
          key={`tool-${block.toolCall.id}`}
          toolCalls={[block.toolCall]}
          isStreaming={isStreaming && block.toolCall.status === 'running'}
        />
      );
    }
    return null;
  };

  // 渲染 assistant 消息内容
  const renderAssistantContent = (message: Message) => {
    if (message.contentBlocks && message.contentBlocks.length > 0) {
      return message.contentBlocks.map((block, index) =>
        renderContentBlock(block, index, message.isStreaming, index === message.contentBlocks!.length - 1)
      );
    }

    return (
      <>
        {message.toolCalls && message.toolCalls.length > 0 && (
          <ToolCallsCollapse
            toolCalls={message.toolCalls}
            isStreaming={message.isStreaming}
          />
        )}
        {message.content && (
          <div
            className="px-4 py-3 leading-relaxed break-words"
            style={{
              backgroundColor: 'var(--td-bg-color-component)',
              color: 'var(--td-text-color-primary)',
              borderRadius: '16px 16px 16px 4px'
            }}
          >
            <div className="chat-markdown">
              <ChatMarkdown content={message.content} />
            </div>
            {message.isStreaming && (
              <span
                className="animate-cursor-blink ml-0.5"
                style={{ color: 'var(--td-brand-color)' }}
              >
                |
              </span>
            )}
          </div>
        )}
      </>
    );
  };

  // 用户消息操作按钮 — 复制 / 重新回答 / 编辑
  const renderUserActions = (message: Message) => {
    if (message.role !== 'user') return null;
    if (editingMessageId === message.id) return null;

    const isCopied = copiedMessageId === message.id;

    return (
      <div
        className="flex items-center gap-1 transition-opacity"
        // 桌面端 hover 显示，移动端始终显示
      >
        <Tooltip content={isCopied ? '已复制' : '复制'}>
          <button
            type="button"
            onClick={() => copyMessage(message)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all"
            style={{
              backgroundColor: isCopied ? 'rgba(5, 150, 105, 0.12)' : 'var(--td-bg-color-component)',
              color: isCopied ? '#059669' : 'var(--td-text-color-secondary)',
            }}
          >
            {isCopied ? <Check size={12} /> : <Copy size={12} />}
            <span>{isCopied ? '已复制' : '复制'}</span>
          </button>
        </Tooltip>
        <Tooltip content="重新回答">
          <button
            type="button"
            onClick={() => onResendMessage?.(message.id)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all"
            style={{
              backgroundColor: 'var(--td-bg-color-component)',
              color: 'var(--td-text-color-secondary)',
            }}
          >
            <RotateCcw size={12} />
            <span>重新回答</span>
          </button>
        </Tooltip>
        <Tooltip content="编辑并重新提交">
          <button
            type="button"
            onClick={() => startEdit(message)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all"
            style={{
              backgroundColor: 'var(--td-bg-color-component)',
              color: 'var(--td-text-color-secondary)',
            }}
          >
            <Edit3 size={12} />
            <span>编辑</span>
          </button>
        </Tooltip>
      </div>
    );
  };

  // 用户消息 - 编辑模式
  const renderUserEditing = (message: Message) => {
    if (editingMessageId !== message.id) return null;

    return (
      <div
        className="flex flex-col gap-2 px-3 py-2 rounded-2xl w-full max-w-[480px]"
        style={{
          backgroundColor: 'var(--td-bg-color-component)',
          border: '2px solid #7c3aed',
          borderRadius: '16px 16px 4px 16px',
        }}
      >
        <Input
          value={editingContent}
          onChange={v => setEditingContent(v)}
          placeholder="编辑消息..."
          autofocus
          onEnter={() => saveEdit(message)}
        />
        <div className="flex items-center justify-end gap-2">
          <Button
            size="small"
            onClick={cancelEdit}
            icon={<XIcon size={12} />}
          >
            取消
          </Button>
          <Button
            size="small"
            theme="primary"
            onClick={() => saveEdit(message)}
            disabled={!editingContent.trim()}
            icon={<Check size={12} />}
            style={{ backgroundColor: '#7c3aed', borderColor: '#7c3aed' }}
          >
            保存并重发
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      {messages.map(message => {
        const isUser = message.role === 'user';

        return (
          <div
            key={message.id}
            className={`flex gap-3 group ${isUser ? 'flex-row-reverse' : ''}`}
          >
            <div
              className={isUser
                ? 'w-9 h-9 flex items-center justify-center flex-shrink-0 rounded-full self-start'
                : 'assistant-digital-human-avatar flex-shrink-0 self-start'}
              style={{
                backgroundColor: isUser
                  ? 'var(--td-brand-color)'
                  : 'transparent',
                color: isUser
                  ? 'white'
                  : 'var(--td-text-color-primary)'
              }}
            >
              {isUser ? (
                <User size={18} />
              ) : (
                <img
                  src={message.isStreaming
                    ? DIGITAL_HUMANS.muxiaozhi.speakImage
                    : DIGITAL_HUMANS.muxiaozhi.waveImage}
                  alt={message.isStreaming ? '木小知正在回答' : '木小知'}
                />
              )}
            </div>
            <div
              className={`flex flex-col gap-2 max-w-[80%] ${isUser ? 'items-end' : ''}`}
            >
              {message.role === 'assistant' && message.model && (
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs"
                    style={{ color: 'var(--td-text-color-placeholder)' }}
                  >
                    {formatModelName(message.model)}
                  </span>
                </div>
              )}

              {/* 用户消息：编辑模式 / 文本模式 / 操作按钮 */}
              {isUser && (
                editingMessageId === message.id ? (
                  renderUserEditing(message)
                ) : (
                  <div
                    className="px-4 py-3 leading-relaxed break-words"
                    style={{
                      backgroundColor: 'var(--td-brand-color)',
                      color: 'white',
                      borderRadius: '16px 16px 4px 16px'
                    }}
                  >
                    {message.content}
                  </div>
                )
              )}

              {/* 用户消息操作按钮（在 bubble 下方） */}
              {isUser && renderUserActions(message)}

              {/* 助手消息 */}
              {message.role === 'assistant' && renderAssistantContent(message)}

              {/* 思考中状态 */}
              {message.role === 'assistant' && message.isStreaming &&
                !message.content &&
                (!message.contentBlocks || message.contentBlocks.length === 0) &&
                (!message.toolCalls || message.toolCalls.length === 0) && (
                  <div
                    className="flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{ backgroundColor: 'var(--td-bg-color-component)' }}
                  >
                    <Loading size="small" />
                    <span
                      className="text-sm"
                      style={{ color: 'var(--td-text-color-secondary)' }}
                    >
                      思考中...
                    </span>
                  </div>
                )}
            </div>
          </div>
        );
      })}

      {/* 内联权限确认 */}
      {permissionRequest && onPermissionAllow && onPermissionDeny && (
        <div className="flex gap-3 ml-12">
          <InlinePermissionCard
            request={permissionRequest}
            onAllow={onPermissionAllow}
            onDeny={onPermissionDeny}
          />
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
