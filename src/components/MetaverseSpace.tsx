import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpenCheck,
  Bot,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Database,
  ExternalLink,
  FileText,
  FolderOpen,
  Home,
  Images,
  LibraryBig,
  LoaderCircle,
  MapPinned,
  PlayCircle,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { apiUrl } from '../api-config';
import { DIGITAL_HUMANS, type DigitalHumanId } from '../digital-humans';

interface EvidenceSource {
  id: string;
  title: string;
  excerpt: string;
  similarity?: number;
  url?: string;
  domain?: string;
}

interface SceneMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  source?: 'ragflow' | 'local' | 'web' | 'qwen';
  evidenceCount?: number;
  model?: string;
  sources?: EvidenceSource[];
  modelBased?: boolean;
}

interface SceneDefinition {
  title: string;
  subtitle: string;
  building: string;
  background: string;
  position: { x: number; y: number };
  welcome: string;
  placeholder: string;
  suggestions: string[];
  icon: typeof BookOpenCheck;
  resources?: SceneResource[];
  gallery?: SceneGalleryItem[];
}

interface SceneResource {
  title: string;
  description: string;
  kind: 'document' | 'video';
  url: string;
}

interface SceneGalleryItem {
  title: string;
  image: string;
  description: string;
  sourceName: string;
  sourceUrl: string;
}

