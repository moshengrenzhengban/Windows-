// 职责：虚拟文件系统。元数据树存 localStorage，内容存 IndexedDB。
// 所有写操作走 Promise 串行队列，保证一致性。
import ls from '../core/storage.js';
import idb from '../core/idb.js';
import bus from '../core/eventbus.js';
import { uid, splitPath } from '../core/utils.js';

const TREE_KEY = 'vfs:tree';
const ROOT_ID = 'root';

let tree = null;
let queue = Promise.resolve();

function serial(fn) {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}

function persist() {
  ls.set(TREE_KEY, { nodes: tree.nodes, rootId: tree.rootId });
}

function now() { return Date.now(); }

function makeNode(partial) {
  return {
    id: uid('n'),
    name: '',
    type: 'file',
    parentId: ROOT_ID,
    mime: 'text/plain',
    size: 0,
    contentId: null,
    createdAt: now(),
    mtime: now(),
    ...partial
  };
}

function defaultTree() {
  const nodes = {};
  const root = makeNode({ id: ROOT_ID, name: '', type: 'folder', parentId: null });
  nodes[root.id] = root;
  for (const name of ['桌面', '文档', '图片', '下载', '回收站']) {
    const n = makeNode({ name, type: 'folder', parentId: ROOT_ID });
    nodes[n.id] = n;
  }
  return { nodes, rootId: ROOT_ID };
}

function findChild(parentId, name) {
  return Object.values(tree.nodes).find(n => n.parentId === parentId && n.name === name) || null;
}

function nodeById(id) {
  return tree.nodes[id] || null;
}

/** 由路径解析节点，'/文档/a.txt' */
function resolveNode(pathOrId) {
  if (!pathOrId || pathOrId === '/') return tree.nodes[tree.rootId];
  if (tree.nodes[pathOrId]) return tree.nodes[pathOrId];
  let cur = tree.nodes[tree.rootId];
  for (const seg of splitPath(pathOrId)) {
    const child = findChild(cur.id, seg);
    if (!child) return null;
    cur = child;
  }
  return cur;
}

function emit(type, node) {
  bus.emit('vfs:change', { type, node });
}

