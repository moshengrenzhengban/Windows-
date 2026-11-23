// 职责：启动入口 — 服务初始化、外壳挂载、快捷键、会话恢复
import vfs from './services/vfs.js';
import settings from './services/settings.js';
import wm from './services/windowManager.js';
import AppRegistry from './services/appRegistry.js';
import notification from './services/notification.js';
import './apps/index.js';
import { initDesktop } from './shell/desktop.js';
import { initTaskbar, destroyTaskbar } from './shell/taskbar.js';
import { initStartMenu } from './shell/startMenu.js';
import { initContextMenu } from './shell/contextMenu.js';

const SESSION_KEY = 'win11:session';

function saveSession() {
  try {
    const wins = wm.list().map(w => ({ appId: w.appId, payload: w.payload }));
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(wins));
  } catch (err) { /* ignore */ }
}

function restoreSession() {
  let list = [];
  try { list = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]'); } catch { /* ignore */ }
  for (const item of list) {
    if (AppRegistry.get(item.appId)) {
      wm.open(item.appId, { payload: item.payload }).catch(() => {});
    }
  }
}

function bindShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Alt+Tab 循环焦点
    if (e.altKey && e.key === 'Tab') {
      e.preventDefault();
      wm.cycleFocus(e.shiftKey ? -1 : 1);
      return;
    }
    // Alt+F4 关闭焦点窗口
    if (e.altKey && e.key === 'F4') {
      e.preventDefault();
      const id = wm.list().find(w => w.id === wm.list().find(x => x.id === w?.id)?.id)?.id;
      const focusId = document.querySelector('.window--focused')?.dataset.winId;
      if (focusId) wm.close(focusId);
      return;
    }
    // Alt+← / → 贴靠
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const focusId = document.querySelector('.window--focused')?.dataset.winId;
      if (focusId) wm.snap(focusId, e.key === 'ArrowLeft' ? 'left' : 'right');
      return;
    }
    // Alt+↑ 最大化
    if (e.altKey && e.key === 'ArrowUp') {
      e.preventDefault();
      const focusId = document.querySelector('.window--focused')?.dataset.winId;
      if (focusId) wm.maximize(focusId);
      return;
    }
    // Alt+D 全部最小化
    if (e.altKey && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      wm.minimizeAll();
      return;
    }
    // Alt+E 资源管理器
    if (e.altKey && (e.key === 'e' || e.key === 'E')) {
      e.preventDefault();
      AppRegistry.open('explorer');
      return;
    }
    // Alt+S 搜索（占位）
    if (e.altKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      notification.show({ title: '搜索', body: '全局搜索见第 6.6 节（本次未实现）' });
      return;
    }
    // Ctrl+Shift+Esc 任务管理器（占位）
    if (e.ctrlKey && e.shiftKey && e.key === 'Escape') {
      e.preventDefault();
      notification.show({ title: '任务管理器', body: '见第 7.1 节（本次未实现）' });
      return;
    }
    // Esc 关闭浮层
    if (e.key === 'Escape') {
      document.getElementById('context-menu')?.setAttribute('hidden', '');
    }
  });

  window.addEventListener('beforeunload', saveSession);
}

async function boot() {
  try {
    await vfs.init();
  } catch (err) {
    console.error('[boot] VFS 初始化失败', err);
    notification.show({ title: '存储不可用', body: '文件系统降级为内存模式，本次会话有效' });
  }

  settings.init();
  initDesktop();
  initTaskbar();
  initStartMenu();
  initContextMenu();
  bindShortcuts();

  // 会话恢复
  restoreSession();

  window.__BOOTED__ = true;
  document.getElementById('boot-hint').hidden = true;
  console.info('[win11] 已启动');
}

boot().catch((err) => {
  console.error('[boot] 启动失败', err);
  const hint = document.getElementById('boot-hint');
  if (hint) hint.hidden = false;
});