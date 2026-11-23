// 职责：设置读写、持久化（300ms 防抖）、自动应用到 documentElement
import store from '../core/store.js';
import ls from '../core/storage.js';
import { debounce } from '../core/utils.js';

const subs = new Set();
const persist = debounce(() => ls.set('settings', store.raw.settings), 300);

function apply(key, value) {
  const root = document.documentElement;
  if (key === 'theme.mode') root.dataset.theme = value;
  if (key === 'theme.accent') root.style.setProperty('--accent', value);
  if (key === 'reducedMotion') root.dataset.reducedMotion = value ? '1' : '';
  if (key === 'taskbar.align') {
    const bar = document.getElementById('taskbar');
    if (bar) bar.dataset.align = value;
  }
  if (key === 'theme.wallpaper') {
    const wp = document.querySelector('.wallpaper');
    if (wp) wp.dataset.wp = value;
  }
}

const settings = {
  init() {
    for (const key of Object.keys(store.raw.settings)) apply(key, store.raw.settings[key]);
  },

  get(key) { return store.get('settings.' + key); },

  getAll() { return { ...store.raw.settings }; },

  set(key, value) {
    store.set('settings.' + key, value);
    apply(key, value);
    persist();
    for (const cb of subs) {
      try { cb(key, value); } catch (err) { console.error('[settings]', err); }
    }
  },

  reset() {
    store.set('settings', {
      'theme.mode': 'light',
      'theme.accent': '#0067c0',
      'theme.wallpaper': 'wallpaper-1',
      'taskbar.align': 'center',
      'lang': 'zh-CN',
      'reducedMotion': false,
      'timeFormat': '24h'
    });
    for (const [k, v] of Object.entries(store.raw.settings)) apply(k, v);
    persist();
  },

  on(cb) {
    subs.add(cb);
    return () => subs.delete(cb);
  }
};

export default settings;