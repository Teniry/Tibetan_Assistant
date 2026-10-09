// 公共类型定义（与 server/routes/config.ts 中的类型保持一致）
export interface TopBarTool {
  id: string;
  // 图标标识：内置有 'audio' / 'info' / 'back' / 'home' / 'settings'，或自定义 emoji / 文字
  icon: string;
  // 鼠标 hover 提示
  label: string;
  // 是否启用
  enabled?: boolean;
  // 行为类型
  type?: 'audio' | 'info' | 'back' | 'home' | 'settings' | 'link';
  // 链接地址（type=link 时使用）
  target?: string;
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
  // 可选的教学用途说明。仅作为聊天上下文提示，不代表文件正文已进入知识库。
  description?: string;
  usage?: 'exam' | 'explanation' | 'reference';
}

export type AssistantMode = 'assessment' | 'language-learning' | 'culture-guide' | 'general';

// 空间页浮动功能按钮（可任意添加 / 删除，每个数字人空间可独立配置）
// 每个按钮独立：图标 / 颜色 / 大小 / 位置 / 行为（打开资源 / 跳转链接 / 占位）
export type ActionButtonBehavior = 'resources' | 'link' | 'audio' | 'video' | 'document' | 'info' | 'custom' | 'chapter-learning';

export interface SpaceActionButton {
  id: string;
  // 图标：内置 lucide 图标名（'Paperclip' / 'FileText' / 'Volume2' / 'Video' / 'Music' / 'BookOpen' ...），
  // 或者 emoji / 任意字符
  icon: string;
  // hover 提示文字
  label: string;
  // 是否启用（默认 true）
  enabled?: boolean;
  // 按钮直径 px（默认 52，范围 36-96）
  size?: number;
  // 按钮位置（百分比坐标，相对 PortalPage 视口左上角），默认 { x: 96, y: 50 }
  position?: { x: number; y: number };
  // 按钮背景色（默认 rgba(10,14,26,0.85) 深色玻璃）
  bgColor?: string;
  // 图标颜色（默认 #FFFFFF）
  iconColor?: string;
  // 边框颜色（默认 rgba(255,255,255,0.35)）
  borderColor?: string;
  // 行为类型：
  //   'resources' → 打开资源面板（显示 resources 数组）
  //   'link'      → 打开链接（target 必须填，可写 https://xxx 或 /portal/xxx）
  //   'audio'     → 语音讲解（占位）
  //   'video'     → 视频讲解（占位，未来可接资源 id）
  //   'document'  → 文档（占位）
  //   'info'      → 信息（占位）
  //   'custom'    → 自定义（占位，console.log）
  action?: ActionButtonBehavior;
  // 链接地址（action=link 时必填）
  target?: string;
  // 角标数字（可选，显示在按钮右下角）
  badge?: number;
  // ========== 每个按钮独立的文件/视频池 ==========
  // 仅当 action 为 'resources' / 'video' / 'document' 时使用：
  //   点击这个按钮，会打开显示这个 files 列表的资源面板
  // 注意：不同按钮拥有各自独立的 files，互不共享
  files?: SpaceResource[];
}

// 图片轮播项（点击图片可查看讲解和来源）
export interface CarouselImage {
  id: string;
  // 图片 URL（上传到 /uploads/resources/ 或外链 https://）
  imageUrl: string;
  // 图片标题（轮播下方显示）
  title: string;
  // 讲解内容（点击图片后弹出显示）
  description: string;
  // 来源网址（讲解依据，点击可跳转；强调"不乱编"）
  sourceUrl?: string;
  // 来源名称（如"甘孜州人民政府网"）
  sourceName?: string;
}

