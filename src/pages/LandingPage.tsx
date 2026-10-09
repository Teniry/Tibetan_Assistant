import { useNavigate } from 'react-router-dom';
import { Monitor, Box, Sparkles, BookOpen, GraduationCap, Users } from 'lucide-react';
import { useState, useEffect, useLayoutEffect } from 'react';
import { apiUrl } from '../api-config';

const LANDING_PREVIEW_IMAGES = [
  '/screenshots/2d-preview.png',
  '/screenshots/3d-preview.jpg',
];

declare global {
  interface Window {
    __setBootProgress?: (value: number, label?: string) => void;
    __bootProgressTimer?: number;
    __bootRemovalTimer?: number;
  }
}

/**
 * 首次打开网站时，加载层由 index.html 在 React 下载前立即显示；加载完成后该节点
 * 会被移除。用户随后从 2D/3D 页面返回主页时，需要重新创建同款加载层，否则
 * LandingPage 等待预览图片期间只会露出一整块米白背景。
 */
function prepareLandingBootScreen() {
  if (window.__bootRemovalTimer !== undefined) {
    window.clearTimeout(window.__bootRemovalTimer);
    window.__bootRemovalTimer = undefined;
  }

  let bootScreen = document.getElementById('boot-screen');
  if (bootScreen) {
    // 若应用最初是在 /chat 等深蓝页面打开，index.html 会用 !important 隐藏
    // 静态启动层；返回主页时以内联 !important 覆盖该启动期规则。
    bootScreen.style.setProperty('display', 'flex', 'important');
    bootScreen.classList.remove('boot-screen--leaving');
    bootScreen.classList.add('is-visible');
    return;
  }

  bootScreen = document.createElement('div');
  bootScreen.id = 'boot-screen';
  bootScreen.className = 'is-visible';
  bootScreen.dataset.runtimeCreated = 'true';
  bootScreen.style.setProperty('display', 'flex', 'important');
  bootScreen.innerHTML = `
    <div class="boot-ring"><div class="boot-logo">木</div></div>
    <div class="boot-title">木雅藏语AI助手</div>
    <div class="boot-status" id="boot-status">
      <span id="boot-status-label">正在加载应用</span>
      <span class="boot-percent" id="boot-percent">0%</span>
    </div>
    <div class="boot-bar"><div class="boot-bar-inner"></div></div>
  `;
  document.body.appendChild(bootScreen);

  let progress = 0;
  window.__setBootProgress = (value, label) => {
    progress = Math.max(progress, Math.min(100, Math.round(value)));
    const bar = bootScreen?.querySelector<HTMLElement>('.boot-bar-inner');
    const percent = bootScreen?.querySelector<HTMLElement>('.boot-percent');
    const statusLabel = bootScreen?.querySelector<HTMLElement>('#boot-status-label');
    if (bar) bar.style.width = `${progress}%`;
    if (percent) percent.textContent = `${progress}%`;
    if (label && statusLabel) statusLabel.textContent = label;
  };

  window.__setBootProgress(4, '正在加载应用');
  window.__bootProgressTimer = window.setInterval(() => {
    if (progress >= 65) return;
    const step = Math.max(1, Math.ceil((65 - progress) * 0.09));
    window.__setBootProgress?.(Math.min(65, progress + step));
  }, 140);
}

function preloadImage(src: string, onComplete: () => void): Promise<void> {
  return new Promise(resolve => {
    const image = new Image();
    const finish = () => {
      onComplete();
      resolve();
    };
    image.onload = finish;
    image.onerror = finish;
    image.src = src;
  });
}