const vfs = {
  async init() {
    const saved = ls.get(TREE_KEY, null);
    if (saved && saved.nodes && saved.rootId) {
      tree = saved;
    } else {
      tree = defaultTree();
      persist();
    }
    // 确保根目录存在
    if (!tree.nodes[tree.rootId]) {
      tree = defaultTree();
      persist();
    }
    return true;
  },

  stat(pathOrId) {
    return Promise.resolve(resolveNode(pathOrId));
  },

  getPath(id) {
    const parts = [];
    let cur = nodeById(id);
    while (cur && cur.parentId) {
      parts.unshift(cur.name);
      cur = nodeById(cur.parentId);
    }
    return '/' + parts.join('/');
  },

  async resolvePath(path) {
    const n = resolveNode(path);
    return n ? n.id : null;
  },

  readDir(pathOrId) {
    const dir = resolveNode(pathOrId);
    if (!dir) return Promise.reject(new Error('目录不存在: ' + pathOrId));
    const children = Object.values(tree.nodes)
      .filter(n => n.parentId === dir.id)
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name, 'zh-CN');
      });
    return Promise.resolve(children);
  },

  async readText(pathOrId) {
    const node = resolveNode(pathOrId);
    if (!node || node.type !== 'file') throw new Error('文件不存在: ' + pathOrId);
    if (!node.contentId) return '';
    const data = await idb.get(node.contentId);
    if (data === undefined || data === null) return '';
    return typeof data === 'string' ? data : String(data);
  },

  async readBlob(pathOrId) {
    const node = resolveNode(pathOrId);
    if (!node || node.type !== 'file') throw new Error('文件不存在: ' + pathOrId);
    if (!node.contentId) return new Blob([]);
    const data = await idb.get(node.contentId);
    return data instanceof Blob ? data : new Blob([data ?? '']);
  },

  /** 写入（存在则覆盖，create 为 true 时不存在则新建） */
  writeFile(pathOrId, content, { mime = 'text/plain', create = true } = {}) {
    return serial(async () => {
      let node = resolveNode(pathOrId);
      if (!node) {
        if (!create) throw new Error('文件不存在: ' + pathOrId);
        const segs = splitPath(pathOrId);
        const name = segs.pop();
        const parentNode = resolveNode('/' + segs.join('/')) || tree.nodes[tree.rootId];
        if (!parentNode || parentNode.type !== 'folder') throw new Error('父目录不存在');
        node = makeNode({ name, parentId: parentNode.id, mime });
        tree.nodes[node.id] = node;
      }
      const contentId = node.contentId || uid('c');
      await idb.put(contentId, content);
      node.contentId = contentId;
      node.mime = mime || node.mime;
      node.size = typeof content === 'string' ? new Blob([content]).size
        : (content instanceof Blob ? content.size : 0);
      node.mtime = now();
      persist();
      emit('write', node);
      return node.id;
    });
  },

  createFile(parentPath, name, content = '', mime = 'text/plain') {
    return serial(async () => {
      const parent = resolveNode(parentPath);
      if (!parent || parent.type !== 'folder') throw new Error('父目录不存在: ' + parentPath);
      if (findChild(parent.id, name)) throw new Error('同名文件已存在: ' + name);
      const node = makeNode({ name, parentId: parent.id, mime });
      tree.nodes[node.id] = node;
      if (content !== null) {
        const contentId = uid('c');
        await idb.put(contentId, content);
        node.contentId = contentId;
        node.size = typeof content === 'string' ? new Blob([content]).size : content.size || 0;
      }
      persist();
      emit('create', node);
      return node.id;
    });
  },

  mkdir(parentPath, name) {
    return serial(async () => {
      const parent = resolveNode(parentPath);
      if (!parent || parent.type !== 'folder') throw new Error('父目录不存在: ' + parentPath);
      if (findChild(parent.id, name)) throw new Error('同名项已存在: ' + name);
      const node = makeNode({ name, type: 'folder', parentId: parent.id });
      tree.nodes[node.id] = node;
      persist();
      emit('create', node);
      return node.id;
    });
  },

  rename(id, newName) {
    return serial(async () => {
      const node = nodeById(id);
      if (!node) throw new Error('节点不存在');
      if (!newName || newName.includes('/')) throw new Error('非法文件名');
      if (findChild(node.parentId, newName)) throw new Error('同名项已存在');
      node.name = newName;
      node.mtime = now();
      persist();
      emit('rename', node);
      return node.id;
    });
  },

  remove(id) {
    return serial(async () => {
      const node = nodeById(id);
      if (!node) throw new Error('节点不存在');
      if (node.id === tree.rootId) throw new Error('不能删除根目录');
      const collect = [];
      const walk = (n) => {
        collect.push(n);
        if (n.type === 'folder') {
          Object.values(tree.nodes).filter(c => c.parentId === n.id).forEach(walk);
        }
      };
      walk(node);
      for (const n of collect) {
        if (n.contentId) await idb.delete(n.contentId).catch(() => {});
        delete tree.nodes[n.id];
      }
      persist();
      emit('remove', node);
      return true;
    });
  },

  /** 导出整棵树（含内容）用于备份 */
  async exportAll() {
    const out = { nodes: JSON.parse(JSON.stringify(tree.nodes)), contents: {} };
    for (const n of Object.values(tree.nodes)) {
      if (n.contentId) {
        const v = await idb.get(n.contentId);
        if (typeof v === 'string') out.contents[n.contentId] = v;
      }
    }
    return out;
  },

  on(type, cb) {
    return bus.on('vfs:change', (e) => {
      if (!type || e.type === type) cb(e);
    });
  }
};

export default vfs;