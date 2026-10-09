// 配置存储：所有点位、背景图、菜单、跳转设置
import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT = join(__dirname, '..', '..');
const CONFIG_FILE = join(ROOT, 'data', 'metaverse-config.json');

if (!existsSync(dirname(CONFIG_FILE))) mkdirSync(dirname(CONFIG_FILE), { recursive: true });

// 空间页顶部右侧工具按钮
export interface TopBarTool {
  id: string;
  icon: string;                                      // 'audio' / 'info' / 'back' / 'home' / 'settings' / emoji / 文字
  label: string;                                     // hover 提示
  enabled?: boolean;
  type?: 'audio' | 'info' | 'back' | 'home' | 'settings' | 'link';
  target?: string;                                   // type=link 时使用
}

// 空间资源（文件/视频）
export interface SpaceResource {
  id: string;
  name: string;           // 显示名（原始文件名）
  type: 'video' | 'document' | 'image' | 'other';
  url: string;            // /uploads/resources/xxx.pdf
  fileName: string;       // 服务器存储文件名
  fileSize: number;       // 字节
  mimeType: string;       // application/pdf, video/mp4 等
  createdAt: number;      // 上传时间戳
  description?: string;
  usage?: 'exam' | 'explanation' | 'reference';
}

export type AssistantMode = 'assessment' | 'language-learning' | 'culture-guide' | 'general';

// 空间页浮动功能按钮（可任意添加 / 删除，每个数字人空间可独立配置）
export type ActionButtonBehavior = 'resources' | 'link' | 'audio' | 'video' | 'document' | 'info' | 'custom';

export interface SpaceActionButton {
  id: string;
  // 图标：lucide 图标名（'Paperclip' / 'FileText' / 'Volume2' / ...）或 emoji / 任意字符
  icon: string;
  // hover 提示文字
  label: string;
  // 是否启用（默认 true）
  enabled?: boolean;
  // 按钮直径 px（默认 52）
  size?: number;
  // 按钮位置（百分比坐标）
  position?: { x: number; y: number };
  // 按钮背景色（默认 rgba(10,14,26,0.85)）
  bgColor?: string;
  // 图标颜色（默认 #FFFFFF）
  iconColor?: string;
  // 边框颜色
  borderColor?: string;
  // 行为类型
  action?: ActionButtonBehavior;
  // 链接地址（action=link 时必填）
  target?: string;
  // 角标数字（可选）
  badge?: number;
  // ========== 每个按钮独立的文件/视频池 ==========
  // 仅当 action 为 'resources' / 'video' / 'document' 时使用
  files?: SpaceResource[];
}

// 图片轮播项（点击图片可查看讲解和来源）
export interface CarouselImage {
  id: string;
  imageUrl: string;        // 图片 URL（上传或外链）
  title: string;           // 图片标题
  description: string;     // 讲解内容（点击图片后弹出）
  sourceUrl?: string;      // 来源网址
  sourceName?: string;     // 来源名称
}

