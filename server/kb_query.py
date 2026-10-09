"""知识库查询脚本 — 中文滑动窗口分词 + 多字段回退搜索"""

import sys
import json
import sqlite3
import os
import re

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "chat.db")

# 常见中文单字虚词
SINGLE_STOPS = {
    '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都',
    '一', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着',
    '没', '这', '那', '吗', '呢', '啊', '吧', '嘛', '呀', '哦', '嗯',
    '跟', '与', '从', '对', '向', '用', '为', '比', '被', '把', '让',
    '请', '咋', '怎', '么', '哪', '啥', '它', '们',
}


def tokenize_chinese(query):
    """中文滑动窗口分词：从任意查询中提取有效关键词

    关键过滤规则：
    1. 单字虚词过滤
    2. 含"的"的组合全部过滤（"圆规的藏语"中的"的藏"、"规的"、"圆规的"等都是噪音）
    """
    chunks = re.findall(r'[\u4e00-\u9fff]+', query)
    keywords = set()

    for chunk in chunks:
        # 1-4字滑动窗口
        for size in range(1, min(len(chunk) + 1, 5)):
            for i in range(len(chunk) - size + 1):
                kw = chunk[i:i + size]
                # 单字虚词过滤
                if len(kw) == 1 and kw in SINGLE_STOPS:
                    continue
                # 含"的"的组合全部过滤（虚词结构，没有信息量）
                if kw[0] == '的' or kw[-1] == '的':
                    continue
                keywords.add(kw)

    # 也加上英文/数字/其他关键词（空格分割）
    for token in query.split():
        token = token.strip()
        if token and not re.match(r'^[\u4e00-\u9fff]+$', token):
            keywords.add(token)

    # 短词优先匹配率高，优先尝试
    return sorted(keywords, key=lambda x: (len(x), x))


def init():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM knowledge_base")
    count = c.fetchone()[0]
    c.execute("SELECT DISTINCT cat FROM knowledge_base WHERE cat IS NOT NULL")
    cats = [row[0] for row in c.fetchall()]
    conn.close()
    return {"total": count, "categories": cats}


def stats():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM knowledge_base")
    total = c.fetchone()[0]
    c.execute("SELECT DISTINCT cat FROM knowledge_base WHERE cat IS NOT NULL")
    cats = [row[0] for row in c.fetchall()]
    conn.close()
    return {"total": total, "categories": cats}


def search(query, limit=10):
    """多策略搜索：
    1. 精确字段匹配（zh/bo/mu/en 整词）—— 强信号，最高优先级
    2. 模糊匹配（zh/bo/mu/en/cat/search_text 多字段 LIKE）—— 兜底
    3. 关键：绝不搜 answer 字段（answer 模板含"藏语；"等固定串会淹没真实信号）
    4. 模糊匹配只用 ≥2 字关键词；单字只在上面都没结果时做最后兜底
    """
    keywords = tokenize_chinese(query)
    if not keywords:
        return []

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    columns = ["id", "zh", "bo", "mu", "ph", "en", "cat", "question", "answer", "search_text"]

    # 策略1：精确匹配 — 用 ≥2 字关键词去匹配 zh/bo/mu/en
    long_keywords = [kw for kw in keywords if len(kw) >= 2]
    for kw in sorted(long_keywords, key=lambda x: -len(x))[:10]:
        c.execute("""
            SELECT id, zh, bo, mu, ph, en, cat, question, answer, search_text
            FROM knowledge_base
            WHERE zh = ? OR bo = ? OR mu = ? OR en = ?
            LIMIT ?
        """, [kw, kw, kw, kw, limit])
        exact_rows = c.fetchall()
        if exact_rows:
            conn.close()
            return [dict(zip(columns, row)) for row in exact_rows[:limit]]

    # 策略2：模糊匹配 — 多字段 LIKE（只用 ≥2 字关键词，按长度升序）
    fuzzy_keywords = sorted([kw for kw in keywords if len(kw) >= 2], key=lambda x: (len(x), x))[:15]
    all_results = []
    seen_ids = set()

    for kw in fuzzy_keywords:
        if len(all_results) >= limit:
            break
        like = f'%{kw}%'
        try:
            c.execute("""
                SELECT id, zh, bo, mu, ph, en, cat, question, answer, search_text
                FROM knowledge_base
                WHERE zh LIKE ? OR bo LIKE ? OR mu LIKE ? OR en LIKE ? OR cat LIKE ? OR search_text LIKE ?
                LIMIT ?
            """, [like, like, like, like, like, like, limit * 2])
            for row in c.fetchall():
                if row[0] not in seen_ids:
                    seen_ids.add(row[0])
                    all_results.append(row)
        except Exception as e:
            print(f"[KB] Search error for keyword '{kw}': {e}", file=sys.stderr)
            continue

    if all_results:
        conn.close()
        return [dict(zip(columns, row)) for row in all_results[:limit]]

    # 策略3：单字兜底 — 如果 ≥2 字都没结果，再用单字做宽松匹配
    single_keywords = [kw for kw in keywords if len(kw) == 1]
    for kw in single_keywords[:5]:
        like = f'%{kw}%'
        try:
            c.execute("""
                SELECT id, zh, bo, mu, ph, en, cat, question, answer, search_text
                FROM knowledge_base
                WHERE zh LIKE ? OR bo LIKE ? OR mu LIKE ?
                LIMIT ?
            """, [like, like, like, limit])
            for row in c.fetchall():
                if row[0] not in seen_ids:
                    seen_ids.add(row[0])
                    all_results.append(row)
        except Exception as e:
            print(f"[KB] Search error for keyword '{kw}': {e}", file=sys.stderr)
            continue

    conn.close()
    return [dict(zip(columns, row)) for row in all_results[:limit]]


