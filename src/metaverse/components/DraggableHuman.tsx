// 可拖拽的数字人组件
// - 配置页：可拖拽 + 可缩放（滚轮/按钮）
// - 运行时（用户态）：不可拖拽，点击跳转
//
// 标签显示策略：
//   - 配置态（draggable=true）：标签始终位于顶部（沿用历史，不影响拖拽）
//   - 用户态（draggable=false）：
//     默认底部（在数字人下方）+ 默认 card 样式（蓝色卡片 + 名字 + 副标题小字）
//     与图1「木小文 · 木雅语学习智能体」风格一致
import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { PortalPoint } from '../types';

interface Props {
  point: PortalPoint;
  containerRef: React.RefObject<HTMLElement>;
  position?: { x: number; y: number };
  draggable?: boolean;
  gifSrc?: string; // 覆盖 point.gifUrl，供主页用 wave、跳转页用 speak
  onPositionChange?: (pos: { x: number; y: number }) => void;
  onSizeChange?: (size: number) => void;
  onClick?: (e: React.MouseEvent) => void;
  selected?: boolean;
  size?: number;
  showLabel?: boolean;
}

export default function DraggableHuman({
  point,
  containerRef,
  position,
  draggable,
  gifSrc,
  onPositionChange,
  onSizeChange,
  onClick,
  selected,
  size = 120,
  showLabel = true,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>(
    position || point.homePosition || { x: 50, y: 50 }
  );
  const [localSize, setLocalSize] = useState(size);
  const [dragging, setDragging] = useState(false);

  // 使用 ref 存储拖拽状态，避免 React state 异步导致的时序问题
  const dragState = useRef<{
    active: boolean;
    startMouseX: number;
    startMouseY: number;
    startPosX: number;
    startPosY: number;
    containerW: number;
    containerH: number;
  } | null>(null);
  const movedRef = useRef(false);
  // 回调通过 ref 持有最新引用，避免 window 监听器闭包过期
  const onPositionChangeRef = useRef(onPositionChange);
  onPositionChangeRef.current = onPositionChange;

  useEffect(() => {
    if (position) setPos(position);
  }, [position?.x, position?.y]);

  useEffect(() => {
    setLocalSize(size);
  }, [size]);

  // draggable 失效（切换选中了别的数字人）时，强制结束残留的拖动状态
  useEffect(() => {
    if (!draggable && dragState.current?.active) {
      dragState.current = null;
      setDragging(false);
    }
  }, [draggable]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!draggable) return;
    e.preventDefault();
    e.stopPropagation();
    const c = containerRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    dragState.current = {
      active: true,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startPosX: pos.x,
      startPosY: pos.y,
      containerW: rect.width,
      containerH: rect.height,
    };
    movedRef.current = false;
    setDragging(true);
  }, [draggable, pos, containerRef]);

  // 拖动逻辑挂在 window 上（而不是元素上）：
  // - 不使用 setPointerCapture，避免捕获泄漏后所有点击被旧元素吞掉（表现为“换数字人没反应/卡死”）
  // - 即使组件重渲染或元素被替换，window 监听器也能稳定收到 pointerup 并清理状态
  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) => {
      const st = dragState.current;
      if (!st?.active) return;
      const dx = e.clientX - st.startMouseX;
      const dy = e.clientY - st.startMouseY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) movedRef.current = true;

      const newX = Math.max(0, Math.min(100, st.startPosX + (dx / st.containerW) * 100));
      const newY = Math.max(0, Math.min(100, st.startPosY + (dy / st.containerH) * 100));
      const next = { x: newX, y: newY };
      setPos(next);
      onPositionChangeRef.current?.(next);
    };

    const onUp = () => {
      dragState.current = null;
      setDragging(false);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging]);

  // 滚轮缩放
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!draggable) return;
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY < 0 ? 10 : -10;
    const next = Math.max(40, Math.min(400, localSize + delta));
    setLocalSize(next);
    onSizeChange?.(next);
  }, [draggable, localSize, onSizeChange]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (movedRef.current) return;
    onClick?.(e);
  };

  // 用户态标签位置：默认 'bottom'；配置态强制 'top'
  const labelPos: 'top' | 'bottom' = draggable
    ? 'top'
    : (point.homeLabelPosition || 'bottom');
  const labelStyle: 'bubble' | 'card' = point.homeLabelStyle || 'card';
  const subtitle = (point.subtitle || '').trim();
  const displayName = (point.label || point.name || '').trim();
  // 是否显示名字：配置态强制显示（方便编辑），用户态看 showName 字段（默认 true）
  const showNameFlag = draggable ? true : (point.showName !== false);
  // 是否显示副标题：默认 true，需 subtitle 有值
  const showSubtitleFlag = point.showSubtitle !== false;
  // 综合判断是否渲染整个标签气泡：必须 visible 且至少有一个要显示的内容
  //   - displayName 有值时（名字框可见）
  //   - subtitle 有值 && showSubtitle 时（副标题可见）
  // 否则整个标签容器都隐藏，避免出现"空横杠/空胶囊"
  const labelVisible =
    showLabel &&
    ((showNameFlag && displayName) ||
      (showSubtitleFlag && subtitle));
  // 进一步：单独决定名字和副标题各自是否渲染（即使父容器可见）
  const showNameBox = showNameFlag && !!displayName;
  const showSubtitleLine = showSubtitleFlag && !!subtitle;

  return (
    <div
      ref={ref}
      className={`human-float absolute ${selected ? 'selected' : ''} ${draggable ? 'cursor-move' : 'cursor-pointer'}`}
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        transform: 'translate(-50%, -50%)',
        // 外层 wrapper 不限制大小（让标签/缩放按钮溢出显示）
        zIndex: selected ? 100 : 10,
        touchAction: 'none',
      }}
      onPointerDown={handlePointerDown}
      onWheel={handleWheel}
      onClick={handleClick}
    >
      {/* GIF 容器 — 固定 size × size
          用 object-contain 让 GIF 完整显示（人物不被裁切），
          GIF 容器大小即用户视觉上的「人物占据空间」，size 字段精确控制该尺寸。
          注意：GIF 自带上下透明边距属于设计内容（脚下的地面空间），
          不能用 object-cover 强行裁切，会导致头/脚丢失。 */}
      <div
        style={{
          width: localSize,
          height: localSize,
          position: 'relative',
        }}
      >
        <img
          src={gifSrc || point.gifUrl}
          alt={point.name}
          draggable={false}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.5))',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* 标签气泡（配置态顶部，或用户态自定义顶部） */}
      {labelVisible && labelPos === 'top' && (
        <div
          className="absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full whitespace-nowrap"
          style={{ pointerEvents: 'none' }}
        >
          <div className="bubble-label flex items-center gap-1">
            {showNameBox && <span style={{ fontSize: 12 }}>{displayName}</span>}
            {showSubtitleLine && (
              <span style={{ fontSize: 10, opacity: 0.85, marginLeft: 4 }}>· {subtitle}</span>
            )}
          </div>
        </div>
      )}

      {/* 标签卡片（用户态底部 —— 参考图1风格） */}
      {labelVisible && labelPos === 'bottom' && labelStyle === 'card' && (
        <div
          className="absolute left-1/2 flex flex-col items-center"
          style={{
            pointerEvents: 'none',
            top: '100%',
            transform: 'translateX(-50%)',
            marginTop: 6 + (point.labelOffsetY ?? 0),
            marginLeft: (point.labelOffsetX ?? 0),
          }}
        >
          {/* 名字框 — 浅蓝色圆角矩形（参考图1） */}
          {showNameBox && (
            <div
              className="human-label-card whitespace-nowrap"
              style={{
                background: 'rgba(140, 190, 230, 0.95)',
                color: '#fff',
                padding: '4px 18px',
                borderRadius: 999,
                fontSize: 14,
                fontWeight: 500,
                boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                minWidth: 60,
                textAlign: 'center',
              }}
            >
              {displayName}
            </div>
          )}
          {/* 副标题小字（智能体类型） */}
          {showSubtitleLine && (
            <div
              className="whitespace-nowrap mt-1"
              style={{
                color: '#fff',
                fontSize: 12,
                textShadow: '0 1px 4px rgba(0,0,0,0.7)',
                letterSpacing: 0.5,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
      )}

      {/* 标签气泡（用户态底部，气泡样式） */}
      {labelVisible && labelPos === 'bottom' && labelStyle === 'bubble' && (
        <div
          className="absolute left-1/2 whitespace-nowrap"
          style={{
            pointerEvents: 'none',
            top: '100%',
            transform: 'translateX(-50%)',
            marginTop: 6 + (point.labelOffsetY ?? 0),
            marginLeft: (point.labelOffsetX ?? 0),
          }}
        >
          <div className="bubble-label flex items-center gap-1">
            {showNameBox && <span style={{ fontSize: 12 }}>{displayName}</span>}
            {showSubtitleLine && (
              <span style={{ fontSize: 10, opacity: 0.85, marginLeft: 4 }}>· {subtitle}</span>
            )}
          </div>
        </div>
      )}

      {/* 配置态：选中框 + 缩放按钮 */}
      {draggable && selected && (
        <>
          <div
            className="absolute inset-0 border-2 border-blue-400 rounded-full pointer-events-none"
            style={{ animation: 'pulse 2s infinite' }}
          />
          {/* 缩放控制按钮 */}
          <div
            className="absolute -right-3 -top-3 flex flex-col gap-1"
            style={{ pointerEvents: 'auto' }}
          >
            <button
              onPointerDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => {
                e.stopPropagation();
                const next = Math.min(400, localSize + 20);
                setLocalSize(next);
                onSizeChange?.(next);
              }}
              className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-bold shadow-lg hover:bg-blue-600"
            >
              +
            </button>
            <button
              onPointerDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => {
                e.stopPropagation();
                const next = Math.max(40, localSize - 20);
                setLocalSize(next);
                onSizeChange?.(next);
              }}
              className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-bold shadow-lg hover:bg-blue-600"
            >
              −
            </button>
          </div>
          {/* 坐标显示 */}
          <div
            className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-blue-600 bg-white/80 px-2 rounded whitespace-nowrap"
            style={{ pointerEvents: 'none' }}
          >
            {pos.x.toFixed(1)}, {pos.y.toFixed(1)} · {localSize}px
          </div>
        </>
      )}
    </div>
  );
}
