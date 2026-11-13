'use strict';

/**
 * Собирает app/recipes.js в формате приложения и копирует фото в app/images.
 *
 * Вход:  data/dishes.json (345 блюд, 5 кухонь, фото 150x150)
 * Выход: app/recipes.js  — const RAW_RECIPES = [[...], ...] + const RECIPES = ...
 *        app/images/     — копия data/images
 *
 * Поля кортежа (как в приложении):
 *   0 name, 1 emoji, 2 time, 3 difficulty, 4 servings, 5 meals,
 *   6 cuisine, 7 image, 8 ingredients, 9 steps,
 *   10 "isLightSoup", 11 "isLightSecond"
 *
 * Запуск: node scripts/build-app-recipes.js
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const APP = path.join(ROOT, 'app');

const { dishes } = require(path.join(DATA, 'index.js'));

/** Настоящие шаги готовки для популярных блюд; остальные получают шаблон. */
const stepsPath = path.join(DATA, 'steps.json');
const REAL_STEPS = fs.existsSync(stepsPath)
  ? JSON.parse(fs.readFileSync(stepsPath, 'utf8'))
  : {};

/** Кухни датасета → названия, которые ждёт фильтр приложения. */
const CUISINE_TITLES = {
  russian: 'Русская',
  european: 'Европейская',
  italian: 'Итальянская',
  mediterranean: 'Средиземноморская',
  eastern: 'Восточная',
  asian: 'Азиатская',
  caucasian: 'Кавказская',
  american: 'Американская',
};

const EMOJIS = {
  суп: ['🍲', '🍜', '🥣'],
  салат: ['🥗', '🥬', '🫒'],
  закуска: ['🧀', '🥟', '🫓', '🍢'],
  горячее: ['🍖', '🍗', '🥩', '🍛', '🍤'],
  выпечка: ['🥐', '🥖', '🥞', '🫓'],
  десерт: ['🍰', '🍮', '🍯', '🍪'],
  напиток: ['🥤', '🍵', '☕', '🧃'],
};

const BASE_TIME = { суп: 45, салат: 20, закуска: 25, горячее: 40, выпечка: 70, десерт: 45, напиток: 15 };
const SERVINGS = { суп: 4, салат: 2, закуска: 4, горячее: 2, выпечка: 6, десерт: 6, напиток: 2 };
const MEALS = {
  суп: ['Обед'],
  салат: ['Обед', 'Ужин'],
  закуска: ['Обед', 'Ужин'],
  горячее: ['Обед', 'Ужин'],
  выпечка: ['Ужин'],
  десерт: ['Ужин'],
  напиток: ['Ужин'],
};

/**
 * Завтрак — только лёгкое (≤350 ккал, без мяса и рыбы) и быстрое (≤40 минут).
 * Список блюд, которые действительно едят утром.
 */
const BREAKFAST_LIMIT_MINUTES = 40;
const BREAKFAST_LIMIT_CALORIES = 350;
const BREAKFAST_RE = /(каш|блин|оладь|сырник|драник|кисель|морс|квас|сбитень|компот|иван-чай|варень|круассан|багет|скон|брецель|датская выпечка|мадлен|содовый хлеб|пончик|брускетт|аффогато|канноли|панеттоне|зепполе|халлуми|саганаки|дакос|тиропита|спанакопита|паштел-де-ната|энсаймада|лукумадес|бейгл|американские бисквиты|кукурузный хлеб|хлеб на закваске|онигири|моти|мэлонпан|бибингка|роти-чанай|мисо|масала-чай|ласси|кутабы|сулугуни|мацони|айран|тархун|шербет|хумус|лабне|шакшука|фул медамес|турецкий кофе)/i;
/** Алкоголь утром не предлагаем. */
const ALCOHOL_RE = /(глинтвейн|глёгг|сангрия|негрони|лимончелло|вино|пиво|виски|грог)/i;

/** Быстрые блюда: время берём завтрачное, а не по категории. */
const QUICK_TIME = [
  [/аффогато/i, [5, 10]],
  [/багет|бейгл|круассан|хлеб на закваске|канноли|панеттоне|паштел-де-ната|онигири|моти/i, [10, 15]],
  [/тост|бутерброд|брускетт|кростини|канапе/i, [10, 15, 20]],
  [/скон|брецель|датская выпечка|мадлен|пончик|зепполе|энсаймада|халлуми|сулугуни|хумус|лабне/i, [15, 20]],
  [/содовый хлеб|лукумадес|саганаки|шакшука|фул медамес|каш|варень|чай|кофе|кисель|морс|квас|сбитень|компот/i, [20, 25]],
  [/американские бисквиты|блин|оладь|сырник|драник|мэлонпан|роти-чанай|кутабы|дакос/i, [25, 30]],
  [/кукурузный хлеб|бибингка|тиропита/i, [30, 35]],
  [/спанакопита/i, [35, 40]],
];

