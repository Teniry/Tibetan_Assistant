import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ragflowChat, type AgentChatResponse } from '../api';
import type { AssistantMode, CarouselImage, PortalPoint } from '../types';
import type { DigitalHumanId } from '../../digital-humans';
import {
  clearAgentConversation,
  fetchAgentConversation,
  getAgentConversationDraft,
  getChatClientId,
  setAgentConversationDraft,
  subscribeAgentConversationDraft,
  type SharedConversationMessage,
} from '../../shared-agent-conversation';
import ImageCarousel from './ImageCarousel';
import KnowledgeQuiz from './KnowledgeQuiz';
import { AlertTriangle, BookOpen, ChevronDown, ChevronUp, ClipboardCheck, ExternalLink, Globe2, GraduationCap, Images, MessageCircle, Send, ShieldCheck, Square, Trophy } from 'lucide-react';
import { ChapterLearningPage } from '../../components/ChapterLearningPage';

interface Msg {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  pending?: boolean;
  evidence?: AgentChatResponse;
  modelBased?: boolean;
}

interface Props {
  point: PortalPoint;
  onStreamingChange?: (streaming: boolean) => void;
  onAssistantChunk?: (chunk: string, fullAnswer: string) => void;
  onAssistantReply?: (text: string) => void;
}

export type CarouselPosition = 'above' | 'below' | 'left' | 'right' | 'inline';

interface RoleProfile {
  mode: AssistantMode;
  title: string;
  subtitle: string;
  badge: string;
  accent: string;
  prompts: string[];
}

function roleProfile(point: PortalPoint): RoleProfile {
  const inferred: AssistantMode = point.id === 'muxiaoce'
    ? 'assessment'
    : point.id === 'muxiaowen' ? 'language-learning' : point.id === 'muxiaozhi' ? 'culture-guide' : 'general';
  const mode = point.assistantMode || inferred;
  const profiles: Record<AssistantMode, Omit<RoleProfile, 'mode'>> = {
    assessment: {
      title: '木雅语测验空间', subtitle: '边练边学 · 随时复习', badge: '测评模式', accent: '#9A6D36',
      prompts: ['开始在线测验', '“圆规”用木雅语怎么说？'],
    },
    'language-learning': {
      title: '木雅语学习空间', subtitle: '词汇、句子与五语学习', badge: '五语学习', accent: '#9B4A3F',
      prompts: ['“你好”的木雅语怎么说？', '“今天天气真好”怎么说？', '学习一个五语词条', '一起练习问候语'],
    },
    'culture-guide': {
      title: '木雅文化空间', subtitle: '一起发现木雅文化', badge: '文化问答', accent: '#667553',
      prompts: ['你好，介绍一下你自己', '木雅人主要分布在哪里？', '木雅有哪些著名景点？', '聊聊木雅的文化习俗'],
    },
    general: {
      title: '木雅交流空间', subtitle: '随时聊聊你感兴趣的内容', badge: '问答模式', accent: '#776555',
      prompts: ['木雅语是什么？', '介绍一个木雅文化知识', '给我一项学习任务'],
    },
  };
  return { mode, ...profiles[mode] };
}

function LinkedAnswerText({ text }: { text: string }) {
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)|(https?:\/\/[^\s]+)/g;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const url = match[2] || match[3];
    nodes.push(<a key={`${url}-${match.index}`} href={url} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: '#52694B' }}>{match[1] || url}</a>);
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return <>{nodes}</>;
}

function PortalAnswerContent({ content, accent, fontSize }: { content: string; accent: string; fontSize: number }) {
  const lines = String(content || '').split(/\r?\n/);
  const output: React.ReactNode[] = [];
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
        output.push(<div key={`table-${index}`} className="my-1.5 max-w-full overflow-x-auto rounded-xl" style={{ border: '1px solid rgba(91,75,60,0.14)' }}>
          <table className="w-full min-w-[600px] border-collapse text-left" style={{ fontSize: `${Math.max(13, fontSize - 2)}px` }}>
            <thead><tr>{rows[0].map((cell, cellIndex) => <th key={cellIndex} className="px-3 py-2 font-semibold" style={{ color: accent, background: `${accent}14`, borderRight: '1px solid rgba(91,75,60,0.1)' }}>{cell}</th>)}</tr></thead>
            <tbody>{rows.slice(1).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-2 align-top" style={{ borderTop: '1px solid rgba(91,75,60,0.1)', borderRight: '1px solid rgba(91,75,60,0.08)' }}><LinkedAnswerText text={cell} /></td>)}</tr>)}</tbody>
          </table>
        </div>);
      }
      continue;
    }
    output.push(<div key={`line-${index}`} className={lines[index] ? 'min-h-[1.45em]' : 'h-2'}><LinkedAnswerText text={lines[index]} /></div>);
    index += 1;
  }
  return <>{output}</>;
}

