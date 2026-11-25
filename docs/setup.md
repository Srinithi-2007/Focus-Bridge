# Setup

## Prerequisites
- Node.js 18 or newer
- MongoDB 6+ (local `mongod` or a MongoDB Atlas connection string)

## Backend
1. `cd backend && cp .env.example .env`
2. Set `MONGODB_URI`. For local development the default `mongodb://127.0.0.1:27017/focusbridge` works.
3. Set `JWT_SECRET` to a random value (required when `NODE_ENV=production`). Generate one with:
   `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
4. `npm install`
5. Optional demo data: `npm run seed`. All demo accounts use the password in `SEED_PASSWORD` (default `DemoPass123`). Seeding is refused in production.
6. `npm run dev` (or `npm start`). The API runs on `PORT` (default 4000).
7. Tests: `npm test` (runs without a database).

## Frontend
1. `cd frontend && cp .env.example .env.local`
2. `npm install`
3. `npm run dev` (http://localhost:3000)
4. Production check: `npm run build`, then `npm run lint`.

## Email
No email provider is configured. In development, invitation and reset links are printed to the backend console. In production the mailer logs a warning and sends nothing until a provider is added in `backend/src/services/mailer.js`. Provider credentials must come from environment variables.

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `NODE_ENV` | backend | `development` or `production` |
| `PORT` | backend | API port (default 4000) |
| `MONGODB_URI` | backend | MongoDB connection string |
| `JWT_SECRET` | backend | Session signing key (required in production) |
| `JWT_EXPIRES_IN` | backend | Session length (default `12h`) |
| `CLIENT_URL` | backend | Frontend origin for CORS and email links |
| `SEED_PASSWORD` | backend | Demo account password (development only) |
| `AI_API_KEY` | backend | Google Gemini API key (optional: fallback deterministic planner used if empty) |
| `AI_MODEL` | backend | Gemini model name (default: `gemini-2.0-flash`) |
| `JOBS_INTERVAL_MINUTES` | backend | Interval between reminder passes when running `npm run jobs:loop` (default 15) |
| `MONGODB_TEST_URI` | backend | Optional throwaway DB URI for tests (in-memory MongoMemoryServer used by default) |
| `NEXT_PUBLIC_API_URL` | frontend | API base URL, e.g. `http://localhost:4000/api` |

## Background Reminder Jobs
- Single pass (ideal for cron): `npm run jobs`
- Continuous loop: `npm run jobs:loop`
