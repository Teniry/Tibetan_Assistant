const fs = require('fs');
const path = 'E:/AIAgent/三智能体/木雅语助手-8.20-0320/.workbuddy/live_bundle.js';
const s = fs.readFileSync(path, 'utf8');

console.log('=== f8f5f0 出现位置 ===');
let idx = 0;
while (true) {
  const i = s.indexOf('f8f5f0', idx);
  if (i < 0) break;
  console.log(`@${i}: ...${s.substring(Math.max(0, i - 120), i + 200)}...`);
  console.log('---');
  idx = i + 1;
}

console.log('\n=== 0a0e27 出现位置 ===');
idx = 0;
let count = 0;
while (true) {
  const i = s.indexOf('0a0e27', idx);
  if (i < 0) break;
  count++;
  if (count <= 3) console.log(`@${i}: ...${s.substring(Math.max(0, i - 80), i + 120)}...`);
  idx = i + 1;
}
console.log('0a0e27 总次数:', count);

console.log('\n=== 国家通用语言文字 上下文 ===');
idx = 0;
count = 0;
while (true) {
  const i = s.indexOf('\u56fd\u5bb6\u901a\u7528\u8bed\u8a00\u6587\u5b57', idx);
  if (i < 0) break;
  count++;
  if (count <= 3) console.log(`@${i}: ...${s.substring(Math.max(0, i - 100), i + 200)}...`);
  console.log('---');
  idx = i + 1;
}
console.log('国家通用语言文字 总次数:', count);

console.log('\n=== homeTitle 在 bundle 中 ===');
idx = 0;
while (true) {
  const i = s.indexOf('homeTitle', idx);
  if (i < 0) break;
  console.log(`@${i}: ...${s.substring(Math.max(0, i - 80), i + 200)}...`);
  console.log('---');
  idx = i + 1;
}
