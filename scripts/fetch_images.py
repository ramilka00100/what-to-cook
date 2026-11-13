#!/usr/bin/env python3
"""Скачивает фото блюд со свободных источников Wikimedia и делает квадраты 150x150.

Чтобы не упираться в лимиты Викисклада, запросы идут пакетами:
  A. ведущие фото статей — до 50 заголовков за один запрос (английская, затем
     русская Википедия);
  B. для блюд без статьи — точечный поиск по Викискладу;
  C. лицензии и авторы — пакетами по 50 файлов;
  D. скачивание с CDN и обрезка до 150x150 (CDN не считает запросы API).

Берутся только файлы Викисклада (свободная лицензия), фото не повторяются
внутри одной кухни. Повторный запуск доскачивает только заглушки, готовые
файлы не трогает (--force перекачивает всё).

Результат: data/images/<cuisine>/<id>.jpg (150x150 JPEG), а также
data/images-report.json и data/credits.json.

Запуск:
  python scripts/fetch_images.py                 # всё
  python scripts/fetch_images.py --only russian  # одна кухня
  python scripts/fetch_images.py --limit 5       # проба
  python scripts/fetch_images.py --force         # перекачать существующие
"""

import argparse
import io
import json
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
SIZE = 150
UA = 'CuisineRecipeDataset/1.0 (local recipe dataset; contact: local-user)'
CTX = ssl._create_unverified_context()
API_INTERVAL = 0.4
DOWNLOAD_INTERVAL = 0.08
BATCH = 50

SKIP_WORDS = (
    'map', 'diagram', 'logo', 'coat of arms', 'flag', 'chart', 'scheme', 'graph',
    'icon', 'symbol', 'seal', 'emblem', 'montage', 'collage', 'poster', 'label',
    'cuisine', 'list of',
)

_last_api = 0.0
_last_download = 0.0


def out(message=''):
    print(message, flush=True)


def throttle(interval, which='api'):
    global _last_api, _last_download
    last = _last_api if which == 'api' else _last_download
    wait = interval - (time.time() - last)
    if wait > 0:
        time.sleep(wait)
    if which == 'api':
        _last_api = time.time()
    else:
        _last_download = time.time()


def api(host, params, retries=6):
    """Запрос к MediaWiki API с паузой на 429 и повторами на сетевые сбои."""
    url = f'https://{host}/w/api.php?' + urllib.parse.urlencode(params)
    last = None
    for attempt in range(retries):
        throttle(API_INTERVAL)
        try:
            request = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(request, timeout=40, context=CTX) as response:
                return json.loads(response.read().decode('utf-8'))
        except urllib.error.HTTPError as error:
            last = error
            if error.code == 429:
                delay = int(error.headers.get('Retry-After') or 0) or 30
                out(f'  ~ 429, пауза {delay}s')
                time.sleep(delay)
            else:
                time.sleep(2 * (attempt + 1))
        except Exception as error:  # noqa: BLE001
            last = error
            time.sleep(2 * (attempt + 1))
    raise last


def norm(title):
    return re.sub(r'[_ ]+', ' ', (title or '')).strip().lower()


def chunks(items, size):
    for start in range(0, len(items), size):
        yield items[start:start + size]


def page_images(host, titles):
    """Ведущие фото статей пакетами: {запрошенный заголовок: кандидат}."""
    result = {}
    unique = list(dict.fromkeys(title for title in titles if title))
    for chunk in chunks(unique, BATCH):
        try:
            data = api(host, {
                'action': 'query', 'format': 'json', 'formatversion': '2',
                'titles': '|'.join(chunk), 'prop': 'pageimages',
                'piprop': 'thumbnail|name', 'pithumbsize': '500', 'redirects': '1',
            })
        except Exception as error:  # noqa: BLE001
            out(f'  ! пакет страниц: {type(error).__name__}: {error}')
            continue
        query = data.get('query') or {}
        normalized = {norm(item.get('from')): norm(item.get('to')) for item in query.get('normalized') or []}
        redirects = {norm(item.get('from')): norm(item.get('to')) for item in query.get('redirects') or []}
        pages = {norm(page.get('title')): page for page in query.get('pages') or []}

        for title in chunk:
            key = norm(title)
            key = normalized.get(key, key)
            key = redirects.get(key, key)
            page = pages.get(key) or pages.get(norm(title))
            if not page or page.get('missing'):
                continue
            url = (page.get('thumbnail') or {}).get('source')
            if not url:
                continue
            result[title] = {
                'kind': 'page',
                'title': page.get('title'),
                'file': page.get('pageimage'),
                'url': url,
            }
    return result