const SCENES: Record<DigitalHumanId, SceneDefinition> = {
  muxiaowen: {
    title: '木小文 · 主题学习馆',
    subtitle: '知识讲解、学习规划与循序跟练',
    building: '主题学习',
    background: '/metaverse/muxiaowen-bg.png',
    position: { x: 50, y: 67 },
    welcome: '欢迎来到主题学习馆。我是木小文，告诉我想学习的主题，我会先检索 muya 知识库，再为你设计讲解和跟练。',
    placeholder: '例如：请带我学习“日月”主题，并设计一组跟练……',
    suggestions: ['带我学习“日月”主题', '讲解三个容易混淆的词汇', '安排一节 10 分钟主题课'],
    icon: BookOpenCheck,
  },
  muxiaoce: {
    title: '木小测 · 智能测评馆',
    subtitle: '循证出题、答案批改与薄弱点诊断',
    building: '智能测评',
    background: '/metaverse/muxiaoce-bg.png',
    position: { x: 19, y: 67 },
    welcome: '欢迎来到智能测评馆。我是木小测，请告诉我主题和题量，我会依据 RAGFlow 检索证据出题、批改并分析薄弱点。',
    placeholder: '例如：根据“人体部位”主题给我出 5 道选择题……',
    suggestions: ['生成 5 道“人体部位”选择题', '开始“日月”主题闯关', '根据我的答案分析错因'],
    icon: ClipboardCheck,
    resources: [
      { title: '木雅语单项选择题专项卷', description: '用于课堂测评和课后自测', kind: 'document', url: '/metaverse/resources/single-choice-practice.pdf' },
      { title: '单项选择题参考答案', description: '专项卷答案与核对依据', kind: 'document', url: '/metaverse/resources/single-choice-answers.pdf' },
      { title: '词汇巩固测试 A 卷', description: '木雅语词汇阶段测试', kind: 'document', url: '/metaverse/resources/vocabulary-a.pdf' },
      { title: '词汇巩固测试 B 卷', description: '木雅语词汇进阶测试', kind: 'document', url: '/metaverse/resources/vocabulary-b.pdf' },
      { title: '词汇巩固测试参考答案', description: 'A/B 卷参考答案', kind: 'document', url: '/metaverse/resources/vocabulary-answers.pdf' },
      { title: '木雅语教学视频', description: '同门最终版配套视频资源', kind: 'video', url: '/metaverse/resources/assessment-video.mp4' },
    ],
  },
  muxiaozhi: {
    title: '木小知 · 知识探索馆',
    subtitle: '资料检索、知识问答与来源追溯',
    building: '知识探索',
    background: '/metaverse/muxiaozhi-bg.jpg',
    position: { x: 78, y: 67 },
    welcome: '欢迎来到知识探索馆。我是木小知，直接提出木雅语知识问题，我会检索 RAGFlow，并展示回答依据。',
    placeholder: '例如：知识库中“季节天气”包含哪些相关表达？',
    suggestions: ['查询“季节天气”相关表达', '列出“亲友”主题核心词汇', '比较两个词汇的含义与用法'],
    icon: LibraryBig,
    gallery: [
      {
        title: '木雅分布区域',
        image: '/metaverse/resources/muya-distribution.jpg',
        description: '木雅人主要分布在甘孜州康定市折多山以西、雅砻江以东等区域，大致围绕贡嘎山分布。',
        sourceName: '甘孜州人民政府网《木雅文化》',
        sourceUrl: 'https://www.gzz.gov.cn/mfms/article/72457',
      },
      {
        title: '贡嘎山——木雅圣山',
        image: '/metaverse/resources/gongga.webp',
        description: '贡嘎山海拔 7556 米，是横断山脉大雪山的主峰，被誉为“蜀山之王”，也是木雅人的圣山。',
        sourceName: '康定市人民政府网《城市建设》栏目',
        sourceUrl: 'https://www.kangding.gov.cn/kdcsjs/article/107034',
      },
      {
        title: '木雅金塔（木雅尊胜塔）',
        image: '/metaverse/resources/jinta.webp',
        description: '木雅金塔位于康定市塔公乡境内，是一座坛城式佛教寺庙建筑。',
        sourceName: '康定市人民政府网《城市建设》栏目',
        sourceUrl: 'https://www.kangding.gov.cn/kdcsjs/article/107034',
      },
      {
        title: '木雅锅庄——国家级非遗',
        image: '/metaverse/resources/guozhuang.webp',
        description: '木雅锅庄是木雅人最具特色的舞蹈之一，已列入国家级非物质文化遗产。',
        sourceName: '游乐旅行网《木雅圣地景区》',
        sourceUrl: 'https://youletour.com/ganzizhou/mu-ya-sheng-di',
      },
      {
        title: '朋布西双碉——木雅古碉楼',
        image: '/metaverse/resources/pengbuxi-towers.jpeg',
        description: '朋布西双碉经测定有 800 年以上历史，是木雅地区高碉文化的代表。',
        sourceName: '百度百科《木雅之地》',
        sourceUrl: 'https://baike.baidu.com/item/%E6%9C%A8%E9%9B%85%E4%B9%8B%E5%9C%B0/23072001',
      },
    ],
  },
};

const MAP_ORDER: DigitalHumanId[] = ['muxiaoce', 'muxiaowen', 'muxiaozhi'];

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function historyKey(agentId: DigitalHumanId): string {
  return `muya-metaverse-scene-${agentId}`;
}

