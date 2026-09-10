# Instagram Carousel Automation

An always-on bot that **generates and posts a daily Instagram carousel** for a personal-training brand — captions written by AI, images sourced automatically, published straight to Instagram. Runs 24/7 in Docker on Railway.

## How it works

Each day the bot writes carousel copy with **Claude Haiku**, pulls matching visuals from **Unsplash**, assembles the post, and publishes it through the **Instagram Graph API** — no human in the loop.

## Highlights

| Area | Detail |
| --- | --- |
| AI | Claude Haiku generates the carousel captions and slides |
| Media | Unsplash API for on-brand imagery |
| Publishing | Instagram Graph API (Meta) |
| Deploy | Dockerised, runs 24/7 on Railway |
| Config | Keys via environment variables (see `.env.example`); deploy notes in `DEPLOY.md` |

## Stack

`Node.js` · `Claude API` · `Instagram Graph API` · `Unsplash` · `Docker` · `Railway`

## Run it

Copy `.env.example` to `.env`, add your keys, then run with Docker (`docker compose up`) or deploy to Railway using `railway.toml`. No secrets are committed.

---

*Built by [Omar Bedoh](https://github.com/OmarBedoh) — a salesperson who builds AI. Open to SDR/BDR roles at AI and cybersecurity companies.*
