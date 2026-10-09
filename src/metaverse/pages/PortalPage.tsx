// 跳转子页面：背景图 + 左下角挥手数字人 + 底部 RAGFlow 聊天
// 用户态无配置入口；配置全部在 /config 页面完成（首页已删「调整布局」浮动按钮）
//
// 顶部三栏（按 point.showTopBar 控制整体显示/隐藏）：
//   左侧    → 返回地图按钮
//   中间    → 居中的红色背景标签（point.topBarTitle，可配置文字和颜色，参考图2风格）
//   右侧    → 工具按钮区（point.topBarTools，可配置，可启用/禁用）
//
// showTopBarTools（默认 true）单独控制右侧工具按钮区的显示，与左上返回按钮互不影响
//
// 「空间功能按钮」(actionButtons) 设计：
//   - 每个按钮 action=resources / video / document 时，点开打开该按钮独立的 files 面板
//   - 互不共享文件池：muxiaoce 的视频按钮只看到 muxiaoce 的视频，muxiaozhi 的文件按钮只看到 muxiaozhi 的文件
//   - 兼容旧配置：自动把 point.resources 迁移到第一个 resources 按钮的 files
//
// 「图片轮播」（知识画廊）已迁移到 ChatPanel 内部顶部，与消息列表一体呈现
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getPortal } from '../api';
import type { PortalPoint, SpaceResource, SpaceActionButton, TopBarTool } from '../types';
import ChatPanel from '../components/ChatPanel';
import LoadingScreen, { useFadeOutOverlay } from '../components/LoadingScreen';
import { useAssetPreload } from '../hooks/useAssetPreload';
import { ChapterLearningPage } from '../../components/ChapterLearningPage';
import { createStreamingSpeaker, speakAnswer, stopSpeech, type StreamingSpeechController } from '../speech';
import { AlertCircle, ArrowLeft, Settings, Volume2, Info, Home as HomeIcon, FileText, Film, Download, X, Paperclip, ImageIcon, BookOpen } from 'lucide-react';
import { ActionButtonIcon } from '../components/ActionButtonIcon';

// 内置工具图标映射
function ToolIcon({ name, size = 18 }: { name: string; size?: number }) {
  switch (name) {
    case 'audio': return <Volume2 size={size} />;
    case 'info': return <Info size={size} />;
    case 'back': return <ArrowLeft size={size} />;
    case 'home': return <HomeIcon size={size} />;
    case 'settings': return <Settings size={size} />;
    default:
      // 自定义：当成 emoji 或文字直接显示
      return <span style={{ fontSize: size - 4, lineHeight: 1 }}>{name}</span>;
  }
}

// 处理工具按钮的点击行为
function handleToolAction(
  tool: TopBarTool,
  nav: ReturnType<typeof useNavigate>,
  onAudio: () => void,
) {
  switch (tool.type) {
    case 'back':
      nav(-1);
      break;
    case 'home':
      nav('/wisdom-space');
      break;
    case 'link':
      if (tool.target) {
        if (/^https?:/i.test(tool.target)) {
          window.open(tool.target, '_blank', 'noopener,noreferrer');
        } else {
          nav(tool.target.startsWith('/portal/') ? `/wisdom-space${tool.target}` : tool.target);
        }
      }
      break;
    case 'audio':
      onAudio();
      break;
    case 'info':
    case 'settings':
    default:
      // 占位行为：弹一个简单 tooltip，真实场景可换成音频播放/弹窗
      // eslint-disable-next-line no-console
      console.log('[PortalPage] tool action:', tool.type, tool.label);
  }
}

