# 🏔️ 藏语AI助手 (Tibetan AI Assistant)

本项目是一个基于 **RAGFlow** 与 **DeepSeek-V3** 构建的低资源民族语言（木雅藏语方言）AI 问答系统。通过创新的“表格转问答（Table-to-Q&A）”数据重塑技术与通用大模型的语义融合，实现了中文、藏语、木雅语、英文及国际音标的“五位一体”精准检索引擎。

## 🌟 核心特性
* **低资源 RAG 优化**：首创方言词典 Table-to-Q&A 数据清洗链路，大幅提升小语种向量检索命中率。
* **多维语言交互**：支持中、英、藏、木雅语多向精准查询及语法智能拆解。
* **极低部署成本**：深度优化模型调度，支持在单卡入门级 GPU（如 16GB 显存）稳定运行。
* **幻觉阻断机制**：严格的 Prompt 引擎与知识库检索策略，有效遏制大模型在濒危语言上的“胡编乱造”。

---

## 🛠️ 环境准备与前期工作

1.  **云端算力部署**（推荐使用 AutoDL）：
    * 在 AutoDL 算力市场租赁带 GPU 的实例（推荐镜像：预装 RAGFlow 的自定义镜像）。
    * 若为本地部署，请确保已安装 Python 3.10+ 及 Docker 环境。
2.  **本地文件夹准备**：在项目根目录下新建以下文件夹：
    * `chapters_pdf/`：用于存放需要 OCR 识别的《木雅藏语方言词汇》PDF 扫描件。
    * `output_csv/`：用于存放第一次提取出的扁平 Table 格式 CSV 文件。
    * `qa_processed_csv/`：用于存放最终转换为 Q&A 格式的 CSV 文件（脚本会自动创建）。

---

## 🚀 快速启动与操作指南

### 第一步：文档数字化与文本提取 (OCR)
本项目使用阿里云大模型 `qwen3.6-plus` 进行高精度的多语种图文识别。

1.  打开 `dynamic_data_process.py` 文件。
2.  修改文件中的环境参数为您自己的实际配置：
    ```python
    PDF_FOLDER = "chapters_pdf"      # 输入 PDF 文件夹路径
    OUTPUT_FOLDER = "output_csv"     # 输出扁平 CSV 的存放路径
    API_KEY = "sk-xxxxxxxxxxxxxx"    # 替换为您的阿里云 DashScope API-KEY
    BASE_URL = "[https://dashscope.aliyuncs.com/compatible-mode/v1](https://dashscope.aliyuncs.com/compatible-mode/v1)"
    MODEL_NAME = "qwen3.6-plus"      
    ```
3.  运行脚本：`python dynamic_data_process.py`
  
    *(注：脚本内置了严格的 Prompt，提取规则：
    1. 严格将每一行的词汇提取为五列数据，每列之间使用 '|' 分隔。
    2. 列的顺序必须严格是：藏语 | 木雅语 | 音标 | 中文 | 英文
    3. 所有的脚注符号（如①、②等）直接保留在文本中，绝对不要换行。
    4. 如果原文某一列是空的或者横线，请写“无”。
    5. 不要输出表头，不要输出页码、章节标题，只输出纯粹的数据行。
    6. 每条词汇占一行，严禁在同一条词汇内部换行。
    7. 若出现不认识，识别不出来的字符，绝不允许根据你的知识进行猜测、纠错、脑补或替换！图片里画的是什么字符，你就临摹和提取图片中实际长相的字符。)*

### 第二步：启动 RAGFlow 并创建知识库
1.  在服务器终端启动 RAGFlow 服务：
    ```bash
    bash /root/start.sh
    ```
2.  通过浏览器访问服务地址并登录。
3.  **建立知识库**：
    * 点击“创建知识库”，名称填写：**`Tibetan`**。
    * 核心配置：**嵌入模型** 选择 `BAAI/bge-base-en-v1.5`，**切片方法** 选择 `Q&A`。

### 第三步：数据重塑与自动上传解析
此步骤将扁平表格转换为高语境的问答格式，并利用 API 自动上传至刚才创建的 RAGFlow 知识库中。

1.  打开 `QA_upload.py` 文件，修改以下参数：
    ```python
    API_KEY = "ragflow-xxxxxxxx" # 替换为您的 RAGFlow API Key (在 RAGFlow 个人设置页获取)
    BASE_URL = "[http://127.0.0.1:9380](http://127.0.0.1:9380)" # RAGFlow 服务的本地或公网地址

    OUTPUT_DIR = "output_csv"         # 原始 CSV 文件夹
    QA_DIR = "qa_processed_csv"       # 转换后 Q&A 格式的临时存储文件夹
    DATASET_NAME = "Tibetan"          # 对应的知识库名称
    ```
2.  运行脚本：`python QA_upload.py`。等待终端提示所有文件上传并解析完成。

### 第四步：配置 AI 助理 (Agent)
1.  进入 RAGFlow 后台，点击顶部导航栏的 **“聊天”** -> **“新建助理”**。
2.  **基础设置**：为助理命名（如：木雅藏语助手），并绑定刚才创建的 `Tibetan` 知识库。
3.  **模型设置**：对话模型选择 `deepseek-v3`（需提前在“模型提供商”处配置好对应的 API Key）。
4.  **提示引擎核心参数配置**：
    * **相似度阈值**：`0.05`
    * **关键字权重**：`0.7`
    * **Top-N**：`30`
    * **Rerank 模型**：选择 `gte-rerank`（若显存/条件允许，强烈推荐使用 `BAAI/bge-reranker-v2-m3`）。
保存配置后，即可在聊天界面与藏语 AI 助手进行交互！

---

## 🌐 进阶：公网访问 (Cpolar 内网穿透)
如果您希望将部署在本地或局域网服务器上的助手开放给其他人使用，可通过 Cpolar 实现外网访问。

1.  注册 [Cpolar](https://www.cpolar.com/) 账号并获取专属 `Authtoken`。
2.  在终端执行安装与认证：
    ```bash
    curl -L [https://www.cpolar.com/static/downloads/install-release-cpolar.sh](https://www.cpolar.com/static/downloads/install-release-cpolar.sh) | sudo bash
    ./cpolar authtoken 您的专属Authtoken
    ```
3.  穿透 RAGFlow 默认端口：
    ```bash
    cpolar http 6006 # 假设您的 RAGFlow web 服务运行在 6006 端口
    ```
4.  终端将输出带有 `https://`或者 `http://`的 Forwarding 公网链接，即可分享给外部用户访问。
