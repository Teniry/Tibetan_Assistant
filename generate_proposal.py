# -*- coding: utf-8 -*-
"""
生成"木雅智语"项目计划书 docx
适用于：中国国际大学生创新大赛（2026）· 青年红色筑梦之旅赛道 · 公益组
"""

from docx import Document
from docx.shared import Pt, Cm, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
import os

doc = Document()

# ============ 全局样式 ============
style = doc.styles['Normal']
style.font.name = '宋体'
style.element.rPr.rFonts.set(qn('w:eastAsia'), '宋体')
style.font.size = Pt(12)
style.paragraph_format.line_spacing_rule = WD_LINE_SPACING.ONE_POINT_FIVE
style.paragraph_format.space_after = Pt(4)

# 页面边距
for section in doc.sections:
    section.top_margin = Cm(2.54)
    section.bottom_margin = Cm(2.54)
    section.left_margin = Cm(3.18)
    section.right_margin = Cm(3.18)

def add_heading(text, level=1, size=None, color=None):
    """添加标题"""
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.font.name = '黑体'
    run.element.rPr.rFonts.set(qn('w:eastAsia'), '黑体')
    if size:
        run.font.size = Pt(size)
    elif level == 0:
        run.font.size = Pt(22)
    elif level == 1:
        run.font.size = Pt(16)
    elif level == 2:
        run.font.size = Pt(14)
    else:
        run.font.size = Pt(12)
    run.bold = True
    if color:
        run.font.color.rgb = RGBColor(*color)
    if level == 0:
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(20)
        p.paragraph_format.space_after = Pt(30)
    elif level == 1:
        p.paragraph_format.space_before = Pt(18)
        p.paragraph_format.space_after = Pt(10)
    else:
        p.paragraph_format.space_before = Pt(12)
        p.paragraph_format.space_after = Pt(6)
    return p

def add_para(text, bold=False, indent=True, size=12, align=None):
    """添加正文段落"""
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.font.name = '宋体'
    run.element.rPr.rFonts.set(qn('w:eastAsia'), '宋体')
    run.font.size = Pt(size)
    run.bold = bold
    if indent:
        p.paragraph_format.first_line_indent = Cm(0.74)
    if align:
        p.alignment = align
    p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.ONE_POINT_FIVE
    return p

def add_bullet(text, level=0):
    """添加项目符号段落"""
    p = doc.add_paragraph(style='List Bullet')
    run = p.add_run(text)
    run.font.name = '宋体'
    run.element.rPr.rFonts.set(qn('w:eastAsia'), '宋体')
    run.font.size = Pt(12)
    p.paragraph_format.left_indent = Cm(1.5 + level * 0.75)
    p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.ONE_POINT_FIVE
    return p

def add_table_row(table, row_data, bold=False):
    """给表格添加一行数据"""
    row = table.add_row()
    for i, cell_text in enumerate(row_data):
        cell = row.cells[i]
        p = cell.paragraphs[0]
        run = p.add_run(str(cell_text))
        run.font.name = '宋体'
        run.element.rPr.rFonts.set(qn('w:eastAsia'), '宋体')
        run.font.size = Pt(10.5)
        run.bold = bold
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER

# ============================================================
# 封面
# ============================================================
add_heading('', level=0)  # 空行占位

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = p.add_run('中国国际大学生创新大赛（2026）')
run.font.name = '黑体'
run.element.rPr.rFonts.set(qn('w:eastAsia'), '黑体')
run.font.size = Pt(18)
run.bold = True

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = p.add_run('项目计划书')
run.font.name = '黑体'
run.element.rPr.rFonts.set(qn('w:eastAsia'), '黑体')
run.font.size = Pt(28)
run.bold = True

doc.add_paragraph()
doc.add_paragraph()

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = p.add_run('木雅智语')
run.font.name = '黑体'
run.element.rPr.rFonts.set(qn('w:eastAsia'), '黑体')
run.font.size = Pt(24)
run.bold = True
run.font.color.rgb = RGBColor(0x8B, 0x00, 0x00)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = p.add_run('——基于RAG的木雅语文化传承与智能教学平台')
run.font.name = '楷体'
run.element.rPr.rFonts.set(qn('w:eastAsia'), '楷体')
run.font.size = Pt(15)

doc.add_paragraph()
doc.add_paragraph()
doc.add_paragraph()

