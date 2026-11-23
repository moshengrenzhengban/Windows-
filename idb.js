// 职责：IndexedDB 极简封装。若环境不支持则降级到内存 Map（会话有效）
const DB_NAME = 'win11-fs';
const STORE = 'content';

const memory = new Map();
let dbPromise = null;
let supported = typeof indexedDB !== 'undefined';

function open() {
  if (!supported) return Promise.reject(new Error('IndexedDB 不可用'));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  }).catch((err) => {
    supported = false;
    console.warn('[idb] 降级为内存存储：', err.message);
    throw err;
  });
  return dbPromise;
}

async function run(mode, fn) {
  if (!supported) return fn(null);
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let req;
    try { req = fn(store); } catch (err) { reject(err); return; }
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('aborted'));
  });
}

export default {
  get supported() { return supported; },

  async put(key, value) {
    if (!supported) { memory.set(key, value); return; }
    try { await run('readwrite', s => s.put(value, key)); } catch { memory.set(key, value); }
  },

  async get(key) {
    if (!supported) return memory.get(key);
    try { return await run('readonly', s => s.get(key)); } catch { return memory.get(key); }
  },

  async delete(key) {
    if (!supported) { memory.delete(key); return; }
    try { await run('readwrite', s => s.delete(key)); } catch { memory.delete(key); }
  },

  async clear() {
    if (!supported) { memory.clear(); return; }
    try { await run('readwrite', s => s.clear()); } catch { memory.clear(); }
  }
};