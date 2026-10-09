import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpenCheck,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileText,
  FolderOpen,
  GraduationCap,
  LibraryBig,
  LoaderCircle,
  MessageSquare,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { DIGITAL_HUMANS, type DigitalHumanId } from '../digital-humans';
import { streamAgentChat } from '../streaming-agent-chat';
import { QuizPage } from './QuizPage';
import { AgentResourceLibrary } from './AgentResourceLibrary';
import { getPortal } from '../metaverse/api';
import type { PortalPoint } from '../metaverse/types';
import {
  clearAgentConversation,
  fetchAgentConversation,
  getAgentConversationDraft,
  getChatClientId,
  importLegacyAgentConversation,
  setAgentConversationDraft,
  subscribeAgentConversationDraft,
  type SharedConversationMessage,
} from '../shared-agent-conversation';

type MessageRole = 'user' | 'assistant';

interface EvidenceSource {
  id: string;
  title: string;
  excerpt?: string;
  similarity?: number;
  chapter?: string;
  url?: string;
  domain?: string;
}

interface AgentMessage {
  id: string;
  role: MessageRole;
  content: string;
  source?: 'ragflow' | 'local' | 'web' | 'qwen';
  evidenceCount?: number;
  model?: string;
  sources?: EvidenceSource[];
  modelBased?: boolean;
}

interface AgentWorkspacePageProps {
  agentId: DigitalHumanId;
  onBack: () => void;
}

interface WorkspaceDefinition {
  eyebrow: string;
  headline: string;
  description: string;
  welcome: string;
  inputPlaceholder: string;
  suggestions: string[];
  icon: typeof BookOpenCheck;
}

type WorkspaceMode = 'chat' | 'quiz' | 'resources';

const WORKSPACES: Record<DigitalHumanId, WorkspaceDefinition> = {
  muxiaowen: {
    eyebrow: 'MUYA LANGUAGE · 五语知识库问答',
    headline: '和木小文一起学习木雅语吧',
    description: '想学词汇或练习句子都可以，从一个词开始，慢慢学会自然表达。',
    welcome: 'hello！我是木小文，让我带你走进木雅语的世界～',
    inputPlaceholder: '向木小文提问…',
    suggestions: ['“你好”用木雅语怎么说', '“今天天气真好”怎么说', '查询“天气”相关五语词条'],
    icon: BookOpenCheck,
  },
  muxiaoce: {
    eyebrow: 'ASSESSMENT · 测验、问答与学习资料',
    headline: '和木小测一起练习和测验吧',
    description: '做一组小测、复习错题，或者边看学习资料边问，都可以从这里开始。',
    welcome: '你好，我是木小测，看看你的学习成果～',
    inputPlaceholder: '向木小测提问…',
    suggestions: ['开始在线测验', '“圆规”用木雅语怎么说'],
    icon: ClipboardCheck,
  },
  muxiaozhi: {
    eyebrow: 'MUYA KNOWLEDGE · 日常交流与事实溯源',
    headline: '和木小知一起了解木雅文化知识吧',
    description: '聊聊木雅的语言、地方、节日与生活，从你感兴趣的话题开始。',
    welcome: '嗨，今天想了解点什么？跟着木小知一起看看这片土地的故事～',
    inputPlaceholder: '向木小知提问…',
    suggestions: ['你好，介绍一下你自己', '木雅人的分布地区有哪些', '木雅地区有哪些可核验的文化习俗'],
    icon: LibraryBig,
  },
};

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function LinkedText({ text }: { text: string }) {
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)|(https?:\/\/[^\s]+)/g;
  const nodes = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const url = match[2] || match[3];
    nodes.push(<a key={`${url}-${match.index}`} href={url} target="_blank" rel="noopener noreferrer">{match[1] || url}</a>);
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return <>{nodes}</>;
}