def search_files(query, limit=6):
    """Файлы Викисклада по поисковому запросу."""
    try:
        data = api('commons.wikimedia.org', {
            'action': 'query', 'format': 'json', 'formatversion': '2',
            'generator': 'search', 'gsrsearch': f'{query} filetype:bitmap',
            'gsrnamespace': '6', 'gsrlimit': str(limit), 'prop': 'imageinfo',
            'iiprop': 'url|mime|size', 'iiurlwidth': '500',
        })
    except Exception:  # noqa: BLE001
        return []
    results = []
    for page in (data.get('query') or {}).get('pages') or []:
        info = (page.get('imageinfo') or [{}])[0]
        title = re.sub(r'^File:', '', page.get('title') or '')
        mime = info.get('mime') or ''
        width = info.get('width') or 0
        url = info.get('thumburl') or info.get('url')
        if not url or mime not in ('image/jpeg', 'image/png') or width < 300:
            continue
        if any(word in title.lower() for word in SKIP_WORDS):
            continue
        results.append({'kind': 'search', 'title': title, 'file': title, 'url': url})
    return results


def file_name_from_url(url):
    """Имя файла на Викискладе из URL превью."""
    path = urllib.parse.urlparse(url).path
    match = re.search(r'/thumb/[0-9a-f]/[0-9a-f]{2}/([^/]+)/', path)
    if match:
        return urllib.parse.unquote(match.group(1))
    match = re.search(r'/commons/[0-9a-f]/[0-9a-f]{2}/([^/]+)$', path)
    if match:
        return urllib.parse.unquote(match.group(1))
    return None


def file_metadata(filenames):
    """Пакетно забирает лицензии/размеры; файлов нет на Викискладе — нет и метаданных."""
    result = {}
    unique = list(dict.fromkeys(name for name in filenames if name))
    for chunk in chunks(unique, BATCH):
        data = api('commons.wikimedia.org', {
            'action': 'query', 'format': 'json', 'formatversion': '2',
            'titles': '|'.join(f'File:{name}' for name in chunk),
            'prop': 'imageinfo', 'iiprop': 'url|extmetadata|size',
        })
        by_title = {}
        for page in (data.get('query') or {}).get('pages') or []:
            if page.get('missing'):
                continue
            title = re.sub(r'^File:', '', page.get('title') or '')
            by_title[norm(title)] = page
            by_title[norm(title).replace(' ', '_')] = page
        for name in chunk:
            page = by_title.get(norm(name)) or by_title.get(norm(name).replace(' ', '_'))
            info = (page.get('imageinfo') or [None])[0] if page else None
            if not info:
                continue
            meta = info.get('extmetadata') or {}

            def field(key):
                value = (meta.get(key) or {}).get('value') or ''
                return re.sub(r'<[^>]+>', '', str(value)).strip()

            result[name] = {
                'file': name,
                'descriptionUrl': info.get('descriptionurl'),
                'license': field('LicenseShortName') or 'unknown',
                'licenseUrl': field('LicenseUrl'),
                'artist': field('Artist') or field('Credit') or 'unknown',
                'width': info.get('width'),
                'height': info.get('height'),
            }
    out(f'  метаданные: {len(result)}/{len(unique)} файлов')
    return result


def download(url, retries=3):
    last = None
    for attempt in range(retries):
        throttle(DOWNLOAD_INTERVAL, 'download')
        try:
            request = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(request, timeout=45, context=CTX) as response:
                return response.read()
        except Exception as error:  # noqa: BLE001
            last = error
            time.sleep(1.5 * (attempt + 1))
    raise last


