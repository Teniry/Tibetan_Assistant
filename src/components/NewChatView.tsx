import {
  ArrowRight,
  BookOpenCheck,
  ClipboardCheck,
  Clock3,
  Database,
  Flame,
  LibraryBig,
  Sparkles,
  Trophy,
} from 'lucide-react';
import type { LearningProgress } from '../hooks/useLearningProgress';
import { HOME_DIGITAL_HUMANS, type DigitalHumanId } from '../digital-humans';

interface NewChatViewProps {
  kbTotal?: number;
  kbChapters?: number;
  learningProgress: LearningProgress;
  onOpenChapter?: () => void;
  onOpenQuiz?: () => void;
  onOpenKnowledge?: () => void;
}

function formatLearningTime(seconds: number): string {
  if (seconds <= 0) return '0 分钟';
  if (seconds < 60) return '不足 1 分钟';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes > 0 ? `${hours} 小时 ${restMinutes} 分` : `${hours} 小时`;
}

export function NewChatView({
  kbTotal = 4641,
  kbChapters = 64,
  learningProgress,
  onOpenChapter,
  onOpenQuiz,
  onOpenKnowledge,
}: NewChatViewProps) {
  const chapterName = learningProgress.currentChapter;
  const weeklyTimeText = formatLearningTime(learningProgress.weeklySeconds);
  const masteryText = learningProgress.masteryPercent === null
    ? '暂无'
    : `${learningProgress.masteryPercent}%`;

  const agentActions: Record<DigitalHumanId, (() => void) | undefined> = {
    muxiaoce: onOpenQuiz,
    muxiaowen: onOpenChapter,
    muxiaozhi: onOpenKnowledge,
  };
  const agentIcons = {
    muxiaoce: ClipboardCheck,
    muxiaowen: BookOpenCheck,
    muxiaozhi: LibraryBig,
  } satisfies Record<DigitalHumanId, typeof BookOpenCheck>;

  return (
    <div className="learning-home">
      <section className="learning-hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <Sparkles size={14} />
            AI 智能体·数字教师融合课堂
          </div>
          <h1>你好，今天也一起开口学木雅语</h1>
          <p>
            {chapterName
              ? `已恢复上次进度：${chapterName}主题，第 ${learningProgress.currentWordIndex + 1} 个词条。`
              : '今天的学习日已自动记录，请从左侧导航选择学习内容。'}
          </p>
        </div>

        <div className="hero-motif" aria-hidden="true"><span>MUYA AI</span></div>
      </section>

      <section className="learning-metrics" aria-label="学习数据">
        <div className="metric-item">
          <span className="metric-icon is-red"><Flame size={17} /></span>
          <div><strong>{learningProgress.streakDays} 天</strong><small>连续学习</small></div>
        </div>
        <div className="metric-item">
          <span className="metric-icon is-blue"><Clock3 size={17} /></span>
          <div><strong>{weeklyTimeText}</strong><small>本周有效学习</small></div>
        </div>
        <div className="metric-item">
          <span className="metric-icon is-gold"><Trophy size={17} /></span>
          <div><strong>{masteryText}</strong><small>累计测验正确率</small></div>
        </div>
        <div className="metric-item">
          <span className="metric-icon is-green"><Database size={17} /></span>
          <div><strong>{kbTotal.toLocaleString()}</strong><small>{kbChapters} 个知识主题</small></div>
        </div>
      </section>

      <section className="home-agent-section" aria-labelledby="home-agent-title">
        <div className="home-agent-heading">
          <div>
            <span className="panel-kicker">三位智能体 · 三条学习路径</span>
            <h2 id="home-agent-title">选择你的木雅语学习伙伴</h2>
          </div>
          <p>每位智能体只对应一个功能入口，点击即可进入。</p>
        </div>

        <div className="home-agent-grid">
          {HOME_DIGITAL_HUMANS.map((agent) => {
            const Icon = agentIcons[agent.id];
            return (
              <button
                key={agent.id}
                type="button"
                className={`home-agent-card is-${agent.id}`}
                onClick={agentActions[agent.id]}
                aria-label={`进入${agent.role}`}
              >
                <span className="agent-figure" aria-hidden="true">
                  <img src={agent.waveImage} alt="" />
                </span>
                <span className="agent-card-copy">
                  <span className="agent-name-row">
                    <i><Icon size={16} /></i>
                    <strong>{agent.name}</strong>
                  </span>
                  <b>{agent.role}</b>
                  <small>{agent.description}</small>
                  <span className="agent-enter">立即进入 <ArrowRight size={15} /></span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

