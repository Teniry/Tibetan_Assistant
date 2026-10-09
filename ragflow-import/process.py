#!/usr/bin/env python3
"""Safely import the bundled Muya Q&A CSV files into RAGFlow 0.22.x.

This replaces the peer-provided script. Secrets are read only from environment
variables, the existing dataset is validated before mutation, and parsing has a
finite timeout.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import importlib.metadata
import io
import os
import sys
import time
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple


PROJECT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_CSV_DIR = PROJECT_DIR / "data" / "kb" / "qa_processed_csv"
SUPPORTED_SDK_PREFIX = "0.22."


@dataclass(frozen=True)
class SourceFile:
    path: Path
    name: str
    category: str
    row_count: int
    canonical_hash: str
    upload_blob: bytes
    upload_hash: str


def clean(value: object) -> str:
    return "" if value is None else str(value).strip()


def repair_legacy_filename(name: str) -> str:
    """Repair GBK bytes that were decoded with the DOS CP866 code page.

    The bundled archive contains legacy names such as box-drawing characters.
    Encoding those characters back to CP866 bytes and decoding as GBK restores
    the original Chinese filenames.  Already-correct UTF-8 names are left
    unchanged because they cannot be encoded as CP866.
    """
    try:
        repaired = name.encode("cp866").decode("gbk")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return name
    return repaired if repaired.lower().endswith(".csv") else name


def canonical_rows_from_text(raw_text: str, label: str) -> List[Tuple[str, str]]:
    reader = csv.DictReader(io.StringIO(raw_text, newline=""))
    if reader.fieldnames != ["Question", "Answer"]:
        raise ValueError(
            f"{label} 表头必须严格为 Question,Answer；实际为 {reader.fieldnames}"
        )

    rows: List[Tuple[str, str]] = []
    for row_number, row in enumerate(reader, start=2):
        question = clean(row.get("Question"))
        answer = clean(row.get("Answer"))
        if not question or not answer:
            raise ValueError(f"{label} 第 {row_number} 行存在空问题或空答案")
        rows.append((question, answer))
    return rows


def canonical_rows_from_bytes(raw: bytes, label: str) -> List[Tuple[str, str]]:
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError(f"{label} 不是 UTF-8 CSV") from exc
    return canonical_rows_from_text(text, label)


def headerless_csv_bytes(raw: bytes, label: str) -> bytes:
    """Return UTF-8 CSV data without the Question,Answer header row.

    RAGFlow's Q&A CSV parser treats every two-column row as a real Q&A pair,
    including a conventional CSV header.  Removing only the first physical
    line prevents one bogus ``Question -> Answer`` chunk per source file while
    preserving the original quoting and line endings of all data rows.
    """
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError(f"{label} 不是 UTF-8 CSV") from exc

    _header, separator, body = text.partition("\n")
    if not separator:
        raise ValueError(f"{label} 缺少 Question,Answer 表头后的数据行")
    if not body.strip():
        raise ValueError(f"{label} 删除表头后没有问答数据")
    return body.encode("utf-8")


def rows_hash(rows: Sequence[Tuple[str, str]]) -> str:
    digest = hashlib.sha256()
    for question, answer in rows:
        digest.update(question.encode("utf-8"))
        digest.update(b"\x1f")
        digest.update(answer.encode("utf-8"))
        digest.update(b"\x1e")
    return digest.hexdigest()


def validate_sources(
    csv_dir: Path,
    expected_files: int,
    expected_rows: int,
    allow_unexpected_counts: bool,
) -> Tuple[List[SourceFile], List[List[str]]]:
    if not csv_dir.is_dir():
        raise ValueError(f"CSV 目录不存在：{csv_dir}")

    # 排除 macOS 打包遗留的 AppleDouble 垃圾文件（._XXX.csv，163 字节元数据，
    # 顶着 CSV 名但不是真 CSV，会导致“不是 UTF-8 CSV”报错或文件数统计翻倍）
    files = sorted(
        p for p in csv_dir.glob("*.csv") if not p.name.startswith("._")
    )
    sources: List[SourceFile] = []
    question_locations: Dict[str, List[Tuple[str, int, str]]] = defaultdict(list)

    for path in files:
        raw = path.read_bytes()
        rows = canonical_rows_from_bytes(raw, path.name)
        upload_blob = headerless_csv_bytes(raw, path.name)
        display_name = repair_legacy_filename(path.name)
        category = Path(display_name).stem.removeprefix("QA_")
        sources.append(
            SourceFile(
                path=path,
                name=display_name,
                category=category,
                row_count=len(rows),
                canonical_hash=rows_hash(rows),
                upload_blob=upload_blob,
                upload_hash=hashlib.sha256(upload_blob).hexdigest(),
            )
        )
        for row_number, (question, answer) in enumerate(rows, start=2):
            question_locations[question].append((display_name, row_number, answer))

    total_rows = sum(source.row_count for source in sources)
    if not allow_unexpected_counts:
        if len(sources) != expected_files:
            raise ValueError(f"应有 {expected_files} 个 CSV，实际为 {len(sources)} 个")
        if total_rows != expected_rows:
            raise ValueError(f"应有 {expected_rows} 条问答，实际为 {total_rows} 条")

    conflicts: List[List[str]] = []
    for locations in question_locations.values():
        if len({answer for _, _, answer in locations}) > 1:
            conflicts.append([f"{name}:{row}" for name, row, _ in locations])

    print(f"数据校验通过：{len(sources)} 个文件，{total_rows} 条问答")
    if conflicts:
        print(f"注意：检测到 {len(conflicts)} 组跨分类同题异答，已保留分类来源：")
        for locations in conflicts:
            print("  - " + "；".join(locations))
    return sources, conflicts


def batched(values: Sequence[str], size: int) -> Iterable[List[str]]:
    for start in range(0, len(values), size):
        yield list(values[start : start + size])


def document_state(document: object) -> str:
    run = clean(getattr(document, "run", "")).upper()
    progress = float(getattr(document, "progress", 0.0) or 0.0)
    if run in {"4", "FAIL", "FAILED"}:
        return "FAIL"
    if run in {"2", "CANCEL", "CANCELED", "CANCELLED"}:
        return "CANCEL"
    if run in {"3", "DONE", "SUCCESS"} or progress >= 1.0:
        return "DONE"
    if run in {"1", "RUNNING"} or progress > 0:
        return "RUNNING"
    return "PENDING"


def list_all_documents(dataset: object, page_size: int = 100) -> List[object]:
    documents: List[object] = []
    page = 1
    while True:
        current = dataset.list_documents(page=page, page_size=page_size)
        documents.extend(current)
        if len(current) < page_size:
            return documents
        page += 1


def find_dataset(rag: object, dataset_id: str, dataset_name: str) -> Optional[object]:
    if dataset_id:
        datasets = rag.list_datasets(id=dataset_id)
        if len(datasets) > 1:
            raise RuntimeError(f"知识库 ID {dataset_id} 返回了多个结果")
        return datasets[0] if datasets else None

    datasets = rag.list_datasets(name=dataset_name)
    if len(datasets) > 1:
        raise RuntimeError(
            f"存在多个名为 {dataset_name} 的知识库，请用 --dataset-id 明确指定"
        )
    return datasets[0] if datasets else None


def choose_dataset_id(cli_value: str) -> str:
    if cli_value:
        return cli_value
    singular = clean(os.getenv("RAGFLOW_DATASET_ID"))
    if singular:
        return singular
    candidates = [
        item.strip()
        for item in clean(os.getenv("RAGFLOW_DATASET_IDS")).split(",")
        if item.strip()
    ]
    if len(candidates) == 1:
        return candidates[0]
    if len(candidates) > 1:
        raise RuntimeError("导入工具一次只支持一个知识库，请使用 --dataset-id")
    return ""


def require_sdk(allow_mismatch: bool):
    try:
        sdk_version = importlib.metadata.version("ragflow-sdk")
    except importlib.metadata.PackageNotFoundError as exc:
        raise RuntimeError(
            "未安装 ragflow-sdk；当前实例请安装 ragflow-sdk==0.22.1"
        ) from exc

    if not sdk_version.startswith(SUPPORTED_SDK_PREFIX) and not allow_mismatch:
        raise RuntimeError(
            f"当前 ragflow-sdk={sdk_version}，本工具已验证的是 0.22.x；"
            "如确认兼容，可加 --allow-sdk-version-mismatch"
        )
    print(f"RAGFlow SDK：{sdk_version}")
    from ragflow_sdk import RAGFlow

    return RAGFlow


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="把部署包内 64 份、4,641 条木雅语 Q&A 数据安全导入 RAGFlow"
    )
    parser.add_argument("--csv-dir", type=Path, default=DEFAULT_CSV_DIR)
    parser.add_argument("--dataset-name", default=os.getenv("RAGFLOW_DATASET_NAME", "muya"))
    parser.add_argument("--dataset-id", default="")
    parser.add_argument("--create-missing", action="store_true")
    parser.add_argument("--embedding-model", default=os.getenv("RAGFLOW_EMBEDDING_MODEL", ""))
    parser.add_argument("--set-dataset-qa", action="store_true")
    parser.add_argument("--replace-existing", action="store_true")
    parser.add_argument("--retry-failed", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--expected-files", type=int, default=64)
    parser.add_argument("--expected-rows", type=int, default=4641)
    parser.add_argument("--allow-unexpected-counts", action="store_true")
    parser.add_argument("--allow-sdk-version-mismatch", action="store_true")
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--poll-interval", type=float, default=5.0)
    parser.add_argument("--timeout-minutes", type=float, default=60.0)
    return parser


def run(args: argparse.Namespace) -> int:
    sources, _ = validate_sources(
        args.csv_dir.resolve(),
        args.expected_files,
        args.expected_rows,
        args.allow_unexpected_counts,
    )
    if args.dry_run:
        print("dry-run 完成：没有连接或修改 RAGFlow")
        return 0

    base_url = clean(os.getenv("RAGFLOW_BASE_URL")).rstrip("/")
    api_key = clean(os.getenv("RAGFLOW_API_KEY"))
    if not base_url or not api_key:
        raise RuntimeError("请先在 /root/.muya-env 配置 RAGFLOW_BASE_URL 和 RAGFLOW_API_KEY")

    RAGFlow = require_sdk(args.allow_sdk_version_mismatch)
    rag = RAGFlow(api_key=api_key, base_url=base_url)
    dataset_id = choose_dataset_id(args.dataset_id)
    dataset = find_dataset(rag, dataset_id, args.dataset_name)

    if dataset is None:
        if not args.create_missing:
            raise RuntimeError(
                f"未找到知识库 {dataset_id or args.dataset_name}。"
                "请先在 RAGFlow 页面创建 Q&A 知识库，或使用 --create-missing"
            )
        if not args.embedding_model:
            raise RuntimeError("自动创建知识库时必须提供 --embedding-model")
        dataset = rag.create_dataset(
            name=args.dataset_name,
            embedding_model=args.embedding_model,
            chunk_method="qa",
        )
        print(f"已创建 Q&A 知识库：{dataset.name} ({dataset.id})")

    chunk_method = clean(getattr(dataset, "chunk_method", "")).lower()
    if chunk_method != "qa":
        if not args.set_dataset_qa:
            raise RuntimeError(
                f"知识库 {dataset.name} 当前切片方式为 {chunk_method or '未知'}，不是 qa。"
                "请在 RAGFlow 页面改为 Q&A，或确认后加 --set-dataset-qa"
            )
        dataset.update({"chunk_method": "qa"})
        print("知识库切片方式已设置为 Q&A")

    print(
        f"目标知识库：{dataset.name} ({dataset.id})；"
        f"嵌入模型：{clean(getattr(dataset, 'embedding_model', '')) or '未返回'}"
    )

    existing = list_all_documents(dataset)
    existing_by_name: Dict[str, List[object]] = defaultdict(list)
    for document in existing:
        existing_by_name[clean(getattr(document, "name", ""))].append(document)

    delete_ids: List[str] = []
    reuse_documents: List[object] = []
    blockers: List[str] = []

    for source in sources:
        candidate_names = list(dict.fromkeys((source.name, source.path.name)))
        matches = [
            document
            for candidate_name in candidate_names
            for document in existing_by_name.get(candidate_name, [])
        ]
        if not matches:
            continue
        if len(matches) > 1:
            if args.replace_existing:
                delete_ids.extend(clean(getattr(doc, "id", "")) for doc in matches)
            else:
                blockers.append(f"{source.name} 在 RAGFlow 中有 {len(matches)} 个同名文档")
            continue

        document = matches[0]
        document_id = clean(getattr(document, "id", ""))
        try:
            remote_blob = document.download()
            same_content = hashlib.sha256(remote_blob).hexdigest() == source.upload_hash
        except Exception as exc:
            same_content = False
            print(f"无法核对远端 {source.name}：{exc}")

        remote_method = clean(getattr(document, "chunk_method", "")).lower()
        if same_content and remote_method == "qa":
            reuse_documents.append(document)
        elif args.replace_existing:
            delete_ids.append(document_id)
        else:
            blockers.append(
                f"{source.name} 与本包内容或 Q&A 设置不一致；如确认替换，请加 --replace-existing"
            )

    if blockers:
        print("导入前检查未通过：", file=sys.stderr)
        for message in blockers:
            print(f"  - {message}", file=sys.stderr)
        return 2

    delete_ids = [item for item in dict.fromkeys(delete_ids) if item]
    if delete_ids:
        print(f"正在替换 {len(delete_ids)} 个同名旧文档…")
        for batch in batched(delete_ids, args.batch_size):
            dataset.delete_documents(batch)

    deleted_names = {
        name
        for name, documents in existing_by_name.items()
        if any(clean(getattr(doc, "id", "")) in set(delete_ids) for doc in documents)
    }
    upload_sources = [
        source
        for source in sources
        if source.name not in existing_by_name or source.name in deleted_names
    ]

    parse_ids: List[str] = []
    watch_ids: List[str] = []
    skipped_done = 0

    for document in reuse_documents:
        state = document_state(document)
        doc_id = clean(getattr(document, "id", ""))
        chunk_count = int(getattr(document, "chunk_count", 0) or 0)
        if state == "DONE" and chunk_count > 0:
            skipped_done += 1
        elif state in {"FAIL", "CANCEL"}:
            if args.retry_failed:
                parse_ids.append(doc_id)
                watch_ids.append(doc_id)
            else:
                raise RuntimeError(
                    f"文档 {getattr(document, 'name', doc_id)} 上次解析失败；"
                    "修复原因后加 --retry-failed"
                )
        elif state == "RUNNING":
            watch_ids.append(doc_id)
        else:
            parse_ids.append(doc_id)
            watch_ids.append(doc_id)

    for index, source in enumerate(upload_sources, start=1):
        print(f"上传 [{index}/{len(upload_sources)}] {source.name}")
        documents = dataset.upload_documents(
            [{"display_name": source.name, "blob": source.upload_blob}]
        )
        if not documents:
            raise RuntimeError(f"上传 {source.name} 后未返回文档")
        document = documents[0]
        document.update(
            {
                "chunk_method": "qa",
                "meta_fields": {
                    "category": source.category,
                    "source": "muya-xls-2026-08",
                    "source_file": source.name,
                    "import_format": "qa-headerless-v1",
                },
            }
        )
        doc_id = clean(getattr(document, "id", ""))
        parse_ids.append(doc_id)
        watch_ids.append(doc_id)

    parse_ids = [item for item in dict.fromkeys(parse_ids) if item]
    watch_ids = [item for item in dict.fromkeys(watch_ids) if item]
    print(
        f"上传计划完成：新增/替换 {len(upload_sources)}，"
        f"已完成并跳过 {skipped_done}，待解析/观察 {len(watch_ids)}"
    )

    for batch in batched(parse_ids, args.batch_size):
        dataset.async_parse_documents(batch)

    if not watch_ids:
        print("全部文档此前已经完成解析。")
    else:
        pending = set(watch_ids)
        deadline = time.monotonic() + args.timeout_minutes * 60
        last_summary = ""
        while pending:
            if time.monotonic() >= deadline:
                raise TimeoutError(
                    f"解析等待超过 {args.timeout_minutes:g} 分钟；RAGFlow 任务仍保留，可稍后重查"
                )
            current_by_id = {
                clean(getattr(doc, "id", "")): doc for doc in list_all_documents(dataset)
            }
            failed: List[str] = []
            done_count = len(watch_ids) - len(pending)
            progress_values: List[float] = []
            for doc_id in list(pending):
                document = current_by_id.get(doc_id)
                if document is None:
                    continue
                state = document_state(document)
                progress_values.append(float(getattr(document, "progress", 0.0) or 0.0))
                if state == "DONE":
                    pending.remove(doc_id)
                    done_count += 1
                elif state in {"FAIL", "CANCEL"}:
                    pending.remove(doc_id)
                    failed.append(clean(getattr(document, "name", doc_id)))
            if failed:
                raise RuntimeError("以下文档解析失败：" + "、".join(failed))
            average = (sum(progress_values) / len(progress_values) * 100) if progress_values else 100
            summary = f"解析进度：{done_count}/{len(watch_ids)} 完成；其余平均 {average:.1f}%"
            if summary != last_summary:
                print(summary)
                last_summary = summary
            if pending:
                time.sleep(max(args.poll_interval, 1.0))

    final_documents = list_all_documents(dataset)
    final_by_name: Dict[str, List[object]] = defaultdict(list)
    for document in final_documents:
        final_by_name[clean(getattr(document, "name", ""))].append(document)
    final_names = set(final_by_name)
    missing = [source.name for source in sources if source.name not in final_names]
    if missing:
        raise RuntimeError(f"导入后仍缺少 {len(missing)} 个文档")

    duplicates = [name for name, documents in final_by_name.items() if len(documents) > 1]
    if duplicates:
        raise RuntimeError(f"导入后仍有 {len(duplicates)} 个重名文档")

    expected_chunks = sum(source.row_count for source in sources)
    actual_chunks = sum(
        int(getattr(final_by_name[source.name][0], "chunk_count", 0) or 0)
        for source in sources
    )
    if actual_chunks != expected_chunks:
        raise RuntimeError(
            f"切片数量不一致：应为 {expected_chunks}，实际为 {actual_chunks}。"
            "请勿启用该知识库并检查 RAGFlow Q&A 解析结果"
        )

    print(f"切片数量校验通过：{actual_chunks}")
    print("RAGFlow 导入完成。请把下面的知识库 ID 写入 /root/.muya-env：")
    print(f"export RAGFLOW_DATASET_IDS='{dataset.id}'")
    return 0


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    if args.batch_size < 1:
        parser.error("--batch-size 必须大于 0")
    if args.timeout_minutes <= 0:
        parser.error("--timeout-minutes 必须大于 0")
    try:
        return run(args)
    except KeyboardInterrupt:
        print("\n用户中断；已提交到 RAGFlow 的解析任务不会被删除", file=sys.stderr)
        return 130
    except Exception as exc:
        print(f"导入失败：{exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
