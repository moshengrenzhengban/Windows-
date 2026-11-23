// 职责：应用清单注册表与打开入口
import wm from './windowManager.js';

const manifests = new Map();

const AppRegistry = {
  register(manifest) {
    if (!manifest?.id) throw new Error('manifest.id 必填');
    if (manifests.has(manifest.id)) console.warn('[registry] 覆盖已注册应用:', manifest.id);
    manifests.set(manifest.id, manifest);
    return manifest;
  },

  get(id) { return manifests.get(id) || null; },

  list(filter) {
    const all = Array.from(manifests.values());
    return typeof filter === 'function' ? all.filter(filter) : all;
  },

  search(keyword) {
    const kw = String(keyword || '').toLowerCase();
    if (!kw) return [];
    return AppRegistry.list(m => m.name.toLowerCase().includes(kw) || m.id.includes(kw));
  },

  open(id, payload) {
    return wm.open(id, { payload });
  }
};

export default AppRegistry;