/** Долгие блюда: время не занижаем. */
const LONG_TIME = [
  [/торт|медовик|наполеон|запеканк|кулебяк|курник|холодец|хаш|плов|шашлык|манты|хинкали|пельмени|голубц|рульк|утк|хого|пекинск/i, [90, 105, 120]],
  [/пирог|пицца|лазань|кулич|пасха/i, [70, 85, 100]],
];

/** Правила количества для строки «ингреgиент — количество». */
const QTY_RULES = [
  { test: /(соль|специ|перец|зелень|петрушк|кинз|базилик|укроп|ванил|кориц|зира|куркум|орегано|тимьян|хмели|шафран|карри|мускат|лавров|приправ|джусай|орегано)/i, unit: null },
  { test: /яйц/i, unit: 'шт.', steps: [2, 3, 4] },
  { test: /(молоко|сливк|кефир|вода|бульон|вино|сок|рассол|сироп)/i, unit: 'мл', steps: [150, 200, 250, 300, 400, 500] },
  { test: /(говядин|свинин|баранин|куриц|курин|индейк|утк|рыб|лосос|треск|фарш|мясо|креветк|мидии|кальмар|сельд|бекон|гуанчале|колбас|ветчин|хам)/i, unit: 'г', steps: [300, 350, 400, 450, 500, 600] },
  { test: /(сыр|творог|масло|сметан|майонез|йогурт|мацони|тахини|сливочн)/i, unit: 'г', steps: [80, 100, 120, 150, 180, 200] },
  { test: /(мук|рис|гречк|перловк|булгур|кускус|нут|фасол|чечевиц|сахар|крахмал|сухар)/i, unit: 'г', steps: [100, 150, 200, 250, 300] },
  { test: /(картоф|помидор|томат|огурц|перец|баклажан|кабачок|свёкл|свекл|капуст|тыкв|яблок|лимон|авокадо|морков|лук|гранат|айв)/i, unit: 'шт.', steps: [1, 2, 3, 4] },
  { test: /(шампиньон|гриб|боб|горошек|оливк|изюм|орех|кунжут|маслин)/i, unit: 'г', steps: [50, 80, 100, 150, 200] },
];

const PREP = {
  суп: 'Нарежь овощи, мясо и зелень, бульон доведи до кипения.',
  салат: 'Нарежь все ингредиенты, заправь и аккуратно перемешай.',
  закуска: 'Подготовь ингредиенты и собери закуску на тарелке.',
  горячее: 'Нарежь и замаринуй продукты, разогрей сковороду или духовку.',
  выпечка: 'Замеси тесто, подготовь начинку и разогрей духовку до 180 °C.',
  десерт: 'Отмерь продукты, подготовь крем или тесто.',
  напиток: 'Подготовь продукты и посуду, вскипяти воду.',
};

const COOK = {
  суп: ['Добавь подготовленные продукты в бульон и вари на медленном огне.', 'Посоли, поперчи и вари до готовности овощей.'],
  салат: ['Добавь остальные ингредиенты и перемешай.', 'Дай салату настояться 10 минут.'],
  закуска: ['Смешай компоненты и выложи на блюдо.', 'Убери в холод на 15 минут, чтобы вкусы сложились.'],
  горячее: ['Обжарь или запекай, помешивая, до золотистой корочки.', 'Доведи до готовности и дай отдохнуть 5 минут.'],
  выпечка: ['Выложи тесто с начинкой в форму.', 'Выпекай до румяной корочки, проверяя зубочисткой.'],
  десерт: ['Смешай компоненты до однородности.', 'Охлади в холодильнике до застывания.'],
  напиток: ['Смешай компоненты и прогрей, не доводя до бурного кипения.', 'Дай настояться и охлади.'],
};

const SERVE = {
  суп: 'Подавай со свежей зеленью и сметаной.',
  салат: 'Подавай охлаждённым, украсив зеленью.',
  закуска: 'Подавай к основному блюду или как самостоятельную закуску.',
  горячее: 'Подавай с гарниром из овощей или крупы.',
  выпечка: 'Подавай тёплой, к чаю.',
  десерт: 'Подавай охлаждённым, с ягодами по желанию.',
  напиток: 'Подавай охлаждённым или тёплым по вкусу.',
};

