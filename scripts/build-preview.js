'use strict';

/**
 * Собирает data/preview.html — галерею всех блюд с фото, чтобы быстро
 * проверить, что картинки совпадают с блюдами.
 *
 * Запуск: node scripts/build-preview.js
 */

const fs = require('node:fs');
const path = require('node:path');

const dataDir = path.join(__dirname, '..', 'data');
const { cuisines, dishes } = require(path.join(dataDir, 'index.js'));

const reportPath = path.join(dataDir, 'images-report.json');
const report = fs.existsSync(reportPath)
  ? new Map(JSON.parse(fs.readFileSync(reportPath, 'utf8')).map((item) => [item.key, item]))
  : new Map();

const esc = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

const sections = cuisines
  .map((cuisine) => {
    const cards = cuisine.dishes
      .map((dish) => {
        const key = `${cuisine.id}/${dish.id}`;
        const entry = report.get(key) || {};
        const missing = entry.status && entry.status.startsWith('placeholder') ? ' data-placeholder="1"' : '';
        const source = entry.descriptionUrl
          ? `<a class="src" href="${esc(entry.descriptionUrl)}" target="_blank" rel="noopener">${esc(entry.license || 'источник')}</a>`
          : '';
        return `<figure class="card"${missing}>
  <img src="${esc(dish.image)}" width="150" height="150" loading="lazy" alt="${esc(dish.name)}">
  <figcaption>
    <b>${esc(dish.name)}</b>
    <span class="meta">${esc(dish.category)} · ${dish.calories} ккал</span>
    ${source}
  </figcaption>
</figure>`;
      })
      .join('\n');

    return `<section>
  <h2>${esc(cuisine.title)} <span class="count">${cuisine.dishes.length} блюд</span></h2>
  <div class="grid">
${cards}
  </div>
</section>`;
  })
  .join('\n');

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Кухни мира — превью датасета</title>
<style>
  :root { color-scheme: light dark; --line: #d8d8d8; --muted: #6b6b6b; }
  body { font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; margin: 32px auto; max-width: 1180px; padding: 0 16px; }
  h1 { margin: 0 0 4px; font-size: 22px; }
  h2 { margin: 40px 0 12px; font-size: 18px; border-bottom: 1px solid var(--line); padding-bottom: 6px; }
  .count { color: var(--muted); font-weight: 400; font-size: 13px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 16px; }
  .card { margin: 0; display: flex; flex-direction: column; gap: 6px; }
  .card img { width: 150px; height: 150px; border-radius: 10px; object-fit: cover; display: block; background: #eee; }
  .card[data-placeholder] img { outline: 2px dashed #d9534f; outline-offset: -2px; }
  figcaption b { display: block; font-size: 13px; }
  .meta { display: block; color: var(--muted); font-size: 12px; }
  .src { font-size: 11px; color: var(--muted); }
  .note { color: var(--muted); font-size: 13px; margin-top: 6px; }
</style>
</head>
<body>
<h1>Кухни мира</h1>
<p class="note">${dishes.length} блюд, 5 кухонь. Фото 150×150 с Викисклада; пунктирная рамка — заглушка без фото.
Атрибуция обязательна: лицензии в <code>data/credits.json</code>.</p>
${sections}
</body>
</html>
`;

fs.writeFileSync(path.join(dataDir, 'preview.html'), html, 'utf8');
console.log(`data/preview.html — ${dishes.length} блюд`);