def literal_search(query, limit=20):
    """按一个完整检索词查询所有语言字段。

    与通用 search 不同，这里不会把查询拆成短滑窗，因此“健康长寿”可以稳定
    命中“愿长者健康长寿”，藏文或木雅语候选也可用于二次反查。
    """
    term = str(query or '').strip()
    if len(term) < 2:
        return []
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    columns = ["id", "zh", "bo", "mu", "ph", "en", "cat", "question", "answer", "search_text"]
    like = f'%{term}%'
    c.execute("""
        SELECT id, zh, bo, mu, ph, en, cat, question, answer, search_text
        FROM knowledge_base
        WHERE zh LIKE ? OR bo LIKE ? OR mu LIKE ? OR ph LIKE ? OR en LIKE ?
        ORDER BY
          CASE
            WHEN zh = ? OR bo = ? OR mu = ? OR ph = ? OR en = ? THEN 0
            WHEN zh LIKE ? THEN 1
            WHEN bo LIKE ? OR mu LIKE ? THEN 2
            ELSE 3
          END,
          LENGTH(COALESCE(zh, '')) ASC,
          id ASC
        LIMIT ?
    """, [
        like, like, like, like, like,
        term, term, term, term, term,
        like, like, like,
        limit,
    ])
    rows = c.fetchall()
    conn.close()
    return [dict(zip(columns, row)) for row in rows]


