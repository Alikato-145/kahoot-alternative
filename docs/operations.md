# Camp Quiz operations guide

This guide runs the quiz on one public HTTPS hostname. MySQL owns authored quizzes and final scores; Redis owns live rooms. Run Node as `campquiz`, never as root. The projected Host and every phone must use the same public URL.

## Local development

Copy the template and keep `.env` private, then start the development databases, install dependencies, migrate, and run:

```sh
cp .env.example .env
docker compose up -d
npm ci
npm run db:migrate
npm run dev
```

Browse `http://localhost:3000/host`. Stop development databases with `docker compose down` (add `-v` only when deliberately discarding local data).

## Bare-metal production

These commands target Debian/Ubuntu-like hosts. Install Node.js 20 LTS, MySQL 8, Redis 7, Nginx, and Certbot first. Create a DNS `A`/`AAAA` record for the hostname before requesting a certificate.

```sh
sudo useradd --system --create-home --home-dir /srv/camp-quiz --shell /usr/sbin/nologin campquiz
sudo mkdir -p /srv/camp-quiz/media
sudo chown -R campquiz:campquiz /srv/camp-quiz
sudo -u campquiz git clone <YOUR_REPOSITORY_URL> /srv/camp-quiz
sudo -u campquiz npm --prefix /srv/camp-quiz ci --omit=dev
```

Create the MySQL database and a local, least-privileged user. Choose a unique password and do not commit it.

```sql
CREATE DATABASE camp_quiz CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'campquiz'@'localhost' IDENTIFIED BY 'REPLACE_WITH_A_LONG_PASSWORD';
GRANT ALL PRIVILEGES ON camp_quiz.* TO 'campquiz'@'localhost';
FLUSH PRIVILEGES;
```

Create `/etc/camp-quiz.env`, owned by root and readable by `campquiz`:

```ini
DATABASE_URL=mysql://campquiz:REPLACE_WITH_A_LONG_PASSWORD@127.0.0.1:3306/camp_quiz
REDIS_URL=redis://127.0.0.1:6379
MEDIA_ROOT=/srv/camp-quiz/media
PUBLIC_BASE_URL=https://quiz.example.com
PORT=3000
```

```sh
sudo chown root:campquiz /etc/camp-quiz.env
sudo chmod 640 /etc/camp-quiz.env
sudo -u campquiz npm --prefix /srv/camp-quiz run db:migrate
sudo -u campquiz npm --prefix /srv/camp-quiz run build
```

Copy `deploy/systemd/camp-quiz.service` to `/etc/systemd/system/`, then enable and restart it after every app update:

```sh
sudo cp /srv/camp-quiz/deploy/systemd/camp-quiz.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now camp-quiz
sudo systemctl restart camp-quiz
sudo systemctl status camp-quiz --no-pager
```

## Nginx, HTTPS, and WebSocket

Copy `deploy/nginx/camp-quiz.conf` to `/etc/nginx/sites-available/camp-quiz`, replace every `quiz.example.com`, enable the site, and remove the default site if it conflicts. Open firewall ports 80 and 443.

```sh
sudo ln -s /etc/nginx/sites-available/camp-quiz /etc/nginx/sites-enabled/camp-quiz
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d quiz.example.com
sudo nginx -t && sudo systemctl reload nginx
```

Certbot renews automatically on normal installs; verify with `sudo certbot renew --dry-run`. The `/socket.io/` location upgrades connections, so browsers use `wss://quiz.example.com/socket.io/` when loaded over HTTPS. Do not expose Node port 3000, MySQL 3306, or Redis 6379 publicly.

## Updates, backup, and diagnostics

Before an update, back up MySQL. Redis is live/expiring state, not the durable quiz backup.

```sh
sudo mysqldump --single-transaction --routines --databases camp_quiz | gzip > /var/backups/camp-quiz-$(date +%F).sql.gz
sudo -u campquiz git -C /srv/camp-quiz pull
sudo -u campquiz npm --prefix /srv/camp-quiz ci --omit=dev
sudo -u campquiz npm --prefix /srv/camp-quiz run db:migrate
sudo -u campquiz npm --prefix /srv/camp-quiz run build
sudo systemctl restart camp-quiz
```

Useful checks:

```sh
sudo systemctl status camp-quiz --no-pager
sudo journalctl -u camp-quiz -f
redis-cli -u redis://127.0.0.1:6379 ping
redis-cli -u redis://127.0.0.1:6379 --scan --pattern 'game:*'
mysql -u campquiz -p camp_quiz -e 'SHOW TABLES;'
curl -I https://quiz.example.com/
```

## Camp rehearsal checklist

Run this from the actual venue, on the public HTTPS URL, before participants arrive:

1. Use the projector computer to create a four-choice quiz with a question image, reveal image, and a long Thai explanation.
2. Start a room; scan the QR code and join from at least five phones on the venue Wi-Fi. Confirm lobby names appear on the projector.
3. Start a question. Confirm its image renders on projector and phone, answer buttons disable after one tap, and the Host answer count grows.
4. Reveal the answer. Confirm the reveal image/explanation, then animated rank movement and final leaderboard on both layouts.
5. In browser DevTools, confirm the live transport is `wss://`, not `ws://`. Reconnect one phone and ensure it returns to the same room.
6. Keep a MySQL backup from immediately before the event and verify `systemctl status camp-quiz` plus `redis-cli ping` after the rehearsal.

If one component fails, keep players on the same HTTPS hostname: do not point phones directly to port 3000 or a private IP, because that bypasses WSS and the reverse proxy.
