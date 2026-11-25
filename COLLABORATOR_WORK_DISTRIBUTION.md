# FocusBridge — Collaborator Work Distribution & Git Collaboration Guide

This document defines the team organization, modular ownership boundaries, coordination protocols, and Git branching workflows for developers contributing to FocusBridge.

---

## 1. Module Ownership & Team Areas

To allow multiple engineers to build and maintain FocusBridge concurrently without merge friction or architectural conflicts, work is partitioned into six clear modules:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        MODULE 1: FRONTEND UI & UX                      │
│      Next.js 15 App Router · Tailwind CSS · React Components · Hooks    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / REST Contract
┌───────────────────────────────────▼────────────────────────────────────┐
│                    MODULE 2: BACKEND API & SERVICES                    │
│        Express 5 Controllers · Business Services · AI Planner          │
└─────────┬─────────────────────────┬──────────────────────────┬─────────┘
          │                         │                          │
┌─────────▼──────────────┐ ┌────────▼───────────────┐ ┌────────▼─────────┐
│       MODULE 3:        │ │       MODULE 4:        │ │    MODULE 5:     │
│    DATABASE MODELS     │ │ AUTH & SECURITY GUARDS │ │   QA & TESTING   │
│  Mongoose 9 · Indexes  │ │ Cookies · CSRF · Roles │ │ Unit / E2E Tests │
└────────────────────────┘ └────────────────────────┘ └──────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                  MODULE 6: DEVOPS, JOBS & INFRASTRUCTURE               │
│         Background Cron Jobs · Environment Config · CI/CD Pipelines    │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Module 1: Frontend UI & Client Experience

- **Primary Directories & Files:**
  - `frontend/src/app/` (All 29 routes across public, admin, coach, student workspaces)
  - `frontend/src/components/` (Reusable components: buttons, modals, cards, badges, botanical backgrounds)
  - `frontend/src/hooks/` (Custom client-side hooks)
  - `frontend/public/` (Static image assets, animated background frames)
- **Core Responsibilities:**
  - Build and refine accessible, responsive UI pages in Next.js 15 App Router.
  - Integrate client components with the API client (`frontend/src/lib/api.ts`).
  - Maintain the botanical design system and cinematic animation styling.
  - Implement form validations, loading skeletons, and interactive state feedback.
- **Dependencies:**
  - Depends on Module 2 for backend REST API contracts and endpoints.
  - Depends on Module 4 for cookie session management and CSRF token propagation.
- **Conflict Zones to Avoid:**
  - **Shared API Client (`frontend/src/lib/api.ts`):** Coordinate before modifying request signatures or error classes.
  - **Global Styles (`frontend/src/app/globals.css`):** Keep utility classes modular; avoid overriding foundational Tailwind tokens.

---

### Module 2: Backend API, Controllers & Services

- **Primary Directories & Files:**
  - `backend/src/controllers/` (`authController.js`, `adminController.js`, `coachController.js`, `studentController.js`)
  - `backend/src/routes/` (`auth.js`, `admin.js`, `coach.js`, `student.js`)
  - `backend/src/services/` (`aiService.js`, `localPlanner.js`, `reminderService.js`, `mailer.js`, `auditService.js`)
  - `backend/src/app.js` (Route mounting, middleware pipeline)
- **Core Responsibilities:**
  - Implement RESTful endpoints and business logic.
  - Enforce role-based access control and caseload boundaries.
  - Maintain the dual-mode AI / deterministic study planner service.
  - Sanitize CSV exports against formula injection attacks.
- **Dependencies:**
  - Depends on Module 3 for database models and schema definitions.
  - Depends on Module 4 for authentication middleware and session context (`req.user`).
- **Conflict Zones to Avoid:**
  - **Route Mounting (`backend/src/app.js`):** Add new routers in designated section without altering CORS or security order.
  - **API Contract Modifications:** Any change to JSON response shape must be communicated to Module 1 before committing.

---

### Module 3: Database Models & Schemas

