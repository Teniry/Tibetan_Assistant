// API 客户端
import type { AppConfig, PortalPoint, SpaceResource } from '../types';
import { streamAgentChat } from '../../streaming-agent-chat';

export interface AgentSource {
  id: string;
  title: string;
  excerpt?: string;
  similarity?: number;
  chapter?: string;
  kind?: 'knowledge-base' | 'trusted-web';
  url?: string;
  domain?: string;
}

export interface AgentChatResponse {
  answer: string;
  agentType: string;
  source: 'ragflow' | 'local' | 'web' | 'qwen';
  evidenceCount: number;
  sources: AgentSource[];
  model: string;
  grounded: boolean;
  warning?: string;
  modelBased?: boolean;
  conversationMessageId?: string;
}

const BASE = ''; // 相对路径，借助 Vite proxy

async function jsonFetch(url: string, init?: RequestInit) {
  const r = await fetch(BASE + url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`);
  }
  return r.json();
}

// ===== 配置 =====
export async function getConfig(): Promise<AppConfig> {
  return jsonFetch('/api/config');
}

export async function saveConfig(cfg: AppConfig) {
  return jsonFetch('/api/config', {
    method: 'PUT',
    body: JSON.stringify(cfg),
  });
}

export async function patchConfig(patch: Partial<AppConfig>) {
  return jsonFetch('/api/config', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

// ===== 点位 =====
export async function addPoint(point: Partial<PortalPoint>) {
  return jsonFetch('/api/config/points', {
    method: 'POST',
    body: JSON.stringify(point),
  });
}

export async function updatePoint(id: string, patch: Partial<PortalPoint>) {
  return jsonFetch(`/api/config/points/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function deletePoint(id: string) {
  return jsonFetch(`/api/config/points/${id}`, { method: 'DELETE' });
}

// ===== 上传 =====
export interface UploadResult {
  ok: boolean;
  url: string;
  filename: string;
  original: string;
  size: number;
  mime: string;
  converted?: boolean; // 服务器已转 WebP
  originalSize?: number;
}

export async function uploadFile(file: File, sub = 'misc'): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);
  const r = await fetch(`/api/uploads?sub=${encodeURIComponent(sub)}`, {
    method: 'POST',
    body: form,
  });
  if (!r.ok) throw new Error('upload failed: ' + (await r.text()));
  return r.json();
}

export type UploadPhase = 'upload' | 'process';

export interface UploadProgress {
  phase: UploadPhase;
  /** upload 阶段：0-100 实际上传进度；process 阶段：服务器转换 WebP 中（无精确进度） */
  percent: number;
}

/** 带进度回调的上传（XHR），可区分「上传中 / 服务器转换中」两个阶段 */
export function uploadFileWithProgress(
  file: File,
  sub = 'misc',
  onProgress?: (p: UploadProgress) => void,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/uploads?sub=${encodeURIComponent(sub)}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress?.({ phase: 'upload', percent: Math.round((e.loaded / e.total) * 100) });
      }
    };
    // 请求体发送完毕，等待服务器响应（图片会被转为 WebP）
    xhr.upload.onload = () => onProgress?.({ phase: 'process', percent: 0 });
    xhr.onload = () => {
      try {
        const j = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(j);
        else reject(new Error(j.error || `HTTP ${xhr.status}`));
      } catch {
        reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText?.slice(0, 120) || '上传失败'}`));
      }
    };
    xhr.onerror = () => reject(new Error('网络错误，上传失败'));
    xhr.ontimeout = () => reject(new Error('上传超时'));
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}

// ===== 跳转 portal 数据 =====
export async function getPortal(id: string) {
  return jsonFetch(`/api/portal/${id}`);
}

export async function listPortals() {
  return jsonFetch('/api/portal');
}

// ===== RAGFlow =====
export async function ragflowHealth() {
  const startedAt = Date.now();
  const status = await jsonFetch('/api/ragflow-status');
  return {
    ok: Boolean(status.configured),
    status: status.configured ? 200 : 503,
    elapsedMs: Date.now() - startedAt,
    baseUrl: status.baseUrl || 'RAGFlow',
  };
}

/**
 * 与 RAGFlow 流式对话
 * @param question 用户输入
 * @param point 对应的点位（含 datasetId 等）
 * @param onChunk 文本块回调
 * @param signal 用于取消
 */
export async function ragflowChat(
  question: string,
  point: PortalPoint,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  resourceContext?: SpaceResource | null,
  clientId?: string,
  clientMessageId?: string,
): Promise<AgentChatResponse> {
  const agentType = ['muxiaowen', 'muxiaoce', 'muxiaozhi'].includes(point.id)
    ? point.id
    : 'muxiaozhi';
  const payload = await streamAgentChat({
    message: question,
    agentType,
    history,
    clientId,
    clientMessageId,
    resourceContext: resourceContext ? {
      name: resourceContext.name,
      type: resourceContext.type,
      usage: resourceContext.usage,
      description: resourceContext.description,
    } : undefined,
  }, onChunk, signal);
  return {
    answer: payload.answer,
    agentType: payload.agentType || agentType,
    source: payload.source === 'web' ? 'web' : payload.source === 'local' ? 'local' : payload.source === 'qwen' ? 'qwen' : 'ragflow',
    evidenceCount: payload.evidenceCount || 0,
    sources: Array.isArray(payload.sources) ? payload.sources : [],
    model: payload.model || 'deepseek-v3',
    grounded: payload.grounded === true,
    warning: payload.warning,
    modelBased: payload.modelBased === true,
    conversationMessageId: payload.conversationMessageId,
  };
}