function sharedMessagesToPortal(
  agentType: DigitalHumanId,
  welcome: string,
  messages: SharedConversationMessage[],
): Msg[] {
  return [
    { id: `welcome-${agentType}`, role: 'assistant', text: welcome },
    ...messages.map((message): Msg => ({
      id: message.id,
      role: message.role,
      text: message.content,
      modelBased: message.modelBased === true,
      evidence: message.role === 'assistant' && message.evidenceCount !== undefined
        ? {
            answer: message.content,
            agentType,
            source: message.source === 'web' ? 'web' : message.source === 'local' ? 'local' : message.source === 'qwen' ? 'qwen' : 'ragflow',
            evidenceCount: message.evidenceCount,
            sources: message.sources || [],
            model: message.model || 'deepseek-v3',
            grounded: message.grounded === true,
            warning: message.warning,
          }
        : undefined,
    })),
  ];
}

export default function ChatPanel({ point, onStreamingChange, onAssistantChunk, onAssistantReply }: Props) {
  const profile = useMemo(() => roleProfile(point), [point.id, point.assistantMode]);
  const accent = point.chatAccentColor || profile.accent;
  const panelColor = point.chatPanelColor || 'rgba(251, 248, 241, 0.97)';
  const textColor = point.chatTextColor || '#2F2924';
  const mutedColor = point.chatMutedTextColor || '#82776D';
  const chatFontSize = Math.min(24, Math.max(16, Number(point.chatFontSize) || 17));
  const smallFontSize = Math.max(13, chatFontSize - 3);
  const tinyFontSize = Math.max(12, chatFontSize - 4);
  const configuredQuickPrompts = (point.quickPrompts || []).filter(Boolean);
  const candidateQuickPrompts = configuredQuickPrompts.length ? configuredQuickPrompts : profile.prompts;
  const supportedQuickPrompts = profile.mode === 'assessment'
    ? candidateQuickPrompts.filter(prompt => !/(?:复习刚才的错题|解释上一道错题|给我一份复习建议)/.test(prompt))
    : candidateQuickPrompts;
  const quickPrompts = supportedQuickPrompts.length ? supportedQuickPrompts : profile.prompts;
  const welcome = point.ragflow?.welcomeMessage || `你好，我是${point.ragflow?.title || point.name}。${profile.subtitle}`;
  const conversationAgentId: DigitalHumanId = point.id === 'muxiaowen' || point.id === 'muxiaoce' || point.id === 'muxiaozhi'
    ? point.id
    : 'muxiaozhi';
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState(() => getAgentConversationDraft(conversationAgentId));
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [carouselOpen, setCarouselOpen] = useState(true);
  const [assessmentView, setAssessmentView] = useState<'quiz' | 'chat'>('quiz');
  const [chapterView, setChapterView] = useState<'chapter' | 'chat'>('chat');
  const abortRef = useRef<AbortController | null>(null);
  const streamingRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const rawCarouselPos = point.carouselPosition;
  const configuredCarouselPosition: CarouselPosition = typeof rawCarouselPos === 'string' ? rawCarouselPos : 'above';
  const compactCultureCarousel = profile.mode === 'culture-guide';
  const carouselPosition: CarouselPosition = configuredCarouselPosition;
  const carouselAlign = point.carouselAlign || (compactCultureCarousel ? 'center' : 'left');
  const carouselImages: CarouselImage[] = point.carouselEnabled !== false ? (point.carouselImages ?? []) : [];
  const showCarousel = carouselImages.length > 0;

  const updateInput = (value: string) => {
    setInput(value);
    setAgentConversationDraft(conversationAgentId, value);
  };

  useEffect(() => { streamingRef.current = streaming; }, [streaming]);

  useEffect(() => {
    setInput(getAgentConversationDraft(conversationAgentId));
    return subscribeAgentConversationDraft(
      conversationAgentId,
      value => setInput(current => current === value ? current : value),
    );
  }, [conversationAgentId]);

  useEffect(() => {
    let disposed = false;
    let requestController: AbortController | null = null;

    const synchronize = async () => {
      if (streamingRef.current) return;
      requestController?.abort();
      requestController = new AbortController();
      try {
        const conversation = await fetchAgentConversation(conversationAgentId, requestController.signal);
        if (!disposed) setMessages(sharedMessagesToPortal(conversationAgentId, welcome, conversation.messages));
      } catch (syncError: any) {
        if (syncError?.name !== 'AbortError') console.warn('[AgentConversation] Portal sync failed:', syncError);
      }
    };

    shouldAutoScrollRef.current = true;
    setMessages([{ id: `welcome-${conversationAgentId}`, role: 'assistant', text: welcome }]);
    void synchronize();
    const timer = window.setInterval(() => void synchronize(), 2000);
    return () => {
      disposed = true;
      requestController?.abort();
      window.clearInterval(timer);
    };
  }, [conversationAgentId, welcome]);
  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    requestAnimationFrame(() => {
      const list = listRef.current;
      if (list) list.scrollTop = list.scrollHeight;
    });
  }, [messages]);

  const handleListScroll = () => {
    const list = listRef.current;
    if (!list) return;
    shouldAutoScrollRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 64;
  };

  const resetMessages = async () => {
    shouldAutoScrollRef.current = true;
    setMessages([{ id: `welcome-${conversationAgentId}`, role: 'assistant', text: welcome }]);
    setError(null);
    try {
      await clearAgentConversation(conversationAgentId);
    } catch (resetError: any) {
      setError(resetError?.message || '清空会话失败');
    }
  };

  const sendMessage = async (preset?: string) => {
    const question = String(preset ?? input).trim();
    if (!question || streaming) return;
    const userMsg: Msg = { id: `u-${Date.now()}`, role: 'user', text: question };
    const assistantId = `a-${Date.now()}`;
    shouldAutoScrollRef.current = true;
    setMessages((current) => [...current, userMsg, { id: assistantId, role: 'assistant', text: '', pending: true }]);
    updateInput(''); streamingRef.current = true; setStreaming(true); onStreamingChange?.(true); setError(null);
    abortRef.current = new AbortController();
    try {
      let fullAnswer = '';
      const response = await ragflowChat(
        question, point,
        (chunk) => {
          fullAnswer += chunk;
          setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, text: message.text + chunk, pending: false } : message));
          onAssistantChunk?.(chunk, fullAnswer);
        },
        abortRef.current.signal,
        messages.filter((message) => (message.role === 'user' || message.role === 'assistant') && !message.id.startsWith('welcome-'))
          .map((message) => ({ role: message.role as 'user' | 'assistant', content: message.text })),
        undefined,
        getChatClientId(),
        userMsg.id,
      );
      setMessages((current) => current.map((message) => message.id === assistantId ? {
        ...message,
        id: response.conversationMessageId || message.id,
        pending: false,
        modelBased: (response as any).modelBased === true,
        evidence: response,
      } : message));
      if (fullAnswer.trim()) onAssistantReply?.(fullAnswer.trim());
    } catch (requestError: any) {
      if (requestError.name !== 'AbortError') {
        setError(requestError.message);
        setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, text: `${message.text}\n\n[错误] ${requestError.message}`, pending: false } : message));
      }
    } finally {
      streamingRef.current = false; setStreaming(false); onStreamingChange?.(false); abortRef.current = null;
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); }
  };

  const runQuickPrompt = (prompt: string) => {
    if (profile.mode === 'assessment' && /(?:开始|进入|来一组).*(?:测验|小测)|在线测验/.test(prompt)) {
      setAssessmentView('quiz');
      return;
    }
    void sendMessage(prompt);
  };

  const collapseButton = (
    <button type="button" onClick={() => setCarouselOpen((value) => !value)} title={carouselOpen ? '收起知识画廊' : '展开知识画廊'}
      className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors"
      style={{ color: carouselOpen ? textColor : '#FFFFFF', background: carouselOpen ? 'rgba(255,255,255,0.78)' : accent, border: `1px solid ${accent}55`, boxShadow: '0 2px 8px rgba(71,56,43,0.12)', fontSize: `${smallFontSize}px` }}>
      {carouselOpen ? '收起' : '展开'} {carouselOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
    </button>
  );

  const renderEvidence = (evidence?: AgentChatResponse) => {
    // 没有检索结果时不显示空证据卡片（避免出现"0 条 / 本轮没有可展示的来源条目"噪音）
    if (!evidence || !evidence.evidenceCount) return null;
    const isWeb = evidence.source === 'web';
    return (
      <div className="mt-3 rounded-xl p-2.5" style={{ background: 'rgba(243,239,229,0.9)', border: `1px solid ${accent}44` }}>
        <div className="flex items-center gap-1.5 font-semibold" style={{ color: isWeb ? '#58738B' : accent, fontSize: `${smallFontSize}px` }}>
          {isWeb ? <Globe2 size={13} /> : <ShieldCheck size={13} />}
          {isWeb ? '可信网页补检' : '知识库证据'} · {evidence.evidenceCount} 条
          <span className="ml-auto font-normal" style={{ color: mutedColor }}>{evidence.model}</span>
        </div>
        {evidence.sources.length > 0 ? <div className="mt-2 space-y-1.5">{evidence.sources.map((source, index) => (
          <div key={source.id || index} className="rounded-lg px-2.5 py-2" style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(91,75,60,0.09)' }}>
            <div className="flex items-start gap-2">
              <span className="font-mono" style={{ color: accent, fontSize: `${tinyFontSize}px` }}>[{index + 1}]</span>
              <div className="min-w-0 flex-1">
                <div className="font-medium" style={{ color: textColor, fontSize: `${smallFontSize}px` }}>{source.title}</div>
                {source.chapter && <div className="mt-0.5" style={{ color: '#8C6535', fontSize: `${tinyFontSize}px` }}>章节：{source.chapter}</div>}
                {source.excerpt && <div className="mt-1 line-clamp-3 leading-relaxed" style={{ color: mutedColor, fontSize: `${smallFontSize}px` }}>{source.excerpt}</div>}
                {source.url && <a href={source.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 break-all underline" style={{ color: '#52694B', fontSize: `${smallFontSize}px` }}><ExternalLink size={12} />{source.url}</a>}
              </div>
            </div>
          </div>
        ))}</div> : <div className="mt-1.5" style={{ color: mutedColor, fontSize: `${smallFontSize}px` }}>本轮没有可展示的来源条目。</div>}
        {evidence.warning && <div className="mt-1.5" style={{ color: '#9A6D36', fontSize: `${smallFontSize}px` }}>状态：{evidence.warning}</div>}
      </div>
    );
  };

  const renderMessageList = (inline = false) => (
    <div ref={listRef} onScroll={handleListScroll} className={`chat-list flex-1 overflow-y-auto min-h-0 ${inline ? 'px-4 pb-3' : 'px-4 py-3'} space-y-3`}>
      {messages.map((message) => <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
        <div className="max-w-[88%] rounded-2xl px-3.5 py-2.5 leading-relaxed"
          style={message.role === 'user' ? { background: accent, color: '#fff', borderRadius: '16px 16px 5px 16px', boxShadow: `0 5px 16px ${accent}24`, fontSize: `${chatFontSize}px` } : { background: 'rgba(255,255,255,0.86)', color: textColor, border: '1px solid rgba(91,75,60,0.13)', borderRadius: '5px 16px 16px 16px', boxShadow: '0 5px 18px rgba(71,56,43,0.06)', fontSize: `${chatFontSize}px` }}>
          {message.text ? <PortalAnswerContent content={message.text} accent={accent} fontSize={chatFontSize} /> : (message.pending ? <span style={{ color: mutedColor }}>正在查找相关内容…</span> : '')}
          {message.modelBased === true && (
            <div className="mt-2 flex items-center gap-1.5" style={{ color: '#b06b25', fontSize: `${smallFontSize}px`, fontWeight: 600 }}>
              <AlertTriangle size={12} /> 此回答基于模型自己的回答，请仔细辨明
            </div>
          )}
          {renderEvidence(message.evidence)}
        </div>
      </div>)}
      {error && <div className="rounded-lg px-3 py-2" style={{ color: '#A2473F', background: 'rgba(162,71,63,0.1)', border: '1px solid rgba(162,71,63,0.2)', fontSize: `${smallFontSize}px` }}>{error}</div>}
    </div>
  );

  const renderInput = () => (
    <div className="flex-shrink-0" style={{ borderTop: '1px solid rgba(91,75,60,0.12)', background: 'rgba(247,243,234,0.76)' }}>
      <div className="flex items-end gap-2 p-3 pt-2">
        <textarea value={input} onChange={(event) => updateInput(event.target.value)} onKeyDown={handleKeyDown}
          placeholder={`向${point.ragflow?.title || point.name || '数字人'}提问…`}
          className="min-h-[54px] flex-1 resize-none rounded-xl px-3 py-2 outline-none" style={{ background: 'rgba(255,255,255,0.9)', color: textColor, border: `1px solid ${accent}55`, boxShadow: 'inset 0 1px 2px rgba(71,56,43,0.04)', fontSize: `${chatFontSize}px` }} rows={2} disabled={streaming} />
        {streaming ? <button type="button" onClick={() => abortRef.current?.abort()} className="flex h-11 items-center gap-1 rounded-xl bg-red-500 px-3 text-white" style={{ fontSize: `${smallFontSize}px` }}><Square size={14} />停止</button>
          : <button type="button" onClick={() => void sendMessage()} disabled={!input.trim()} className="flex h-11 items-center gap-1 rounded-xl px-3 font-semibold text-white disabled:opacity-35" style={{ background: accent, fontSize: `${smallFontSize}px` }}><Send size={14} />发送</button>}
      </div>
    </div>
  );

  const renderCarouselHeader = (label: string) => <div className="flex items-center justify-between gap-2 px-3 py-2" style={{ borderBottom: carouselOpen ? '1px solid rgba(91,75,60,0.1)' : 'none' }}>
    <span className="flex min-w-0 items-center gap-1.5 font-medium" style={{ color: textColor, fontSize: `${smallFontSize}px` }}><Images size={15} style={{ color: accent }} /><span className="truncate">知识画廊 · {carouselImages.length} 张</span><span className="shrink-0" style={{ color: mutedColor, fontSize: `${tinyFontSize}px` }}>（{label}）</span></span>{collapseButton}
  </div>;

  const renderFixedCarousel = (label: string, fixedHeight: number) => <div className="flex-shrink-0" style={{ borderBottom: '1px solid rgba(91,75,60,0.1)' }}>
    {renderCarouselHeader(label)}{carouselOpen && <div className="flex px-3 pb-3 pt-2" style={{ justifyContent: carouselAlign === 'center' ? 'center' : carouselAlign === 'right' ? 'flex-end' : 'flex-start' }}><ImageCarousel images={carouselImages} fixedHeight={compactCultureCarousel ? 132 : fixedHeight} compact={compactCultureCarousel} /></div>}
  </div>;

  const renderSide = (side: 'left' | 'right') => {
    const gallery = <div className="flex min-h-0 flex-col transition-all" style={{ flex: carouselOpen ? '1 1 48%' : '0 0 132px', borderRight: side === 'left' ? '1px solid rgba(91,75,60,0.1)' : undefined, borderLeft: side === 'right' ? '1px solid rgba(91,75,60,0.1)' : undefined }}>
      {renderCarouselHeader(side === 'left' ? '左侧' : '右侧')}{carouselOpen && <div className="min-h-0 flex-1 p-3"><ImageCarousel images={carouselImages} fillHeight /></div>}
    </div>;
    const conversation = <div className="flex min-w-0 flex-1 flex-col">{renderMessageList()}{renderInput()}</div>;
    return <div className="flex min-h-0 flex-1">{side === 'left' ? <>{gallery}{conversation}</> : <>{conversation}{gallery}</>}</div>;
  };

  const roleIcon = profile.mode === 'assessment' ? <ClipboardCheck size={16} /> : profile.mode === 'language-learning' ? <GraduationCap size={16} /> : profile.mode === 'culture-guide' ? <BookOpen size={16} /> : <ShieldCheck size={16} />;
  const quizEnabled = profile.mode === 'assessment' && point.quizEnabled !== false;
  const chapterEnabled = profile.mode === 'language-learning';
  const hasSwitch = quizEnabled || chapterEnabled;
  const showChat = (!quizEnabled || assessmentView === 'chat') && (!chapterEnabled || chapterView === 'chat');
  const renderConversation = () => <>
    {!showCarousel && <>{renderMessageList()}{renderInput()}</>}
    {showCarousel && carouselPosition === 'above' && <>{renderFixedCarousel('顶部', 176)}{renderMessageList()}{renderInput()}</>}
    {showCarousel && carouselPosition === 'below' && <>{renderMessageList()}{renderFixedCarousel('底部', 176)}{renderInput()}</>}
    {showCarousel && carouselPosition === 'inline' && <><div className="flex-shrink-0">{renderFixedCarousel('消息流', 220)}</div>{renderMessageList(true)}{renderInput()}</>}
    {showCarousel && (carouselPosition === 'left' || carouselPosition === 'right') && renderSide(carouselPosition)}
  </>;
  return <div className="flex h-full flex-col overflow-hidden rounded-2xl" style={{ background: panelColor, border: `1px solid ${accent}4D`, color: textColor, backdropFilter: 'blur(18px)', boxShadow: '0 22px 60px rgba(55,42,29,0.24)' }}>
    <div className="flex flex-shrink-0 items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid rgba(91,75,60,0.12)', background: 'rgba(255,252,246,0.58)' }}>
      <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${accent}22`, border: `1px solid ${accent}77`, color: accent }}>{roleIcon}</div>
      <div className="min-w-0"><div className="truncate font-semibold" style={{ fontSize: `${chatFontSize}px` }}>{point.ragflow?.title || point.name} · {profile.title}</div><div className="truncate" style={{ color: mutedColor, fontSize: `${smallFontSize}px` }}>{profile.subtitle}</div></div>
      <span className="ml-1 hidden rounded-full px-2 py-1 font-medium sm:inline" style={{ color: accent, background: `${accent}1A`, border: `1px solid ${accent}55`, fontSize: `${tinyFontSize}px` }}>{profile.badge}</span>
      {quizEnabled && <div className="ml-auto flex rounded-lg p-0.5" style={{ background: 'rgba(91,75,60,0.06)', border: '1px solid rgba(91,75,60,0.12)' }}>
        <button type="button" onClick={() => setAssessmentView('quiz')} className="flex items-center gap-1 rounded-md px-2.5 py-1.5" style={{ color: assessmentView === 'quiz' ? '#fff' : mutedColor, background: assessmentView === 'quiz' ? accent : 'transparent', fontSize: `${smallFontSize}px` }}><Trophy size={14} />在线测评</button>
        <button type="button" onClick={() => setAssessmentView('chat')} className="flex items-center gap-1 rounded-md px-2.5 py-1.5" style={{ color: assessmentView === 'chat' ? '#fff' : mutedColor, background: assessmentView === 'chat' ? accent : 'transparent', fontSize: `${smallFontSize}px` }}><MessageCircle size={14} />知识问答</button>
      </div>}
      {chapterEnabled && <div className="ml-auto flex rounded-lg p-0.5" style={{ background: 'rgba(91,75,60,0.06)', border: '1px solid rgba(91,75,60,0.12)' }}>
        <button type="button" onClick={() => setChapterView('chapter')} className="flex items-center gap-1 rounded-md px-2.5 py-1.5" style={{ color: chapterView === 'chapter' ? '#fff' : mutedColor, background: chapterView === 'chapter' ? accent : 'transparent', fontSize: `${smallFontSize}px` }}><BookOpen size={14} />章节课堂</button>
        <button type="button" onClick={() => setChapterView('chat')} className="flex items-center gap-1 rounded-md px-2.5 py-1.5" style={{ color: chapterView === 'chat' ? '#fff' : mutedColor, background: chapterView === 'chat' ? accent : 'transparent', fontSize: `${smallFontSize}px` }}><MessageCircle size={14} />知识问答</button>
      </div>}
      {showChat && <button type="button" onClick={resetMessages} className={hasSwitch ? 'rounded-lg px-2.5 py-1.5 font-medium' : 'ml-auto rounded-lg px-2.5 py-1.5 font-medium'} style={{ color: '#A2473F', background: 'rgba(162,71,63,0.08)', border: '1px solid rgba(162,71,63,0.22)', fontSize: `${smallFontSize}px` }}>清空</button>}
    </div>
    {quizEnabled && assessmentView === 'quiz' ? <KnowledgeQuiz point={point} /> : chapterEnabled && chapterView === 'chapter' ? <ChapterLearningPage onBack={() => setChapterView('chat')} /> : renderConversation()}
  </div>;
}