def to_square(raw):
    image = Image.open(io.BytesIO(raw))
    image = ImageOps.exif_transpose(image)
    if image.mode in ('RGBA', 'LA', 'P'):
        rgba = image.convert('RGBA')
        background = Image.new('RGB', rgba.size, (255, 255, 255))
        background.paste(rgba, mask=rgba.split()[-1])
        image = background
    else:
        image = image.convert('RGB')
    return ImageOps.fit(image, (SIZE, SIZE), method=Image.LANCZOS, centering=(0.5, 0.5))


def placeholder(name):
    """Заглушка 150x150 с названием блюда, если фото не нашлось."""
    palette = [(224, 122, 95), (61, 64, 91), (242, 204, 143), (129, 178, 154), (100, 130, 160)]
    color = palette[sum(name.encode('utf-8')) % len(palette)]
    image = Image.new('RGB', (SIZE, SIZE), color)
    draw = ImageDraw.Draw(image)
    font_path = Path(r'C:\Windows\Fonts\arialbd.ttf')
    font = ImageFont.truetype(str(font_path), 15) if font_path.exists() else ImageFont.load_default()

    lines, current = [], ''
    for word in name.split():
        candidate = f'{current} {word}'.strip()
        if draw.textlength(candidate, font=font) <= SIZE - 16:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    lines = lines[:3]

    heights = [draw.textbbox((0, 0), line, font=font)[3] for line in lines]
    y = (SIZE - (sum(heights) + (len(lines) - 1) * 4)) // 2
    for line, height in zip(lines, heights):
        width = draw.textlength(line, font=font)
        draw.text(((SIZE - width) / 2, y), line, font=font, fill=(255, 255, 255))
        y += height + 4
    return image


def save(image, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, 'JPEG', quality=86, optimize=True, progressive=True)


