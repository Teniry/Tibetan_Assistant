import { useState, useEffect, useCallback } from 'react';
import { apiUrl } from '../api-config';

export interface KbStats {
  total: number;
  chapters: string[];
}

export interface ApiStatus {
  /** 后端存活 且 阿里云 API 可用（综合在线/离线状态） */
  isOnline: boolean;
  /** 仅阿里云 API 是否可用 */
  apiAvailable: boolean;
  /** 状态描述信息 */
  message: string;
  /** 修复建议（离线时显示具体怎么修） */
  hint: string;
  /** 是否正在检查中 */
  checking: boolean;
  /** 最后检查时间 */
  checkedAt: string;
  /** 知识库统计 */
  kbStats: KbStats;
}

const INITIAL: ApiStatus = {
  isOnline: false,
  apiAvailable: false,
  message: '正在检查...',
  hint: '',
  checking: false,
  checkedAt: '',
  kbStats: { total: 0, chapters: [] },
};

export function useApiStatus(pollIntervalMs = 15000) {
  const [status, setStatus] = useState<ApiStatus>(INITIAL);

  const checkStatus = useCallback(async () => {
    setStatus(prev => ({ ...prev, checking: true }));
    try {
      const res = await fetch(apiUrl('/api/health'));
      const data = await res.json();
      const backendAlive = data.status === 'ok';
      const apiOk = data.apiAvailable === true;
      const kb = data.knowledgeBase || {};
      setStatus({
        isOnline: backendAlive && apiOk,
        apiAvailable: apiOk,
        message: data.apiMessage || (backendAlive ? '未知' : '后端服务未启动'),
        hint: data.apiHint || '',
        checking: false,
        checkedAt: data.apiCheckedAt || new Date().toISOString(),
        kbStats: {
          total: kb.total || 0,
          chapters: kb.chapters || kb.categories || [],
        },
      });
    } catch {
      setStatus({
        isOnline: false,
        apiAvailable: false,
        message: '后端服务未启动',
        hint: '请运行 npm run dev 启动后端服务',
        checking: false,
        checkedAt: new Date().toISOString(),
        kbStats: { total: 0, chapters: [] },
      });
    }
  }, []);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, pollIntervalMs);
    return () => clearInterval(interval);
  }, [checkStatus, pollIntervalMs]);

  return { ...status, checkStatus };
}