def decompose(query, limit=12):
    """把中文待翻译句子按本地知识库中的最长词条进行拆解。

    只返回 zh 字段中真实存在的词条；无法匹配的字符会跳过，不生成翻译。
    """
    text = str(query or '')
    fillers = [
        '用木雅语怎么说', '木雅语怎么说', '用藏语怎么说', '藏语怎么说',
        '用木雅语如何说', '木雅语如何说', '用藏语如何说', '藏语如何说',
        '怎么说', '如何说', '怎样说', '请问', '请告诉我', '翻译成木雅语',
        '翻译成藏语', '木雅语', '木雅藏语', '藏语', '藏文',
    ]
    for filler in fillers:
        text = text.replace(filler, '')
    chinese_runs = re.findall(r'[\u4e00-\u9fff]+', text)
    text = ''.join(chinese_runs)[:60]
    if not text:
        return []

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    columns = ["id", "zh", "bo", "mu", "ph", "en", "cat", "question", "answer", "search_text"]
    c.execute("""
        SELECT id, zh, bo, mu, ph, en, cat, question, answer, search_text
        FROM knowledge_base
        WHERE zh IS NOT NULL AND TRIM(zh) != ''
    """)
    rows = c.fetchall()
    conn.close()

    entries_by_zh = {}
    max_word_length = 1
    for row in rows:
        item = dict(zip(columns, row))
        word = str(item.get('zh') or '').strip()
        # 多字句拆解不使用单字词条，避免把“你好”错误拼成“你 + 好”。
        if not word or (len(text) > 1 and len(word) < 2):
            continue
        entries_by_zh.setdefault(word, []).append(item)
        max_word_length = max(max_word_length, len(word))

    # dp[i] = (已覆盖字符数, 长词奖励, -词条数, [(起点, 词条), ...])
    dp = [None] * (len(text) + 1)
    dp[len(text)] = (0, 0, 0, [])
    for i in range(len(text) - 1, -1, -1):
        # 当前字符无法匹配时直接跳过，不为它生成任何内容。
        tail = dp[i + 1]
        best = (tail[0], tail[1], tail[2], tail[3])
        upper = min(len(text), i + max_word_length)
        for end in range(i + 1, upper + 1):
            word = text[i:end]
            if word not in entries_by_zh:
                continue
            rest = dp[end]
            length = len(word)
            candidate = (
                rest[0] + length,
                rest[1] + length * length,
                rest[2] - 1,
                [(i, word)] + rest[3],
            )
            if candidate[:3] > best[:3]:
                best = candidate
        dp[i] = best

    selected = []
    seen_ids = set()
    for _, word in dp[0][3]:
        for item in entries_by_zh.get(word, []):
            if item['id'] in seen_ids:
                continue
            seen_ids.add(item['id'])
            selected.append({**item, 'segment': word})
            break
        if len(selected) >= limit:
            break
    return selected


def chapters():
    """返回所有章节及其词汇数量"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        SELECT cat, COUNT(*) as cnt
        FROM knowledge_base
        WHERE cat IS NOT NULL AND cat != ''
        GROUP BY cat
        ORDER BY cnt DESC
    """)
    results = [{"name": row[0], "count": row[1]} for row in c.fetchall()]
    conn.close()
    return results


def entries_by_cat(cat, limit=100):
    """按章节（cat）查询词条
    Args:
        cat: 章节名称
        limit: 最多返回多少条
    """
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    columns = ["id", "zh", "bo", "mu", "ph", "en", "cat", "question", "answer"]
    c.execute("""
        SELECT id, zh, bo, mu, ph, en, cat, question, answer
        FROM knowledge_base
        WHERE cat = ?
        ORDER BY id
        LIMIT ?
    """, [cat, limit])
    rows = c.fetchall()
    conn.close()
    return [dict(zip(columns, row)) for row in rows]


