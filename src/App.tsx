import { useState, useEffect, useCallback, Component, ErrorInfo, ReactNode } from 'react';
import { Routes, Route, Outlet, useNavigate, useLocation, useOutletContext, useParams } from 'react-router-dom';
import '@tdesign-react/chat/es/style/index.js';

import { useAgents } from './hooks/useAgents';
import { useTheme } from './hooks/useTheme';
import { useSessions } from './hooks/useSessions';
import { useModels } from './hooks/useModels';
import { useChat } from './hooks/useChat';
import { useApiStatus } from './hooks/useApiStatus';
import { useLearningProgress } from './hooks/useLearningProgress';
import { PermissionMode } from './types';

import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { SettingsPage } from './components/SettingsPage';
import { QuizPage } from './components/QuizPage';
import { KnowledgeBasePage } from './components/KnowledgeBasePage';
import { ChapterLearningPage } from './components/ChapterLearningPage';
import { RollCallPage } from './components/RollCallPage';
import { AgentWorkspacePage } from './components/AgentWorkspacePage';
import MetaverseHomePage from './metaverse/pages/HomePage';
import MetaversePortalPage from './metaverse/pages/PortalPage';
import MetaverseConfigPage from './metaverse/pages/ConfigPage';
import './metaverse/metaverse.css';
import { ChatPage } from './pages/ChatPage';
import LandingPage from './pages/LandingPage';
import type { DigitalHumanId } from './digital-humans';

/**
 * 全局错误边界 - 防止任何子组件抛错导致整棵树崩溃（全黑）
 */
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] 捕获到错误:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex items-center justify-center h-screen w-screen"
          style={{ backgroundColor: '#fef2f2', color: '#991b1b' }}
        >
          <div className="max-w-md p-6 rounded-xl" style={{ backgroundColor: '#fff', border: '1px solid #fecaca' }}>
            <h2 className="text-lg font-bold mb-2">页面出错了</h2>
            <p className="text-sm mb-3" style={{ color: '#7f1d1d' }}>
              {this.state.error?.message || '未知错误'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = '/';
              }}
              className="px-4 py-2 rounded-lg text-sm"
              style={{ backgroundColor: '#dc2626', color: '#fff' }}
            >
              返回主界面
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        {/* 新主页 — 选择2D或3D学习模式 */}
        <Route path="/" element={<LandingPage />} />
        {/* 沉浸式智慧空间使用独立全屏布局 */}
        <Route path="/wisdom-space" element={<MetaverseHomePage />} />
        <Route path="/wisdom-space/portal/:id" element={<MetaversePortalPage />} />
        <Route path="/wisdom-space/config" element={<MetaverseConfigPage />} />
        {/* 保留 tibetan-metaverse-portal 原始配置入口。 */}
        <Route path="/config" element={<MetaverseConfigPage />} />
        {/* 顶层布局路由 - 永不卸载，包含 Sidebar + Header */}
        <Route element={<AppLayout />}>
          <Route path="/chat" element={<MainPage />} />
          <Route path="/chat/:sessionId" element={<MainPage />} />
          <Route path="/settings" element={<SettingsRoute />} />
          <Route path="/quiz" element={<QuizRoute />} />
          <Route path="/knowledge" element={<KnowledgeRoute />} />
          <Route path="/chapter-learning" element={<ChapterLearningRoute />} />
          <Route path="/roll-call" element={<RollCallRoute />} />
          <Route path="/agents/:agentId" element={<AgentWorkspaceRoute />} />
          <Route path="*" element={<MainPage />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}

/**
 * 顶层布局 - 永远不卸载
 * 持有所有共享状态（hooks）和 UI 外壳（Sidebar + Header + Outlet）
 */
