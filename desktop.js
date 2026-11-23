// 职责：桌面图标渲染、多选、双击打开、框选、空白右键
import store from '../core/store.js';
import ls from '../core/storage.js';
import { icon, clamp } from '../core/utils.js';
import AppRegistry from '../services/appRegistry.js';
import vfs from '../services/vfs.js';
import { contextMenu } from './contextMenu.js';

const GRID_W = 96;
const GRID_H = 100;
const PAD = 12;

let icons = [];
let selected = new Set();

function defaultIcons() {
  return [
    { id: 'di-explorer', appId: 'explorer', label: '此电脑', x: 0, y: 0 },
    { id: 'di-docs', fileId: null, path: '/文档', label: '文档', x: 0, y: 1 },
    { id: 'di-notepad', appId: 'notepad', label: '记事本', x: 0, y: 2 },
    { id: 'di-calc', appId: 'calculator', label: '计算器', x: 0, y: 3 }
  ];
}

function save() {
  ls.set('desktop', icons);
}

function positionOf(item) {
  return { left: PAD + item.x * GRID_W, top: PAD + item.y * GRID_H };
}

function render() {
  const grid = document.getElementById('icon-grid');
  if (!grid) return;
  grid.replaceChildren();

  for (const item of icons) {
    const node = document.createElement('div');
    node.className = 'desktop-icon' + (selected.has(item.id) ? ' selected' : '');
    node.dataset.iconId = item.id;
    node.style.left = (PAD + item.x * GRID_W) + 'px';
    node.style.top = (PAD + item.y * GRID_H) + 'px';

    const glyph = item.appId
      ? AppRegistry.get(item.appId)?.icon || 'file'
      : (item.type === 'folder' ? 'folder' : 'file');
    node.appendChild(icon(glyph));

    const label = document.createElement('div');
    label.className = 'desktop-icon__label';
    label.textContent = item.label;
    node.appendChild(label);

    grid.appendChild(node);
  }
}

function openIcon(item) {
  if (item.appId) {
    AppRegistry.open(item.appId);
    return;
  }
  if (item.path) {
    AppRegistry.open('explorer', { path: item.path });
  }
}

function selectOnly(id) {
  selected.clear();
  if (id) selected.add(id);
  render();
}

function setupEvents() {
  const grid = document.getElementById('icon-grid');
  const box = document.getElementById('selection-box');

  grid.addEventListener('pointerdown', (e) => {
    const target = e.target.closest('.desktop-icon');

    if (!target) {
      // 空白区域：开始框选
      selected.clear();
      render();
      startMarquee(e, grid, box);
      return;
    }

    const id = target.dataset.iconId;
    if (e.ctrlKey) {
      if (selected.has(id)) selected.delete(id); else selected.add(id);
    } else if (!selected.has(id)) {
      selected.clear();
      selected.add(id);
    }
    render();
  });

  grid.addEventListener('dblclick', (e) => {
    const target = e.target.closest('.desktop-icon');
    if (!target) return;
    const item = icons.find(i => i.id === target.dataset.iconId);
    if (item) openIcon(item);
  });

  grid.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const target = e.target.closest('.desktop-icon');
    if (target) {
      const item = icons.find(i => i.id === target.dataset.iconId);
      if (!item) return;
      selectOnly(item.id);
      contextMenu.show(e.clientX, e.clientY, [
        { label: '打开', icon: 'folder', action: () => openIcon(item) },
        { divider: true },
        {
          label: '重命名',
          action: () => {
            const name = prompt('新名称', item.label);
            if (name) { item.label = name; save(); render(); }
          }
        },
        {
          label: '删除',
          action: () => {
            icons = icons.filter(i => i.id !== item.id);
            selected.delete(item.id);
            save();
            render();
          }
        }
      ]);
      return;
    }

    contextMenu.show(e.clientX, e.clientY, [
      { label: '刷新', action: () => render() },
      { divider: true },
      {
        label: '新建文件夹',
        icon: 'folder',
        action: async () => {
          try {
            await vfs.mkdir('/桌面', '新建文件夹 ' + Date.now().toString(36));
            AppRegistry.open('explorer', { path: '/桌面' });
          } catch (err) {
            console.error(err);
          }
        }
      },
      { label: '个性化', icon: 'settings', action: () => AppRegistry.open('settings', { section: 'personalize' }) },
      { label: '显示设置', icon: 'settings', action: () => AppRegistry.open('settings') }
    ]);
  });
}

function startMarquee(startEvent, grid, box) {
  const startX = startEvent.clientX;
  const startY = startEvent.clientY;
  box.hidden = false;
  box.style.left = startX + 'px';
  box.style.top = startY + 'px';
  box.style.width = '0px';
  box.style.height = '0px';

  const onMove = (e) => {
    const x = Math.min(startX, e.clientX);
    const y = Math.min(startY, e.clientY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);
    box.style.left = x + 'px';
    box.style.top = y + 'px';
    box.style.width = w + 'px';
    box.style.height = h + 'px';

    selected.clear();
    const rect = { left: x, top: y, right: x + w, bottom: y + h };
    for (const node of grid.querySelectorAll('.desktop-icon')) {
      const r = node.getBoundingClientRect();
      if (!(r.right < rect.left || r.left > rect.right || r.bottom < rect.top || r.top > rect.bottom)) {
        selected.add(node.dataset.iconId);
      }
    }
    render();
  };

  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    box.hidden = true;
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

export function initDesktop() {
  const saved = ls.get('desktop', null);
  icons = Array.isArray(saved) && saved.length ? saved : defaultIcons();
  if (!Array.isArray(saved)) save();
  render();
  setupEvents();
}