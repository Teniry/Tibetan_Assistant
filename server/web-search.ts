import { readConfig as readMetaverseConfig } from './metaverse/config.js';

export interface TrustedWebResult {
  id: string;
  title: string;
  url: string;
  content: string;
  score: number;
  domain: string;
}

const DEFAULT_TRUSTED_DOMAINS = [
  'gov.cn',
  'baike.baidu.com',
  'bkso.baidu.com',
  'edu.cn',
  'cas.cn',
  'gzz.gov.cn',
  'kangding.gov.cn',
];

function normalizeDomains(values: unknown): string[] {
  const items = Array.isArray(values) ? values : [];
  const domains = items
    .map((value) => String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
    .filter(Boolean);
  const normalized = domains.length > 0 ? [...new Set(domains)] : [...DEFAULT_TRUSTED_DOMAINS];
  // 百度百科的新检索结果有时使用 bkso.baidu.com 承载实际词条页。
  // 用户配置允许 baike.baidu.com 时同步允许该百度官方词条域名。
  if (normalized.includes('baike.baidu.com') && !normalized.includes('bkso.baidu.com')) {
    normalized.push('bkso.baidu.com');
  }
  return normalized;
}

function runtimeConfig() {
  const saved = readMetaverseConfig().webSearch || {};
  return {
    enabled: process.env.TAVILY_API_KEY ? true : saved.enabled === true,
    provider: 'tavily' as const,
    apiKey: String(process.env.TAVILY_API_KEY || saved.apiKey || '').trim(),
    trustedDomains: normalizeDomains(saved.trustedDomains),
    maxResults: Math.min(10, Math.max(1, Number(saved.maxResults) || 5)),
  };
}

function trustedHost(url: string, trustedDomains: string[]): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return trustedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`)) ? host : null;
  } catch {
    return null;
  }
}

function requiredTopicTerms(question: string): Array<{ primary: string; alts: string[] }> {
  // 每组为主题词 + 同义词族，只要标题/摘要命中任一同义词即视为相关。
  // 木雅属于较小众的民族/语言，百度百科的"西番""木雅藏族"等词条并不一定在标题里出现"木雅"，
  // 因此放宽为同义词族匹配。
  const knownTopics: Array<{ primary: string; alts: string[] }> = [
    { primary: '木雅', alts: ['西番', '木雅藏族', '木雅人', '木雅语', '木雅地区'] },
    // 复合实体必须同时命中主体和对象。例如“木雅古碉堡”不能只凭“木雅/西番”放行。
    { primary: '古碉堡', alts: ['古碉', '碉堡', '碉楼', '经堂碉', '高碉', '碉房'] },
    { primary: '圣山', alts: ['神山', '雪山', '贡嘎山', '木雅贡嘎', '贡嘎'] },
    { primary: '金塔', alts: ['木雅金塔', '木雅尊胜塔', '尊胜塔', '佛塔'] },
    { primary: '藏族', alts: ['藏民', '藏区'] },
    { primary: '藏语', alts: ['藏文'] },
    { primary: '康定', alts: ['甘孜', '折多山', '雅拉', '新都桥'] },
    { primary: '九龙', alts: ['甘孜'] },
    { primary: '雅江', alts: ['甘孜'] },
    { primary: '甘孜', alts: ['康巴'] },
    { primary: '羌族', alts: ['羌'] },
    { primary: '彝族', alts: ['彝'] },
    { primary: '苗族', alts: ['苗'] },
    { primary: '瑶族', alts: ['瑶'] },
    { primary: '侗族', alts: ['侗'] },
    { primary: '壮族', alts: ['壮'] },
    { primary: '蒙古族', alts: ['蒙古'] },
    { primary: '维吾尔族', alts: ['维吾尔'] },
  ];
  return knownTopics.filter(group =>
    [group.primary, ...group.alts].some((term) => question.includes(term)),
  );
}

function topicGroupsMatch(searchable: string, groups: Array<{ primary: string; alts: string[] }>): boolean {
  if (groups.length === 0) return true;
  // 每一个从问题中识别出的主题词组都必须命中；组内允许同义词。
  // 这能阻止“木雅古碉堡”退化为只介绍“木雅/弭药”的邻近主题回答。
  return groups.every((group) =>
    [group.primary, ...group.alts].some((term) => searchable.includes(term)),
  );
}

function webResultMatchesQuestion(result: TrustedWebResult, question: string): boolean {
  const searchable = `${result.title}\n${result.content}`.replace(/\s+/g, '');
  const groups = requiredTopicTerms(question);
  // 无主题词约束时不做相关性过滤（兜底通用问题）。
  if (groups.length === 0) return true;
  // 任何来源都必须命中问题里的全部主题词组；不能因为是百度百科/政府网就放行，
  // 否则会把"介绍"、"运城"等完全不沾边的词条当成证据返回。
  if (!topicGroupsMatch(searchable, groups)) return false;
  if (/(?:景点|景区|旅游|游玩|风景|名胜)/.test(question)) {
    return /(?:景点|景区|旅游|风景|名胜|景观|寺|塔|公园|古镇|村寨|雪山|草原|湖)/.test(searchable);
  }
  return true;
}

function optimizedSearchQuestion(question: string): string {
  const groups = requiredTopicTerms(question);
  // 不再对主题词加引号——Bing RSS 对带引号的 query 不稳定（拆词返回"木"字等单字结果），
  // 改为让 Bing 自由匹配，事后用 webResultMatchesQuestion 做强过滤。
  const expandedTopics = groups.flatMap((group) => {
    // 具体对象在权威资料中常使用不同称呼：古碉堡→经堂碉/碉楼，圣山→木雅贡嘎。
    // 搜索时展开，结果阶段仍要求主体和对象两个词组同时命中。
    if (group.primary === '古碉堡' || group.primary === '圣山' || group.primary === '金塔') {
      return [group.primary, ...group.alts];
    }
    return [group.primary];
  }).join(' ');
  const cleanedQuestion = String(question || '')
    .replace(/^(?:请)?(?:介绍|讲解|说说|说一下|讲讲|简述|描述|帮我|帮我了解|想了解|我想知道|请问)(?:一下?|一[下个])?/gi, '')
    .replace(/^(?:关于|有关|针对)/, '')
    .replace(/^什么是|是怎么|是怎样/gi, '')
    .trim();
  if (/(?:景点|景区|旅游|游玩|风景|名胜)/.test(question)) {
    return `${expandedTopics || cleanedQuestion || question} 景点 景区 旅游 文化地标`;
  }
  if (/(?:分布|地区|哪里|聚居|居住)/.test(question)) {
    return `${expandedTopics || cleanedQuestion || question} 分布 地区 聚居 民族`;
  }
  if (/(?:习俗|节日|宗教|信仰|文化)/.test(question)) {
    return `${expandedTopics || cleanedQuestion || question} 文化 习俗 民族`;
  }
  if (/(?:金塔|佛塔|寺庙|寺院|佛像|坛城|经幡|玛尼堆|白塔|法器|转经|唐卡|活佛|喇嘛|僧人)/i.test(question)) {
    return `${expandedTopics || cleanedQuestion || question} 藏传佛教 金塔 佛塔 寺庙`;
  }
  return `${expandedTopics ? `${expandedTopics} ` : ''}${cleanedQuestion || question}`.trim();
}

// 尽可能从自然问法中还原出用户真正要查的实体词。
// 例如：“介绍下木雅语”→“木雅语”，“木雅金塔又是什么”→“木雅金塔”。
function exactEntityFromQuestion(question: string): string {
  return String(question || '')
    .trim()
    .replace(/^(?:(?:请|麻烦|可以|能否|能不能)?(?:帮我|给我)?)(?:介绍(?:一下|下)?|讲解(?:一下|下)?|说说|说一下|讲讲|简述|描述|了解(?:一下|下)?|我想知道|想了解|请问)/i, '')
    .replace(/^(?:关于|有关|针对)/, '')
    .replace(/^(?:什么是|何为)/i, '')
    .replace(/(?:又)?(?:是什么|是啥|指什么|什么意思|怎么回事|怎么样)(?:呢|呀|啊)?$/i, '')
    .replace(/(?:的)?(?:详细)?介绍$/i, '')
    .replace(/[\s“”"'「」『』《》【】（）()？?。，、,.！!：:；;]/g, '')
    .trim();
}

export function getWebSearchStatus() {
  const config = runtimeConfig();
  return {
    configured: config.enabled,
    enabled: config.enabled,
    provider: config.provider,
    trustedDomains: config.trustedDomains,
    maxResults: config.maxResults,
    missing: [],
  };
}

function decodeXml(value: string): string {
  return value
    .replace(/^<!\[CDATA\[|\]\]>$/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

// 百度百科开放 API（无 Cookie 即可调用）：用于直接命中"木雅金塔"等词条，
// 比起 Bing RSS 的 site:baike.baidu.com 限缩稳定得多——后者在不加引号时返回"木"字无关结果。
async function searchBaikeOpenApi(
  keyword: string,
  signal: AbortSignal,
): Promise<TrustedWebResult | null> {
  const url = `https://baike.baidu.com/api/openapi/BaikeLemmaCardApi?scope=103&format=json&appid=379020&bk_key=${encodeURIComponent(keyword)}&bk_length=600`;
  const requestController = new AbortController();
  const relayAbort = () => requestController.abort();
  const timer = setTimeout(() => requestController.abort(), 5000);
  signal.addEventListener('abort', relayAbort, { once: true });
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MuyaKnowledgeAssistant/1.0)',
        'Accept': 'application/json, text/plain, */*',
      },
      signal: requestController.signal,
    });
    if (!response.ok) return null;
    const text = await response.text();
    let parsed: any;
    try { parsed = JSON.parse(text); } catch { return null; }
    if (!parsed || typeof parsed !== 'object' || !parsed.title) return null;

    const card = Array.isArray(parsed.card) ? parsed.card : [];
    const stripTags = (s: string) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const cardText = card
      .map((entry: any) => {
        const name = stripTags(entry?.name);
        const value = stripTags(Array.isArray(entry?.value) ? entry.value.join('、') : entry?.value);
        if (!name || !value) return '';
        return `${name}：${value}`;
      })
      .filter(Boolean)
      .join('\n');
    const desc = stripTags(parsed.desc);
    const content = [desc, cardText].filter(Boolean).join('\n').slice(0, 1800);
    if (!content) return null;

    const lemmaId = parsed.newLemmaId || parsed.subLemmaId || parsed.id;
    // API 可能把查询词“木雅”消歧到“弭药”。URL 的词条名必须使用实际返回标题，
    // 不能把查询词和另一个词条 ID 拼在一起，否则会生成 /item/木雅/23180080 这类 404。
    const lemmaKey = stripTags(parsed.title || parsed.key || keyword).replace(/（百度百科）\s*$/, '').trim();
    const fullUrl = lemmaId
      ? `https://baike.baidu.com/item/${encodeURIComponent(lemmaKey)}/${lemmaId}`
      : `https://baike.baidu.com/item/${encodeURIComponent(lemmaKey)}`;

    const result: TrustedWebResult = {
      id: `baike-${lemmaId || lemmaKey}`,
      title: `${stripTags(parsed.title).trim()}（百度百科）`,
      url: fullUrl,
      content,
      score: 0.95,
      domain: 'baike.baidu.com',
    };
    return isExactBaikeMetadataResult(result, keyword) ? result : null;
  } catch (error: any) {
    return null;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', relayAbort);
  }
}

