import fitz  # PyMuPDF
import base64
import os
import glob
import csv
from openai import OpenAI

# ==========================================
# Configuration Section (配置区)
# ==========================================
PDF_FOLDER = "chapters_pdf"      # 输入 PDF 文件夹
OUTPUT_FOLDER = "output_csv"    # 输出 CSV 的存放文件夹
API_KEY = "sk-a3c5b5c61fd54e87ab6ae9452cbb6356"    #阿里云调用模型的API-KEY
BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
MODEL_NAME = "qwen3.6-plus"       

client = OpenAI(api_key=API_KEY, base_url=BASE_URL)

# 确保输出文件夹存在
if not os.path.exists(OUTPUT_FOLDER):
    os.makedirs(OUTPUT_FOLDER)

def encode_image_to_base64(pixmap):
    """将 PDF 页面转换为 Base64 编码的图片"""
    img_data = pixmap.tobytes("png")
    return base64.b64encode(img_data).decode('utf-8')

def extract_page_data(base64_image):
    """调用视觉大模型提取多列结构化数据"""
    prompt = """
    你是一个精通藏文、木雅语方言的数据提取专家。请识别这张《木雅藏语方言词汇》扫描件中的词汇表内容。
    
    【绝对不可违反的铁律】：
    提取规则：
    1. 严格将每一行的词汇提取为五列数据，每列之间使用 '|' 分隔。
    2. 列的顺序必须严格是：藏语 | 木雅语 | 音标 | 中文 | 英文
    3. 所有的脚注符号（如①、②等）直接保留在文本中，绝对不要换行。
    4. 如果原文某一列是空的或者横线，请写“无”。
    5. 不要输出表头，不要输出页码、章节标题，只输出纯粹的数据行。
    6. 每条词汇占一行，严禁在同一条词汇内部换行。
    7. 若出现不认识，识别不出来的字符，绝不允许根据你的知识进行猜测、纠错、脑补或替换！图片里画的是什么字符，你就临摹和提取图片中实际长相的字符。
    """
    
    try:
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{base64_image}"}}
                    ]
                }
            ],
            temperature=0.0  
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"提取当前页失败 (Extraction failed): {e}")
        return ""

def process_all_chapters():
    """主函数：遍历 PDF，为每个 PDF 生成同名的 CSV"""
    pdf_files = glob.glob(os.path.join(PDF_FOLDER, "*.pdf"))
    if not pdf_files:
        print(f"Error: 文件夹 '{PDF_FOLDER}' 中没有找到 PDF 文件！")
        return

    headers = ["章节分类", "藏语", "木雅语", "音标", "中文", "英文"]

    for pdf_path in sorted(pdf_files):
        # 1. 获取文件名（不含扩展名）作为输出文件名
        base_name_with_ext = os.path.basename(pdf_path)
        base_name = os.path.splitext(base_name_with_ext)[0]
        output_csv_path = os.path.join(OUTPUT_FOLDER, f"{base_name}.csv")
        
        # 提取用于列展示的章节名
        clean_chapter_name = base_name.split('_')[-1] if '_' in base_name else base_name
        
        print(f"\n=====================================")
        print(f"🚀 开始处理: 【{base_name_with_ext}】")
        print(f"📍 输出目标: 【{output_csv_path}】")
        print(f"=====================================")
        
        current_pdf_rows = [headers] # 每个 CSV 独立拥有表头
        doc = fitz.open(pdf_path)
        
        for page_num in range(len(doc)):
            print(f"  -> {base_name}: 正在处理第 {page_num + 1}/{len(doc)} 页...")
            page = doc[page_num]
            
            # 提高清晰度进行渲染
            zoom_matrix = fitz.Matrix(2.0, 2.0) 
            pix = page.get_pixmap(matrix=zoom_matrix)
            base64_image = encode_image_to_base64(pix)
            
            page_text = extract_page_data(base64_image)
            if not page_text:
                continue
            
            for line in page_text.split('\n'):
                line = line.strip()
                if not line or '---' in line or '藏语' in line or 'Tibetan' in line:
                    continue
                
                clean_line = line.strip('|').strip()
                if clean_line.count('|') >= 4:
                    columns = [col.strip() for col in clean_line.split('|')]
                    if len(columns) >= 5:
                        row_data = [
                            clean_chapter_name, 
                            columns[0], 
                            columns[1], 
                            columns[2], 
                            columns[3], 
                            columns[4]
                        ]
                        current_pdf_rows.append(row_data)

        # 2. 当前 PDF 处理完后，立即保存对应的 CSV
        if len(current_pdf_rows) > 1:
            with open(output_csv_path, 'w', encoding='utf-8-sig', newline='') as f:
                writer = csv.writer(f)
                writer.writerows(current_pdf_rows)
            print(f"✅ 已完成并保存: {output_csv_path} (共 {len(current_pdf_rows)-1} 条)")
        else:
            print(f"⚠️ 警告: {base_name} 未能提取到任何有效数据。")

    print(f"\n🎉 所有 PDF 已处理完毕！请在目录 【{OUTPUT_FOLDER}】 中查看结果。")

if __name__ == "__main__":
    process_all_chapters()