export interface PortalPoint {
  id: string;
  name: string;
  gifUrl: string;            // 跳转页面使用的 speak 数字人 GIF
  waveGifUrl?: string;       // 主页使用的 wave 数字人 GIF（如未配置则 fallback 到 gifUrl）
  pageTitle?: string;
  homePosition?: { x: number; y: number };
  portalPosition?: { x: number; y: number };
  portalBg?: string;
  ragflow?: {
    enabled?: boolean;
    datasetId?: string;
    welcomeMessage?: string;
    title?: string;
  };
  enabled?: boolean;
  label?: string;
  order?: number;
  size?: number;             // 主页上数字人大小 px
  portalSize?: number;       // portal 上数字人大小 px，默认 200
  chatWidth?: number;        // portal 聊天框宽度 px（默认 820）
  chatHeight?: number;       // portal 聊天框高度 px（默认 680）
  // 聊天正文基准字号 px；同时同步到该数字人的2D聊天页与3D空间。
  chatFontSize?: number;
  // ========== 新增：主页标签和空间顶部 ==========
  // 主页副标题（数字人名字框下方的小字，如"木雅语学习智能体"）
  subtitle?: string;
  // 主页标签显示位置：'top' 顶部 / 'bottom' 底部，默认 'bottom'
  homeLabelPosition?: 'top' | 'bottom';
  // 主页标签样式：'bubble' 半透明黑气泡 / 'card' 蓝色圆角卡片（默认 'card'，参考图1风格）
  homeLabelStyle?: 'bubble' | 'card';
  // 标签垂直偏移 px（默认 0）。正值向下、负值向上，用于补偿不同 GIF 中人物位置的差异
  labelOffsetY?: number;
  // 标签水平偏移 px（默认 0）。正值向右、负值向左
  labelOffsetX?: number;
  // 是否显示数字人名字（默认 true）。false 时整个标签气泡都不显示
  showName?: boolean;
  // 是否显示副标题小字（默认 true）。需要 subtitle 字段有值才会渲染
  showSubtitle?: boolean;
  // 空间页顶部居中标题文字（默认用 label 或 name）
  topBarTitle?: string;
  // 空间页顶部居中标题背景色（默认红色 #C8362D）
  topBarColor?: string;
  // 空间页顶部居中标题文字色（默认白色 #FFFFFF）
  topBarTextColor?: string;
  // 空间页顶部右侧工具按钮列表
  topBarTools?: TopBarTool[];
  // 是否显示空间页顶部三栏（返回按钮 + 居中标题 + 工具按钮），默认 true
  showTopBar?: boolean;
  // 是否显示顶部右侧工具按钮区域（默认 true；只在 showTopBar=true 时生效）
  showTopBarTools?: boolean;
  // ========== 工具按钮样式（可配置） ==========
  // 工具按钮背景色（默认 rgba(255,255,255,0.18) 玻璃白）
  topBarButtonBg?: string;
  // 工具按钮悬停时背景色（默认 rgba(255,255,255,0.32)）
  topBarButtonHoverBg?: string;
  // 工具按钮图标颜色（默认 #FFFFFF）
  topBarButtonColor?: string;
  // 工具按钮边框颜色（默认 rgba(255,255,255,0.45)）
  topBarButtonBorderColor?: string;
  // 工具按钮直径 px（默认 36，方形按钮自适应）
  topBarButtonSize?: number;
  // 工具按钮形状：'circle' 圆形 / 'square' 圆角方形（默认 circle）
  topBarButtonShape?: 'circle' | 'square';
  // ========== 数字人说话动画切换（空间页） ==========
  // 是否启用 speak/wave 动态切换（默认 true）：
  //   空闲（未问答/回答完毕）→ 显示 waveGifUrl（未配置则 fallback 到 gifUrl）
  //   回答中（AI 正在聊天框作答）→ 显示 gifUrl（speak 动画）
  speakAnimEnabled?: boolean;
  // 说话状态数字人缩放比例（默认 1.0，范围 0.5~2.0）
  speakScale?: number;
  // 挥手状态数字人缩放比例（默认 1.0，范围 0.5~2.0）
  waveScale?: number;
  // 说话状态垂直偏移 px（正值向下，负值向上，默认 0）
  speakOffsetY?: number;
  // 挥手状态垂直偏移 px（正值向下，负值向上，默认 0）
  waveOffsetY?: number;
  // 浏览器端语音播报：按数字人设置音色角色、语速与音调，不依赖服务器本地音频文件。
  voiceRole?: 'middle-aged-man' | 'sunny-boy' | 'cheerful-girl';
  voiceName?: string;
  voiceRate?: number;
  voicePitch?: number;
  // ========== AI 对话提示词（人设） ==========
  // 该数字人专属的系统提示词，优先级高于全局 llm.systemPrompt。
  // 支持 {persona} 占位符（替换为当前数字人名字 ragflow.title 或 name）。
  // 为空时回退到「高级配置」中的全局提示词。
  systemPrompt?: string;
  // ========== 角色化空间与聊天体验 ==========
  assistantMode?: AssistantMode;
  quickPrompts?: string[];
  // 测评模式：从现有木雅知识库抽取选择题并在页面内判分。
  quizEnabled?: boolean;
  quizQuestionCount?: number;
  allowWebSearch?: boolean;
  chatAccentColor?: string;
  chatPanelColor?: string;
  chatTextColor?: string;
  chatMutedTextColor?: string;
  // ========== 空间资源（文件/视频） ==========
  // 该数字人空间下的资源列表（试卷 PDF、Word 文档、讲解视频等）
  resources?: SpaceResource[];
  // ========== 空间浮动功能按钮（数组，可任意增删） ==========
  // 该数字人空间上的浮动操作按钮数组（图标按钮 + 位置/大小/颜色/行为）
  // 比单一资源按钮更通用：可加「打开资源」「跳转链接」「播放语音」等不同行为
  actionButtons?: SpaceActionButton[];
  // ========== 兼容旧字段（已废弃，新数据请用 actionButtons） ==========
  // 旧版「资源浮动按钮」宽度 px
  resourcesBtnSize?: number;
  // 旧版「资源浮动按钮」位置（百分比坐标）
  resourcesBtnPosition?: { x: number; y: number };
  // ========== 图片轮播（知识画廊） ==========
  // 空间页聊天框旁的图片轮播列表（木雅知识介绍等）
  carouselImages?: CarouselImage[];
  // 是否启用图片轮播（默认 true，carouselImages 非空才渲染）
  carouselEnabled?: boolean;
  // ========== 轮播展示位置（5 种，可配置 + 响应式） ==========
  // 决定轮播在聊天框内的位置；不论哪种都随父容器（chatWidth/chatHeight）自适应。
  //   'above'  → 顶部（消息列表上方，默认值，向下兼容）
  //   'below'  → 底部（输入框上方）
  //   'left'   → 左侧（聊天框水平布局：左图 / 右消息输入）
  //   'right'  → 右侧（聊天框水平布局：左消息输入 / 右图）
  //   'inline' → 内嵌消息流（作为一条助手消息插入对话列表）
  carouselPosition?: 'above' | 'below' | 'left' | 'right' | 'inline';
  // 顶部/底部/消息流模式下轮播卡片的水平对齐方式。
  carouselAlign?: 'left' | 'center' | 'right';
  // ========== 兼容旧字段（已废弃，新数据请用 carouselPosition 枚举） ==========
  // 旧版轮播面板位置（百分比坐标）
  /** @deprecated */
  carouselOldPosition?: { x: number; y: number };
  // 旧版轮播面板宽度 px
  /** @deprecated */
  carouselOldWidth?: number;
}

export interface LLMConfig {
  // 是否启用大模型直连模式（true=绕过 RAGFlow 直接调阿里云 API；false=走 RAGFlow 检索）
  enabled?: boolean;
  // 阿里云百炼 API Key（sk-xxx）
  apiKey?: string;
  // 模型名称（deepseek-v3.2 / deepseek-v3.1 / deepseek-v3 / qwen-turbo / qwen-plus / qwen-max）
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
  homeBg: string;
  homeTitle: string;
  homeSubtitle?: string;
  defaultPortalBg: string;
  ragflow: {
    apiKey: string;
    baseUrl: string;
    datasetName: string;
    model?: string;
  };
  // 大模型直连配置（演示/快速接入模式）
  llm?: LLMConfig;
  // 木小知在 RAGFlow 零命中时使用；只允许可信域名。
  webSearch?: WebSearchConfig;
  points: PortalPoint[];
  menu?: { id: string; name: string; icon?: string; position?: { x: number; y: number } }[];
  updatedAt: number;
}
