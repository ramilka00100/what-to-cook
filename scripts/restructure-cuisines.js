'use strict';

/**
 * Делит европейскую кухню на «Европейскую», «Итальянскую» и «Средиземноморскую».
 *
 * 1) итальянские и средиземноморские блюда переезжают в свои файлы;
 * 2) фото переезжают в data/images/italian и data/images/mediterranean;
 * 3) отчёт images-report.json обновляет ключи, чтобы не качать фото заново.
 *
 * Запуск: node scripts/restructure-cuisines.js
 */

const fs = require('node:fs');
const path = require('node:path');

const { renderCuisine } = require('./lib/dish-source.js');

const DATA = path.join(__dirname, '..', 'data');

const ITALIAN = new Set([
  'minestrone', 'ribollita', 'caprese-salad', 'panzanella', 'bruschetta', 'arancini',
  'vitello-tonnato', 'carbonara', 'neapolitan-pizza', 'lasagne', 'risotto-alla-milanese',
  'pasta-alla-norma', 'focaccia', 'tiramisu', 'panna-cotta',
]);

const MEDITERRANEAN = new Set([
  'greek-salad', 'tzatziki', 'dolmades', 'moussaka', 'souvlaki', 'pastitsio',
  'spanakopita', 'avgolemono', 'gazpacho', 'jamon-iberico', 'patatas-bravas',
  'spanish-omelette', 'pulpo-a-la-gallega', 'paella', 'fabada-asturiana', 'churros',
  'sangria', 'pipirrana', 'caldo-verde', 'bacalhau-a-bras', 'francesinha', 'pastel-de-nata',
]);

const european = require(path.join(DATA, 'european.js'));

const italian = {
  id: 'italian',
  title: 'Итальянская кухня',
  titleEn: 'Italian cuisine',
  region: 'Италия',
  description: 'Паста и ризотто, пицца и антипасти, томаты, оливковое масло и десерты.',
  dishes: [],
};
const mediterranean = {
  id: 'mediterranean',
  title: 'Средиземноморская кухня',
  titleEn: 'Mediterranean cuisine',
  region: 'Греция, Испания, Португалия',
  description: 'Овощи, оливковое масло, рыба и морепродукты, сыры и вино.',
  dishes: [],
};
const rest = { ...european, dishes: [] };

const moved = [];
for (const dish of european.dishes) {
  if (ITALIAN.has(dish.id)) {
    italian.dishes.push({ ...dish, image: `images/italian/${dish.id}.jpg` });
    moved.push({ id: dish.id, from: 'european', to: 'italian' });
  } else if (MEDITERRANEAN.has(dish.id)) {
    mediterranean.dishes.push({ ...dish, image: `images/mediterranean/${dish.id}.jpg` });
    moved.push({ id: dish.id, from: 'european', to: 'mediterranean' });
  } else {
    rest.dishes.push(dish);
  }
}

fs.writeFileSync(path.join(DATA, 'italian.js'), renderCuisine(italian), 'utf8');
fs.writeFileSync(path.join(DATA, 'mediterranean.js'), renderCuisine(mediterranean), 'utf8');
fs.writeFileSync(path.join(DATA, 'european.js'), renderCuisine(rest), 'utf8');

// Фото: переносим файлы.
for (const item of moved) {
  const source = path.join(DATA, 'images', item.from, `${item.id}.jpg`);
  const target = path.join(DATA, 'images', item.to, `${item.id}.jpg`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(source)) fs.renameSync(source, target);
}

// Отчёт: обновляем ключи и пути у переехавших блюд.
const reportPath = path.join(DATA, 'images-report.json');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const byId = new Map(moved.map((item) => [item.id, item]));
for (const entry of report) {
  if (entry.cuisineId !== 'european') continue;
  const item = byId.get(entry.id);
  if (!item) continue;
  entry.cuisineId = item.to;
  entry.key = `${item.to}/${entry.id}`;
  entry.image = `images/${item.to}/${entry.id}.jpg`;
}
report.sort((a, b) => `${a.cuisineId}/${a.id}`.localeCompare(`${b.cuisineId}/${b.id}`));
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

console.log(`итальянских блюд:        ${italian.dishes.length} (нужно ещё ${55 - italian.dishes.length})`);
console.log(`средиземноморских блюд:  ${mediterranean.dishes.length} (нужно ещё ${55 - mediterranean.dishes.length})`);
console.log(`европейских блюд:        ${rest.dishes.length} (нужно ещё ${69 - rest.dishes.length})`);
console.log(`перенесено фото:         ${moved.length}`);
