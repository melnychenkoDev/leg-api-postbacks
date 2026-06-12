# Деплой на Ubuntu + домен leg-api-postbacks.click

Один домен обслуживает и **админку**, и **postback API**:

| URL | Назначение |
|-----|------------|
| `https://leg-api-postbacks.click/` | Админ-панель |
| `https://leg-api-postbacks.click/api/postback` | Postback (GET/POST) |
| `https://leg-api-postbacks.click/api/v1/leads` | External API (токен) |

---

## 1. DNS

В панели регистратора домена создайте **A-запись**:

```
leg-api-postbacks.click  →  IP вашего Ubuntu-сервера
```

Проверка (подождите 5–30 мин):

```bash
dig +short leg-api-postbacks.click
```

---

## 2. Подготовка сервера (Ubuntu 22.04/24.04)

```bash
# обновление
sudo apt update && sudo apt upgrade -y

# docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# перелогиньтесь или: newgrp docker

# firewall
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

---

## 3. Загрузка проекта на сервер

```bash
git clone <your-repo-url> /opt/leg-api-postbacks
cd /opt/leg-api-postbacks

make init
nano .env
```

Заполните `.env`:

```env
TELEGRAM_BOT_TOKEN=...
VITE_TG_BOT_NAME=legendsPB_bot
DOMAIN=leg-api-postbacks.click
POSTGRES_PASSWORD=strong-random-password
JWT_SECRET=...   # openssl rand -hex 32
NODE_ENV=production
```

> `VITE_TG_BOT_NAME` вшивается при сборке — после смены нужен `make rebuild`.

---

## 4. Запуск приложения (Docker)

```bash
make rebuild
make ps
curl http://127.0.0.1:3000/health
```

Приложение слушает только `127.0.0.1:3000` — снаружи недоступно напрямую.

---

## 5. Nginx + SSL

```bash
sudo bash deploy/install-nginx.sh
sudo bash deploy/install-ssl.sh your@email.com
```

Или вручную:

```bash
sudo cp deploy/nginx/leg-api-postbacks.click.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/leg-api-postbacks.click.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d leg-api-postbacks.click
```

---

## 6. Telegram Login Widget

В @BotFather:

```
/setdomain
→ выберите бота
→ leg-api-postbacks.click
```

Без этого вход в админку через Telegram не заработает.

---

## 7. Проверка

```bash
# health
curl https://leg-api-postbacks.click/health

# postback
curl "https://leg-api-postbacks.click/api/postback?type=REG&trader_id=123&country=UA&tg_id=111&partner=default"

# админка в браузере
open https://leg-api-postbacks.click
```

---

## Postback URL для партнёрок

```
https://leg-api-postbacks.click/api/postback?type={type}&trader_id={trader_id}&country={country}&sumdep={sumdep}&tg_id={tg_id}&click_id={click_id}&partner={partner}
```

Типы: `REG`, `FTD`, `DEP`, `WTD`

---

## Обновление

```bash
cd /opt/leg-api-postbacks
git pull
make rebuild
```

---

## Полезные команды

```bash
make logs          # логи app
make db-shell      # psql
make restart       # перезапуск app
sudo certbot renew --dry-run   # проверка авто-продления SSL
```

---

## Troubleshooting

**502 Bad Gateway** — app не запущен:
```bash
make ps
make logs
curl http://127.0.0.1:3000/health
```

**Telegram login не работает** — проверьте `/setdomain` и `VITE_TG_BOT_NAME` (нужен rebuild).

**SSL не выдаётся** — DNS ещё не обновился или порт 80 закрыт firewall.