# 封面信息表
info_table = doc.add_table(rows=0, cols=2)
info_table.alignment = WD_TABLE_ALIGNMENT.CENTER
info_table.style = 'Table Grid'
cover_info = [
    ('赛道名称', '“青年红色筑梦之旅”赛道 · 公益组'),
    ('项目名称', '木雅智语——基于RAG的木雅语文化传承与智能教学平台'),
    ('项目负责人', '【请填写姓名】'),
    ('所在学院', '【请填写学院】'),
    ('指导教师', '【请填写教师姓名】'),
    ('填报日期', '2026年8月'),
]
for label, value in cover_info:
    row = info_table.add_row()
    cell0 = row.cells[0]
    p0 = cell0.paragraphs[0]
    r0 = p0.add_run(label)
    r0.font.name = '黑体'
    r0.element.rPr.rFonts.set(qn('w:eastAsia'), '黑体')
    r0.font.size = Pt(12)
    r0.bold = True
    p0.alignment = WD_ALIGN_PARAGRAPH.CENTER

    cell1 = row.cells[1]
    p1 = cell1.paragraphs[0]
    r1 = p1.add_run(value)
    r1.font.name = '宋体'
    r1.element.rPr.rFonts.set(qn('w:eastAsia'), '宋体')
    r1.font.size = Pt(12)
    p1.alignment = WD_ALIGN_PARAGRAPH.CENTER

# 设置封面信息表列宽
for row in info_table.rows:
    row.cells[0].width = Cm(4)
    row.cells[1].width = Cm(10)

doc.add_page_break()

# ============================================================
# 目录提示
# ============================================================
add_heading('目  录', level=1)
toc_items = [
    '一、项目概述',
    '二、项目背景与问题分析',
    '三、产品与服务介绍',
    '四、技术方案与创新点',
    '五、目标用户与市场分析',
    '六、竞争分析',
    '七、运营模式与社会效益',
    '八、项目进展与发展规划',
    '九、团队介绍',
    '十、财务预算',
    '十一、风险分析与应对措施',
    '附件：项目概述（简版）',
]
for item in toc_items:
    p = doc.add_paragraph()
    run = p.add_run(item)
    run.font.name = '宋体'
    run.element.rPr.rFonts.set(qn('w:eastAsia'), '宋体')
    run.font.size = Pt(12)
    p.paragraph_format.space_after = Pt(4)

doc.add_page_break()

# ============================================================
# 一、项目概述
# ============================================================
add_heading('一、项目概述', level=1)

add_para(
    '木雅语是四川甘孜藏族自治州木雅藏族使用的独特语言，属藏缅语族，'
    '承载着木雅人千年迁徙、信仰与生活的文化记忆。随着现代化进程加速和'
    '代际传承断裂，木雅语正面临严峻的濒危处境——能流利使用木雅语的长者'
    '逐年减少，年轻一代普遍转向汉语或藏语康巴方言，相关教学资源极度匮乏。'
    '据联合国教科文组织濒危语言统计框架，木雅语已处于"明确濒危"等级。'
)

add_para(
    '本项目"木雅智语"是一套基于检索增强生成（RAG）技术的木雅语文化传承与'
    '智能教学平台，由三个功能互补的AI智能体（木小文·语言学习、木小测·语言测评、'
    '木小知·文化问答）协同构成，辅以数字人交互、3D智慧空间沉浸场景和教师课堂'
    '工具链，形成了"学—练—问—教"完整闭环的木雅语数字化教学生态。平台内置'
    '4,641条五语对照词条（中文/藏文/木雅语/国际音标/英文），覆盖64个主题分类，'
    '采用"三级行政检索"架构（RAGFlow向量检索→本地SQLite词库→可信网页取证），'
    '确保每一句回答都有据可查，从根本上杜绝AI幻觉，让濒危语言教学既智能又可靠。'
)

add_para(
    '项目面向木雅藏族聚居区（四川康定、九龙、雅江等地）的基础教育师生、'
    '民族文化研究者及对藏羌语言文化感兴趣的社会公众，以公益方式降低木雅语'
    '学习门槛，助力中华优秀传统文化的保护与传承，促进民族团结进步，'
    '切实践行"我敢闯，我会创"的大赛主题。'
)

# ============================================================
# 二、项目背景与问题分析
# ============================================================
add_heading('二、项目背景与问题分析', level=1)

