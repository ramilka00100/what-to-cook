#!/usr/bin/env python3
"""Проверка датасета кухонь: 69 блюд на кухню, поля, картинки 150x150.

Запуск: python scripts/check.py
Код возврата: 0 — всё в порядке, 1 — есть проблемы.
"""

import json
import sys
from collections import Counter
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
EXPECTED = {
    'russian': 69,
    'european': 69,
    'italian': 55,
    'mediterranean': 55,
    'eastern': 69,
    'asian': 69,
    'caucasian': 69,
    'american': 45,
}
SIZE = (150, 150)
REQUIRED = ['id', 'name', 'nameEn', 'category', 'description', 'ingredients',
            'calories', 'vegetarian', 'spicy', 'image']
CATEGORIES = {'суп', 'салат', 'закуска', 'горячее', 'выпечка', 'десерт', 'напиток'}


def main():
    source = DATA / 'dishes.json'
    if not source.exists():
        print('Нет data/dishes.json — выполни: node scripts/build-json.js')
        return 1

    dishes = json.loads(source.read_text('utf-8'))['dishes']
    problems = []
    per_cuisine = Counter(dish['cuisineId'] for dish in dishes)

    print(f'Всего блюд: {len(dishes)}')
    for cuisine_id, count in sorted(per_cuisine.items()):
        want = EXPECTED.get(cuisine_id)
        mark = 'ok' if count == want else f'ЖДЕМ {want}'
        print(f'  {cuisine_id:14} {count:4}  {mark}')
        if count != want:
            problems.append(f'{cuisine_id}: {count} блюд вместо {want}')

    for cuisine_id in EXPECTED:
        if cuisine_id not in per_cuisine:
            problems.append(f'нет блюд кухни {cuisine_id}')

    ids = Counter((dish['cuisineId'], dish['id']) for dish in dishes)
    duplicates = [key for key, count in ids.items() if count > 1]
    if duplicates:
        problems.append(f'дубликаты id: {duplicates[:10]}')

    seen_files = Counter()
    bad_images = []
    categories = Counter()
    missing_fields = []

    for dish in dishes:
        for field in REQUIRED:
            if field not in dish:
                missing_fields.append(f"{dish.get('cuisineId')}/{dish.get('id')}: нет поля {field}")
        if dish.get('category') not in CATEGORIES:
            problems.append(f"{dish['cuisineId']}/{dish['id']}: категория {dish.get('category')}")
        categories[dish.get('category')] += 1

        path = DATA / dish['image']
        seen_files[dish['image']] += 1
        if not path.exists():
            bad_images.append(f'нет файла {dish["image"]}')
            continue
        try:
            with Image.open(path) as image:
                if image.size != SIZE:
                    bad_images.append(f'{dish["image"]}: {image.size}')
                if image.format != 'JPEG':
                    bad_images.append(f'{dish["image"]}: формат {image.format}')
        except Exception as error:  # noqa: BLE001
            bad_images.append(f'{dish["image"]}: не читается ({error})')

    if missing_fields:
        problems.extend(missing_fields[:20])
    if bad_images:
        problems.extend(bad_images[:20])

    shared = [name for (_, name), count in Counter(
        (dish['cuisineId'], dish['image']) for dish in dishes
    ).items() if count > 1]
    if shared:
        problems.append(f'одно фото на несколько блюд внутри кухни: {shared[:5]}')

    print('\nКатегории: ' + ', '.join(f'{name} {count}' for name, count in sorted(categories.items())))
    print(f'Файлов фото: {len(seen_files)}, уникальных: {len(set(seen_files))}')

    if problems:
        print(f'\nПроблемы ({len(problems)}):')
        for problem in problems[:40]:
            print('  -', problem)
        return 1

    print(f'\nВсё в порядке: {len(dishes)} блюд, все фото 150x150 JPEG.')
    return 0


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.exit(main())
