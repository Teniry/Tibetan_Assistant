"""知识库导入脚本 — 从 qa_csv.zip 完整版重新导入数据

章节分类规则（按用户要求）：
1. 优先用 CSV 文件名的中文章节（去掉 QA_ 前缀和 .csv 后缀）
   例如：QA_鞍具.csv → 章节=鞍具
2. ZIP 内文件名是 GBK 编码，需要先解码成 UTF-8 才能正确识别中文
"""
import zipfile
import sqlite3
import os
import re
import csv
import io

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "chat.db")
ZIP_PATH = "D:/实验项目/藏语/资料/qa_csv.zip"


def decode_zip_filename(filename: str) -> str:
    """ZIP 默认用 CP437 编码文件名，中文文件通常是 GBK/CP936 编码
    尝试 GBK 解码，失败则返回原名"""
    try:
        # python zipfile 默认按 utf-8 解码，中文 zip 通常是 GBK
        return filename.encode('cp437').decode('gbk')
    except (UnicodeDecodeError, UnicodeEncodeError):
        return filename


def extract_chapter_from_filename(filename: str) -> str:
    """从文件名提取章节名
    QA_鞍具.csv → 鞍具
    qa_csv/QA_鞍具.csv → 鞍具
    """
    # 先解码 GBK
    decoded = decode_zip_filename(filename)
    # 取 basename
    base = os.path.basename(decoded)
    # 去掉 QA_ 前缀和 .csv 后缀
    m = re.match(r'^QA_(.+)\.csv$', base, re.IGNORECASE)
    if m:
        return m.group(1)
    return base.replace('.csv', '')


def parse_question_field(text):
    """解析 Question 字段，提取 zh, bo, mu, ph, en"""
    fields = {'zh': '', 'bo': '', 'mu': '', 'ph': '', 'en': ''}
    parts = text.split('|')
    for part in parts:
        part = part.strip()
        if '：' in part:
            key, val = part.split('：', 1)
            key = key.strip()
            val = val.strip()
            if key == '中文':
                fields['zh'] = val
            elif key == '藏文':
                fields['bo'] = val
            elif key == '木雅语':
                fields['mu'] = val
            elif key == '英文':
                fields['en'] = val
            elif key == '音标':
                fields['ph'] = val
    return fields


def parse_answer_field(text):
    """解析 Answer 字段（仅保留为备注，cat 优先级由文件名决定）"""
    return text


def build_search_text(zh, bo, mu, ph, en, cat, question):
    """构建全文搜索文本"""
    parts = []
    if zh:
        parts.append(zh)
    if bo:
        parts.append(bo)
    if mu:
        parts.append(mu)
    if ph:
        parts.append(ph)
    if en:
        parts.append(en)
    if cat:
        parts.append(cat)
    if question:
        chinese_words = re.findall(r'中文[：:]\s*([^；;|]+)', question)
        for w in chinese_words:
            parts.append(w.strip())
    return ' '.join(filter(None, parts))


def main():
    print(f"[导入] 开始从 ZIP 导入知识库数据...")
    print(f"[导入] ZIP 路径: {ZIP_PATH}")
    print(f"[导入] 数据库路径: {DB_PATH}")

    z = zipfile.ZipFile(ZIP_PATH)
    csv_files = [f for f in z.namelist() if f.endswith('.csv')]
    print(f"[导入] 找到 {len(csv_files)} 个 CSV 文件")

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # 删除旧表并重建
    c.execute("DROP TABLE IF EXISTS knowledge_base")
    c.execute("""
        CREATE TABLE knowledge_base (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            zh TEXT,
            bo TEXT,
            mu TEXT,
            ph TEXT,
            en TEXT,
            cat TEXT,
            question TEXT,
            answer TEXT,
            source_file TEXT,
            search_text TEXT
        )
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_search_text ON knowledge_base(search_text)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_cat ON knowledge_base(cat)")

    total_inserted = 0
    chapters = {}
    failed_files = []

    for zip_name in sorted(csv_files):
        # 解码文件名获取中文章节
        chapter = extract_chapter_from_filename(zip_name)
        chapters[chapter] = chapters.get(chapter, 0)

        try:
            content = z.read(zip_name).decode('utf-8-sig')
        except Exception as e:
            print(f"[警告] 读取 {zip_name} 失败: {e}")
            failed_files.append(zip_name)
            continue

        reader = csv.DictReader(io.StringIO(content))
        count = 0
        for row in reader:
            question_text = row.get('Question', '').strip()
            answer_text = row.get('Answer', '').strip()

            if not question_text and not answer_text:
                continue

            q_fields = parse_question_field(question_text)
            zh = q_fields['zh']
            bo = q_fields['bo']
            mu = q_fields['mu']
            ph = q_fields['ph']
            en = q_fields['en']
            # 章节直接用文件名（保证一致性）
            cat = chapter
            answer = parse_answer_field(answer_text)

            search_text = build_search_text(zh, bo, mu, ph, en, cat, question_text)

            c.execute("""
                INSERT INTO knowledge_base (zh, bo, mu, ph, en, cat, question, answer, source_file, search_text)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (zh, bo, mu, ph, en, cat, question_text, answer, zip_name, search_text))

            chapters[chapter] += 1
            count += 1

        if count > 0:
            print(f"[导入] ✓ {chapter}: {count} 条")
        total_inserted += count

    z.close()
    conn.commit()

    # 统计
    c.execute("SELECT COUNT(*) FROM knowledge_base")
    final_count = c.fetchone()[0]
    c.execute("SELECT DISTINCT cat FROM knowledge_base WHERE cat IS NOT NULL")
    final_cats = sorted([row[0] for row in c.fetchall()])

    conn.close()

    print(f"\n[导入] ========== 完成 ==========")
    print(f"[导入] 总记录数: {final_count}")
    print(f"[导入] 章节数: {len(final_cats)}")
    print(f"[导入] 章节列表 ({len(final_cats)} 个):")
    for ch in final_cats:
        print(f"  - {ch}")
    if failed_files:
        print(f"\n[警告] 失败文件: {failed_files}")


if __name__ == "__main__":
    main()
