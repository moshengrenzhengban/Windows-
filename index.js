// 职责：应用清单集中注册。新增应用只改这个文件
import AppRegistry from '../services/appRegistry.js';

const manifests = [
  {
    id: 'explorer',
    name: '文件资源管理器',
    icon: 'explorer',
    category: 'system',
    preinstalled: true,
    singleton: false,
    lazy: true,
    entry: () => import('./explorer/index.js'),
    defaultSize: { w: 900, h: 600 },
    minSize: { w: 480, h: 320 },
    resizable: true,
    pinnedToTaskbar: true,
    pinnedToStart: true,
    extensions: []
  },
  {
    id: 'notepad',
    name: '记事本',
    icon: 'notepad',
    category: 'system',
    preinstalled: true,
    singleton: false,
    lazy: true,
    entry: () => import('./notepad/index.js'),
    defaultSize: { w: 720, h: 480 },
    minSize: { w: 360, h: 240 },
    resizable: true,
    pinnedToTaskbar: true,
    pinnedToStart: true,
    extensions: ['.txt', '.md', '.log']
  },
  {
    id: 'calculator',
    name: '计算器',
    icon: 'calculator',
    category: 'system',
    preinstalled: true,
    singleton: false,
    lazy: true,
    entry: () => import('./calculator/index.js'),
    defaultSize: { w: 360, h: 540 },
    minSize: { w: 300, h: 420 },
    resizable: true,
    pinnedToTaskbar: true,
    pinnedToStart: true,
    extensions: []
  },
  {
    id: 'settings',
    name: '设置',
    icon: 'settings',
    category: 'system',
    preinstalled: true,
    singleton: true,
    lazy: true,
    entry: () => import('./settings/index.js'),
    defaultSize: { w: 900, h: 640 },
    minSize: { w: 600, h: 420 },
    resizable: true,
    pinnedToTaskbar: false,
    pinnedToStart: true,
    extensions: []
  }
];

for (const m of manifests) AppRegistry.register(m);

export default manifests;