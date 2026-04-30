# Normalizer TODO

Файл для основной доработки:

```text
src/lib/normalizers/dota2Tournament.ts
```

Сейчас normalizer работает эвристически:

1. Находит первый `{{Infobox ...}}`.
2. Извлекает базовые поля турнира.
3. Пытается найти участников в секциях `Participants`, `Teams`, `Participating Teams`.
4. Пытается найти match templates по префиксам `Match` и `BracketMatch`.

## Что доработать после первых тестов

### 1. Infobox aliases

Добавлять реальные названия полей из raw wikitext страниц:

```ts
const startDate = parseWikiDate(params.startdate ?? params.start_date ?? params.date ?? params.dates);
```

### 2. Participants parser

Liquipedia Dota 2 может использовать разные team templates. После первой загрузки турнира смотреть raw wikitext и добавлять regex/template parsers.

### 3. Matches parser

Самая сложная часть. Нужно отдельно разобрать:

- group stage;
- playoffs;
- bracket templates;
- completed matches;
- upcoming matches;
- bo format;
- score fields.

### 4. Partial status

Если участники или матчи не извлеклись, текущий статус `PARTIAL`. Это нормально для MVP.

### 5. Exports

Добавить endpoints/UI кнопки:

- JSON export;
- CSV export;
- Markdown export;
- copy table.
