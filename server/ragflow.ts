export interface RagflowChunk {
  id: string;
  content: string;
  question: string;
  documentId: string;
  documentName: string;
  datasetId: string;
  similarity: number;
  termSimilarity: number;
  vectorSimilarity: number;
}

export interface RagflowRetrievalResult {
  chunks: RagflowChunk[];
  total: number;
}

function parseNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(value.toLowerCase());
}

function splitIds(value: string | undefined): string[] {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeBaseUrl(value: string | undefined): string {
  return String(value || '').trim().replace(/\/+$/, '');
}

function runtimeConfig() {
  const portal = readMetaverseConfig().ragflow;
  return {
    baseUrl: normalizeBaseUrl(process.env.RAGFLOW_BASE_URL || portal?.baseUrl),
    apiKey: String(process.env.RAGFLOW_API_KEY || portal?.apiKey || '').trim(),
    datasetIds: splitIds(process.env.RAGFLOW_DATASET_IDS),
    datasetName: String(process.env.RAGFLOW_DATASET_NAME || portal?.datasetName || 'muya').trim(),
    similarityThreshold: parseNumber(process.env.RAGFLOW_SIMILARITY_THRESHOLD, 0.35, 0, 1),
    vectorSimilarityWeight: parseNumber(process.env.RAGFLOW_VECTOR_SIMILARITY_WEIGHT, 0.3, 0, 1),
    pageSize: Math.round(parseNumber(process.env.RAGFLOW_PAGE_SIZE, 8, 1, 30)),
    topK: Math.round(parseNumber(process.env.RAGFLOW_TOP_K, 64, 1, 1024)),
    timeoutMs: Math.round(parseNumber(process.env.RAGFLOW_TIMEOUT_MS, 20000, 1000, 120000)),
    fallbackLocal: parseBoolean(process.env.RAGFLOW_FALLBACK_LOCAL, false),
  };
}

// 保留原导出名称，属性每次读取都反映可视化配置页的最新保存结果。
export const RAGFLOW_CONFIG = {
  get baseUrl() { return runtimeConfig().baseUrl; },
  get apiKey() { return runtimeConfig().apiKey; },
  get datasetIds() { return runtimeConfig().datasetIds; },
  get datasetName() { return runtimeConfig().datasetName; },
  get similarityThreshold() { return runtimeConfig().similarityThreshold; },
  get vectorSimilarityWeight() { return runtimeConfig().vectorSimilarityWeight; },
  get pageSize() { return runtimeConfig().pageSize; },
  get topK() { return runtimeConfig().topK; },
  get timeoutMs() { return runtimeConfig().timeoutMs; },
  get fallbackLocal() { return runtimeConfig().fallbackLocal; },
};

export function isRagflowConfigured(): boolean {
  return Boolean(
    RAGFLOW_CONFIG.baseUrl &&
    RAGFLOW_CONFIG.apiKey &&
    (RAGFLOW_CONFIG.datasetIds.length > 0 || Boolean(RAGFLOW_CONFIG.datasetName))
  );
}

export function getRagflowStatus() {
  const missing: string[] = [];
  if (!RAGFLOW_CONFIG.baseUrl) missing.push('RAGFLOW_BASE_URL');
  if (!RAGFLOW_CONFIG.apiKey) missing.push('RAGFLOW_API_KEY');
  if (RAGFLOW_CONFIG.datasetIds.length === 0 && !RAGFLOW_CONFIG.datasetName) {
    missing.push('RAGFLOW_DATASET_IDS 或 RAGFLOW_DATASET_NAME');
  }

  return {
    configured: missing.length === 0,
    missing,
    datasetCount: RAGFLOW_CONFIG.datasetIds.length,
    datasetName: RAGFLOW_CONFIG.datasetName,
    baseUrl: RAGFLOW_CONFIG.baseUrl,
    similarityThreshold: RAGFLOW_CONFIG.similarityThreshold,
    vectorSimilarityWeight: RAGFLOW_CONFIG.vectorSimilarityWeight,
    pageSize: RAGFLOW_CONFIG.pageSize,
    fallbackLocal: RAGFLOW_CONFIG.fallbackLocal,
  };
}

function apiV1Base(baseUrl: string): string {
  return baseUrl.endsWith('/api/v1') ? baseUrl : `${baseUrl}/api/v1`;
}

function retrievalEndpoint(baseUrl: string): string {
  if (baseUrl.endsWith('/api/v1')) {
    return `${baseUrl}/retrieval`;
  }
  return `${baseUrl}/api/v1/retrieval`;
}

async function resolveDatasetIds(
  config: ReturnType<typeof runtimeConfig>,
  signal: AbortSignal,
): Promise<string[]> {
  if (config.datasetIds.length > 0) return config.datasetIds;
  const response = await fetch(
    `${apiV1Base(config.baseUrl)}/datasets?name=${encodeURIComponent(config.datasetName)}&page=1&page_size=100`,
    { headers: { Authorization: `Bearer ${config.apiKey}` }, signal },
  );
  const text = await response.text();
  if (!response.ok) throw new Error(`RAGFlow 知识库查询失败（${response.status}）：${text.slice(0, 300)}`);
  const payload = JSON.parse(text) as any;
  const datasets = Array.isArray(payload?.data) ? payload.data : [];
  const exact = datasets.filter((item: any) => String(item?.name || '').trim() === config.datasetName);
  const ids = exact.map((item: any) => String(item?.id || '').trim()).filter(Boolean);
  if (ids.length === 0) throw new Error(`RAGFlow 中未找到名为“${config.datasetName}”的知识库`);
  return ids;
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function retrieveFromRagflow(question: string): Promise<RagflowRetrievalResult> {
  if (!isRagflowConfigured()) {
    const status = getRagflowStatus();
    throw new Error(`RAGFlow 未完整配置：缺少 ${status.missing.join('、')}`);
  }

  const config = runtimeConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const datasetIds = await resolveDatasetIds(config, controller.signal);
    const response = await fetch(retrievalEndpoint(config.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        question,
        dataset_ids: datasetIds,
        page: 1,
        page_size: config.pageSize,
        similarity_threshold: config.similarityThreshold,
        vector_similarity_weight: config.vectorSimilarityWeight,
        top_k: config.topK,
        // muya 使用 Q&A 切片。关闭强制关键词匹配可避免中文提问与木雅语片段
        // 因字面词不同而被错误过滤，最终仍由相似度阈值负责证据闸门。
        keyword: false,
        highlight: false,
      }),
      signal: controller.signal,
    });

    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(`RAGFlow HTTP ${response.status}: ${rawText.slice(0, 300)}`);
    }

    let payload: any;
    try {
      payload = JSON.parse(rawText);
    } catch {
      throw new Error('RAGFlow 返回了无法解析的 JSON');
    }

    if (Number(payload?.code) !== 0) {
      throw new Error(`RAGFlow 检索失败：${textValue(payload?.message) || '未知错误'}`);
    }

    const rawChunks = Array.isArray(payload?.data?.chunks) ? payload.data.chunks : [];
    const chunks: RagflowChunk[] = rawChunks
      .map((item: any): RagflowChunk => ({
        id: textValue(item?.id || item?.chunk_id),
        content: textValue(item?.content_with_weight || item?.content),
        question: textValue(item?.question || item?.question_text || ''),
        documentId: textValue(item?.document_id),
        documentName: textValue(item?.document_keyword || item?.document_name),
        datasetId: textValue(item?.dataset_id),
        similarity: numberValue(item?.similarity),
        termSimilarity: numberValue(item?.term_similarity),
        vectorSimilarity: numberValue(item?.vector_similarity),
      }))
      .filter((item: RagflowChunk) => (
        item.content.length > 0 &&
        item.similarity >= config.similarityThreshold
      ))
      .sort((a: RagflowChunk, b: RagflowChunk) => b.similarity - a.similarity)
      .slice(0, config.pageSize);

    return {
      chunks,
      total: numberValue(payload?.data?.total) || chunks.length,
    };
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(`RAGFlow 检索超时（${config.timeoutMs}ms）`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function formatRagflowContext(chunks: RagflowChunk[]): string {
  if (chunks.length === 0) return '（RAGFlow 未检索到达到阈值的可靠资料）';

  return chunks.map((chunk, index) => {
    const source = chunk.documentName || chunk.documentId || `知识库片段 ${index + 1}`;
    return [
      `[资料${index + 1}]`,
      `来源：${source}`,
      `相似度：${chunk.similarity.toFixed(4)}`,
      '内容开始',
      chunk.content,
      '内容结束',
    ].join('\n');
  }).join('\n\n');
}

export function buildRagflowEvidenceResponse(chunks: RagflowChunk[]): string {
  if (chunks.length === 0) return '> RAGFlow 知识库未检索到可靠依据';

  return chunks.slice(0, 3).map((chunk, index) => {
    const source = chunk.documentName || chunk.documentId || `知识库片段 ${index + 1}`;
    return `${chunk.content}\n\n> 来源：[资料${index + 1}] ${source}`;
  }).join('\n\n---\n\n');
}
import { readConfig as readMetaverseConfig } from './metaverse/config.js';
