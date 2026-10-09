// 顶部小标题 + 顶部导航
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Settings, Home as HomeIcon } from 'lucide-react';

interface Props {
  title: string;
  subtitle?: string;
  showBack?: boolean;
}

export default function TopBar({ title, subtitle, showBack }: Props) {
  const nav = useNavigate();
  const loc = useLocation();
  const onConfig = loc.pathname.startsWith('/wisdom-space/config');

  return (
    <div
      className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3"
      style={{
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)',
        pointerEvents: 'none',
      }}
    >
      <div className="flex items-center gap-3" style={{ pointerEvents: 'auto' }}>
        {showBack && (
          <button
          onClick={() => nav('/wisdom-space')}
            className="text-white/80 hover:text-white text-sm flex items-center gap-1 px-2 py-1 rounded bg-black/40"
          >
            ← 返回地图
          </button>
        )}
        <div>
          <div className="text-white font-semibold text-base">{title}</div>
          {subtitle && <div className="text-white/60 text-xs">{subtitle}</div>}
        </div>
      </div>

      <div className="flex items-center gap-2" style={{ pointerEvents: 'auto' }}>
        {!onConfig && (
          <button
            onClick={() => nav('/wisdom-space')}
            className="text-white/80 hover:text-white p-2 rounded bg-black/40"
            title="主页"
          >
            <HomeIcon size={16} />
          </button>
        )}
        <button
            onClick={() => nav('/wisdom-space/config')}
          className="text-white/80 hover:text-white p-2 rounded bg-black/40"
          title="配置后台"
        >
          <Settings size={16} />
        </button>
      </div>
    </div>
  );
}