function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  // 从路径解析 sessionId（布局路由中 useParams 无法获取子路由参数）
  const pathParts = location.pathname.split('/');
  const urlSessionId = pathParts[1] === 'chat' && pathParts[2] ? pathParts[2] : undefined;
  const isSettingsPage = location.pathname === '/settings';
  const isQuizPage = location.pathname === '/quiz';
  const isKnowledgePage = location.pathname === '/knowledge';
  const isChapterLearningPage = location.pathname === '/chapter-learning';
  const isRollCallPage = location.pathname === '/roll-call';

  // 共享状态 hooks（永远不卸载，状态保留）
  const { theme, toggleTheme } = useTheme();
  const { agents, addAgent, updateAgent, deleteAgent, getAgent } = useAgents();
  const { models, selectedModel, setSelectedModel } = useModels();
  const apiStatus = useApiStatus(15000);
  const learningProgress = useLearningProgress();
  const {
    setSessions,
    currentSessionId,
    setCurrentSessionId,
    currentSession,
    sessionModels,
    fetchSessions,
    updateSessionModel,
    addSession,
    updateSession,
    updateSessionMessages,
  } = useSessions();

  const {
    isLoading,
    inputValue,
    setInputValue,
    permissionRequest,
    sendMessage,
    handleStop,
    handlePermissionAllow,
    handlePermissionDeny,
    resendMessage,
    editAndResendMessage,
  } = useChat({
    currentSession,
    currentSessionId,
    selectedModel,
    getAgent,
    addSession,
    updateSession,
    updateSessionMessages,
    updateSessionModel,
    setCurrentSessionId,
    setSessions,
  });

  const currentAgent = currentSession?.agentId ? getAgent(currentSession.agentId) : getAgent('default');

  // 从 URL 同步 sessionId（仅当不在 Settings/Quiz/Knowledge 页面时）
  useEffect(() => {
    if (urlSessionId && urlSessionId !== currentSessionId) {
      setCurrentSessionId(urlSessionId);
    } else if (
      !urlSessionId &&
      !isSettingsPage &&
      !isQuizPage &&
      !isKnowledgePage &&
      !isChapterLearningPage &&
      !isRollCallPage &&
      currentSessionId
    ) {
      setCurrentSessionId(null);
    }
  }, [urlSessionId, isSettingsPage, isQuizPage, isKnowledgePage, isChapterLearningPage, isRollCallPage, currentSessionId, setCurrentSessionId]);

  // 初始加载会话列表（一次性）
  useEffect(() => {
    fetchSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateCurrentSessionModel = useCallback((modelId: string) => {
    setSelectedModel(modelId);
    if (currentSessionId) {
      updateSessionModel(currentSessionId, modelId);
    }
  }, [currentSessionId, updateSessionModel, setSelectedModel]);

  const handleNewChat = useCallback(() => {
    setCurrentSessionId(null);
    navigate('/chat');
  }, [navigate, setCurrentSessionId]);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('bypassPermissions');

  // Outlet context: 把所有共享状态 + 回调通过 Outlet context 传给子路由
  const outletContext = {
    navigate,
    agents,
    addAgent,
    updateAgent,
    deleteAgent,
    getAgent,
    currentSession,
    models,
    selectedModel,
    isLoading,
    inputValue,
    setInputValue,
    permissionRequest,
    permissionMode,
    apiStatus,
    learningProgress,
    sendMessage,
    handleStop,
    updateCurrentSessionModel,
    handlePermissionAllow,
    handlePermissionDeny,
    setPermissionMode,
    resendMessage,
    editAndResendMessage,
  };

  return (
    <div
      className="app-shell flex h-screen w-screen"
      style={{ backgroundColor: 'var(--td-bg-color-page)' }}
    >
      {/* 侧边栏 - 永远不卸载 */}
      <Sidebar
        sidebarOpen={sidebarOpen}
        onNewChat={handleNewChat}
        onOpenAgentConversation={(agentId) => navigate(`/agents/${agentId}`)}
        onQuizClick={() => navigate('/quiz')}
        onKnowledgeBaseClick={() => navigate('/knowledge')}
        onChapterLearningClick={() => navigate('/chapter-learning')}
        onRollCallClick={() => navigate('/roll-call')}
        onMetaverseClick={() => navigate('/wisdom-space')}
      />

      {/* 主内容区 */}
      <main
        className="app-main flex-1 flex flex-col min-w-0"
        style={{ backgroundColor: 'var(--td-bg-color-page)' }}
      >
        {/* 顶部栏 - 永远不卸载 */}
        <Header
          isSettingsPage={isSettingsPage}
          sidebarOpen={sidebarOpen}
          theme={theme}
          currentSession={currentSession}
          currentAgent={currentAgent}
          models={models}
          apiStatus={apiStatus}
          streakDays={learningProgress.progress.streakDays}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          onToggleTheme={toggleTheme}
        />

        {/* 子路由出口 - 只有这里会因路由变化重新挂载 */}
        <Outlet context={outletContext} />
      </main>
    </div>
  );
}

/* ============== 子路由组件 - 只负责页面内容 ============== */

interface OutletContextType {
  navigate: ReturnType<typeof useNavigate>;
  agents: ReturnType<typeof useAgents>['agents'];
  addAgent: ReturnType<typeof useAgents>['addAgent'];
  updateAgent: ReturnType<typeof useAgents>['updateAgent'];
  deleteAgent: ReturnType<typeof useAgents>['deleteAgent'];
  getAgent: ReturnType<typeof useAgents>['getAgent'];
  currentSession: ReturnType<typeof useSessions>['currentSession'];
  models: ReturnType<typeof useModels>['models'];
  selectedModel: string;
  isLoading: boolean;
  inputValue: string;
  setInputValue: (v: string) => void;
  permissionRequest: ReturnType<typeof useChat>['permissionRequest'];
  permissionMode: PermissionMode;
  apiStatus: ReturnType<typeof useApiStatus>;
  learningProgress: ReturnType<typeof useLearningProgress>;
  sendMessage: ReturnType<typeof useChat>['sendMessage'];
  handleStop: ReturnType<typeof useChat>['handleStop'];
  updateCurrentSessionModel: (modelId: string) => void;
  handlePermissionAllow: () => void | Promise<void>;
  handlePermissionDeny: () => void | Promise<void>;
  setPermissionMode: (m: PermissionMode) => void;
  resendMessage?: (messageId: string) => Promise<void>;
  editAndResendMessage?: (messageId: string, newContent: string) => Promise<void>;
}

function useOutletContextSafe(): OutletContextType {
  return useOutletContext() as OutletContextType;
}

function MainPage() {
  const ctx = useOutletContextSafe();
  return (
    <ChatPage
      currentSession={ctx.currentSession}
      models={ctx.models}
      selectedModel={ctx.selectedModel}
      isLoading={ctx.isLoading}
      inputValue={ctx.inputValue}
      permissionRequest={ctx.permissionRequest}
      permissionMode={ctx.permissionMode}
      apiStatus={ctx.apiStatus}
      learningProgress={ctx.learningProgress.progress}
      onSendMessage={ctx.sendMessage}
      onStop={ctx.handleStop}
      onInputChange={ctx.setInputValue}
      onModelChange={ctx.updateCurrentSessionModel}
      onPermissionAllow={ctx.handlePermissionAllow}
      onPermissionDeny={ctx.handlePermissionDeny}
      onPermissionModeChange={ctx.setPermissionMode}
      onResendMessage={ctx.resendMessage}
      onEditAndResendMessage={ctx.editAndResendMessage}
    />
  );
}

function SettingsRoute() {
  const ctx = useOutletContextSafe();
  return (
    <SettingsPage
      agents={ctx.agents}
      onAdd={ctx.addAgent}
      onUpdate={ctx.updateAgent}
      onDelete={ctx.deleteAgent}
    />
  );
}

function QuizRoute() {
  const ctx = useOutletContextSafe();
  return (
    <QuizPage
      onBack={() => ctx.navigate('/')}
      onQuizComplete={ctx.learningProgress.recordQuiz}
    />
  );
}

function KnowledgeRoute() {
  const ctx = useOutletContextSafe();
  return <KnowledgeBasePage onBack={() => ctx.navigate('/')} />;
}

function ChapterLearningRoute() {
  const ctx = useOutletContextSafe();
  return (
    <ChapterLearningPage
      onBack={() => ctx.navigate('/')}
      onProgressChange={ctx.learningProgress.recordChapter}
    />
  );
}

function RollCallRoute() {
  const ctx = useOutletContextSafe();
  return <RollCallPage onBack={() => ctx.navigate('/')} />;
}

function AgentWorkspaceRoute() {
  const ctx = useOutletContextSafe();
  const { agentId } = useParams();
  const validAgentIds: DigitalHumanId[] = ['muxiaowen', 'muxiaoce', 'muxiaozhi'];
  const normalizedAgentId = validAgentIds.includes(agentId as DigitalHumanId)
    ? agentId as DigitalHumanId
    : 'muxiaowen';

  return (
    <AgentWorkspacePage
      agentId={normalizedAgentId}
      onBack={() => ctx.navigate('/chat')}
    />
  );
}

export default App;
