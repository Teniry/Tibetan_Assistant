import csv
import sqlite3
import os
import re
import glob
import json
from pathlib import Path

# 数据库路径
DB_PATH = os.path.join(os.path.dirname(__file__), 'chat.db')

def init_knowledge_base():
    """初始化知识库表"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS knowledge_base (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            zh TEXT,
            bo TEXT,
            mu TEXT,
            ph TEXT,
            en TEXT,
            cat TEXT,
            question TEXT,
            answer TEXT,
            search_text TEXT
        )
    ''')
    # 创建全文搜索索引
    c.execute('''
        CREATE INDEX IF NOT EXISTS idx_kb_search ON knowledge_base(search_text)
    ''')
    c.execute('''
        CREATE INDEX IF NOT EXISTS idx_kb_zh ON knowledge_base(zh)
    ''')
    conn.commit()
    conn.close()
    print("[KB] Knowledge base initialized")

def parse_fields(text: str) -> dict:
    """从文本中提取字段"""
    fields = {}
    
    # 匹配各种格式
    patterns = {
        'zh': r'中文[：:]([^|；;]+)',
        'bo': r'藏[文语][：:]([^|；;]+)',
        'mu': r'木雅[语][：:]([^|；;]+)',
        'ph': r'音[标标][：:]([^|；;]+)',
        'en': r'英文[：:]([^|；;]+)',
        'cat': r'章节[分类][：:]([^|；;]+)'
    }
    
    for key, pattern in patterns.items():
        match = re.search(pattern, text)
        if match:
            fields[key] = match.group(1).strip()
    
    return fields

def import_csv_files(csv_dir: str):
    """导入所有 CSV 文件到知识库"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # 清空现有数据
    c.execute('DELETE FROM knowledge_base')
    
    csv_files = glob.glob(os.path.join(csv_dir, 'QA_*.csv'))
    total = 0
    
    for filepath in csv_files:
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    question = row.get('Question', '')
                    answer = row.get('Answer', '')
                    
                    # 从 Answer 解析字段（更完整）
                    q_fields = parse_fields(question)
                    a_fields = parse_fields(answer)
                    
                    # 合并字段，优先使用 answer 的
                    zh = a_fields.get('zh', q_fields.get('zh', ''))
                    bo = a_fields.get('bo', q_fields.get('bo', ''))
                    mu = a_fields.get('mu', q_fields.get('mu', ''))
                    ph = a_fields.get('ph', q_fields.get('ph', ''))
                    en = a_fields.get('en', q_fields.get('en', ''))
                    cat = a_fields.get('cat', q_fields.get('cat', ''))
                    
                    # 如果没有从 answer 解析到 cat，从文件名推断
                    if not cat:
                        filename = os.path.basename(filepath)
                        cat_match = re.search(r'QA_(.+?)\.csv', filename)
                        if cat_match:
                            cat = cat_match.group(1)
                    
                    # 构建搜索文本
                    search_text = f"{zh} {bo} {mu} {ph} {en} {cat}"
                    
                    c.execute('''
                        INSERT INTO knowledge_base (zh, bo, mu, ph, en, cat, question, answer, search_text)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (zh, bo, mu, ph, en, cat, question, answer, search_text))
                    total += 1
        except Exception as e:
            print(f"[KB] Error importing {filepath}: {e}")
    
    conn.commit()
    conn.close()
    print(f"[KB] Imported {total} entries")
    return total

def search_knowledge(query: str, limit: int = 10) -> list:
    """搜索知识库"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # 简单的关键词搜索
    keywords = query.strip().split()
    if not keywords:
        conn.close()
        return []
    
    # 构建 OR 查询
    conditions = []
    params = []
    for kw in keywords:
        conditions.append('search_text LIKE ?')
        params.append(f'%{kw}%')
    
    where_clause = ' OR '.join(conditions)
    
    c.execute(f'''
        SELECT zh, bo, mu, ph, en, cat, question, answer 
        FROM knowledge_base 
        WHERE {where_clause}
        LIMIT ?
    ''', (*params, limit))
    
    results = []
    for row in c.fetchall():
        results.append({
            'zh': row[0],
            'bo': row[1],
            'mu': row[2],
            'ph': row[3],
            'en': row[4],
            'cat': row[5],
            'question': row[6],
            'answer': row[7]
        })
    
    conn.close()
    return results

if __name__ == '__main__':
    init_knowledge_base()
    import_csv_files('./data/kb/qa_processed_csv')
