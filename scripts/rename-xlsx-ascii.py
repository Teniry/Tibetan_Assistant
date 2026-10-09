#!/usr/bin/env python3
"""把 64 个 QA_*.xlsx 复制为纯 ASCII 文件名（QA_001.xlsx ~ QA_064.xlsx），
并生成一个 filename_mapping.txt 说明每个编号对应的原中文分类。

为什么：中文文件名经某些传输链路（AutoDL 网页上传/老式 zip 解压等）
会被按 GBK 误读为乱码。改用 ASCII 名字就彻底免疫。
xlsx 的内容不受影响——xlsx 内部是 UTF-8 自描述的二进制，文件名只是标签。

用法:
  python3 rename-xlsx-ascii.py          # 干运行
  python3 rename-xlsx-ascii.py --apply  # 实际生成
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parents[1]
SRC_DIR = PROJECT_DIR / "data" / "kb" / "qa_processed_xlsx"
OUT_DIR = PROJECT_DIR / "data" / "kb" / "qa_upload_ready"


def main() -> int:
    dry_run = "--apply" not in sys.argv

    if not SRC_DIR.is_dir():
        print(f"源目录不存在：{SRC_DIR}", file=sys.stderr)
        return 1

    files = sorted(SRC_DIR.glob("QA_*.xlsx"))
    if not files:
        print(f"未找到 QA_*.xlsx：{SRC_DIR}")
        return 1

    print("=" * 60)
    print(f"源目录：{SRC_DIR}")
    print(f"输出目录：{OUT_DIR}")
    print(f"模式：{'干运行' if dry_run else '实际生成'}")
    print(f"找到 {len(files)} 个 xlsx")
    print("=" * 60)

    if not dry_run:
        OUT_DIR.mkdir(parents=True, exist_ok=True)

    mapping_lines = ["序号\t新文件名\t原中文文件名", "-" * 60]
    for idx, path in enumerate(files, start=1):
        new_name = f"QA_{idx:03d}.xlsx"
        dest = OUT_DIR / new_name
        if not dry_run:
            shutil.copy2(path, dest)
        mapping_lines.append(f"{idx:03d}\t{new_name}\t{path.name}")

    if not dry_run:
        map_path = OUT_DIR / "filename_mapping.txt"
        map_path.write_text("\n".join(mapping_lines) + "\n", encoding="utf-8")
        # 顺便建一个 README
        readme = (
            "这里是上传到 RAGFlow 的 64 个木雅语 Q&A xlsx 文件。\n"
            "文件名采用纯 ASCII 编号（QA_001.xlsx ~ QA_064.xlsx），避免跨平台传输时\n"
            "中文文件名被错误解读为乱码。\n\n"
            "对应关系见 filename_mapping.txt。\n\n"
            "上传建议：\n"
            "  1. 把整个 qa_upload_ready/ 目录压缩成一个 zip 传到 AutoDL\n"
            "  2. 在 AutoDL 解压后，直接把 64 个 .xlsx 全选拖进 RAGFlow Web UI\n"
            "  3. RAGFlow 会按 Question / Answer 两列解析，文档名就是 QA_001 等\n"
        )
        (OUT_DIR / "README.txt").write_text(readme, encoding="utf-8")

    print()
    for line in mapping_lines[:6]:
        print("  " + line)
    if len(mapping_lines) > 6:
        print(f"  ...（共 {len(mapping_lines) - 1} 项）")
    print()
    print("=" * 60)
    if dry_run:
        print("干运行完成，未生成任何文件。确认无误后加 --apply。")
    else:
        print(f"✅ 已生成到 {OUT_DIR}")
        print(f"   - 64 个 xlsx（QA_001.xlsx ~ QA_064.xlsx）")
        print(f"   - filename_mapping.txt（编号 ↔ 原中文名）")
        print(f"   - README.txt（使用说明）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
