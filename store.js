// 职责：单一状态树。支持 a.b.c 路径读写与路径订阅
import bus from './eventbus.js';
import ls from './storage.js';

const DEFAULT_SETTINGS = {
  'theme.mode': 'light',
  'theme.accent': '#0067c0',
  'theme.wallpaper': 'wallpaper-1',
  'taskbar.align': 'center',
  'lang': 'zh-CN',
  'reducedMotion': false,
  'timeFormat': '24h'
};

const state = {
  windows: [],
  focusWinId: null,
  zCounter: 10,
  desktopIcons: ls.get('desktop', null),
  selectedIconIds: [],
  taskbar: { pinned: [], running: {} },
  startMenuOpen: false,
  searchOpen: false,
  notifPanelOpen: false,
  contextMenu: null,
  notifications: [],
  settings: { ...DEFAULT_SETTINGS, ...ls.get('settings', {}) },
  permissions: {}
};

const subs = new Map();

function getPath(obj, path) {
  return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, path, value) {
  const keys = String(path).split('.');
  const last = keys.pop();
  let cur = obj;
  for (const k of keys) {
    if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
    cur = cur[k];
  }
  cur[last] = value;
}

const store = {
  /** 读取路径值，undefined 时返回 fallback */
  get(path, fallback) {
    const v = getPath(state, path);
    return v === undefined ? fallback : v;
  },

  /** 写入路径并通知订阅者 */
  set(path, value) {
    setPath(state, path, value);
    store._notify(path);
  },

  /** 浅合并写入 */
  patch(path, obj) {
    const cur = getPath(state, path) || {};
    setPath(state, path, { ...cur, ...obj });
    store._notify(path);
  },

  /**
   * 订阅路径。路径互为前缀时也会触发
   * @returns {() => void}
   */
  subscribe(path, cb) {
    if (!subs.has(path)) subs.set(path, new Set());
    subs.get(path).add(cb);
    return () => subs.get(path)?.delete(cb);
  },

  _notify(changedPath) {
    for (const [p, set] of subs) {
      if (changedPath === p || changedPath.startsWith(p + '.') || p.startsWith(changedPath + '.')) {
        for (const cb of set) {
          try { cb(store.get(p), changedPath); } catch (err) { console.error('[store]', err); }
        }
      }
    }
    bus.emit('store:change', { path: changedPath });
  },

  /** 直接访问原始状态（只读约定，服务内部使用） */
  raw: state
};

export default store;