function AgentAnswerContent({ content }: { content: string }) {
  const lines = String(content || '').split(/\r?\n/);
  const output = [];
  for (let index = 0; index < lines.length;) {
    if (lines[index].trim().startsWith('|')) {
      const tableLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        tableLines.push(lines[index].trim());
        index += 1;
      }
      const rows = tableLines
        .filter((line) => !/^\|?\s*[-:]+(?:\s*\|\s*[-:]+)+\s*\|?$/.test(line))
        .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
      if (rows.length > 0) {
        output.push(
          <div className="agent-answer-table-wrap" key={`table-${index}`}>
            <table>
              <thead><tr>{rows[0].map((cell, cellIndex) => <th key={cellIndex}>{cell}</th>)}</tr></thead>
              <tbody>{rows.slice(1).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
            </table>
          </div>,
        );
      }
      continue;
    }
    output.push(<div className="agent-answer-line" key={`line-${index}`}><LinkedText text={lines[index]} /></div>);
    index += 1;
  }
  return <>{output}</>;
}

function loadMessages(agentId: DigitalHumanId, welcome: string): AgentMessage[] {
  try {
    const raw = localStorage.getItem(`muya-specialized-agent-${agentId}`);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // 本地记录损坏时从欢迎语重新开始。
  }
  return [{ id: `welcome-${agentId}`, role: 'assistant', content: welcome }];
}

function sharedMessagesToWorkspace(
  agentId: DigitalHumanId,
  welcome: string,
  messages: SharedConversationMessage[],
): AgentMessage[] {
  return [
    { id: `welcome-${agentId}`, role: 'assistant', content: welcome },
    ...messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      source: message.source,
      evidenceCount: message.evidenceCount,
      model: message.model,
      sources: message.sources,
      modelBased: message.modelBased,
    })),
  ];
}