def usable(candidate):
    """Отбрасываем перенаправления на обзорные статьи («Russian cuisine»)."""
    title = (candidate.get('title') or '').lower()
    return not any(word in title for word in SKIP_WORDS)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--only', help='только одна кухня, например russian')
    parser.add_argument('--limit', type=int, default=0, help='ограничить число блюд (проба)')
    parser.add_argument('--force', action='store_true', help='перекачать существующие картинки')
    args = parser.parse_args()

    source = DATA / 'dishes.json'
    if not source.exists():
        out('Нет data/dishes.json — сначала выполни: node scripts/build-json.js')
        return 1

    dishes = json.loads(source.read_text('utf-8'))['dishes']
    if args.only:
        dishes = [dish for dish in dishes if dish['cuisineId'] == args.only]
    if args.limit:
        dishes = dishes[: args.limit]

    report_path = DATA / 'images-report.json'
    report = []
    if report_path.exists():
        try:
            report = json.loads(report_path.read_text('utf-8'))
        except json.JSONDecodeError:
            report = []
    done = {item['key']: item for item in report}
    used_files = {(item.get('cuisineId'), item.get('file')) for item in report if item.get('file')}

    pending = []
    for dish in dishes:
        previous = done.get(dish['key'])
        target = DATA / dish['image']
        if (
            target.exists()
            and not args.force
            and previous is not None
            and not previous.get('status', '').startswith('placeholder')
        ):
            continue
        pending.append(dish)

    out(f'К обработке: {len(pending)} из {len(dishes)}')
    if not pending:
        return 0

    # A. Ведущие фото статей — пакетами.
    en_titles = [dish['nameEn'] for dish in pending if dish.get('nameEn')]
    en_pages = page_images('en.wikipedia.org', en_titles) if en_titles else {}
    out(f'  английская Википедия: {len(en_pages)}/{len(set(en_titles))}')

    missing_ru = [dish for dish in pending if en_pages.get(dish.get('nameEn')) is None]
    ru_titles = [dish['name'] for dish in missing_ru if dish.get('name')]
    ru_pages = page_images('ru.wikipedia.org', ru_titles) if ru_titles else {}
    out(f'  русская Википедия: {len(ru_pages)}/{len(set(ru_titles))}')

    candidates = {}
    for dish in pending:
        options = []
        page = en_pages.get(dish.get('nameEn'))
        if page and usable(page):
            options.append(page)
        page = ru_pages.get(dish.get('name'))
        if page and usable(page):
            options.append(page)
        candidates[dish['key']] = options

    # B. Точечный поиск по Викискладу для блюд без статьи.
    need_search = [dish for dish in pending if not candidates[dish['key']]]
    for index, dish in enumerate(need_search, start=1):
        found = search_files(dish.get('nameEn') or dish['name'], 4)
        if not found and dish.get('nameEn'):
            found = search_files(dish['name'], 4)
        candidates[dish['key']] = found[:3]
        if index % 10 == 0 or index == len(need_search):
            out(f'  поиск по Викискладу: {index}/{len(need_search)}')
    out(f'  блюд с кандидатами: {sum(1 for dish in pending if candidates[dish["key"]])}/{len(pending)}')

    # C. Метаданные пакетами.
    names = []
    for dish in pending:
        for candidate in candidates[dish['key']]:
            candidate['file'] = candidate.get('file') or file_name_from_url(candidate['url'])
            if candidate['file']:
                names.append(candidate['file'])
    meta = file_metadata(names) if names else {}

    # D. Выбор, скачивание, обрезка.
    counts = {}
    for index, dish in enumerate(pending, start=1):
        status, chosen, info = 'placeholder', None, None
        for candidate in candidates[dish['key']]:
            filename = candidate.get('file')
            candidate_info = meta.get(filename) if filename else None
            if not candidate_info:
                continue
            if (dish['cuisineId'], filename) in used_files:
                continue
            if candidate['kind'] == 'search':
                ratio = candidate_info['width'] / candidate_info['height']
                if not (0.55 <= ratio <= 2.1):
                    continue
            chosen, info = candidate, candidate_info
            break

        try:
            if chosen and info:
                save(to_square(download(chosen['url'])), DATA / dish['image'])
                used_files.add((dish['cuisineId'], info['file']))
                status = 'page' if chosen['kind'] == 'page' else 'commons'
            else:
                save(placeholder(dish['name']), DATA / dish['image'])
        except Exception as error:  # noqa: BLE001
            out(f'  ! {dish["key"]}: {type(error).__name__}: {error}')
            save(placeholder(dish['name']), DATA / dish['image'])
            status = 'error'

        done[dish['key']] = {
            'key': dish['key'],
            'cuisineId': dish['cuisineId'],
            'id': dish['id'],
            'name': dish['name'],
            'nameEn': dish.get('nameEn'),
            'image': dish['image'],
            'status': status,
            'title': (chosen or {}).get('title'),
            'file': (info or {}).get('file'),
            'descriptionUrl': (info or {}).get('descriptionUrl'),
            'license': (info or {}).get('license'),
            'licenseUrl': (info or {}).get('licenseUrl'),
            'artist': (info or {}).get('artist'),
        }
        counts[status] = counts.get(status, 0) + 1
        if index % 20 == 0 or index == len(pending):
            report_path.write_text(
                json.dumps(sorted(done.values(), key=lambda item: item['key']), ensure_ascii=False, indent=2),
                'utf-8',
            )
            out(f'  [{index}/{len(pending)}] ' + ', '.join(f'{k}={v}' for k, v in sorted(counts.items())))

    report = sorted(done.values(), key=lambda item: (item['cuisineId'], item['id']))
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf-8')

    credits = {}
    for item in report:
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
    (DATA / 'credits.json').write_text(
        json.dumps(sorted(credits.values(), key=lambda c: c['file']), ensure_ascii=False, indent=2),
        'utf-8',
    )

    out('')
    out('Итоги этого запуска:')
    for status, count in sorted(counts.items()):
        out(f'  {status:12} {count}')
    missing = [
        item['key'] for item in report
        if item['status'].startswith('placeholder') or item['status'] == 'error'
    ]
    out(f'  всего в датасете: {len(report)}, без фото: {len(missing)}')
    if missing:
        out('  без фото: ' + ', '.join(missing[:25]) + ('…' if len(missing) > 25 else ''))
    return 0


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.exit(main())
