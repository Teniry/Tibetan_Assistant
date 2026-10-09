// 跳转页面：根据点位 ID 拉取对应 portal 配置
import { Router } from 'express';
import { readConfig } from './config.js';

const router = Router();

// GET /api/portal/:id — 获取某点位的 portal 配置
router.get('/:id', (req, res) => {
  const cfg = readConfig();
  const pt = (cfg.points || []).find((p) => p.id === req.params.id);
  if (!pt) {
    res.status(404).json({ error: 'point not found', id: req.params.id });
    return;
  }
  res.json({
    point: pt,
    // 用户页面只需要默认背景；RAGFlow/DeepSeek/Tavily 密钥绝不能发到浏览器。
    defaultPortalBg: cfg.defaultPortalBg,
  });
});

// GET /api/portal — 全部点位列表（公开，简化字段）
router.get('/', (_req, res) => {
  const cfg = readConfig();
  res.json({
    points: (cfg.points || []).map((p) => ({
      id: p.id,
      name: p.name,
      gifUrl: p.gifUrl,
      waveGifUrl: p.waveGifUrl,
      pageTitle: p.pageTitle,
      enabled: p.enabled !== false,
      homePosition: p.homePosition,
      label: p.label,
      order: p.order,
      size: p.size,
      // 主页标签相关字段（用于主页数字人底部"名字框 + 副标题小字"渲染）
      subtitle: p.subtitle,
      homeLabelPosition: p.homeLabelPosition,
      homeLabelStyle: p.homeLabelStyle,
      labelOffsetY: p.labelOffsetY,
      labelOffsetX: p.labelOffsetX,
      showName: p.showName,
      showSubtitle: p.showSubtitle,
      showTopBar: p.showTopBar,
      showTopBarTools: p.showTopBarTools,
    })),
    homeBg: cfg.homeBg,
    homeTitle: cfg.homeTitle,
    homeSubtitle: cfg.homeSubtitle,
  });
});

export default router;
