# API policy

Проект использует Liquipedia только как API-источник. HTML scraping запрещён внутри этого проекта.

## Allowed flow

```text
User clicks button → MediaWiki API request → raw snapshot → normalizer → database → UI
```

## Not allowed

```text
Background crawler → generated HTML pages → DOM parsing → database
```

## Rate limiting

В проекте есть in-memory limiter:

- generic requests: `LIQUIPEDIA_GENERIC_MIN_INTERVAL_MS`, по умолчанию `2100 ms`;
- parse requests: `LIQUIPEDIA_PARSE_MIN_INTERVAL_MS`, по умолчанию `31000 ms`.

Сейчас `action=parse` не используется, но отдельная переменная оставлена на будущее.

## User-Agent

Перед реальным использованием нужно заменить:

```env
LIQUIPEDIA_USER_AGENT="liquipedia-local-dev/0.1 (https://your-domain.example; your-email@example.com)"
```

## Caching

Поиск кешируется через таблицы `search_requests` и `search_results`.

Импорт турнира создаёт новый `tournament_import` и новый `raw_snapshot`, потому что пользователь явно нажимает кнопку обновления.

## Attribution

Каждый нормализованный турнир хранит:

- `sourceTitle`
- `sourceUrl`
- `sourcePageId`

UI показывает ссылку на Liquipedia source.
