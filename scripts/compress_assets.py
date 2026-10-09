# -*- coding: utf-8 -*-
"""一次性资源压缩脚本：背景 PNG/JPG -> WebP，数字人 GIF -> 动画 WebP"""
import os
from PIL import Image

ROOT = r"E:\AIAgent\三智能体\木雅语助手-AutoDL-RAGFlow版"

def convert_still(src, max_w=1920, quality=82):
    """静态图转 WebP，返回新路径"""
    dst = os.path.splitext(src)[0] + ".webp"
    im = Image.open(src)
    # 处理可能存在的透明通道
    if im.mode in ("RGBA", "P"):
        im = im.convert("RGBA")
    else:
        im = im.convert("RGB")
    if im.width > max_w:
        h = int(im.height * max_w / im.width)
        im = im.resize((max_w, h), Image.LANCZOS)
    # 缩小背景尺寸（背景不需要 640 以上那么大，但保持 1920 宽确保清晰）
    im.save(dst, "WEBP", quality=quality, method=6)
    old, new = os.path.getsize(src), os.path.getsize(dst)
    print(f"[still] {os.path.basename(src)}: {old/1024:.0f}KB -> {new/1024:.0f}KB ({new/old*100:.0f}%)")
    return dst

def convert_gif(src, quality=62, max_w=640):
    """GIF 转动画 WebP（保留透明度），返回新路径"""
    dst = os.path.splitext(src)[0] + "_webp.webp"
    im = Image.open(src)
    frames = []
    durations = []
    total = getattr(im, "n_frames", 1)
    need_resize = im.width > max_w
    for i in range(total):
        im.seek(i)
        frame = im.convert("RGBA")
        if need_resize:
            h = int(frame.height * max_w / frame.width)
            frame = frame.resize((max_w, h), Image.LANCZOS)
        frames.append(frame)
        d = im.info.get("duration", 100)
        durations.append(d if isinstance(d, (int, float)) and d > 0 else 100)
    # 统一 duration（部分 GIF 每帧不一致，取众数）
    if frames:
        frames[0].save(
            dst, "WEBP",
            save_all=True,
            append_images=frames[1:],
            duration=durations,
            loop=0,
            quality=quality,
            method=6,
        )
    old, new = os.path.getsize(src), os.path.getsize(dst)
    print(f"[gif] {os.path.basename(src)} ({total}帧): {old/1024:.0f}KB -> {new/1024:.0f}KB ({new/old*100:.0f}%)")
    return dst

if __name__ == "__main__":
    # ===== 1. 主页背景 =====
    convert_still(os.path.join(ROOT, "data", "uploads", "home_bg", "1787158253041_wy7o8s.png"))
    # ===== 2. 三个空间背景 =====
    convert_still(os.path.join(ROOT, "public", "muxiaowen-bg.png"))
    convert_still(os.path.join(ROOT, "public", "muxiaoce-bg.png"))
    convert_still(os.path.join(ROOT, "public", "muxiaozhi-bg.jpg"))
    # ===== 3. 六个数字人 GIF（speak + wave）=====
    gifs = [
        "1786865492711_9lpt03.gif",   # 木小测 speak
        "1786941447798_bpkjm9.gif",   # 木小测 wave
        "1786865513096_0c0dgu.gif",   # 木小文 speak
        "1786865510495_saneli.gif",   # 木小文 wave
        "1786865520669_t24cld.gif",   # 木小知 speak
        "1786865518598_y9tajm.gif",   # 木小知 wave
    ]
    for g in gifs:
        convert_gif(os.path.join(ROOT, "data", "uploads", "gif", g))
    print("DONE")
