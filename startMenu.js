// 职责：开始菜单。固定应用网格、全部应用、电源
import store from '../core/store.js';
import AppRegistry from '../services/appRegistry.js';
import notification from '../services/notification.js';
import { icon } from '../core/utils.js';

let open = false;

function render(menu) {
  menu.replaceChildren();

  // 搜索
  const search = document.createElement('div');
  search.className = 'startmenu__search';
  search.appendChild(icon('search'));
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = '搜索应用、设置和文档';
  search.appendChild(input);
  menu.appendChild(search);

  const title = document.createElement('div');
  title.className = 'startmenu__section-title';
  const titleText = document.createElement('span');
  titleText.textContent = '已固定';
  title.appendChild(titleText);
  menu.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'startmenu__grid';
  for (const m of AppRegistry.list(m => m.pinnedToStart !== false)) {
    const btn = document.createElement('button');
    btn.className = 'startmenu__app';
    btn.appendChild(icon(m.icon));
    const span = document.createElement('span');
    span.textContent = m.name;
    btn.appendChild(span);
    btn.addEventListener('click', () => {
      AppRegistry.open(m.id);
      toggle(false);
    });
    grid.appendChild(btn);
  }
  menu.appendChild(grid);

  const allTitle = document.createElement('div');
  allTitle.className = 'startmenu__section-title';
  const allText = document.createElement('span');
  allText.textContent = '所有应用';
  allTitle.appendChild(allText);
  menu.appendChild(allTitle);

  const all = document.createElement('div');
  all.className = 'startmenu__all';
  const apps = AppRegistry.list().sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  const renderAll = (list) => {
    all.replaceChildren();
    for (const m of list) {
      const btn = document.createElement('button');
      btn.className = 'startmenu__all-item';
      btn.appendChild(icon(m.icon));
      const span = document.createElement('span');
      span.textContent = m.name;
      btn.appendChild(span);
      btn.addEventListener('click', () => { AppRegistry.open(m.id); toggle(false); });
      all.appendChild(btn);
    }
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'app-explorer__empty';
      empty.textContent = '没有匹配的应用';
      all.appendChild(empty);
    }
  };
  renderAll(apps);
  menu.appendChild(all);

  input.addEventListener('input', () => {
    const kw = input.value.trim();
    renderAll(kw ? AppRegistry.search(kw) : apps);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = all.querySelector('.startmenu__all-item');
      if (first) first.click();
    }
  });

  const footer = document.createElement('div');
  footer.className = 'startmenu__footer';

  const user = document.createElement('div');
  user.className = 'startmenu__user';
  const avatar = document.createElement('div');
  avatar.className = 'startmenu__avatar';
  avatar.textContent = 'U';
  user.appendChild(avatar);
  const uname = document.createElement('span');
  uname.textContent = 'User';
  user.appendChild(uname);
  footer.appendChild(user);

  const power = document.createElement('button');
  power.className = 'startmenu__power';
  power.title = '电源';
  power.appendChild(icon('power'));
  power.addEventListener('click', () => {
    toggle(false);
    notification.show({ title: '电源', body: '关机流程见第 6.7 节 shutdown.js（本次未实现）', duration: 3000 });
  });
  footer.appendChild(power);

  menu.appendChild(footer);

  setTimeout(() => input.focus(), 60);
}

export function toggleStartMenu(force) {
  const menu = document.getElementById('start-menu');
  if (!menu) return;
  const next = typeof force === 'boolean' ? force : !open;
  if (next === open) return;
  open = next;

  if (open) {
    render(menu);
    menu.classList.add('open');
    menu.setAttribute('aria-hidden', 'false');
    setTimeout(() => {
      document.addEventListener('pointerdown', onOutside, true);
      document.addEventListener('keydown', onKey, true);
    }, 0);
  } else {
    menu.classList.remove('open');
    menu.setAttribute('aria-hidden', 'true');
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
  }
  store.set('startMenuOpen', open);
}

function onOutside(e) {
  const menu = document.getElementById('start-menu');
  if (menu && !menu.contains(e.target) && !e.target.closest('#tb-start')) toggleStartMenu(false);
}

function onKey(e) {
  if (e.key === 'Escape') toggleStartMenu(false);
}

export function initStartMenu() {
  // 由任务栏按钮触发
}