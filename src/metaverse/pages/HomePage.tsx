// 主页面：3D 风格地图背景 + 多个可点击数字人
// 用户态：完全干净，不显示任何配置/上传入口（所有管理功能都在 /config）
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listPortals, getConfig } from '../api';
import type { AppConfig, PortalPoint } from '../types';
import DraggableHuman from '../components/DraggableHuman';
import LoadingScreen, { useFadeOutOverlay } from '../components/LoadingScreen';
import { useAssetPreload } from '../hooks/useAssetPreload';
import { AlertCircle, ArrowLeft } from 'lucide-react';

interface PublicPoint extends Pick<PortalPoint, 'id' | 'name' | 'gifUrl' | 'waveGifUrl' | 'pageTitle' | 'enabled' | 'homePosition' | 'label' | 'order' | 'size' | 'subtitle' | 'homeLabelPosition' | 'homeLabelStyle' | 'showName' | 'showSubtitle' | 'showTopBar' | 'showTopBarTools' | 'labelOffsetY' | 'labelOffsetX'> {}

export default function HomePage() {
  const nav = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [points, setPoints] = useState<PublicPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bgFallback, setBgFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async (initial = false) => {
      try {
        const list = (await listPortals()) as { points: PublicPoint[]; homeBg: string; homeTitle: string; homeSubtitle?: string };
        const fullCfg = await getConfig();
        if (cancelled) return;
        setCfg(fullCfg);
        setPoints(list.points.filter((p) => p.enabled !== false));
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
  }, []);

  // ===== 资源预加载：背景图 + 各数字人 GIF =====
  // 拿到配置后立刻用 Image() 预取，全部就绪（或 22 秒超时兜底）后再淡入场景，
  // 避免弱网（cpolar 公网隧道）下用户先看到黑屏、数字人再慢慢刷出背景的问题。
  const preloadUrls = useMemo(() => {
    const arr: string[] = [];
    if (cfg?.homeBg) arr.push(cfg.homeBg);
    points.forEach((p) => {
      const g = p.waveGifUrl || p.gifUrl;
      if (g) arr.push(g);
    });
    return arr;
    // 3 秒轮询会生成新数组引用，但 hook 内部按 URL 排序串去重，不会重复预加载
  }, [cfg?.homeBg, points]);

  const { progress, ready } = useAssetPreload(loading ? [] : preloadUrls, 22000);

  // 加载完成后加载页不瞬间消失，而是淡出 ~1.4s，与场景淡入交叉过渡
  const overlayPhase = useFadeOutOverlay(loading || (!ready && !error));

  if (overlayPhase === 'show') {
    return (
      <LoadingScreen
        title={cfg?.homeTitle || '木雅语智慧空间'}
        subtitle={cfg?.homeSubtitle}
        progress={loading ? -1 : progress}
      />
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black text-white">
        <AlertCircle className="text-red-400 mr-2" />
        <div>
          <div>加载失败: {error}</div>
          <button
            className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded"
            onClick={() => location.reload()}
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative bg-black overflow-hidden">
      {/* 加载页淡出覆盖层：与场景淡入交叉过渡 */}
      {overlayPhase === 'fading' && (
        <div className="absolute inset-0 z-[90] loading-fade-out">
          <LoadingScreen
            title={cfg?.homeTitle || '木雅语智慧空间'}
            subtitle={cfg?.homeSubtitle}
            progress={100}
          />
        </div>
      )}
      <button
        type="button"
        onClick={() => nav('/')}
        className="absolute left-4 top-4 z-[60] flex items-center gap-1.5 rounded-lg border border-white/25 bg-black/60 px-3 py-2 text-sm text-white shadow-lg backdrop-blur hover:bg-black/80"
      >
        <ArrowLeft size={16} /> 返回
      </button>

      {/* 顶部简单标题 — 居中显示，不含任何配置入口 */}
      <div
        className="absolute top-0 left-0 right-0 z-50 flex items-center justify-center px-4 py-4 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)',
        }}
      >
        <div className="text-center">
          <div className="text-white font-semibold text-lg drop-shadow-lg">{cfg?.homeTitle || '3D 藏语空间'}</div>
          {cfg?.homeSubtitle && (
            <div className="text-white/70 text-xs mt-1 drop-shadow">{cfg.homeSubtitle}</div>
          )}
        </div>
      </div>

      {/* 地图背景 */}
      <div ref={containerRef} className="absolute inset-0 select-none">
        {bgFallback ? (
          <div className="w-full h-full flex items-center justify-center text-white/30 text-sm">
            （未配置主页面背景图）
          </div>
        ) : (
          <img
            src={cfg?.homeBg}
            alt=""
            className="w-full h-full object-cover"
            draggable={false}
            onError={() => setBgFallback(true)}
          />
        )}

        {/* 数字人 — 直接点击跳转，使用 waveGifUrl（未配置时 fallback 到 gifUrl） */}
        {points.map((p) => (
          <DraggableHuman
            key={p.id}
            point={{ ...p, homePosition: p.homePosition } as PortalPoint}
            containerRef={containerRef}
            position={p.homePosition}
            draggable={false}
            size={p.size || 280}
            showLabel={true}
            gifSrc={p.waveGifUrl || p.gifUrl}
            onClick={() => nav(`/wisdom-space/portal/${p.id}`)}
          />
        ))}
      </div>

      {/* 底部提示 */}
      {points.length === 0 && !loading && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 text-white/40 text-sm">
          （暂无可用数字人）
        </div>
      )}
    </div>
  );
}
