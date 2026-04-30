# liquipedia

Стартовый проект для ручной загрузки данных по чемпионатам Liquipedia, начиная с раздела **Dota 2**.

Это **не фоновый парсер**, **не crawler** и **не глобальный мониторинг всех турниров**. Данные запрашиваются только по действию пользователя:

1. Пользователь заходит в `/dota2`.
2. Вводит примерное название чемпионата.
3. Нажимает **Найти чемпионат**.
4. Выбирает найденную страницу.
5. Нажимает **Загрузить данные**.
6. Проект получает страницу через MediaWiki API, сохраняет raw snapshot, нормализует данные и показывает результат.

## Что уже есть

- Next.js + TypeScript + Tailwind.
- Prisma + PostgreSQL.
- Docker Compose для локальной базы.
- Раздел `/dota2`.
- Поиск турнира через Liquipedia MediaWiki API.
- Сохранение `search_requests` и `search_results`.
- Ручная загрузка выбранного турнира.
- Сохранение `tournament_imports` и `raw_snapshots`.
- Начальный нормализатор Dota 2 турнира.
- Страница деталей турнира.
- Экспорт JSON / CSV / Markdown.
- История загрузок.
- Страница настроек API.

## Что специально не реализовано

- Игроки.
- Составы.
- Трансферы.
- Изменения страниц.
- Сигналы / diff-мониторинг.
- Постоянный background sync.
- Автообход всех чемпионатов.
- HTML scraping.

## Быстрый запуск

```bash
cp .env.example .env
docker compose up -d
npm install
npm run prisma:generate
npm run db:push
npm run db:seed
npm run dev
```

Открой:

```text
http://localhost:3000
```

## Обязательно поправить `.env`

Перед реальным использованием измени:

```env
LIQUIPEDIA_USER_AGENT="liquipedia-local-dev/0.1 (https://your-domain.example; your-email@example.com)"
```

Liquipedia требует понятный custom User-Agent с контактами проекта. Не оставляй `change-me@example.com` для реальных запросов.

## Структура проекта

```text
liquipedia/
├─ src/app/
│  ├─ dota2/                         # UI раздела Dota 2
│  ├─ api/dota2/search-tournament/   # поиск страниц Liquipedia
│  ├─ api/dota2/import-tournament/   # ручная загрузка выбранной страницы
│  ├─ history/                       # история загрузок
│  └─ settings/                      # env/API настройки
├─ src/components/
├─ src/lib/
│  ├─ liquipedia/                    # API client + rate limiter
│  └─ normalizers/                   # wikitext normalizers
├─ prisma/schema.prisma
├─ prisma/seed.ts
├─ docs/
└─ docker-compose.yml
```

## Таблицы

- `disciplines`
- `search_requests`
- `search_results`
- `tournament_imports`
- `raw_snapshots`
- `tournaments`
- `tournament_participants`
- `tournament_matches`

## Точки доработки

Главный файл для продолжения:

```text
src/lib/normalizers/dota2Tournament.ts
```

Сейчас нормализатор эвристический. Он извлекает infobox, пробует найти участников и match templates. Для production нужно дорабатывать под реальные шаблоны Liquipedia Dota 2.

Debug-страница турнира показывает raw wikitext, чтобы удобно улучшать normalizer прямо в Antigravity.

## API routes

### POST `/api/dota2/search-tournament`

Body:

```json
{
  "query": "Riyadh Masters"
}
```

### POST `/api/dota2/import-tournament`

Body:

```json
{
  "pageId": 123456,
  "title": "Riyadh Masters/2024"
}
```

### GET `/api/dota2/tournament/:id`

Возвращает турнир, участников, матчи и последний raw snapshot.

### GET `/api/dota2/tournament/:id/export?format=json|csv|markdown`

Экспортирует выбранный турнир. Для CSV можно добавить `type=participants` или `type=matches`.

## Правила проекта

- Запросы только через API.
- Не парсить generated HTML страницы.
- Любая загрузка только по кнопке пользователя.
- Raw snapshot сохраняется до нормализации.
- В каждой сущности хранить `sourceUrl`.
- Показывать attribution/source link на Liquipedia.
- Не делать фоновые задачи без отдельного решения.