export interface PortalPoint {
  id: string;
  name: string;                              // 显示名「小文」「展厅介绍员」
  gifUrl: string;                            // 跳转页(speak) 数字人 GIF
  waveGifUrl?: string;                       // 主页(wave) 数字人 GIF，未配置时 fallback 到 gifUrl
  pageTitle?: string;                        // portal 页内名
  // 主页面（图1）上的位置（百分比坐标）
  homePosition?: { x: number; y: number };
  // 跳转页面（图3）上的位置（百分比坐标），默认左下角
  portalPosition?: { x: number; y: number };
  // 跳转页背景
  portalBg?: string;                         // portal 背景图 URL
  // RAGFlow Chat 配置
  ragflow?: {
    enabled?: boolean;
    datasetId?: string;
    welcomeMessage?: string;
    title?: string;
  };
  // 该点位在主页面是否展示
  enabled?: boolean;
  // 数字人标签
  label?: string;
  // 顺序
  order?: number;
  // 数字人在主页面的大小 px
  size?: number;
  // 数字人在跳转页的大小 px（默认 200）
  portalSize?: number;
  // 跳转页聊天框宽度 px（默认 820）
  chatWidth?: number;
  // 跳转页聊天框高度 px（默认 680）
  chatHeight?: number;
  // 2D/3D聊天正文基准字号 px
  chatFontSize?: number;
  // ========== 新增字段（主页标签 + 空间顶部）==========
  // 主页副标题（数字人名字下方的小字，如"木雅语学习智能体"）
  subtitle?: string;
  // 主页标签位置 'top' / 'bottom'，默认 'bottom'
  homeLabelPosition?: 'top' | 'bottom';
  // 主页标签样式 'bubble' / 'card'，默认 'card'（图1风格蓝色卡片）
  homeLabelStyle?: 'bubble' | 'card';
  // 标签垂直偏移 px（默认 0）。正值向下、负值向上，用于补偿不同 GIF 中人物位置的差异
  labelOffsetY?: number;
  // 标签水平偏移 px（默认 0）。正值向右、负值向左
  labelOffsetX?: number;
  // 是否显示数字人名字（默认 true）
  showName?: boolean;
  // 是否显示副标题小字（默认 true，subtitle 有值时才渲染）
  showSubtitle?: boolean;
  // 空间页顶部居中标题文字（默认用 label 或 name）
  topBarTitle?: string;
  // 空间页顶部居中标签背景色（默认红色 #C8362D）
  topBarColor?: string;
  // 空间页顶部居中标签文字颜色（默认白色）
  topBarTextColor?: string;
  // 空间页顶部右侧工具按钮列表
  topBarTools?: TopBarTool[];
  // 是否显示空间页顶部三栏（返回 + 居中标题 + 工具按钮），默认 true
  showTopBar?: boolean;
  // 是否显示顶部右侧工具按钮区（默认 true；仅 showTopBar=true 时生效）
  showTopBarTools?: boolean;
  // ========== 工具按钮样式（可配置） ==========
  // 工具按钮背景色
  topBarButtonBg?: string;
  // 工具按钮悬停背景色
  topBarButtonHoverBg?: string;
  // 工具按钮图标颜色
  topBarButtonColor?: string;
  // 工具按钮边框颜色
  topBarButtonBorderColor?: string;
  // 工具按钮直径 px（默认 36）
  topBarButtonSize?: number;
  // 工具按钮形状 'circle' / 'square'
  topBarButtonShape?: 'circle' | 'square';
  // 是否启用 speak/wave 动态切换（默认 true）：
  //   空闲/回答完毕 → waveGifUrl（未配置则 fallback 到 gifUrl）
  //   回答中        → gifUrl（speak 动画）
  speakAnimEnabled?: boolean;
  voiceRole?: 'middle-aged-man' | 'sunny-boy' | 'cheerful-girl';
  voiceName?: string;
  voiceRate?: number;
  voicePitch?: number;
  // 该数字人专属系统提示词（优先级高于全局 llm.systemPrompt）；支持 {persona} 占位符
  systemPrompt?: string;
  assistantMode?: AssistantMode;
  quickPrompts?: string[];
  quizEnabled?: boolean;
  quizQuestionCount?: number;
  allowWebSearch?: boolean;
  chatAccentColor?: string;
  chatPanelColor?: string;
  chatTextColor?: string;
  chatMutedTextColor?: string;
  // ========== 空间资源（文件/视频） ==========
  resources?: SpaceResource[];
  // ========== 空间浮动功能按钮（数组，可任意增删） ==========
  actionButtons?: SpaceActionButton[];
  // ========== 兼容旧字段（已废弃） ==========
  resourcesBtnSize?: number;
  resourcesBtnPosition?: { x: number; y: number };
  // ========== 图片轮播（知识画廊） ==========
  carouselImages?: CarouselImage[];
  carouselEnabled?: boolean;
  // ========== 轮播展示位置（5 种，可配置 + 响应式） ==========
  //   'above' 顶部（默认） / 'below' 底部 / 'left' 左侧 / 'right' 右侧 / 'inline' 内嵌消息流
  carouselPosition?: 'above' | 'below' | 'left' | 'right' | 'inline';
  carouselAlign?: 'left' | 'center' | 'right';
  /** @deprecated 兼容旧版坐标式 */
  carouselOldPosition?: { x: number; y: number };
  /** @deprecated 兼容旧版宽度 */
  carouselOldWidth?: number;
}

