// 临时测试：验证 fieldFromEvidence 提取逻辑（与 server/index.ts 中实现一致）
function fieldFromEvidence(content, labels) {
  let clean = String(content || '').replace(/\r/g, '');
  clean = clean.replace(/^Question\s*[：:].*$/im, '');
  clean = clean.replace(/(?:^|[^\p{L}\p{N}])(?:Answer|A)\s*[：:]\s*/giu, '\n');
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const value = clean.match(new RegExp(`(?:^|\\n|[|；;])\\s*${escaped}\\s*[：:]\\s*([^\\n|；;]{1,180})`, 'i'))?.[1]?.trim();
    if (value) return value.replace(/\|/g, '｜');
  }
  return '';
}

const samples = [
  'Answer: 中文：野猪；藏语：ཕག་རྒོད།；木雅语：ཕག་རྒོད།；音标：pʰagø；英文：wild boar；章节分类：野生动物',
  '公鹿 ཤྭ་ཕོ། ཙབ་འོ། stag tsʌko,Answer: 中文：公鹿；藏语：ཤྭ་ཕོ།；木雅语：ཙབ་འོ།；音标：tsʌko；英文：stag；章节分类：野生动物',
  '中文：野生菌；藏语：ཤ་མོལ།；木雅语：ཤ་མོལ།；音标：ʂamo；英文：wild mushroom；章节分类：蘑菇',
  'Question: 野猪\nAnswer: 中文：野猪；藏语：ཕག་རྒོད།；木雅语：ཕག་རྒོད།；音标：pʰagø；英文：wild boar；章节分类：野生动物',
  '中文：公鹿；藏语：ཤྭ་ཕོ།；木雅语：ཙབ་འོ།；音标：tsʌko；英文：stag；章节分类：野生动物',
];

let pass = 0, fail = 0;
for (const s of samples) {
  const zh = fieldFromEvidence(s, ['中文', '汉语']);
  const bo = fieldFromEvidence(s, ['藏文', '藏语']);
  const mu = fieldFromEvidence(s, ['木雅语', '木雅']);
  const ph = fieldFromEvidence(s, ['国际音标', '音标', 'IPA']);
  const en = fieldFromEvidence(s, ['英文', '英语', 'English']);
  const ok = zh && bo && mu && ph && en;
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} | zh=${zh} | bo=${bo} | mu=${mu} | ph=${ph} | en=${en}`);
}
console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