def quiz(chapter=None, count=5, mode="random"):
    """生成测验题目

    Args:
        chapter: 指定章节（None 或 'all'=全部章节随机；否则限定此章节）
        count: 题目数量
        mode: "random"=乱序随机抽取；"chapter"=每个章节按 cat 名顺序轮转
    """
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    use_all = (chapter is None) or (chapter == 'all') or (chapter == '')
    if use_all:
        # 全部章节
        if mode == 'chapter':
            # 按章节顺序：先打乱章节顺序，再每章取 1 题
            c.execute("""
                SELECT DISTINCT cat FROM knowledge_base
                WHERE cat IS NOT NULL AND cat != ''
                ORDER BY RANDOM()
            """)
            all_chapters = [row[0] for row in c.fetchall()]
            items = []
            i = 0
            while len(items) < count and i < 100:  # 100 轮上限
                ch = all_chapters[i % len(all_chapters)]
                c.execute("""
                    SELECT id, zh, bo, mu, ph, en, cat
                    FROM knowledge_base
                    WHERE cat = ? AND zh IS NOT NULL AND zh != '' AND bo IS NOT NULL AND bo != ''
                    ORDER BY RANDOM()
                    LIMIT 1
                """, [ch])
                row = c.fetchone()
                if row:
                    items.append(row)
                i += 1
            items = items[:count]
        else:
            # 纯乱序
            c.execute("""
                SELECT id, zh, bo, mu, ph, en, cat
                FROM knowledge_base
                WHERE zh IS NOT NULL AND zh != '' AND bo IS NOT NULL AND bo != ''
                ORDER BY RANDOM()
                LIMIT ?
            """, [count])
            items = c.fetchall()
    else:
        # 指定章节：count 不能超过章节内词数
        if mode == 'chapter':
            # 按 cat 名排序
            c.execute("""
                SELECT id, zh, bo, mu, ph, en, cat
                FROM knowledge_base
                WHERE cat = ? AND zh IS NOT NULL AND zh != '' AND bo IS NOT NULL AND bo != ''
                ORDER BY cat ASC, RANDOM()
                LIMIT ?
            """, [chapter, count])
        else:
            # 纯乱序
            c.execute("""
                SELECT id, zh, bo, mu, ph, en, cat
                FROM knowledge_base
                WHERE cat = ? AND zh IS NOT NULL AND zh != '' AND bo IS NOT NULL AND bo != ''
                ORDER BY RANDOM()
                LIMIT ?
            """, [chapter, count])
        items = c.fetchall()

    # 为每个题目生成选项（从其他词汇中随机选干扰项）
    questions = []
    for item in items:
        item_id, zh, bo, mu, ph, en, cat = item

        # 干扰项（从其他词汇中选3个不同的藏文）
        c.execute("""
            SELECT bo FROM knowledge_base
            WHERE id != ? AND bo IS NOT NULL AND bo != ''
            ORDER BY RANDOM() LIMIT 3
        """, [item_id])
        distractors = [row[0] for row in c.fetchall()]

        # 如果干扰项不足，从其他 cat 补充
        if len(distractors) < 3:
            c.execute("""
                SELECT bo FROM knowledge_base
                WHERE bo IS NOT NULL AND bo != '' AND bo != ?
                ORDER BY RANDOM() LIMIT ?
            """, [bo, 10])
            distractors = [row[0] for row in c.fetchall()][:3 - len(distractors)] + distractors

        # 如果仍然不足用 占位符
        while len(distractors) < 3:
            distractors.append(f"(选项{len(distractors)+1})")

        options = [bo] + distractors[:3]
        import random
        random.shuffle(options)
        correct_index = options.index(bo)

        questions.append({
            "id": item_id,
            "zh": zh,
            "bo": bo,
            "mu": mu,
            "ph": ph,
            "en": en,
            "cat": cat,
            "options": options,
            "correctIndex": correct_index,
        })

    conn.close()
    return questions


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No command"}, ensure_ascii=False))
        sys.exit(1)

    cmd = sys.argv[1]
    try:
        if cmd == "init":
            print(json.dumps(init(), ensure_ascii=False))
        elif cmd == "stats":
            print(json.dumps(stats(), ensure_ascii=False))
        elif cmd == "chapters":
            print(json.dumps(chapters(), ensure_ascii=False))
        elif cmd == "entries_by_cat":
            cat = sys.argv[2] if len(sys.argv) >= 3 else ''
            limit = int(sys.argv[3]) if len(sys.argv) >= 4 else 100
            print(json.dumps(entries_by_cat(cat, limit), ensure_ascii=False))
        elif cmd == "quiz":
            chapter = sys.argv[2] if len(sys.argv) >= 3 and sys.argv[2] != "all" else None
            count = int(sys.argv[3]) if len(sys.argv) >= 4 else 5
            mode = sys.argv[4] if len(sys.argv) >= 5 else "random"
            print(json.dumps(quiz(chapter, count, mode), ensure_ascii=False))
        elif cmd == "search" and len(sys.argv) >= 3:
            query = sys.argv[2]
            limit = int(sys.argv[3]) if len(sys.argv) >= 4 else 10
            print(json.dumps(search(query, limit), ensure_ascii=False))
        elif cmd == "literal_search" and len(sys.argv) >= 3:
            query = sys.argv[2]
            limit = int(sys.argv[3]) if len(sys.argv) >= 4 else 20
            print(json.dumps(literal_search(query, limit), ensure_ascii=False))
        elif cmd == "decompose" and len(sys.argv) >= 3:
            query = sys.argv[2]
            limit = int(sys.argv[3]) if len(sys.argv) >= 4 else 12
            print(json.dumps(decompose(query, limit), ensure_ascii=False))
        else:
            print(json.dumps({"error": f"Unknown command: {cmd}"}, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False))
        sys.exit(1)
