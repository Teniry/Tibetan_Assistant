const fs = require('fs');
const s = fs.readFileSync('E:/AIAgent/三智能体/木雅语助手-8.20-0320/.workbuddy/live_bundle.js', 'utf8');

// 找 ph 的定义（LoadingScreen）
console.log('=== ph ===');
const phIdx = s.indexOf('const ph=A.jsx');
console.log('ph @', phIdx);
if (phIdx > -1) console.log(s.substring(phIdx, phIdx + 200));

// 找 ph= 形式
let p = 0;
const refs = [];
while (true) {
  const i = s.indexOf('ph({title', p);
  if (i < 0) break;
  refs.push(i);
  p = i + 1;
}
console.log('ph({title... 调用位置:', refs);

// 直接定位 ph 定义
console.log('--- ph 紧邻定义 ---');
const defIdx = s.indexOf('ph={');
console.log('ph={ @', defIdx);
if (defIdx > 0) console.log(s.substring(defIdx - 50, defIdx + 250));

// LandingPage 的 ph 引用
console.log('\n=== ph={title 转定义附近 ===');
console.log(s.substring(2949995 - 800, 2949995 + 500));
