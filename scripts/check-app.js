'use strict';

/**
 * Проверяет интеграцию: app/recipes.js грузится как в браузере,
 * все фото на месте, фильтры по кухням и приёмам пищи не пустые.
 *
 * Запуск: node scripts/check-app.js
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'app');
const MEALS = ['Завтрак', 'Обед', 'Ужин'];

const problems = [];

// 1. recipes.js исполняется как обычный браузерный скрипт.
// const-объявления не попадают в globalThis, поэтому забираем их следующим скриптом
// в том же контексте — так же, как их увидит второй <script> на странице.
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(APP, 'recipes.js'), 'utf8'), sandbox, { filename: 'recipes.js' });
const exported = vm.runInContext('({ RAW_RECIPES, RECIPES })', sandbox, { filename: 'exports.js' });

const { RAW_RECIPES, RECIPES } = exported;
if (!Array.isArray(RECIPES)) problems.push('RECIPES не массив');
if (RAW_RECIPES.length !== RECIPES.length) problems.push('RAW_RECIPES и RECIPES разной длины');

for (const tuple of RAW_RECIPES) {
  if (tuple.length !== 12) problems.push(`кортеж не из 12 полей: ${tuple[0]}`);
}

// 2. Поля на месте.
const cuisines = new Map();
for (const recipe of RECIPES) {
  const label = recipe.name;
  for (const field of ['name', 'emoji', 'time', 'difficulty', 'servings', 'cuisine', 'image']) {
    if (recipe[field] === undefined || recipe[field] === '') problems.push(`${label}: пустое поле ${field}`);
  }
  if (!Array.isArray(recipe.meals) || recipe.meals.length === 0) problems.push(`${label}: пустые meals`);
  if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length < 3) problems.push(`${label}: мало ингредиентов`);
  if (!Array.isArray(recipe.steps) || recipe.steps.length < 2) problems.push(`${label}: мало шагов`);
  if (!Number.isInteger(recipe.time)) problems.push(`${label}: time не число`);
  if (!Number.isInteger(recipe.servings)) problems.push(`${label}: servings не число`);
  cuisines.set(recipe.cuisine, (cuisines.get(recipe.cuisine) || 0) + 1);
}

// 3. Фото существуют и 150x150.
let photoBytes = 0;
for (const recipe of RECIPES) {
  const file = path.join(APP, recipe.image);
  if (!fs.existsSync(file)) {
    problems.push(`нет фото: ${recipe.image}`);
    continue;
  }
  photoBytes += fs.statSync(file).size;
}

// 4. Пул для каждого приёма пищи и кухни (логика getPool из index.html).
function pool(meal, cuisine) {
  let list = RECIPES.filter((recipe) => recipe.meals.includes(meal) && (cuisine === 'Все' || recipe.cuisine === cuisine));
  if (meal === 'Обед') list = list.filter((recipe) => !recipe.isLightSecond);
  return list;
}

console.log('Кухни:');
for (const [cuisine, count] of cuisines) console.log(`  ${cuisine.padEnd(14)} ${String(count).padStart(3)} блюд`);

console.log('\nПул блюд (как в приложении):');
const header = ['Кухня', ...MEALS.map((meal) => meal.padEnd(7))].join('  ');
console.log('  ' + header);
for (const cuisine of ['Все', ...cuisines.keys()]) {
  const cells = MEALS.map((meal) => String(pool(meal, cuisine).length).padStart(7));
  console.log('  ' + cuisine.padEnd(14) + '  ' + cells.join('  '));
  for (const meal of MEALS) {
    if (pool(meal, cuisine).length === 0) problems.push(`пустой пул: ${cuisine} / ${meal}`);
  }
}

const lightSoups = RECIPES.filter((recipe) => recipe.isLightSoup).length;
const seconds = RECIPES.filter((recipe) => recipe.isLightSecond).length;
console.log(`\nЛёгкие супы (первое): ${lightSoups}`);
console.log(`Вторые блюда для комбо: ${seconds}`);

// Комбо «первое + второе»: второе должно находиться в той же кухне и не совпадать с первым.
for (const recipe of RECIPES) {
  if (recipe.isLightSoup && recipe.isLightSecond) problems.push(`${recipe.name}: одновременно первое и второе`);
}
for (const cuisine of ['Все', ...cuisines.keys()]) {
  const soups = pool('Обед', cuisine).filter((recipe) => recipe.isLightSoup);
  const secondDishes = RECIPES.filter((recipe) =>
    recipe.isLightSecond
    && recipe.meals.includes('Обед')
    && (cuisine === 'Все' || recipe.cuisine === cuisine));
  if (soups.length > 0 && secondDishes.length === 0) problems.push(`комбо без второго блюда: ${cuisine}`);
  if (soups.length > 0) {
    const overlap = soups.filter((soup) => secondDishes.includes(soup));
    if (overlap.length) problems.push(`комбо дублирует блюдо: ${cuisine}`);
  }
}

console.log(`Фото: ${(photoBytes / 1024 / 1024).toFixed(1)} МБ`);

// Завтрак: только лёгкое (≤350 ккал, без мяса/рыбы) и быстрое (≤40 минут).
const dataset = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'dishes.json'), 'utf8'));
/** Названия кухонь в data и в приложении различаются («Российская» → «Русская»). */
const APP_CUISINE = {
  russian: 'Русская',
  european: 'Европейская',
  italian: 'Итальянская',
  mediterranean: 'Средиземноморская',
  eastern: 'Восточная',
  asian: 'Азиатская',
  caucasian: 'Кавказская',
  american: 'Американская',
};
const byDishName = new Map(
  dataset.dishes.map((dish) => [`${APP_CUISINE[dish.cuisineId]}|${dish.name}`, dish]),
);

