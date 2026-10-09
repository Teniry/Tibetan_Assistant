"""用户上传的知识库管理模块

- 与本地基础知识库分离存储
- 支持上传 CSV / ZIP（CSV 必须含 Question/Answer 列）
- 用户只能上传 / 查看 / 删除，不能下载
"""
import os
import re
import csv
import io
import zipfile
import sqlite3
import json
import uuid
import sys
import base64
from typing import List, Dict, Any, Optional

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "chat.db")


def _connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_user_kb_tables():
    """初始化用户知识库表（如果不存在）"""
    conn = _connect()
    c = conn.cursor()

    # 用户知识库元信息表
    c.execute("""
        CREATE TABLE IF NOT EXISTS user_kb (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            source_filename TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    # 用户词条表
    c.execute("""
        CREATE TABLE IF NOT EXISTS user_kb_entry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kb_id TEXT NOT NULL,
            zh TEXT,
            bo TEXT,
            mu TEXT,
            ph TEXT,
            en TEXT,
            cat TEXT,
            question TEXT,
            answer TEXT,
            search_text TEXT,
            FOREIGN KEY (kb_id) REFERENCES user_kb(id) ON DELETE CASCADE
        )
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_user_kb_entry_kb ON user_kb_entry(kb_id)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_user_kb_entry_search ON user_kb_entry(search_text)")

    conn.commit()
    conn.close()


def _parse_csv_text(content: str, default_chapter: str) -> List[Dict[str, Any]]:
    """解析 CSV 文本，返回词条列表"""
    reader = csv.DictReader(io.StringIO(content))
    entries = []
    for row in reader:
        question_text = (row.get('Question') or '').strip()
        answer_text = (row.get('Answer') or '').strip()
        if not question_text and not answer_text:
            continue

        # 解析 Question 字段
        zh = bo = mu = ph = en = ''
        for part in question_text.split('|'):
            part = part.strip()
            if '：' in part:
                key, val = part.split('：', 1)
                key = key.strip()
                val = val.strip()
                if key == '中文':
                    zh = val
                elif key == '藏文':
                    bo = val
                elif key == '木雅语':
                    mu = val
                elif key == '音标':
                    ph = val
                elif key == '英文':
                    en = val

        # 章节：优先用文件名（来自 Answer 中的"章节分类"）
        cat = default_chapter
        m = re.search(r'章节分类[：:]\s*([^；;|]+)', answer_text)
        if m:
            cat_from_answer = m.group(1).strip()
            if cat_from_answer:
                cat = cat_from_answer

        # search_text
        parts = [zh, bo, mu, ph, en, cat]
        search_text = ' '.join(filter(None, parts))

        entries.append({
            'zh': zh,
            'bo': bo,
            'mu': mu,
            'ph': ph,
            'en': en,
            'cat': cat,
            'question': question_text,
            'answer': answer_text,
            'search_text': search_text,
        })
    return entries


def _safe_filename_chapter(name: str) -> str:
    """从 CSV 文件名提取章节"""
    base = os.path.basename(name)
    m = re.match(r'^QA_(.+)\.csv$', base, re.IGNORECASE)
    if m:
        return m.group(1)
    return base.replace('.csv', '')


def _decode_zip_filename(filename: str) -> str:
    """ZIP 内的中文文件名通常用 GBK 编码，zipfile 默认按 CP437 解码"""
    try:
        return filename.encode('cp437').decode('gbk')
    except (UnicodeDecodeError, UnicodeEncodeError):
        return filename


