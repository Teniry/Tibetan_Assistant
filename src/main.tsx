import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { APP_CONFIG, buildDigitalHumanUrl, shouldAutoOpenDigitalHuman } from './config';
import 'tdesign-react/esm/style/index.js';
import './index.css';

// 设置页面标题
document.title = APP_CONFIG.name;

// 根首页保留静态加载层，等 LandingPage 的预览资源就绪后再平滑淡出。
// 其他路由仍由 React 立即接管，避免加载层遮挡深蓝色的沉浸式页面。
const bootScreen = document.getElementById('boot-screen');
const bootPath = window.location.pathname.replace(/\/{2,}/g, '/');
const isLandingBoot = bootPath === '/' || bootPath === '/index.html';
if (bootScreen && !isLandingBoot) bootScreen.remove();

if (shouldAutoOpenDigitalHuman()) {
  // 公网首次访问直接进入 Workbrain 数字人容器；容器中的站点带 embedded 标记，
  // 不会再次跳转。使用 ?digitalHuman=off 可直接进入原始管理页面。
  window.location.replace(buildDigitalHumanUrl());
} else {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  );
}
