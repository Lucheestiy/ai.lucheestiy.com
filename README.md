# ai.lucheestiy.com

Русская версия дашборда `stats.lucheestiy.com`.

## Как устроено
- **Docker (локальная машина):** контейнер `ai-nginx` отдаёт `/home/mlweb/ai.lucheestiy.com/public` на порту `:8118`.
- **Данные (общие):** JSON берётся из `/home/mlweb/stats.lucheestiy.com/public/data/latest.json` (монтируется read-only), чтобы сбор usage происходил один раз.
- **Reverse proxy (droplet 97.107.142.128):** nginx + Let’s Encrypt проксируют `ai.lucheestiy.com` → `100.93.127.52:8118` (Tailscale).

## Локальные пути
- Web root: `/home/mlweb/ai.lucheestiy.com/public`
- Общий JSON: `/home/mlweb/stats.lucheestiy.com/public/data/latest.json`

## Команды (локальная машина)
- Запуск/остановка сайта:
  - `cd /home/mlweb/ai.lucheestiy.com && docker compose up -d`
  - `cd /home/mlweb/ai.lucheestiy.com && docker compose down`

## Droplet routing
- Config: `/etc/nginx/sites-enabled/ai.lucheestiy.com`
- Cert: `/etc/letsencrypt/live/ai.lucheestiy.com/`
