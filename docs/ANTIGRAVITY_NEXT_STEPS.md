# Antigravity next steps

## С чего продолжить

1. Открыть проект в Antigravity.
2. Скопировать `.env.example` в `.env`.
3. Запустить Postgres:

```bash
docker compose up -d
```

4. Установить зависимости:

```bash
npm install
```

5. Подготовить Prisma:

```bash
npm run prisma:generate
npm run db:push
npm run db:seed
```

6. Запустить:

```bash
npm run dev
```

## Первый тест

Зайти в `/dota2` и попробовать запросы:

```text
Riyadh Masters
DreamLeague
The International
ESL One
BetBoom Dacha
```

## Первый файл для доработки

```text
src/lib/normalizers/dota2Tournament.ts
```

## Промпт для дальнейшей работы с Claude Code / Antigravity

```text
We have a Next.js + Prisma project named liquipedia. It manually searches and imports Dota 2 tournament pages from Liquipedia through the MediaWiki API. Do not add background crawling, players, rosters, transfers, page diff monitoring, or HTML scraping. Continue improving only the manual tournament flow: search → select page → load data → raw snapshot → normalize tournament/participants/matches → display/export.
```

## Приоритет ближайших задач

1. Проверить, что search API возвращает релевантные страницы.
2. Загрузить 2-3 реальных турнира.
3. Сравнить raw wikitext с результатом normalizer.
4. Улучшить парсинг participants.
5. Улучшить парсинг matches/brackets.
6. Добавить экспорт JSON/CSV/Markdown.
