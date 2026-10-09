// 知识画廊图片轮播组件（自动轮播 + 左右切换 + 点击弹出讲解和来源）
// 现作为 ChatPanel 顶部子组件渲染（之前的版本是 PortalPage 右侧浮动）
import React, { useEffect, useRef, useState } from 'react';
import type { CarouselImage } from '../types';
import { ChevronLeft, ChevronRight, ExternalLink, Images, Info, X } from 'lucide-react';

interface Props {
  images: CarouselImage[];
  /**
   * 是否撑满父容器高度（用于 left/right 分栏场景）。
   * - true  → 用 flex:1 占满父容器，图片高度随父容器变化（响应 chatHeight）
   * - false → 固定 180px 高度（above/below 默认行为）
   * 默认 false。
   */
  fillHeight?: boolean;
  /**
   * 自定义固定高度（px）。只在 fillHeight=false 时生效。
   * 默认 180。
   */
  fixedHeight?: number;
  /** 木小知知识画廊使用的紧凑卡片样式，不再横向占满整个聊天框。 */
  compact?: boolean;
}

export default function ImageCarousel({ images, fillHeight = false, fixedHeight = 180, compact = false }: Props) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [detail, setDetail] = useState<CarouselImage | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 自动轮播（每 6 秒），hover 暂停
  useEffect(() => {
    if (paused || images.length <= 1) return;
    timerRef.current = setInterval(() => {
      setIdx((i) => (i + 1) % images.length);
    }, 6000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [paused, images.length]);

  if (images.length === 0) return null;
  const img = images[Math.min(idx, images.length - 1)];

  const go = (d: number) => setIdx((i) => (i + d + images.length) % images.length);

  return (
    <div
      className={`relative rounded-xl overflow-hidden ${fillHeight ? 'h-full' : 'flex-shrink-0'}`}
      style={{
        width: compact ? 'min(620px, 100%)' : undefined,
        maxWidth: compact ? 620 : undefined,
        background: compact ? '#F8F4EC' : '#0a0e1a',
        border: compact ? '1px solid rgba(101,112,78,0.26)' : '1px solid rgba(255,255,255,0.18)',
        boxShadow: compact ? '0 9px 24px rgba(64,54,43,0.10)' : '0 8px 24px rgba(0,0,0,0.45)',
        display: 'flex',
        flexDirection: 'column',
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 flex-shrink-0"
        style={{ background: compact ? '#EEF0E7' : 'rgba(255,255,255,0.05)', borderColor: compact ? 'rgba(101,112,78,.16)' : undefined }}>
        <span className="text-xs font-medium flex items-center gap-1.5" style={{ color: compact ? '#4D583D' : '#FFFFFF' }}>
          <Images size={13} /> 知识画廊
        </span>
        <span className="text-[11px] font-mono" style={{ color: compact ? '#7D826F' : 'rgba(255,255,255,.6)' }}>
          {idx + 1} / {images.length}
        </span>
      </div>

      {/* 图片区域 — 点击弹出讲解
          fillHeight=true：flex:1 占满父容器剩余高度，min-height:0 防止 flex 子元素溢出
          fillHeight=false：固定 fixedHeight 高度 */}
      <button
        type="button"
        className="relative block w-full group flex-1"
        style={{
          ...(fillHeight ? { flex: '1 1 0%', minHeight: 0 } : { height: fixedHeight }),
          background: compact ? '#E8E3D8' : '#111527',
          padding: 0,
        }}
        onClick={() => setDetail(img)}
        title="点击查看讲解"
      >
        <img
          key={img.id}
          src={img.imageUrl}
          alt={img.title}
          // fillHeight 时用 object-contain 完整显示（按高度适配，避免裁剪头部）
          // 固定高度时用 object-cover 沉浸式铺满
          className="w-full h-full"
          style={{ objectFit: fillHeight ? 'contain' : 'cover' }}
          draggable={false}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
        {/* 底部渐变 + 标题 */}
        <div
          className="absolute bottom-0 left-0 right-0 px-3 py-2 text-left"
          style={{ background: 'linear-gradient(to top, rgba(10,14,26,0.92), transparent)' }}
        >
          <div className="text-white text-xs font-semibold" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
            {img.title}
          </div>
          <div className="text-white/65 text-[10px] mt-0.5">点击图片查看讲解 →</div>
        </div>
      </button>

      {/* 左右切换 */}
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full p-1 hover:bg-white/25 transition-colors"
            style={{ background: 'rgba(10,14,26,0.65)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }}
            title="上一张"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1 hover:bg-white/25 transition-colors"
            style={{ background: 'rgba(10,14,26,0.65)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }}
            title="下一张"
          >
            <ChevronRight size={14} />
          </button>
        </>
      )}

      {/* 指示点 */}
      {images.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 py-1.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
          {images.map((im, i) => (
            <button
              key={im.id}
              type="button"
              onClick={() => setIdx(i)}
              className="rounded-full transition-all"
              style={{
                width: i === idx ? 14 : 6,
                height: 6,
                background: i === idx ? (compact ? '#65704E' : '#60a5fa') : (compact ? 'rgba(101,112,78,.26)' : 'rgba(255,255,255,0.3)'),
              }}
              title={im.title}
            />
          ))}
        </div>
      )}

      {/* 讲解弹窗 */}
      {detail && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={() => setDetail(null)}
        >
          <div
            className="relative rounded-xl overflow-hidden flex flex-col"
            style={{ maxWidth: 720, width: '90vw', maxHeight: '88vh', background: '#0a0e1a', border: '1px solid rgba(255,255,255,0.18)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <span className="text-white text-sm font-semibold truncate">{detail.title}</span>
              <button
                type="button"
                onClick={() => setDetail(null)}
                style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff' }}
                className="p-1.5 rounded hover:bg-white/25 transition-colors flex-shrink-0"
                title="关闭"
              >
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto">
              <img
                src={detail.imageUrl}
                alt={detail.title}
                className="w-full object-cover"
                style={{ maxHeight: 320 }}
                draggable={false}
              />
              <div className="px-5 py-4">
                <div className="text-white/90 text-[13px] leading-relaxed whitespace-pre-wrap">
                  {detail.description}
                </div>
                {(detail.sourceUrl || detail.sourceName) && (
                  <div
                    className="mt-4 px-3 py-2.5 rounded-lg flex items-start gap-2"
                    style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)' }}
                  >
                    <Info size={14} className="text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="text-[11px] leading-relaxed">
                      <span className="text-blue-300 font-medium">资料来源：</span>
                      <span className="text-white/75">{detail.sourceName || '网络公开资料'}</span>
                      {detail.sourceUrl && (
                        <a
                          href={detail.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 underline break-all"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink size={11} /> 查看原文
                        </a>
                      )}
                      <div className="text-white/40 mt-1">以上讲解内容整理自该来源，未作虚构。</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
