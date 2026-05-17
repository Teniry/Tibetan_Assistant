from ragflow_sdk import RAGFlow
import os
import time
import csv

# ==========================================
# 配置区
# ==========================================
API_KEY = "ragflow-I2NTU4MDlhNDU0MTExZjE5YTBmMDI0Mm"
BASE_URL = "http://127.0.0.1:9380"

# 你的 原始 CSV 文件夹
OUTPUT_DIR = "output_csv"
# 转换后 Q&A 格式的临时存储文件夹（代码会自动创建）
QA_DIR = "qa_processed_csv"

# 知识库名称
DATASET_NAME = "Tibetan"

# ==========================================
# 核心预处理：将扁平表格转换为 Q&A 格式 (防截断版)
# ==========================================
def convert_to_qa_csv(input_path, output_path):
    """将6列表格重组为精准匹配的 Q&A 两列结构"""
    import csv # 确保引入了 csv 模块
    with open(input_path, 'r', encoding='utf-8-sig') as f_in, \
         open(output_path, 'w', encoding='utf-8', newline='') as f_out:
        
        reader = csv.DictReader(f_in)
        writer = csv.writer(f_out)
        
        # 写入标准 Q&A 表头
        writer.writerow(['Question', 'Answer'])
        
        for row in reader:
            zh = row.get('中文', '').strip()
            en = row.get('英文', '').strip()
            bo = row.get('藏语', '').strip()
            mu = row.get('木雅语', '').strip()
            ph = row.get('音标', '').strip()
            cat = row.get('章节分类', '').strip()
            
            if not zh and not bo:
                continue

            # 组装 Question (全维度检索键，保持不变)
            question = f"中文：{zh} | 藏文：{bo} | 木雅语：{mu} | 英文：{en} | 音标：{ph}"
            
            answer = f"中文：{zh}；藏语：{bo}；木雅语：{mu}；音标：{ph}；英文：{en}；章节分类：{cat}"
            
            writer.writerow([question, answer])
# ==========================================
# 主函数
# ==========================================
def upload_all_csv():
    print("🔄 正在连接 RAGFlow...")
    rag = RAGFlow(api_key=API_KEY, base_url=BASE_URL)

    # 获取/创建知识库
    print(f"🔍 检查知识库: {DATASET_NAME}")
    datasets = rag.list_datasets(name=DATASET_NAME)
    if datasets:
        ds = datasets[0]
        print(f"✅ 已存在知识库: {ds.name}")
    else:
        ds = rag.create_dataset(name=DATASET_NAME)
        print(f"✅ 新建知识库成功: {ds.name}")

    # 获取已上传文档
    existing_docs = ds.list_documents()
    uploaded_names = {doc.name for doc in existing_docs}

    # 检查输入文件夹并创建输出文件夹
    if not os.path.exists(OUTPUT_DIR):
        print(f"❌ 文件夹不存在: {OUTPUT_DIR}")
        return
    if not os.path.exists(QA_DIR):
        os.makedirs(QA_DIR)

    csv_files = [f for f in os.listdir(OUTPUT_DIR) if f.lower().endswith(".csv")]
    if not csv_files:
        print("❌ 没有找到 CSV 文件")
        return

    print(f"📁 找到 {len(csv_files)} 个 CSV 文件，准备转换为 Q&A 模式...")

    # 开始处理与上传
    for filename in csv_files:
        original_path = os.path.join(OUTPUT_DIR, filename)
        
        # 为了区分，我们在上传的文件名上加个标识
        qa_filename = f"QA_{filename}"
        qa_path = os.path.join(QA_DIR, qa_filename)

        print("\n" + "=" * 50)
        print(f"📤 正在处理: {filename}")

        if qa_filename in uploaded_names:
            print("⏭️ 已上传过此文件的 Q&A 版本，跳过")
            continue

        try:
            # 1. 本地重组数据为 Q&A 格式
            convert_to_qa_csv(original_path, qa_path)
            print("✅ 格式重组完成，转化为 Q&A 结构")

            # 2. 读取转换后的文件
            with open(qa_path, "rb") as f:
                file_blob = f.read()

            document_list = [{
                "display_name": qa_filename,
                "blob": file_blob
            }]

            # 3. 上传文件
            documents = ds.upload_documents(document_list)
            if not documents:
                print("❌ 上传失败")
                continue

            target_doc = documents[0]
            print(f"✅ 上传成功，文档ID: {target_doc.id}")

            # 4. 修改解析器为 QA 模式 (关键！)
            print("⚙️ 设置解析模式为: QA (问答)")
            target_doc.update({"parser_id": "qa"})

            # 5. 开始解析
            print("🚀 开始解析")
            ds.async_parse_documents([target_doc.id])

            # 6. 轮询状态
            while True:
                doc_status = ds.list_documents(id=target_doc.id)[0]
                progress = getattr(doc_status, 'progress', 0.0) * 100
                run_state = str(getattr(doc_status, 'run', '0'))

                print(f"   -> 进度: {progress:.1f}%")

                if run_state == "3" or run_state.upper() == "DONE" or progress >= 100:
                    print("🎉 解析完成")
                    break
                elif run_state == "4" or run_state.upper() == "FAIL":
                    print("❌ 解析失败")
                    break
                time.sleep(3)

        except Exception as e:
            print(f"❌ 文件处理失败: {e}")

    print("\n🎉 全部文件处理完成！您的知识库已升级为精准的 Q&A 检索模式！")

if __name__ == "__main__":
    try:
        upload_all_csv()
    except Exception as e:
        print(f"\n❌ 程序异常: {e}")