'use strict';

/**
 * Собирает плоские JSON-файлы для приложений, которым неудобно
 * подключать CommonJS-модули:
 *   data/dishes.json    — все блюда с cuisineId, cuisineTitle, key
 *   data/cuisines.json  — кухни с количеством блюд
 *
 * Запуск: node scripts/build-json.js
 */

const fs = require('node:fs');
const path = require('node:path');

const dataDir = path.join(__dirname, '..', 'data');
const dataset = require(path.join(dataDir, 'index.js'));

const meta = {
  generatedAt: new Date().toISOString(),
  cuisines: dataset.cuisines.length,
  dishes: dataset.dishes.length,
  imageSize: '150x150',
  imagePathBase: 'data/',
};

const dishesFile = path.join(dataDir, 'dishes.json');
const cuisinesFile = path.join(dataDir, 'cuisines.json');

fs.writeFileSync(
  dishesFile,
  `${JSON.stringify({ meta, dishes: dataset.dishes }, null, 2)}\n`,
  'utf8',
);
fs.writeFileSync(
  cuisinesFile,
  `${JSON.stringify({ meta, cuisines: dataset.listCuisines() }, null, 2)}\n`,
  'utf8',
);

console.log(`data/dishes.json   — ${dataset.dishes.length} блюд`);
console.log(`data/cuisines.json — ${dataset.cuisines.length} кухонь`);
