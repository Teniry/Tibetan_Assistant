#!/usr/bin/env python3
"""把已修复的 QA_*.csv 转换为 UTF-8 的 .xlsx（Excel）文件。

为什么是 .xlsx 而不是老式 .xls：
  知识库内容含有藏文（ཕག་རྒོད།）和国际音标（pʰagø、tsʌko）。
  老式 .xls 是二进制 BIFF 格式，只支持单一代码页，无法正确保存
  藏文与音标，会乱码/丢字。.xlsx 基于 XML，原生 Unicode/UTF-8，
  能完整保留中文、藏文、国际音标。

本脚本把每个 QA_*.csv 的两列 Question / Answer 原样写入 .xlsx。
RAGFlow 的 Q&A 知识库上传 .xlsx 时正是按 Question / Answer 两列解析。

用法:
  python3 csv_to_xlsx.py          # 干运行（只显示会生成什么）
  python3 csv_to_xlsx.py --apply  # 实际生成

输出目录: data/kb/qa_processed_xlsx/
"""

import csv
import sys
from pathlib import Path

try:
    from openpyxl import Workbook
except ImportError:
    print("需要先安装 openpyxl：pip install openpyxl", file=sys.stderr)
    sys.exit(1)


PROJECT_DIR = Path(__file__).resolve().parents[1]
CSV_DIR = PROJECT_DIR / "data" / "kb" / "qa_processed_csv"
OUT_DIR = PROJECT_DIR / "data" / "kb" / "qa_processed_xlsx"


def main() -> int:
    dry_run = "--apply" not in sys.argv

    if not CSV_DIR.is_dir():
        print(f"CSV 目录不存在：{CSV_DIR}", file=sys.stderr)
        return 1

    files = sorted(CSV_DIR.glob("QA_*.csv"))
    if not files:
        print(f"未找到 QA_*.csv：{CSV_DIR}")
        return 1

    print(f"{'=' * 60}")
    print(f"找到 {len(files)} 个 CSV")
    print(f"输出目录：{OUT_DIR}")
    print(f"模式：{'干运行（不写入）' if dry_run else '实际生成'}")
    print(f"{'=' * 60}\n")

    if not dry_run:
        OUT_DIR.mkdir(parents=True, exist_ok=True)

    total_rows = 0
    for path in files:
        rows = []
        with open(path, encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            if reader.fieldnames != ["Question", "Answer"]:
                print(f"[跳过] {path.name}：表头为 {reader.fieldnames}", file=sys.stderr)
                continue
            for row in reader:
                q = (row.get("Question") or "").strip()
                a = (row.get("Answer") or "").strip()
                if not q or not a:
                    continue
                rows.append((q, a))

        total_rows += len(rows)

        if dry_run:
            print(f"[干运行] {path.name}：{len(rows)} 行")
            continue

        wb = Workbook()
        ws = wb.active
        ws.title = "QA"
        ws.append(["Question", "Answer"])
        for q, a in rows:
            ws.append([q, a])
        out_path = OUT_DIR / (path.stem + ".xlsx")
        wb.save(out_path)
        print(f"[生成] {out_path.name}：{len(rows)} 行")

    print(f"\n{'=' * 60}")
    print(f"总计：{len(files)} 个文件，{total_rows} 行")
    if dry_run:
        print("这是干运行，没有生成任何文件。确认无误后加 --apply。")
    else:
        print(f"✅ 已生成到 {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