export interface LLMConfig {
  // 是否启用大模型直连模式（true=绕过 RAGFlow 直接调阿里云 API；false=走 RAGFlow 检索）
  enabled?: boolean;
  // 阿里云百炼 API Key（sk-xxx）
  apiKey?: string;
  // 模型名称
  model?: string;
  // 系统提示词（人设）
  systemPrompt?: string;
  // 生成温度 0-2，默认 0.7
  temperature?: number;
}

export interface WebSearchConfig {
  enabled?: boolean;
  provider?: 'tavily';
  apiKey?: string;
  trustedDomains?: string[];
  maxResults?: number;
}

export interface AppConfig {
  version: 1;
  // 主页面背景（图1 风格）
  homeBg: string;
  // 主页面标题
  homeTitle: string;
  // 主页面 subtitle
  homeSubtitle?: string;
  // 跳转页默认背景（图3 风格）
  defaultPortalBg: string;
  // 默认 RAGFlow 配置
  ragflow: {
    apiKey: string;
    baseUrl: string;
    datasetName: string;
    model?: string;
  };
  // 大模型直连配置（演示/快速接入模式）
  llm?: LLMConfig;
  webSearch?: WebSearchConfig;
  // 全部点位
  points: PortalPoint[];
  // 顶部菜单（学习入口等）
  menu?: { id: string; name: string; icon?: string; position?: { x: number; y: number } }[];
  // 更新时间
  updatedAt: number;
}

const DEFAULT_CONFIG: AppConfig = {
  version: 1,
  homeBg: '/home-bg.png',
  homeTitle: '3D 藏语空间',
  homeSubtitle: '点击地图上的数字人进入对应学习场景',
  defaultPortalBg: '/default-portal-bg.svg',
  ragflow: {
    apiKey: '',
    baseUrl: 'http://127.0.0.1:9380',
    datasetName: 'muya',
    model: 'deepseek-v3',
  },
  llm: {
    enabled: false,
    apiKey: '',
    model: 'deepseek-v3',
    systemPrompt: '你是"{persona}"，一个亲切专业的藏语（木雅方言）教学助手，同时也具备通用知识问答能力。请用简体中文回答，条理清晰，涉及词汇或语法时给出示例。',
    temperature: 0.7,
  },
  webSearch: {
    enabled: false,
    provider: 'tavily',
    apiKey: '',
    trustedDomains: [
      'gov.cn',
      'baike.baidu.com',
      'edu.cn',
      'cas.cn',
      'gzz.gov.cn',
      'kangding.gov.cn',
    ],
    maxResults: 5,
  },
  points: [
    {
      id: 'demo_xiaowen',
      name: '小文',
      label: '木雅金塔',
      gifUrl: '/muxiaoce-speak.gif',
      pageTitle: '3D 空间 · 小文',
      homePosition: { x: 35, y: 55 },
      portalPosition: { x: 12, y: 78 },
      portalBg: '',
      ragflow: {
        enabled: true,
        welcomeMessage: '你好，我是小文，让我用木雅藏语带你逛逛这片土地吧～',
        title: '小文',
      },
      enabled: true,
      order: 0,
    },
    {
      id: 'demo_zhuchi',
      name: '小石',
      label: '展厅介绍员',
      gifUrl: '/muxiaoce-speak.gif',
      pageTitle: '3D 空间 · 展厅介绍员',
      homePosition: { x: 65, y: 65 },
      portalPosition: { x: 12, y: 78 },
      ragflow: {
        enabled: true,
        welcomeMessage: '欢迎来到展览厅，让我为你介绍这里的藏语文化故事～',
        title: '展厅介绍员',
      },
      enabled: true,
      order: 1,
    },
    {
      id: 'demo_xuexi',
      name: '学习入口',
      label: '学习',
      gifUrl: '/muxiaoce-speak.gif',
      pageTitle: '3D 空间 · 学习',
      homePosition: { x: 12, y: 88 },
      portalPosition: { x: 12, y: 78 },
      ragflow: {
        enabled: true,
        welcomeMessage: '嗨，今天想学点什么？我们从基础藏语开始吧～',
        title: '学习助手',
      },
      enabled: true,
      order: 2,
    },
  ],
  menu: [
    { id: 'menu_xuexi', name: '学习', icon: '' },
  ],
  updatedAt: Date.now(),
};