- **Primary Directories & Files:**
  - `backend/src/models/` (All 17 Mongoose models: `User`, `Organization`, `Task`, `Plan`, `Submission`, `Review`, `Group`, `Activity`, etc.)
  - `backend/scripts/seed.js` (Database seeding routines)
- **Core Responsibilities:**
  - Define Mongoose schemas with strict data types, defaults, and validations.
  - Ensure every tenant model contains `organizationId` with indexed foreign keys.
  - Maintain unique compound indexes (e.g. `dedupeKey` for reminders).
  - Update `seed.js` when new schema fields or relationships are introduced.
- **Dependencies:**
  - Independent foundation; consumed by Modules 2, 4, 5, and 6.
- **Conflict Zones to Avoid:**
  - **Schema Breaking Changes:** Never rename or remove existing model fields without providing migration fallbacks or backward-compatible defaults.
  - **Index Declarations:** Coordinate with Module 6 to prevent slow queries or indexing locks in production.

---

### Module 4: Authentication, Authorization & Security

- **Primary Directories & Files:**
  - `backend/src/middleware/auth.js` (JWT session verification, database user lookup)
  - `backend/src/middleware/rbac.js` (Role verification and caseload boundary checking)
  - `backend/src/middleware/csrf.js` (Double-submit CSRF cookie validation)
  - `backend/src/utils/tokens.js`, `backend/src/utils/password.js`
  - `frontend/src/lib/api.ts` (Client cookie and CSRF token transmission)
- **Core Responsibilities:**
  - Guard authentication endpoints against timing attacks using constant-time dummy hashing.
  - Enforce `httpOnly`, `SameSite=Lax` cookie security policies.
  - Validate that coaches can only access allocated students (`coachId === coach._id`).
  - Maintain CSRF protection across all state-mutating requests.
- **Dependencies:**
  - Consumed by Module 1 (frontend client) and Module 2 (backend controllers).
- **Conflict Zones to Avoid:**
  - **Cookie Settings (`auth.js`, `app.js`):** Do not modify cookie names (`fb_session`, `fb_csrf`) or domain flags without full-team alignment.
  - **Session Shape:** Changes to `req.user` or the JWT payload affect all controllers across the application.

---

### Module 5: Testing & QA Engineering

- **Primary Directories & Files:**
  - `backend/test/` (Integration and unit test suites)
  - Test helper utilities and mock data generators
  - End-to-end testing scripts and verification suites
- **Core Responsibilities:**
  - Write and maintain regression tests for all API endpoints.
  - Verify multi-tenant isolation, authorization limits, and edge cases.
  - Maintain zero test skips and zero test failures across the 81-test suite.
  - Ensure tests run cleanly against in-memory `mongodb-memory-server` without external dependencies.
- **Dependencies:**
  - Tests observe and validate code produced by Modules 1, 2, 3, and 4.
- **Conflict Zones to Avoid:**
  - **Test Suite Fixtures:** Do not hardcode database IDs; use dynamic schema generation to avoid collisions.

---

### Module 6: DevOps, Jobs & Infrastructure

- **Primary Directories & Files:**
  - `backend/scripts/run-jobs.js`
  - `backend/src/jobs/` (Scheduled reminder loops, task notification runner)
  - `backend/src/config/env.js`, `backend/src/config/db.js`
  - `.gitignore`, `.env.example` templates, Dockerfiles, CI workflows
- **Core Responsibilities:**
  - Maintain background scheduled job runner (`npm run jobs`, `npm run jobs:loop`).
  - Guarantee job idempotency using unique deduplication keys.
  - Manage database connection pooling and failover.
  - Maintain `.env.example` templates and keep production build pipelines healthy.
- **Dependencies:**
  - Intersects with Module 2 (services) and Module 3 (notification models).

---

## 2. Shared Files & Coordination Protocol

Certain files are centrally shared across multiple modules. Modifications to these files require advance coordination:

| Shared File | Impact Area | Rule Before Modifying |
| :--- | :--- | :--- |
| `backend/src/models/*` | Database Schema | Notify Backend and QA leads; ensure `seed.js` and tests are updated. |
| `frontend/src/lib/api.ts` | API Client | Coordinate with Frontend and Auth leads; preserve CSRF and error handling. |
| `backend/src/config/env.js` | Environment | Update `backend/.env.example` and notify all team members of new variables. |
| `backend/package.json` | Dependencies | Avoid adding unneeded heavy dependencies; run `npm test` before submitting PR. |
| `frontend/package.json` | Dependencies | Ensure Next.js and React versions remain compatible with React 19. |
| `backend/src/app.js` | Server Middleware | Do not disrupt CORS, body parsing, or error handler placement. |

### Breaking Change Protocol
If a proposed change introduces a breaking change (e.g. changing an API parameter, altering a database schema, or renaming an environment variable):
1. Post a notification in the team channel detailing the change.
2. Provide a transition period or backwards-compatible fallback whenever feasible.
3. Update all affected `.env.example` files and documentation simultaneously.

---

## 3. Git Branch Workflow & Strategy

To maintain a pristine `main` branch, all collaborators follow this structured Git workflow:

```
  main      ────────────────────────────● (Release / Deployment)
                                       ▲
                                       │ Pull Request (Squash & Merge)
  develop   ───────●─────────●─────────● (Integration)
                    \       /
  feature/*          ●─────● (Individual Feature Branch)
```

### Branch Naming Conventions
Always use lowercase hyphen-separated branch names prefixed with the purpose:
- `feature/<module>-<description>` (e.g. `feature/coach-task-export`, `feature/student-dark-mode`)
- `bugfix/<issue>-<description>` (e.g. `bugfix/csrf-cookie-expiry`, `bugfix/calendar-timezone`)
- `chore/<description>` (e.g. `chore/upgrade-zod`, `chore/clean-logs`)
- `docs/<description>` (e.g. `docs/api-routes-update`, `docs/setup-guide`)
- `test/<description>` (e.g. `test/reminder-jobs-coverage`)

---

### Step-by-Step Feature Development Lifecycle

#### Step 1: Synchronize with Latest `main`
```bash
git checkout main
git pull origin main
```

#### Step 2: Create a Dedicated Feature Branch
```bash
git checkout -b feature/student-focus-timer
```

#### Step 3: Implement Changes & Commit Logically
Follow the **Conventional Commits** specification:
```
<type>(<scope>): <short imperative summary>

[optional body explaining context or rationale]
```
Common types:
- `feat`: A new feature for users
- `fix`: A bug fix
- `docs`: Documentation updates only
- `style`: Code style changes (formatting, missing semi-colons)
- `refactor`: Code refactoring without behavioral change
- `test`: Adding or correcting tests
- `chore`: Maintenance tasks, dependency updates

*Example:*
```bash
git commit -m "feat(student): add 25-minute Pomodoro timer to focus planner"
```

#### Step 4: Run Local Verification Before Pushing
Never push code that breaks tests or fails compilation:
```bash
# In backend/:
cd backend
npm test

# In frontend/:
cd ../frontend
npm run typecheck
npm run lint
npm run build
```

#### Step 5: Push Branch to GitHub
```bash
git push -u origin feature/student-focus-timer
```

#### Step 6: Open a Pull Request & Request Review
- Open a PR targeting `main` (or `develop`).
- Fill in the PR description template:
  - What does this PR change?
  - Which module(s) does it affect?
  - Have all tests passed locally?
  - Are any new environment variables required?
- Request review from the module owner.
- Once approved and CI checks pass, merge using **Squash and Merge**.

---

## 4. Secret Protection Checklist for Every PR

Before opening or merging any Pull Request, verify:
- [ ] No `.env`, `.env.local`, or secret config files are committed.
- [ ] No hardcoded passwords, tokens, API keys, or connection strings are in the code.
- [ ] If new environment variables were introduced, safe placeholders were added to `.env.example`.
- [ ] Git status confirms zero untracked or accidentally staged credentials.
