# -*- coding: utf-8 -*-
"""压缩 3D 界面静态资源：背景 PNG -> WebP，数字人 GIF -> 压缩动画 WebP。
用法: python scripts/compress-assets.py [--test]
"""
import sys
import os
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')

# 需要压缩的背景图（静态）
BACKGROUNDS = [
    'public/muxiaowen-bg.png',
    'public/muxiaoce-bg.png',
    'public/muxiaozhi-bg.jpg',
    'public/home-bg.png',
    'public/metaverse/home-bg.png',
    'public/metaverse/muxiaowen-bg.png',
    'public/metaverse/muxiaoce-bg.png',
    'public/metaverse/muxiaozhi-bg.jpg',
    'data/uploads/home_bg/1787158253041_wy7o8s.png',
]

# 配置里实际引用的数字人 GIF（uploads）
GIFS = [
    'data/uploads/gif/1786865492711_9lpt03.gif',
    'data/uploads/gif/1786941447798_bpkjm9.gif',
    'data/uploads/gif/1786865513096_0c0dgu.gif',
    'data/uploads/gif/1786865510495_saneli.gif',
    'data/uploads/gif/1786865520669_t24cld.gif',
    'data/uploads/gif/1786865518598_y9tajm.gif',
    'public/digital-humans/muxiaowen-speak.gif',
    'public/digital-humans/muxiaowen-wave.gif',
    'public/digital-humans/muxiaoce-speak.gif',
    'public/digital-humans/muxiaoce-wave.gif',
    'public/digital-humans/muxiaozhi-speak.gif',
    'public/digital-humans/muxiaozhi-wave.gif',
]

BG_QUALITY = 82
GIF_MAX_W = 480
GIF_QUALITY = 62


def mb(path):
    try:
        return os.path.getsize(path) / 1024 / 1024
    except OSError:
        return 0


def outpath(path):
    base, _ = os.path.splitext(path)
    out = base + '.webp'
    if os.path.exists(out) and os.path.getsize(out) == 0:
        # 文件被锁定时换备用名
        out = base + '_c.webp'
    return out


def compress_bg(path):
    out = outpath(path)
    im = Image.open(path)
    if im.mode in ('RGBA', 'P'):
        im = im.convert('RGBA')
    else:
        im = im.convert('RGB')
    im.save(out, 'WEBP', quality=BG_QUALITY, method=6)
    print(f'[bg] {path} {mb(path):.2f}MB -> {out} {mb(out):.3f}MB')
    return out


def gif_frames(im):
    """展开 GIF 所有帧与时长"""
    frames, durations = [], []
    try:
        n = im.n_frames
    except AttributeError:
        n = 1
    for i in range(n):
        im.seek(i)
        durations.append(im.info.get('duration', 80) or 80)
        # 转成 RGBA 保持透明度
        frames.append(im.convert('RGBA'))
    return frames, durations


def compress_gif(path):
    out = outpath(path)
    im = Image.open(path)
    frames, durations = gif_frames(im)
    w, h = frames[0].size
    if w > GIF_MAX_W:
        nh = max(1, round(h * GIF_MAX_W / w))
        frames = [f.resize((GIF_MAX_W, nh), Image.LANCZOS) for f in frames]
    loop = im.info.get('loop', 0)
    frames[0].save(
        out, 'WEBP', save_all=True, append_images=frames[1:],
        duration=durations, loop=loop, quality=GIF_QUALITY, method=6,
        minimize_size=True,
    )
    print(f'[gif] {path} {mb(path):.2f}MB {len(frames)}帧 -> {out} {mb(out):.3f}MB')
    return out


def main():
    test_only = '--test' in sys.argv
    targets = GIFS[:1] if test_only else None
    if targets:
        for p in targets:
            if os.path.exists(p):
                compress_gif(p)
        return
    for p in BACKGROUNDS:
        if os.path.exists(p):
            try:
                compress_bg(p)
            except Exception as e:
                print(f'[bg-ERR] {p}: {e}')
    for p in GIFS:
        if os.path.exists(p):
            try:
                compress_gif(p)
            except Exception as e:
                print(f'[gif-ERR] {p}: {e}')


if __name__ == '__main__':
    main()
