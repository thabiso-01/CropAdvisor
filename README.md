# Crop Advisor AI — AI Farming Assistant (website + system)

A farmer photographs a plant or uploads a photo. **Gemini Flash** analyses its **health**, **problems** (diseases, pests, nutrient and water issues), **growth stage**, **harvest readiness** and **market quality**, then gives treatment steps, a watering plan and a fertilizer plan. An AI assistant answers farming questions using the plant's analysis, attached photos and a built-in agricultural knowledge base.

![Website](docs/screenshots/website-analysis.png)

## What's inside

```
CropAdvisor/
├── docker-compose.yml   # website + API + PostgreSQL
├── .env.example
├── web/                 # the website (React + Vite) — responsive: sidebar on desktop, app-style bottom nav on phones
├── backend/             # FastAPI API: analysis, chat, fertilizer, history, analytics, guides
│   └── app/knowledge/   # crop profiles + guides the AI is grounded in
└── mobile/              # optional Expo (React Native) phone app using the same API
```

| Page | What it does |
|---|---|
| **Scan Plant** | Take or drop a photo, pick the crop, describe what you see → AI analysis |
| **Analysis** | Health score, problems with confidence, Overview · Treatment · Fertilizer · Harvest · Details, print/save as PDF |
| **AI Assistant** | Chat about any scan (or general questions), attach photos, Tools · Guides · Scan, answers cite the guides used |
| **Fertilizer Advisor** | Product, NPK ratio, how/when to apply, full season schedule by growth stage |
| **History / Favorites** | Search and filter every scan, star the ones to watch |
| **Analytics** | Scans, average health, healthy plants, ready to harvest, trend, problems by frequency |
| **Crop Guides** | The knowledge base the AI uses |

**Screen text** is translated into English, Afrikaans, isiZulu, isiXhosa, Sepedi, Setswana and Sesotho (`web/src/i18n/locales/`); other languages fall back to English. The translations are a first draft and need checking by native speakers. Edit the website's files, then run `python scripts/sync_translations.py` to copy them to the mobile app (CI checks they match).

Language picker: South Africa's 11 official spoken languages — English, Afrikaans, isiZulu, isiXhosa, isiNdebele, Sepedi, Sesotho, Setswana, siSwati, Tshivenḓa and Xitsonga. The AI writes its analyses and chat replies in the chosen language.

## The AI (Gemini Flash by default)

The default provider is Google's hosted **Gemini Flash** (`gemini-flash-latest`) for faster chat and photo analysis than CPU-only local models. You need a Gemini API key. Requests, including plant photos, are sent to Google's Gemini API; Google's quotas and pricing apply.

| Job | Model | Size | Notes |
|---|---|---|---|
| AI Assistant (chat) | `gemini-flash-latest` | Hosted | Requires `GEMINI_API_KEY` |
| Photo analysis | `gemini-flash-latest` | Hosted | Photos are sent to Google's API |

- **Keep the API key private:** put a newly created key in `.env` as `GEMINI_API_KEY=...`; never put it in source code or commit it.
- **Other option:** set `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` to use Anthropic Claude instead.
- **No key configured:** the app explains that setup is needed and falls back to its built-in farming knowledge base.
- **Busy model:** if `gemini-flash-latest` is overloaded (503/429) or doesn't answer within `GEMINI_FIRST_TIMEOUT` (25 s), the API retries and then uses `GEMINI_FALLBACK_MODELS` (`gemini-flash-lite-latest`). Saved results record the model that actually answered.
- **Plant check first:** every photo is checked by a fast model (`GEMINI_CHECK_MODEL`) before analysis. Photos without a plant are rejected and nothing is saved. Without the AI, a leaf-colour check does the same job.
- **Expert check:** analyses with a severe problem, an uncertain diagnosis or crop, or an offline estimate show a "Confirm with an expert before you spray or buy anything" note listing the reasons.
- **Request limits:** each device and each IP address can run `ANALYZE_PER_HOUR` (30) analyses and `CHAT_PER_HOUR` (120) chat messages per hour, which protects your Gemini quota. Set either to `0` to turn it off.

## Run it — Docker (recommended)

```bash
cp .env.example .env
# Add GEMINI_API_KEY to .env before starting the app.
docker compose up -d --build
```

Open **http://localhost:8080**. API docs are at http://localhost:8080/docs.

Only the website port (8080) is published. nginx forwards `/api` and `/uploads` to the API, so the phone app also connects to port 8080. The API and database ports stay inside Docker.

Database changes are applied automatically on startup with Alembic (`backend/app/migrations/`). After changing a model in `backend/app/db.py`, create a migration from `backend/` with `python -m alembic revision --autogenerate -m "what changed"`.

**Backups:** run `python scripts/backup.py` (or the VS Code task **Back up database and photos**) while Docker is running. It saves the database and every plant photo to `backups/<date-time>/`, which git ignores. The script's header explains how to restore.

## Run it in VS Code without Docker

1. Install Python 3.12+ and Node 20+, put your `GEMINI_API_KEY` in `.env`, then open the folder in VS Code.
2. `Ctrl+Shift+P` → **Tasks: Run Task** shows every task below.
3. Run the task **Backend: install Python deps**, then press **F5**. The API starts on port 8000 with SQLite.
4. Run the tasks **Website: npm install** and **Website: start dev server**, then open http://localhost:5173.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Server and AI model status |
| POST | `/api/ai/recheck` | Look for the models again |
| POST | `/api/auth/register` | `{ name, identifier, password }` → `{ token, user }` (identifier = phone number or email) |
| POST | `/api/auth/login` | `{ identifier, password }` → `{ token, user }` |
| POST | `/api/auth/logout` | Ends this device's session |
| GET | `/api/auth/me` | The signed-in farmer |
| POST | `/api/analyze` | multipart `image` + optional `crop`, `notes`, `lang` → analysis |
| GET | `/api/analyses[?favorite=true]` | History / favourites |
| GET / DELETE | `/api/analyses/{id}` | One analysis |
| PATCH | `/api/analyses/{id}/favorite` | `{ "favorite": true }` |
| POST | `/api/chat` | `{ messages, analysis_id?, image_base64?, lang }` |
| POST | `/api/fertilizer` | `{ crop?, stage?, analysis_id? }` |
| GET | `/api/guides`, `/api/guides/{id}`, `/api/crops`, `/api/stats` | Knowledge base and analytics |

**Accounts.** Farmers sign up and sign in with a phone number (e.g. `082 123 4567`, stored as `+27821234567`) or an email address, plus a password of at least 8 characters. Scans, chat, favourites and analytics need a signed-in account and are private to it; the crop guides and `/health` stay public. Send the token from sign-in as `Authorization: Bearer <token>`.

- Passwords are hashed with scrypt; the database stores only a SHA-256 hash of each session token. Sessions last 30 days and renew while in use.
- Sign-in attempts are limited to 10 per 15 minutes per address and per account, and new accounts to 10 per hour per address.
- Scans made on a device before signing in move into the account the first time someone signs in on that device (the apps send their `X-Device-Id`).
- There's no "forgot password" yet: that needs an SMS or email service. Use HTTPS before putting the site on the public internet.

## Tests

```bash
cd backend && python -m pytest -q    # Gemini request/response tests use mock servers
cd web && npm test && npm run build && npm run lint
cd mobile && npm run typecheck
```

GitHub Actions (`.github/workflows/ci.yml`) runs all of these, plus a Docker build, on every push and pull request.

The farming guidance in `backend/app/knowledge/` is general agronomy. Have a local agronomist or extension officer review it for your crops, climate and registered products before farmers rely on it.