export function AgentWorkspacePage({ agentId, onBack }: AgentWorkspacePageProps) {
  const profile = DIGITAL_HUMANS[agentId];
  const definition = WORKSPACES[agentId];
  const WorkspaceIcon = definition.icon;
  const [portalPoint, setPortalPoint] = useState<PortalPoint | null>(null);
  const configuredName = portalPoint?.ragflow?.title?.trim() || portalPoint?.name?.trim() || profile.name;
  const configuredWelcome = portalPoint?.ragflow?.welcomeMessage?.trim() || definition.welcome;
  const configuredWaveImage = portalPoint?.waveGifUrl || profile.waveImage;
  const configuredFontSize = Math.min(24, Math.max(16, Number(portalPoint?.chatFontSize) || 17));
  const portalSuggestions = (portalPoint?.quickPrompts || []).filter(prompt => prompt.trim());
  const candidateSuggestions = portalSuggestions.length ? portalSuggestions : definition.suggestions;
  const supportedSuggestions = agentId === 'muxiaoce'
    ? candidateSuggestions.filter(prompt => !/(?:复习刚才的错题|解释上一道错题|给我一份复习建议)/.test(prompt))
    : candidateSuggestions;
  const configuredSuggestions = supportedSuggestions.length ? supportedSuggestions : definition.suggestions;
  const workspaceStyle = { '--agent-chat-font-size': `${configuredFontSize}px` } as CSSProperties;
  const [messages, setMessages] = useState<AgentMessage[]>(() => loadMessages(agentId, definition.welcome));
  const [input, setInput] = useState(() => getAgentConversationDraft(agentId));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('chat');
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  useEffect(() => {
    shouldAutoScrollRef.current = true;
    setWorkspaceMode('chat');
    setInput(getAgentConversationDraft(agentId));
  }, [agentId]);

  useEffect(
    () => subscribeAgentConversationDraft(agentId, value => setInput(current => current === value ? current : value)),
    [agentId],
  );

  const updateInput = (value: string) => {
    setInput(value);
    setAgentConversationDraft(agentId, value);
  };

  useEffect(() => {
    let disposed = false;
    const loadPortalConfig = async () => {
      try {
        const payload = await getPortal(agentId) as { point: PortalPoint };
        if (!disposed) setPortalPoint(payload.point);
      } catch (configError) {
        console.warn('[AgentWorkspace] 3D空间配置同步失败：', configError);
      }
    };
    setPortalPoint(null);
    void loadPortalConfig();
    const timer = window.setInterval(() => void loadPortalConfig(), 3000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [agentId]);

  const latestEvidence = useMemo(
    () => [...messages].reverse().find(message => message.role === 'assistant' && message.evidenceCount !== undefined),
    [messages],
  );

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
  }, [messages]);

  const handleMessageScroll = () => {
    const list = scrollRef.current;
    if (!list) return;
    shouldAutoScrollRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 64;
  };

  useEffect(() => {
    let disposed = false;
    let requestController: AbortController | null = null;

    const synchronize = async (migrateLegacy = false) => {
      if (isLoading) return;
      requestController?.abort();
      requestController = new AbortController();
      try {
        if (migrateLegacy) {
          const clientId = getChatClientId();
          const migrationKey = `muya-specialized-agent-migrated-${clientId}-${agentId}`;
          if (!localStorage.getItem(migrationKey)) {
            const legacyMessages = loadMessages(agentId, configuredWelcome)
              .filter((message) => !message.id.startsWith('welcome-'))
              .map((message, index): SharedConversationMessage => ({
                ...message,
                createdAt: Date.now() - 60_000 + index,
              }));
            if (legacyMessages.length > 0) {
              await importLegacyAgentConversation(agentId, legacyMessages);
            }
            localStorage.setItem(migrationKey, '1');
          }
        }

        const conversation = await fetchAgentConversation(agentId, requestController.signal);
        if (!disposed) {
          setMessages(sharedMessagesToWorkspace(agentId, configuredWelcome, conversation.messages));
        }
      } catch (syncError: any) {
        if (syncError?.name !== 'AbortError') console.warn('[AgentConversation] Sync failed:', syncError);
      }
    };

    void synchronize(true);
    const timer = window.setInterval(() => void synchronize(), 2000);
    return () => {
      disposed = true;
      requestController?.abort();
      window.clearInterval(timer);
    };
  }, [agentId, configuredWelcome, isLoading]);

  const resetConversation = async () => {
    shouldAutoScrollRef.current = true;
    setMessages([{ id: `welcome-${agentId}`, role: 'assistant', content: configuredWelcome }]);
    setError('');
    try {
      await clearAgentConversation(agentId);
    } catch (resetError: any) {
      setError(resetError?.message || '清空会话失败');
    }
  };

  const sendMessage = async (preset?: string) => {
    const content = String(preset ?? input).trim();
    if (!content || isLoading) return;

    const userMessage: AgentMessage = { id: makeId('user'), role: 'user', content };
    const assistantMessageId = makeId('assistant-stream');
    shouldAutoScrollRef.current = true;
    const history = messages
      .filter(message => !message.id.startsWith('welcome-'))
      .slice(-8)
      .map(message => ({ role: message.role, content: message.content }));
    setMessages(current => [...current, userMessage, {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
    }]);
    updateInput('');
    setError('');
    setIsLoading(true);

    try {
      const payload = await streamAgentChat({
        agentType: agentId,
        message: content,
        history,
        clientId: getChatClientId(),
        clientMessageId: userMessage.id,
      }, (chunk) => {
        setMessages(current => current.map(message => message.id === assistantMessageId
          ? { ...message, content: message.content + chunk }
          : message));
      });

      setMessages(current => current.map(message => message.id === assistantMessageId ? {
        ...message,
        id: String(payload.conversationMessageId || message.id),
        content: message.content || String(payload.answer || '没有生成可用回答'),
        source: payload.source,
        evidenceCount: Number(payload.evidenceCount || 0),
        model: payload.model,
        sources: Array.isArray(payload.sources) ? payload.sources : [],
        modelBased: payload.modelBased === true,
      } : message));
    } catch (requestError: any) {
      setMessages(current => current.filter(message => message.id !== assistantMessageId || message.content));
      setError(requestError?.message || '智能体服务暂时不可用');
    } finally {
      setIsLoading(false);
    }
  };

  const runSuggestion = (suggestion: string) => {
    if (agentId === 'muxiaoce' && /(?:开始|进入|来一组).*(?:测验|小测)|在线测验/.test(suggestion)) {
      setWorkspaceMode('quiz');
      return;
    }
    void sendMessage(suggestion);
  };

  return (
    <div className={`agent-workspace agent-workspace--${agentId}`} style={workspaceStyle}>
      <div className="agent-workspace__topbar">
        <button type="button" className="agent-back-button" onClick={onBack}>
          <ArrowLeft size={17} /> 返回三智能体首页
        </button>
        <div className="agent-runtime-badges">
          <span><Database size={14} /> RAGFlow / 本地词库</span>
          <span><Sparkles size={14} /> DeepSeek-V3</span>
          <span><ShieldCheck size={14} /> 来源可追溯</span>
        </div>
      </div>

      <div className={`agent-workspace__body ${workspaceMode !== 'chat' ? 'is-tool-mode' : ''}`}>
        <aside className="agent-profile-panel">
          <div className="agent-profile-panel__halo" />
          <div className="agent-profile-panel__label"><Bot size={14} /> 专属智能体</div>
          <div className="agent-profile-panel__human">
            <img src={configuredWaveImage} alt={`${configuredName}数字人`} />
          </div>
          <h1>{configuredName}</h1>
          <p>{profile.role}</p>
          <div className="agent-profile-panel__status">
            <span className={isLoading ? 'is-thinking' : ''} />
            {isLoading ? '正在检索并组织回答' : '在线 · 等待任务'}
          </div>

        </aside>

        <section className="agent-conversation-panel">
          <nav className="agent-workspace-mode-tabs" aria-label={`${configuredName}工作模式`}>
            <button type="button" className={workspaceMode === 'chat' ? 'is-active' : ''} onClick={() => setWorkspaceMode('chat')}>
              <MessageSquare size={15} /> 知识问答
            </button>
            {agentId === 'muxiaoce' && (
              <button type="button" className={workspaceMode === 'quiz' ? 'is-active' : ''} onClick={() => setWorkspaceMode('quiz')}>
                <GraduationCap size={15} /> 在线测验
              </button>
            )}
            {(agentId === 'muxiaoce' || agentId === 'muxiaozhi') && (
              <button type="button" className={workspaceMode === 'resources' ? 'is-active' : ''} onClick={() => setWorkspaceMode('resources')}>
                <FolderOpen size={15} /> 视频与文档
              </button>
            )}
            <button type="button" className="agent-workspace-reset-button" onClick={() => void resetConversation()}>
              <RotateCcw size={15} /> 新任务
            </button>
          </nav>

          {workspaceMode === 'quiz' && agentId === 'muxiaoce' ? (
            <QuizPage onBack={() => setWorkspaceMode('chat')} />
          ) : workspaceMode === 'resources' ? (
            <AgentResourceLibrary agentId={agentId} />
          ) : (
          <>
          <div ref={scrollRef} onScroll={handleMessageScroll} className="agent-message-list">
            {messages.filter((message, index) => message.content || (isLoading && index === messages.length - 1)).map(message => (
              <article key={message.id} className={`agent-message agent-message--${message.role}`}>
                {message.role === 'assistant' && (
                  <div className="agent-message__avatar"><img src={configuredWaveImage} alt="" /></div>
                )}
                <div className="agent-message__content">
                  <div className="agent-message__name">{message.role === 'assistant' ? configuredName : '我'}</div>
                  <div className={`agent-message__bubble ${!message.content && isLoading ? 'agent-thinking' : ''}`}>
                    {message.content
                      ? <AgentAnswerContent content={message.content} />
                      : isLoading
                        ? <><LoaderCircle size={18} /> 正在检索知识库并整理回答……</>
                        : null}
                  </div>
                  {message.modelBased === true && (
                    <div className="agent-message__meta agent-message__meta--model-based">
                      <span><AlertTriangle size={12} /> 此回答基于模型自己的回答，请仔细辨明</span>
                    </div>
                  )}
                  {message.evidenceCount !== undefined && (message.source === 'qwen' || message.evidenceCount > 0) && (
                    <div className="agent-message__meta">
                      <span><Database size={12} /> {message.source === 'qwen'
                        ? '通用对话 · 未使用知识库'
                        : `${message.source === 'ragflow' ? 'RAGFlow' : message.source === 'web' ? '可信网页' : '本地库'}命中 ${message.evidenceCount} 条`}</span>
                      <span><Sparkles size={12} /> {message.model || '证据直出'}</span>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>

          {error && <div className="agent-request-error">{error}</div>}

          <div className="agent-composer">
            <textarea
              value={input}
              rows={2}
              placeholder={definition.inputPlaceholder}
              disabled={isLoading}
              onChange={event => updateInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
            />
            <button type="button" disabled={isLoading || !input.trim()} onClick={() => sendMessage()} aria-label="发送">
              {isLoading ? <LoaderCircle className="agent-spin" size={18} /> : <Send size={18} />}
            </button>
            <small><ShieldCheck size={12} /> {agentId === 'muxiaozhi'
              ? '文化事实优先检索官方网站，并在回答中列出实际网址'
              : agentId === 'muxiaowen'
                ? '整句可由DeepSeek-V3补全；知识库命中与未命中部分会分别标明'
                : 'RAGFlow优先，本地词库用于测试；测评结论必须有知识库依据'}</small>
          </div>
          </>
          )}
        </section>

        {workspaceMode === 'chat' && <aside className="agent-evidence-panel">
          <div className="agent-evidence-panel__heading">
            <span><Database size={15} /></span>
            <div><h3>本轮检索依据</h3><p>用于核验回答是否有出处</p></div>
          </div>

          {latestEvidence && ((latestEvidence.evidenceCount ?? 0) > 0 || latestEvidence.source === 'qwen') ? (
            <>
              <div className={`agent-evidence-summary ${latestEvidence.evidenceCount ? 'has-evidence' : ''}`}>
                {latestEvidence.evidenceCount ? <CheckCircle2 size={17} /> : <ShieldCheck size={17} />}
                <div>
                  <strong>{latestEvidence.source === 'qwen'
                    ? '本轮为普通日常交流'
                    : `命中 ${latestEvidence.evidenceCount} 条资料`}</strong>
                  <span>{latestEvidence.source === 'qwen'
                    ? '本轮未声称使用知识库或网页资料'
                    : latestEvidence.source === 'ragflow' ? '来源：RAGFlow / muya'
                      : latestEvidence.source === 'web' ? '来源：可信网页检索'
                        : '来源：本地测试知识库'}</span>
                </div>
              </div>
              <div className="agent-source-list">
                {(latestEvidence.sources || []).map((source, index) => (
                  <details key={source.id || `${source.title}-${index}`} open={index === 0}>
                    <summary><FileText size={13} /><span>资料 {index + 1}</span><strong>{source.title}</strong></summary>
                    <p>{source.excerpt}</p>
                    {typeof source.similarity === 'number' && <small>相似度 {(source.similarity * 100).toFixed(1)}%</small>}
                    {source.chapter && <small>章节：{source.chapter}</small>}
                    {source.url && <a href={source.url} target="_blank" rel="noopener noreferrer">{source.url}</a>}
                  </details>
                ))}
              </div>
            </>
          ) : latestEvidence ? null : (
            <div className="agent-evidence-empty">
              <Database size={28} />
              <h4>尚未进行检索</h4>
              <p>发送任务后，这里会显示命中的来源文件与证据摘要。</p>
            </div>
          )}

          <div className="agent-guardrail-card">
            <ShieldCheck size={16} />
            <div><strong>来源透明机制已开启</strong><span>{agentId === 'muxiaozhi'
              ? '文化事实优先使用政府、高校或科研机构官网；无官方结果时才使用百度百科等可信来源。'
              : agentId === 'muxiaowen'
                ? '知识库命中的词语使用证据卡片；模型补全的句子部分会明确备注，不冒充知识库结论。'
                : '测评、错题解释和复习依据只采用RAGFlow或本地知识库实际命中的内容。'}</span></div>
          </div>
        </aside>}
      </div>
    </div>
  );
}
