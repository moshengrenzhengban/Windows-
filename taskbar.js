// 职责：任务栏 — 固定应用、运行状态指示、时钟、托盘
import store from '../core/store.js';
import AppRegistry from '../services/appRegistry.js';
import wm from '../services/windowManager.js';
import settings from '../services/settings.js';
import notification from '../services/notification.js';
import { icon } from '../core/utils.js';

let clockTimer = null;

function renderApps() {
  const container = document.getElementById('tb-apps');
  if (!container) return;
  const running = new Set(wm.list().map(w => w.appId));
  const pinned = Array.from(new Set([
    ...AppRegistry.list(m => m.pinnedToTaskbar).map(m => m.id),
    ...running
  ]));
  const focused = store.raw.focusWinId;
  const focusedApp = focused ? wm.get(focused)?.appId : null;

  container.replaceChildren();
  for (const appId of pinned) {
    const manifest = AppRegistry.get(appId);
    if (!manifest) continue;
    const btn = document.createElement('button');
    btn.className = 'tb-btn';
    btn.dataset.appId = appId;
    btn.title = manifest.name;
    btn.appendChild(icon(manifest.icon));
    if (running.has(appId)) btn.classList.add('running');
    if (focusedApp === appId) btn.classList.add('focused');

    btn.addEventListener('click', () => {
      const winsOfApp = wm.list().filter(w => w.appId === appId && w.state !== 'minimized');
      if (!winsOfApp.length) {
        const minimized = wm.list().filter(w => w.appId === appId);
        if (minimized.length) wm.restore(minimized[0].id);
        else AppRegistry.open(appId);
        return;
      }
      const focusedWin = winsOfApp.find(w => w.id === store.raw.focusWinId);
      if (focusedWin) wm.minimize(focusedWin.id);
      else wm.focus(winsOfApp[winsOfApp.length - 1].id);
    });

    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      import('./contextMenu.js').then(({ contextMenu }) => {
        contextMenu.show(e.clientX, e.clientY, [
          { label: '打开新窗口', action: () => wm.open(appId, { forceNew: true }) },
          {
            label: '关闭所有窗口',
            disabled: !running.has(appId),
            action: () => wm.list().filter(w => w.appId === appId).forEach(w => wm.close(w.id))
          }
        ]);
      });
    });

    container.appendChild(btn);
  }
}

function tickClock() {
  const now = new Date();
  const use24 = settings.get('timeFormat') !== '12h';
  const time = now.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: !use24
  });
  const date = now.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  const t = document.getElementById('tb-time');
  const d = document.getElementById('tb-date');
  if (t) t.textContent = time;
  if (d) d.textContent = date;
}

export function initTaskbar() {
  document.getElementById('taskbar').dataset.align = settings.get('taskbar.align') || 'center';

  document.getElementById('tb-start').addEventListener('click', async () => {
    const { toggleStartMenu } = await import('./startMenu.js');
    toggleStartMenu();
  });

  document.getElementById('tb-taskview').addEventListener('click', () => {
    const wins = wm.list();
    if (!wins.length) { notification.show({ title: '任务视图', body: '当前没有打开的窗口' }); return; }
    wm.cycleFocus(1);
  });

  document.getElementById('tb-search').addEventListener('click', () => {
    notification.show({ title: '搜索', body: 'Alt+S 打开全局搜索（第 6.6 节，待接入）' });
  });

  document.getElementById('tb-wifi').addEventListener('click', () => {
    notification.show({ title: '网络', body: '已连接：模拟网络（无实际连接）' });
  });

  document.getElementById('tb-vol').addEventListener('click', () => {
    notification.show({ title: '音量', body: '当前 68%' });
  });

  document.getElementById('tb-bell').addEventListener('click', () => {
    notification.show({ title: '通知中心', body: '暂无新通知' });
  });

  document.getElementById('tb-clock').addEventListener('click', () => {
    const now = new Date();
    notification.show({ title: now.toLocaleDateString('zh-CN'), body: now.toLocaleTimeString('zh-CN') });
  });

  tickClock();
  clockTimer = setInterval(tickClock, 30000);

  renderApps();
  wm.on('open', renderApps);
  wm.on('close', renderApps);
  wm.on('focus', renderApps);
  wm.on('minimize', renderApps);
  wm.on('restore', renderApps);
  settings.on(() => renderApps());
}

export function destroyTaskbar() {
  if (clockTimer) clearInterval(clockTimer);
}