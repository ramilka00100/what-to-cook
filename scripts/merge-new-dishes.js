'use strict';

/**
 * Добавляет новые блюда из data/_new/*.json в файлы кухонь.
 *
 * Проверяет схему, уникальность id и пути к фото, затем перезаписывает
 * data/<cuisine>.js в исходном формате и удаляет data/_new.
 *
 * Запуск: node scripts/merge-new-dishes.js
 */

const fs = require('node:fs');
const path = require('node:path');

const { renderCuisine } = require('./lib/dish-source.js');

const DATA = path.join(__dirname, '..', 'data');
const NEW = path.join(DATA, '_new');

const TARGETS = {
  italian: { file: 'italian.js', expected: 40 },
  mediterranean: { file: 'mediterranean.js', expected: 33 },
  european: { file: 'european.js', expected: 37 },
  american: { file: 'american.js', expected: 45 },
};

/** Кухни, файла которых ещё нет (создаются с нуля). */
const NEW_CUISINES = {
  american: {
    id: 'american',
    title: 'Американская кухня',
    titleEn: 'American cuisine',
    region: 'США',
    description: 'Бургеры и BBQ, клам-чаудер, кукурузный хлеб, панкейки и десерты.',
    dishes: [],
  },
};

function baseCuisine(cuisineId, file) {
  const full = path.join(DATA, file);
  if (fs.existsSync(full)) return require(full);
  if (!NEW_CUISINES[cuisineId]) throw new Error(`Нет кухни ${cuisineId} и нет шаблона для неё`);
  return { ...NEW_CUISINES[cuisineId], dishes: [] };
}

const CATEGORIES = new Set(['суп', 'салат', 'закуска', 'горячее', 'выпечка', 'десерт', 'напиток']);
const FIELDS = ['id', 'name', 'nameEn', 'category', 'description', 'ingredients', 'calories', 'vegetarian', 'spicy', 'image'];

const problems = [];

for (const [cuisineId, target] of Object.entries(TARGETS)) {
  const file = path.join(NEW, `${cuisineId}.json`);
  if (!fs.existsSync(file)) {
    problems.push(`${cuisineId}: нет файла ${file}`);
    continue;
  }

  let incoming;
  try {
    incoming = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    problems.push(`${cuisineId}: невалидный JSON — ${error.message}`);
    continue;
  }

  if (!Array.isArray(incoming)) {
    problems.push(`${cuisineId}: ожидался массив`);
    continue;
  }
  if (incoming.length !== target.expected) {
    problems.push(`${cuisineId}: ${incoming.length} блюд вместо ${target.expected}`);
  }

  const existing = baseCuisine(cuisineId, target.file);
  const ids = new Set(existing.dishes.map((dish) => dish.id));
  const names = new Set(existing.dishes.map((dish) => dish.name));

  for (const dish of incoming) {
    const where = `${cuisineId}/${dish.id}`;
    const missing = FIELDS.filter((field) => !(field in dish));
    if (missing.length) problems.push(`${where}: нет полей ${missing.join(', ')}`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(dish.id || '')) problems.push(`${where}: id не kebab-case`);
    if (ids.has(dish.id)) problems.push(`${where}: id уже есть в кухне`);
    if (names.has(dish.name)) problems.push(`${where}: название уже есть (${dish.name})`);
    ids.add(dish.id);
    names.add(dish.name);

    if (!CATEGORIES.has(dish.category)) problems.push(`${where}: категория ${dish.category}`);
    if (typeof dish.description !== 'string' || dish.description.length < 40 || dish.description.length > 140) {
      problems.push(`${where}: описание ${String(dish.description).length} символов`);
    }
    if (!Array.isArray(dish.ingredients) || dish.ingredients.length < 3 || dish.ingredients.length > 8) {
      problems.push(`${where}: ингредиентов ${dish.ingredients?.length}`);
    }
    if (!Number.isInteger(dish.calories) || dish.calories < 20 || dish.calories > 900) {
      problems.push(`${where}: калории ${dish.calories}`);
    }
    if (dish.image !== `images/${cuisineId}/${dish.id}.jpg`) problems.push(`${where}: путь фото ${dish.image}`);
    if (/[А-Яа-яЁё]/.test(dish.nameEn || '')) problems.push(`${where}: nameEn с кириллицей — ${dish.nameEn}`);
    if (typeof dish.vegetarian !== 'boolean' || typeof dish.spicy !== 'boolean') {
      problems.push(`${where}: vegetarian/spicy должны быть boolean`);
    }
  }
}

if (problems.length) {
  console.log(`Найдено проблем: ${problems.length}`);
  for (const problem of problems.slice(0, 40)) console.log(' -', problem);
  process.exit(1);
}

for (const [cuisineId, target] of Object.entries(TARGETS)) {
  const base = baseCuisine(cuisineId, target.file);
  const incoming = JSON.parse(fs.readFileSync(path.join(NEW, `${cuisineId}.json`), 'utf8'));
  const merged = { ...base, dishes: [...base.dishes, ...incoming] };
  fs.writeFileSync(path.join(DATA, target.file), renderCuisine(merged), 'utf8');
  console.log(`${cuisineId.padEnd(14)} ${base.dishes.length} + ${incoming.length} = ${merged.dishes.length}`);
}

fs.rmSync(NEW, { recursive: true, force: true });
console.log('\nНовые блюда добавлены, папка data/_new удалена.');
