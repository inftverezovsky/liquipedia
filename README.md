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

## Локальный запуск через Docker

Для запуска всего проекта одной командой (база + приложение):

```bash
docker compose down
docker compose up -d --build
```

### Проверка
```bash
docker compose ps
docker logs tcyber-web --tail 100
```

### Открыть в браузере
```text
http://localhost:3010
```

*Примечание: Onyx может продолжать работать на порту 3000, конфликтов не будет.*

## Деплой на Railway

Проект готов к деплою на [Railway](https://railway.app/).

### Шаги для деплоя:
1. Создайте новый проект в Railway.
2. Добавьте сервис **Database -> Add PostgreSQL**.
3. Добавьте сервис **GitHub Repo** (подключите этот репозиторий).
4. Railway автоматически обнаружит `Dockerfile` и `railway.json`.
5. В настройках **Variables** сервиса `web` убедитесь, что `DATABASE_URL` подтянулся автоматически (или пропишите его вручную из настроек PostgreSQL).
6. Добавьте переменную `LIQUIPEDIA_USER_AGENT`.

Проект выполняет `prisma migrate deploy` при старте контейнера. Seed запускайте отдельно командой `npm run db:seed`, чтобы рестарт приложения не перезаписывал настройки.

## Обязательно поправить `.env`

Перед реальным использованием измени:

```env
LIQUIPEDIA_USER_AGENT="liquipedia-local-dev/0.1 (https://your-domain.example; your-email@example.com)"
```

Liquipedia требует понятный custom User-Agent с контактами проекта. Не оставляй `change-me@example.com` для реальных запросов.

## Проверки качества

Локальный набор проверок:

```bash
npm run typecheck
npm run lint
npm test
npm audit --audit-level=moderate
npm run build
npm run test:e2e
```

`npm run test:e2e` поднимает `next dev` через Playwright и проверяет главную страницу, admin auth API и парольный gate настроек. DB-backed FIxt integration включается отдельно, чтобы случайно не писать в dev/prod базу:

```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/liquipedia_test" npm run test:e2e:db
```

В PowerShell:

```powershell
$env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/liquipedia_test"
npm run test:e2e:db
```

В CI этот тест запускается против отдельного PostgreSQL service и мокает внешнюю админ-платформу. Для существующей production-базы, созданной ранее через `prisma db push`, перед первым `npm run db:migrate:deploy` нужно отметить начальную миграцию как применённую:

```bash
npx prisma migrate resolve --applied 20260510160000_init
```

## Админ-заливка (Admin Upload)

В проекте реализован механизм ручной отправки расписания матчей во внешнюю админ-панель.

### Как это работает:

1. **Глобальные настройки**: В разделе `/dota2` (Dota 2 Portal) в блоке "Настройки админ-заливки" задаются:
   - **API URL**: Куда отправлять данные.
   - **Sport ID**: ID дисциплины в вашей системе (например, 73 для Dota 2).
   - **Max**: Лимит матчей.
   - **Default Shapka ID**: ID турнира ("шапка") по умолчанию.
   - **Request Mode**: Способ передачи данных (`legacy_raw`, `urlencoded`, `multipart`).
2. **Настройки турнира**: На странице конкретного турнира можно переопределить **Shapka ID**.
3. **Маппинг команд**: В блоке "Маппинг команд" нужно указать `Platform ID` для участников.
   - Матч будет готов к отправке, только если у **обеих** команд заполнен `Platform ID` и статус маппинга `auto_mapped` или `manual_mapped`.
4. **Заливка**:
   - Нажмите **Сформировать preview** для проверки payload.
   - Нажмите **Отправить в API** для выполнения POST запроса.
   - Данные отправляются в формате `fixt=serialize($data)`, где `$data` — это PHP-совместимый массив.

### Технические детали:
- **Таймзона**: Все даты матчей перед отправкой конвертируются в **Europe/Moscow**.
- **Формат даты**: `DD.MM.YYYY HH:mm:ss`.
- **Сериализация**: Используется эквивалент PHP `serialize()`.
- **Логирование**: Все попытки отправки сохраняются в таблицу `AdminUploadLog`.

## Безопасная админ-заливка (mTLS и Auth)

Если внешняя платформа требует сертификаты клиента или авторизацию, настройте следующие переменные в `.env`:

### 1. Авторизация (Auth)

Поддерживаемые режимы (`ADMIN_AUTH_MODE`): `none`, `basic`, `bearer`, `x-api-key`.

- **Basic Auth**:
  ```env
  ADMIN_AUTH_MODE=basic
  ADMIN_BASIC_USERNAME=your_user
  ADMIN_BASIC_PASSWORD=your_password
  ```
- **Bearer Token**:
  ```env
  ADMIN_AUTH_MODE=bearer
  ADMIN_API_TOKEN=your_token
  ```
- **Custom Header**:
  ```env
  ADMIN_AUTH_MODE=x-api-key
  ADMIN_API_KEY_HEADER=x-api-key
  ADMIN_API_KEY_VALUE=your_value
  ```

### 2. Клиентские сертификаты (mTLS)

Включите `ADMIN_MTLS_ENABLED=true`.

- **Вариант PFX/P12 (рекомендуется)**:
  Положите файл в `./certs/client.pfx` и укажите путь:
  ```env
  ADMIN_MTLS_PFX_PATH=./certs/client.pfx
  ADMIN_MTLS_PFX_PASSPHRASE=your_passphrase
  ```
- **Вариант Cert/Key (PEM)**:
  ```env
  ADMIN_MTLS_CERT_PATH=./certs/client.crt
  ADMIN_MTLS_KEY_PATH=./certs/client.key
  ADMIN_MTLS_CA_PATH=./certs/ca.crt
  ```
- **Для Railway (Base64)**:
  Если файлы нельзя загрузить, используйте Base64 версию:
  ```env
  ADMIN_MTLS_PFX_BASE64=base64_content_of_pfx_file
  ```

### 3. Docker

При использовании Docker сертификаты подключаются через volume:

```yaml
services:
  web:
    volumes:
      - ./certs:/app/certs:ro
    environment:
      - ADMIN_MTLS_PFX_PATH=/app/certs/client.pfx
```

**ВАЖНО:** Папка `certs/` и файлы `*.pem, *.crt, *.key, *.p12, *.pfx` добавлены в `.gitignore` и не попадут в репозиторий.

## Структура проекта

```text
liquipedia/
├─ src/app/
│  ├─ dota2/                         # UI раздела Dota 2
│  ├─ api/admin-settings/            # Глобальные настройки админки
│  ├─ api/dota2/tournament/[id]/     # API турнира
│  │  ├─ admin-mapping/              # Маппинг Shapka ID
│  │  ├─ admin-fixt-preview/         # Предпросмотр payload
│  │  └─ admin-fixt-send/            # Отправка в API
│  ...
├─ src/lib/
│  ├─ adminUpload/                   # Логика формирования и отправки
│  │  ├─ buildFixtPayload.ts
│  │  ├─ phpSerialize.ts
│  │  └─ sendFixtPayload.ts
│  ├─ liquipedia/                    # API client + rate limiter
│  └─ normalizers/                   # wikitext normalizers
├─ prisma/schema.prisma
├─ prisma/seed.ts
├─ docs/
└─ docker-compose.yml
```

## Таблицы

- `disciplines`
- `discipline_admin_settings`
- `tournament_admin_mappings`
- `admin_upload_logs`
- `search_requests`
- `search_results`
- `tournament_imports`
- `raw_snapshots`
- `tournaments`
- `tournament_participants`
- `tournament_matches`
- `team_mappings`

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

- Запросы только через API..
- Не парсить generated HTML страницы.
- Любая загрузка только по кнопке пользователя.
- Raw snapshot сохраняется до нормализации.
- В каждой сущности хранить `sourceUrl`.
- Показывать attribution/source link на Liquipedia..
- Не делать фоновые задачи без отдельного решения.
