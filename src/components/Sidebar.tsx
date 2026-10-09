import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Boxes,
  Database,
  Dices,
  GraduationCap,
  Home,
  MessageSquare,
} from 'lucide-react';
import { APP_CONFIG } from '../config';
import { apiUrl } from '../api-config';
import { DIGITAL_HUMANS, HOME_DIGITAL_HUMANS, type DigitalHumanId } from '../digital-humans';
import { fetchAgentConversation } from '../shared-agent-conversation';

interface RecentAgentConversation {
  agentId: DigitalHumanId;
  updatedAt: number;
  preview: string;
}

interface SidebarProps {
  sidebarOpen: boolean;
  onNewChat: () => void;
  onOpenAgentConversation: (agentId: DigitalHumanId) => void;
  onQuizClick?: () => void;
  onKnowledgeBaseClick?: () => void;
  onChapterLearningClick?: () => void;
  onRollCallClick?: () => void;
  onMetaverseClick?: () => void;
}

export function Sidebar({
  sidebarOpen,
  onNewChat,
  onOpenAgentConversation,
  onQuizClick,
  onKnowledgeBaseClick,
  onChapterLearningClick,
  onRollCallClick,
  onMetaverseClick,
}: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [appName, setAppName] = useState(APP_CONFIG.name);
  const [recentConversations, setRecentConversations] = useState<RecentAgentConversation[]>([]);

  useEffect(() => {
    fetch(apiUrl('/api/app-config'))
      .then(r => r.json())
      .then(data => data.appName && setAppName(data.appName))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let disposed = false;
    let loading = false;
    let requestController: AbortController | null = null;

    const loadRecentConversations = async () => {
      if (loading) return;
      loading = true;
      requestController?.abort();
      requestController = new AbortController();
      try {
        const results = await Promise.allSettled(HOME_DIGITAL_HUMANS.map(async (agent) => {
          const conversation = await fetchAgentConversation(agent.id, requestController?.signal);
          const latestUserMessage = [...conversation.messages]
            .reverse()
            .find((message) => message.role === 'user' && message.content.trim());
          if (!latestUserMessage) return null;
          return {
            agentId: agent.id,
            updatedAt: conversation.updatedAt || latestUserMessage.createdAt || 0,
            preview: latestUserMessage.content.replace(/\s+/g, ' ').trim(),
          } satisfies RecentAgentConversation;
        }));

        if (!disposed) {
          setRecentConversations(results
            .filter((result): result is PromiseFulfilledResult<RecentAgentConversation | null> => result.status === 'fulfilled')
            .map((result) => result.value)
            .filter((item): item is RecentAgentConversation => Boolean(item))
            .sort((a, b) => b.updatedAt - a.updatedAt));
        }
      } finally {
        loading = false;
      }
    };

    void loadRecentConversations();
    const timer = window.setInterval(() => void loadRecentConversations(), 3000);
    return () => {
      disposed = true;
      requestController?.abort();
      window.clearInterval(timer);
    };
  }, [location.pathname]);

  const navItems = [
    { id: 'home', label: '学习首页', icon: Home, path: '/chat', action: onNewChat },
    { id: 'chapter', label: '章节课堂', icon: BookOpen, path: '/chapter-learning', action: onChapterLearningClick },
    { id: 'quiz', label: '智能测验', icon: GraduationCap, path: '/quiz', action: onQuizClick },
    { id: 'roll-call', label: '课堂点名', icon: Dices, path: '/roll-call', action: onRollCallClick },
    { id: 'knowledge', label: '资源中心', icon: Database, path: '/knowledge', action: onKnowledgeBaseClick },
    { id: 'metaverse', label: '木雅语智慧空间', icon: Boxes, path: '/wisdom-space', action: onMetaverseClick },
  ];

  const isActive = (path: string) => path === '/chat' ? location.pathname === '/chat' : location.pathname === path;

  return (
    <aside className={`app-sidebar ${sidebarOpen ? 'is-open' : ''}`}>
      <div className="sidebar-brand">
        <div className="brand-mark" aria-hidden="true">木</div>
        <div className="brand-copy">
          <strong>{appName}</strong>
          <span>AI MUYA CLASSROOM</span>
        </div>
      </div>

      <nav className="primary-nav" aria-label="主导航">
        <span className="sidebar-section-label">学习空间</span>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} className={isActive(item.path) ? 'is-active' : ''} onClick={item.action}>
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="session-heading">
        <span className="sidebar-section-label">最近对话</span>
      </div>

      <div className="session-list">
        {recentConversations.length === 0 ? (
          <button className="empty-session" onClick={onNewChat}>
            <MessageSquare size={16} />
            <span>点击数字人开始对话</span>
          </button>
        ) : recentConversations.map((conversation) => {
          const agent = DIGITAL_HUMANS[conversation.agentId];
          return (
            <button
              type="button"
              key={conversation.agentId}
              className={`agent-session-row ${location.pathname === `/agents/${conversation.agentId}` ? 'is-active' : ''}`}
              onClick={() => onOpenAgentConversation(conversation.agentId)}
              title={`继续与${agent.name}对话：${conversation.preview}`}
            >
              <span className="agent-session-avatar"><img src={agent.waveImage} alt="" /></span>
              <span className="agent-session-copy">
                <strong>{agent.name}</strong>
                <small>{conversation.preview}</small>
              </span>
            </button>
          );
        })}
      </div>
      <div className="sidebar-back-home">
        <button
          type="button"
          className="sidebar-back-btn"
          onClick={() => navigate('/')}
          aria-label="返回主页"
        >
          <ArrowLeft size={16} />
          <span>返回主页</span>
        </button>
      </div>
    </aside>
  );
}
