'use strict';

/**
 * Дымовой тест приложения без браузера: поднимает минимальный DOM-стаб,
 * выполняет recipes.js и инлайн-скрипт index.html, затем проверяет,
 * что карточка, счётчик, фильтры и рулетка работают.
 *
 * Запуск: node scripts/smoke-app.js
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'app');

function makeElement(tag = 'div') {
  const element = {
    tagName: tag,
    children: [],
    style: { setProperty() {} },
    textContent: '',
    innerHTML: '',
    src: '',
    disabled: false,
    offsetWidth: 0,
    onclick: null,
    classList: {
      values: new Set(),
      add(...names) { names.forEach((name) => this.values.add(name)); },
      remove(...names) { names.forEach((name) => this.values.delete(name)); },
      toggle(name, force) {
        const state = force === undefined ? !this.values.has(name) : force;
        if (state) this.values.add(name); else this.values.delete(name);
        return state;
      },
      contains(name) { return this.values.has(name); },
    },
    appendChild(child) { this.children.push(child); return child; },
    addEventListener() {},
    remove() {},
    setAttribute() {},
  };
  return element;
}

const elements = new Map();
const document = {
  body: makeElement('body'),
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, makeElement());
    return elements.get(id);
  },
  createElement(tag) { return makeElement(tag); },
  addEventListener() {},
};

const sandbox = {
  console,
  document,
  navigator: {},
  setTimeout,
  clearTimeout,
  Image: class { constructor() { this.src = ''; } },
  Math,
  Promise,
};
vm.createContext(sandbox);

vm.runInContext(fs.readFileSync(path.join(APP, 'recipes.js'), 'utf8'), sandbox, { filename: 'recipes.js' });
const { RECIPES } = vm.runInContext('({ RAW_RECIPES, RECIPES })', sandbox, { filename: 'exports.js' });
const expectedCuisines = 1 + new Set(RECIPES.map((recipe) => recipe.cuisine)).size;

const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const inline = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]).pop();

const problems = [];
const check = (condition, message) => { if (!condition) problems.push(message); };

try {
  vm.runInContext(inline, sandbox, { filename: 'index.html:inline' });
} catch (error) {
  problems.push(`инициализация упала: ${error.message}`);
}

const filters = document.getElementById('filters');
const grid = document.getElementById('cuisineGrid');
const name = document.getElementById('name');
const counter = document.getElementById('counter');
const meta = document.getElementById('meta');
const img = document.getElementById('dishImg');

check(filters.children.length === 3, `фильтров приёмов пищи: ${filters.children.length}, ждали 3`);
check(name.textContent && name.textContent !== 'Загрузка...', `карточка не заполнилась: "${name.textContent}"`);
check(/блюд|блюдо|блюда/.test(counter.innerHTML), `счётчик пустой: "${counter.innerHTML}"`);
check(/⏱/.test(meta.innerHTML), 'в мете нет времени');
check(/images\//.test(img.src), `карточка не получила фото: "${img.src}"`);

// Открываем шторку кухонь
try {
  document.getElementById('settingsBtn').onclick();
} catch (error) {
  problems.push(`открытие шторки: ${error.message}`);
}
check(grid.children.length === expectedCuisines, `кнопок кухонь: ${grid.children.length}, ждали ${expectedCuisines}`);

// Выбираем первую кухню после «Все»
const cuisineButton = grid.children[1];
try {
  cuisineButton.onclick();
} catch (error) {
  problems.push(`выбор кухни: ${error.message}`);
}
check(/active-tag/.test(counter.innerHTML), 'после выбора кухни счётчик не показал тег кухни');

// Прокрут рулетки (кнопка хранит ссылку на roll)
(async () => {
  try {
    await document.getElementById('rollBtn').onclick();
  } catch (error) {
    problems.push(`рулетка упала: ${error.message}`);
  }

  const recipeContent = document.getElementById('recipeContent');
  const opened = document.getElementById('recipeView').classList.contains('open');
  check(opened, 'экран рецепта не открылся');
  check(recipeContent.children.length > 0, 'рецепт пустой (нет блоков)');
  check(/Ингредиенты/.test(JSON.stringify(recipeContent.children)), 'в рецепте нет ингредиентов');

  if (problems.length) {
    console.log(`Проблемы (${problems.length}):`);
    for (const problem of problems) console.log(' -', problem);
    process.exit(1);
  }
  console.log('Дымовой тест пройден: карточка, фильтры, счётчик, шторка кухонь и рулетка работают.');
  console.log(`Стартовое блюдо: ${name.textContent}`);
  console.log(`Счётчик: ${counter.innerHTML.replace(/<[^>]+>/g, '')}`);
})();
