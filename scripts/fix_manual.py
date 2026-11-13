#!/usr/bin/env python3
"""Ручные замены фото для блюд, которым не нашлось статьи Википедии.

Скрипт точечно ставит выбранный файл Викисклада на место заглушки и
пересобирает credits.json. Запускать после fetch_images.py.

Запуск: python scripts/fix_manual.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import fetch_images as f  # noqa: E402

# ключ блюда -> имя файла на Викискладе
MANUAL = {
    # «Столичный» — вариант оливье, отдельного фото на Викискладе нет.
    'russian/stolichny-salad': 'Russian Olivier salad sl.JPG',
    'eastern/kabuli-pulao': 'Qabili Pulau - Afghanistan National Dish.jpg',
    # Огурцы с мацони — по составу то же, что дзадзики/маст-о-хиар.
    'caucasian/cucumber-matsoni': 'Tzatziki meze or appetizer, also used as a sauce.jpg',
    # Гемиста — греческие фаршированные овощи, фото есть на Викискладе.
    'mediterranean/gemista': 'Gemista.jpg',
}


def main():
    report_path = f.DATA / 'images-report.json'
    report = json.loads(report_path.read_text('utf-8'))
    by_key = {item['key']: item for item in report}

    for key, filename in MANUAL.items():
        entry = by_key.get(key)
        if entry is None:
            print(f'{key}: нет в отчёте, пропуск')
            continue
        info = f.file_metadata([filename]).get(filename)
        if not info:
            print(f'{key}: {filename} не найден на Викискладе, пропуск')
            continue
        data = f.api('commons.wikimedia.org', {
            'action': 'query', 'format': 'json', 'formatversion': '2',
            'titles': f'File:{filename}', 'prop': 'imageinfo',
            'iiprop': 'url', 'iiurlwidth': '800',
        })
        pages = (data.get('query') or {}).get('pages') or []
        url = ((pages[0].get('imageinfo') or [{}])[0].get('thumburl')) if pages else None
        if not url:
            print(f'{key}: нет URL превью, пропуск')
            continue
        f.save(f.to_square(f.download(url)), f.DATA / entry['image'])
        entry.update({
            'status': 'manual',
            'title': filename,
            'file': filename,
            'descriptionUrl': info['descriptionUrl'],
            'license': info['license'],
            'licenseUrl': info['licenseUrl'],
            'artist': info['artist'],
        })
        print(f'{key}: {filename} ({info["license"]})')

    report_path.write_text(
        json.dumps(sorted(by_key.values(), key=lambda item: (item['cuisineId'], item['id'])),
                   ensure_ascii=False, indent=2),
        'utf-8',
    )

    credits = {}
    for item in by_key.values():
        if not item.get('file'):
            continue
        credits.setdefault(item['file'], {
            'file': item['file'],
            'title': item.get('title'),
            'license': item.get('license'),
            'licenseUrl': item.get('licenseUrl'),
            'artist': item.get('artist'),
            'descriptionUrl': item.get('descriptionUrl'),
            'usedBy': [],
        })['usedBy'].append(item['key'])
    (f.DATA / 'credits.json').write_text(
        json.dumps(sorted(credits.values(), key=lambda c: c['file']), ensure_ascii=False, indent=2),
        'utf-8',
    )
    print(f'credits.json: {len(credits)} файлов')
    return 0


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.exit(main())
