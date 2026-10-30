# Run the whole demo on your own Ubuntu machine

Everything runs on one computer: database and login (Supabase in Docker), the web app, the enrichment worker and
the scheduled jobs. Your 32 GB of RAM is plenty. The GPU is not used.

> **Not tested end to end.** These steps were written from the repo's configuration without being able to run
> Docker, so expect to fix a command or two. Anything you want to rely on, try once before showing it to anyone.

## 0. What you need

| Tool | Install |
|---|---|
| Docker Engine and the compose plugin | `sudo apt install docker.io docker-compose-v2`, then `sudo usermod -aG docker $USER` and log out and in |
| Node 22 and pnpm 10 | `nvm install 22` (see `.nvmrc`), then `corepack enable` |
| uv (Python 3.13 is fetched by uv) | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| git, curl, jq | `sudo apt install git curl jq` |
| A Gemini API key | [aistudio.google.com](https://aistudio.google.com) (the free tier works for a demo) |

## 1. Get the code and install

```bash
git clone <your repo url> uniguide && cd uniguide
git checkout develop
pnpm install
cd worker && uv sync && cd ..
```

## 2. Start the database and login

```bash
pnpm db:start
```

The first run downloads Docker images (a few minutes). It prints the local URLs and keys. Show them again any time with:

```bash
pnpm exec supabase status
```

Note the **API URL** (`http://127.0.0.1:54321`) and the **publishable key** (`sb_publishable_…`).
Mailpit, which catches the emails the local login sends, is at `http://127.0.0.1:54324`.

If the demo accounts are missing, rebuild the database (this erases it):

```bash
pnpm db:reset
```

Demo accounts, all with password `password123`: `student@uniguide.local`, `admin@uniguide.local`,
`verifier@uniguide.local`, `counselor@uniguide.local`, `parent@uniguide.local`.

## 3. Configure

```bash
cp .env.example apps/web/.env.local
cp .env.example worker/.env
```

Edit **`apps/web/.env.local`**:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | the API URL (step 7 changes it if other people connect) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the publishable key from step 2 |
| `NEXT_PUBLIC_SITE_URL` | where people will open the site, for example `http://localhost:3000` |
| `AUTH_DISABLED` | `true` for a demo (gives a Guest / Student / Parent switcher), `false` for real sign-in |
| `JOURNEY_CRON_TOKEN` | any long random string (`openssl rand -hex 24`) |
| `EXTRACTOR`, `GEMINI_API_KEY` | `gemini` and your key, or `ollama` (step 13); the web app does not need these, the worker does |

Edit **`worker/.env`**: `GEMINI_API_KEY`, `EXTRACTOR=gemini`, `CRAWLER_CONTACT` (a real email address, sent to the
sites you read), `SITE_URL` (same as `NEXT_PUBLIC_SITE_URL`) and the same `JOURNEY_CRON_TOKEN`. The database lines
already point at the local database.

`AUTH_DISABLED=true` means anyone who opens the site can act as the demo student. That is fine for a demo and wrong
for anything with real people's data.

## 4. Load data

```bash
cd worker
uv run uniguide-worker seed load --publish-placeholders   # fictional demo courses, shown as unverified
uv run uniguide-worker index load                         # the 50 university index pages, all switched off
```

Placeholder courses point at `example.org`, so the worker cannot read real facts for them: a search over only those
courses ends with "Couldn't read the official page". For a convincing demo load real courses (pick one):

- **Index crawl (US and Germany):** open a few of the URLs in `data/seed/indexes/us/*.yaml`, confirm each lists the
  university's courses (fix the URL if not), add `verified_by: "Your Name"` and `verified_at: 2026-10-30` to the
  entry, run `uv run uniguide-worker index load` again, then `uv run uniguide-worker index crawl --country us --limit 3`.
- **UK (bachelor's):** download the Discover Uni zip from [hesa.ac.uk/kisdata](https://www.hesa.ac.uk/kisdata), unzip it and run `uv run uniguide-worker import uk-discover-uni --institution-file INSTITUTION.csv --course-file KISCOURSE.csv --subject-file SBJ.csv`.
- **Registers:** `uv run uniguide-worker import au-cricos` (and `nl-duo`, `us-scorecard`, `uk-discover-uni`; some need
  files or keys, see `--help` and `docs/DATA_SOURCES.md`).

## 5. Build and run the web app

`NEXT_PUBLIC_*` values are baked into the build, so **set them first, and rebuild if you change them**.

```bash
pnpm build
pnpm --filter web start        # http://localhost:3000
```

## 6. Run the worker

In a second terminal:

```bash
cd worker && uv run uniguide-worker serve
```

Leave it running. It picks up each student's search, reads the official pages and updates the progress screen.

## 7. Let other people open it

Skip this if you only demo on the same machine.

The browser itself talks to the database API (`apps/web/lib/supabase/browser.ts`), so **both** the site and
`http://…:54321` must be reachable from your viewers' browsers.

**Same Wi-Fi or LAN:** set `NEXT_PUBLIC_SITE_URL=http://<your-lan-ip>:3000` and
`NEXT_PUBLIC_SUPABASE_URL=http://<your-lan-ip>:54321`, rebuild (step 5), and let ports 3000 and 54321 through the firewall.

**Over the internet, no domain needed (Tailscale Funnel):**

```bash
sudo tailscale funnel --bg --https=443 3000
sudo tailscale funnel --bg --https=8443 54321
```

Your public addresses are `https://<machine>.<tailnet>.ts.net` for the site and the same name on port `8443` for the
database API. Put those into `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_SUPABASE_URL`, then rebuild (step 5).
(Cloudflare Tunnel also works if you own a domain: one hostname for port 3000 and one for 54321.)

**Safety:**
- Never expose the database port (`54322`) or Supabase Studio (`54323`).
- Docker publishes ports around `ufw`, so a `ufw deny` does not protect them. After setting up, scan from another
  machine (`nmap -p 3000,54321,54322,54323 <your ip>`) and block anything you did not intend, for example with a
  rule in the `DOCKER-USER` iptables chain.
- Treat the demo site as public: no real students' data.

## 8. Keep it running (systemd)

Create `/etc/systemd/system/uniguide-web.service` (replace `youruser` and the paths):

```ini
[Unit]
Description=Uniguide web
After=network-online.target docker.service

[Service]
User=youruser
WorkingDirectory=/home/youruser/uniguide
ExecStart=/usr/bin/env pnpm --filter web start
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

and `/etc/systemd/system/uniguide-worker.service`:

```ini
[Unit]
Description=Uniguide enrichment worker
After=network-online.target docker.service

[Service]
User=youruser
WorkingDirectory=/home/youruser/uniguide/worker
ExecStart=/home/youruser/.local/bin/uv run uniguide-worker serve
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now uniguide-web uniguide-worker
```

Supabase restarts with Docker; if it does not, run `pnpm db:start` at boot (a `@reboot` crontab line works).

## 9. Scheduled jobs (replaces GitHub Actions)

`crontab -e` (times are the machine's local time; adjust the paths):

```cron
# journeys: daily, recompute each student's next steps
29 2 * * * cd /home/youruser/uniguide && set -a && . apps/web/.env.local && set +a && after=""; for i in $(seq 1 500); do body=$(curl -sS -X POST -H "Authorization: Bearer $JOURNEY_CRON_TOKEN" "http://localhost:3000/api/cron/journeys${after:+?after=$after}"); after=$(echo "$body" | jq -r '.next // empty'); [ -z "$after" ] && break; done
# monitor: daily, re-check official pages students watch
17 3 * * * cd /home/youruser/uniguide/worker && /home/youruser/.local/bin/uv run uniguide-worker monitor --limit 50
# index: daily, crawl verified course-index pages
41 5 * * * cd /home/youruser/uniguide/worker && /home/youruser/.local/bin/uv run uniguide-worker index crawl --limit 30
# notify: hourly, deadline reminders (prints what it would send unless RESEND_API_KEY is set)
7 * * * * cd /home/youruser/uniguide/worker && /home/youruser/.local/bin/uv run uniguide-worker notify
```

`notify` needs `NOTIFIER_DATABASE_URL` in `worker/.env`; the local default works after `pnpm db:start`.

## 10. Check that it works

1. Open the site. With `AUTH_DISABLED=true` switch to the student in the navbar.
2. Open **Profile**, choose a level, a country and a subject, and save. The first complete save starts a search and
   opens the progress page: the stages move and each course card fills in as the worker reads its pages.
3. If it stays on "In the queue", the worker is not running (`systemctl status uniguide-worker`) or has no key
   (`journalctl -u uniguide-worker -f`).
4. As **admin@uniguide.local** (needs `AUTH_DISABLED=false`), open **Suggested** to approve courses the model suggested.

## 11. Updating

```bash
git pull
pnpm install && (cd worker && uv sync)
pnpm exec supabase migration up --local      # applies new migrations without erasing data
pnpm build
sudo systemctl restart uniguide-web uniguide-worker
```

## 12. Back up the database

```bash
docker exec supabase_db_$(basename "$PWD") pg_dump -U postgres postgres > backup-$(date +%F).sql
```

(`docker ps` shows the exact database container name if the command does not find it.)

## 13. Using your GPU instead of Gemini

Run the extraction on a local model through [Ollama](https://ollama.com). No API key, no cost, nothing leaves the machine.

```bash
ollama pull qwen2.5:14b          # or any model you have; a 14B model at 4-bit fits an 8 GB card tightly
```

In `worker/.env` set `EXTRACTOR=ollama` and `OLLAMA_MODEL=qwen2.5:14b` (add `OLLAMA_HOST` if Ollama is not on
`http://127.0.0.1:11434`), then restart the worker. The first request loads the model and can take over a minute.

Expect weaker extraction than Gemini: small models sometimes fill in fields the page does not state (for example
per-section language scores). The verbatim-quote check drops invented quotes, but not a wrong value attached to a real
quote, so keep **Suggested** review on for anything shown to real students. Pages are cut at 40,000 characters.
