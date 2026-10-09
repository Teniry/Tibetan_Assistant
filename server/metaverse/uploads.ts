// 文件上传：接受背景图 / 数字人 GIF / 空间资源（PDF/Word/视频），自动分类保存
// 图片上传后自动转换为 WebP（GIF 保留动画），若转换后更小则替换原文件
import { Router } from 'express';
import multer from 'multer';
import { join, extname, basename, dirname } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { writeFile, unlink, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const UPLOAD_DIR = join(__dirname, '..', '..', 'data', 'uploads');
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

// 需要转 WebP 的 MIME（webp 本身不再重复压缩）
const CONVERTIBLE_MIME = /^image\/(png|jpe?g|bmp|gif)$/i;

function subDir(sub: string) {
  return join(UPLOAD_DIR, sub.replace(/[^a-z0-9_-]/gi, '_'));
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const sub = (req.query.sub as string) || 'misc';
    const dir = subDir(sub);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    const ext = extname(file.originalname).toLowerCase() || '.bin';
    cb(null, `${ts}_${rand}${ext}`);
  },
});

// 允许的 MIME 类型
const ALLOWED_MIME = /image\/(jpeg|png|gif|webp|jpg|bmp)|application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|video\/(mp4|webm|ogg|quicktime)|audio\/(mpeg|mp3|wav|ogg)/i;

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB（支持大视频）
  // multer 1.x 不透传 defParamCharset 给 busboy，导致中文文件名 latin1 解码乱码。
  // 修复方式：直接给 node_modules/multer/lib/make-middleware.js 的 Busboy 调用加上
  //   defParamCharset: 'utf8'
  // 见 README/HACKS 备注。
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.test(file.mimetype)) cb(null, true);
    else cb(new Error('unsupported mime: ' + file.mimetype));
  },
});

interface ConvertResult {
  filename: string; // 转换后的文件名（.webp）
  size: number;
}

/**
 * 用 sharp 把已落盘的图片转换为 WebP。
 * - GIF 使用 animated: true 保留动画
 * - 只有转换结果比原文件更小时才替换，否则返回 null（保留原文件）
 * - sharp 不可用（未安装）或转换失败时返回 null，上传流程不受影响
 */
async function convertToWebp(filePath: string, mime: string): Promise<ConvertResult | null> {
  if (!CONVERTIBLE_MIME.test(mime)) return null;
  let sharp: any;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    return null; // sharp 未安装，保留原文件
  }
  try {
    const animated = /gif/i.test(mime);
    const buf = await sharp(filePath, { animated })
      .webp({ quality: animated ? 80 : 82 })
      .toBuffer();
    const origStat = await stat(filePath);
    if (!buf.length || buf.length >= origStat.size) return null;
    const webpPath = filePath.replace(/\.[^.]+$/, '') + '.webp';
    await writeFile(webpPath, buf);
    // 删除原始大文件（尽力而为：个别环境可能拦截删除，失败仅多占磁盘，不影响结果）
    try {
      await unlink(filePath);
    } catch {
      /* ignore */
    }
    return { filename: basename(webpPath), size: buf.length };
  } catch (e: any) {
    // 记录转换失败原因，便于排查（不影响上传主流程）
    try {
      const { appendFileSync } = await import('node:fs');
      appendFileSync(join(UPLOAD_DIR, '.convert-error.log'), `[${new Date().toISOString()}] ${filePath}: ${e?.message || e}\n`);
    } catch { /* ignore */ }
    return null; // 转换失败（如损坏的 GIF），保留原文件
  }
}

const router = Router();

// POST /api/uploads?sub=bg|gif&name=xxx
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'no file' });
    return;
  }
  const sub = (req.query.sub as string) || 'misc';
  const originalSize = req.file.size;
  let filename = req.file.filename;
  let size = req.file.size;
  let mime = req.file.mimetype;
  let converted = false;

  // 图片自动转 WebP（更小才替换）
  const conv = await convertToWebp(join(subDir(sub), req.file.filename), req.file.mimetype);
  if (conv) {
    filename = conv.filename;
    size = conv.size;
    mime = 'image/webp';
    converted = true;
  }

  res.json({
    ok: true,
    url: `/uploads/${sub}/${filename}`,
    filename,
    original: req.file.originalname,
    size,
    mime,
    converted,
    originalSize,
  });
});

// POST /api/uploads/multiple?sub=xxx — 批量上传
router.post('/multiple', upload.array('files', 20), async (req, res) => {
  const files = (req.files as Express.Multer.File[]) || [];
  const sub = (req.query.sub as string) || 'misc';
  const dir = subDir(sub);
  const results = [];
  for (const f of files) {
    let filename = f.filename;
    let size = f.size;
    let mime = f.mimetype;
    const conv = await convertToWebp(join(dir, f.filename), f.mimetype);
    if (conv) {
      filename = conv.filename;
      size = conv.size;
      mime = 'image/webp';
    }
    results.push({
      url: `/uploads/${sub}/${filename}`,
      filename,
      original: f.originalname,
      size,
      mime,
      converted: Boolean(conv),
      originalSize: f.size,
    });
  }
  res.json({ ok: true, files: results });
});

export default router;