function loadSceneMessages(agentId: DigitalHumanId): SceneMessage[] {
  try {
    const value = localStorage.getItem(historyKey(agentId));
    const parsed = value ? JSON.parse(value) : null;
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {
    // 缓存损坏时使用欢迎语重新开始。
  }
  return [{ id: `welcome-${agentId}`, role: 'assistant', content: SCENES[agentId].welcome }];
}

export function MetaverseHomePage() {
  const navigate = useNavigate();

  return (
    <div className="metaverse-page metaverse-map-page">
      <div className="metaverse-map-canvas">
        <img src="/metaverse/home-bg.png" alt="" />
        <div className="metaverse-map-shade" />
        {MAP_ORDER.map(agentId => {
          const profile = DIGITAL_HUMANS[agentId];
          const scene = SCENES[agentId];
          return (
            <button
              key={agentId}
              type="button"
              className={`metaverse-hotspot metaverse-hotspot--${agentId}`}
              style={{ left: `${scene.position.x}%`, top: `${scene.position.y}%` }}
              onClick={() => navigate(`/wisdom-space/${agentId}`)}
              aria-label={`进入${scene.title}`}
            >
              <span className="metaverse-hotspot__label">
                <strong>{profile.name}</strong>
                <small>{scene.building}</small>
                <i><ChevronRight size={13} /> 点击进入</i>
              </span>
              <img src={profile.waveImage} alt={`${profile.name}挥手数字人`} />
              <span className="metaverse-hotspot__pulse" />
            </button>
          );
        })}
      </div>

      <header className="metaverse-map-header">
        <button type="button" onClick={() => navigate('/')}><ArrowLeft size={17} /> 返回木雅藏语AI助手</button>
        <div>
          <span><MapPinned size={14} /> AI 智能体沉浸式学习空间</span>
          <h1>木雅语智慧空间</h1>
          <p>选择一座场馆，与专属智能体一起学习、测评或探索知识。</p>
        </div>
        <div className="metaverse-runtime-pill"><span /> 三个智能体在线</div>
      </header>

      <div className="metaverse-map-guide">
        <span>01 选择场馆</span><i /><span>02 进入专属场景</span><i /><span>03 RAGFlow 检索后回答</span>
      </div>
    </div>
  );
}

export function MetaverseScenePage() {
  const navigate = useNavigate();
  const { agentId: rawAgentId } = useParams();
  const agentId: DigitalHumanId = (['muxiaowen', 'muxiaoce', 'muxiaozhi'] as string[]).includes(rawAgentId || '')
    ? rawAgentId as DigitalHumanId
    : 'muxiaowen';
  const profile = DIGITAL_HUMANS[agentId];
  const scene = SCENES[agentId];
  const SceneIcon = scene.icon;
  const [messages, setMessages] = useState<SceneMessage[]>(() => loadSceneMessages(agentId));
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [openPanel, setOpenPanel] = useState<'resources' | 'gallery' | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(loadSceneMessages(agentId));
    setInput('');
    setError('');
    setOpenPanel(null);
  }, [agentId]);

  useEffect(() => {
    localStorage.setItem(historyKey(agentId), JSON.stringify(messages.slice(-30)));
    requestAnimationFrame(() => {
      if (messageListRef.current) messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    });
  }, [agentId, messages]);

  const latestEvidence = useMemo(
    () => [...messages].reverse().find(message => message.role === 'assistant' && message.evidenceCount !== undefined),
    [messages],
  );

  const resetConversation = () => {
    setMessages([{ id: `welcome-${agentId}`, role: 'assistant', content: scene.welcome }]);
    setError('');
  };

  const sendMessage = async (preset?: string) => {
    const content = String(preset ?? input).trim();
    if (!content || isLoading) return;

    const history = messages.slice(-8).map(message => ({ role: message.role, content: message.content }));
    setMessages(current => [...current, { id: makeId('user'), role: 'user', content }]);
    setInput('');
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch(apiUrl('/api/agent-chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentType: agentId, message: content, history }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || `请求失败（${response.status}）`);

      setMessages(current => [...current, {
        id: makeId('assistant'),
        role: 'assistant',
        content: String(payload.answer || '没有生成可用回答'),
        source: payload.source,
        evidenceCount: Number(payload.evidenceCount || 0),
        model: payload.model,
        sources: Array.isArray(payload.sources) ? payload.sources : [],
        modelBased: payload.modelBased === true,
      }]);
    } catch (requestError: any) {
      setError(requestError?.message || '智能体服务暂时不可用');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`metaverse-page metaverse-scene metaverse-scene--${agentId}`}>
      <div className="metaverse-scene__background" aria-hidden="true">
        <img src={scene.background} alt="" />
        <div />
      </div>

      <header className="metaverse-scene__topbar">
        <div className="metaverse-scene__nav">
          <button type="button" onClick={() => navigate('/wisdom-space')}><ArrowLeft size={16} /> 返回智慧空间</button>
          <button type="button" onClick={() => navigate('/')}><Home size={15} /> 木雅藏语AI助手</button>
        </div>
        <div className="metaverse-scene__title">
          <span><SceneIcon size={14} /> 专属智能体场景</span>
          <h1>{scene.title}</h1>
          <p>{scene.subtitle}</p>
        </div>
        <div className="metaverse-scene__runtime">
          <span><Database size={13} /> RAGFlow</span>
          <span><Sparkles size={13} /> DeepSeek-V3</span>
          <span><ShieldCheck size={13} /> 来源透明</span>
          {!!scene.resources?.length && (
            <button type="button" onClick={() => setOpenPanel('resources')}>
              <FolderOpen size={13} /> 测评资源
            </button>
          )}
          {!!scene.gallery?.length && (
            <button type="button" onClick={() => setOpenPanel('gallery')}>
              <Images size={13} /> 知识画廊
            </button>
          )}
        </div>
      </header>

      <section className="metaverse-scene__human" aria-label={`${profile.name}数字人`}>
        <div className="metaverse-scene__speech">
          <Bot size={15} />
          <span>{isLoading ? '正在检索知识库并组织回答……' : `你好，我是${profile.name}，在这里等你。`}</span>
        </div>
        <img src={isLoading ? profile.speakImage : profile.waveImage} alt={`${profile.name}数字人`} />
        <div className="metaverse-scene__human-name">
          <strong>{profile.name}</strong><span>{profile.role}</span>
        </div>
      </section>

      <section className="metaverse-chat-panel">
        <header className="metaverse-chat-panel__header">
          <div><span className={isLoading ? 'is-thinking' : ''} /><p><strong>{profile.name}</strong><small>{isLoading ? '检索与生成中' : '在线 · 有依据地回答'}</small></p></div>
          <button type="button" onClick={resetConversation}><RotateCcw size={14} /> 新任务</button>
        </header>

        <div className="metaverse-chat-panel__suggestions">
          {!!scene.resources?.length && (
            <button className="is-resource" type="button" onClick={() => setOpenPanel('resources')}><FolderOpen size={12} /> 打开测评资源</button>
          )}
          {!!scene.gallery?.length && (
            <button className="is-resource" type="button" onClick={() => setOpenPanel('gallery')}><Images size={12} /> 打开知识画廊</button>
          )}
        </div>

        <div ref={messageListRef} className="metaverse-chat-panel__messages">
          {messages.map(message => (
            <article key={message.id} className={`metaverse-scene-message metaverse-scene-message--${message.role}`}>
              {message.role === 'assistant' && <img src={profile.waveImage} alt="" />}
              <div>
                <span>{message.role === 'assistant' ? profile.name : '我'}</span>
                <p>{message.content}</p>
                {message.modelBased === true && (
                  <small style={{ color: '#b06b25', fontWeight: 600 }}><AlertTriangle size={11} /> 此回答基于模型自己的回答，请仔细辨明</small>
                )}
                {message.evidenceCount !== undefined && (
                  <small><Database size={11} /> {message.source === 'qwen'
                    ? `模型通用知识 · 可信来源未直接命中 · ${message.model || 'DeepSeek-V3'}`
                    : `${message.source === 'ragflow' ? 'RAGFlow' : message.source === 'web' ? '可信网页' : '本地库'}命中 ${message.evidenceCount} 条 · ${message.model || '证据直出'}`}</small>
                )}
              </div>
            </article>
          ))}
          {isLoading && (
            <article className="metaverse-scene-message metaverse-scene-message--assistant">
              <img src={profile.speakImage} alt="" />
              <div><span>{profile.name}</span><p className="metaverse-scene-thinking"><LoaderCircle size={14} /> 正在执行“检索 → 核验 → 生成”……</p></div>
            </article>
          )}
        </div>

        {latestEvidence && ((latestEvidence.evidenceCount ?? 0) > 0 || latestEvidence.source === 'qwen') && (
          <details className={`metaverse-evidence ${latestEvidence.evidenceCount ? 'has-evidence' : ''}`}>
            <summary>
              {latestEvidence.evidenceCount ? <CheckCircle2 size={14} /> : <ShieldCheck size={14} />}
              <span>{latestEvidence.source === 'qwen'
                ? '本轮来自模型通用知识（可信来源未直接命中）'
                : `查看本轮 ${latestEvidence.evidenceCount} 条检索依据`}</span>
              <ChevronRight size={13} />
            </summary>
            <div>
              {(latestEvidence.sources || []).map((source, index) => (
                <article key={source.id || `${source.title}-${index}`}>
                  <FileText size={12} /><p><strong>{source.title}</strong><span>{source.excerpt}</span></p>
                  {typeof source.similarity === 'number' && <small>{(source.similarity * 100).toFixed(1)}%</small>}
                  {source.url && <a href={source.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={11} /> {source.url}</a>}
                </article>
              ))}
              {!latestEvidence.sources?.length && <p className="metaverse-evidence__empty">{latestEvidence.source === 'qwen'
                ? '知识库和可信网页未能直接回答，本轮已明确标注为模型通用知识。'
                : '没有可展示的来源片段。'}</p>}
            </div>
          </details>
        )}

        {error && <div className="metaverse-chat-panel__error">{error}</div>}

        <div className="metaverse-chat-panel__composer">
          <textarea
            value={input}
            rows={2}
            placeholder={scene.placeholder}
            disabled={isLoading}
            onChange={event => setInput(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
              }
            }}
          />
          <button type="button" disabled={isLoading || !input.trim()} onClick={() => sendMessage()} aria-label="发送">
            {isLoading ? <LoaderCircle size={18} /> : <Send size={18} />}
          </button>
          <small><ShieldCheck size={11} /> 知识库优先；零命中时使用千问并明确标注来源</small>
        </div>
      </section>

      {openPanel && (
        <div className="metaverse-resource-overlay" role="presentation" onMouseDown={() => setOpenPanel(null)}>
          <section
            className="metaverse-resource-panel"
            role="dialog"
            aria-modal="true"
            aria-label={openPanel === 'resources' ? '测评资源' : '知识画廊'}
            onMouseDown={event => event.stopPropagation()}
          >
            <header>
              <div>
                {openPanel === 'resources' ? <FolderOpen size={18} /> : <Images size={18} />}
                <p><strong>{openPanel === 'resources' ? '测评与课程资源' : '木雅知识画廊'}</strong><span>内容来自同门最终版</span></p>
              </div>
              <button type="button" onClick={() => setOpenPanel(null)} aria-label="关闭"><X size={18} /></button>
            </header>

            {openPanel === 'resources' && (
              <div className="metaverse-resource-list">
                {(scene.resources || []).map(resource => resource.kind === 'video' ? (
                  <article key={resource.url} className="metaverse-resource-item metaverse-resource-item--video">
                    <PlayCircle size={20} />
                    <div><strong>{resource.title}</strong><span>{resource.description}</span></div>
                    <video src={resource.url} controls preload="metadata" />
                  </article>
                ) : (
                  <a key={resource.url} className="metaverse-resource-item" href={resource.url} target="_blank" rel="noreferrer">
                    <FileText size={20} />
                    <div><strong>{resource.title}</strong><span>{resource.description}</span></div>
                    <ExternalLink size={15} />
                  </a>
                ))}
              </div>
            )}

            {openPanel === 'gallery' && (
              <div className="metaverse-gallery-grid">
                {(scene.gallery || []).map(item => (
                  <article key={item.title}>
                    <img src={item.image} alt={item.title} />
                    <div><strong>{item.title}</strong><p>{item.description}</p>
                      <a href={item.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={12} /> {item.sourceName}</a>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