add_heading('（一）木雅语濒危现状', level=2)
add_para(
    '木雅语（mGul skad / Mu Er Gue）是藏缅语族中一支独特的语言，使用人口'
    '约1—2万人，主要分布在四川省甘孜藏族自治州康定市折多山以西的木雅地区'
    '（原塔公、新都桥、瓦泽等地）及九龙县、雅江县部分村镇。木雅语与藏语'
    '不通话，保留了古藏语乃至更早期汉藏语系的语言特征，对历史语言学、'
    '民族迁徙史研究具有不可替代的学术价值。'
)
add_para(
    '然而，木雅语目前面临三重困境：（1）代际断层——40岁以下使用者锐减，'
    '儿童在家庭中已少有母语环境；（2）教学资源匮乏——无系统教材、无数字化'
    '工具、无标准化评测体系；（3）社会功能弱化——学校教育、公共事务均以'
    '汉语或藏语为主，木雅语使用场景持续收窄。若不采取有效保护措施，'
    '木雅语可能在两到三代人内走向消亡。'
)

add_heading('（二）政策背景与战略意义', level=2)
add_para(
    '党的二十大报告明确提出"加大国家通用语言文字推广力度，促进少数民族语言'
    '文字保护传承"。《教育强国建设规划纲要（2024—2035年）》强调利用人工智能等'
    '数字技术推动教育变革。本项目将AI技术应用于濒危语言保护，既是落实国家'
    '"人工智能+"行动战略的具体实践，也是推动新文科建设、促进文化自信的'
    '创新探索。'
)

add_heading('（三）现有解决方案的不足', level=2)
add_bullet('传统纸质教材更新周期长、覆盖面窄，难以触达年轻用户群体。')
add_bullet('通用大语言模型（如ChatGPT、文心一言等）对木雅语等小语种几乎无知识储备，'
           '回答充满"幻觉"，无法用于严肃教学。')
add_bullet('已有的少数民族语言APP（如藏语学习类）多聚焦于主流藏语（卫藏/安多/康巴），'
           '木雅语长期处于被忽视的空白地带。')
add_bullet('缺乏将数字人、3D沉浸空间与语言教学结合的创新产品，学习体验单一、'
           '趣味性不足，难以吸引青少年持续学习。')

# ============================================================
# 三、产品与服务介绍
# ============================================================
add_heading('三、产品与服务介绍', level=1)

add_heading('（一）产品定位', level=2)
add_para(
    '"木雅智语"定位为"木雅语文化传承与智能教学公益平台"，以"AI赋能、'
    '证据驱动、沉浸体验"为核心理念，为木雅语学习者、教学者和文化研究者'
    '提供一站式的数字化解决方案。'
)

add_heading('（二）核心功能模块', level=2)

add_heading('1. 三智能体协同教学系统', level=3)
add_para(
    '平台核心由三个功能差异化、能力互补的AI智能体组成：'
)

# 智能体表格
agent_table = doc.add_table(rows=1, cols=4)
agent_table.style = 'Table Grid'
agent_table.alignment = WD_TABLE_ALIGNMENT.CENTER
header_row = agent_table.rows[0]
headers = ['智能体', '功能定位', '核心能力', '技术特点']
for i, h in enumerate(headers):
    cell = header_row.cells[i]
    p = cell.paragraphs[0]
    run = p.add_run(h)
    run.font.name = '黑体'
    run.element.rPr.rFonts.set(qn('w:eastAsia'), '黑体')
    run.font.size = Pt(10.5)
    run.bold = True
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER

agent_data = [
    ('木小文', '木雅语学习智能体', '五语词条查询（中/藏/木雅/音标/英）、整句翻译拆解、'
     '主题学习（学习目标→五语讲解→跟练→自检）', '翻译类查询直接以知识库证据直出，'
     '不经LLM二次改写，temperature=0.2'),
    ('木小测', '木雅语测评智能体', '在线测验（知识库选择题即时判分）、知识问答、'
     '错题解释、个性化复习建议', '从知识库随机抽取词条自动生成选择题与干扰项，'
     'temperature=0.1'),
    ('木小知', '木雅文化知识智能体', '日常交流闲聊、文化事实问答（景点/分布/习俗等）、'
     '语言翻译辅助', '文化问题强制走可信网页（gov.cn/edu.cn/百度百科）取证，'
     '零命中时允许模型兜底但明确标注"此回答基于模型自己的回答"，temperature=0.05'),
]
for row_data in agent_data:
    add_table_row(agent_table, row_data)