// 百度百科旧卡片 API 会漏掉一部分真实存在的新词条。此处直接访问
// baike.baidu.com 和百度官方的 bkso.baidu.com 词条页。两个入口任一可用即可，
// 验证码页、错误页或正文不含词条名时均不放行。
async function searchBaikeDirectPage(
  keyword: string,
  signal: AbortSignal,
  trustedDomains: string[],
): Promise<TrustedWebResult | null> {
  const encoded = encodeURIComponent(keyword);
  const directUrls = [
    `https://bkso.baidu.com/item/${encoded}/0?fromModule=lemma_inlink`,
    `https://baike.baidu.com/item/${encoded}`,
  ];
  for (const directUrl of directUrls) {
    if (signal.aborted) return null;
    const requestController = new AbortController();
    const relayAbort = () => requestController.abort();
    const timer = setTimeout(() => requestController.abort(), 5000);
    signal.addEventListener('abort', relayAbort, { once: true });
    try {
      const response = await fetch(directUrl, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MuyaKnowledgeAssistant/1.0)',
          'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        },
        signal: requestController.signal,
      });
      if (!response.ok) continue;
      const finalUrl = response.url || directUrl;
      const domain = trustedHost(finalUrl, trustedDomains);
      if (!domain) continue;
      const html = await readResponsePrefix(response, 1500000);
      if (looksLikeUnavailablePage(finalUrl, html)) continue;
      const pageText = decodeXml(html);
      if (!pageText.replace(/\s+/g, '').includes(keyword.replace(/\s+/g, ''))) continue;
      const rawTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || keyword;
      const title = decodeXml(rawTitle).replace(/[_-]?百度百科.*$/i, '').trim() || keyword;
      const metaTag = (html.match(/<meta\b[^>]*>/gi) || [])
        .find(tag => /\bname\s*=\s*["']description["']/i.test(tag));
      const metaDescription = decodeXml(
        metaTag?.match(/\bcontent\s*=\s*(["'])([\s\S]*?)\1/i)?.[2] || '',
      );
      const excerpt = focusedWebExcerpt(pageText, [keyword, title]);
      const content = [metaDescription, excerpt]
        .filter(Boolean)
        .filter((item, index, all) => all.indexOf(item) === index)
        .join('\n')
        .slice(0, 1800);
      if (!content) continue;
      const result: TrustedWebResult = {
        id: `baike-direct-${encodeURIComponent(keyword)}`,
        title: `${title}（百度百科）`,
        url: finalUrl,
        content,
        score: 0.93,
        domain,
      };
      if (!isExactBaikeMetadataResult(result, keyword)) continue;
      return result;
    } catch {
      // 单个百度入口被风控或超时时，继续尝试另一个官方入口。
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', relayAbort);
    }
  }
  return null;
}

// 从 question 中提取百度百科词条候选名。原理：
// - 剥离"介绍/讲解/什么是"等通用词
// - 找到主题词（"木雅"等），取主题词+后续 1-3 字作为"X+N"组合
// - 也尝试主题词+前置 1-3 字（处理"康定木雅"等）
// - 也尝试主题词单字、整个 cleaned 字符串
function extractBaikeCandidates(question: string): string[] {
  const cleaned = exactEntityFromQuestion(question);

  const groups = requiredTopicTerms(cleaned);
  const candidates: string[] = [];

  // 精确实体始终是第一候选，避免“木雅语”被提前退化成宽泛的“木雅”词条。
  if (cleaned) candidates.push(cleaned);

  // 用户说法和权威词条名不完全一致时，优先尝试可核验的常见名称。
  if (/木雅/.test(cleaned) && /(?:圣山|神山|雪山)/.test(cleaned)) {
    candidates.push('木雅贡嘎', '贡嘎山');
  }
  if (/木雅/.test(cleaned) && /(?:古碉堡|古碉|碉堡|碉楼|经堂碉|高碉|碉房)/.test(cleaned)) {
    candidates.push('木雅藏族经堂碉', '木雅经堂碉', '木雅碉楼');
  }
  if (/木雅/.test(cleaned) && /(?:金塔|尊胜塔|佛塔)/.test(cleaned)) {
    candidates.push('木雅金塔', '木雅尊胜塔');
  }

  for (const group of groups) {
    const allTerms = [group.primary, ...group.alts];
    for (const term of allTerms) {
      if (!cleaned.includes(term)) continue;
      const idx = cleaned.indexOf(term);
      // 主题词 + 后续 1-3 字（剥离"的/了/在/和/是/与"等连接词）
      const afterRaw = cleaned.slice(idx + term.length).replace(/^[的了在和是与]/, '');
      for (let n = 1; n <= 3 && n <= afterRaw.length; n++) {
        candidates.push(term + afterRaw.slice(0, n));
      }
      // 主题词 + 前置 1-3 字
      const before = cleaned.slice(0, idx);
      for (let n = 1; n <= 3 && n <= before.length; n++) {
        candidates.push(before.slice(-n) + term);
      }
      // 单独的 term
      candidates.push(term);
    }
  }

  // 去重 + 过滤太短的
  return Array.from(new Set(candidates.filter(c => c && c.length >= 2)));
}

async function searchTrustedWebByBingRss(
  query: string,
  maxResults: number,
  signal: AbortSignal,
): Promise<TrustedWebResult[]> {
  // 传入的 query 已经是完整检索串（含主题词 + site 限定），这里只负责抓 RSS，不再二次拼接。
  const response = await fetch(`https://www.bing.com/search?format=rss&mkt=zh-CN&q=${encodeURIComponent(query)}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; MuyaKnowledgeAssistant/1.0)',
      'Accept': 'application/rss+xml, application/xml, text/xml',
    },
    signal,
  });
  const xml = await response.text();
  if (!response.ok) throw new Error(`公开网页检索失败（${response.status}）`);
  const items = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
  return items
    .map((item, index): TrustedWebResult | null => {
      const title = decodeXml(item.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '');
      const url = decodeXml(item.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '');
      const content = decodeXml(item.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || '');
      const domain = trustedHost(url, []) || (() => { try { return new URL(url).hostname.toLowerCase(); } catch { return ''; } })();
      if (!title || !url || !content || !domain) return null;
      return {
        id: `web-rss-${index + 1}`,
        title,
        url,
        content: content.slice(0, 1800),
        score: Math.max(0.25, 1 - index * 0.08),
        domain,
      };
    })
    .filter((item): item is TrustedWebResult => Boolean(item));
}

function looksLikeUnavailablePage(url: string, htmlPrefix: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }
  if (/(?:^|\/)(?:404|error(?:\.html)?)(?:\/|$)/i.test(parsed.pathname)) return true;
  if (/(?:^|[?&])status=404(?:&|$)/i.test(parsed.search)) return true;
  const compact = htmlPrefix.replace(/\s+/g, ' ').slice(0, 120000);
  return /(?:您所访问的页面不存在|您访问的页面不存在|抱歉[^<]{0,40}页面不存在|当前页面不存在|404\s*(?:not found|error)|page not found)/i.test(compact);
}

async function readResponsePrefix(response: Response, maxBytes = 1000000): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let total = 0;
  let result = '';
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      result += decoder.decode(value, { stream: true });
    }
    result += decoder.decode();
  } finally {
    try { await reader.cancel(); } catch { /* response may already be closed */ }
  }
  return result;
}

async function verifyResultIsReachable(
  result: TrustedWebResult,
  trustedDomains: string[],
  question: string,
): Promise<TrustedWebResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(result.url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MuyaKnowledgeAssistant/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const finalUrl = response.url || result.url;
    const finalDomain = trustedHost(finalUrl, trustedDomains);
    if (!finalDomain) return null;
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('application/pdf')) {
      try { await response.body?.cancel(); } catch { /* ignore */ }
      return { ...result, url: finalUrl, domain: finalDomain };
    }
    const htmlPrefix = await readResponsePrefix(response);
    if (looksLikeUnavailablePage(finalUrl, htmlPrefix)) return null;
    const pageText = decodeXml(htmlPrefix).replace(/\s+/g, '');
    const groups = requiredTopicTerms(question);
    // 政府网站常把正文放在大量导航、脚本或异步模板之后。实际页面文本能命中时最好；
    // 若抓取前缀未覆盖正文，则保留已经通过“标题+搜索正文”强相关性检查且链接有效的结果。
    if (groups.length > 0
      && !topicGroupsMatch(pageText, groups)
      && !webResultMatchesQuestion(result, question)) return null;
    return { ...result, url: finalUrl, domain: finalDomain };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function keepReachableRelevantResults(
  results: TrustedWebResult[],
  question: string,
  trustedDomains: string[],
  maxResults: number,
): Promise<TrustedWebResult[]> {
  const unique = Array.from(new Map(
    results
      .filter((item) => webResultMatchesQuestion(item, question))
      .map((item) => [item.url, item]),
  ).values()).slice(0, Math.max(10, maxResults * 3));
  const checked = await Promise.all(unique.map(item => verifyResultIsReachable(item, trustedDomains, question)));
  return checked
    .map((item, index) => item || (isExactBaikeMetadataResult(unique[index], question) ? unique[index] : null))
    .filter((item): item is TrustedWebResult => Boolean(item))
    .slice(0, maxResults);
}

// 阿里云服务器偶尔会被百度的机器访问风控拦住，即使用户浏览器能打开词条。
// 此时只有搜索引擎已索引的结果同时满足“官方百度域名 + URL 词条名精确
// 等于用户实体 + 标题精确匹配”时才允许作为证据，不再放行相似词条。
function isExactBaikeMetadataResult(result: TrustedWebResult, question: string): boolean {
  const target = exactEntityFromQuestion(question);
  if (!target || target.length < 2 || target.length > 40) return false;
  let parsed: URL;
  try { parsed = new URL(result.url); } catch { return false; }
  const host = parsed.hostname.toLowerCase();
  if (host !== 'baike.baidu.com' && host !== 'bkso.baidu.com') return false;
  let decodedPath = parsed.pathname;
  try { decodedPath = decodeURIComponent(decodedPath); } catch { /* keep encoded path */ }
  const segments = decodedPath.split('/').filter(Boolean);
  const itemIndex = segments.findIndex(segment => segment.toLowerCase() === 'item');
  const slug = itemIndex >= 0 ? String(segments[itemIndex + 1] || '').trim() : '';
  const title = String(result.title || '')
    .replace(/[_\-|｜]?百度百科.*$/i, '')
    .replace(/[“”"'「」『』《》【】（）()\s]/g, '')
    .trim();
  const normalizedTarget = target.replace(/[\s（）()]/g, '');
  const normalizedSlug = slug.replace(/[\s（）()]/g, '');
  return normalizedSlug === normalizedTarget
    && (title === normalizedTarget || title.startsWith(normalizedTarget));
}

interface CanonicalTrustedSource {
  matches: (question: string) => boolean;
  title: string;
  url: string;
  focusTerms: string[];
  verifiedContent?: string;
}

const CANONICAL_TRUSTED_SOURCES: CanonicalTrustedSource[] = [
  {
    matches: question => /木雅/.test(question) && /(?:金塔|尊胜塔|佛塔)/.test(question),
    title: '木雅金塔（百度百科）',
    url: 'https://baike.baidu.com/item/%E6%9C%A8%E9%9B%85%E9%87%91%E5%A1%94/5636401',
    focusTerms: ['木雅金塔', '木雅尊胜塔', '莲师道场', '建筑结构'],
    verifiedContent: '木雅金塔，又名木雅尊胜塔，位于四川省甘孜州康定市新都桥镇塔公乡境内，由宁玛派竹庆寺多吉扎西活佛于1997年捐资建造，是为纪念十世班禅大师于此灌顶布法而修建的佛塔。金塔坐落于雅拉神山等八座神山环绕的中心，藏语称“古汝塘”，意为“莲师道场”。该塔是一座坛城式佛教寺庙建筑，金塔共分三层，分别代表佛、法、僧三宝。',
  },
  {
    matches: question => /木雅/.test(question) && /(?:金塔|尊胜塔|佛塔)/.test(question),
    title: '城市建设',
    url: 'https://www.kangding.gov.cn/kdsrmzf/c100547/201907/62b3d9f8f29e4c5a93363e6618f7e0bf.shtml',
    focusTerms: ['木雅金塔', '木雅尊胜塔', '莲师道场', '塔公景区'],
  },
  {
    matches: question => /(?:木雅圣山|木雅贡嘎|贡嘎山)/.test(question),
    title: '贡嘎山（百度百科）',
    url: 'https://baike.baidu.com/item/%E8%B4%A1%E5%98%8E%E5%B1%B1/507005',
    focusTerms: ['贡嘎山', '木雅贡嘎', '7508.9米', '蜀山之王'],
    verifiedContent: '贡嘎山（即雅贡嘎，英语：Minya Konka），为横断山系大雪山主峰，被当地人称为木雅贡嘎。位于四川省甘孜藏族自治州康定市、泸定县、九龙县和雅安市石棉县之间。贡嘎山主峰海拔7508.9米（2023年公布），是四川省最高的山峰，被称为“蜀山之王”。',
  },
  {
    matches: question => /(?:木雅圣山|木雅贡嘎|贡嘎山)/.test(question),
    title: '道孚藏民风情',
    url: 'https://www.gzdf.gov.cn/daofu/c102749/201912/d5985da62e3d4630bb8cc3502f26426f.shtml',
    focusTerms: ['木雅贡嘎山', '贡嘎山', '雪峰'],
  },
  {
    matches: question => /木雅/.test(question) && /(?:古碉堡|古碉|碉堡|碉楼|经堂碉|高碉|碉房)/.test(question),
    title: '猛种堡子：高山上的木雅传奇',
    url: 'https://wgtl.yaan.gov.cn/xinwen/show/94172eb9-02af-4a58-a88b-d88c34716804.html',
    focusTerms: ['木雅藏族集聚地', '每一座房屋，就是一座碉楼', '石木碉楼', '藏寨建于清代末年'],
  },
  {
    matches: question => /木雅/.test(question) && /(?:古碉堡|古碉|碉堡|碉楼|经堂碉|高碉|碉房)/.test(question),
    title: '康定市“十四五”文化和旅游发展规划',
    url: 'https://www.kangding.gov.cn/kdfdzdgknrghjhfzgh/article/488086',
    focusTerms: ['木雅文化旅游区', '古碉楼', '木雅经堂', '朋布千年古碉'],
  },
];

function focusedWebExcerpt(text: string, terms: string[]): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const excerpts: string[] = [];
  for (const term of terms) {
    const index = normalized.indexOf(term);
    if (index < 0) continue;
    const start = Math.max(0, index - 220);
    const end = Math.min(normalized.length, index + term.length + 520);
    const excerpt = normalized.slice(start, end).trim();
    if (excerpt && !excerpts.some(item => item.includes(excerpt) || excerpt.includes(item))) {
      excerpts.push(excerpt);
    }
  }
  return (excerpts.length > 0 ? excerpts.join('\n') : normalized).slice(0, 1800);
}

async function fetchCanonicalTrustedSources(
  question: string,
  trustedDomains: string[],
  maxResults: number,
): Promise<TrustedWebResult[]> {
  const sources = CANONICAL_TRUSTED_SOURCES.filter(source => source.matches(question));
  const checked = await Promise.all(sources.map(async (source, index): Promise<TrustedWebResult | null> => {
    const snapshotResult = (): TrustedWebResult | null => {
      if (!source.verifiedContent) return null;
      const domain = trustedHost(source.url, trustedDomains);
      if (!domain) return null;
      const result: TrustedWebResult = {
        id: `canonical-snapshot-${index + 1}`,
        title: source.title,
        url: source.url,
        content: source.verifiedContent,
        score: 1,
        domain,
      };
      return webResultMatchesQuestion(result, question) ? result : null;
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(source.url, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MuyaKnowledgeAssistant/1.0)',
          'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        },
        signal: controller.signal,
      });
      if (!response.ok) return response.status === 404 ? null : snapshotResult();
      const finalUrl = response.url || source.url;
      const domain = trustedHost(finalUrl, trustedDomains);
      if (!domain) return null;
      const html = await readResponsePrefix(response, 1500000);
      if (looksLikeUnavailablePage(finalUrl, html)) return null;
      const pageText = decodeXml(html);
      const content = source.verifiedContent || focusedWebExcerpt(pageText, source.focusTerms);
      if (!content) return null;
      const result: TrustedWebResult = {
        id: `canonical-${index + 1}`,
        title: source.title,
        url: finalUrl,
        content,
        score: 1,
        domain,
      };
      return webResultMatchesQuestion(result, question) ? result : null;
    } catch {
      // 百度可能对服务器请求返回风控页，而用户浏览器中的真实词条仍可访问。
      // 对已人工核验的固定词条使用快照正文，但仍展示真实百科 URL。
      return snapshotResult();
    } finally {
      clearTimeout(timer);
    }
  }));
  const valid = checked.filter((item): item is TrustedWebResult => Boolean(item));
  // 已有精确百科词条时，只返回该词条；不能再让标题宽泛的“城市建设”等相关页
  // 抢占第一证据位，造成“搜到了内容但来源看起来搜错”的体验。
  const exactBaike = valid.find((item) => {
    const isBaike = item.domain === 'baike.baidu.com' || item.domain.endsWith('.baike.baidu.com')
      || item.domain === 'bkso.baidu.com' || item.domain.endsWith('.bkso.baidu.com');
    if (!isBaike) return false;
    if (/木雅/.test(question) && /(?:金塔|尊胜塔)/.test(question)) return item.title.includes('木雅金塔');
    if (/(?:木雅圣山|木雅贡嘎|贡嘎山)/.test(question)) return item.title.includes('贡嘎山');
    return false;
  });
  return (exactBaike ? [exactBaike] : valid).slice(0, maxResults);
}

export async function searchTrustedWeb(
  question: string,
  options: { allowPublicFallback?: boolean } = {},
): Promise<TrustedWebResult[]> {
  const config = runtimeConfig();
  // 木小知可以在未配置 Tavily 时使用无需密钥的官网/Bing RSS/百度百科公开检索。
  // 配置开关仍约束其他调用方；allowPublicFallback 只由木小知的可信来源链路开启。
  if (!config.enabled && !options.allowPublicFallback) throw new Error('可信联网检索未启用');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const runSearch = async (query: string): Promise<TrustedWebResult[]> => {
      if (!config.apiKey) {
        return await searchTrustedWebByBingRss(query, config.maxResults, controller.signal);
      }
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          query,
          topic: 'general',
          search_depth: 'basic',
          include_answer: false,
          include_raw_content: 'text',
          include_domains: config.trustedDomains,
          max_results: config.maxResults,
        }),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`Tavily 检索失败（${response.status}）：${text.slice(0, 240)}`);
      const payload = JSON.parse(text) as any;
      const results = Array.isArray(payload?.results) ? payload.results : [];
      return results
        .map((item: any, index: number): TrustedWebResult | null => {
          const url = String(item?.url || '').trim();
          const domain = trustedHost(url, config.trustedDomains);
          if (!domain) return null;
          const content = String(item?.raw_content || item?.content || '').replace(/\s+/g, ' ').trim();
          if (!content) return null;
          return {
            id: `web-${index + 1}`,
            title: String(item?.title || domain).trim(),
            url,
            content: content.slice(0, 1800),
            score: Number(item?.score) || 0,
            domain,
          };
        })
        .filter((item: TrustedWebResult | null): item is TrustedWebResult => Boolean(item));
    };

    const optimized = optimizedSearchQuestion(question);
    // 对已核验、名称容易产生歧义的常见木雅实体，优先读取权威官网直达页。
    // 搜索服务临时无结果时也能稳定回答，但网页仍会实时验活和校验实体词。
    let results: TrustedWebResult[] = await fetchCanonicalTrustedSources(
      question,
      config.trustedDomains,
      config.maxResults,
    );

    // 第一轮：用户问的是明确实体时，先查与实体同名的百科词条。
    // 这比先取一篇只在正文里顺带提到主题的宽泛官网页更精确。
    const baikeCandidates = extractBaikeCandidates(question);
    if (results.length === 0) {
      for (const kw of baikeCandidates) {
        const hit = await searchBaikeOpenApi(kw, controller.signal);
        if (hit && webResultMatchesQuestion(hit, question)) {
          const verified = await keepReachableRelevantResults([hit], question, config.trustedDomains, 1);
          if (verified.length > 0) {
            results = verified;
            break;
          }
        }
        const directHit = await searchBaikeDirectPage(kw, controller.signal, config.trustedDomains);
        if (directHit && webResultMatchesQuestion(directHit, question)) {
          results = [directHit];
          break;
        }
      }
    }

    // 第二轮：Bing/Tavily 单 site 搜（百度直连被风控，但搜索引擎已抓到的情况）。
    if (results.length === 0) {
      const exactCandidate = baikeCandidates[0] || optimized;
      for (const baikeDomain of ['bkso.baidu.com/item', 'baike.baidu.com/item']) {
        const rss = await runSearch(`${exactCandidate} site:${baikeDomain}`);
        const filtered = rss
          .map(item => ({ ...item, score: item.score }))
          .filter(item => webResultMatchesQuestion(item, question));
        results = await keepReachableRelevantResults(filtered, question, config.trustedDomains, config.maxResults);
        if (results.length > 0) break;
      }
    }

    // 第三轮：精确词条仍然没有时，再查政府、高校和科研机构官网。
    const officialDomains = config.trustedDomains.filter(
      domain => domain !== 'baike.baidu.com' && domain !== 'bkso.baidu.com',
    );
    if (results.length === 0 && officialDomains.length > 0) {
      try {
        const officialQuery = `${optimized} (${officialDomains.map(domain => `site:${domain}`).join(' OR ')})`;
        results = (await runSearch(officialQuery))
          .filter(item => officialDomains.some(domain => item.domain === domain || item.domain.endsWith(`.${domain}`)))
          .filter(item => webResultMatchesQuestion(item, question))
          .sort((a, b) => b.score - a.score);
        results = await keepReachableRelevantResults(results, question, config.trustedDomains, config.maxResults);
      } catch (error: any) {
        console.warn('[TrustedWeb] 官方来源检索失败，继续宽泛搜索：', error?.message || error);
      }
    }

    // 第四轮：全部可信域 OR 兜底。
    if (results.length === 0) {
      const domainQuery = config.trustedDomains.map(domain => `site:${domain}`).join(' OR ');
      const broadQuery = `${optimized} (${domainQuery})`;
      const rss = await runSearch(broadQuery);
      const filtered = rss
        .filter(item => trustedHost(item.url, config.trustedDomains) !== null)
        .filter(item => webResultMatchesQuestion(item, question));
      results = await keepReachableRelevantResults(filtered, question, config.trustedDomains, config.maxResults);
    }

    // 第五轮：木雅主题时把"木雅"换成"西番"再走一次百度开放 API。
    if (results.length === 0 && /木雅/.test(question)) {
      const aliasQuestion = question
        .replace(/木雅藏族/g, '西番')
        .replace(/木雅人/g, '西番人')
        .replace(/木雅语/g, '西番语')
        .replace(/木雅/g, '西番');
      if (aliasQuestion !== aliasQuestion.replace(/[？?。，、,.\s]+/g, ' ')) {
        // 已含"西番"作为同义词——百度开放 API 已经试过，不必再走
      }
      const aliasCandidates = extractBaikeCandidates(aliasQuestion);
      for (const kw of aliasCandidates) {
        const hit = await searchBaikeOpenApi(kw, controller.signal);
        if (hit && webResultMatchesQuestion(hit, question)) {
          const verified = await keepReachableRelevantResults([hit], question, config.trustedDomains, 1);
          if (verified.length > 0) {
            results = verified;
            break;
          }
        }
        const directHit = await searchBaikeDirectPage(kw, controller.signal, config.trustedDomains);
        if (directHit && webResultMatchesQuestion(directHit, question)) {
          results = [directHit];
          break;
        }
      }
      // 仍然 0 命中再用 Bing RSS 单 site 搜西番
      if (results.length === 0) {
        const aliasOptimized = optimizedSearchQuestion(aliasQuestion);
        const rss = await runSearch(`${aliasOptimized} (site:baike.baidu.com/item OR site:bkso.baidu.com/item)`);
        results = await keepReachableRelevantResults(
          rss.filter(item => webResultMatchesQuestion(item, question)),
          question,
          config.trustedDomains,
          config.maxResults,
        );
      }
    }
    return results;
  } catch (error: any) {
    if (error?.name === 'AbortError') throw new Error('可信联网检索超时');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function formatWebContext(results: TrustedWebResult[]): string {
  if (results.length === 0) return '（可信网站未检索到相关资料）';
  return results.map((item, index) => [
    `[网页资料${index + 1}]`,
    `标题：${item.title}`,
    `网址：${item.url}`,
    `域名：${item.domain}`,
    '内容开始',
    item.content,
    '内容结束',
  ].join('\n')).join('\n\n');
}

export function buildWebEvidenceResponse(results: TrustedWebResult[]): string {
  if (results.length === 0) return '> 知识库和可信网站均未检索到可靠资料';
  return [
    'DeepSeek-V3 未配置，以下为可信网站检索到的原始摘要，未进行模型扩写：',
    ...results.slice(0, 5).map((item, index) =>
      `${index + 1}. ${item.title}\n${item.content.slice(0, 320)}\n来源：${item.url}`),
  ].join('\n\n');
}
