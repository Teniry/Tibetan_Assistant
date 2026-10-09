#!/usr/bin/env python3
"""修复 RAGFlow Q&A 解析，同时保留多语言检索能力。

问题背景：
  1) 原始 Question 列是带标签的多字段格式：
       中文：野猪 | 藏文：ཕག་རྒོད། | 木雅语：... | 英文：wild boar | 音标：pʰagø
     RAGFlow 的 Q&A 解析器会误切分，导致中文列错位到音标列。
  2) 第一版修复把 Question 简化成“纯中文”，虽然不再错位，
     但用户用英文 / 藏语 / 木雅语提问时就检索不到了。

正确做法（本脚本）：
  Question 列 = 该词条的全部语言形式拼接：
       野猪 ཕག་རྒོད། ཕག་རྒོད། wild boar pʰagø
     - 用空格分隔，不带“字段：”标签，不用“|”
     - RAGFlow Q&A 解析器不会误切分（它是单列干净文本）
     - 任意语言提问都能在 Question 里命中对应形式
  Answer 列   = 保持完整带标签结构（中文：...；藏语：...；...），供前端按字段展示。

语言形式来源：从 Answer 列解析出 中文/藏语/木雅语/英文/音标 五个字段再拼接，
顺序固定为 中文 → 藏语 → 木雅语 → 英文 → 音标，并自动去重。

用法:
  python3 fix-csv-for-ragflow.py          # 干运行（只显示会改什么）
  python3 fix-csv-for-ragflow.py --apply  # 实际写入
"""

import csv
import io
import re
import sys
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parents[1]
CSV_DIR = PROJECT_DIR / "data" / "kb" / "qa_processed_csv"

# 字段标签别名（兼容全角/半角及 藏语/藏文、音标/国际音标 两种写法）
LABEL_ALIASES = {
    "zh": ["中文"],
    "bo": ["藏语", "藏文"],
    "mu": ["木雅语"],
    "en": ["英文"],
    "ph": ["音标", "国际音标"],
}
ALIAS_TO_KEY = {alias: key for key, aliases in LABEL_ALIASES.items() for alias in aliases}
# 拼接顺序
FIELD_ORDER = ["zh", "bo", "mu", "en", "ph"]


def parse_answer(answer: str) -> dict:
    """从 Answer 列解析出各语言字段。"""
    result: dict = {}
    for part in re.split(r"[；;]", answer):
        if not part.strip():
            continue
        m = re.split(r"[：:]", part, maxsplit=1)
        if len(m) != 2:
            continue
        label, value = m[0].strip(), m[1].strip()
        if label in ALIAS_TO_KEY and value:
            result[ALIAS_TO_KEY[label]] = value
    return result


def build_question(answer: str, fallback: str) -> str:
    """由各语言字段拼接成多语言 Question。"""
    fields = parse_answer(answer)
    parts = []
    seen = set()
    for key in FIELD_ORDER:
        val = fields.get(key)
        if val and val not in seen:
            seen.add(val)
            parts.append(val)
    if not parts:
        return fallback  # Answer 解析不出任何字段时，保留原 Question
    return " ".join(parts)


def process_file(csv_path: Path, dry_run: bool = True) -> dict:
    rows_after = []
    changes = []

    with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        if fieldnames != ["Question", "Answer"]:
            return {"file": csv_path.name, "status": "skipped",
                    "reason": f"表头为 {fieldnames}，不是 Question,Answer"}
        for row_num, row in enumerate(reader, start=2):
            original_q = (row.get("Question") or "").strip()
            answer = (row.get("Answer") or "").strip()
            new_q = build_question(answer, original_q)
            rows_after.append({**row, "Question": new_q})
            if new_q != original_q:
                changes.append({
                    "row": row_num,
                    "before": original_q[:60] + ("..." if len(original_q) > 60 else ""),
                    "after": new_q[:80] + ("..." if len(new_q) > 80 else ""),
                })

    if not dry_run and changes:
        with open(csv_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows_after)

    return {"file": csv_path.name, "status": "ok",
            "total_rows": len(rows_after), "changed_rows": len(changes),
            "changes": changes[:3]}


def main() -> None:
    dry_run = "--apply" not in sys.argv
    if not CSV_DIR.is_dir():
        print(f"CSV 目录不存在: {CSV_DIR}")
        sys.exit(1)
    csv_files = sorted(CSV_DIR.glob("QA_*.csv"))
    if not csv_files:
        print(f"未找到 QA_*.csv: {CSV_DIR}")
        sys.exit(1)

    print(f"{'=' * 60}")
    print(f"找到 {len(csv_files)} 个 CSV 文件")
    print(f"模式: {'干运行（不写入）' if dry_run else '实际修改'}")
    print(f"{'=' * 60}\n")

    total_rows = total_changed = 0
    for csv_path in csv_files:
        result = process_file(csv_path, dry_run=dry_run)
        if result["status"] == "skipped":
            print(f"[跳过] {result['file']}: {result['reason']}")
            continue
        total_rows += result["total_rows"]
        total_changed += result["changed_rows"]
        icon = "✓" if result["changed_rows"] else "−"
        print(f"[{icon}] {result['file']}: {result['total_rows']} 行, "
              f"{result['changed_rows']} 行将改为多语言 Question")
        for ch in result.get("changes", []):
            print(f"    行{ch['row']}: '{ch['before']}'  ->  '{ch['after']}'")

    print(f"\n{'=' * 60}")
    print(f"总计: {total_rows} 行, {total_changed} 行将修改")
    if dry_run:
        print("\n干运行结束，未修改任何文件。确认无误后加 --apply。")
    else:
        print("\n✅ 已完成多语言 Question 重写！请在 AutoDL 上重新导入 RAGFlow:")
        print("  cd /root/autodl-tmp/木雅语助手-AutoDL-RAGFlow版")
        print("  ./scripts/import-ragflow.sh --replace-existing")


if __name__ == "__main__":
    main()
