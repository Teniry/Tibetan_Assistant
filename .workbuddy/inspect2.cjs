const fs = require('fs');
const s = fs.readFileSync('E:/AIAgent/三智能体/木雅语助手-8.20-0320/.workbuddy/live_bundle.js', 'utf8');

// 看 Obt 函数的完整定义（约 @2946231）
const idx = s.indexOf('function Obt');
console.log('function Obt 定义起始:', idx);
console.log('---');
console.log(s.substring(idx, idx + 4500));
console.log('===');
console.log('--- LandingPage 在 bundle 中的位置 ---');
const lpIdx = s.indexOf('"2D 网页式学习"');
console.log('2D 网页式学习 @', lpIdx);
console.log(s.substring(Math.max(0, lpIdx - 300), lpIdx + 800));
console.log('===');
console.log('--- 整体背景 f8f5f0 第 1 处上下文 ---');
const fid = s.indexOf('f8f5f0');
console.log('@', fid);
console.log(s.substring(Math.max(0, fid - 800), fid + 200));