function readConfig(): AppConfig {
  if (!existsSync(CONFIG_FILE)) {
    writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
    return DEFAULT_CONFIG;
  }
  try {
    const raw = readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as AppConfig;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (e) {
    console.error('[config] failed to parse, fallback to default:', e);
    return DEFAULT_CONFIG;
  }
}

function writeConfig(cfg: AppConfig) {
  cfg.updatedAt = Date.now();
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
}

const router = Router();

// GET /api/config — 完整配置
router.get('/', (_req, res) => {
  res.json(readConfig());
});

// GET /api/config/public — 公开配置（不含 API Key 完整值）
router.get('/public', (_req, res) => {
  const cfg = readConfig();
  res.json({
    ...cfg,
    ragflow: {
      ...cfg.ragflow,
      apiKey: cfg.ragflow.apiKey ? `${cfg.ragflow.apiKey.slice(0, 10)}***` : '',
    },
    llm: cfg.llm ? { ...cfg.llm, apiKey: cfg.llm.apiKey ? '***' : '' } : undefined,
    webSearch: cfg.webSearch ? { ...cfg.webSearch, apiKey: cfg.webSearch.apiKey ? '***' : '' } : undefined,
  });
});

// PUT /api/config — 整体替换
router.put('/', (req, res) => {
  try {
    const incoming = req.body as AppConfig;
    if (!incoming || typeof incoming !== 'object') throw new Error('invalid config');
    const merged: AppConfig = { ...DEFAULT_CONFIG, ...incoming, updatedAt: Date.now() };
    writeConfig(merged);
    res.json({ ok: true, config: merged });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// PATCH /api/config — 部分更新
router.patch('/', (req, res) => {
  try {
    const current = readConfig();
    const updated = { ...current, ...req.body, updatedAt: Date.now() };
    writeConfig(updated);
    res.json({ ok: true, config: updated });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/config/points — 追加点位
router.post('/points', (req, res) => {
  try {
    const cfg = readConfig();
    const point = req.body as PortalPoint;
    if (!point.id) {
      point.id = `pt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    }
    cfg.points = cfg.points || [];
    cfg.points.push(point);
    writeConfig(cfg);
    res.json({ ok: true, point, config: cfg });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// PATCH /api/config/points/:id — 更新某个点位
router.patch('/points/:id', (req, res) => {
  try {
    const cfg = readConfig();
    const idx = (cfg.points || []).findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'point not found' });
      return;
    }
    cfg.points[idx] = { ...cfg.points[idx], ...req.body };
    writeConfig(cfg);
    res.json({ ok: true, point: cfg.points[idx], config: cfg });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE /api/config/points/:id — 删除点位
router.delete('/points/:id', (req, res) => {
  try {
    const cfg = readConfig();
    cfg.points = (cfg.points || []).filter((p) => p.id !== req.params.id);
    writeConfig(cfg);
    res.json({ ok: true, config: cfg });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

export { readConfig, writeConfig, CONFIG_FILE };
export default router;
