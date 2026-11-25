# FocusBridge

FocusBridge is a multi-role, multi-tenant coaching and executive-function development platform designed for educational institutions, tutoring centers, and coaching organizations.

The platform coordinates four core roles with strict tenancy and data boundaries:
- **Administrators:** Manage coaches, students, cohort groups, curricula/programs, cross-organization analytics, and institutional settings.
- **Coaches:** Assign and track structured tasks, facilitate cohort classrooms, schedule group accountability sessions, write human-authored progress reviews, and communicate directly with students.
- **Students:** Organize assignments with an AI-assisted focus breakdown planner, commit approved time blocks to a weekly calendar, participate in group classrooms, track academic goals, and receive direct coach feedback.
- **Public Visitors / Prospective Members:** Explore platform features via the cinematic landing page, learn about the coaching methodology, register an organization, or accept coach/student invitation links.

---

## Architecture Overview

```
                      ┌────────────────────────────────────────┐
                      │          Next.js 15 Frontend           │
                      │   (App Router, TypeScript, Tailwind)    │
                      │               Port: 3000               │
                      └──────────────────┬─────────────────────┘
                                         │
                         HTTP + JSON API │ Credentials (httpOnly)
                         (CORS Enabled)  │ CSRF Header (X-CSRF-Token)
                                         ▼
                      ┌────────────────────────────────────────┐
                      │          Express 5 REST API            │
                      │      (Node.js 18+, Zod Validation)     │
                      │               Port: 4000               │
                      └──────────────┬──────────────────┬──────┘
                                     │                  │
                Mongoose 9 Models    │                  │ External Fallback
                (Multi-Tenant Org ID)│                  │ (Deterministic)
                                     ▼                  ▼
                    ┌────────────────────────┐  ┌──────────────────┐
                    │    MongoDB Database    │  │  Google Gemini   │
                    │ (Local, Atlas, or Mem) │  │   AI Services    │
                    └────────────────────────┘  └──────────────────┘
```

### Full-Stack Architecture Principles
1. **Frontend (Decoupled Client):** Next.js 15 App Router running on `http://localhost:3000`. Communicates with the backend exclusively via RESTful JSON endpoints.
2. **Backend (Stateless REST API):** Express 5 running on `http://localhost:4000`. Enforces multi-tenant data isolation (`organizationId`) across all queries and operations.
3. **Authentication & Session Management:** Authenticated via `httpOnly`, `SameSite=Lax` session cookies (`fb_session`) signed with HS256 JWTs. Client code never accesses raw tokens, preventing XSS-based credential theft.
4. **CSRF Protection:** State-changing API endpoints (`POST`, `PUT`, `PATCH`, `DELETE`) require a double-submit cookie token forwarded in the `X-CSRF-Token` HTTP header.
5. **AI Guardrails with Deterministic Fallback:** AI services provide schedule breakdown assistance only; they are strictly forbidden from generating or altering coach evaluations. If `AI_API_KEY` is omitted, the application seamlessly falls back to a deterministic local rule-based planner without failure.
6. **In-Memory MongoDB Development Fallback:** If a local MongoDB daemon is not detected during development, the backend automatically boots an isolated in-memory `mongodb-memory-server` so developers can onboard instantly without manual database installation.

---

## Project Structure

```
focusbridge/
├── backend/                              # Express 5 REST API
│   ├── scripts/
│   │   ├── seed.js                       # Comprehensive demo database seeder
│   │   └── run-jobs.js                   # Scheduled background reminder runner
│   ├── src/
│   │   ├── app.js                        # Express app initialization, CORS, CSRF, routers
│   │   ├── server.js                     # Server entrypoint with dual-stack host binding
│   │   ├── config/
│   │   │   ├── db.js                     # MongoDB connection with in-memory fallback
│   │   │   └── env.js                    # Validated environment configuration
│   │   ├── controllers/                  # Workspace controllers (auth, admin, coach, student)
│   │   ├── middleware/                   # Auth guards, role checks, CSRF, validation, errors
│   │   ├── models/                       # 17 Mongoose models with multi-tenant org isolation
│   │   ├── routes/                       # Express routers (/api/auth, /api/admin, /api/coach, /api/me)
│   │   ├── services/                     # Business logic: AI planner, local scheduler, reminders, mailer
│   │   └── utils/                        # Password hashing, tokens, sanitizers, error helpers
│   ├── test/                             # Automated test suite (81 integration/unit tests)
│   ├── .env.example                      # Backend environment variable template
│   └── package.json
│
├── frontend/                             # Next.js 15 Client Application
│   ├── public/                           # Static assets, botanical backgrounds, sequential frames
│   ├── src/
│   │   ├── app/                          # App Router pages (29 routes: public, admin, coach, student)
│   │   ├── components/                   # Reusable UI components, layout shell, navigation
│   │   ├── hooks/                        # React hooks for session, CSRF, and data fetching
│   │   └── lib/                          # API client with automatic host normalization and CSRF handling
│   ├── .env.example                      # Frontend environment variable template
│   └── package.json
│
├── docs/                                 # Architectural specifications and routes catalog
├── .env.example                          # Root environment variable reference
├── .gitignore                            # Root version control exclusion rules
├── COLLABORATOR_WORK_DISTRIBUTION.md     # Module ownership and team coordination guide
└── README.md                             # Project documentation and onboarding guide
```