/** Детерминированный хеш строки, чтобы данные не менялись при пересборке. */
function hash(text) {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

const pick = (list, seed) => list[seed % list.length];

function quantity(ingredient, seed) {
  for (const rule of QTY_RULES) {
    if (!rule.test.test(ingredient)) continue;
    if (!rule.unit) return 'по вкусу';
    const value = rule.steps[seed % rule.steps.length];
    return `${value} ${rule.unit}`;
  }
  return 'по вкусу';
}

function difficultyOf(category, time) {
  if (category === 'выпечка') return time >= 80 ? 'Сложно' : 'Средне';
  if (category === 'десерт' || category === 'горячее') return 'Средне';
  if (category === 'суп') return time >= 55 ? 'Средне' : 'Легко';
  return 'Легко';
}

/** Время готовки: быстрые и долгие блюда важнее категории. */
function timeOf(dish, seed) {
  const quick = QUICK_TIME.find(([re]) => re.test(dish.name));
  if (quick) return pick(quick[1], seed);
  const long = LONG_TIME.find(([re]) => re.test(dish.name));
  if (long) return pick(long[1], seed);
  return BASE_TIME[dish.category] + pick([0, 5, 10, 15, 20], seed);
}

/** Завтрак: лёгкое, быстрое и уместное утром. */
function isBreakfast(dish, time) {
  return time <= BREAKFAST_LIMIT_MINUTES
    && dish.calories <= BREAKFAST_LIMIT_CALORIES
    && dish.vegetarian
    && BREAKFAST_RE.test(dish.name)
    && !ALCOHOL_RE.test(dish.name);
}

/** Приёмы пищи: завтрак — отдельный пул, десерт остаётся и на ужин. */
function mealsOf(dish, breakfast) {
  if (!breakfast) return MEALS[dish.category];
  return dish.category === 'десерт' ? ['Завтрак', 'Ужин'] : ['Завтрак'];
}

function buildSteps(dish, time) {
  const seed = hash(`${dish.cuisineId}/${dish.id}`);
  const listed = dish.ingredients.slice(0, 3).map((item) => item.toLowerCase()).join(', ');
  const [cookOne, cookTwo] = COOK[dish.category];
  const steps = [
    `${PREP[dish.category]} Основные продукты: ${listed}.`,
    `${cookOne} Ориентируйся на ${time} минут.`,
    `${cookTwo} ${SERVE[dish.category]}`,
  ];
  return steps;
}

function buildTuple(dish) {
  const seed = hash(`${dish.cuisineId}/${dish.id}`);
  const category = dish.category;
  const time = timeOf(dish, seed);
  const difficulty = difficultyOf(category, time);
  const breakfast = isBreakfast(dish, time);
  const ingredients = dish.ingredients
    .slice(0, 6)
    .map((item, index) => `${item} — ${quantity(item, hash(item) + index + seed)}`);
  const meals = mealsOf(dish, breakfast);
  const cuisine = CUISINE_TITLES[dish.cuisineId];
  const emoji = pick(EMOJIS[category], seed);

  const isLightSoup = category === 'суп' && dish.calories <= 250;
  const isLightSecond = category === 'горячее' && dish.calories >= 250;
  const key = `${dish.cuisineId}/${dish.id}`;

  return [
    dish.name,
    emoji,
    time,
    difficulty,
    SERVINGS[category],
    meals,
    cuisine,
    `images/${dish.cuisineId}/${dish.id}.jpg`,
    ingredients,
    REAL_STEPS[key] || buildSteps(dish, time),
    isLightSoup ? 'isLightSoup' : '',
    isLightSecond ? 'isLightSecond' : '',
  ];
}

function main() {
  const tuples = dishes.map(buildTuple);

  const header = `/**
 * Что нам приготовить? — база рецептов.
 * ${tuples.length} блюд, 5 кухонь, фото 150x150 в папке images/.
 *
 * Файл сгенерирован: node scripts/build-app-recipes.js
 * Источник данных: data/ (см. data/README.md)
 * Не редактируй вручную — изменения перезапишутся.
 */

`;

  const body = `const RAW_RECIPES = ${JSON.stringify(tuples)};\n\n` +
    `const RECIPES = RAW_RECIPES.map(r => ({\n` +
    `  name: r[0], emoji: r[1], time: r[2], difficulty: r[3], servings: r[4],\n` +
    `  meals: r[5], cuisine: r[6], image: r[7], ingredients: r[8], steps: r[9],\n` +
    `  isLightSoup: r[10] === "isLightSoup", isLightSecond: r[11] === "isLightSecond"\n` +
    `}));\n`;

  fs.mkdirSync(APP, { recursive: true });
  fs.writeFileSync(path.join(APP, 'recipes.js'), header + body, 'utf8');

  fs.rmSync(path.join(APP, 'images'), { recursive: true, force: true });
  fs.cpSync(path.join(DATA, 'images'), path.join(APP, 'images'), { recursive: true });

  const sizes = { total: 0, files: 0 };
  for (const cuisineId of Object.keys(CUISINE_TITLES)) {
    const folder = path.join(APP, 'images', cuisineId);
    const files = fs.existsSync(folder) ? fs.readdirSync(folder) : [];
    sizes.files += files.length;
    for (const file of files) sizes.total += fs.statSync(path.join(folder, file)).size;
    console.log(`${CUISINE_TITLES[cuisineId].padEnd(14)} ${String(files.length).padStart(3)} фото`);
  }

  const bytes = fs.statSync(path.join(APP, 'recipes.js')).size;
  console.log(`\napp/recipes.js — ${tuples.length} рецептов, ${(bytes / 1024).toFixed(0)} КБ`);
  console.log(`app/images    — ${sizes.files} фото, ${(sizes.total / 1024 / 1024).toFixed(1)} МБ`);
}

main();
