# Instagram Carousel Automation — Deployment Guide

## Files created
```
instagram-automation/
├── src/index.js          ← Main app (cron + all API calls)
├── package.json
├── Dockerfile
├── docker-compose.yml    ← For local/VPS Docker
├── railway.toml          ← For Railway cloud
├── .env.example
└── .gitignore
```

---

## Option A — Railway (recommended, free tier available)

Railway runs your Docker container 24/7. Free tier = 500 hours/month (enough for always-on).

### Step 1 — Push code to GitHub

```bash
cd C:\Users\omarb\Documents\instagram-automation
git init
git add .
git commit -m "Instagram carousel automation"
# Create a NEW repo on github.com then:
git remote add origin https://github.com/YOUR_USERNAME/instagram-automation.git
git push -u origin main
```

### Step 2 — Deploy on Railway

1. Go to https://railway.app → New Project → Deploy from GitHub repo
2. Select `instagram-automation`
3. Railway auto-detects the Dockerfile ✓

### Step 3 — Set environment variables in Railway

In your Railway project → Variables tab, add:

| Key | Value |
|-----|-------|
| `ANTHROPIC_API_KEY` | `sk-ant-...` |
| `UNSPLASH_ACCESS_KEY` | Your Unsplash Client-ID |
| `INSTAGRAM_ACCOUNT_ID` | Numeric account ID |
| `INSTAGRAM_ACCESS_TOKEN` | Your long-lived token |

### Step 4 — Deploy

Click Deploy. Railway builds the Docker image and starts the container.
Your service URL will appear (e.g. `https://instagram-automation-xxxx.railway.app`).

**Health check:** GET `https://your-url.railway.app/` → `{"status":"ok","next":"daily 08:00 Europe/London"}`

---

## Option B — Any VPS (DigitalOcean, Hetzner, etc.)

### Prerequisites
- VPS with Docker + Docker Compose installed
- Ubuntu 22.04 recommended

### Deploy

```bash
# On your VPS:
git clone https://github.com/YOUR_USERNAME/instagram-automation.git
cd instagram-automation

# Create .env
cp .env.example .env
nano .env   # fill in your values

# Build and start
docker compose up -d --build

# Check it's running
docker compose ps
docker compose logs -f
```

### Verify cron is scheduled
```bash
docker compose logs instagram-carousel | grep "08:00"
```

---

## Option C — Local Docker (temporary, requires PC to be on)

```bash
cd C:\Users\omarb\Documents\instagram-automation

# Create .env first
copy .env.example .env
# Edit .env with your values

docker compose up -d --build
docker compose logs -f
```

---

## Test the workflow manually

### Via environment variable (triggers immediately on start):
```bash
# Edit docker-compose.yml — uncomment: - RUN_NOW=true
docker compose up --build
```

### Via Railway — add a temporary variable:
- In Railway Variables: add `RUN_NOW=true`
- Redeploy → watch logs for success/failure
- Remove `RUN_NOW` after testing

---

## Monitoring

```bash
# View live logs
docker compose logs -f

# Check last 50 lines
docker compose logs --tail=50 instagram-carousel

# Restart if needed
docker compose restart
```

Success log pattern:
```
✓ Carousel posted at 2026-04-15T08:00:12.000Z. Topic: Progressive overload. 5 images, 142 chars, 18 tags. Post ID: 17841234567890
```

Failure log pattern:
```
✗ CAROUSEL FAILED — HTTP 400: {"error":{"message":"..."}}
```

---

## Instagram token refresh (every 60 days)

Your `INSTAGRAM_ACCESS_TOKEN` expires after 60 days. Refresh it:

```
GET https://graph.facebook.com/v17.0/oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id={APP_ID}
  &client_secret={APP_SECRET}
  &fb_exchange_token={CURRENT_TOKEN}
```

Then update the env var in Railway (or .env on VPS) and redeploy.

---

## Architecture

```
Railway Container (24/7)
    │
    ├── node-cron: fires at 08:00 Europe/London daily
    │
    ├── Claude Haiku API → generates 5-slide content
    ├── Unsplash API     → fetches 5 fitness images
    ├── Instagram Graph API
    │     ├── POST /media (×5) → carousel item containers
    │     ├── POST /media      → carousel container
    │     └── POST /media_publish → live post
    │
    └── HTTP :3000 → health check endpoint
```

All HTTP calls retry 3× with backoff. Fallback images used if Unsplash fails.
Post is aborted if < 2 images upload or caption is empty.
