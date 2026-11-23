// 职责：右键菜单。自动翻转防溢出，点击外部/Esc/滚动关闭
import { icon } from '../core/utils.js';

let current = null;
let bound = false;

function place(menu, x, y) {
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.hidden = false;

  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth - 4) menu.style.left = Math.max(4, x - rect.width) + 'px';
  if (rect.bottom > window.innerHeight - 4) menu.style.top = Math.max(4, y - rect.height) + 'px';
}

function hide() {
  if (!current) return;
  current.remove();
  current = null;
  document.removeEventListener('pointerdown', onOutside, true);
  document.removeEventListener('keydown', onKey, true);
  window.removeEventListener('wheel', hide, true);
  window.removeEventListener('resize', hide);
}

function onOutside(e) {
  if (current && !current.contains(e.target)) hide();
}

function onKey(e) {
  if (e.key === 'Escape') { e.stopPropagation(); hide(); }
}

export const contextMenu = {
  /**
   * @param {number} x 屏幕坐标
   * @param {number} y
   * @param {Array<{label?:string, icon?:string, action?:Function, disabled?:boolean, divider?:boolean}>} items
   */
  show(x, y, items) {
    hide();
    const menu = document.createElement('div');
    menu.className = 'ctxmenu';

    for (const item of items || []) {
      if (!item) continue;
      if (item.divider) {
        const d = document.createElement('div');
        d.className = 'ctxmenu__divider';
        menu.appendChild(d);
        continue;
      }
      const btn = document.createElement('button');
      btn.className = 'ctxmenu__item';
      btn.type = 'button';
      btn.disabled = !!item.disabled;
      if (item.icon) btn.appendChild(icon(item.icon));
      const label = document.createElement('span');
      label.textContent = item.label ?? '';
      btn.appendChild(label);
      btn.addEventListener('click', () => {
        hide();
        try { item.action?.(); } catch (err) { console.error('[ctxmenu]', err); }
      });
      menu.appendChild(btn);
    }

    document.body.appendChild(menu);
    current = menu;
    place(menu, x, y);

    setTimeout(() => {
      document.addEventListener('pointerdown', onOutside, true);
      document.addEventListener('keydown', onKey, true);
      window.addEventListener('wheel', hide, true);
      window.addEventListener('resize', hide);
    }, 0);
  },

  hide
};

export function initContextMenu() {
  if (bound) return;
  bound = true;
  window.addEventListener('blur', hide);
}