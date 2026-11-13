# data — кухни мира для приложения рецептов

Датасет на 8 кухонь, 500 блюд, с фотографиями 150×150 и лицензиями для атрибуции.

```
data/
├── index.js           # точка входа CommonJS: кухни, блюда, выборки, валидация
├── russian.js         # Российская кухня        69 блюд
├── european.js        # Европейская кухня       69 блюд
├── italian.js         # Итальянская кухня       55 блюд
├── mediterranean.js   # Средиземноморская       55 блюд
├── eastern.js         # Восточная кухня         69 блюд
├── asian.js           # Азиатская кухня         69 блюд
├── caucasian.js       # Кавказская кухня        69 блюд
├── american.js        # Американская кухня      45 блюд
├── steps.json         # настоящие шаги готовки для 60 популярных блюд
├── dishes.json        # плоский экспорт всех блюд (генерируется)
├── cuisines.json      # список кухонь с количеством блюд (генерируется)
├── credits.json       # авторы и лицензии всех фото (генерируется)
├── images-report.json # отчёт: откуда взято каждое фото (генерируется)
├── preview.html       # галерея всех блюд для визуальной проверки (генерируется)
└── images/
    ├── russian/       # <id>.jpg, 150×150
    ├── european/
    ├── italian/
    ├── mediterranean/
    ├── eastern/
    ├── asian/
    ├── caucasian/
    └── american/
```

## Поля блюда

| Поле | Тип | Что это |
|---|---|---|
| `id` | string | kebab-case латиница, уникален внутри кухни (`beef-stroganoff`) |
| `name` | string | название по-русски |
| `nameEn` | string | английское название (по нему искалось фото) |
| `category` | string | `суп`, `салат`, `закуска`, `горячее`, `выпечка`, `десерт`, `напиток` |
| `description` | string | одно предложение, 60–110 символов |
| `ingredients` | string[] | 4–7 ингредиентов |
| `calories` | number | ккал на порцию |
| `vegetarian` | boolean | без мяса, рыбы и морепродуктов |
| `spicy` | boolean | острое |
| `image` | string | путь к фото относительно папки `data/`: `images/russian/borscht.jpg` |

Поля `cuisineId`, `cuisineTitle` и `key` (`"russian/borscht"`) добавляются
в `data/index.js` и в `dishes.json` — в файлах кухонь их нет.

Состав по категориям: суп 62, салат 46, закуска 93, горячее 160, выпечка 60,
десерт 60, напиток 19. Вегетарианских — 236, острых — 41, средняя
калорийность — 328 ккал.

## Как использовать

### Node (CommonJS)

```js
const { cuisines, dishes, getDishesByCuisine, findDish, getByCategory, stats } = require('./data');

dishes.length;                     // 500
getDishesByCuisine('asian');       // 69 блюд
findDish('borscht', 'russian');    // одно блюдо
getByCategory('суп');              // все супы
stats();                           // сводка по категориям и ккал
```

### JSON (React, Vue, Python, мобильные приложения)

`data/dishes.json` и `data/cuisines.json` — те же данные без JS. Пути к фото в
`image` относительны папке `data/`, то есть картинка лежит по
`data/images/russian/borscht.jpg`.

```js
import data from './data/dishes.json';
<img src={`/data/${dish.image}`} width={150} height={150} alt={dish.name} />
```

## Настоящие шаги готовки

`data/steps.json` — объект `{ "кухня/id": ["шаг", ...] }` для 60 популярных
блюд: борщ, пельмени, карбонара, лазанья, паэлья, мусака, плов, лагман, хумус,
рамен, суши, том-ям, хинкали, хачапури и другие. Остальные блюда получают
шаблонные шаги в приложении.

## Фотографии

- Формат: JPEG, ровно **150×150**, центр-кроп, качество 86, ~8 КБ на файл
  (все 500 фото — около 3,9 МБ).
- Источники: 455 — ведущее фото статьи Википедии, 38 — поиск по Викискладу,
  4 — вручную выбранный файл, 3 — заглушки с названием блюда.
  Подробности по каждому блюду — в `images-report.json` (статусы
  `page`, `commons`, `manual`, `placeholder`).
- Изображения скачаны с Викисклада (`commons.wikimedia.org`) и Википедии —
  это свободные лицензии (CC0, Public domain, CC BY, CC BY-SA).
- **Атрибуция обязательна для CC BY и CC BY-SA.** Авторы, лицензии и ссылки
  на файлы собраны в `credits.json` (479 уникальных файлов). Пример подписи:

  > Фото: liz west / CC BY 2.0, via Wikimedia Commons

  Точные поля: `artist`, `license`, `licenseUrl`, `descriptionUrl`, `usedBy`.
- Без фото остались три редких блюда: «Кондильоне», «Инсалата ди ринфорцо»
  и «Какавия» — для них сгенерированы заглушки, их можно заменить своим файлом
  с тем же именем.
- Открыть галерею для проверки: `data/preview.html` (двойной клик по файлу).

## Скрипты

```bash
node scripts/restructure-cuisines.js  # один раз: выделить итальянскую и средиземноморскую
node scripts/merge-new-dishes.js      # добавить новые блюда из data/_new/*.json
node scripts/merge-steps.js           # собрать data/steps.json из data/_new/steps-*.json
node scripts/build-json.js            # пересобрать dishes.json и cuisines.json
python scripts/fetch_images.py        # скачать/обновить фото и credits.json
python scripts/fix_manual.py          # ручные замены фото (4 блюда)
python scripts/check.py               # проверить: количество блюд, схема, размеры фото
node scripts/build-preview.js         # собрать data/preview.html — галерея всех блюд
node scripts/build-app-recipes.js     # пересобрать app/recipes.js и app/images
```

`fetch_images.py` берёт фото по цепочке: ведущее фото статьи английской
Википедии → русской Википедии → поиск по Викискладу → заглушка. Запросы идут
пакетами по 50 заголовков, чтобы не упираться в лимиты Викисклада. Флаги:
`--only italian`, `--limit 10`, `--force`.