doc.add_paragraph()

add_heading('2. 五语对照知识库', level=3)
add_para(
    '平台内置4,641条木雅语词条，覆盖64个主题分类（含日月星辰、亲属称谓、'
    '动植物、身体部位、饮食服饰、建筑宗教、生产生活等），每条均提供'
    '中文、藏文、木雅语、国际音标（IPA）、英文五语对照。知识库以SQLite'
    '格式本地存储，并通过RAGFlow向量化检索实现高精度语义匹配。'
)

add_heading('3. 数字人与3D智慧空间', level=3)
add_para(
    '平台集成Workbrain数字人技术，为每个智能体配备可视化数字人形象'
    '（待机wave动画与说话speak动画自动切换），并通过3D智慧空间'
    '（Metaverse）提供沉浸式学习场景。用户可在3D地图上点击不同数字人'
    '点位进入专属学习空间，体验"所见即所学"的互动式教学。每个点位支持'
    '独立配置背景图、语音角色（男/女/少年）、系统提示词、快捷提问、'
    '知识画廊（图片轮播讲解）和资源文件池。'
)

add_heading('4. 教师课堂工具链', level=3)
add_bullet('课堂随机点名：支持学生名单导入、多轮不重复随机抽取、点名历史记录。')
add_bullet('学习进度追踪：连续打卡天数、每周学习时长、测验正确率、章节进度，数据持久化支持断点续学。')
add_bullet('章节学习导航：64个分类章节可视化管理，支持词条浏览与逐条学习。')
add_bullet('智能测验生成：从知识库自动出题、即时判分、错题解释。')

add_heading('5. 可信网页检索增强', level=3)
add_para(
    '木小知智能体内置可信网页检索模块，通过百度百科开放API与Bing RSS'
    '双通道获取文化知识，限定白名单域名（gov.cn / edu.cn / baike.baidu.com'
    '等），并通过四轮流水线（开放API候选词→site限定搜索→六域OR兜底→'
    '"木雅"换"西番"同义词重试）确保检索结果的相关性与准确性。'
)

# ============================================================
# 四、技术方案与创新点
# ============================================================
add_heading('四、技术方案与创新点', level=1)

add_heading('（一）技术架构', level=2)
add_para(
    '项目采用前后端分离架构。前端使用React 18 + TypeScript + Vite + TDesign'
    '组件库构建，支持SSE流式输出实现实时对话体验。后端使用Node.js + Express'
    '+ TypeScript，通过Python子进程调用SQLite知识库检索。检索层采用RAGFlow'
    'HTTP Retrieval API实现向量检索，生成层调用阿里云百炼DeepSeek-V3大模型'
    '（OpenAI兼容接口）。部署于AutoDL GPU服务器，通过cpolar内网穿透提供公网访问。'
)

add_heading('（二）核心技术创新', level=2)

add_heading('1. 三级行政检索架构', level=3)
add_para(
    '设计"RAGFlow向量检索 → 本地SQLite词库兜底 → 可信网页检索"三级检索'
    '架构，每层均设证据闸门。零命中时智能体直接拒答（木小文/木小测）或'
    '明确标注"模型兜底"（木小知），从根本上杜绝AI幻觉，保障濒危语言教学的'
    '严肃性与可靠性。'
)

add_heading('2. 五语对照输出规范', level=3)
add_para(
    '所有翻译查询强制输出中文/藏文/木雅语/国际音标/英文五列表格。'
    '木小文的翻译类查询直接以知识库证据直出，不经过LLM二次改写，'
    '确保语言数据的原始性与准确性。'
)

add_heading('3. 整句翻译DP拆解算法', level=3)
add_para(
    '针对整句在知识库中无直接命中的问题，设计基于动态规划（DP）的最长匹配'
    '拆解算法：先通过DeepSeek分词，再与知识库中最长词条进行DP匹配，'
    '最后对中/藏文进行二次反查验证，实现整句到词条的精准拆解。'
)