---

## Route Catalog (29 Integrated Routes)

The application provides 29 production routes across four designated workspaces:

| Workspace | Route Path | Description |
| :--- | :--- | :--- |
| **Public** | `/` | Cinematic landing page with sequential animation and marketing overview |
| **Public** | `/about` | Platform mission, coaching methodology, and executive function pillars |
| **Public** | `/register` | Organization onboarding and invite redemption |
| **Public** | `/login` | Secure role-aware authentication with timing-attack mitigation |
| **Admin** | `/admin/dashboard` | Key organizational metrics, coach approvals, and activity summary |
| **Admin** | `/admin/students` | Student directory, coach assignments, and account management |
| **Admin** | `/admin/coaches` | Coach roster, caseload capacity, and credential verification |
| **Admin** | `/admin/allocations` | Coach-to-student allocation matrix and balance management |
| **Admin** | `/admin/groups` | Cohort group definitions, track alignment, and student rosters |
| **Admin** | `/admin/programs` | Coaching curriculum structures and programmatic tracks |
| **Admin** | `/admin/reports` | Organizational progress reports and sanitized CSV data exports |
| **Admin** | `/admin/settings` | Multi-tenant organization profile and invitation security rules |
| **Coach** | `/coach/dashboard` | Coach metrics, assigned student roster, and upcoming sessions |
| **Coach** | `/coach/students` | Student caseload overview with search and filter capabilities |
| **Coach** | `/coach/students/[id]` | Comprehensive student profile, notes, progress, and direct messaging |
| **Coach** | `/coach/groups` | Cohort classroom with announcements, discussions, and resources |
| **Coach** | `/coach/tasks` | Task creation, publishing, original instruction preservation, and grading |
| **Coach** | `/coach/reviews` | Human-authored student progress reviews with submission locks |
| **Coach** | `/coach/activities` | Group accountability sessions and workshop scheduling |
| **Coach** | `/coach/reports` | Caseload metrics, submission rates, and attendance exports |
| **Student** | `/student/dashboard` | Daily focus agenda, urgent deadlines, and unread notifications |
| **Student** | `/student/tasks` | Task breakdown planner, subtask checklists, and submissions |
| **Student** | `/student/calendar` | Weekly visual schedule displaying approved focus blocks |
| **Student** | `/student/assistant` | AI-assisted study strategy assistant with local fallback |
| **Student** | `/student/coach` | Direct line messaging with assigned coach and feedback reviews |
| **Student** | `/student/groups` | Enrolled cohort classrooms, shared resources, and activities |
| **Student** | `/student/progress` | Focus metrics, on-time submission rate, and coach milestones |
| **Student** | `/student/notifications` | Real-time notification feed (tasks, feedback, deadlines, updates) |
| **Student** | `/student/settings` | Study availability windows (UTC) and accessibility preferences |

---

## Prerequisites

Before setting up FocusBridge locally, ensure your machine satisfies:
- **Node.js:** v18.18.0 or higher (v20+ or v22+ LTS recommended)
- **npm:** v9.0.0 or higher
- **Git:** v2.30.0 or higher
- **MongoDB:** *(Optional for local dev)* Local MongoDB Community Server or MongoDB Atlas cluster. If omitted, the backend automatically spins up an in-memory MongoDB instance for local testing.

---

## Quick Start / Installation Guide

### 1. Clone Repository & Setup Structure

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL> focusbridge
cd focusbridge
```

### 2. Configure Backend

```bash
cd backend

# Create local environment file from safe template
cp .env.example .env

# Install backend dependencies
npm install

# Seed the database with realistic demo accounts & data
npm run seed

