// 职责：窗口生命周期、几何、焦点、拖拽、8 向缩放、贴靠、最大化/最小化
import bus from '../core/eventbus.js';
import store from '../core/store.js';
import { uid, clamp } from '../core/utils.js';
import AppRegistry from './appRegistry.js';

const wins = new Map(); // id -> { state, dom, app, contentEl }
const RESIZE_DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

function taskbarHeight() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--taskbar-h');
  return parseFloat(v) || 48;
}

function workArea() {
  return { w: window.innerWidth, h: window.innerHeight - taskbarHeight() };
}

function emit(ev, payload) {
  bus.emit('wm:' + ev, payload);
}

function updateStoreWindows() {
  store.set('windows', Array.from(wins.values()).map(w => w.state));
}

function applyGeom(rec) {
  const { state, dom } = rec;
  dom.style.left = state.x + 'px';
  dom.style.top = state.y + 'px';
  dom.style.width = state.width + 'px';
  dom.style.height = state.height + 'px';
  dom.style.transform = '';
}

function buildDOM(state) {
  const dom = document.createElement('div');
  dom.className = 'window';
  dom.dataset.winId = state.id;
  dom.innerHTML = `
    <div class="window__titlebar">
      <svg class="window__icon"><use href="#i-${state.icon}"/></svg>
      <div class="window__title"></div>
      <div class="window__controls">
        <button class="wc wc--min" title="最小化"></button>
        <button class="wc wc--max" title="最大化"></button>
        <button class="wc wc--close" title="关闭"></button>
      </div>
    </div>
    <div class="window__content"></div>
  `;
  for (const dir of RESIZE_DIRS) {
    const handle = document.createElement('div');
    handle.className = 'rh rh--' + dir;
    handle.dataset.dir = dir;
    dom.appendChild(handle);
  }
  dom.querySelector('.window__title').textContent = state.title;
  return dom;
}

function makeCtx(id, manifest) {
  return {
    winId: id,
    get payload() { return wins.get(id)?.state.payload ?? null; },
    win: {
      setTitle: (t) => wm.setTitle(id, t),
      setIcon: (i) => wm.setIcon(id, i),
      setDirty: (b) => wm.setDirty(id, b),
      close: () => wm.close(id),
      minimize: () => wm.minimize(id),
      maximize: () => wm.maximize(id),
      restore: () => wm.restore(id)
    },
    vfs: null,
    app: manifest,
    onDestroy: (cb) => {
      const rec = wins.get(id);
      if (rec) (rec.destroyHooks ||= []).push(cb);
    }
  };
}

