/**
 * 应用配置文件
 * 统一管理应用名称和其他全局配置
 */

export const APP_CONFIG = {
  /** 应用名称 */
  name: '木雅藏语AI助手',
  
  /** 应用名称首字母（用于 Logo） */
  nameInitial: '木',
  
  /** 应用描述 */
  description: '面向木雅语学习的 AI 智能教学空间',
  
  /** 副标题 */
  subtitle: '木雅语 · AI 数字教师',
  
  /** 版本号 */
  version: '1.0.0',

  /** 外部 3D 智慧学习空间 */
  metaUniverseUrl: 'https://tibetan.workbrain.cn/chat/space-meta-universe-preview/13366952631173637',

  /** Workbrain 数字人课堂配置（applyId 为公开的课堂应用标识，不是密钥） */
  digitalHumanBaseUrl: 'https://tibetan.workbrain.cn/chat/digital-room-h5',
  digitalHumanApplyId: '13365629981852165',

};

/**
 * 生成数字人课堂地址。website 参数默认取当前网页地址，因此同一构建可在
 * localhost、cpolar 和 AutoDL 自定义服务之间迁移，无需写死公网域名。
 */
export function buildDigitalHumanUrl(websiteUrl?: string): string {
  const rawWebsite = websiteUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  const website = new URL(rawWebsite);
  // Workbrain 数字人页面使用 HTTPS。公网页面如果被 HTTP 打开，
  // 必须先升级为 HTTPS，否则浏览器会将嵌入的项目当作混合内容拦截。
  const isLocalHost = ['localhost', '127.0.0.1'].includes(website.hostname);
  if (!isLocalHost && website.protocol === 'http:') {
    website.protocol = 'https:';
  }
  // 被数字人页面加载后不再触发首页自动跳转，避免形成循环。
  website.searchParams.set('digitalHuman', 'embedded');
  const url = new URL(APP_CONFIG.digitalHumanBaseUrl);
  url.searchParams.set('applyId', APP_CONFIG.digitalHumanApplyId);
  url.searchParams.set('website', website.toString());
  url.searchParams.set('language', 'zh_CN');
  return url.toString();
}

/** 公网首页是否应自动进入数字人容器。
 *  已关闭自动跳转：直接访问 cpolar/公网域名时正常渲染应用页面，
 *  不再强制跳转到 Workbrain 数字人容器。
 *  如需进入数字人课堂，请直接访问 APP_CONFIG.digitalHumanBaseUrl 拼接的完整地址，
 *  或在页面中手动放置链接。
 */
export function shouldAutoOpenDigitalHuman(): boolean {
  return false;
}

export default APP_CONFIG;
