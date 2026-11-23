// 职责：右下角 Toast 通知。自动消失，可点击
import { uid } from '../core/utils.js';

const MAX = 4;

const notification = {
  /**
   * @param {{title:string, body?:string, duration?:number, onClick?:Function}} opts
   * @returns {string} 通知 id
   */
  show({ title, body = '', duration = 4000, onClick } = {}) {
    const layer = document.getElementById('toast-layer');
    if (!layer) return '';
    const id = uid('toast');

    // 超出上限移除最旧
    while (layer.children.length >= MAX) layer.firstElementChild.remove();

    const node = document.createElement('div');
    node.className = 'toast';
    node.dataset.toastId = id;

    const t = document.createElement('div');
    t.className = 'toast__title';
    t.textContent = String(title ?? '');
    node.appendChild(t);

    if (body) {
      const b = document.createElement('div');
      b.className = 'toast__body';
      b.textContent = String(body);
      node.appendChild(b);
    }

    if (typeof onClick === 'function') {
      node.style.cursor = 'pointer';
      node.addEventListener('click', () => { onClick(); node.remove(); });
    }

    layer.appendChild(node);
    if (duration > 0) setTimeout(() => node.remove(), duration);
    return id;
  },

  clear(id) {
    document.querySelector(`[data-toast-id="${id}"]`)?.remove();
  },

  clearAll() {
    document.getElementById('toast-layer')?.replaceChildren();
  }
};

export default notification;