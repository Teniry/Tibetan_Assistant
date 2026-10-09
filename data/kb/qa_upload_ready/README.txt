这里是上传到 RAGFlow 的 64 个木雅语 Q&A xlsx 文件。
文件名采用纯 ASCII 编号（QA_001.xlsx ~ QA_064.xlsx），避免跨平台传输时
中文文件名被错误解读为乱码。

对应关系见 filename_mapping.txt。

上传建议：
  1. 把整个 qa_upload_ready/ 目录压缩成一个 zip 传到 AutoDL
  2. 在 AutoDL 解压后，直接把 64 个 .xlsx 全选拖进 RAGFlow Web UI
  3. RAGFlow 会按 Question / Answer 两列解析，文档名就是 QA_001 等