// ─── 拖拽 ───
function startDrag(id, ev) {
  const rec = wins.get(id);
  if (!rec) return;
  const { state, dom } = rec;

  // 最大化/贴靠状态下拖动 → 先还原为浮动尺寸
  if (state.state === 'maximized' || state.state === 'snapped-left' || state.state === 'snapped-right') {
    const restoreW = state.restoreGeom?.width || 800;
    state.width = restoreW;
    state.height = state.restoreGeom?.height || 600;
    state.x = clamp(ev.clientX - restoreW / 2, 0, window.innerWidth - restoreW);
    state.y = Math.max(0, ev.clientY - 18);
    state.state = 'normal';
    state.restoreGeom = null;
    applyGeom(rec);
  }

  const startX = ev.clientX;
  const startY = ev.clientY;
  const ox = state.x;
  const oy = state.y;
  let nx = ox;
  let ny = oy;
  let raf = 0;

  dom.classList.add('window--dragging');
  document.body.classList.add('is-dragging');

  const onMove = (e) => {
    nx = ox + (e.clientX - startX);
    ny = oy + (e.clientY - startY);
    if (!raf) {
      raf = requestAnimationFrame(() => {
        raf = 0;
        dom.style.transform = `translate3d(${nx - ox}px, ${ny - oy}px, 0)`;
      });
    }
    showSnapPreview(nx, ny, state);
  };

  const onUp = (e) => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    if (raf) cancelAnimationFrame(raf);
    dom.classList.remove('window--dragging');
    document.body.classList.remove('is-dragging');
    hideSnapPreview();

    const snap = detectSnap(nx, ny, state);
    if (snap === 'maximize') {
      state.x = nx; state.y = ny;
      state.restoreGeom = { x: ox, y: oy, width: state.width, height: state.height };
      applyGeom(rec);
      wm.maximize(id);
    } else if (snap === 'left' || snap === 'right') {
      state.x = nx; state.y = ny;
      applyGeom(rec);
      wm.snap(id, snap);
    } else {
      state.x = nx;
      state.y = ny;
      applyGeom(rec);
    }

    // 边界约束：标题栏至少 40px 留在视口内
    const minVisible = 60;
    state.x = clamp(state.x, -(state.width - minVisible), window.innerWidth - minVisible);
    state.y = clamp(state.y, 0, window.innerHeight - taskbarHeight() - 40);
    applyGeom(rec);

    updateStoreWindows();
    emit('geometry', state);
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

// ─── 缩放 ───
function startResize(id, dir, ev) {
  const rec = wins.get(id);
  if (!rec) return;
  const { state, dom } = rec;
  if (!state.resizable) return;

  const startX = ev.clientX;
  const startY = ev.clientY;
  const o = { x: state.x, y: state.y, w: state.width, h: state.height };
  let cur = { ...o };
  let raf = 0;

  dom.classList.add('window--resizing');
  document.body.classList.add('is-dragging');

  const onMove = (e) => {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    let { x, y, w, h } = o;

    if (dir.includes('e')) w = Math.max(state.minWidth, o.w + dx);
    if (dir.includes('s')) h = Math.max(state.minHeight, o.h + dy);
    if (dir.includes('w')) {
      w = Math.max(state.minWidth, o.w - dx);
      x = o.x + (o.w - w);
    }
    if (dir.includes('n')) {
      h = Math.max(state.minHeight, o.h - dy);
      y = o.y + (o.h - h);
    }
    cur = { x, y, w, h };

    if (!raf) {
      raf = requestAnimationFrame(() => {
        raf = 0;
        dom.style.left = cur.x + 'px';
        dom.style.top = cur.y + 'px';
        dom.style.width = cur.w + 'px';
        dom.style.height = cur.h + 'px';
      });
    }
  };

  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    if (raf) cancelAnimationFrame(raf);
    dom.classList.remove('window--resizing');
    document.body.classList.remove('is-dragging');
    Object.assign(state, { x: cur.x, y: cur.y, width: cur.w, height: cur.h });
    applyGeom(rec);
    updateStoreWindows();
    emit('geometry', state);
    rec.app?.onResize?.(state.width, state.height);
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

// ─── 贴靠预览 ───
function snapAreaFor(snap) {
  const wa = workArea();
  if (snap === 'left') return { x: 0, y: 0, w: wa.w / 2, h: wa.h };
  if (snap === 'right') return { x: wa.w / 2, y: 0, w: wa.w / 2, h: wa.h };
  if (snap === 'maximize') return { x: 0, y: 0, w: wa.w, h: wa.h };
  return null;
}

function detectSnap(x, y, state) {
  const edge = 20;
  if (y <= 0) return 'maximize';
  if (x <= edge) return 'left';
  if (x + state.width >= window.innerWidth - edge) return 'right';
  return null;
}

function showSnapPreview(x, y, state) {
  const snap = detectSnap(x, y, state);
  const preview = document.getElementById('snap-preview');
  if (!preview) return;
  const area = snapAreaFor(snap);
  if (!area) { preview.hidden = true; return; }
  preview.hidden = false;
  preview.style.left = area.x + 'px';
  preview.style.top = area.y + 'px';
  preview.style.width = area.w + 'px';
  preview.style.height = area.h + 'px';
}

function hideSnapPreview() {
  const preview = document.getElementById('snap-preview');
  if (preview) preview.hidden = true;
}

const wm = {
  /**
   * 打开应用
   * @returns {Promise<string>} winId
   */
  async open(appId, { payload = null, forceNew = false } = {}) {
    const manifest = AppRegistry.get(appId);
    if (!manifest) throw new Error('未注册的应用: ' + appId);

    if (manifest.singleton && !forceNew) {
      const existing = Array.from(wins.values()).find(w => w.state.appId === appId);
      if (existing) {
        if (existing.state.state === 'minimized') wm.restore(existing.state.id);
        wm.focus(existing.state.id);
        existing.app?.onPayload?.(payload);
        return existing.state.id;
      }
    }

    const id = uid('win');
    const wa = workArea();
    const dw = manifest.defaultSize?.w || 800;
    const dh = manifest.defaultSize?.h || 600;
    const w = Math.min(dw, Math.max(320, wa.w - 40));
    const h = Math.min(dh, Math.max(240, wa.h - 40));
    const offset = (wins.size % 6) * 24;
    const x = Math.max(0, Math.round((wa.w - w) / 2) + offset);
    const y = Math.max(0, Math.round((wa.h - h) / 2) + offset);

    const state = {
      id,
      appId,
      title: manifest.name,
      icon: manifest.icon,
      x, y, width: w, height: h,
      restoreGeom: null,
      minWidth: manifest.minSize?.w || 320,
      minHeight: manifest.minSize?.h || 200,
      resizable: manifest.resizable !== false,
      state: 'normal',
      zIndex: ++store.raw.zCounter,
      dirty: false,
      payload,
      instanceKey: id
    };

    const dom = buildDOM(state);
    dom.style.left = state.x + 'px';
    dom.style.top = state.y + 'px';
    dom.style.width = state.width + 'px';
    dom.style.height = state.height + 'px';
    dom.style.zIndex = state.zIndex;

    const contentEl = dom.querySelector('.window__content');
    contentEl.innerHTML = '<div class="skeleton">正在加载…</div>';

    const rec = { state, dom, app: null, contentEl, destroyHooks: [] };
    wins.set(id, rec);
    document.getElementById('window-layer').appendChild(dom);

    // 事件绑定
    dom.querySelector('.wc--min').addEventListener('click', (e) => { e.stopPropagation(); wm.minimize(id); });
    dom.querySelector('.wc--max').addEventListener('click', (e) => { e.stopPropagation(); wm.toggleMaximize(id); });
    dom.querySelector('.wc--close').addEventListener('click', (e) => { e.stopPropagation(); wm.close(id); });
    dom.addEventListener('pointerdown', () => wm.focus(id), true);

    const titlebar = dom.querySelector('.window__titlebar');
    titlebar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.wc')) return;
      if (e.button !== 0) return;
      e.preventDefault();
      startDrag(id, e);
    });
    titlebar.addEventListener('dblclick', (e) => {
      if (e.target.closest('.wc')) return;
      wm.toggleMaximize(id);
    });

    dom.addEventListener('pointerdown', (e) => {
      const handle = e.target.closest('.rh');
      if (!handle) return;
      e.preventDefault();
      e.stopPropagation();
      startResize(id, handle.dataset.dir, e);
    });

    updateStoreWindows();
    emit('open', state);
    wm.focus(id);

    // 懒加载应用模块
    try {
      const mod = await manifest.entry();
      const ctx = makeCtx(id, manifest);
      // 注入服务（避免每个应用重复 import）
      const [{ default: vfs }, { default: notify }, { default: clipboardStub }] = await Promise.all([
        import('./vfs.js'),
        import('./notification.js'),
        Promise.resolve({ default: null })
      ]);
      ctx.vfs = vfs;
      ctx.notify = notify;
      ctx.clipboard = clipboardStub;
      rec.ctx = ctx;

      const app = mod.create(ctx);
      rec.app = app;
      contentEl.replaceChildren();
      app.mount?.(contentEl);
      app.onPayload?.(payload);
    } catch (err) {
      console.error('[wm] 应用加载失败', appId, err);
      contentEl.textContent = '应用加载失败：' + (err?.message || err);
    }

    return id;
  },

  close(id) {
    const rec = wins.get(id);
    if (!rec) return;

    try { rec.app?.unmount?.(); } catch (err) { console.error('[wm] unmount', err); }
    for (const cb of rec.destroyHooks || []) {
      try { cb(); } catch (err) { console.error('[wm] destroy hook', err); }
    }

    rec.dom.remove();
    wins.delete(id);

    if (store.raw.focusWinId === id) {
      store.set('focusWinId', null);
      const next = Array.from(wins.values())
        .filter(w => w.state.state !== 'minimized')
        .sort((a, b) => b.state.zIndex - a.state.zIndex)[0];
      if (next) wm.focus(next.state.id);
    }

    updateStoreWindows();
    emit('close', rec.state);
  },

  minimize(id) {
    const rec = wins.get(id);
    if (!rec || rec.state.state === 'minimized') return;
    rec.state.state = 'minimized';
    rec.dom.classList.add('window--minimized');
    if (store.raw.focusWinId === id) store.set('focusWinId', null);
    updateStoreWindows();
    emit('minimize', rec.state);
  },

  restore(id) {
    const rec = wins.get(id);
    if (!rec) return;
    rec.state.state = 'normal';
    rec.dom.classList.remove('window--minimized');
    applyGeom(rec);
    wm.focus(id);
    updateStoreWindows();
    emit('restore', rec.state);
  },

  maximize(id) {
    const rec = wins.get(id);
    if (!rec) return;
    const { state } = rec;
    if (state.state === 'maximized') return;
    if (state.state === 'normal') {
      state.restoreGeom = { x: state.x, y: state.y, width: state.width, height: state.height };
    }
    const wa = workArea();
    Object.assign(state, { x: 0, y: 0, width: wa.w, height: wa.h, state: 'maximized' });
    applyGeom(rec);
    updateStoreWindows();
    emit('geometry', state);
    rec.app?.onResize?.(state.width, state.height);
  },

  toggleMaximize(id) {
    const rec = wins.get(id);
    if (!rec) return;
    if (rec.state.state === 'maximized' || rec.state.state.startsWith('snapped')) wm.unmaximize(id);
    else wm.maximize(id);
  },

  unmaximize(id) {
    const rec = wins.get(id);
    if (!rec) return;
    const { state } = rec;
    if (state.restoreGeom) {
      Object.assign(state, state.restoreGeom, { state: 'normal', restoreGeom: null });
    } else {
      state.state = 'normal';
    }
    applyGeom(rec);
    updateStoreWindows();
    emit('geometry', state);
    rec.app?.onResize?.(state.width, state.height);
  },

  snap(id, dir) {
    const rec = wins.get(id);
    if (!rec) return;
    const area = snapAreaFor(dir);
    if (!area) return;
    if (rec.state.state === 'normal') {
      rec.state.restoreGeom = {
        x: rec.state.x, y: rec.state.y,
        width: rec.state.width, height: rec.state.height
      };
    }
    Object.assign(rec.state, {
      x: area.x, y: area.y, width: area.w, height: area.h,
      state: dir === 'left' ? 'snapped-left' : 'snapped-right'
    });
    applyGeom(rec);
    updateStoreWindows();
    emit('geometry', rec.state);
    rec.app?.onResize?.(rec.state.width, rec.state.height);
  },

  focus(id) {
    const rec = wins.get(id);
    if (!rec) return;
    if (store.raw.focusWinId === id) return;

    for (const [wid, w] of wins) {
      w.dom.classList.toggle('window--focused', wid === id);
      if (wid === id) w.dom.style.zIndex = ++store.raw.zCounter;
      else w.app?.onBlur?.();
    }
    store.set('focusWinId', id);
    rec.app?.onFocus?.();
    emit('focus', rec.state);
  },

  blur(id) {
    const rec = wins.get(id);
    if (!rec) return;
    rec.dom.classList.remove('window--focused');
    rec.app?.onBlur?.();
    emit('blur', rec.state);
  },

  setTitle(id, title) {
    const rec = wins.get(id);
    if (!rec) return;
    rec.state.title = String(title ?? '');
    rec.dom.querySelector('.window__title').textContent = rec.state.title;
    updateStoreWindows();
    emit('title', rec.state);
  },

  setIcon(id, iconName) {
    const rec = wins.get(id);
    if (!rec) return;
    rec.state.icon = iconName;
    rec.dom.querySelector('.window__icon use')?.setAttribute('href', '#i-' + iconName);
    updateStoreWindows();
  },

  setDirty(id, dirty) {
    const rec = wins.get(id);
    if (!rec) return;
    rec.state.dirty = !!dirty;
    emit('dirty', rec.state);
  },

  get(id) { return wins.get(id)?.state || null; },

  list() { return Array.from(wins.values()).map(w => w.state); },

  minimizeAll() {
    for (const id of wins.keys()) wm.minimize(id);
  },

  /** Alt+Tab 循环焦点 */
  cycleFocus(dir = 1) {
    const visible = Array.from(wins.values())
      .filter(w => w.state.state !== 'minimized')
      .sort((a, b) => a.state.zIndex - b.state.zIndex);
    if (visible.length < 2) return;
    const cur = visible.findIndex(w => w.state.id === store.raw.focusWinId);
    const next = visible[(cur + dir + visible.length) % visible.length];
    wm.focus(next.state.id);
  },

  on(ev, cb) {
    return bus.on('wm:' + ev, cb);
  }
};

export default wm;