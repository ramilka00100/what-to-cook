'use strict';

/**
 * Сериализация блюд обратно в исходный JS-формат data/*.js
 * (одинарные кавычки, отступ 2, тот же порядок полей).
 */

const FIELDS = ['id', 'name', 'nameEn', 'category', 'description', 'ingredients', 'calories', 'vegetarian', 'spicy', 'image'];

function quote(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}

function renderDish(dish) {
  const lines = FIELDS.map((field) => {
    const value = dish[field];
    if (Array.isArray(value)) {
      return `      ${field}: [${value.map(quote).join(', ')}],`;
    }
    if (typeof value === 'number') return `      ${field}: ${value},`;
    if (typeof value === 'boolean') return `      ${field}: ${value},`;
    return `      ${field}: ${quote(value)},`;
  });
  return `    {\n${lines.join('\n')}\n    },`;
}

function renderCuisine(cuisine) {
  return `'use strict';

const cuisine = {
  id: ${quote(cuisine.id)},
  title: ${quote(cuisine.title)},
  titleEn: ${quote(cuisine.titleEn)},
  region: ${quote(cuisine.region)},
  description: ${quote(cuisine.description)},
  dishes: [
${cuisine.dishes.map(renderDish).join('\n')}
  ],
};

module.exports = cuisine;
`;
}

module.exports = { renderCuisine, renderDish, FIELDS };
