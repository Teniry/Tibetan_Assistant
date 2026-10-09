// API 基础 URL 配置
// 开发环境：通过 Vite proxy 使用相对路径
// 生产环境：可以根据部署环境配置
const isDev = import.meta.env.DEV;

export const API_BASE_URL = isDev ? '' : (import.meta.env.VITE_API_BASE_URL || '');

export function apiUrl(path: string): string {
  // 确保路径以 / 开头
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}
