import { Button, Tooltip } from 'tdesign-react';
import { useLocation } from 'react-router-dom';
import { SunnyIcon, MoonIcon, MenuFoldIcon, MenuUnfoldIcon } from 'tdesign-icons-react';
import { ChevronRight, Cloud, CloudOff, Flame } from 'lucide-react';
import { Model, Session, Agent, Theme } from '../types';
import type { ApiStatus } from '../hooks/useApiStatus';

interface HeaderProps {
  isSettingsPage: boolean;
  sidebarOpen: boolean;
  theme: Theme;
  currentSession: Session | undefined;
  currentAgent: Agent | undefined;
  models: Model[];
  apiStatus: ApiStatus & { checkStatus: () => void };
  streakDays: number;
  onToggleSidebar: () => void;
  onToggleTheme: () => void;
}

export function Header({
  isSettingsPage,
  sidebarOpen,
  theme,
  currentSession,
  apiStatus,
  streakDays,
  onToggleSidebar,
  onToggleTheme,
}: HeaderProps) {
  const location = useLocation();
  const routeTitles: Record<string, string> = {
    '/chat': '我的学习空间',
    '/chapter-learning': '章节课堂',
    '/quiz': '智能测验',
    '/roll-call': '课堂点名',
    '/knowledge': '资源中心',
    '/settings': '系统设置',
    '/agents/muxiaowen': '木小文学习工作台',
    '/agents/muxiaoce': '木小测测评工作台',
    '/agents/muxiaozhi': '木小知知识工作台',
  };
  const pageTitle = routeTitles[location.pathname] || currentSession?.title || '我的学习空间';

  return (
    <header className="app-header">
      <div className="header-left">
        <Button
          variant="text"
          shape="circle"
          icon={sidebarOpen ? <MenuFoldIcon /> : <MenuUnfoldIcon />}
          onClick={onToggleSidebar}
        />
        <div className="header-breadcrumb">
          <span>木雅藏语AI助手</span>
          <ChevronRight size={14} />
          <strong>{pageTitle}</strong>
        </div>
      </div>

      <div className="header-actions">
        {!isSettingsPage && (
          <div className="streak-chip"><Flame size={15} /> 连续学习 {streakDays} 天</div>
        )}
        <Tooltip content={apiStatus.isOnline ? '知识库与 AI 服务正常' : apiStatus.message || '当前为离线模式'}>
          <button className={`service-status ${apiStatus.isOnline ? 'is-online' : 'is-offline'}`} onClick={apiStatus.checkStatus}>
            {apiStatus.isOnline ? <Cloud size={16} /> : <CloudOff size={16} />}
            <span>{apiStatus.isOnline ? 'AI 服务正常' : '离线模式'}</span>
          </button>
        </Tooltip>
        <Tooltip content={theme === 'light' ? '切换到深色模式' : '切换到浅色模式'}>
          <button className="header-icon-button" onClick={onToggleTheme} aria-label="切换主题">
            {theme === 'light' ? <MoonIcon /> : <SunnyIcon />}
          </button>
        </Tooltip>
        <div className="user-avatar">学</div>
      </div>
    </header>
  );
}
