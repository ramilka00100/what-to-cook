'use strict';

/**
 * Кухни мира — точка входа датасета.
 *
 * Модули кухонь лежат рядом и экспортируют объект вида:
 *   { id, title, titleEn, region, description, dishes: Dish[] }
 *
 * Dish: { id, name, nameEn, category, description, ingredients, calories,
 *         vegetarian, spicy, image }
 *
 * Здесь кухни собираются в один массив, блюда получают имя кухни и
 * глобальный ключ `cuisineId/dishId`, а идентификаторы проверяются
 * на уникальность внутри каждой кухни.
 *
 * Пример:
 *   const { dishes, getDishesByCuisine } = require('./data');
 *   console.log(dishes.length, getDishesByCuisine('russian').length);
 */

const russian = require('./russian');
const european = require('./european');
const eastern = require('./eastern');
const asian = require('./asian');
const caucasian = require('./caucasian');
const italian = require('./italian');
const mediterranean = require('./mediterranean');
const american = require('./american');

/** Порядок кухонь в интерфейсе. */
const cuisines = [russian, european, italian, mediterranean, eastern, asian, caucasian, american];

/** Плоский список блюд: поля блюда + cuisineId, cuisineTitle, key. */
const dishes = cuisines.flatMap((cuisine) =>
  cuisine.dishes.map((dish) => ({
    ...dish,
    cuisineId: cuisine.id,
    cuisineTitle: cuisine.title,
    key: `${cuisine.id}/${dish.id}`,
  })),
);

/** Допустимые категории блюд. */
const categories = ['суп', 'салат', 'закуска', 'горячее', 'выпечка', 'десерт', 'напиток'];

/**
 * Проверяет структуру датасета: уникальные id кухонь, уникальные id блюд
 * внутри кухни, обязательные поля и допустимые категории.
 * @throws {Error} при первом нарушении
 */
function validate() {
  const cuisineIds = new Set();
  for (const cuisine of cuisines) {
    if (cuisineIds.has(cuisine.id)) throw new Error(`Повторяющийся id кухни: ${cuisine.id}`);
    cuisineIds.add(cuisine.id);

    const dishIds = new Set();
    for (const dish of cuisine.dishes) {
      if (dishIds.has(dish.id)) {
        throw new Error(`Повторяющийся id блюда в кухне ${cuisine.id}: ${dish.id}`);
      }
      dishIds.add(dish.id);

      for (const field of ['name', 'nameEn', 'category', 'image']) {
        if (typeof dish[field] !== 'string' || dish[field] === '') {
          throw new Error(`Блюдо ${cuisine.id}/${dish.id}: пустое поле ${field}`);
        }
      }
      if (!categories.includes(dish.category)) {
        throw new Error(`Блюдо ${cuisine.id}/${dish.id}: неизвестная категория ${dish.category}`);
      }
      if (!Array.isArray(dish.ingredients) || dish.ingredients.length < 2) {
        throw new Error(`Блюдо ${cuisine.id}/${dish.id}: нужен массив ингредиентов`);
      }
      if (!Number.isInteger(dish.calories) || dish.calories <= 0) {
        throw new Error(`Блюдо ${cuisine.id}/${dish.id}: calories должно быть целым > 0`);
      }
    }
  }
  return true;
}

validate();

/**
 * Краткая сводка по кухням без самих блюд.
 * @returns {Array<object>}
 */
function listCuisines() {
  return cuisines.map(({ id, title, titleEn, region, description, dishes: list }) => ({
    id,
    title,
    titleEn,
    region,
    description,
    count: list.length,
  }));
}

/**
 * Все блюда одной кухни.
 * @param {string} cuisineId - id кухни, например 'russian'
 * @returns {Array<object>} пустой массив, если кухня не найдена
 */
function getDishesByCuisine(cuisineId) {
  return dishes.filter((dish) => dish.cuisineId === cuisineId);
}

/**
 * Первое блюдо по id (id уникален внутри кухни, поэтому укажи cuisineId,
 * если одноимённые блюда есть в разных кухнях).
 * @param {string} dishId - id блюда, например 'borscht'
 * @param {string} [cuisineId] - ограничить поиск одной кухней
 * @returns {object|undefined}
 */
function findDish(dishId, cuisineId) {
  return dishes.find(
    (dish) => dish.id === dishId && (cuisineId === undefined || dish.cuisineId === cuisineId),
  );
}

/**
 * Все блюда с указанным id из разных кухонь.
 * @param {string} dishId
 * @returns {Array<object>}
 */
function findAllDishes(dishId) {
  return dishes.filter((dish) => dish.id === dishId);
}

/**
 * Блюда одной категории по всем кухням.
 * @param {string} category - см. `categories`
 * @returns {Array<object>}
 */
function getByCategory(category) {
  return dishes.filter((dish) => dish.category === category);
}

/**
 * Агрегированная статистика по датасету.
 * @returns {{cuisines: number, dishes: number, categories: object, vegetarian: number,
 *   spicy: number, averageCalories: number, withImage: number}}
 */
function stats() {
  const byCategory = {};
  for (const category of categories) byCategory[category] = 0;
  for (const dish of dishes) byCategory[dish.category] += 1;

  const totalCalories = dishes.reduce((sum, dish) => sum + dish.calories, 0);

  return {
    cuisines: cuisines.length,
    dishes: dishes.length,
    categories: byCategory,
    vegetarian: dishes.filter((dish) => dish.vegetarian).length,
    spicy: dishes.filter((dish) => dish.spicy).length,
    averageCalories: Math.round(totalCalories / dishes.length),
    withImage: dishes.filter((dish) => typeof dish.image === 'string' && dish.image !== '').length,
  };
}

module.exports = {
  cuisines,
  dishes,
  categories,
  listCuisines,
  getDishesByCuisine,
  findDish,
  findAllDishes,
  getByCategory,
  stats,
};

// Сводка при прямом запуске: node data/index.js
if (require.main === module) {
  const summary = stats();
  console.log('Кухни мира');
  console.log('─'.repeat(60));
  for (const cuisine of listCuisines()) {
    console.log(`${cuisine.title.padEnd(24)} ${String(cuisine.count).padStart(4)} блюд`);
  }
  console.log('─'.repeat(60));
  console.log(`Всего: ${summary.cuisines} кухонь, ${summary.dishes} блюд, с картинкой: ${summary.withImage}`);
  console.log(
    `Категории: ${categories.map((c) => `${c} ${summary.categories[c]}`).join(', ')}`,
  );
  console.log(
    `Вегетарианских: ${summary.vegetarian}, острых: ${summary.spicy}, ~${summary.averageCalories} ккал в среднем`,
  );
}
