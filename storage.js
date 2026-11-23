// 职责：localStorage 的 JSON 封装，统一加 win11: 前缀，全部 try/catch
const NS = 'win11:';

export default {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(NS + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (err) {
      console.warn('[storage] get failed', key, err);
      return fallback;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(NS + key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn('[storage] set failed', key, err);
      return false;
    }
  },

  remove(key) {
    try { localStorage.removeItem(NS + key); } catch (err) { /* ignore */ }
  },

  clearAll() {
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith(NS))
        .forEach(k => localStorage.removeItem(k));
    } catch (err) { /* ignore */ }
  }
};