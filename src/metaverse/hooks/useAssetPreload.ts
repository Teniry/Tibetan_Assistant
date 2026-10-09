import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * 预加载图片资源（背景图 / 数字人 GIF）。
 * - 返回实时进度（0~100）与就绪标志
 * - 任一资源加载失败也计入进度（不阻塞）
 * - 超时兜底：超过 timeoutMs 后强制就绪，避免弱网用户无限等待
 * - 以 URL 列表的排序拼接串作为依赖 key，父组件每次轮询传入新数组引用也不会重复预加载
 */
export function useAssetPreload(urls: string[], timeoutMs = 25000) {
  const key = useMemo(() => urls.filter(Boolean).slice().sort().join('|'), [urls]);

  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(key === '');
  const finishedRef = useRef<string | null>(null);

  useEffect(() => {
    const list = key ? key.split('|') : [];
    if (list.length === 0) {
      finishedRef.current = key;
      setProgress(100);
      setReady(true);
      return;
    }
    setReady(false);
    setProgress(0);

    let loaded = 0;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      finishedRef.current = key;
      setProgress(100);
      setReady(true);
    };
    // 超时兜底：弱网下不让用户等太久，直接进入场景（剩余资源由浏览器继续加载）
    const timer = window.setTimeout(finish, timeoutMs);

    const onOne = () => {
      loaded += 1;
      if (!finished) setProgress(Math.min(99, Math.round((loaded / list.length) * 100)));
      if (loaded >= list.length) {
        window.clearTimeout(timer);
        finish();
      }
    };

    list.forEach((u) => {
      const img = new Image();
      img.onload = onOne;
      img.onerror = onOne;
      img.src = u;
    });

    return () => {
      window.clearTimeout(timer);
    };
  }, [key, timeoutMs]);

  // key 变化后 effect 尚未跑完的首帧视为未就绪，避免先渲染主场景再跳回加载页
  const effectiveReady = finishedRef.current === key ? ready : key === '';

  return { progress, ready: effectiveReady };
}
