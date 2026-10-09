import { useEffect, useState } from 'react';

/**
 * 加载页淡出控制：
 * active 为 true 时正常显示加载页；active 变为 false（资源就绪）后，
 * 加载页不瞬间卸载，而是先保持挂载、加 .loading-fade-out 动画缓慢淡出，
 * 动画结束后才真正移除 —— 与场景的 scene-fade-in 形成交叉过渡，避免"闪一下"。
 *
 * 返回：'show'（正常显示）| 'fading'（淡出中，以覆盖层形式渲染）| 'gone'（完全移除）
 */
export function useFadeOutOverlay(active: boolean, duration = 1200) {
  const [phase, setPhase] = useState<'show' | 'fading' | 'gone'>(active ? 'show' : 'gone');
  useEffect(() => {
    if (active) {
      setPhase('show');
      return;
    }
    // 首次挂载时就已就绪（如资源秒开）则直接跳过，不闪加载页
    setPhase((prev) => (prev === 'gone' ? 'gone' : 'fading'));
    const t = window.setTimeout(() => setPhase('gone'), duration);
    return () => window.clearTimeout(t);
  }, [active, duration]);
  return phase;
}

interface LoadingScreenProps {
  /** 主标题 */
  title?: string;
  /** 副标题 */
  subtitle?: string;
  /** 进度 0~100（-1 表示未知进度的初始阶段） */
  progress?: number;
}

const TIPS = [
  '正在唤醒数字人…',
  '正在铺设 3D 场景…',
  '正在加载场景资源…',
  '马上就好，请稍候…',
];

/**
 * 3D 空间通用加载过渡页：
 * 深色渐变背景 + 呼吸光环 + 进度条 + 轮换提示文案。
 * 用于 HomePage（地图主页）与 PortalPage（数字人空间）的资源预加载阶段，
 * 避免弱网（如 cpolar 公网隧道）下用户先看到黑屏再慢慢刷出背景。
 */
export default function LoadingScreen({
  title = '木雅语智慧空间',
  subtitle,
  progress = -1,
}: LoadingScreenProps) {
  const [tipIndex, setTipIndex] = useState(0);
  const [shown, setShown] = useState(0);

  // 轮换提示文案
  useEffect(() => {
    const t = window.setInterval(() => setTipIndex((i) => (i + 1) % TIPS.length), 2600);
    return () => window.clearInterval(t);
  }, []);

  // 进度条平滑追赶：展示值缓慢逼近真实进度，避免数字跳动生硬
  useEffect(() => {
    const t = window.setInterval(() => {
      setShown((s) => {
        if (progress < 0) return Math.min(s + 1, 8); // 初始阶段缓慢爬到 8%
        if (s >= progress) return s;
        return Math.min(progress, s + Math.max(1, Math.ceil((progress - s) / 6)));
      });
    }, 120);
    return () => window.clearInterval(t);
  }, [progress]);

  const pct = progress < 0 ? shown : Math.max(shown, progress);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center overflow-hidden"
      style={{
        background:
          'radial-gradient(1200px 600px at 50% 20%, rgba(56,89,168,0.28), transparent 60%),' +
          'radial-gradient(900px 500px at 80% 90%, rgba(120,72,160,0.18), transparent 60%),' +
          'linear-gradient(180deg, #070b16 0%, #0b1020 55%, #060912 100%)',
      }}
    >
      {/* 呼吸光环 */}
      <div className="relative flex items-center justify-center" style={{ width: 120, height: 120 }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: '2px solid rgba(96,165,250,0.35)',
          animation: 'loadRing 2.2s ease-out infinite',
        }} />
        <div style={{
          position: 'absolute', inset: 14, borderRadius: '50%',
          border: '2px solid rgba(129,140,248,0.5)',
          animation: 'loadRing 2.2s ease-out infinite 0.7s',
        }} />
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'linear-gradient(135deg, #60a5fa, #818cf8)',
          boxShadow: '0 0 34px rgba(96,165,250,0.55)',
          animation: 'loadPulse 1.6s ease-in-out infinite',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 22, fontWeight: 700,
        }}>
          木
        </div>
      </div>

      {/* 标题 */}
      <div className="text-white font-semibold mt-6" style={{ fontSize: 22, letterSpacing: 2, textShadow: '0 2px 12px rgba(0,0,0,0.5)' }}>
        {title}
      </div>
      {subtitle && (
        <div className="text-white/55 mt-2" style={{ fontSize: 13 }}>{subtitle}</div>
      )}

      {/* 进度条 */}
      <div className="mt-8" style={{ width: 'min(360px, 72vw)' }}>
        <div style={{
          height: 8, borderRadius: 999, overflow: 'hidden',
          background: 'rgba(255,255,255,0.08)',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.4)',
        }}>
          <div style={{
            height: '100%', width: `${pct}%`, borderRadius: 999,
            background: 'linear-gradient(90deg, #60a5fa, #818cf8, #a78bfa)',
            backgroundSize: '200% 100%',
            boxShadow: '0 0 12px rgba(96,165,250,0.6)',
            transition: 'width 0.25s ease-out',
            animation: 'loadShimmer 1.6s linear infinite',
          }} />
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-white/50" style={{ fontSize: 12, transition: 'opacity 0.4s' }}>
            {TIPS[tipIndex]}
          </span>
          <span className="text-white/70 tabular-nums" style={{ fontSize: 12, fontWeight: 600 }}>
            {pct}%
          </span>
        </div>
      </div>
    </div>
  );
}