function dismissLandingBootScreen() {
  const bootScreen = document.getElementById('boot-screen');
  if (!bootScreen) return;
  if (window.__bootProgressTimer !== undefined) {
    window.clearInterval(window.__bootProgressTimer);
  }
  window.__setBootProgress?.(100, '加载完成');
  // 让用户看清 100% 后再淡出，避免进度条突然消失。
  window.__bootRemovalTimer = window.setTimeout(() => {
    bootScreen.classList.add('boot-screen--leaving');
    window.__bootRemovalTimer = window.setTimeout(() => {
      bootScreen.remove();
      window.__bootRemovalTimer = undefined;
    }, 360);
  }, 220);
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [appName, setAppName] = useState('木雅藏语AI助手');
  const [subtitle, setSubtitle] = useState('助力培养"国家通用语言文字+少数民族语言"双语人才');
  const [loaded, setLoaded] = useState(false);

  // useLayoutEffect 会在浏览器绘制主页前执行，避免返回主页时先闪出空白米白页。
  useLayoutEffect(() => {
    prepareLandingBootScreen();

    return () => {
      if (window.__bootProgressTimer !== undefined) {
        window.clearInterval(window.__bootProgressTimer);
        window.__bootProgressTimer = undefined;
      }
      const bootScreen = document.getElementById('boot-screen');
      if (bootScreen?.dataset.runtimeCreated === 'true') bootScreen.remove();
    };
  }, []);

  useEffect(() => {
    // 加载应用配置
    fetch(apiUrl('/api/app-config'))
      .then(r => r.json())
      .then(data => {
        if (data.appName) setAppName(data.appName);
        if (data.homeTitle) setSubtitle(data.homeTitle);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let disposed = false;
    let revealTimer: number | undefined;
    let minimumTimer: number | undefined;

    // 等首页关键预览图加载完成，并保证加载动效至少完整展示约 0.7 秒。
    window.__setBootProgress?.(70, '正在准备首页');
    let completedImages = 0;
    const assetsReady = Promise.all(LANDING_PREVIEW_IMAGES.map(src => preloadImage(src, () => {
      completedImages += 1;
      window.__setBootProgress?.(completedImages === 1 ? 85 : 95, '正在加载首页图片');
    })));
    const minimumVisibleTime = new Promise<void>(resolve => {
      minimumTimer = window.setTimeout(resolve, 700);
    });
    const pageReady = Promise.all([assetsReady, minimumVisibleTime]);
    // 12 秒兜底，防止异常资源使加载层常驻。
    const timeout = new Promise<void>(resolve => {
      revealTimer = window.setTimeout(resolve, 12000);
    });

    Promise.race([pageReady, timeout]).then(() => {
      if (disposed) return;
      // 给首屏至少留出两个绘制帧，让卡片布局完成后再淡出加载层。
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (disposed) return;
          setLoaded(true);
          dismissLandingBootScreen();
        });
      });
    });

    return () => {
      disposed = true;
      if (revealTimer !== undefined) window.clearTimeout(revealTimer);
      if (minimumTimer !== undefined) window.clearTimeout(minimumTimer);
    };
  }, []);

  const cards = [
    {
      id: '2d',
      title: '2D 网页式学习',
      subtitle: '高效 · 专注 · 知识密集',
      description: '通过聊天对话、章节课堂、智能测验、资源中心等功能，系统学习木雅语知识。适合快速查阅、深度阅读和系统复习。',
      image: '/screenshots/2d-preview.png',
      icon: Monitor,
      accent: '#8b5cf6',
      bgGradient: 'from-violet-50 to-fuchsia-50',
      borderHover: 'hover:border-violet-300',
      onClick: () => navigate('/chat'),
      features: [
        { icon: BookOpen, text: '章节课堂' },
        { icon: GraduationCap, text: '智能测验' },
        { icon: Users, text: '多智能体对话' },
      ],
    },
    {
      id: '3d',
      title: '3D 数字人沉浸式学习',
      subtitle: '沉浸 · 互动 · 身临其境',
      description: '走进木雅语智慧空间，与木小文、木小测、木小知三位数字人面对面交流。在沉浸式 3D 场景中体验文化、学习语言。',
      image: '/screenshots/3d-preview.jpg',
      icon: Box,
      accent: '#0ea5e9',
      bgGradient: 'from-sky-50 to-cyan-50',
      borderHover: 'hover:border-sky-300',
      onClick: () => navigate('/wisdom-space'),
      features: [
        { icon: Users, text: '三位数字人' },
        { icon: Sparkles, text: '沉浸式场景' },
        { icon: Monitor, text: '语音交互' },
      ],
    },
  ];

  return (
    <div className="w-screen h-screen overflow-hidden relative flex flex-col items-center justify-center"
      style={{ backgroundColor: '#f8f5f0' }}
    >
      {/* 背景装饰 */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #c4a882 0%, transparent 70%)' }}
        />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)' }}
        />
        {/*  subtle grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle, #8b7355 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      {/* 顶部品牌区 */}
      <div className={`relative z-10 text-center mb-8 transition-all duration-700 ${loaded ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-6'}`}>
        <div className="inline-flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg font-bold shadow-lg"
            style={{ backgroundColor: '#9a3b1c' }}
          >
            木
          </div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#2c1810' }}>
            {appName}
          </h1>
        </div>
        <p className="text-sm" style={{ color: '#8b7355' }}>
          {subtitle}
        </p>
      </div>

      {/* 两个入口卡片 */}
      <div className="relative z-10 flex flex-col md:flex-row gap-6 md:gap-8 px-6 max-w-5xl w-full items-stretch">
        {cards.map((card, index) => {
          const Icon = card.icon;
          return (
            <button
              key={card.id}
              onClick={card.onClick}
              className={`group relative flex-1 rounded-2xl border-2 bg-white text-left transition-all duration-500 hover:shadow-2xl hover:-translate-y-1 ${card.borderHover} ${loaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
              style={{
                borderColor: 'rgba(0,0,0,0.06)',
                transitionDelay: `${150 + index * 150}ms`,
                minHeight: 420,
              }}
            >
              {/* 预览图区域 */}
              <div className="relative w-full overflow-hidden rounded-t-2xl" style={{ height: 200 }}>
                <img
                  src={card.image}
                  alt={card.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  draggable={false}
                />
                {/* 图片上方渐变遮罩 */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white/90" />
                {/* 模式标签 */}
                <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-white shadow-md backdrop-blur-sm"
                  style={{ backgroundColor: card.accent }}
                >
                  <Icon size={13} />
                  {card.id === '2d' ? '网页模式' : '沉浸模式'}
                </div>
              </div>

              {/* 内容区 */}
              <div className="p-5 pt-2">
                <h2 className="text-lg font-bold mb-1" style={{ color: '#2c1810' }}>
                  {card.title}
                </h2>
                <p className="text-xs font-medium mb-2" style={{ color: card.accent }}>
                  {card.subtitle}
                </p>
                <p className="text-sm leading-relaxed mb-4" style={{ color: '#6b5b4f' }}>
                  {card.description}
                </p>

                {/* 功能标签 */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {card.features.map((f, i) => {
                    const FeatIcon = f.icon;
                    return (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium"
                        style={{ backgroundColor: `${card.accent}10`, color: card.accent }}
                      >
                        <FeatIcon size={12} />
                        {f.text}
                      </span>
                    );
                  })}
                </div>

                {/* 进入按钮 */}
                <div className="flex items-center justify-between mt-auto">
                  <span className="text-xs font-medium" style={{ color: '#9ca3af' }}>
                    点击卡片进入
                  </span>
                  <span className="inline-flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all duration-300 group-hover:shadow-lg"
                    style={{ backgroundColor: card.accent }}
                  >
                    立即进入
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* 底部提示 */}
      <div className={`relative z-10 mt-8 text-center transition-all duration-700 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        style={{ transitionDelay: '500ms' }}
      >
        <p className="text-xs" style={{ color: '#b8a99a' }}>
          两种方式数据互通，随时切换，学习进度自动同步
        </p>
      </div>
    </div>
  );
}