// 处理空间功能按钮（actionButtons）的点击行为
// 新方案：每个按钮有独立的 files 池，「打开资源面板」按 btn.files 渲染
function handleSpaceAction(
  btn: SpaceActionButton,
  nav: ReturnType<typeof useNavigate>,
  onOpenResources: (files: SpaceResource[]) => void,
  onOpenChapterLearning: () => void,
  onAudio: () => void,
) {
  switch (btn.action) {
    case 'resources':
    case 'video':
    case 'document':
      // 把按钮的独立 files 传出去，PortalPage 用它打开资源面板
      onOpenResources(btn.files || []);
      break;
    case 'chapter-learning':
      // 打开章节学习面板（仅木小文空间）
      onOpenChapterLearning();
      break;
    case 'link':
      if (btn.target) {
        if (/^https?:/i.test(btn.target)) {
          window.open(btn.target, '_blank', 'noopener,noreferrer');
        } else {
          nav(btn.target.startsWith('/portal/') ? `/wisdom-space${btn.target}` : btn.target);
        }
      }
      break;
    case 'audio':
      onAudio();
      break;
    case 'info':
    case 'custom':
    default:
      // eslint-disable-next-line no-console
      console.log('[PortalPage] space action:', btn.action, btn.label);
  }
}

export default function PortalPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();

  const [point, setPoint] = useState<PortalPoint | null>(null);
  const [bgUrl, setBgUrl] = useState<string>('');
  const [bgFallback, setBgFallback] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // AI 是否正在聊天框作答（true=数字人用 speak GIF，false=用 wave GIF）
  const [speaking, setSpeaking] = useState(false);
  const [audioSpeaking, setAudioSpeaking] = useState(false);
  const [lastAssistantAnswer, setLastAssistantAnswer] = useState('');
  const streamSpeakerRef = useRef<StreamingSpeechController | null>(null);
  // 当前打开的资源面板对应的「按钮的 files 池」（不再使用共享的 point.resources）
  const [panelFiles, setPanelFiles] = useState<SpaceResource[] | null>(null);
  const [activeResource, setActiveResource] = useState<SpaceResource | null>(null);
  // 章节学习面板（仅木小文空间）
  const [showChapterLearning, setShowChapterLearning] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = async (initial = false) => {
      try {
        const r = (await getPortal(id)) as { point: PortalPoint; defaultPortalBg: string };
        if (cancelled) return;
        setPoint(r.point);
        setBgUrl(r.point.portalBg || r.defaultPortalBg);
        setBgFallback(false);
        setError(null);
      } catch (e: any) {
        if (initial && !cancelled) setError(e.message);
      } finally {
        if (initial && !cancelled) setLoading(false);
      }
    };
    void load(true);
    const timer = window.setInterval(() => void load(false), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [id]);

  useEffect(() => () => {
    streamSpeakerRef.current?.cancel();
    streamSpeakerRef.current = null;
    stopSpeech();
  }, []);

  // ===== 资源预加载：空间背景 + 数字人说话/挥手两个 GIF =====
  // 拿到场景数据后先预取大图，全部就绪（或 20 秒超时兜底）后再淡入场景，
  // 避免弱网（cpolar 公网隧道）下先黑屏、背景慢慢刷出来的问题。
  const preloadUrls = useMemo(() => {
    const arr: string[] = [];
    if (bgUrl) arr.push(bgUrl);
    if (point?.gifUrl) arr.push(point.gifUrl);
    if (point?.waveGifUrl) arr.push(point.waveGifUrl);
    return arr;
  }, [bgUrl, point?.gifUrl, point?.waveGifUrl]);

  const { progress: assetProgress, ready: assetsReady } = useAssetPreload(
    loading ? [] : preloadUrls,
    20000,
  );

  // 加载完成后加载页不瞬间消失，而是淡出 ~1.4s，与场景淡入交叉过渡
  const overlayPhase = useFadeOutOverlay(loading || (!assetsReady && !error));

  if (overlayPhase === 'show') {
    return (
      <LoadingScreen
        title={point?.pageTitle || point?.name || '木雅语智慧空间'}
        subtitle="正在进入数字人空间"
        progress={loading ? -1 : assetProgress}
      />
    );
  }

  if (error || !point) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-black text-white">
        <AlertCircle className="text-red-400 mb-2" />
        <div>{error || '未找到该场景'}</div>
        <button
          className="mt-4 px-4 py-2 bg-white/10 rounded hover:bg-white/20 flex items-center gap-2"
          onClick={() => nav('/wisdom-space')}
        >
          <ArrowLeft size={16} /> 返回地图
        </button>
      </div>
    );
  }

  // portal 默认位置：左下角（用户不能调整）
  const portalPos = point.portalPosition || { x: 12, y: 78 };
  const pageTitle = point.pageTitle || `${point.name} · 学习场景`;
  const portalSize = point.portalSize || 400;

  // 兼容旧配置：
  //   1. 如果已经有 actionButtons，直接用
  //   2. 如果没有但有旧 point.resources：自动生成一个默认「资源」按钮，
  //      并把旧 resources 数据迁移到该按钮的 files（保证老数据不丢）
  const effectiveButtons: SpaceActionButton[] =
    point.actionButtons && point.actionButtons.length > 0
      ? point.actionButtons
      : (point.resources && point.resources.length > 0)
        ? [
            {
              id: '__legacy_resources_btn__',
              icon: 'Paperclip',
              label: '空间资源',
              enabled: true,
              size: point.resourcesBtnSize ?? 52,
              position: point.resourcesBtnPosition ?? { x: 96, y: 50 },
              action: 'resources',
              // 把旧数据迁过来：每个按钮拥有独立的 files 池
              files: point.resources,
            },
          ]
        : [];
  const chatHeight = point.chatHeight ?? 680;

  // 顶部区域是否显示（默认 true，可由配置控制）
  const showTopBar = point.showTopBar !== false;
  // 顶部右侧工具按钮区是否显示（默认 true；只在 showTopBar=true 时生效）
  const showTopBarTools = point.showTopBarTools !== false;
  // 顶部居中标签
  const topTitle = point.topBarTitle || point.label || point.name;
  const topColor = point.topBarColor || '#C8362D';
  const topTextColor = point.topBarTextColor || '#FFFFFF';
  // 顶部右侧工具按钮（按顺序）
  const enabledTools = (point.topBarTools || []).filter((t) => t.enabled !== false);
  // 语音讲解既可以配置为顶部工具，也可以配置为空间浮动按钮。
  // 两种入口共用同一套自动朗读逻辑，不能只对某个数字人或某一种按钮生效。
  const audioEnabled =
    enabledTools.some((tool) => tool.type === 'audio' || tool.icon === 'audio') ||
    effectiveButtons.some((button) =>
      button.enabled !== false && (button.action === 'audio' || button.icon === 'audio'));
  const playAnswer = (answer?: string) => {
    if (audioSpeaking) {
      streamSpeakerRef.current?.cancel();
      streamSpeakerRef.current = null;
      stopSpeech();
      setAudioSpeaking(false);
      return;
    }
    const text = answer || lastAssistantAnswer || point.ragflow?.welcomeMessage || '';
    if (!text) return;
    setAudioSpeaking(true);
    void speakAnswer(text, point.id, {
      onStart: () => setAudioSpeaking(true),
      onEnd: () => setAudioSpeaking(false),
    }, {
      role: point.voiceRole,
      voiceName: point.voiceName,
      rate: point.voiceRate,
      pitch: point.voicePitch,
    }).then((started) => {
      if (!started) setAudioSpeaking(false);
    });
  };

  // 顶部工具按钮样式（可配置；默认值是玻璃白风，对比度更好）
  const btnBg = point.topBarButtonBg ?? 'rgba(255,255,255,0.18)';
  const btnHoverBg = point.topBarButtonHoverBg ?? 'rgba(255,255,255,0.32)';
  const btnColor = point.topBarButtonColor ?? '#FFFFFF';
  const btnBorderColor = point.topBarButtonBorderColor ?? 'rgba(255,255,255,0.45)';
  const btnSize = point.topBarButtonSize ?? 36;
  const btnShape = point.topBarButtonShape ?? 'circle';
  const btnBorderRadius = btnShape === 'circle' ? '50%' : '8px';

  // 数字人 GIF 动态切换（可在 /config 「数字人对应空间设置」中开关，默认开启）：
  //   AI 回答中（speaking=true） → gifUrl（speak 说话动画）
  //   空闲 / 回答完毕           → waveGifUrl（wave 挥手动画，未配置则 fallback 到 gifUrl）
  const speakSwitchOn = point.speakAnimEnabled !== false;
  const portableGif = (value: string | undefined, fallback: string) =>
    value && !/^(?:[a-z]:[\\/]|file:)/i.test(value) ? value : fallback;
  const speakGif = portableGif(point.gifUrl, `/digital-humans/${point.id}-speak.gif`);
  const idleGif = portableGif(point.waveGifUrl, `/digital-humans/${point.id}-wave.gif`);
  const displayGif = speakSwitchOn ? ((speaking || audioSpeaking) ? speakGif : idleGif) : speakGif;

  // 数字人缩放：根据 speak/wave 状态分别应用配置的比例
  const humanScale = (speaking || audioSpeaking) ? (point.speakScale ?? 1) : (point.waveScale ?? 1);
  // 资源面板当前打开状态：panelFiles !== null 表示打开
  const showResources = panelFiles !== null;
  const openResources = (files: SpaceResource[]) => setPanelFiles(files);
  const chatWidth = point.chatWidth ?? 820;

  return (
    <div className="w-full h-full relative bg-black overflow-hidden">
      {/* 加载页淡出覆盖层：与场景淡入交叉过渡 */}
      {overlayPhase === 'fading' && (
        <div className="absolute inset-0 z-[90] loading-fade-out">
          <LoadingScreen
            title={point?.pageTitle || point?.name || '木雅语智慧空间'}
            subtitle="正在进入数字人空间"
            progress={100}
          />
        </div>
      )}
      {/* ============ 顶部三栏（用 showTopBar 控制整块可见性） ============ */}
      {showTopBar && (
        <div
          className="absolute top-0 left-0 right-0 z-50 pointer-events-none"
          style={{
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.45), transparent)',
            height: 100,
          }}
        >
          {/* 左侧：返回按钮 */}
          <button
            onClick={() => nav('/wisdom-space')}
            className="absolute left-4 top-4 text-white/85 hover:text-white text-sm flex items-center gap-1 px-3 py-1.5 rounded bg-black/55 border border-white/15 pointer-events-auto"
          >
            <ArrowLeft size={14} /> 返回数字人主页
          </button>

          {/* 右侧：工具按钮组（可独立隐藏） */}
          {showTopBarTools && enabledTools.length > 0 && (
            <div className="absolute right-4 top-4 flex items-center gap-2 pointer-events-auto">
              {enabledTools.map((tool) => (
                <button
                  key={tool.id}
                  onClick={() => handleToolAction(tool, nav, () => playAnswer())}
                  title={tool.label}
                  className="flex items-center justify-center transition-colors"
                  style={{
                    width: btnSize,
                    height: btnSize,
                    borderRadius: btnBorderRadius,
                    background: btnBg,
                    color: btnColor,
                    border: `1px solid ${btnBorderColor}`,
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = btnHoverBg;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = btnBg;
                  }}
                >
                  <ToolIcon name={tool.icon} size={Math.round(btnSize * 0.5)} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 背景图 */}
      <div className="absolute inset-0">
        {bgFallback || !bgUrl ? (
          <div className="w-full h-full flex items-center justify-center text-white/30 text-sm">
            （未配置场景背景图）
          </div>
        ) : (
          <img
            src={bgUrl}
            alt=""
            className="w-full h-full object-cover"
            draggable={false}
            onError={() => setBgFallback(true)}
          />
        )}

        {/* 数字人 — 左下角，纯展示，不可拖拽不可点击
            GIF 用 object-fit: contain 完整显示（不裁切），portalSize 控制的是 GIF 容器的尺寸
            —— 即人物在空间页上占据的视觉空间。设计上 GIF 上下带的透明边距属于设计内容，
            不能用 object-cover 否则头脚被裁掉。
            用户可在配置页面分别调整「说话状态缩放」和「挥手状态缩放」来统一人物大小。
            key=displayGif：切换 speak/wave 时强制重建 <img>，确保 GIF 动画从头播放 */}
        <div
          style={{
            position: 'absolute',
            left: `${portalPos.x}%`,
            top: `${portalPos.y}%`,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none', // 关键：不让数字人拦截任何点击
          }}
        >
          <div
            style={{
              width: portalSize,
              height: portalSize,
              animation: 'breathe 3s ease-in-out infinite',
              // 缩放 + 垂直偏移都放在 transform 里：
              // breathe 动画只动 margin-top，不占用 transform，两者互不冲突
              transform: `scale(${humanScale}) translateY(${(speaking || audioSpeaking) ? (point.speakOffsetY ?? 0) : (point.waveOffsetY ?? 0)}px)`,
              transformOrigin: 'center center',
            }}
          >
            <img
              key={displayGif}
              src={displayGif}
              alt={point.name}
              draggable={false}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.6))',
              }}
            />
          </div>
        </div>
      </div>

      {/* 聊天面板 — 底部居中浮窗，知识画廊作为 ChatPanel 顶部子组件渲染在这里 */}
      {point.ragflow?.enabled !== false && (
        <div
          className="absolute bottom-6 z-20"
          style={{
            left: '50%',
            transform: 'translateX(-50%)',
            width: `${chatWidth}px`,
            maxWidth: '90vw',
            height: `${chatHeight}px`,
            maxHeight: '85vh',
          }}
        >
          <ChatPanel
            point={point}
            onStreamingChange={(active) => {
              if (active) {
                streamSpeakerRef.current?.cancel();
                streamSpeakerRef.current = null;
                stopSpeech();
                setAudioSpeaking(false);
                if (audioEnabled) {
                  setAudioSpeaking(true);
                  streamSpeakerRef.current = createStreamingSpeaker(point.id, {
                    onStart: () => setAudioSpeaking(true),
                    onEnd: () => setAudioSpeaking(false),
                  }, {
                    role: point.voiceRole,
                    voiceName: point.voiceName,
                    rate: point.voiceRate,
                    pitch: point.voicePitch,
                  });
                }
              } else {
                streamSpeakerRef.current?.finish();
                streamSpeakerRef.current = null;
              }
              setSpeaking(active);
            }}
            onAssistantChunk={(chunk) => streamSpeakerRef.current?.push(chunk)}
            onAssistantReply={(answer) => {
              setLastAssistantAnswer(answer);
            }}
          />
        </div>
      )}

      {/* ============ 空间功能按钮（按 actionButtons 数组渲染，可任意增删） ============ */}
      {effectiveButtons.filter((b) => b.enabled !== false).length > 0 && (
        <>
          {/* 每个按钮独立：位置/大小/颜色/行为可配置 */}
          {effectiveButtons
            .filter((b) => b.enabled !== false)
            .map((btn) => {
              const btnSize = btn.size ?? 52;
              const btnX = btn.position?.x ?? 96;
              const btnY = btn.position?.y ?? 50;
              const iconSize = Math.max(14, Math.round(btnSize * 0.42));
              const numFont = Math.max(9, Math.round(btnSize * 0.22));
              // 角标数字来源：
              //   - action=resources/video/document → 显示该按钮自身 files 数量
              //   - 其他 → 显示用户配置的 badge（如果 > 0）
              const isFileBtn = ['resources', 'video', 'document'].includes(btn.action || 'resources');
              const showBadge = isFileBtn
                ? (btn.files?.length ?? 0)
                : (btn.badge && btn.badge > 0 ? btn.badge : 0);
              return (
                <button
                  key={btn.id}
                  onClick={() => handleSpaceAction(btn, nav, openResources, () => setShowChapterLearning(true), () => playAnswer())}
                  className="absolute z-30 flex flex-col items-center justify-center rounded-full transition-all hover:scale-105"
                  style={{
                    left: `${btnX}%`,
                    top: `${btnY}%`,
                    transform: 'translate(-50%, -50%)',
                    width: btnSize, height: btnSize,
                    background: btn.bgColor ?? 'rgba(10,14,26,0.85)',
                    border: `1px solid ${btn.borderColor ?? 'rgba(255,255,255,0.35)'}`,
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    color: btn.iconColor ?? '#FFFFFF',
                    boxShadow: '0 6px 20px rgba(0,0,0,0.55)',
                  }}
                  title={btn.label}
                >
                  <ActionButtonIcon name={btn.icon} size={iconSize} />
                  {showBadge > 0 && (
                    <span style={{ fontSize: numFont, marginTop: 2, fontWeight: 700, color: btn.iconColor ?? '#FFFFFF' }}>
                      {showBadge}
                    </span>
                  )}
                </button>
              );
            })}

          {/* 资源列表面板 — 用完全不透明深色背景，亮色背景图穿透也清晰可读
              panelFiles 来源：handleSpaceAction 传入的「当前按钮的 files」 */}
          {showResources && panelFiles && (
            <div
              className="absolute right-4 top-1/2 -translate-y-1/2 z-40 rounded-xl overflow-hidden shadow-2xl"
              style={{
                width: 320,
                maxHeight: '70vh',
                background: '#0a0e1a',
                border: '1px solid rgba(255,255,255,0.18)',
                boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
              }}
            >
              {/* 标题栏 */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10"
                style={{ background: 'rgba(255,255,255,0.04)' }}>
                <span className="text-white text-sm font-medium flex items-center gap-1.5">
                  <Paperclip size={14} /> {point.id === 'muxiaoce' ? '测评材料与讲解' : '空间资源'}
                  <span className="text-white/50 text-xs ml-1">({panelFiles.length})</span>
                </span>
                <button
                  type="button"
                  onClick={() => setPanelFiles(null)}
                  style={{
                    background: 'rgba(255,255,255,0.12)',
                    border: '1px solid rgba(255,255,255,0.25)',
                    color: '#fff',
                  }}
                  className="p-1.5 rounded hover:bg-white/25 transition-colors"
                  title="关闭"
                >
                  <X size={16} />
                </button>
              </div>
              {/* 资源列表 — 每个 item 独立深色实底，与背景图完全隔离 */}
              <div className="overflow-y-auto" style={{ maxHeight: 'calc(70vh - 52px)', background: '#0a0e1a' }}>
                {panelFiles.length === 0 && (
                  <div className="px-4 py-6 text-center text-white/50 text-xs">
                    这个按钮还没有文件，去配置页上传吧 →
                  </div>
                )}
                {panelFiles.map((res) => (
                  <button
                    key={res.id}
                    onClick={() => {
                      setActiveResource(res);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 transition-colors text-left"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#0a0e1a' }}
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{
                        background: res.type === 'video' ? 'rgba(251,191,36,0.25)' : res.type === 'image' ? 'rgba(56,189,248,0.25)' : 'rgba(16,185,129,0.25)',
                        border: '1px solid rgba(255,255,255,0.12)',
                      }}>
                      {res.type === 'video' ? <Film size={20} className="text-amber-300" />
                        : res.type === 'image' ? <ImageIcon size={20} className="text-sky-300" />
                        : <FileText size={20} className="text-emerald-300" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* 文件名：纯白 + 强 font-weight，确保任何背景下都清晰 */}
                      <div
                        className="truncate"
                        style={{
                          color: '#FFFFFF',
                          fontSize: 13,
                          fontWeight: 600,
                          textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                        }}
                      >
                        {res.name}
                      </div>
                      <div
                        className="mt-0.5"
                        style={{
                          color: 'rgba(255,255,255,0.75)',
                          fontSize: 11,
                          textShadow: '0 1px 2px rgba(0,0,0,0.6)',
                        }}
                      >
                        {res.type === 'video' ? '视频' : res.type === 'image' ? '图片' : res.type === 'document' ? '文档' : '文件'}
                        · {(res.fileSize / 1024 / 1024).toFixed(1)} MB
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 资源查看器（全屏模态） */}
          {activeResource && (
            <div
              className="absolute inset-0 z-[60] flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.85)' }}
              onClick={() => setActiveResource(null)}
            >
              <div
                className="relative rounded-xl overflow-hidden"
                style={{ maxWidth: '90vw', maxHeight: '90vh', background: '#1a1a2e' }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* 标题栏 */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                  <span className="text-white/90 text-sm truncate flex items-center gap-2">
                    {activeResource.type === 'video' ? <Film size={15} className="text-amber-400" />
                      : activeResource.type === 'image' ? <ImageIcon size={15} className="text-sky-400" />
                      : <FileText size={15} className="text-emerald-400" />}
                    {activeResource.name}
                  </span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <a href={activeResource.url} download={activeResource.name}
                      style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff' }}
                      className="p-1.5 rounded hover:bg-white/25 transition-colors" title="下载">
                      <Download size={16} />
                    </a>
                    <button
                      type="button"
                      onClick={() => setActiveResource(null)}
                      style={{
                        background: 'rgba(255,255,255,0.12)',
                        border: '1px solid rgba(255,255,255,0.25)',
                        color: '#fff',
                      }}
                      className="p-1.5 rounded hover:bg-white/25 transition-colors"
                      title="关闭"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
                {/* 内容区域 */}
                <div className="flex items-center justify-center" style={{ maxWidth: '90vw', maxHeight: 'calc(90vh - 52px)' }}>
                  {activeResource.type === 'video' ? (
                    <video
                      src={activeResource.url}
                      controls
                      autoPlay
                      style={{ maxWidth: '90vw', maxHeight: 'calc(90vh - 52px)' }}
                    />
                  ) : activeResource.type === 'image' ? (
                    <img
                      src={activeResource.url}
                      alt={activeResource.name}
                      style={{ maxWidth: '90vw', maxHeight: 'calc(90vh - 52px)', objectFit: 'contain' }}
                    />
                  ) : activeResource.mimeType === 'application/pdf' ? (
                    <iframe
                      src={activeResource.url}
                      style={{ width: '80vw', height: 'calc(90vh - 52px)', border: 'none', background: '#fff' }}
                      title={activeResource.name}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
                      <FileText size={48} className="text-white/30" />
                      <div className="text-white/70 text-sm">该文件类型不支持在线预览</div>
                      <a href={activeResource.url} download={activeResource.name}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg flex items-center gap-2 text-sm">
                        <Download size={16} /> 下载文件
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* 章节学习面板 — 仅木小文空间（muxiaowen） */}
      {showChapterLearning && point.id === 'muxiaowen' && (
        <div
          className="absolute inset-0 z-[70] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={() => setShowChapterLearning(false)}
        >
          <div
            className="relative rounded-xl overflow-hidden flex flex-col"
            style={{ width: '85vw', maxWidth: 1100, height: '85vh', background: '#0f172a' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.04)' }}>
              <span className="text-white text-sm font-medium flex items-center gap-1.5">
                <BookOpen size={16} /> 章节学习
              </span>
              <button
                type="button"
                onClick={() => setShowChapterLearning(false)}
                style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff' }}
                className="p-1.5 rounded hover:bg-white/25 transition-colors"
                title="关闭"
              >
                <X size={18} />
              </button>
            </div>
            {/* 内容区 */}
            <div className="flex-1 overflow-auto" style={{ background: '#0f172a' }}>
              <ChapterLearningPage
                onBack={() => setShowChapterLearning(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* 注：「调整布局」浮动按钮已删除，所有布局调整（数字人大小 / 位置 / 聊天框尺寸 /
          顶部标题、工具按钮等）均在 /config 页面进行。PortalPage 仅作纯展示页。
          轮播（知识画廊）已迁移到 ChatPanel 内部顶部。 */}
    </div>
  );
}
