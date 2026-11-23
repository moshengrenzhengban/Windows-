// 职责：全局事件总线。事件命名 domain:action（如 wm:open、vfs:change）
const listeners = new Map();

const bus = {
  /**
   * 订阅事件
   * @returns {() => void} 取消订阅函数
   */
  on(event, cb) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(cb);
    return () => bus.off(event, cb);
  },

  off(event, cb) {
    listeners.get(event)?.delete(cb);
  },

  emit(event, payload) {
    const set = listeners.get(event);
    if (!set) return;
    for (const cb of [...set]) {
      try { cb(payload); } catch (err) { console.error('[bus]', event, err); }
    }
  },

  once(event, cb) {
    const off = bus.on(event, (p) => { off(); cb(p); });
    return off;
  }
};

export default bus;