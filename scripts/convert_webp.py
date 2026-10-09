# -*- coding: utf-8 -*-
"""将木雅语助手的大体积图片资源批量转换为 WebP，解决 cpolar 2Mbps 带宽下加载极慢的问题。"""
import os
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (源文件相对路径, 输出 webp 相对路径, 质量)
TARGETS = [
    # 主页背景（当前配置使用）
    (r"data\uploads\home_bg\1787158253041_wy7o8s.png", r"data\uploads\home_bg\1787158253041_wy7o8s.webp", 82),
    # 数字人 GIF（配置引用的 6 个）
    (r"data\uploads\gif\1786865492711_9lpt03.gif", r"data\uploads\gif\1786865492711_9lpt03.webp", 72),
    (r"data\uploads\gif\1786941447798_bpkjm9.gif", r"data\uploads\gif\1786941447798_bpkjm9.webp", 72),
    (r"data\uploads\gif\1786865513096_0c0dgu.gif", r"data\uploads\gif\1786865513096_0c0dgu.webp", 72),
    (r"data\uploads\gif\1786865510495_saneli.gif", r"data\uploads\gif\1786865510495_saneli.webp", 72),
    (r"data\uploads\gif\1786865520669_t24cld.gif", r"data\uploads\gif\1786865520669_t24cld.webp", 72),
    (r"data\uploads\gif\1786865518598_y9tajm.gif", r"data\uploads\gif\1786865518598_y9tajm.webp", 72),
    # 空间页背景
    (r"public\muxiaoce-bg.png", r"public\muxiaoce-bg.webp", 82),
    (r"public\muxiaowen-bg.png", r"public\muxiaowen-bg.webp", 82),
    (r"public\muxiaozhi-bg.jpg", r"public\muxiaozhi-bg.webp", 82),
    (r"public\home-bg.png", r"public\home-bg.webp", 82),
]


def fmt(size):
    return f"{size/1024/1024:.2f}MB" if size > 1024*1024 else f"{size/1024:.0f}KB"


def convert(src_rel, dst_rel, quality):
    src = os.path.join(ROOT, src_rel)
    dst = os.path.join(ROOT, dst_rel)
    if not os.path.exists(src):
        print(f"[SKIP] 不存在: {src_rel}")
        return False
    im = Image.open(src)
    src_size = os.path.getsize(src)
    n_frames = getattr(im, "n_frames", 1)
    if n_frames > 1:
        # 动图 GIF -> 动图 WebP
        im.seek(0)
        im.save(dst, "WEBP", save_all=True, quality=quality, method=6, loop=0, minimize_size=True)
    else:
        if im.mode in ("RGBA", "P", "LA"):
            im = im.convert("RGBA")
        else:
            im = im.convert("RGB")
        im.save(dst, "WEBP", quality=quality, method=6)
    dst_size = os.path.getsize(dst)
    print(f"[OK] {src_rel} ({fmt(src_size)}, {n_frames}帧) -> {dst_rel} ({fmt(dst_size)}) 压缩 {100-dst_size*100//src_size}%")
    return True


def main():
    ok = 0
    for src_rel, dst_rel, q in TARGETS:
        try:
            if convert(src_rel, dst_rel, q):
                ok += 1
        except Exception as e:
            print(f"[FAIL] {src_rel}: {e}")
    print(f"\n完成: {ok}/{len(TARGETS)}")


if __name__ == "__main__":
    main()
