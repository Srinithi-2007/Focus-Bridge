# Architecture

## Request flow
Route → `authenticate` (verifies JWT from `httpOnly` `fb_session` cookie or `Authorization: Bearer` header; validates `X-CSRF-Token` against `fb_csrf` cookie on mutating cookie requests; loads active user from MongoDB) → `requireRole(...)` → `validate(schema)` (Express 5-safe Zod middleware) → controller → Mongoose model → central `errorHandler` (`AppError`, `ValidationError`, `CastError` -> 400, duplicate key -> 409).

## Authorization & Tenant Isolation
- **Organization isolation:** Every query filters by `req.organizationId` taken from the database-verified user record, never from client input.
- **Role enforcement:** Enforced server-side on every route (`admin`, `coach`, `student`). Frontend navigation shells (`WorkspaceShell`) only shape UI state and redirect on 401.
- **Coach scoping (`services/coachAccess.js`):** Coaches can reach only students where `student.coachId === coach._id` and groups where `group.coachId === coach._id` within the same organization. Unauthorized lookups return HTTP 404 to prevent ID probing.
- **Account lifecycle:** `invited` → (accept invitation) → `active` (student) or `pending_approval` (coach) → `active` after admin approval. Admins may toggle `active` / `deactivated`.

## Data model

### Phase 1 & Phase 2 Models
- **Organization**: `name`, `slug`, `contactEmail`, `description`, `settings` (`timezone`, `programLabel`, `invitations.expiryDays` 1–30, `notifications`).
- **User**: `organizationId`, `email` (unique), `firstName`, `lastName`, `role` (`admin` | `coach` | `student`), `status`, `coachId`, `programId`, `passwordHash` (bcrypt cost 12), `passwordResetTokenHash`.
- **Invitation**: `organizationId`, `email`, `role`, `tokenHash` (SHA-256), `expiresAt`, `acceptedAt`, `revokedAt`. One open invitation per email per org.
- **Program**: `organizationId`, `name` (unique per org), `description`, `coachingAreas` (max 12). Deletion blocked (409) while in use.
- **Group**: `organizationId`, `name` (unique per org), `description`, `coachId`, `programId`, `memberIds` (max 200).
- **AuditLog**: `organizationId`, `actorId`, `action`, `targetType`, `targetId`, `summary`.

### Phase 3 Models (Coach Workspace)
- **Task**: `organizationId`, `coachId`, `title`, `instructions`, `priority`, `deadline`, `audience` (`student` | `group`), `studentId`, `groupId`, `attachments` (`http`/`https` links only), `status` (`draft` | `published` | `archived`), `publishedAt`, `originalInstructions`, `originalDeadline`, `revisionCount`, `lastEditedAt`.
- **Submission**: `organizationId`, `taskId`, `studentId` (unique per task+student), `body`, `attachments`, `status` (`submitted` | `reviewed`), `submittedAt`, `attempts`, `late`, `feedback`, `feedbackAt`, `feedbackById`.
- **Review**: `organizationId`, `coachId`, `studentId`, `status` (`draft` | `submitted`), `strengths`, `challenges`, `observations`, `recommendations`, `nextGoals`, `submittedAt`. Human-authored only; locked permanently once submitted.
- **CoachNote**: `organizationId`, `coachId`, `studentId`, `body`. Strictly private to owning coach; never returned on student endpoints.
- **Activity**: `organizationId`, `coachId`, `groupId`, `title`, `description`, `location`, `startsAt`, `endsAt` (max 8h), `status` (`scheduled` | `completed` | `cancelled`). Group-based sessions only.
- **GroupPost**: `organizationId`, `groupId`, `authorId`, `kind` (`announcement` | `discussion`), `body`, `parentId` (max 1 reply level), `deletedAt` (soft delete for moderation).
- **GroupResource**: `organizationId`, `groupId`, `uploaderId`, `title`, `url` (`http`/`https` links only).

## Shared Services & Security Controls
- **Session security:** `httpOnly` `fb_session` cookie + double-submit `fb_csrf` / `X-CSRF-Token` check. Browser frontend never writes JWTs to `sessionStorage`.
- **Progress engine (`services/progress.js`):** Single source of truth for per-student open/overdue/submitted/completion metrics across Coach dashboard, student roster, student profile, and reports.
- **Business rules (`services/rules.js` & `services/coachRules.js`):** Pure, unit-tested rules covering CSV formula neutralization, regex escaping, pagination clamping, date-range parsing, publish/revision/late/review/activity/reply/URL guards.
- **Privacy & ethical guardrails:** No diagnosis/medical tracking, no student ranking leaderboards, coach-authored reviews kept separate from future AI insights, no compulsory live 1:1 teaching sessions.

## Planned Modules (Phase 4)
- Student workspace UI (`/student/*`), AI assistant (`services/ai/` using `AI_API_KEY`), student calendar, and scheduled reminder jobs.