const breakfasts = RECIPES.filter((recipe) => recipe.meals.includes('Завтрак'));
for (const recipe of breakfasts) {
  if (recipe.time > 40) problems.push(`завтрак дольше 40 минут: ${recipe.name} (${recipe.time})`);
  const dish = byDishName.get(`${recipe.cuisine}|${recipe.name}`);
  if (!dish) {
    problems.push(`завтрак без данных о блюде: ${recipe.cuisine}/${recipe.name}`);
    continue;
  }
  if (dish.calories > 350) problems.push(`тяжёлый завтрак: ${recipe.name} (${dish.calories} ккал)`);
  if (!dish.vegetarian) problems.push(`невегетарианский завтрак: ${recipe.name}`);
}

console.log(`\nЗавтраков: ${breakfasts.length}, максимум ${Math.max(...breakfasts.map((r) => r.time))} минут, ` +
  `максимум ${Math.max(...breakfasts.map((r) => byDishName.get(`${r.cuisine}|${r.name}`)?.calories ?? 0))} ккал`);
for (const cuisine of cuisines.keys()) {
  const list = breakfasts.filter((recipe) => recipe.cuisine === cuisine);
  console.log(`  ${cuisine.padEnd(20)} ${String(list.length).padStart(2)} (до ${Math.max(0, ...list.map((r) => r.time))} мин)`);
}
console.log(`recipes.js: ${(fs.statSync(path.join(APP, 'recipes.js')).size / 1024).toFixed(0)} КБ`);

// 5. Синтаксис инлайн-скрипта из index.html.
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
for (const [index, code] of scripts.entries()) {
  try {
    new vm.Script(code, { filename: `index-inline-${index}.js` });
  } catch (error) {
    problems.push(`синтаксис инлайн-скрипта ${index}: ${error.message}`);
  }
}

if (problems.length) {
  console.log(`\nПроблемы (${problems.length}):`);
  for (const problem of problems.slice(0, 30)) console.log(' -', problem);
  process.exit(1);
}
console.log('\nВсё в порядке: данные грузятся, фото на месте, пулы не пустые.');