add_heading('4. 数字人+3D空间+智能体三位一体', level=3)
add_para(
    '将Workbrain数字人容器（可视化形象）、3D智慧空间（沉浸场景）与三个'
    '差异化智能体（教学能力）深度融合，形成"形象—场景—能力"三位一体的'
    '沉浸式语言学习体验，突破了传统语言学习APP交互单一的限制。'
)

add_heading('5. 安全可信设计', level=3)
add_bullet('API Key仅存服务器环境变量，配置接口返回脱敏密钥。')
add_bullet('文化事实问答强制引用来源，限定白名单域名。')
add_bullet('知识库数据通过SHA-256哈希校验一致性，检测跨分类同题异答。')
add_bullet('支持会话持久化与断点续学，学习数据本地化存储。')

# ============================================================
# 五、目标用户与市场分析
# ============================================================
add_heading('五、目标用户与市场分析', level=1)

add_heading('（一）目标用户群体', level=2)

user_table = doc.add_table(rows=1, cols=3)
user_table.style = 'Table Grid'
user_table.alignment = WD_TABLE_ALIGNMENT.CENTER
header_row = user_table.rows[0]
headers = ['用户群体', '需求特征', '使用场景']
for i, h in enumerate(headers):
    cell = header_row.cells[i]
    p = cell.paragraphs[0]
    run = p.add_run(h)
    run.font.name = '黑体'
    run.element.rPr.rFonts.set(qn('w:eastAsia'), '黑体')
    run.font.size = Pt(10.5)
    run.bold = True
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER

user_data = [
    ('木雅地区中小学生', '缺乏木雅语系统学习资源，需要趣味化、游戏化的学习方式',
     '课后自学、课堂辅助、文化兴趣拓展'),
    ('中小学教师', '缺少木雅语教学工具和评测手段，需要课堂辅助与点名管理',
     '课堂教学、测验出题、学习进度管理'),
    ('民族文化研究者', '需要系统化的木雅语语料库与五语对照数据',
     '学术研究、田野调查辅助、语料检索'),
    ('藏羌文化爱好者', '对木雅文化好奇，希望以低门槛方式了解木雅语',
     '兴趣学习、文化探索、旅游参考'),
    ('海外木雅裔华人', '希望寻根问祖、学习祖辈语言',
     '远程自学、文化认同构建'),
]
for row_data in user_data:
    add_table_row(user_table, row_data)

doc.add_paragraph()

add_heading('（二）市场规模估算', level=2)
add_para(
    '木雅语使用者约1—2万人，辐射关注群体（研究者、文化爱好者、旅游者等）'
    '可达10万人以上。从更宏观视角看，中国有130余种语言，其中约半数处于'
    '濒危状态，本项目的"AI+濒危语言保护"模式具有高度可复制性，潜在覆盖'
    '人群可达数百万。'
)

add_heading('（三）市场痛点', level=2)
add_bullet('木雅语数字化教学市场几乎为空白，无直接竞品。')
add_bullet('通用AI产品对木雅语零知识储备，无法满足教学需求。')
add_bullet('传统教材更新慢、覆盖窄，青少年触达率低。')
add_bullet('缺乏将AI、数字人、3D技术融合于语言保护的创新方案。')

# ============================================================
# 六、竞争分析
# ============================================================
add_heading('六、竞争分析', level=1)

add_heading('（一）竞争格局', level=2)
add_para(
    '当前市场上尚无直接以木雅语为核心的AI教学产品。间接竞争者可分为以下几类：'
)

comp_table = doc.add_table(rows=1, cols=4)
comp_table.style = 'Table Grid'
comp_table.alignment = WD_TABLE_ALIGNMENT.CENTER
header_row = comp_table.rows[0]
headers = ['竞争者类型', '代表产品', '优势', '不足']
for i, h in enumerate(headers):
    cell = header_row.cells[i]
    p = cell.paragraphs[0]
    run = p.add_run(h)
    run.font.name = '黑体'
    run.element.rPr.rFonts.set(qn('w:eastAsia'), '黑体')
    run.font.size = Pt(10.5)
    run.bold = True
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER

comp_data = [
    ('通用大模型', 'ChatGPT、文心一言、通义千问',
     '覆盖面广、对话能力强', '木雅语零知识储备、幻觉严重、无证据溯源'),
    ('少数民族语言APP', '藏语学习APP、彝语输入法',
     '已有一定用户基础', '聚焦主流藏语/彝语，完全无木雅语内容'),
    ('传统纸质教材', '《木雅语研究》等学术著作',
     '学术性强、数据权威', '受众极窄、无交互、无数字化工具'),
    ('在线教育平台', '学堂在线、中国大学MOOC',
     '平台流量大、课程体系完善', '无木雅语课程、无法定制化教学'),
]
for row_data in comp_data:
    add_table_row(comp_table, row_data)

doc.add_paragraph()

add_heading('（二）核心竞争优势', level=2)
add_bullet('独家知识库：4,641条五语对照木雅语词条，64个分类，目前市面上最大规模的木雅语数字化语料库。')
add_bullet('证据驱动架构：三级行政检索+拒答机制，从根本上杜绝AI幻觉，保障教学可靠性。')
add_bullet('三位一体体验：数字人+3D空间+智能体深度融合，学习体验远超传统APP。')
add_bullet('教师工具链：随机点名、学习追踪、智能测验等课堂工具，直接服务一线教学。')
add_bullet('公益定位：以文化传承为使命，降低学习门槛，契合国家政策导向。')
add_bullet('可复制模式：技术架构可快速迁移至其他濒危语言保护场景。')

# ============================================================
# 七、运营模式与社会效益
# ============================================================
add_heading('七、运营模式与社会效益', level=1)

add_heading('（一）运营模式', level=2)
add_para(
    '本项目定位为公益项目，以"技术公益"为核心运营理念：'
)
add_bullet('对木雅地区学校师生免费开放全部教学功能，降低木雅语学习门槛。')
add_bullet('与当地教育部门、民族文化研究机构合作，持续扩充知识库、优化教学内容。')
add_bullet('招募志愿者参与词条校对、翻译验证，形成"众包+AI"的知识库迭代机制。')
add_bullet('将技术架构开源，赋能其他濒危语言保护项目，扩大社会影响力。')

add_heading('（二）社会效益', level=2)
add_bullet('文化传承：数字化保存木雅语语言资产，为后人留下可学习、可检索的语言档案。')
add_bullet('教育公平：打破地域限制，让偏远地区学生也能享受高质量的木雅语教学资源。')
add_bullet('民族团结：促进各民族语言文化的交流互鉴，铸牢中华民族共同体意识。')
add_bullet('学术支撑：为历史语言学、民族学、人类学研究提供系统化语料数据。')
add_bullet('模式示范：探索"AI+濒危语言保护"的创新路径，为全国130余种濒危语言保护提供可复制方案。')

add_heading('（三）项目愿景', level=2)
add_para(
    '让木雅语不再是博物馆里的标本，而是活在数字世界中的"会说会教"的智慧语言。'
    '我们希望以技术之力，让每一种濒危的声音都能被听见、被学习、被传承，'
    '让中华大地的语言文化多样性在AI时代焕发新的生机。'
)

# ============================================================
# 八、项目进展与发展规划
# ============================================================
add_heading('八、项目进展与发展规划', level=1)

add_heading('（一）已完成工作', level=2)
add_bullet('完成4,641条五语对照木雅语知识库的构建与RAGFlow导入，覆盖64个主题分类。')
add_bullet('开发三个差异化智能体（木小文/木小测/木小知），实现"学—练—问"教学闭环。')
add_bullet('集成Workbrain数字人与3D智慧空间，实现沉浸式交互教学体验。')
add_bullet('完成教师课堂工具链（随机点名、学习追踪、智能测验、章节学习）。')
add_bullet('部署于AutoDL服务器，通过cpolar提供公网访问，已完成端到端功能验证。')
add_bullet('完成百度百科开放API+Bing RSS双通道可信网页检索模块开发与测试。')

add_heading('（二）发展规划', level=2)

plan_table = doc.add_table(rows=1, cols=3)
plan_table.style = 'Table Grid'
plan_table.alignment = WD_TABLE_ALIGNMENT.CENTER
header_row = plan_table.rows[0]
headers = ['阶段', '时间', '目标']
for i, h in enumerate(headers):
    cell = header_row.cells[i]
    p = cell.paragraphs[0]
    run = p.add_run(h)
    run.font.name = '黑体'
    run.element.rPr.rFonts.set(qn('w:eastAsia'), '黑体')
    run.font.size = Pt(10.5)
    run.bold = True
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER

plan_data = [
    ('第一阶段\n（已完成）', '2025.10—2026.8',
     '完成核心功能开发与部署，知识库构建，三智能体上线，3D空间搭建'),
    ('第二阶段', '2026.9—2026.12',
     '木雅地区学校试点（2—3所），收集师生反馈，优化教学内容与交互体验，'
     '扩充词条至6,000条以上'),
    ('第三阶段', '2027.1—2027.6',
     '推广至甘孜州更多学校，开展线上公益课程，建立志愿者众包校对机制，'
     '与高校民族学/语言学学科建立合作'),
    ('第四阶段', '2027.7—2028.6',
     '技术架构开源，赋能其他濒危语言保护项目（如尔龚语、扎坝语等），'
     '构建"AI+濒危语言保护"开源生态'),
]
for row_data in plan_data:
    add_table_row(plan_table, row_data)

doc.add_paragraph()

# ============================================================
# 九、团队介绍
# ============================================================
add_heading('九、团队介绍', level=1)

add_heading('（一）团队负责人', level=2)
add_para('【请填写：姓名、学院、专业、年级、在项目中的主要职责与贡献】')

add_heading('（二）核心成员', level=2)
add_para('【请填写：成员姓名、学院、专业、年级、分工（如前端开发/后端开发/'
         '知识库构建/产品设计/测试运营等）】')

add_heading('（三）指导教师', level=2)
add_para('【请填写：教师姓名、职称、研究方向、对本项目的指导内容】')

add_heading('（四）团队优势', level=2)
add_bullet('跨学科组队：团队成员涵盖计算机科学、民族学、语言学等专业，兼具技术开发与文化研究能力。')
add_bullet('技术扎实：核心成员具备React、Node.js、Python全栈开发能力与AI应用开发经验。')
add_bullet('文化使命：团队成员对木雅文化有深厚感情与深入调研，确保项目内容的文化准确性。')
add_bullet('指导有力：指导教师在相关领域有丰富研究经验，为项目提供学术指导与资源对接。')

# ============================================================
# 十、财务预算
# ============================================================
add_heading('十、财务预算', level=1)

add_para('项目初期以公益运营为主，主要成本为服务器部署与API调用费用：')

budget_table = doc.add_table(rows=1, cols=3)
budget_table.style = 'Table Grid'
budget_table.alignment = WD_TABLE_ALIGNMENT.CENTER
header_row = budget_table.rows[0]
headers = ['项目', '年度预算（元）', '说明']
for i, h in enumerate(headers):
    cell = header_row.cells[i]
    p = cell.paragraphs[0]
    run = p.add_run(h)
    run.font.name = '黑体'
    run.element.rPr.rFonts.set(qn('w:eastAsia'), '黑体')
    run.font.size = Pt(10.5)
    run.bold = True
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER

budget_data = [
    ('GPU服务器（AutoDL）', '3,600', '按月租用，约300元/月'),
    ('大模型API调用（DeepSeek-V3）', '2,000', '按token计费，教学用量估算'),
    ('RAGFlow向量数据库', '1,200', '自建/云服务'),
    ('域名与内网穿透（cpolar）', '600', '公网访问服务'),
    ('内容运营与志愿者补贴', '2,000', '词条校对、翻译验证'),
    ('推广与差旅', '1,600', '学校试点走访'),
    ('合计', '11,000', '—'),
]
for row_data in budget_data:
    add_table_row(budget_table, row_data, bold=(row_data[0] == '合计'))

doc.add_paragraph()
add_para(
    '资金来源：（1）学校创新创业训练计划项目资助；（2）大赛奖金；（3）社会公益基金申请。'
    '项目运营成本较低，随着用户增长可逐步通过公益基金和社会赞助覆盖。'
)

# ============================================================
# 十一、风险分析与应对措施
# ============================================================
add_heading('十一、风险分析与应对措施', level=1)

risk_table = doc.add_table(rows=1, cols=3)
risk_table.style = 'Table Grid'
risk_table.alignment = WD_TABLE_ALIGNMENT.CENTER
header_row = risk_table.rows[0]
headers = ['风险类型', '风险描述', '应对措施']
for i, h in enumerate(headers):
    cell = header_row.cells[i]
    p = cell.paragraphs[0]
    run = p.add_run(h)
    run.font.name = '黑体'
    run.element.rPr.rFonts.set(qn('w:eastAsia'), '黑体')
    run.font.size = Pt(10.5)
    run.bold = True
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER

risk_data = [
    ('数据准确性风险', 'AI模型可能产生幻觉或知识库词条存在错误',
     '三级行政检索+拒答机制杜绝幻觉；建立志愿者众包校对机制；邀请木雅语专家定期审核'),
    ('技术运维风险', '服务器故障或API服务中断影响可用性',
     '本地SQLite词库兜底机制；多模型备选方案；监控告警体系'),
    ('用户接受度风险', '木雅地区师生对AI产品接受度不确定',
     '深入学校调研需求；简化交互设计；提供教师培训支持'),
    ('可持续运营风险', '公益项目长期资金来源不稳定',
     '申请各级公益基金；寻求企业CSR合作；技术开源降低维护成本'),
    ('文化敏感性风险', '语言文化内容可能涉及敏感表述',
     '邀请民族文化专家审核；限定可信信息源；建立内容审核机制'),
]
for row_data in risk_data:
    add_table_row(risk_table, row_data)

doc.add_paragraph()

# ============================================================
# 附件：项目概述（简版，用于报名系统填写）
# ============================================================
doc.add_page_break()
add_heading('附件：项目概述（简版）', level=1)
add_para('（以下内容用于大赛官网报名系统"项目概述"栏填写，100—1000字）', bold=True, indent=False)
doc.add_paragraph()

overview = (
    '木雅智语是一套基于检索增强生成（RAG）技术的木雅语文化传承与智能教学公益平台。'
    '木雅语是四川甘孜藏族自治州木雅藏族使用的独特濒危语言，使用人口约1—2万人，'
    '面临代际断层、教学资源匮乏、社会功能弱化等严峻困境，若不采取有效保护措施，'
    '可能在两到三代人内走向消亡。\n\n'
    '本产品由三个功能互补的AI智能体协同构成：木小文负责木雅语五语对照学习'
    '（中文/藏文/木雅语/国际音标/英文）与整句翻译拆解；木小测负责在线测验、'
    '错题解释与个性化复习建议；木小知负责木雅文化知识问答与日常交流，'
    '通过百度百科开放API与Bing RSS双通道可信网页检索确保文化知识准确有据。'
    '平台辅以Workbrain数字人交互、3D智慧空间沉浸场景和教师课堂工具链'
    '（随机点名、学习追踪、智能测验），形成"学—练—问—教"完整教学闭环。\n\n'
    '平台内置4,641条五语对照词条，覆盖64个主题分类，采用"三级行政检索"架构'
    '（RAGFlow向量检索→本地SQLite词库→可信网页取证），每层均设证据闸门，'
    '零命中时拒答而非编造，从根本上杜绝AI幻觉，保障濒危语言教学的严肃性。\n\n'
    '项目面向木雅藏族聚居区基础教育师生、民族文化研究者及社会公众，以公益方式'
    '降低木雅语学习门槛。核心竞争优势在于：独家大规模木雅语数字化语料库、'
    '证据驱动的可信架构、数字人+3D空间+智能体三位一体沉浸体验，以及可直接服务'
    '一线教学的课堂工具链。技术架构具有高度可复制性，可快速迁移至其他濒危语言'
    '保护场景。\n\n'
    '项目愿景是让木雅语不再是博物馆里的标本，而是活在数字世界中"会说会教"的'
    '智慧语言，以技术之力让每一种濒危的声音都能被听见、被学习、被传承，'
    '让中华大地的语言文化多样性在AI时代焕发新的生机。'
)

for para_text in overview.split('\n\n'):
    if para_text.strip():
        add_para(para_text.strip())

# 统计字数
char_count = len(overview.replace('\n', '').replace(' ', ''))
p = doc.add_paragraph()
run = p.add_run(f'\n（字数：{char_count}字）')
run.font.name = '楷体'
run.element.rPr.rFonts.set(qn('w:eastAsia'), '楷体')
run.font.size = Pt(10.5)
run.font.color.rgb = RGBColor(0x80, 0x80, 0x80)
p.alignment = WD_ALIGN_PARAGRAPH.RIGHT

# ============================================================
# 保存
# ============================================================
output_path = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    '木雅智语-项目计划书.docx'
)
doc.save(output_path)
print(f'已生成：{output_path}')
print(f'项目概述简版字数：{char_count}字')