def import_file(file_data: bytes, filename: str) -> Dict[str, Any]:
    """从文件内容导入用户知识库

    Args:
        file_data: 文件二进制内容
        filename: 原始文件名

    Returns:
        {"success": True, "kb_id": "...", "entry_count": N}
        {"success": False, "error": "..."}
    """
    name_lower = filename.lower()
    if not (name_lower.endswith('.csv') or name_lower.endswith('.zip')):
        return {"success": False, "error": "只支持 CSV 或 ZIP 文件"}

    # 生成 KB ID 和展示名
    kb_id = str(uuid.uuid4())
    display_name = os.path.splitext(filename)[0]
    # 去掉 QA_ 前缀
    display_name = re.sub(r'^QA_', '', display_name, flags=re.IGNORECASE)
    if not display_name:
        display_name = '我的知识库'

    all_entries: List[Dict[str, Any]] = []
    chapters_seen = set()

    try:
        if name_lower.endswith('.zip'):
            with zipfile.ZipFile(io.BytesIO(file_data)) as z:
                csv_files = [f for f in z.namelist() if f.lower().endswith('.csv')]
                if not csv_files:
                    return {"success": False, "error": "ZIP 内未找到任何 CSV 文件"}

                for zip_name in csv_files:
                    # 解码 GBK 文件名
                    decoded_name = _decode_zip_filename(zip_name)
                    chapter = _safe_filename_chapter(decoded_name)
                    chapters_seen.add(chapter)
                    try:
                        content = z.read(zip_name).decode('utf-8-sig')
                    except UnicodeDecodeError:
                        try:
                            content = z.read(zip_name).decode('gbk')
                        except Exception as e:
                            print(f"[UserKB] 读取 {zip_name} 失败: {e}")
                            continue
                    all_entries.extend(_parse_csv_text(content, chapter))
        else:
            # 单个 CSV：用文件名作章节
            chapter = _safe_filename_chapter(filename)
            chapters_seen.add(chapter)
            try:
                content = file_data.decode('utf-8-sig')
            except UnicodeDecodeError:
                content = file_data.decode('gbk', errors='ignore')
            all_entries = _parse_csv_text(content, chapter)
    except zipfile.BadZipFile:
        return {"success": False, "error": "ZIP 文件已损坏"}
    except Exception as e:
        return {"success": False, "error": f"解析失败: {str(e)}"}

    if not all_entries:
        return {"success": False, "error": "未从文件中读取到任何词条"}

    # 入库
    init_user_kb_tables()
    conn = _connect()
    c = conn.cursor()
    try:
        c.execute(
            "INSERT INTO user_kb (id, name, source_filename, created_at) VALUES (?, ?, ?, ?)",
            (kb_id, display_name, filename, _now_iso()),
        )
        for entry in all_entries:
            c.execute("""
                INSERT INTO user_kb_entry (kb_id, zh, bo, mu, ph, en, cat, question, answer, search_text)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                kb_id,
                entry['zh'], entry['bo'], entry['mu'], entry['ph'], entry['en'],
                entry['cat'], entry['question'], entry['answer'], entry['search_text'],
            ))
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        return {"success": False, "error": f"入库失败: {str(e)}"}

    conn.close()

    return {
        "success": True,
        "kb_id": kb_id,
        "name": display_name,
        "entry_count": len(all_entries),
        "chapters": sorted(chapters_seen),
    }


def list_user_kb() -> List[Dict[str, Any]]:
    """列出所有用户知识库"""
    init_user_kb_tables()
    conn = _connect()
    c = conn.cursor()
    c.execute("""
        SELECT k.id, k.name, k.source_filename, k.created_at,
               COUNT(e.id) AS entry_count,
               GROUP_CONCAT(DISTINCT e.cat) AS cats
        FROM user_kb k
        LEFT JOIN user_kb_entry e ON e.kb_id = k.id
        GROUP BY k.id
        ORDER BY k.created_at DESC
    """)
    rows = c.fetchall()
    conn.close()
    return [
        {
            "id": row['id'],
            "name": row['name'],
            "source_filename": row['source_filename'],
            "created_at": row['created_at'],
            "entry_count": row['entry_count'],
            "chapters": [c for c in (row['cats'] or '').split(',') if c],
        }
        for row in rows
    ]


def get_entries(kb_id: str, limit: int = 200, offset: int = 0, chapter: str = '') -> List[Dict[str, Any]]:
    """获取某用户知识库的词条"""
    init_user_kb_tables()
    conn = _connect()
    c = conn.cursor()
    if chapter:
        c.execute("""
            SELECT id, zh, bo, mu, ph, en, cat, question, answer
            FROM user_kb_entry
            WHERE kb_id = ? AND cat = ?
            ORDER BY id
            LIMIT ? OFFSET ?
        """, (kb_id, chapter, limit, offset))
    else:
        c.execute("""
            SELECT id, zh, bo, mu, ph, en, cat, question, answer
            FROM user_kb_entry
            WHERE kb_id = ?
            ORDER BY id
            LIMIT ? OFFSET ?
        """, (kb_id, limit, offset))
    rows = c.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def delete_user_kb(kb_id: str) -> Dict[str, Any]:
    """删除用户知识库（含全部词条）"""
    init_user_kb_tables()
    conn = _connect()
    c = conn.cursor()
    try:
        c.execute("DELETE FROM user_kb_entry WHERE kb_id = ?", (kb_id,))
        c.execute("DELETE FROM user_kb WHERE id = ?", (kb_id,))
        deleted = c.rowcount > 0 or c.total_changes > 0
        conn.commit()
        conn.close()
        return {"success": True, "deleted": deleted}
    except Exception as e:
        conn.rollback()
        conn.close()
        return {"success": False, "error": str(e)}


def search_user_kb(query: str, limit: int = 10) -> List[Dict[str, Any]]:
    """在用户知识库中搜索（可与本地 KB 合并结果）

    注意：不会暴露 KB 归属信息，只返回词条
    """
    init_user_kb_tables()
    from kb_query import tokenize_chinese

    keywords = tokenize_chinese(query)
    if not keywords:
        return []

    conn = _connect()
    c = conn.cursor()
    columns = ["id", "zh", "bo", "mu", "ph", "en", "cat", "question", "answer", "search_text"]

    # 精确匹配（≥2字关键词）
    for kw in sorted([k for k in keywords if len(k) >= 2], key=lambda x: -len(x))[:5]:
        c.execute("""
            SELECT id, zh, bo, mu, ph, en, cat, question, answer, search_text
            FROM user_kb_entry
            WHERE zh = ? OR bo = ? OR mu = ? OR en = ?
            LIMIT ?
        """, (kw, kw, kw, kw, limit))
        rows = c.fetchall()
        if rows:
            conn.close()
            return [dict(row) for row in rows[:limit]]

    # 模糊匹配（≥2字）
    all_results = []
    seen_ids = set()
    fuzzy_kws = sorted([k for k in keywords if len(k) >= 2], key=lambda x: (len(x), x))[:15]
    for kw in fuzzy_kws:
        if len(all_results) >= limit:
            break
        like = f'%{kw}%'
        c.execute("""
            SELECT id, zh, bo, mu, ph, en, cat, question, answer, search_text
            FROM user_kb_entry
            WHERE zh LIKE ? OR bo LIKE ? OR mu LIKE ? OR en LIKE ? OR cat LIKE ? OR search_text LIKE ?
            LIMIT ?
        """, (like, like, like, like, like, like, limit * 2))
        for row in c.fetchall():
            if row['id'] not in seen_ids:
                seen_ids.add(row['id'])
                all_results.append(dict(row))

    conn.close()
    return all_results[:limit]


def _now_iso() -> str:
    from datetime import datetime, timezone, timedelta
    # 北京时间（UTC+8）
    tz = timezone(timedelta(hours=8))
    return datetime.now(tz).isoformat()


def _cli() -> None:
    """供 Node/TypeScript 同步调用的轻量命令行接口。"""
    command = sys.argv[1] if len(sys.argv) > 1 else ''

    if command == 'init':
        init_user_kb_tables()
        result = {"success": True}
    elif command == 'list':
        result = list_user_kb()
    elif command == 'import':
        payload = json.load(sys.stdin)
        file_data = base64.b64decode(payload.get('data', ''))
        result = import_file(file_data, payload.get('filename', ''))
    elif command == 'entries':
        kb_id = sys.argv[2] if len(sys.argv) > 2 else ''
        limit = int(sys.argv[3]) if len(sys.argv) > 3 else 200
        offset = int(sys.argv[4]) if len(sys.argv) > 4 else 0
        chapter = sys.argv[5] if len(sys.argv) > 5 else ''
        result = get_entries(kb_id, limit, offset, chapter)
    elif command == 'delete':
        kb_id = sys.argv[2] if len(sys.argv) > 2 else ''
        result = delete_user_kb(kb_id)
    else:
        raise ValueError(f'未知命令：{command}')

    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    try:
        _cli()
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