# Start the Express API development server
npm run dev
```
The backend API will be listening on `http://localhost:4000`.

### 3. Configure Frontend (in a new terminal)

```bash
cd frontend

# Create local frontend environment file
cp .env.example .env.local

# Install frontend dependencies
npm install

# Start the Next.js development server
npm run dev
```
The frontend application will be accessible at `http://localhost:3000`.

---

## Demo Credentials (Seeded Accounts)

When you run `npm run seed` in the backend, the following accounts are created with default password `DemoPass123`:

| Role | Email Address | Access Level |
| :--- | :--- | :--- |
| **Administrator** | `admin@demo.focusbridge.test` | Organization-wide administration & settings |
| **Lead Coach** | `coach.lee@demo.focusbridge.test` | Caseload with Alex Rivera & Maya Chen |
| **Associate Coach** | `coach.okafor@demo.focusbridge.test` | Caseload with Leo Santos & Zara Ahmed |
| **Student** | `alex.rivera@demo.focusbridge.test` | Enrolled in Executive Function & Cohort Alpha |
| **Student** | `maya.chen@demo.focusbridge.test` | Enrolled in Executive Function & Cohort Alpha |
| **Student** | `leo.santos@demo.focusbridge.test` | Enrolled in Academic Writing & Focus Lab Beta |
| **Student** | `zara.ahmed@demo.focusbridge.test` | Enrolled in Academic Writing & Focus Lab Beta |

---

## Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | No | `development` | Environment mode (`development`, `production`, `test`) |
| `PORT` | No | `4000` | HTTP port on which Express server listens |
| `MONGODB_URI` | In Prod | `mongodb://127.0.0.1:27017/focusbridge` | MongoDB connection URI (falls back to in-memory in dev) |
| `JWT_SECRET` | In Prod | `dev-only-insecure-secret-change-me` | Key for signing HS256 auth session cookies |
| `JWT_EXPIRES_IN`| No | `12h` | Session duration string (`12h`, `1d`, `7d`) |
| `CLIENT_URL` | No | `http://localhost:3000` | Frontend origin for CORS origin authorization |
| `SEED_PASSWORD` | No | `DemoPass123` | Password used during `npm run seed` |
| `AI_API_KEY` | No | *(empty)* | Google Gemini API key for AI task planner |
| `AI_MODEL` | No | `gemini-2.0-flash` | Gemini model name |
| `JOBS_INTERVAL_MINUTES` | No | `15` | Polling interval for background reminder scheduler |
| `MONGODB_TEST_URI` | No | *(empty)* | Optional URI for tests; defaults to isolated MongoMemoryServer |

### Frontend (`frontend/.env.local`)

| Variable | Required | Default | Description |
| :--- | :---: | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | No | `http://localhost:4000/api` | Base URL for backend API requests |

---

## Development & Testing Workflow

### Running Both Servers Concurrently
Open two separate terminal tabs:
```bash
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev
```

### Automated Backend Tests
The backend test suite includes 81 unit and integration tests covering authentication, multi-tenant isolation, CSRF validation, authorization rules, and scheduled jobs.
```bash
cd backend
npm test
```
*Expected result: 81 tests passing (0 failed, 0 skipped).*

### Frontend Quality & Type Checks
```bash
cd frontend

# TypeScript compilation check
npm run typecheck

# ESLint validation
npm run lint

# Production Next.js build verification
npm run build
```

---

## Security Guidelines for Collaborators

1. **NEVER COMMIT SECRETS:**
   - Never push `.env`, `.env.local`, or any files containing private keys, passwords, or live database connection strings.
   - All real environment files are ignored by `.gitignore`.
2. **MAINTAIN TENANT ISOLATION:**
   - Every database query for tenant data must explicitly include `organizationId: req.user.organizationId`.
   - Never accept `organizationId` from client request bodies for authenticated operations.
3. **PRESERVE HTTPONLY COOKIE SESSIONS:**
   - Do not refactor authentication to store JWTs in `localStorage` or `sessionStorage`. Keep sessions inside `httpOnly` cookies with double-submit CSRF verification.
4. **HUMAN-AUTHORED REVIEWS:**
   - Coach progress reviews must always remain authored by humans. Do not connect automated generative models to coach review endpoints.

---

## Collaborator & Branch Workflow

For detailed module ownership, conflict avoidance protocols, and Git branch conventions, see:
- [COLLABORATOR_WORK_DISTRIBUTION.md](COLLABORATOR_WORK_DISTRIBUTION.md)
- [docs/routes.md](docs/routes.md)
