# Postback Tracker API

Node.js API для приёма postback-конверсий (GET/POST), отправки уведомлений в Telegram-каналы, админ-панели и выгрузки лидов.

## Возможности

- **Postback API** — REG, FTD, DEP, WTD (выводы)
- **Маршрутизация в Telegram** — по партнёру и типу конверсии
- **PostgreSQL** — хранение лидов, правил, админов, логов
- **Админ-панель** — вход через Telegram Login Widget
- **Роли** — superadmin, admin, viewer с разными правами
- **API-токены** — внешняя выгрузка лидов
- **CSV экспорт** — из админки и через API
- **Analytics webhooks** — пересылка конверсий во внешние системы
- **Audit log** — все действия администраторов

## Быстрый старт (Docker)

```bash
make init          # создаст .env из .env.example
# заполните TELEGRAM_BOT_TOKEN и VITE_TG_BOT_NAME в .env

make up            # postgres + migrate + app
make logs          # логи
```

Откройте http://localhost:3000

### Make-команды

| Команда        | Описание                              |
|----------------|---------------------------------------|
| `make init`    | Создать `.env` из примера             |
| `make up`      | Production stack в фоне               |
| `make down`    | Остановить stack                      |
| `make rebuild` | Пересобрать и перезапустить           |
| `make logs`    | Логи контейнеров                      |
| `make dev`     | Dev stack с hot reload                |
| `make db-push` | Применить схему БД (drizzle push)     |
| `make clean`   | Остановить и удалить volumes          |

> **Важно:** `VITE_TG_BOT_NAME` вшивается во frontend при сборке образа. После смены username бота выполните `make rebuild`.

## Деплой на Ubuntu (leg-api-postbacks.click)

Полная инструкция: [deploy/DEPLOY.md](deploy/DEPLOY.md)

```bash
# 1. DNS: A-запись leg-api-postbacks.click → IP сервера

# 2. На сервере
git clone <repo> /opt/leg-api-postbacks && cd /opt/leg-api-postbacks
make init && nano .env
make rebuild

# 3. Nginx + SSL
make nginx-install
make ssl-install EMAIL=your@email.com

# 4. @BotFather → /setdomain → leg-api-postbacks.click
```

После настройки:

| URL | Назначение |
|-----|------------|
| `https://leg-api-postbacks.click/` | Админка |
| `https://leg-api-postbacks.click/api/postback` | Postback GET/POST |
| `https://leg-api-postbacks.click/api/v1/leads?token=...` | External API |

## Локальный запуск (без Docker)

```bash
npm install
cp .env.example .env
# заполните .env

# PostgreSQL должен быть доступен по DATABASE_URL
npm run db:push

npm run dev
```

## Postback endpoint

```
GET/POST /api/postback
```

Параметры:

| Параметр    | Описание                          |
|-------------|-----------------------------------|
| type        | REG, FTD, DEP, WTD                |
| trader_id   | ID трейдера                       |
| country     | GEO                               |
| sumdep      | Сумма депозита/вывода             |
| tg_id       | Telegram ID игрока                |
| click_id    | Click ID (Chatterfy и др.)        |
| partner     | Партнёр (default)                 |

Пример:

```bash
curl "http://localhost:3000/api/postback?type=FTD&trader_id=123&country=UA&sumdep=100&tg_id=987654&partner=partner1"
```

## External API (выгрузка лидов)

Токен генерируется в админке → **API Tokens**.

```
GET /api/v1/leads?token=YOUR_TOKEN
```

Фильтры: `date_from`, `date_to`, `country`, `tg_id`, `trader_id`, `click_id`, `partner`, `type`

CSV:

```
GET /api/v1/leads?token=YOUR_TOKEN&format=csv&date_from=2026-01-01
```

Или заголовок: `X-API-Token: YOUR_TOKEN`

## Роли администраторов

| Роль        | Права                                              |
|-------------|----------------------------------------------------|
| superadmin  | Полный доступ                                      |
| admin       | Лиды, экспорт, правила маршрутизации               |
| viewer      | Только просмотр лидов                              |

Super admin (TG ID `6730949764`) создаётся автоматически при первом запуске.

## Telegram routing rules

В админке: **Routing Rules**

- `partner` — имя партнёра или `default`
- `conversion_type` — `*`, `REG`, `FTD`, `DEP`, `WTD`
- `target_chat_id` — ID Telegram-чата/канала (например `-1003964495246`)

## Analytics integrations

В админке: **Analytics** — добавьте webhook URL. При каждой конверсии отправляется POST:

```json
{
  "event": "FTD",
  "trader_id": "123",
  "country": "UA",
  "amount": "100",
  "tg_id": "987654",
  "click_id": "abc",
  "partner": "partner1",
  "timestamp": "2026-06-12T12:00:00.000Z"
}
```

## Production

### Docker (рекомендуется)

```bash
make init
make up
```

### Без Docker

```bash
npm run build
NODE_ENV=production node dist/server.cjs
```
