'use strict';

/**
 * Собирает настоящие шаги готовки из data/_new/steps-*.json в data/steps.json.
 *
 * Ключ — `cuisine/dishId`, значение — массив шагов (строки, императив).
 * Сборщик приложения (scripts/build-app-recipes.js) подставляет эти шаги
 * вместо шаблонных.
 *
 * Запуск: node scripts/merge-steps.js
 */

const fs = require('node:fs');
const path = require('node:path');

const DATA = path.join(__dirname, '..', 'data');
const NEW = path.join(DATA, '_new');

const dataset = require(path.join(DATA, 'index.js'));
const known = new Map(dataset.dishes.map((dish) => [dish.key, dish]));

const steps = {};
const problems = [];

for (const file of fs.readdirSync(NEW).filter((name) => name.startsWith('steps-'))) {
  const full = path.join(NEW, file);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (error) {
    problems.push(`${file}: невалидный JSON — ${error.message}`);
    continue;
  }

  for (const [key, value] of Object.entries(parsed)) {
    if (!known.has(key)) {
      problems.push(`${file}: нет такого блюда — ${key}`);
      continue;
    }
    if (!Array.isArray(value) || value.length < 4 || value.length > 9) {
      problems.push(`${key}: шагов ${Array.isArray(value) ? value.length : 'не массив'}`);
      continue;
    }
    for (const step of value) {
      if (typeof step !== 'string' || step.length < 25 || step.length > 300) {
        problems.push(`${key}: шаг длиной ${String(step).length} — "${String(step).slice(0, 40)}…"`);
      }
    }
    steps[key] = value;
  }
}

if (problems.length) {
  console.log(`Проблемы (${problems.length}):`);
  for (const problem of problems.slice(0, 30)) console.log(' -', problem);
  process.exit(1);
}

fs.writeFileSync(path.join(DATA, 'steps.json'), `${JSON.stringify(steps, null, 2)}\n`, 'utf8');
for (const file of fs.readdirSync(NEW).filter((name) => name.startsWith('steps-'))) {
  fs.rmSync(path.join(NEW, file));
}

const keys = Object.keys(steps);
console.log(`Готовых рецептов с настоящими шагами: ${keys.length}`);
const byCuisine = {};
for (const key of keys) {
  const cuisine = key.split('/')[0];
  byCuisine[cuisine] = (byCuisine[cuisine] || 0) + 1;
}
for (const [cuisine, count] of Object.entries(byCuisine).sort()) console.log(`  ${cuisine.padEnd(14)} ${count}`);
console.log('data/steps.json записан, временные файлы удалены.');
