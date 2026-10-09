// 配置页面 — 左侧导航 + 右侧内容（按导航切换）
// 导航：主页设置 / 数字人点位 / 数字人对应空间设置 / 高级 / 菜单
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Input,
  Switch,
  MessagePlugin,
  Slider,
  Select,
  Progress,
} from 'tdesign-react';
import {
  Plus,
  Trash2,
  Upload as UploadIcon,
  Eye,
  Save,
  RotateCcw,
  ArrowLeft,
  ZoomIn,
  ZoomOut,
  Move,
  Home,
  Users,
  Maximize2,
  Settings as SettingsIcon,
  Menu as MenuIcon,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ImageIcon,
  Volume2,
  Info,
  Type as TypeIcon,
  Palette,
  FileText,
  Film,
  Download,
  Paperclip,
  Link as LinkIcon,
  Copy,
  Hand,
  Images,
  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { getConfig, saveConfig, ragflowHealth, uploadFileWithProgress } from '../api';
import type { UploadResult } from '../api';
import { speakAnswer, stopSpeech } from '../speech';
import type { AppConfig, PortalPoint, SpaceActionButton, CarouselImage, TopBarTool } from '../types';
import DraggableHuman from '../components/DraggableHuman';
import { ActionButtonIcon, ACTION_BUTTON_ICON_OPTIONS } from '../components/ActionButtonIcon';

type NavKey = 'home' | 'points' | 'spaces' | 'advanced' | 'menu';

interface NavItem {
  key: NavKey;
  label: string;
  icon: React.ComponentType<any>;
  hint?: string;
}

const NAV: NavItem[] = [
  { key: 'home', label: '主页设置', icon: Home, hint: '主页背景 / 标题 / 副标题 / 默认空间背景' },
  { key: 'points', label: '数字人点位', icon: Users, hint: '新增/删除点位 · 名称/标签/GIF/RAGFlow 等' },
  { key: 'spaces', label: '数字人对应空间设置', icon: Maximize2, hint: '选点位 → 调整空间大小/背景/聊天框' },
  { key: 'advanced', label: '高级配置', icon: SettingsIcon, hint: 'RAGFlow / 模型 / API Key' },
  { key: 'menu', label: '菜单配置', icon: MenuIcon, hint: '主页顶部菜单项' },
];

export default function ConfigPage() {
  const nav = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1); // 预览区缩放
  const [previewMode, setPreviewMode] = useState<'home' | 'portal'>('home'); // 预览模式：主页 / 空间
  const [currentNav, setCurrentNav] = useState<NavKey>('home');
  const [ragflowOk, setRagflowOk] = useState<boolean | null>(null);
  const [ragflowMsg, setRagflowMsg] = useState<string>('');

  useEffect(() => {
    (async () => {
      try {
        const c = await getConfig();
        setCfg(c);
        if (c.points?.[0]) setSelectedPointId(c.points[0].id);
      } catch (e: any) {
        MessagePlugin.error('加载失败: ' + e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 实时保存位置（主页预览拖拽时）
  const onPointPositionChange = useCallback((id: string, pos: { x: number; y: number }) => {
    setCfg((c) =>
      c
        ? {
            ...c,
            points: c.points.map((p) => (p.id === id ? { ...p, homePosition: pos } : p)),
          }
        : c
    );
    setDirty(true);
  }, []);

  const onPointSizeChange = useCallback((id: string, size: number) => {
    setCfg((c) =>
      c
        ? {
            ...c,
            points: c.points.map((p) => (p.id === id ? { ...p, size } : p)),
          }
        : c
    );
    setDirty(true);
  }, []);

  const persist = async () => {
    if (!cfg) return;
    try {
      await saveConfig(cfg);
      setDirty(false);
      MessagePlugin.success('已保存');
    } catch (e: any) {
      MessagePlugin.error('保存失败: ' + e.message);
    }
  };

  const reload = async () => {
    if (dirty && !confirm('有未保存的修改，确定丢弃？')) return;
    setLoading(true);
    try {
      const c = await getConfig();
      setCfg(c);
      setDirty(false);
    } finally {
      setLoading(false);
    }
  };

  // ===== 上传（带进度 + 服务器自动转 WebP）=====
  interface UploadTaskState {
    name: string;
    phase: 'upload' | 'process' | 'done' | 'error';
    uploadPercent: number; // 实际上传进度 0-100
    percent: number;       // 总进度 0-100（上传阶段映射到 0~70）
    originalSize: number;
    resultSize?: number;
    converted?: boolean;
    error?: string;
  }
  const [upTask, setUpTask] = useState<UploadTaskState | null>(null);
  const procTimerRef = useRef<number | null>(null);
  const doneTimerRef = useRef<number | null>(null);

  const stopTimers = () => {
    if (procTimerRef.current) { window.clearInterval(procTimerRef.current); procTimerRef.current = null; }
    if (doneTimerRef.current) { window.clearTimeout(doneTimerRef.current); doneTimerRef.current = null; }
  };
  useEffect(() => stopTimers, []);

  const fmtSize = (n?: number) => {
    if (n == null) return '-';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  };

  // 进入「服务器转换 WebP」阶段：上传已完成（70%），剩余进度平滑推进到 95% 等待响应
  const enterProcessPhase = () => {
    stopTimers();
    setUpTask((t) => (t ? { ...t, phase: 'process', uploadPercent: 100, percent: Math.max(t.percent, 70) } : t));
    let cur = 70;
    procTimerRef.current = window.setInterval(() => {
      cur = Math.min(95, cur + Math.max(0.6, (95 - cur) * 0.1));
      setUpTask((t) => (t && t.phase === 'process' ? { ...t, percent: Math.round(cur) } : t));
    }, 220);
  };

  /** 带进度浮层的上传：图片会在服务器自动压缩为 WebP（GIF 保留动画） */
  const uploadWithUi = async (file: File, sub: string): Promise<UploadResult | null> => {
    stopTimers();
    setUpTask({ name: file.name, phase: 'upload', uploadPercent: 0, percent: 0, originalSize: file.size });
    try {
      const r = await uploadFileWithProgress(file, sub, (p) => {
        if (p.phase === 'upload') {
          setUpTask((t) => (t
            ? { ...t, phase: 'upload', uploadPercent: p.percent, percent: Math.round(p.percent * 0.7) }
            : t));
        } else {
          enterProcessPhase();
        }
      });
      stopTimers();
      setUpTask((t) => (t ? {
        ...t,
        phase: 'done',
        percent: 100,
        uploadPercent: 100,
        originalSize: r.originalSize ?? t.originalSize,
        resultSize: r.size,
        converted: r.converted,
      } : t));
      doneTimerRef.current = window.setTimeout(() => setUpTask(null), 2200);
      return r;
    } catch (e: any) {
      stopTimers();
      setUpTask((t) => (t ? { ...t, phase: 'error', error: e?.message || '未知错误' } : t));
      return null;
    }
  };

  const uploadImg = async (file: File, sub = 'bg'): Promise<string | null> => {
    const r = await uploadWithUi(file, sub);
    if (!r) {
      MessagePlugin.error('上传失败，请重试');
      return null;
    }
    if (r.converted && r.originalSize) {
      const saved = Math.round((1 - r.size / r.originalSize) * 100);
      MessagePlugin.success(`已转为 WebP：${fmtSize(r.originalSize)} → ${fmtSize(r.size)}（节省 ${saved}%）`);
    } else {
      MessagePlugin.success(`上传成功：${r.filename}`);
    }
    return r.url;
  };

  const triggerUpload = (sub: string, onUrl: (url: string) => void) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const url = await uploadImg(file, sub);
      if (url) onUrl(url);
    };
    input.click();
  };

  const triggerGifUpload = (onUrl: (url: string) => void) => triggerUpload('gif', onUrl);
  const triggerHomeBgUpload = (onUrl: (url: string) => void) => triggerUpload('home_bg', onUrl);
  const triggerPortalBgUpload = (onUrl: (url: string) => void) => triggerUpload('portal_bg', onUrl);

  // 空间资源上传（PDF/Word/视频等；图片同样自动转 WebP）
  const triggerResourceUpload = (onDone: (info: { url: string; filename: string; original: string; size: number; mime: string }) => void) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.doc,.docx,.ppt,.pptx,.mp4,.webm,.mov,.avi,.mkv,.mp3,.wav,.ogg,image/*';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const r = await uploadWithUi(file, 'resources');
      if (!r) {
        MessagePlugin.error('上传失败，请重试');
        return;
      }
      if (r.converted && r.originalSize) {
        const saved = Math.round((1 - r.size / r.originalSize) * 100);
        MessagePlugin.success(`已转为 WebP：${fmtSize(r.originalSize)} → ${fmtSize(r.size)}（节省 ${saved}%）`);
      } else {
        MessagePlugin.success(`上传成功：${r.original || r.filename}`);
      }
      onDone({ url: r.url, filename: r.filename, original: r.original || r.filename, size: r.size, mime: r.mime || file.type });
    };
    input.click();
  };

  const addPoint = () => {
    if (!cfg) return;
    const newPoint: PortalPoint = {
      id: 'pt_' + Date.now().toString(36),
      name: '新数字人',
      gifUrl: '/muxiaoce-speak.gif',
      homePosition: { x: 50, y: 50 },
      portalPosition: { x: 12, y: 78 },
      enabled: true,
      label: '新数字人',
      size: 120,
      ragflow: {
        enabled: true,
        welcomeMessage: '你好，有什么可以帮你的？',
        title: '新数字人',
      },
    };
    setCfg({ ...cfg, points: [...cfg.points, newPoint] });
    setSelectedPointId(newPoint.id);
    setDirty(true);
  };

  const removePoint = (id: string) => {
    if (!cfg) return;
    if (!confirm('删除该点位？')) return;
    setCfg({ ...cfg, points: cfg.points.filter((p) => p.id !== id) });
    if (selectedPointId === id) setSelectedPointId(null);
    setDirty(true);
  };

  const updatePoint = useCallback((id: string, patch: Partial<PortalPoint>) => {
    // 必须基于最新状态更新。配置项很多且会连续修改，如果使用当前渲染闭包里的 cfg，
    // 快速编辑或刚切换数字人时，后一次修改可能把前一次修改覆盖掉。
    setCfg((current) => current
      ? {
          ...current,
          points: current.points.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        }
      : current);
    setDirty(true);
  }, []);

  const checkRagflow = async () => {
    try {
      const r = await ragflowHealth();
      setRagflowOk(r.ok);
      setRagflowMsg(`${r.status ?? 'N/A'} (${r.elapsedMs}ms) — ${r.baseUrl}`);
    } catch (e: any) {
      setRagflowOk(false);
      setRagflowMsg(e.message);
    }
  };

  if (loading || !cfg) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-100">
        加载中…
      </div>
    );
  }

  const currentPoint = cfg.points.find((p) => p.id === selectedPointId) || null;

  return (
    <div className="w-full h-full flex flex-col bg-slate-100">
      {/* ===== 上传处理进度浮层 ===== */}
      {upTask && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45" style={{ backdropFilter: 'blur(2px)' }}>
          <div className="w-[440px] max-w-[92vw] bg-white rounded-xl shadow-2xl p-5">
            <div className="flex items-center gap-3 mb-4">
              {upTask.phase === 'done' ? (
                <CheckCircle2 size={24} className="text-green-500 shrink-0" />
              ) : upTask.phase === 'error' ? (
                <XCircle size={24} className="text-red-500 shrink-0" />
              ) : (
                <Loader2 size={24} className="text-blue-500 animate-spin shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-800 truncate" title={upTask.name}>
                  {upTask.name}
                </div>
                <div className="text-xs mt-0.5 leading-snug">
                  {upTask.phase === 'upload' && (
                    <span className="text-slate-500">上传中 {upTask.uploadPercent}%（{fmtSize(upTask.originalSize)}）</span>
                  )}
                  {upTask.phase === 'process' && (
                    <span className="text-blue-600">上传完成，服务器正在压缩转换为 WebP…</span>
                  )}
                  {upTask.phase === 'done' && upTask.converted && upTask.originalSize != null && upTask.resultSize != null && (
                    <span className="text-green-600">
                      已转换为 WebP：{fmtSize(upTask.originalSize)} → {fmtSize(upTask.resultSize)}
                      （节省 {Math.round((1 - upTask.resultSize / upTask.originalSize) * 100)}%）
                    </span>
                  )}
                  {upTask.phase === 'done' && !upTask.converted && (
                    <span className="text-slate-500">上传完成（{fmtSize(upTask.resultSize)}）</span>
                  )}
                  {upTask.phase === 'error' && (
                    <span className="text-red-500">上传失败：{upTask.error}</span>
                  )}
                </div>
              </div>
              {(upTask.phase === 'error' || upTask.phase === 'done') && (
                <Button size="small" variant="outline" onClick={() => { stopTimers(); setUpTask(null); }}>
                  关闭
                </Button>
              )}
            </div>
            <Progress
              theme="line"
              percentage={upTask.phase === 'error' ? 100 : upTask.percent}
              status={upTask.phase === 'error' ? 'error' : upTask.phase === 'done' ? 'success' : undefined}
            />
          </div>
        </div>
      )}
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-4 py-2 bg-white shadow-sm border-b shrink-0">
        <div className="flex items-center gap-3">
      <Button variant="text" icon={<ArrowLeft size={14} />} onClick={() => nav('/wisdom-space')}>
            返回主页
          </Button>
          <h1 className="text-lg font-semibold">元宇宙门户配置</h1>
          {dirty && <span className="text-xs text-orange-500">● 有未保存的修改</span>}
        </div>
        <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => nav('/wisdom-space')} icon={<Eye size={14} />}>
            预览
          </Button>
          <Button theme="primary" onClick={persist} disabled={!dirty} icon={<Save size={14} />}>
            保存
          </Button>
          <Button variant="text" onClick={reload} icon={<RotateCcw size={14} />}>
            重新生成
          </Button>
        </div>
      </div>

      {/* 主体：左侧导航 + 中间预览 + 右侧内容（按导航切换） */}
      <div className="flex-1 flex overflow-hidden">
        {/* ===== 左侧导航栏 ===== */}
        <div className="w-56 bg-white border-r flex flex-col shrink-0">
          <div className="px-3 py-3 border-b shrink-0">
            <div className="text-xs text-slate-400 uppercase tracking-wider">导航</div>
          </div>
          <nav className="flex-1 overflow-y-auto py-2">
            {NAV.map((n) => {
              const Icon = n.icon;
              const active = currentNav === n.key;
              return (
                <button
                  key={n.key}
                  onClick={() => setCurrentNav(n.key)}
                  className={`w-full text-left flex items-start gap-2 px-3 py-2.5 mx-1 rounded transition-colors ${
                    active
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'text-slate-700 hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <Icon size={16} className={`mt-0.5 shrink-0 ${active ? 'text-blue-500' : 'text-slate-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium ${active ? 'text-blue-700' : ''}`}>{n.label}</div>
                    {n.hint && (
                      <div className="text-[11px] text-slate-400 mt-0.5 leading-tight">{n.hint}</div>
                    )}
                  </div>
                  {active && <ChevronRight size={14} className="text-blue-500 mt-1" />}
                </button>
              );
            })}
          </nav>
          <div className="px-3 py-3 border-t text-xs text-slate-400 leading-relaxed shrink-0">
            修改后请点击顶部「保存」按钮生效。
          </div>
        </div>

        {/* ===== 中间预览区 ===== */}
        <div className="flex-1 overflow-auto p-4 bg-slate-200 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-white rounded border px-1 py-0.5">
                <Button
                  size="small"
                  theme={previewMode === 'home' ? 'primary' : 'default'}
                  variant={previewMode === 'home' ? 'base' : 'text'}
                  onClick={() => setPreviewMode('home')}
                >
                  主页预览
                </Button>
                <Button
                  size="small"
                  theme={previewMode === 'portal' ? 'primary' : 'default'}
                  variant={previewMode === 'portal' ? 'base' : 'text'}
                  onClick={() => setPreviewMode('portal')}
                >
                  空间预览
                </Button>
              </div>
              <div className="text-xs text-slate-500 flex items-center gap-1">
                {previewMode === 'home' ? (
                  <><Move size={12} /> 拖拽数字人调整位置 · 滚轮缩放大小</>
                ) : (
                  <>{currentPoint ? `预览「${currentPoint.name}」空间，调整右侧滑块实时变化` : '请在右侧选择一个数字人'}</>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button size="small" variant="outline" icon={<ZoomOut size={14} />} onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))} />
              <span className="text-xs text-slate-600 w-12 text-center">{Math.round(zoom * 100)}%</span>
              <Button size="small" variant="outline" icon={<ZoomIn size={14} />} onClick={() => setZoom((z) => Math.min(2, z + 0.1))} />
              <Button size="small" variant="text" onClick={() => setZoom(1)}>100%</Button>
            </div>
          </div>

          <div className="overflow-auto bg-slate-300 rounded-lg p-4" style={{ maxHeight: 'calc(100vh - 140px)' }}>
            {previewMode === 'home' ? (
              <div
                ref={containerRef}
                className="relative overflow-hidden bg-black border rounded shadow-lg mx-auto"
                style={{ width: `${zoom * 100}%`, aspectRatio: '16 / 9', transition: 'width 0.2s ease' }}
              >
                <img src={cfg.homeBg} alt="" className="w-full h-full object-cover" />
                {cfg.points.filter((p) => p.enabled !== false).map((p) => (
                  <DraggableHuman
                    key={p.id}
                    point={p}
                    containerRef={containerRef}
                    position={p.homePosition}
                    draggable={selectedPointId === p.id}
                    size={p.size || 120}
                    selected={selectedPointId === p.id}
                    onClick={() => {
                      setSelectedPointId(p.id === selectedPointId ? null : p.id);
                    }}
                    onPositionChange={(pos) => onPointPositionChange(p.id, pos)}
                    onSizeChange={(s) => onPointSizeChange(p.id, s)}
                  />
                ))}
                {cfg.points.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center text-white/40">
                    还没有数字人点位，在右侧「数字人点位」中添加
                  </div>
                )}
              </div>
            ) : (
              // ===== 空间预览 =====
              (() => {
                const p = currentPoint;
                if (!p) {
                  return (
                    <div className="flex items-center justify-center bg-slate-200 rounded-lg border-2 border-dashed border-slate-400 mx-auto"
                      style={{ aspectRatio: '16 / 9', width: `${zoom * 100}%` }}>
                      <div className="text-slate-400 text-sm">请在右侧「数字人对应空间设置」中选择一个数字人</div>
                    </div>
                  );
                }
                const portalBg = p.portalBg || cfg.defaultPortalBg;
                const portalPos = p.portalPosition || { x: 12, y: 78 };
                const portalSize = p.portalSize || 400;
                const chatW = p.chatWidth ?? 820;
                const chatH = p.chatHeight ?? 680;
                // 用于空间预览的按钮列表（与 PortalPage 中的 effectiveButtons 等价）
                const _previewButtons: SpaceActionButton[] =
                  p.actionButtons && p.actionButtons.length > 0
                    ? p.actionButtons
                    : (p.resources && p.resources.length > 0)
                      ? [{
                          id: '__legacy_resources_btn__',
                          icon: 'Paperclip',
                          label: '空间资源',
                          enabled: true,
                          size: p.resourcesBtnSize ?? 52,
                          position: p.resourcesBtnPosition ?? { x: 96, y: 50 },
                          action: 'resources',
                        }]
                      : [];
                return (
                  <div>
                    <div className="relative overflow-hidden bg-black border rounded shadow-lg mx-auto"
                      style={{ width: `${zoom * 100}%`, aspectRatio: '16 / 9', transition: 'width 0.2s ease' }}>
                      {portalBg ? (
                        <img src={portalBg} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-slate-800">
                          <div className="text-center">
                            <div className="text-white/30 text-sm mb-3">未配置空间背景图</div>
                            <Button size="small" variant="outline" icon={<UploadIcon size={12} />}
                              onClick={() => triggerPortalBgUpload((url) => updatePoint(p.id, { portalBg: url }))}>
                              上传背景图
                            </Button>
                          </div>
                        </div>
                      )}
                      <div className="absolute top-0 left-0 right-0 flex items-center px-4 py-2 pointer-events-none"
                        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)' }}>
                        <div className="flex-1" />
                        {p.showTopBar !== false && (
                          <div style={{
                            background: p.topBarColor || '#C8362D',
                            color: p.topBarTextColor || '#FFFFFF',
                            padding: '4px 16px',
                            borderRadius: 4,
                            fontSize: 13,
                            fontWeight: 600,
                            boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                          }}>
                            {p.topBarTitle || p.label || p.name}
                          </div>
                        )}
                        <div className="flex-1 flex items-center justify-end gap-1.5">
                          {p.showTopBar !== false && p.showTopBarTools !== false &&
                           (p.topBarTools || []).filter((t) => t.enabled !== false).map((tool) => (
                            <div key={tool.id} title={tool.label}
                              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px]"
                              style={{
                                background: 'rgba(0,0,0,0.55)',
                                color: '#fff',
                                border: '1px solid rgba(255,255,255,0.2)',
                              }}>
                              {tool.icon === 'audio' ? '🔊' :
                               tool.icon === 'info' ? 'ℹ' :
                               tool.icon === 'back' ? '←' :
                               tool.icon === 'home' ? '⌂' :
                               tool.icon === 'settings' ? '⚙' :
                               tool.icon?.charAt(0) || '?'}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div style={{
                        position: 'absolute',
                        left: `${portalPos.x}%`, top: `${portalPos.y}%`,
                        // 挥手状态预览：应用挥手缩放 + 垂直偏移（与真实空间页一致）
                        transform: `translate(-50%, -50%) scale(${p.waveScale ?? 1}) translateY(${p.waveOffsetY ?? 0}px)`,
                        width: `${(portalSize / 1920) * 100}%`, aspectRatio: '1',
                      }}>
                      {/* 空间预览中的数字人：与真实空间页一致，空闲态显示 wave GIF（开启切换且配置了 waveGifUrl 时） */}
                      <img
                        src={p.speakAnimEnabled !== false ? (p.waveGifUrl || p.gifUrl) : p.gifUrl}
                        alt={p.name}
                        className="w-full h-full object-contain"
                        style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.6))' }}
                      />
                      </div>
                      {p.ragflow?.enabled !== false && (
                        <div className="absolute rounded-lg border-2 flex flex-col overflow-hidden"
                          style={{
                            bottom: '3%', left: '50%', transform: 'translateX(-50%)',
                            width: `${(chatW / 1920) * 100}%`, height: `${(chatH / 1080) * 100}%`,
                            background: p.chatPanelColor || 'rgba(251, 248, 241, 0.97)',
                            borderColor: p.chatAccentColor || (p.id === 'muxiaoce' ? '#9A6D36' : p.id === 'muxiaowen' ? '#9B4A3F' : '#667553'),
                          }}>
                          <div className="text-xs px-2 pt-1 flex items-center justify-between"
                            style={{ color: p.chatTextColor || '#2F2924', fontSize: `${Math.max(10, (p.chatFontSize || 17) - 5)}px` }}>
                            <span>{p.ragflow?.title || p.name || p.id} · 角色化聊天</span>
                            <span className="font-mono" style={{ color: p.chatAccentColor || '#38BDF8' }}>{chatW} × {chatH}px</span>
                          </div>

                          {/* 知识画廊嵌入聊天框预览（与真实效果一致；按 carouselPosition 决定位置） */}
                          {p.carouselEnabled !== false && (p.carouselImages?.length ?? 0) > 0 && (() => {
                            const pos = p.carouselPosition || 'above';
                            const align = p.carouselAlign || (p.id === 'muxiaozhi' ? 'center' : 'left');
                            const posLabel =
                              pos === 'above' ? '⬆️ 顶部'
                              : pos === 'below' ? '⬇️ 底部'
                              : pos === 'left'  ? '⬅️ 左侧分栏'
                              : pos === 'right' ? '➡️ 右侧分栏'
                              : '💬 内嵌消息流';
                            // 左右分栏 → 聊天预览改成左右并排结构
                            const isSplit = pos === 'left' || pos === 'right';
                            return isSplit ? (
                              <div className="flex-1 flex flex-row mx-2 my-1 gap-1 min-h-0">
                                {pos === 'left' && (
                                  <div className="rounded flex items-center justify-center text-[8px] text-white/80 px-1"
                                    style={{ flex: 1, background: '#0a0e1a', border: '1px solid rgba(255,255,255,0.2)', minWidth: 0 }}>
                                    🖼️ {p.carouselImages![0].title}
                                  </div>
                                )}
                                <div className="rounded flex-1 flex items-center justify-center text-[8px] text-slate-400"
                                  style={{ background: 'rgba(0,0,0,0.04)', border: '1px dashed rgba(0,0,0,0.15)', minWidth: 0 }}>
                                  （消息 / 输入框）
                                </div>
                                {pos === 'right' && (
                                  <div className="rounded flex items-center justify-center text-[8px] text-white/80 px-1"
                                    style={{ flex: 1, background: '#0a0e1a', border: '1px solid rgba(255,255,255,0.2)', minWidth: 0 }}>
                                    🖼️ {p.carouselImages![0].title}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="mt-1 rounded overflow-hidden flex items-center px-2 py-1"
                                style={{
                                  width: p.id === 'muxiaozhi' ? '68%' : 'calc(100% - 16px)',
                                  marginLeft: align === 'center' ? 'auto' : align === 'right' ? 'auto' : 8,
                                  marginRight: align === 'center' ? 'auto' : align === 'right' ? 8 : 'auto',
                                  background: '#0a0e1a',
                                  border: '1px solid rgba(255,255,255,0.2)',
                                }}>
                                <span className="text-white text-[9px] flex items-center gap-1">
                                  🖼️ 知识画廊 · {p.carouselImages!.length} 张
                                </span>
                                <span className="text-white/60 text-[8px] font-mono ml-auto">
                                  {p.carouselImages![0].title}
                                </span>
                                <span className="text-blue-300 text-[8px] ml-1.5">[{posLabel}]</span>
                              </div>
                            );
                          })()}

                          <div className="flex-1 flex items-center justify-center text-xs"
                            style={{ color: p.chatMutedTextColor || '#82776D', fontSize: `${Math.max(10, (p.chatFontSize || 17) - 5)}px` }}>
                            （消息 / 输入框 / 知识画廊）
                          </div>
                        </div>
                      )}

                      {/* ============ 空间功能按钮实时预览 ============ */}
                      {/* 按 1920×1080 视口把按钮尺寸转成预览容器百分比，与 PortalPage 一致 */}
                      {_previewButtons.filter((b) => b.enabled !== false).length > 0 && (
                        <div className="absolute inset-0 pointer-events-none">
                          {_previewButtons
                            .filter((b) => b.enabled !== false)
                            .map((btn) => {
                              const btnSize = btn.size ?? 52;
                              const btnX = btn.position?.x ?? 96;
                              const btnY = btn.position?.y ?? 50;
                              const iconSize = Math.max(10, Math.round((btnSize / 1920) * 100 * 4.5));
                              const isFileBtn = ['resources', 'video', 'document'].includes(btn.action || 'resources');
                              // 角标：每个按钮自己的 files 数量
                              const showBadge = isFileBtn ? (btn.files?.length ?? 0) : (btn.badge && btn.badge > 0 ? btn.badge : 0);
                              return (
                                <div
                                  key={btn.id}
                                  className="absolute flex flex-col items-center justify-center rounded-full"
                                  style={{
                                    left: `${btnX}%`,
                                    top: `${btnY}%`,
                                    transform: 'translate(-50%, -50%)',
                                    width: `${(btnSize / 1920) * 100}%`,
                                    aspectRatio: '1',
                                    background: btn.bgColor ?? 'rgba(10,14,26,0.85)',
                                    border: `1px solid ${btn.borderColor ?? 'rgba(255,255,255,0.35)'}`,
                                    backdropFilter: 'blur(10px)',
                                    WebkitBackdropFilter: 'blur(10px)',
                                    color: btn.iconColor ?? '#FFFFFF',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                                  }}
                                  title={btn.label}
                                >
                                  <ActionButtonIcon name={btn.icon} size={iconSize} />
                                  {showBadge > 0 && (
                                    <span style={{ fontSize: Math.max(7, iconSize * 0.5), marginTop: 1, fontWeight: 700 }}>
                                      {showBadge}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      )}

                      {/* 知识画廊嵌入聊天框顶部（上面已渲染）；这里不再独立显示 */}

                      <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                        预览：{p.name}
                      </div>
                      <div className="absolute bottom-2 right-2 flex gap-1">
                        <Button size="small" variant="outline" icon={<UploadIcon size={12} />}
                          onClick={() => triggerPortalBgUpload((url) => updatePoint(p.id, { portalBg: url }))}>
                          换背景
                        </Button>
                        <Button size="small" variant="outline" icon={<Eye size={12} />}
                              onClick={() => window.open(`/wisdom-space/portal/${p.id}`, '_blank')}>
                          打开
                        </Button>
                      </div>
                    </div>

                    {/* 空间预览下方的快速滑块 */}
                    {currentNav === 'spaces' && (
                      <div className="mt-3 mx-auto bg-white rounded-lg border p-3 space-y-3" style={{ width: `${zoom * 100}%` }}>
                        <div className="text-xs text-slate-500 flex items-center justify-between">
                          <span>⚙️ 实时调整（拖动即生效）</span>
                          <span className="text-slate-400">修改后记得点顶部「保存」</span>
                        </div>
                        <SliderRow label="数字人大小" min={120} max={600} step={10}
                          value={portalSize}
                          onChange={(v) => updatePoint(p.id, { portalSize: v })} suffix="px" />
                        <SliderRow label="聊天框宽度" min={480} max={1400} step={20}
                          value={chatW}
                          onChange={(v) => updatePoint(p.id, { chatWidth: v })} suffix="px" />
                        <SliderRow label="聊天框高度" min={400} max={900} step={20}
                          value={chatH}
                          onChange={(v) => updatePoint(p.id, { chatHeight: v })} suffix="px" />
                        <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                          <SliderRow label="数字人水平位置" min={5} max={95} step={1}
                            value={portalPos.x}
                            onChange={(v) => updatePoint(p.id, { portalPosition: { x: v, y: portalPos.y } })}
                            suffix="%" />
                          <SliderRow label="数字人垂直位置" min={20} max={95} step={1}
                            value={portalPos.y}
                            onChange={(v) => updatePoint(p.id, { portalPosition: { x: portalPos.x, y: v } })}
                            suffix="%" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()
            )}
          </div>
        </div>

        {/* ===== 右侧内容区（按导航渲染） ===== */}
        <div className="w-[420px] bg-white border-l overflow-y-auto scroll-thin shrink-0">
          {currentNav === 'home' && (
            <HomeSettingsPanel
              cfg={cfg}
              setCfg={setCfg}
              setDirty={setDirty}
              triggerHomeBgUpload={triggerHomeBgUpload}
              triggerPortalBgUpload={triggerPortalBgUpload}
            />
          )}

          {currentNav === 'points' && (
            <PointsPanel
              cfg={cfg}
              setCfg={setCfg}
              setDirty={setDirty}
              selectedPointId={selectedPointId}
              setSelectedPointId={setSelectedPointId}
              addPoint={addPoint}
              removePoint={removePoint}
              updatePoint={updatePoint}
              triggerGifUpload={triggerGifUpload}
              triggerPortalBgUpload={triggerPortalBgUpload}
            />
          )}

          {currentNav === 'spaces' && (
            <SpacesPanel
              cfg={cfg}
              currentPoint={currentPoint}
              setSelectedPointId={setSelectedPointId}
              setPreviewMode={setPreviewMode}
              updatePoint={updatePoint}
              triggerPortalBgUpload={triggerPortalBgUpload}
              triggerResourceUpload={triggerResourceUpload}
            />
          )}

          {currentNav === 'advanced' && (
            <AdvancedPanel
              cfg={cfg} setCfg={setCfg} setDirty={setDirty}
              ragflowOk={ragflowOk} ragflowMsg={ragflowMsg} checkRagflow={checkRagflow}
            />
          )}

          {currentNav === 'menu' && (
            <MenuPanel cfg={cfg} setCfg={setCfg} setDirty={setDirty} />
          )}
        </div>
      </div>
    </div>
  );
}

// ============== 颜色规范化：把 rgba()/rgb()/named 转成 #RRGGBB 给原生 color input 用 ==============
function normalizeColor(input: string | undefined, fallback = '#3A4759'): string {
  if (!input) return fallback;
  const s = String(input).trim();
  // 已经是 # 开头的 hex：保留原样
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return s.length === 4
    ? '#' + s.slice(1).split('').map((c) => c + c).join('')
    : s.length === 7 ? s : s.slice(0, 7);
  // rgba(r, g, b, a)
  const rgba = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgba) {
    const r = Math.min(255, parseInt(rgba[1]));
    const g = Math.min(255, parseInt(rgba[2]));
    const b = Math.min(255, parseInt(rgba[3]));
    return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
  }
  return fallback;
}

// ============== 滑块组件（替代易塌陷的 TDesign Slider） ==============
function SliderRow({
  label, min, max, step, value, onChange, suffix = '',
}: {
  label: string;
  min: number; max: number; step: number;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-slate-600">{label}</span>
        <span className="text-blue-600 font-mono">{value}{suffix}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-blue-500"
        style={{ width: '100%', display: 'block' }}
      />
    </div>
  );
}

// ============== 分段控件（替代易混淆的 TDesign Button 组，强视觉反馈） ==============
function Segmented<T extends string>({
  value, options, onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex items-center bg-slate-200/70 rounded-lg p-0.5 border border-slate-300 select-none">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1 text-xs rounded-md transition-all ${
              active
                ? 'bg-white text-blue-700 font-semibold shadow-sm border border-blue-200'
                : 'text-slate-600 hover:text-slate-800 hover:bg-white/40 border border-transparent'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ============== 数字人状态预览（配置页实时查看挥手/说话效果） ==============
function HumanPreview({
  currentPoint,
  updatePoint,
}: {
  currentPoint: PortalPoint;
  updatePoint: (id: string, patch: Partial<PortalPoint>) => void;
}) {
  const [mode, setMode] = useState<'speak' | 'wave'>('wave');
  const isSpeak = mode === 'speak';
  const scale = isSpeak ? (currentPoint.speakScale ?? 1) : (currentPoint.waveScale ?? 1);
  const offsetY = isSpeak ? (currentPoint.speakOffsetY ?? 0) : (currentPoint.waveOffsetY ?? 0);
  const gifUrl = isSpeak
    ? (currentPoint.gifUrl || `/digital-humans/${currentPoint.id}-speak.gif`)
    : (currentPoint.waveGifUrl || currentPoint.gifUrl || `/digital-humans/${currentPoint.id}-wave.gif`);
  const portalSize = currentPoint.portalSize || 400;

  return (
    <div className="rounded border border-slate-300 overflow-hidden">
      {/* 预览标题栏 */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800">
        <div className="text-xs text-white/80 font-medium">数字人状态预览</div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMode('wave')}
            className={`px-2.5 py-1 text-[11px] rounded transition-colors ${
              mode === 'wave'
                ? 'bg-white text-slate-900 font-medium'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            }`}
          >
            挥手
          </button>
          <button
            type="button"
            onClick={() => setMode('speak')}
            className={`px-2.5 py-1 text-[11px] rounded transition-colors ${
              mode === 'speak'
                ? 'bg-white text-slate-900 font-medium'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            }`}
          >
            说话
          </button>
        </div>
      </div>
      {/* 预览画布 */}
      <div
        className="relative flex items-center justify-center"
        style={{
          height: 280,
          background: currentPoint.portalBg
            ? `url(${currentPoint.portalBg}) center/cover no-repeat`
            : '#0a0a0a',
        }}
      >
        {/* 数字人 */}
        <div
          style={{
            width: portalSize * 0.6,
            height: portalSize * 0.6,
            transform: `scale(${scale}) translateY(${offsetY}px)`,
            transformOrigin: 'center center',
            transition: 'transform 0.2s ease',
          }}
        >
          <img
            key={gifUrl + mode}
            src={gifUrl}
            alt={currentPoint.name}
            draggable={false}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.6))',
            }}
          />
        </div>
        {/* 尺寸提示 */}
        <div className="absolute bottom-2 left-2 text-[10px] text-white/40">
          {mode === 'speak' ? '说话' : '挥手'} · 缩放 {scale.toFixed(2)}x · 偏移 {offsetY}px
        </div>
      </div>
    </div>
  );
}

// ============== 主页设置 ==============
function HomeSettingsPanel({
  cfg, setCfg, setDirty, triggerHomeBgUpload, triggerPortalBgUpload,
}: {
  cfg: AppConfig;
  setCfg: (c: AppConfig) => void;
  setDirty: (d: boolean) => void;
  triggerHomeBgUpload: (onUrl: (url: string) => void) => void;
  triggerPortalBgUpload: (onUrl: (url: string) => void) => void;
}) {
  return (
    <div className="p-3 space-y-4">
      <div className="text-xs text-slate-500 bg-blue-50 border border-blue-200 rounded px-2 py-1.5 leading-relaxed">
        这里是主页面的全局内容。修改后点击顶部「保存」即可生效。
      </div>

      {/* 主页面背景 */}
      <div>
        <div className="text-sm font-medium mb-2 flex items-center gap-1">
          <ImageIcon size={14} /> 主页面背景图
        </div>
        <div className="bg-slate-100 rounded overflow-hidden mb-2 border" style={{ aspectRatio: '16/9' }}>
          {cfg.homeBg ? (
            <img src={cfg.homeBg} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">未设置</div>
          )}
        </div>
        <div className="flex gap-2">
          <Button theme="primary" icon={<UploadIcon size={14} />}
            onClick={() => triggerHomeBgUpload((url) => { setCfg({ ...cfg, homeBg: url }); setDirty(true); })}>
            上传新背景
          </Button>
          {cfg.homeBg && (
            <Button variant="outline" onClick={() => window.open(cfg.homeBg, '_blank')}>查看原图</Button>
          )}
        </div>
        <Input
          className="mt-2"
          value={cfg.homeBg || ''}
          onChange={(v) => { setCfg({ ...cfg, homeBg: v }); setDirty(true); }}
          placeholder="/uploads/home_bg/xxx.jpg 或完整 URL"
        />
      </div>

      {/* 主页标题 + 副标题 */}
      <div className="space-y-3 p-3 bg-slate-50 rounded border border-slate-200">
        <div className="text-xs text-slate-500 leading-relaxed">
          以下两段文字显示在主页顶部居中位置：
          <br />
          <span className="text-slate-400">标题（大字）→ 副标题（下方的小字）</span>
        </div>
        <div>
          <div className="text-sm font-medium mb-1.5 flex items-center gap-1">
            <span>主页面标题</span>
            <span className="text-[11px] text-slate-400 font-normal">（主页顶部居中的大字）</span>
          </div>
          <Input
            value={cfg.homeTitle || ''}
            onChange={(v) => { setCfg({ ...cfg, homeTitle: v }); setDirty(true); }}
            placeholder="3D 藏语空间"
          />
        </div>
        <div>
          <div className="text-sm font-medium mb-1.5 flex items-center gap-1">
            <span>副标题</span>
            <span className="text-[11px] text-orange-500 font-normal">（标题正下方的小字）</span>
          </div>
          <Input
            value={cfg.homeSubtitle || ''}
            onChange={(v) => { setCfg({ ...cfg, homeSubtitle: v }); setDirty(true); }}
            placeholder="点击地图上的数字人进入对应学习场景"
          />
          <div className="mt-2 p-2 bg-black/70 rounded text-center">
            <div className="text-white font-semibold text-base drop-shadow">{cfg.homeTitle || '3D 藏语空间'}</div>
            {cfg.homeSubtitle && <div className="text-white/70 text-xs mt-1 drop-shadow">{cfg.homeSubtitle}</div>}
          </div>
        </div>
      </div>

      {/* 默认 portal 背景 */}
      <div>
        <div className="text-sm font-medium mb-2">默认跳转页背景（数字人空间）</div>
        <div className="bg-slate-100 rounded overflow-hidden mb-2 border" style={{ aspectRatio: '16/9' }}>
          {cfg.defaultPortalBg ? (
            <img src={cfg.defaultPortalBg} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">未设置</div>
          )}
        </div>
        <Button variant="outline" icon={<UploadIcon size={14} />}
          onClick={() => triggerPortalBgUpload((url) => { setCfg({ ...cfg, defaultPortalBg: url }); setDirty(true); })}>
          上传
        </Button>
        <Input
          className="mt-2"
          value={cfg.defaultPortalBg || ''}
          onChange={(v) => { setCfg({ ...cfg, defaultPortalBg: v }); setDirty(true); }}
        />
      </div>
    </div>
  );
}

// ============== 数字人点位 ==============
function PointsPanel({
  cfg, selectedPointId, setSelectedPointId, addPoint, removePoint, updatePoint,
  triggerGifUpload, triggerPortalBgUpload,
}: {
  cfg: AppConfig;
  setCfg: (c: AppConfig) => void;
  setDirty: (d: boolean) => void;
  selectedPointId: string | null;
  setSelectedPointId: (id: string | null) => void;
  addPoint: () => void;
  removePoint: (id: string) => void;
  updatePoint: (id: string, patch: Partial<PortalPoint>) => void;
  triggerGifUpload: (onUrl: (url: string) => void) => void;
  triggerPortalBgUpload: (onUrl: (url: string) => void) => void;
}) {
  const p = cfg.points.find((pp) => pp.id === selectedPointId);

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium">数字人点位（{cfg.points.length}）</span>
        <Button size="small" theme="primary" onClick={addPoint} icon={<Plus size={14} />}>
          + 添加点位
        </Button>
      </div>

      <div className="space-y-2">
        {cfg.points.map((pp) => (
          <div
            key={pp.id}
            onClick={() => setSelectedPointId(pp.id)}
            className={`flex items-center gap-2 p-2 rounded border cursor-pointer ${
              selectedPointId === pp.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <input
              type="checkbox"
              checked={pp.enabled !== false}
              onChange={(e) => updatePoint(pp.id, { enabled: e.target.checked })}
              onClick={(e) => e.stopPropagation()}
            />
            <div className="w-10 h-10 bg-slate-100 rounded overflow-hidden flex items-center justify-center">
              {pp.gifUrl ? (
                <img src={pp.gifUrl} className="w-full h-full object-contain" />
              ) : (
                <span className="text-xs text-slate-400">无图</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{pp.name}</div>
              <div className="text-xs text-slate-400 truncate">
                {pp.label || pp.id} · {pp.size || 120}px
              </div>
              {pp.subtitle && (
                <div className="text-[11px] text-blue-500 truncate mt-0.5">{pp.subtitle}</div>
              )}
            </div>
            <Button size="small" variant="text" onClick={(e) => { e.stopPropagation(); removePoint(pp.id); }}>
              <Trash2 size={14} className="text-red-500" />
            </Button>
          </div>
        ))}
      </div>

      {p && (
        <div className="mt-4 p-3 bg-slate-50 rounded space-y-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">编辑「{p.name}」</div>
            <Button size="small" variant="outline" icon={<Eye size={12} />}
                                  onClick={() => window.open(`/wisdom-space/portal/${p.id}`, '_blank')}>
              打开空间
            </Button>
          </div>

          <div>
            <div className="text-xs text-slate-500 mb-1">名称</div>
            <Input value={p.name} onChange={(v) => updatePoint(p.id, { name: v })} placeholder="小文" />
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">气泡标签</div>
            <Input value={p.label || ''} onChange={(v) => updatePoint(p.id, { label: v })} placeholder="标签" />
          </div>

          <div>
            <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
              <span>副标题</span>
              <span className="text-[11px] text-orange-500">（主页数字人名字框正下方的小字，参考图1风格）</span>
            </div>
            <Input value={p.subtitle || ''} onChange={(v) => updatePoint(p.id, { subtitle: v })}
              placeholder="木雅语学习智能体" />
            {p.subtitle && (
              <div className="mt-1.5 p-2 bg-black/70 rounded text-center">
                <div className="inline-block" style={{
                  background: 'rgba(140, 190, 230, 0.95)', color: '#fff',
                  padding: '3px 16px', borderRadius: 999, fontSize: 13, fontWeight: 500,
                }}>{p.label || p.name}</div>
                <div className="text-white text-xs mt-1" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.7)' }}>{p.subtitle}</div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-slate-500 mb-1">主页标签位置</div>
              <Segmented
                value={(p.homeLabelPosition as 'top' | 'bottom') || 'bottom'}
                options={[
                  { value: 'bottom', label: '下方' },
                  { value: 'top', label: '上方' },
                ]}
                onChange={(v) => updatePoint(p.id, { homeLabelPosition: v })}
              />
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">主页标签样式</div>
              <Segmented
                value={(p.homeLabelStyle as 'bubble' | 'card') || 'card'}
                options={[
                  { value: 'card', label: '卡片' },
                  { value: 'bubble', label: '气泡' },
                ]}
                onChange={(v) => updatePoint(p.id, { homeLabelStyle: v })}
              />
            </div>
          </div>

          {/* 标签偏移：可微调气泡/卡片与数字人之间的距离 */}
          <div className="rounded border border-slate-200 bg-slate-50/50 px-3 py-2">
            <div className="text-xs text-slate-500 mb-2">标签偏移（像素）<span className="text-[10px] text-orange-500">拖动或输入数值微调标签与数字人的距离</span></div>
            <div className="grid grid-cols-2 gap-3">
              <SliderRow
                label="垂直偏移"
                min={-80}
                max={80}
                step={1}
                value={p.labelOffsetY || 0}
                onChange={(v) => updatePoint(p.id, { labelOffsetY: v })}
                suffix="px"
              />
              <SliderRow
                label="水平偏移"
                min={-80}
                max={80}
                step={1}
                value={p.labelOffsetX || 0}
                onChange={(v) => updatePoint(p.id, { labelOffsetX: v })}
                suffix="px"
              />
            </div>
          </div>

          {/* 显示开关：是否显示名字 / 是否显示副标题 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded px-3 py-2">
              <div>
                <div className="text-xs font-medium text-slate-700">显示名字</div>
                <div className="text-[10px] text-slate-400">关闭后数字人下方无名字框</div>
              </div>
              <Switch
                size="small"
                value={p.showName !== false}
                onChange={(v) => updatePoint(p.id, { showName: v })}
              />
            </div>
            <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded px-3 py-2">
              <div>
                <div className="text-xs font-medium text-slate-700">显示副标题</div>
                <div className="text-[10px] text-slate-400">关闭后只显示名字框（需先填副标题）</div>
              </div>
              <Switch
                size="small"
                value={p.showSubtitle !== false}
                onChange={(v) => updatePoint(p.id, { showSubtitle: v })}
              />
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-500 mb-1">挥手 GIF（主页 wave 动画）</div>
            <div className="flex items-center gap-2">
              <Button size="small" variant="outline" icon={<UploadIcon size={12} />}
                onClick={() => triggerGifUpload((url) => updatePoint(p.id, { waveGifUrl: url }))}>
                上传 wave
              </Button>
              <Input value={p.waveGifUrl || ''} onChange={(v) => updatePoint(p.id, { waveGifUrl: v })}
                placeholder="/uploads/gif/xxx.gif（主页）" />
            </div>
            {p.waveGifUrl && (
              <div className="mt-2 flex items-center gap-2">
                <img src={p.waveGifUrl} className="w-16 h-16 object-contain bg-slate-100 rounded" />
              </div>
            )}
          </div>

          <div>
            <div className="text-xs text-slate-500 mb-1">对话 GIF（跳转页 speak 动画）</div>
            <div className="flex items-center gap-2">
              <Button size="small" variant="outline" icon={<UploadIcon size={12} />}
                onClick={() => triggerGifUpload((url) => updatePoint(p.id, { gifUrl: url }))}>
                上传 speak
              </Button>
              <Input value={p.gifUrl} onChange={(v) => updatePoint(p.id, { gifUrl: v })}
                placeholder="/uploads/gif/xxx.gif（跳转页）" />
            </div>
            {p.gifUrl && (
              <div className="mt-2 flex items-center gap-2">
                <img src={p.gifUrl} className="w-16 h-16 object-contain bg-slate-100 rounded" />
              </div>
            )}
          </div>

          <div>
            <div className="text-xs text-slate-500 mb-1 flex items-center justify-between">
              <span>主页数字人大小</span>
              <span className="text-blue-600 font-mono">{p.size || 120}px</span>
            </div>
            <div style={{ width: '100%', padding: '4px 0' }}>
              <Slider value={p.size || 120} min={40} max={400} step={10}
                onChange={(v: any) => updatePoint(p.id, { size: Number(v) })} />
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-500 mb-1">主页面位置（左上 0,0 右下 100,100）</div>
            <div className="flex items-center gap-2">
              <Input value={String(p.homePosition?.x ?? 50)}
                onChange={(v) => updatePoint(p.id, { homePosition: { x: Number(v) || 0, y: p.homePosition?.y ?? 50 } })}
                placeholder="x %" />
              <Input value={String(p.homePosition?.y ?? 50)}
                onChange={(v) => updatePoint(p.id, { homePosition: { x: p.homePosition?.x ?? 50, y: Number(v) || 0 } })}
                placeholder="y %" />
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-500 mb-1">跳转页位置（默认左下 12, 78）</div>
            <div className="flex items-center gap-2">
              <Input value={String(p.portalPosition?.x ?? 12)}
                onChange={(v) => updatePoint(p.id, { portalPosition: { x: Number(v) || 0, y: p.portalPosition?.y ?? 78 } })}
                placeholder="x %" />
              <Input value={String(p.portalPosition?.y ?? 78)}
                onChange={(v) => updatePoint(p.id, { portalPosition: { x: p.portalPosition?.x ?? 12, y: Number(v) || 0 } })}
                placeholder="y %" />
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-500 mb-1">跳转页标题</div>
            <Input value={p.pageTitle || ''} onChange={(v) => updatePoint(p.id, { pageTitle: v })}
              placeholder="3D 空间 · 小文" />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">启用 RAGFlow 对话</span>
              <Switch value={p.ragflow?.enabled !== false}
                onChange={(v: any) => updatePoint(p.id, { ragflow: { ...(p.ragflow || {}), enabled: v } })} />
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-500 mb-1">欢迎语</div>
            <Input value={p.ragflow?.welcomeMessage || ''}
              onChange={(v) => updatePoint(p.id, { ragflow: { ...(p.ragflow || {}), welcomeMessage: v } })}
              placeholder="你好，我是…" />
          </div>

          <div>
            <div className="text-xs text-slate-500 mb-1">RAGFlow Dataset ID（留空用全局「muya」）</div>
            <Input value={p.ragflow?.datasetId || ''}
              onChange={(v) => updatePoint(p.id, { ragflow: { ...(p.ragflow || {}), datasetId: v } })}
              placeholder="留空则按名称查找 muya" />
          </div>
        </div>
      )}
    </div>
  );
}

// ============== 数字人对应空间设置 ==============
function SpacesPanel({
  cfg, currentPoint, setSelectedPointId, setPreviewMode, updatePoint, triggerPortalBgUpload, triggerResourceUpload,
}: {
  cfg: AppConfig;
  currentPoint: PortalPoint | null;
  setSelectedPointId: (id: string) => void;
  setPreviewMode: (m: 'home' | 'portal') => void;
  updatePoint: (id: string, patch: Partial<PortalPoint>) => void;
  triggerPortalBgUpload: (onUrl: (url: string) => void) => void;
  triggerResourceUpload: (onDone: (info: { url: string; filename: string; original: string; size: number; mime: string }) => void) => void;
}) {
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const refreshVoices = () => setBrowserVoices(window.speechSynthesis.getVoices());
    refreshVoices();
    window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', refreshVoices);
  }, []);
  const defaultVoiceSettings = currentPoint?.id === 'muxiaoce'
    ? { role: 'middle-aged-man' as const, rate: 0.9, pitch: 0.78 }
    : currentPoint?.id === 'muxiaozhi'
      ? { role: 'sunny-boy' as const, rate: 1.08, pitch: 1.15 }
      : { role: 'cheerful-girl' as const, rate: 1.04, pitch: 1.12 };
  return (
    <div className="p-3 space-y-3">
      <div className="text-xs text-slate-500 bg-blue-50 border border-blue-200 rounded px-2 py-1.5 leading-relaxed">
        在这里调整每个数字人跳转后的空间样式：数字人大小、空间背景图、聊天框大小（滑块）。点击左侧预览图或此处点位即可切换。
      </div>

      {/* 点位选择 — 横向缩略图 */}
      <div>
        <div className="text-sm font-medium mb-2">选择数字人</div>
        <div className="grid grid-cols-3 gap-2">
          {cfg.points.map((p) => (
            <button
              key={p.id}
              onClick={() => { setSelectedPointId(p.id); setPreviewMode('portal'); }}
              className={`relative p-1 rounded border-2 transition-all ${
                currentPoint?.id === p.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="aspect-square bg-slate-100 rounded overflow-hidden flex items-center justify-center">
                {p.gifUrl ? (
                  <img src={p.gifUrl} className="w-full h-full object-contain" />
                ) : (
                  <span className="text-xs text-slate-400">无图</span>
                )}
              </div>
              <div className="text-[11px] text-center mt-1 truncate">
                {p.ragflow?.title || p.name || p.label || p.id}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 当前点位的空间配置 */}
      {currentPoint ? (
        <div className="border-t pt-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">
              配置「{currentPoint.ragflow?.title || currentPoint.name || currentPoint.label || currentPoint.id}」的空间
            </div>
            <Button size="small" variant="outline" icon={<Eye size={12} />}
                            onClick={() => window.open(`/wisdom-space/portal/${currentPoint.id}`, '_blank')}>
              打开
            </Button>
          </div>

          {/* 角色化空间与聊天交互 */}
          <div className="p-3 rounded border border-indigo-200 bg-gradient-to-br from-indigo-50 to-cyan-50 space-y-3">
            <div>
              <div className="text-sm font-medium text-indigo-900">角色化空间与聊天交互</div>
              <div className="text-[10px] text-indigo-700 mt-0.5">
                控制当前数字人的任务模式、在线测评、快捷问题、联网权限和聊天配色；保存后同步到用户空间。
              </div>
            </div>
            <div>
              <div>
                <div className="text-xs text-slate-600 mb-1">智能体模式</div>
                <select
                  className="w-full px-2 py-1.5 text-xs border rounded bg-white"
                  value={currentPoint.assistantMode || (currentPoint.id === 'muxiaoce' ? 'assessment' : currentPoint.id === 'muxiaowen' ? 'language-learning' : currentPoint.id === 'muxiaozhi' ? 'culture-guide' : 'general')}
                  onChange={(e) => updatePoint(currentPoint.id, { assistantMode: e.target.value as PortalPoint['assistantMode'] })}
                >
                  <option value="assessment">测评模式（知识库抽题/选择判分）</option>
                  <option value="language-learning">五语学习模式（RAGFlow/章节）</option>
                  <option value="culture-guide">文化知识模式（知识库/可信联网）</option>
                  <option value="general">通用知识库问答</option>
                </select>
              </div>
            </div>
            {(currentPoint.assistantMode === 'assessment' || (!currentPoint.assistantMode && currentPoint.id === 'muxiaoce')) && (
              <div className="grid grid-cols-2 gap-3 rounded border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center justify-between rounded border border-amber-200 bg-white/80 px-3 py-2">
                  <div>
                    <div className="text-xs font-medium text-amber-900">启用知识库在线测评</div>
                    <div className="text-[10px] text-amber-700">用户选择答案后立即判分并分析错题</div>
                  </div>
                  <Switch size="small" value={currentPoint.quizEnabled !== false}
                    onChange={(v) => updatePoint(currentPoint.id, { quizEnabled: v })} />
                </div>
                <div>
                  <div className="text-xs font-medium text-amber-900 mb-1">默认题目数量</div>
                  <select className="w-full rounded border border-amber-200 bg-white px-2 py-2 text-xs"
                    value={currentPoint.quizQuestionCount || 5}
                    onChange={(e) => updatePoint(currentPoint.id, { quizQuestionCount: Number(e.target.value) })}>
                    {[5, 10, 15, 20].map((value) => <option key={value} value={value}>{value} 题</option>)}
                  </select>
                </div>
              </div>
            )}
            {(currentPoint.assistantMode === 'culture-guide' || (!currentPoint.assistantMode && currentPoint.id === 'muxiaozhi')) && (
              <div className="flex items-center justify-between rounded border border-sky-200 bg-sky-50 px-3 py-2">
                <div>
                  <div className="text-xs font-medium text-sky-800">RAGFlow 零命中时允许可信联网</div>
                  <div className="text-[10px] text-sky-600">仍受高级配置中的 Tavily 开关和可信域名白名单限制</div>
                </div>
                <Switch size="small" value={currentPoint.allowWebSearch !== false}
                  onChange={(v) => updatePoint(currentPoint.id, { allowWebSearch: v })} />
              </div>
            )}
            <div>
              <div className="text-xs text-slate-600 mb-1">快捷问题（每行一个，留空使用角色默认值）</div>
              <textarea
                value={(currentPoint.quickPrompts || []).join('\n')}
                onChange={(e) => updatePoint(currentPoint.id, { quickPrompts: e.target.value.split('\n').map((item) => item.trim()).filter(Boolean) })}
                rows={4}
                placeholder={'例如：\n“你好”的木雅语怎么说？\n按章节学习问候语'}
                className="w-full rounded border border-indigo-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-indigo-400"
              />
            </div>
            <div className="rounded border border-indigo-200 bg-white/80 px-3 py-2">
              <SliderRow
                label="聊天字号（同步2D与3D）"
                min={16} max={24} step={1}
                value={currentPoint.chatFontSize || 17}
                onChange={(value) => updatePoint(currentPoint.id, { chatFontSize: value })}
                suffix="px"
              />
              <div className="mt-1 text-[11px] text-indigo-700">正文、五语表格、来源说明、快捷问题和输入框会一起放大。</div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                ['主题强调色', 'chatAccentColor', currentPoint.id === 'muxiaoce' ? '#9A6D36' : currentPoint.id === 'muxiaowen' ? '#9B4A3F' : '#667553'],
                ['面板底色', 'chatPanelColor', '#FBF8F1'],
                ['主要文字', 'chatTextColor', '#2F2924'],
                ['次要文字', 'chatMutedTextColor', '#82776D'],
              ].map(([label, key, fallback]) => (
                <div key={key}>
                  <div className="text-[10px] text-slate-500 mb-1">{label}</div>
                  <input type="color" className="w-full h-8 rounded border cursor-pointer"
                    value={normalizeColor((currentPoint as any)[key], fallback)}
                    onChange={(e) => updatePoint(currentPoint.id, { [key]: e.target.value } as Partial<PortalPoint>)} />
                </div>
              ))}
            </div>
          </div>

          {/* 顶部标签 + 工具按钮 */}
          <div className="p-3 bg-gradient-to-br from-amber-50 to-orange-50 rounded border border-amber-200 space-y-3">
            <div className="text-sm font-medium flex items-center gap-1">
              <TypeIcon size={14} /> 顶部标签 + 工具按钮
              <span className="text-[11px] text-amber-700 font-normal ml-1">（参考图2风格）</span>
            </div>

            {/* 顶部三栏显示/隐藏开关 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between bg-white/70 border border-amber-200 rounded px-3 py-2">
                <div>
                  <div className="text-xs font-medium text-slate-700">显示顶部三栏</div>
                  <div className="text-[10px] text-slate-400">关闭后整个顶部（返回/标签/工具）都不显示</div>
                </div>
                <Switch
                  size="small"
                  value={currentPoint.showTopBar !== false}
                  onChange={(v) => updatePoint(currentPoint.id, { showTopBar: v })}
                />
              </div>
              <div className="flex items-center justify-between bg-white/70 border border-amber-200 rounded px-3 py-2">
                <div>
                  <div className="text-xs font-medium text-slate-700">显示工具按钮区</div>
                  <div className="text-[10px] text-slate-400">关闭后只保留返回按钮 + 标题</div>
                </div>
                <Switch
                  size="small"
                  value={currentPoint.showTopBarTools !== false}
                  onChange={(v) => updatePoint(currentPoint.id, { showTopBarTools: v })}
                />
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-500 mb-1">顶部居中标题文字</div>
              <Input value={currentPoint.topBarTitle || ''}
                onChange={(v) => updatePoint(currentPoint.id, { topBarTitle: v })}
                placeholder="留空则用「气泡标签」或「名称」" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                  <Palette size={12} /> 标题背景色
                </div>
                <div className="flex items-center gap-2">
                  <input type="color" value={currentPoint.topBarColor || '#C8362D'}
                    onChange={(e) => updatePoint(currentPoint.id, { topBarColor: e.target.value })}
                    className="w-10 h-8 rounded border cursor-pointer"
                  />
                  <Input value={currentPoint.topBarColor || '#C8362D'}
                    onChange={(v) => updatePoint(currentPoint.id, { topBarColor: v })}
                    placeholder="#C8362D" />
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                  <Palette size={12} /> 标题文字色
                </div>
                <div className="flex items-center gap-2">
                  <input type="color" value={currentPoint.topBarTextColor || '#FFFFFF'}
                    onChange={(e) => updatePoint(currentPoint.id, { topBarTextColor: e.target.value })}
                    className="w-10 h-8 rounded border cursor-pointer"
                  />
                  <Input value={currentPoint.topBarTextColor || '#FFFFFF'}
                    onChange={(v) => updatePoint(currentPoint.id, { topBarTextColor: v })}
                    placeholder="#FFFFFF" />
                </div>
              </div>
            </div>

            {/* ========== 工具按钮样式 ========== */}
            <div className="border border-slate-300 rounded p-2 bg-slate-50 space-y-2">
              <div className="text-xs text-slate-600 flex items-center gap-1">
                <Palette size={12} /> 工具按钮样式（颜色 / 形状 / 尺寸）
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[11px] text-slate-500 mb-0.5">背景色</div>
                  <div className="flex items-center gap-1">
                    <input type="color" value={normalizeColor(currentPoint.topBarButtonBg) || '#3A4759'}
                      onChange={(e) => updatePoint(currentPoint.id, { topBarButtonBg: e.target.value })}
                      className="w-9 h-7 rounded border cursor-pointer" />
                    <Input value={currentPoint.topBarButtonBg || ''}
                      onChange={(v) => updatePoint(currentPoint.id, { topBarButtonBg: v })}
                      placeholder="留空 = 玻璃白" />
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 mb-0.5">悬停背景色</div>
                  <div className="flex items-center gap-1">
                    <input type="color" value={normalizeColor(currentPoint.topBarButtonHoverBg) || '#5A6B80'}
                      onChange={(e) => updatePoint(currentPoint.id, { topBarButtonHoverBg: e.target.value })}
                      className="w-9 h-7 rounded border cursor-pointer" />
                    <Input value={currentPoint.topBarButtonHoverBg || ''}
                      onChange={(v) => updatePoint(currentPoint.id, { topBarButtonHoverBg: v })}
                      placeholder="留空 = 亮一档" />
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 mb-0.5">图标色</div>
                  <div className="flex items-center gap-1">
                    <input type="color" value={currentPoint.topBarButtonColor || '#FFFFFF'}
                      onChange={(e) => updatePoint(currentPoint.id, { topBarButtonColor: e.target.value })}
                      className="w-9 h-7 rounded border cursor-pointer" />
                    <Input value={currentPoint.topBarButtonColor || ''}
                      onChange={(v) => updatePoint(currentPoint.id, { topBarButtonColor: v })}
                      placeholder="#FFFFFF" />
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 mb-0.5">边框色</div>
                  <div className="flex items-center gap-1">
                    <input type="color" value={normalizeColor(currentPoint.topBarButtonBorderColor) || '#FFFFFF'}
                      onChange={(e) => updatePoint(currentPoint.id, { topBarButtonBorderColor: e.target.value })}
                      className="w-9 h-7 rounded border cursor-pointer" />
                    <Input value={currentPoint.topBarButtonBorderColor || ''}
                      onChange={(v) => updatePoint(currentPoint.id, { topBarButtonBorderColor: v })}
                      placeholder="rgba(255,255,255,0.45)" />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mb-0.5">
                    <span>按钮尺寸</span>
                    <span className="text-blue-600 font-mono">{currentPoint.topBarButtonSize ?? 36}px</span>
                  </div>
                  <input type="range" min={24} max={72} step={2}
                    value={currentPoint.topBarButtonSize ?? 36}
                    onChange={(e) => updatePoint(currentPoint.id, { topBarButtonSize: Number(e.target.value) })}
                    className="w-full accent-blue-500" style={{ display: 'block', width: '100%' }} />
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 mb-0.5">按钮形状</div>
                  <div className="flex items-center gap-1">
                    <Button size="small"
                      theme={(currentPoint.topBarButtonShape ?? 'circle') !== 'square' ? 'primary' : 'default'}
                      variant={(currentPoint.topBarButtonShape ?? 'circle') !== 'square' ? 'base' : 'outline'}
                      onClick={() => updatePoint(currentPoint.id, { topBarButtonShape: 'circle' })}>
                      圆形
                    </Button>
                    <Button size="small"
                      theme={(currentPoint.topBarButtonShape ?? 'circle') === 'square' ? 'primary' : 'default'}
                      variant={(currentPoint.topBarButtonShape ?? 'circle') === 'square' ? 'base' : 'outline'}
                      onClick={() => updatePoint(currentPoint.id, { topBarButtonShape: 'square' })}>
                      方形
                    </Button>
                  </div>
                </div>
              </div>
              {/* 实时预览 */}
              <div className="bg-black rounded p-3 flex items-center justify-end" style={{ minHeight: 56 }}>
                <div className="flex items-center gap-1.5">
                  {(currentPoint.topBarTools || []).filter((t) => t.enabled !== false).map((tool) => (
                    <div key={tool.id}
                      title={tool.label}
                      className="flex items-center justify-center text-xs"
                      style={{
                        width: currentPoint.topBarButtonSize ?? 36,
                        height: currentPoint.topBarButtonSize ?? 36,
                        borderRadius: (currentPoint.topBarButtonShape ?? 'circle') === 'circle' ? '50%' : '8px',
                        background: currentPoint.topBarButtonBg || 'rgba(255,255,255,0.18)',
                        color: currentPoint.topBarButtonColor || '#FFFFFF',
                        border: `1px solid ${currentPoint.topBarButtonBorderColor || 'rgba(255,255,255,0.45)'}`,
                      }}>
                      {tool.icon === 'audio' ? '🔊' :
                       tool.icon === 'info' ? 'ℹ' :
                       tool.icon === 'back' ? '←' :
                       tool.icon === 'home' ? '⌂' :
                       tool.icon === 'settings' ? '⚙' :
                       tool.icon?.charAt(0) || '?'}
                    </div>
                  ))}
                </div>
                <div className="text-[10px] text-white/40 ml-3">↑ 工具按钮实时预览</div>
              </div>
            </div>

            {/* 实时预览 */}
            <div className="bg-black rounded p-3 text-center" style={{ minHeight: 40 }}>
              <div className="inline-block" style={{
                background: currentPoint.topBarColor || '#C8362D',
                color: currentPoint.topBarTextColor || '#FFFFFF',
                padding: '4px 16px',
                borderRadius: 4,
                fontSize: 13,
                fontWeight: 600,
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
              }}>{currentPoint.topBarTitle || currentPoint.label || currentPoint.name}</div>
              <div className="text-[10px] text-white/40 mt-2">↑ 实际顶部居中标题预览</div>
            </div>

            {/* 工具按钮列表 */}
            <div className="border-t border-amber-300 pt-2 mt-2">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-slate-600 flex items-center gap-1">
                  <Volume2 size={12} /> 右侧工具按钮
                  <span className="text-amber-700">（图标 / 行为 / 启用）</span>
                </div>
                <Button size="small" variant="outline" icon={<Plus size={12} />}
                  onClick={() => {
                    const tools = [...(currentPoint.topBarTools || [])];
                    tools.push({
                      id: 'tool_' + Date.now().toString(36).slice(-6),
                      icon: 'info',
                      label: '新工具',
                      enabled: true,
                      type: 'info',
                    });
                    updatePoint(currentPoint.id, {
                      topBarTools: tools,
                      // 添加工具即代表希望显示它，避免该数字人之前关闭工具区后“配置了却看不到”。
                      showTopBar: true,
                      showTopBarTools: true,
                    });
                  }}>
                  + 添加工具
                </Button>
              </div>

              {(currentPoint.topBarTools || []).length === 0 && (
                <div className="text-xs text-slate-400 text-center py-2 border-2 border-dashed border-slate-200 rounded">
                  还没有工具按钮，点击「+ 添加工具」添加
                </div>
              )}

              {(currentPoint.topBarTools || []).map((tool, idx) => (
                <div key={tool.id} className="border border-slate-200 rounded p-2 mb-2 bg-white space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400 font-mono w-12 shrink-0">{tool.id}</span>
                    <Switch size="small" value={tool.enabled !== false}
                      onChange={(v: any) => {
                        const tools = [...(currentPoint.topBarTools || [])];
                        tools[idx] = { ...tools[idx], enabled: v };
                        updatePoint(currentPoint.id, { topBarTools: tools });
                      }} />
                    <span className="text-[11px] text-slate-500">{tool.enabled !== false ? '启用' : '禁用'}</span>
                    <div className="flex-1" />
                    <Button size="small" variant="text"
                      onClick={() => {
                        const tools = (currentPoint.topBarTools || []).filter((_, j) => j !== idx);
                        updatePoint(currentPoint.id, { topBarTools: tools });
                      }}>
                      <Trash2 size={12} className="text-red-500" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[11px] text-slate-500 mb-0.5">图标</div>
                      <select
                        className="w-full px-2 py-1 text-xs border rounded bg-white"
                        value={tool.icon}
                        onChange={(e) => {
                          const tools = [...(currentPoint.topBarTools || [])];
                          tools[idx] = { ...tools[idx], icon: e.target.value };
                          updatePoint(currentPoint.id, { topBarTools: tools });
                        }}
                      >
                        <option value="audio">🔊 喇叭（audio）</option>
                        <option value="info">ℹ️ 信息（info）</option>
                        <option value="back">← 返回（back）</option>
                        <option value="home">🏠 主页（home）</option>
                        <option value="settings">⚙️ 设置（settings）</option>
                        <option value="🎤">🎤 麦克风</option>
                        <option value="📚">📚 书本</option>
                        <option value="🎵">🎵 音乐</option>
                      </select>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500 mb-0.5">行为</div>
                      <select
                        className="w-full px-2 py-1 text-xs border rounded bg-white"
                        value={tool.type || 'audio'}
                        onChange={(e) => {
                          const tools = [...(currentPoint.topBarTools || [])];
                          tools[idx] = { ...tools[idx], type: e.target.value as TopBarTool['type'] };
                          updatePoint(currentPoint.id, { topBarTools: tools });
                        }}
                      >
                        <option value="audio">语音讲解（自动朗读 / 点击重播）</option>
                        <option value="info">信息（占位）</option>
                        <option value="back">返回上一页</option>
                        <option value="home">返回主页</option>
                        <option value="settings">设置（占位）</option>
                        <option value="link">打开链接</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] text-slate-500 mb-0.5">悬停提示（label）</div>
                    <Input value={tool.label}
                      onChange={(v) => {
                        const tools = [...(currentPoint.topBarTools || [])];
                        tools[idx] = { ...tools[idx], label: v };
                        updatePoint(currentPoint.id, { topBarTools: tools });
                      }} />
                  </div>

                  {tool.type === 'link' && (
                    <div>
                      <div className="text-[11px] text-slate-500 mb-0.5">链接地址（target）</div>
                      <Input value={tool.target || ''}
                        onChange={(v) => {
                          const tools = [...(currentPoint.topBarTools || [])];
                          tools[idx] = { ...tools[idx], target: v };
                          updatePoint(currentPoint.id, { topBarTools: tools });
                        }}
                        placeholder="https://... 或 /portal/xxx" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 数字人说话动画切换（speak/wave） */}
          <div className="p-3 bg-gradient-to-br from-indigo-50 to-blue-50 rounded border border-indigo-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium flex items-center gap-1">
                  <Volume2 size={14} /> 说话动画切换（speak / wave）
                </div>
                <div className="text-[10px] text-indigo-700 mt-0.5">
                  空闲和回答完毕时显示「挥手 wave」动画，AI 正在作答时自动切换为「说话 speak」动画
                </div>
              </div>
              <Switch
                size="small"
                value={currentPoint.speakAnimEnabled !== false}
                onChange={(v) => updatePoint(currentPoint.id, { speakAnimEnabled: v })}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-indigo-200">
              <div>
                <div className="text-[11px] text-slate-600 mb-1">数字人音色</div>
                <select
                  className="w-full px-2 py-1.5 text-xs border border-indigo-200 rounded bg-white"
                  value={currentPoint.voiceRole || defaultVoiceSettings.role}
                  onChange={(e) => updatePoint(currentPoint.id, { voiceRole: e.target.value as PortalPoint['voiceRole'] })}
                >
                  <option value="middle-aged-man">中年男声</option>
                  <option value="sunny-boy">青少年阳光男孩音</option>
                  <option value="cheerful-girl">开朗女孩音</option>
                </select>
              </div>
              <SliderRow
                label="语速"
                min={0.6} max={1.5} step={0.02}
                value={currentPoint.voiceRate ?? defaultVoiceSettings.rate}
                onChange={(v) => updatePoint(currentPoint.id, { voiceRate: v })}
                suffix="x"
              />
              <SliderRow
                label="音调"
                min={0.5} max={1.5} step={0.02}
                value={currentPoint.voicePitch ?? defaultVoiceSettings.pitch}
                onChange={(v) => updatePoint(currentPoint.id, { voicePitch: v })}
                suffix="x"
              />
              <div className="md:col-span-2">
                <div className="text-[11px] text-slate-600 mb-1">浏览器实际声音（可精确选择男声/女声）</div>
                <select
                  className="w-full px-2 py-1.5 text-xs border border-indigo-200 rounded bg-white"
                  value={currentPoint.voiceName || ''}
                  onChange={(e) => updatePoint(currentPoint.id, { voiceName: e.target.value || undefined })}
                >
                  <option value="">自动匹配所选音色类型</option>
                  {browserVoices.map((voice) => (
                    <option key={voice.voiceURI} value={voice.name}>
                      {voice.name} · {voice.lang}{voice.localService ? '' : ' · Online'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <Button
                  size="small"
                  variant="outline"
                  icon={<Volume2 size={12} />}
                  onClick={() => {
                    stopSpeech();
                    void speakAnswer(
                      `你好，我是${currentPoint.ragflow?.title || currentPoint.name || currentPoint.id}，这是当前声音试听。`,
                      currentPoint.id,
                      {},
                      {
                        role: currentPoint.voiceRole || defaultVoiceSettings.role,
                        voiceName: currentPoint.voiceName,
                        rate: currentPoint.voiceRate ?? defaultVoiceSettings.rate,
                        pitch: currentPoint.voicePitch ?? defaultVoiceSettings.pitch,
                      },
                    );
                  }}
                >试听当前声音</Button>
              </div>
              <div className="md:col-span-3 text-[10px] text-indigo-600/80">
                语音在用户浏览器中实时合成，不读取AutoDL服务器本地音频文件。
              </div>
            </div>

            {currentPoint.speakAnimEnabled !== false && (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-indigo-200">
                <div className="bg-white/70 border border-indigo-100 rounded p-2 text-center">
                  <div className="text-[11px] text-slate-500 mb-1">空闲时（wave 挥手）</div>
                  <div className="aspect-square bg-slate-100 rounded overflow-hidden flex items-center justify-center">
                    {currentPoint.waveGifUrl || currentPoint.gifUrl ? (
                      <img
                        src={currentPoint.waveGifUrl || currentPoint.gifUrl}
                        className="w-full h-full object-contain"
                        title={currentPoint.waveGifUrl ? '' : '未配置 wave GIF，暂用 speak GIF 代替'}
                      />
                    ) : (
                      <span className="text-xs text-slate-400">未配置</span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1 truncate">
                    {currentPoint.waveGifUrl ? 'waveGifUrl' : '未配置 wave → 用 speak'}
                  </div>
                </div>
                <div className="bg-white/70 border border-indigo-100 rounded p-2 text-center">
                  <div className="text-[11px] text-slate-500 mb-1">作答时（speak 说话）</div>
                  <div className="aspect-square bg-slate-100 rounded overflow-hidden flex items-center justify-center">
                    {currentPoint.gifUrl ? (
                      <img src={currentPoint.gifUrl} className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-xs text-slate-400">未配置</span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1 truncate">gifUrl</div>
                </div>
                <div className="col-span-2 text-[10px] text-indigo-600/80 leading-relaxed">
                  GIF 素材可在「数字人点位」页签中上传/修改（挥手 GIF = wave，对话 GIF = speak）。
                </div>
              </div>
            )}
          </div>

          {/* 空间背景图 */}
          <div>
            <div className="text-xs text-slate-500 mb-1">空间背景图</div>
            <div className="bg-slate-100 rounded overflow-hidden mb-2 border" style={{ aspectRatio: '16/9' }}>
              {currentPoint.portalBg || cfg.defaultPortalBg ? (
                <img src={currentPoint.portalBg || cfg.defaultPortalBg} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">未设置</div>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="small" theme="primary" icon={<UploadIcon size={12} />}
                onClick={() => triggerPortalBgUpload((url) => updatePoint(currentPoint.id, { portalBg: url }))}>
                上传空间背景
              </Button>
              {currentPoint.portalBg && (
                <Button size="small" variant="outline"
                  onClick={() => updatePoint(currentPoint.id, { portalBg: '' })}>
                  清除自定义
                </Button>
              )}
            </div>
            <Input
              className="mt-2"
              value={currentPoint.portalBg || ''}
              onChange={(v) => updatePoint(currentPoint.id, { portalBg: v })}
              placeholder="留空则使用「主页设置 → 默认空间背景」"
            />
          </div>

          {/* 滑块区 */}
          <div className="p-3 bg-slate-50 rounded space-y-3">
            <SliderRow
              label="数字人大小"
              min={120} max={600} step={10}
              value={currentPoint.portalSize || 400}
              onChange={(v) => updatePoint(currentPoint.id, { portalSize: v })}
              suffix="px"
            />
            <div className="grid grid-cols-2 gap-3">
              <SliderRow
                label="说话状态缩放"
                min={0.5} max={2.0} step={0.05}
                value={currentPoint.speakScale ?? 1}
                onChange={(v) => updatePoint(currentPoint.id, { speakScale: v })}
                suffix="x"
              />
              <SliderRow
                label="挥手状态缩放"
                min={0.5} max={2.0} step={0.05}
                value={currentPoint.waveScale ?? 1}
                onChange={(v) => updatePoint(currentPoint.id, { waveScale: v })}
                suffix="x"
              />
            </div>

            {/* 数字人状态预览与偏移调整 */}
            <HumanPreview currentPoint={currentPoint} updatePoint={updatePoint} />

            <div className="grid grid-cols-2 gap-3">
              <SliderRow
                label="说话状态Y偏移"
                min={-100} max={100} step={1}
                value={currentPoint.speakOffsetY ?? 0}
                onChange={(v) => updatePoint(currentPoint.id, { speakOffsetY: v })}
                suffix="px"
              />
              <SliderRow
                label="挥手状态Y偏移"
                min={-100} max={100} step={1}
                value={currentPoint.waveOffsetY ?? 0}
                onChange={(v) => updatePoint(currentPoint.id, { waveOffsetY: v })}
                suffix="px"
              />
            </div>
            <SliderRow
              label="聊天框宽度"
              min={480} max={1400} step={20}
              value={currentPoint.chatWidth ?? 820}
              onChange={(v) => updatePoint(currentPoint.id, { chatWidth: v })}
              suffix="px"
            />
            <SliderRow
              label="聊天框高度"
              min={400} max={900} step={20}
              value={currentPoint.chatHeight ?? 680}
              onChange={(v) => updatePoint(currentPoint.id, { chatHeight: v })}
              suffix="px"
            />
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
              <SliderRow
                label="数字人水平位置"
                min={5} max={95} step={1}
                value={currentPoint.portalPosition?.x ?? 12}
                onChange={(v) => updatePoint(currentPoint.id, {
                  portalPosition: { x: v, y: currentPoint.portalPosition?.y ?? 78 },
                })}
                suffix="%"
              />
              <SliderRow
                label="数字人垂直位置"
                min={20} max={95} step={1}
                value={currentPoint.portalPosition?.y ?? 78}
                onChange={(v) => updatePoint(currentPoint.id, {
                  portalPosition: { x: currentPoint.portalPosition?.x ?? 12, y: v },
                })}
                suffix="%"
              />
            </div>

            {/* ========== 空间功能按钮（可复用的浮动按钮组件，每个数字人空间独立配置） ========== */}
          <div className="p-3 bg-gradient-to-br from-violet-50 to-fuchsia-50 rounded border border-violet-200 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium flex items-center gap-1 text-violet-800">
                  <Hand size={14} /> 空间功能按钮
                  <span className="text-[10px] text-violet-600 font-normal">（可任意增删 · 各数字人独立）</span>
                </div>
                <div className="text-[10px] text-violet-700 mt-0.5">
                  在数字人空间上添加任意多个浮动按钮（打开资源 / 跳转链接 / 占位按钮等），不同数字人可独立配置
                </div>
              </div>
              <Button
                size="small"
                theme="primary"
                variant="outline"
                icon={<Plus size={12} />}
                onClick={() => {
                  const buttons = [...(currentPoint.actionButtons || [])];
                  buttons.push({
                    id: 'btn_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
                    icon: 'Paperclip',
                    label: '新按钮',
                    enabled: true,
                    size: 52,
                    position: { x: 96 - (buttons.length * 6), y: 50 + (buttons.length * 6) },
                    action: 'resources',
                  });
                  updatePoint(currentPoint.id, { actionButtons: buttons });
                }}
              >
                + 添加按钮
              </Button>
            </div>

            {/* 按钮列表 */}
            {(currentPoint.actionButtons && currentPoint.actionButtons.length > 0) ? (
              <div className="space-y-2 pt-1">
                {currentPoint.actionButtons.map((btn, idx) => {
                  const allBtns = currentPoint.actionButtons || [];
                  const lastIdx = allBtns.length - 1;
                  const moveUp = (i: number) => {
                    if (i <= 0) return;
                    const arr = [...allBtns];
                    [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
                    updatePoint(currentPoint.id, { actionButtons: arr });
                  };
                  const moveDown = (i: number) => {
                    if (i >= lastIdx) return;
                    const arr = [...allBtns];
                    [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
                    updatePoint(currentPoint.id, { actionButtons: arr });
                  };
                  const patchBtn = (patch: Partial<SpaceActionButton>) => {
                    const arr = [...allBtns];
                    arr[idx] = { ...arr[idx], ...patch };
                    updatePoint(currentPoint.id, { actionButtons: arr });
                  };
                  return (
                    <div
                      key={btn.id}
                      className="bg-white/85 border border-violet-200 rounded p-2.5 space-y-2"
                    >
                      {/* 顶部：开关 + 顺序 + 删除 + 实时 mini 预览 */}
                      <div className="flex items-center gap-2">
                        <Switch
                          size="small"
                          value={btn.enabled !== false}
                          onChange={(v) => patchBtn({ enabled: v })}
                        />
                        <span className="text-[11px] text-slate-500">
                          {btn.enabled !== false ? '启用' : '隐藏'}
                        </span>
                        <div className="flex-1" />
                        <div
                          className="flex flex-col items-center justify-center rounded-full"
                          style={{
                            width: 32, height: 32,
                            background: btn.bgColor ?? 'rgba(10,14,26,0.85)',
                            border: `1px solid ${btn.borderColor ?? 'rgba(255,255,255,0.35)'}`,
                            color: btn.iconColor ?? '#FFFFFF',
                          }}
                          title="按钮预览"
                        >
                          <ActionButtonIcon name={btn.icon} size={16} />
                        </div>
                        <div className="flex items-center gap-0.5">
                          <Button
                            size="small" variant="text"
                            disabled={idx === 0}
                            onClick={() => moveUp(idx)}
                            title="上移"
                          >
                            <ChevronUp size={12} className={idx === 0 ? 'text-slate-300' : 'text-slate-500'} />
                          </Button>
                          <Button
                            size="small" variant="text"
                            disabled={idx === lastIdx}
                            onClick={() => moveDown(idx)}
                            title="下移"
                          >
                            <ChevronDown size={12} className={idx === lastIdx ? 'text-slate-300' : 'text-slate-500'} />
                          </Button>
                        </div>
                        <Button
                          size="small" variant="text"
                          onClick={() => {
                            const arr = allBtns.filter((_, i) => i !== idx);
                            updatePoint(currentPoint.id, { actionButtons: arr });
                          }}
                          title="删除"
                        >
                          <Trash2 size={12} className="text-red-500" />
                        </Button>
                      </div>

                      {/* 图标 + label + 行为 */}
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <div className="text-[11px] text-slate-500 mb-0.5">图标</div>
                          <select
                            className="w-full px-2 py-1 text-xs border rounded bg-white"
                            value={btn.icon}
                            onChange={(e) => patchBtn({ icon: e.target.value })}
                          >
                            {ACTION_BUTTON_ICON_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <div className="text-[11px] text-slate-500 mb-0.5">label（hover 提示）</div>
                          <Input
                            value={btn.label}
                            onChange={(v) => patchBtn({ label: v })}
                            placeholder="例如：打开资源"
                          />
                        </div>
                        <div>
                          <div className="text-[11px] text-slate-500 mb-0.5">行为</div>
                          <select
                            className="w-full px-2 py-1 text-xs border rounded bg-white"
                            value={btn.action || 'resources'}
                            onChange={(e) => patchBtn({ action: e.target.value as SpaceActionButton['action'] })}
                          >
                            <option value="resources">📂 打开资源面板</option>
                            <option value="link">🔗 跳转链接</option>
                            <option value="audio">🔊 语音讲解（自动朗读 / 点击重播）</option>
                            <option value="video">🎬 视频：打开资源面板播放视频</option>
                            <option value="document">📄 文档：打开资源面板查看文档</option>
                            <option value="info">ℹ️ 信息（占位）</option>
                            <option value="custom">⚙️ 自定义（占位）</option>
                          </select>
                        </div>
                      </div>

                      {/* target 仅在 link 时显示 */}
                      {btn.action === 'link' && (
                        <div>
                          <div className="text-[11px] text-slate-500 mb-0.5">链接地址（target）</div>
                          <Input
                            value={btn.target || ''}
                            onChange={(v) => patchBtn({ target: v })}
                            placeholder="https://example.com 或 /portal/xxx"
                          />
                        </div>
                      )}

                      {/* ============ 该按钮独立的文件/视频池（仅 action=resources/video/document 时显示） ============ */}
                      {['resources', 'video', 'document'].includes(btn.action || 'resources') && (
                        <div className="bg-cyan-50/70 border border-cyan-200 rounded p-2 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="text-[11px] text-cyan-800 flex items-center gap-1 font-medium">
                              <Paperclip size={11} /> 该按钮的文件（独立池 · {(btn.files || []).length} 个）
                            </div>
                            <Button size="small" theme="primary" variant="outline"
                              icon={<UploadIcon size={11} />}
                              onClick={() => triggerResourceUpload((info) => {
                                const arr = [...(btn.files || [])];
                                arr.push({
                                  id: 'f_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
                                  name: info.original,
                                  type: info.mime.startsWith('video/') ? 'video'
                                    : info.mime.startsWith('image/') ? 'image'
                                    : info.mime.startsWith('audio/') ? 'other'
                                    : 'document',
                                  url: info.url,
                                  fileName: info.filename,
                                  fileSize: info.size,
                                  mimeType: info.mime,
                                  createdAt: Date.now(),
                                });
                                patchBtn({ files: arr });
                              })}
                            >上传</Button>
                          </div>

                          {/* 文件列表 */}
                          {(btn.files && btn.files.length > 0) ? (
                            <div className="space-y-1">
                              {btn.files.map((f, fIdx) => {
                                const patchFile = (patch: Partial<typeof f>) => {
                                  const files = [...(btn.files || [])];
                                  files[fIdx] = { ...files[fIdx], ...patch };
                                  patchBtn({ files });
                                };
                                return (
                                  <div key={f.id} className="bg-white border border-cyan-100 rounded px-2 py-1.5 text-[11px] space-y-1.5">
                                    <div className="flex items-center gap-1.5">
                                      <span className="flex-shrink-0">
                                        {f.type === 'video' ? <Film size={11} className="text-amber-500" />
                                          : f.type === 'image' ? <ImageIcon size={11} className="text-sky-500" />
                                          : <FileText size={11} className="text-emerald-500" />}
                                      </span>
                                      <span className="flex-1 truncate text-slate-700 font-medium">{f.name}</span>
                                      <span className="text-slate-400 text-[10px]">{(f.fileSize / 1024 / 1024).toFixed(2)} MB</span>
                                      <button onClick={() => patchBtn({ files: (btn.files || []).filter((_, i) => i !== fIdx) })}
                                        className="p-0.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500" title="删除">
                                        <Trash2 size={11} />
                                      </button>
                                    </div>
                                    <div className="grid grid-cols-[110px_1fr] gap-1.5">
                                      <select className="rounded border border-cyan-200 bg-white px-1.5 py-1 text-[10px]"
                                        value={f.usage || (f.type === 'video' ? 'explanation' : 'exam')}
                                        onChange={(e) => patchFile({ usage: e.target.value as typeof f.usage })}>
                                        <option value="exam">测评试卷</option>
                                        <option value="explanation">讲解视频/材料</option>
                                        <option value="reference">参考资料</option>
                                      </select>
                                      <Input value={f.description || ''} onChange={(v) => patchFile({ description: v })}
                                        placeholder="教学用途说明（聊天只读取此说明，不会假装读取文件正文）" />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-center text-[10px] text-cyan-600 py-1.5 border border-dashed border-cyan-200 rounded">
                              这个按钮还没有文件，点「上传」添加
                            </div>
                          )}
                        </div>
                      )}

                      {/* 滑块：大小 + X + Y */}
                      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-violet-100">
                        <div>
                          <div className="flex items-center justify-between text-[11px] text-slate-500 mb-0.5">
                            <span>大小</span>
                            <span className="text-violet-600 font-mono">{btn.size ?? 52}px</span>
                          </div>
                          <input type="range" min={36} max={96} step={2}
                            value={btn.size ?? 52}
                            onChange={(e) => patchBtn({ size: Number(e.target.value) })}
                            className="w-full accent-violet-500" style={{ display: 'block', width: '100%' }} />
                        </div>
                        <div>
                          <div className="flex items-center justify-between text-[11px] text-slate-500 mb-0.5">
                            <span>水平 X</span>
                            <span className="text-violet-600 font-mono">{btn.position?.x ?? 96}%</span>
                          </div>
                          <input type="range" min={2} max={98} step={1}
                            value={btn.position?.x ?? 96}
                            onChange={(e) => patchBtn({ position: { x: Number(e.target.value), y: btn.position?.y ?? 50 } })}
                            className="w-full accent-violet-500" style={{ display: 'block', width: '100%' }} />
                        </div>
                        <div>
                          <div className="flex items-center justify-between text-[11px] text-slate-500 mb-0.5">
                            <span>垂直 Y</span>
                            <span className="text-violet-600 font-mono">{btn.position?.y ?? 50}%</span>
                          </div>
                          <input type="range" min={10} max={90} step={1}
                            value={btn.position?.y ?? 50}
                            onChange={(e) => patchBtn({ position: { x: btn.position?.x ?? 96, y: Number(e.target.value) } })}
                            className="w-full accent-violet-500" style={{ display: 'block', width: '100%' }} />
                        </div>
                      </div>

                      {/* 颜色 + 角标 */}
                      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-violet-100">
                        <div>
                          <div className="text-[11px] text-slate-500 mb-0.5">背景色</div>
                          <div className="flex items-center gap-1">
                            <input type="color"
                              value={normalizeColor(btn.bgColor) || '#0a0e1a'}
                              onChange={(e) => patchBtn({ bgColor: e.target.value })}
                              className="w-9 h-7 rounded border cursor-pointer" />
                            <Input value={btn.bgColor || ''}
                              onChange={(v) => patchBtn({ bgColor: v })}
                              placeholder="rgba(10,14,26,0.85)" />
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] text-slate-500 mb-0.5">图标色</div>
                          <div className="flex items-center gap-1">
                            <input type="color"
                              value={btn.iconColor || '#FFFFFF'}
                              onChange={(e) => patchBtn({ iconColor: e.target.value })}
                              className="w-9 h-7 rounded border cursor-pointer" />
                            <Input value={btn.iconColor || ''}
                              onChange={(v) => patchBtn({ iconColor: v })}
                              placeholder="#FFFFFF" />
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] text-slate-500 mb-0.5">角标数字（badge）</div>
                          <Input value={String(btn.badge ?? '')}
                            onChange={(v) => patchBtn({ badge: v ? Number(v) : 0 })}
                            placeholder="留空 = 不显示"
                            type="number" />
                        </div>
                      </div>

                      {/* 大预览 */}
                      <div className="bg-black/80 rounded p-3 flex items-center justify-center gap-3" style={{ minHeight: 64 }}>
                        <div
                          className="flex flex-col items-center justify-center rounded-full"
                          style={{
                            width: btn.size ?? 52,
                            height: btn.size ?? 52,
                            background: btn.bgColor ?? 'rgba(10,14,26,0.85)',
                            border: `1px solid ${btn.borderColor ?? 'rgba(255,255,255,0.35)'}`,
                            color: btn.iconColor ?? '#FFFFFF',
                            backdropFilter: 'blur(10px)',
                            WebkitBackdropFilter: 'blur(10px)',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                          }}
                        >
                          <ActionButtonIcon name={btn.icon} size={Math.max(12, Math.round((btn.size ?? 52) * 0.42))} />
                          {btn.badge && btn.badge > 0 && (
                            <span style={{ fontSize: Math.max(8, Math.round((btn.size ?? 52) * 0.22)), marginTop: 2, fontWeight: 700 }}>
                              {btn.badge}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-white/50 leading-relaxed">
                          <div>↑ 实际效果预览</div>
                          <div>大小: {btn.size ?? 52}px · 位置: ({btn.position?.x ?? 96}%, {btn.position?.y ?? 50}%)</div>
                          <div>行为: {btn.action || 'resources'}{btn.target ? ` → ${btn.target}` : ''}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center text-[11px] text-slate-400 py-3 border border-dashed border-violet-200 rounded space-y-1">
                <div>还没有功能按钮，点击「+ 添加按钮」开始配置</div>
                <div className="text-violet-500">
                  提示：行为选「📂 打开资源面板」+ 上传资源后，对应数字人空间会出现资源按钮
                </div>
              </div>
            )}
          </div>

            <div className="text-[11px] text-slate-400 leading-relaxed pt-1">
              拖动滑块后左侧预览会即时变化；点顶部「保存」生效。
            </div>
          </div>

          {/* ========== 图片轮播（知识画廊） ========== */}
          <div className="p-3 bg-gradient-to-br from-sky-50 to-indigo-50 rounded border border-sky-200 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium flex items-center gap-1 text-sky-800">
                  <Images size={14} /> 图片轮播（知识画廊）
                  <span className="text-[10px] text-sky-600 font-normal">（点击图片弹出讲解 + 来源）</span>
                </div>
                <div className="text-[10px] text-sky-700 mt-0.5">
                  在空间页显示图片轮播（如木雅知识介绍）。点击图片会弹出讲解内容，讲解需注明来源网址，确保内容有据可查
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  size="small"
                  value={currentPoint.carouselEnabled !== false}
                  onChange={(v) => updatePoint(currentPoint.id, { carouselEnabled: v })}
                />
                <Button
                  size="small"
                  theme="primary"
                  variant="outline"
                  icon={<Plus size={12} />}
                  onClick={() => {
                    const arr = [...(currentPoint.carouselImages || [])];
                    arr.push({
                      id: 'car_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
                      imageUrl: '',
                      title: '新图片',
                      description: '',
                      sourceUrl: '',
                      sourceName: '',
                    });
                    updatePoint(currentPoint.id, { carouselImages: arr });
                  }}
                >
                  + 添加图片
                </Button>
              </div>
            </div>

            {/* 位置与水平对齐选择器，预览实时刷新 */}
            <div className="bg-sky-100/60 border border-sky-200 rounded px-2.5 py-2 text-[11px] text-sky-700">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">📍 展示位置：</span>
                <Select
                  size="small"
                  style={{ width: 200 }}
                  value={currentPoint.carouselPosition || 'above'}
                  onChange={(v: any) => updatePoint(currentPoint.id, { carouselPosition: v as any })}
                  options={[
                    { label: '⬆️ 顶部（消息列表上方）', value: 'above' },
                    { label: '⬇️ 底部（输入框上方）', value: 'below' },
                    { label: '⬅️ 左侧分栏（[图 | 消息输入]）', value: 'left' },
                    { label: '➡️ 右侧分栏（[消息输入 | 图]）', value: 'right' },
                    { label: '💬 嵌入消息流（消息列表顶部一条卡片）', value: 'inline' },
                  ]}
                />
                <span className="font-medium ml-2">↔ 水平对齐：</span>
                <Select
                  size="small"
                  style={{ width: 132 }}
                  value={currentPoint.carouselAlign || (currentPoint.id === 'muxiaozhi' ? 'center' : 'left')}
                  onChange={(v: any) => updatePoint(currentPoint.id, { carouselAlign: v as 'left' | 'center' | 'right' })}
                  options={[
                    { label: '左对齐', value: 'left' },
                    { label: '居中', value: 'center' },
                    { label: '右对齐', value: 'right' },
                  ]}
                />
                <span className="text-sky-600 ml-1">
                  木小知默认居中；左右分栏模式仍按分栏位置展示
                </span>
              </div>
            </div>

            {/* 图片列表 */}
            {(currentPoint.carouselImages && currentPoint.carouselImages.length > 0) ? (
              <div className="space-y-2 pt-1">
                {currentPoint.carouselImages.map((car, idx) => {
                  const allCars = currentPoint.carouselImages || [];
                  const lastIdx = allCars.length - 1;
                  const patchCar = (patch: Partial<CarouselImage>) => {
                    const arr = [...allCars];
                    arr[idx] = { ...arr[idx], ...patch };
                    updatePoint(currentPoint.id, { carouselImages: arr });
                  };
                  const moveCar = (d: number) => {
                    const ni = idx + d;
                    if (ni < 0 || ni > lastIdx) return;
                    const arr = [...allCars];
                    [arr[idx], arr[ni]] = [arr[ni], arr[idx]];
                    updatePoint(currentPoint.id, { carouselImages: arr });
                  };
                  return (
                    <div key={car.id} className="bg-white/85 border border-sky-200 rounded p-2.5 space-y-2">
                      {/* 顶部：序号 + 预览 + 顺序 + 删除 */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-sky-600 font-mono bg-sky-100 rounded px-1.5 py-0.5">
                          #{idx + 1}
                        </span>
                        {/* 缩略图 */}
                        <div className="w-14 h-10 rounded border border-slate-200 bg-slate-100 overflow-hidden flex items-center justify-center flex-shrink-0">
                          {car.imageUrl ? (
                            <img src={car.imageUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[9px] text-slate-400">无图</span>
                          )}
                        </div>
                        <Button size="small" variant="outline" icon={<UploadIcon size={11} />}
                          onClick={() => triggerResourceUpload((info) => {
                            if (!info.mime.startsWith('image/')) {
                              alert('请上传图片文件（jpg/png/webp 等）');
                              return;
                            }
                            patchCar({ imageUrl: info.url });
                          })}>
                          {car.imageUrl ? '换图' : '上传图片'}
                        </Button>
                        <div className="flex-1" />
                        <div className="flex items-center gap-0.5">
                          <Button size="small" variant="text" disabled={idx === 0} onClick={() => moveCar(-1)} title="上移">
                            <ChevronUp size={12} className={idx === 0 ? 'text-slate-300' : 'text-slate-500'} />
                          </Button>
                          <Button size="small" variant="text" disabled={idx === lastIdx} onClick={() => moveCar(1)} title="下移">
                            <ChevronDown size={12} className={idx === lastIdx ? 'text-slate-300' : 'text-slate-500'} />
                          </Button>
                          <Button size="small" variant="text"
                            onClick={() => {
                              const arr = allCars.filter((_, i) => i !== idx);
                              updatePoint(currentPoint.id, { carouselImages: arr });
                            }} title="删除">
                            <Trash2 size={12} className="text-red-500" />
                          </Button>
                        </div>
                      </div>
                      {/* 标题 + 图片外链 */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-[11px] text-slate-500 mb-0.5">图片标题</div>
                          <Input value={car.title} onChange={(v) => patchCar({ title: v })}
                            placeholder="例如：木雅金塔" />
                        </div>
                        <div>
                          <div className="text-[11px] text-slate-500 mb-0.5">图片地址（上传后自动填，也可填外链）</div>
                          <Input value={car.imageUrl} onChange={(v) => patchCar({ imageUrl: v })}
                            placeholder="/uploads/resources/xxx.jpg 或 https://..." />
                        </div>
                      </div>
                      {/* 讲解内容 */}
                      <div>
                        <div className="text-[11px] text-slate-500 mb-0.5">
                          讲解内容（点击图片后弹出显示）
                        </div>
                        <textarea
                          value={car.description}
                          onChange={(e) => patchCar({ description: e.target.value })}
                          placeholder="填写真实、有据可查的讲解内容…"
                          rows={3}
                          className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] leading-relaxed outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 resize-y min-h-[60px]"
                        />
                      </div>
                      {/* 来源 */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-[11px] text-slate-500 mb-0.5">来源名称</div>
                          <Input value={car.sourceName || ''} onChange={(v) => patchCar({ sourceName: v })}
                            placeholder="例如：甘孜州人民政府网" />
                        </div>
                        <div>
                          <div className="text-[11px] text-slate-500 mb-0.5">来源网址（讲解依据，必填更严谨）</div>
                          <Input value={car.sourceUrl || ''} onChange={(v) => patchCar({ sourceUrl: v })}
                            placeholder="https://..." />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center text-[11px] text-slate-400 py-3 border border-dashed border-sky-200 rounded space-y-1">
                <div>还没有轮播图片，点击「+ 添加图片」开始配置知识画廊</div>
                <div className="text-sky-500">提示：每张图片可填写标题、讲解内容和来源网址，用户点击图片即可查看讲解</div>
              </div>
            )}
          </div>

          {/* ========== AI 对话提示词（人设） ========== */}
          <div className="p-3 bg-gradient-to-br from-purple-50 to-fuchsia-50 rounded border border-purple-200 space-y-2">
            <div className="flex items-center gap-1">
              <TypeIcon size={14} className="text-purple-600" />
              <span className="text-sm font-medium text-purple-800">AI 对话提示词（人设）</span>
            </div>
            <div className="text-[10px] text-purple-700 leading-relaxed">
              为「{currentPoint.ragflow?.title || currentPoint.name || '该数字人'}」单独设置系统提示词，优先级高于「高级配置」中的全局提示词。
              用 <code className="bg-purple-100 text-purple-700 px-1 rounded">{'{persona}'}</code> 代替数字人名字，对话时会自动替换。留空则使用全局提示词。
            </div>
            <textarea
              value={currentPoint.systemPrompt || ''}
              onChange={(e) => updatePoint(currentPoint.id, { systemPrompt: e.target.value })}
              placeholder={`你是"{persona}"，一个亲切专业的藏语（木雅方言）教学助手...\n\n提示：可以用 {persona} 代替名字`}
              rows={5}
              className="w-full rounded border border-purple-300 bg-white px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 resize-y min-h-[120px]"
            />
            {/* 预览 */}
            <div className="bg-black/80 rounded p-2.5 text-[11px] text-white/60 leading-relaxed">
              <div className="text-white/35 mb-1">实际生效提示词预览：</div>
              <div className="font-mono text-fuchsia-300/90 break-all">
                {(currentPoint.systemPrompt || cfg.llm?.systemPrompt || '').replace(
                  /\{persona\}/g,
                  currentPoint.ragflow?.title || currentPoint.name || '数字人'
                ).slice(0, 280)}
                {(currentPoint.systemPrompt || cfg.llm?.systemPrompt || '').length > 280 ? '...' : ''}
              </div>
              <div className="text-white/30 mt-1">
                {currentPoint.systemPrompt
                  ? '↑ 来自本数字人专属提示词'
                  : cfg.llm?.systemPrompt
                  ? '↑ 本数字人未设专属提示词，当前使用全局提示词'
                  : '↑ 未配置任何提示词，将使用内置默认提示词'}
              </div>
            </div>
          </div>

          {/* 已删除「空间资源」公共卡片：每个按钮现在拥有独立的 files 池，
              上传入口已迁移到对应按钮卡片内部
              （行为选「📂 打开资源面板」/「🎬 视频：打开资源面板播放视频」/「📄 文档：打开资源面板查看文档」时可管理）*/}
        </div>
      ) : (
        <div className="p-4 text-center text-sm text-slate-400 border-2 border-dashed border-slate-200 rounded">
          请先在上方选择一个数字人
        </div>
      )}
    </div>
  );
}

// ============== 高级配置 ==============
function AdvancedPanel({
  cfg, setCfg, setDirty, ragflowOk, ragflowMsg, checkRagflow,
}: {
  cfg: AppConfig;
  setCfg: (c: AppConfig) => void;
  setDirty: (d: boolean) => void;
  ragflowOk: boolean | null;
  ragflowMsg: string;
  checkRagflow: () => void;
}) {
  const llm = cfg.llm || {};
  const setLlm = (patch: Partial<typeof llm>) => {
    setCfg({ ...cfg, llm: { ...llm, ...patch } });
    setDirty(true);
  };
  const webSearch = cfg.webSearch || {};
  const setWebSearch = (patch: Partial<typeof webSearch>) => {
    setCfg({ ...cfg, webSearch: { ...webSearch, ...patch } });
    setDirty(true);
  };

  const MODEL_OPTIONS = [
    { value: 'deepseek-v3', label: 'DeepSeek V3（项目固定模型）' },
  ];

  return (
    <div className="p-3 space-y-3">
      {/* ========== 大模型直连配置 ========== */}
      <div className="p-3 bg-gradient-to-br from-emerald-50 to-teal-50 rounded border border-emerald-200 space-y-3">
        <div className="flex items-center justify-between">
          <div>
              <div className="text-sm font-medium flex items-center gap-1">
              <SettingsIcon size={14} /> DeepSeek-V3 证据组织
            </div>
            <div className="text-[10px] text-emerald-700 mt-0.5">开启后仍先检索 RAGFlow，再由 DeepSeek-V3 严格依据证据组织回答</div>
          </div>
          <Switch
            size="small"
            value={llm.enabled === true}
            onChange={(v) => setLlm({ enabled: v })}
          />
        </div>

        {llm.enabled && (
          <div className="space-y-3 pt-2 border-t border-emerald-200">
            {/* API Key */}
            <div>
              <div className="text-xs text-slate-500 mb-1">阿里云百炼 API Key</div>
              <Input
                type="password"
                value={llm.apiKey || ''}
                onChange={(v) => setLlm({ apiKey: v })}
                placeholder="sk-xxxxxxxx"
              />
              <div className="text-[10px] text-slate-400 mt-0.5">
                在 <a href="https://bailian.console.aliyun.com/" target="_blank" className="text-blue-500 underline">阿里云百炼控制台</a> 创建
              </div>
            </div>

            {/* 模型选择 */}
            <div>
              <div className="text-xs text-slate-500 mb-1">模型</div>
              <select
                className="w-full px-2 py-1.5 text-sm border rounded bg-white"
                value="deepseek-v3"
                onChange={(e) => setLlm({ model: e.target.value })}
              >
                {MODEL_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            {/* 系统提示词 */}
            <div>
              <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                <span>系统提示词（人设）</span>
                <span className="text-[10px] text-orange-500">用 {'{persona}'} 代替数字人名字</span>
              </div>
              <textarea
                value={llm.systemPrompt || ''}
                onChange={(e) => setLlm({ systemPrompt: e.target.value })}
                placeholder={`你是"{persona}"，一个亲切专业的藏语（木雅方言）教学助手...`}
                rows={4}
                className="w-full rounded border border-emerald-300 bg-white px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 resize-y min-h-[100px]"
              />
              <div className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                <span className="text-emerald-600 font-medium">{'{persona}'}</span> 会在对话时自动替换为当前数字人的名字。
                <br />例如配置 <code className="text-emerald-700 bg-emerald-50 px-1 rounded">你是{'{persona}'}，擅长藏语教学</code>，进入「小文」空间时会变成 <code className="text-emerald-700 bg-emerald-50 px-1 rounded">你是"小文"，擅长藏语教学</code>。
              </div>
            </div>

            {/* 温度 */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-500">生成温度（temperature）</span>
                <span className="text-emerald-600 font-mono">{llm.temperature ?? 0.7}</span>
              </div>
              <input
                type="range"
                min={0} max={2} step={0.1}
                value={llm.temperature ?? 0.7}
                onChange={(e) => setLlm({ temperature: Number(e.target.value) })}
                className="w-full accent-emerald-500"
                style={{ display: 'block', width: '100%' }}
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>0 精确</span>
                <span>0.7 平衡</span>
                <span>2 创意</span>
              </div>
            </div>

            {/* 预览 */}
            <div className="bg-black/80 rounded p-3 text-[11px] text-white/70 leading-relaxed">
              <div className="text-white/40 mb-1">提示词预览（以第一个数字人为例）：</div>
              <div className="font-mono text-emerald-300/90 break-all">
                {(llm.systemPrompt || '').replace(
                  /\{persona\}/g,
                  cfg.points?.[0]?.name || '小文'
                ).slice(0, 200)}
                {(llm.systemPrompt || '').length > 200 ? '...' : ''}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========== RAGFlow 配置 ========== */}
      <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-3">
        <div className="text-sm font-medium mb-1 flex items-center justify-between">
          RAGFlow 配置
          <Button size="small" variant="outline" onClick={checkRagflow}>测试连接</Button>
        </div>
        {llm.enabled && (
          <div className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
            ✓ DeepSeek-V3 已启用；RAGFlow 仍是所有回答的第一检索步骤。
          </div>
        )}
        {ragflowMsg && (
          <div className={`text-xs px-2 py-1 rounded ${
            ragflowOk ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {ragflowMsg}
          </div>
        )}

        <div>
          <div className="text-xs text-slate-500 mb-1">API Base URL</div>
          <Input value={cfg.ragflow.baseUrl}
            onChange={(v) => { setCfg({ ...cfg, ragflow: { ...cfg.ragflow, baseUrl: v } }); setDirty(true); }} />
        </div>
        <div>
          <div className="text-xs text-slate-500 mb-1">API Key</div>
          <Input type="password" value={cfg.ragflow.apiKey}
            onChange={(v) => { setCfg({ ...cfg, ragflow: { ...cfg.ragflow, apiKey: v } }); setDirty(true); }} />
        </div>
        <div>
          <div className="text-xs text-slate-500 mb-1">知识库名称（DATASET_NAME）</div>
          <Input value={cfg.ragflow.datasetName}
            onChange={(v) => { setCfg({ ...cfg, ragflow: { ...cfg.ragflow, datasetName: v } }); setDirty(true); }} />
        </div>
        <div>
          <div className="text-xs text-slate-500 mb-1">模型</div>
          <Input value="deepseek-v3" disabled />
        </div>
      </div>

      {/* ========== 木小知可信联网检索 ========== */}
      <div className="p-3 bg-gradient-to-br from-sky-50 to-cyan-50 rounded border border-sky-200 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-sky-900">木小知 · 可信联网补检</div>
            <div className="text-[10px] text-sky-700 mt-0.5">
              仅当 RAGFlow 零命中时调用 Tavily，并再次过滤到下方可信域名；木小文和木小测不会使用联网答案。
            </div>
          </div>
          <Switch size="small" value={webSearch.enabled === true}
            onChange={(v) => setWebSearch({ enabled: v, provider: 'tavily' })} />
        </div>
        {webSearch.enabled && (
          <div className="space-y-3 border-t border-sky-200 pt-2">
            <div>
              <div className="text-xs text-slate-600 mb-1">Tavily API Key</div>
              <Input type="password" value={webSearch.apiKey || ''}
                onChange={(v) => setWebSearch({ apiKey: v })} placeholder="tvly-xxxxxxxx" />
              <div className="text-[10px] text-slate-400 mt-1">
                使用 Tavily 官方 Search API；也可通过服务器环境变量 TAVILY_API_KEY 配置。
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">可信域名白名单（每行一个）</div>
              <textarea
                value={(webSearch.trustedDomains || ['gov.cn', 'baike.baidu.com', 'edu.cn', 'cas.cn', 'gzz.gov.cn', 'kangding.gov.cn']).join('\n')}
                onChange={(e) => setWebSearch({ trustedDomains: e.target.value.split('\n').map((item) => item.trim()).filter(Boolean) })}
                rows={6}
                className="w-full rounded border border-sky-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-sky-400"
              />
              <div className="text-[10px] text-sky-600 mt-1">后端会校验最终 URL 域名，搜索服务返回的非白名单结果也会被丢弃。</div>
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">最多来源数：{webSearch.maxResults || 5}</div>
              <input type="range" min={1} max={10} step={1} value={webSearch.maxResults || 5}
                onChange={(e) => setWebSearch({ maxResults: Number(e.target.value) })}
                className="w-full accent-sky-500" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============== 菜单配置 ==============
function MenuPanel({
  cfg, setCfg, setDirty,
}: {
  cfg: AppConfig;
  setCfg: (c: AppConfig) => void;
  setDirty: (d: boolean) => void;
}) {
  return (
    <div className="p-3">
      <div className="text-sm text-slate-500 mb-2">
        主页面顶部菜单项（如「学习」入口），显示在地图左下角
      </div>
      {cfg.menu?.map((m, i) => (
        <div key={m.id || i} className="flex items-center gap-2 mb-2">
          <Input value={m.name}
            onChange={(v) => {
              const menu = [...(cfg.menu || [])];
              menu[i] = { ...menu[i], name: v };
              setCfg({ ...cfg, menu });
              setDirty(true);
            }} />
          <Input value={m.icon || ''} placeholder="图标URL"
            onChange={(v) => {
              const menu = [...(cfg.menu || [])];
              menu[i] = { ...menu[i], icon: v };
              setCfg({ ...cfg, menu });
              setDirty(true);
            }} />
          <Button variant="text"
            onClick={() => {
              const menu = (cfg.menu || []).filter((_, j) => j !== i);
              setCfg({ ...cfg, menu });
              setDirty(true);
            }}>
            <Trash2 size={14} className="text-red-500" />
          </Button>
        </div>
      ))}
      <Button variant="outline" block icon={<Plus size={14} />}
        onClick={() => {
          const menu = [...(cfg.menu || []), { id: 'm_' + Date.now().toString(36), name: '新菜单' }];
          setCfg({ ...cfg, menu });
          setDirty(true);
        }}>
        添加菜单项
      </Button>
    </div>
  );
}
