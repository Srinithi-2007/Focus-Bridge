# API reference (Phase 1 + Phase 2 + Phase 3)

Base URL: `http://localhost:4000/api`.

Protected routes support:
1. **HttpOnly session cookie (`fb_session`)** — primary mechanism used by the Next.js frontend. Mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`) require the `X-CSRF-Token` header matching the `fb_csrf` cookie.
2. **`Authorization: Bearer <token>`** — supported for headless/programmatic API clients.

Errors have the shape `{ "error": { "message": "...", "details?": [...] } }`. Invalid ObjectId formats return HTTP 400 (`"Invalid identifier format"`) or HTTP 404 on scoped lookups.

---

## Auth (Phase 1)

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/register-organization` | none | Creates the organization and admin account; sets `fb_session` + `fb_csrf` cookies; returns `{ token, user, csrfToken }`. Rate limited. |
| POST | `/auth/login` | none | Constant-time password check; role loaded from DB; sets `fb_session` + `fb_csrf` cookies. Rate limited. |
| POST | `/auth/logout` | none | Clears `fb_session` and `fb_csrf` cookies. |
| GET | `/auth/csrf` | none | Issues/refreshes `fb_csrf` cookie and returns `{ csrfToken }`. |
| GET | `/auth/me` | any active user | Returns `{ user, organization }`. |
| POST | `/auth/forgot-password` | none | Always returns a generic response. Rate limited. |
| POST | `/auth/reset-password` | none | Token valid 1 hour, single use. |
| GET | `/auth/invitations/:token` | none | Returns `{ email, role, organizationName }` for a valid open invitation. |
| POST | `/auth/invitations/accept` | none | Students receive an active session + cookies; coaches become `pending_approval`. Rate limited. |

---

## Admin Workspace (Phase 2 — `admin` role only)

Every route below returns 401 without a valid session and 403 for coaches/students. All data is scoped to `req.organizationId`.

### Dashboard & Invitations
| Method | Path | Notes |
|---|---|---|
| GET | `/admin/dashboard` | `metrics`, `pendingCoaches`, `openInvitations`, `groups`, `recentActivity`. |
| POST | `/admin/invitations` | `{ email, role: "coach" \| "student" }`. Rejects duplicate open invitations (409). |
| GET | `/admin/invitations?role=&state=` | `state`: `open`, `accepted`, `revoked`, `expired`. |
| DELETE | `/admin/invitations/:id` | Revokes an open invitation. |

### Users, Students, Coaches & Allocations
| Method | Path | Notes |
|---|---|---|
| GET | `/admin/users?role=&status=` | Lists coaches and students in this organization. |
| PATCH | `/admin/users/:id` | Updates `firstName`, `lastName`, `email` (unique). |
| PATCH | `/admin/users/:id/approve` | Approves a `pending_approval` coach to `active`. |
| PATCH | `/admin/users/:id/status` | `{ status: "active" \| "deactivated" }`. Admins cannot change themselves or other admins. |
| GET | `/admin/students?search=&status=&programId=&coachId=&page=&limit=` | Paginated student roster (`coachId=none` lists unassigned students). |
| PATCH | `/admin/students/:id` | Updates `firstName`, `lastName`, `email`, `programId`. |
| GET | `/admin/coaches?search=&status=` | Coach roster with `studentCount` and `groupCount`. |
| GET | `/admin/allocations` | Coaches with caseload and students with current coach. |
| PUT | `/admin/students/:id/coach` | `{ coachId: "<id>" \| null }`. Active students and active org coaches only. |

### Groups, Programs, Reports & Settings
| Method | Path | Notes |
|---|---|---|
| GET | `/admin/groups` | Lists groups with coach, program, and member count. |
| POST | `/admin/groups` | `{ name, description?, coachId?, programId? }`. |
| GET | `/admin/groups/:id` | Group details with member roster. |
| PATCH | `/admin/groups/:id` | Updates `name`, `description`, `coachId`, `programId`. |
| DELETE | `/admin/groups/:id` | Removes group (students remain intact). |
| POST | `/admin/groups/:id/members` | `{ studentIds: [...] }`. Active students only, skips duplicates, max 200 members. |
| DELETE | `/admin/groups/:id/members/:studentId` | Removes one student from group. |
| GET | `/admin/programs` | Programs with student and group counts. |
| POST | `/admin/programs` | `{ name, description?, coachingAreas? }`. |
| PATCH | `/admin/programs/:id` | Updates program fields. |
| DELETE | `/admin/programs/:id` | Blocked with HTTP 409 while any student or group references the program. |
| GET | `/admin/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` | Aggregate organization metrics over date range (default 90 days, max 2 years). |
| GET | `/admin/reports/export?type=students\|coaches\|groups\|invitations&from=&to=` | Formula-neutralized CSV export. |
| GET | `/admin/settings` | Organization profile, invitation expiry, notification settings, role matrix. |
| PATCH | `/admin/settings` | Updates profile, `invitations.expiryDays` (1–30), and notification flags. |

---

## Coach Workspace (Phase 3 — `coach` role only)

Coaches can access only students allocated to them (`coachId`) and groups assigned to them (`coachId`). Unauthorized cross-coach or cross-org lookups return HTTP 404.

| Method | Path | Notes |
|---|---|---|
| GET | `/coach/dashboard` | Metrics, allocated student roster, upcoming activities, recent actions. |
| GET | `/coach/students?search=&groupId=&needsReview=true\|false&page=&limit=` | Allocated students with open/overdue tasks, completion %, last review, and review-due flag. |
| GET | `/coach/students/:id` | Student profile, goals (from latest submitted review), assigned tasks, submission history, reviews, and private coach notes. |
| POST | `/coach/students/:id/notes` | `{ body }`. Private to owning coach; never exposed to students or other coaches. |
| DELETE | `/coach/students/:id/notes/:noteId` | Deletes owning coach's note. |
| GET | `/coach/groups` | Assigned groups with member and upcoming activity counts. |
| GET | `/coach/groups/:id` | Group classroom: members, announcements, threaded discussions, resources, activities, group assignments. |
| POST | `/coach/groups/:id/posts` | `{ kind: "announcement" \| "discussion", body, parentId? }`. One reply level deep. |
| DELETE | `/coach/groups/:id/posts/:postId` | Soft-deletes a post in an owned group. |
| POST | `/coach/groups/:id/resources` | `{ title, url }`. Safe `http://`/`https://` links only. |
| DELETE | `/coach/groups/:id/resources/:resourceId` | Deletes shared resource link. |
| GET | `/coach/tasks?status=&groupId=&studentId=` | Tasks created by this coach. |
| POST | `/coach/tasks` | `{ title, instructions, priority, deadline, audience: "student" \| "group", studentId \| groupId, attachments, publish }`. |
| GET | `/coach/tasks/:id` | Task details, original instructions/deadline, allocated assignees with submissions, and `hiddenAssigneeCount`. |
| PATCH | `/coach/tasks/:id` | Drafts: all fields. Published: instructions, deadline, priority, attachments (records revision; target fixed). Archived: 409. |
| POST | `/coach/tasks/:id/publish` | Requires 10+ char instructions and future deadline (if set). Snapshots `originalInstructions` and `originalDeadline`. |
| POST | `/coach/tasks/:id/archive` | Archives a published task. |
| DELETE | `/coach/tasks/:id` | Deletes a draft task. |
| POST | `/coach/submissions/:id/feedback` | `{ feedback }`. Requires owning coach + allocated student; marks submission `reviewed`. |
| GET | `/coach/reviews?studentId=&status=` | Coach's own reviews (draft or submitted). |
| POST | `/coach/reviews` | `{ studentId, strengths, challenges, observations, recommendations, nextGoals, submit }`. |
| GET | `/coach/reviews/:id` | Retrieves a single coach review. |
| PATCH | `/coach/reviews/:id` | Updates draft or submits it. Submitted reviews are permanently locked (409). |
| GET | `/coach/students/:id/messages` | Message history between coach and allocated student. Marks student messages read. |
| POST | `/coach/students/:id/messages` | `{ body }`. Sends reply to allocated student and triggers real-time notification. |
| GET | `/coach/activities?status=&groupId=` | Lists group activities (`scheduled`, `completed`, `cancelled`, `all`). |
| POST | `/coach/activities` | `{ groupId, title, description, location, startsAt, endsAt }`. Future start, max 8 hours. |
| PATCH | `/coach/activities/:id` | Edits a scheduled activity. |
| POST | `/coach/activities/:id/complete` | Marks scheduled activity completed (only after start time). |
| POST | `/coach/activities/:id/cancel` | Cancels a scheduled activity. |
| GET | `/coach/reports?from=&to=&groupId=` | Aggregate progress for allocated students and weekly submission trends. |
| GET | `/coach/reports/export?type=students\|groups\|activities&from=&to=&groupId=` | Formula-neutralized CSV export. |

---

## Student Workspace (Phase 4 — `student` role only)

All routes below require authentication with the `student` role. Everything is scoped to the authenticated student; coach drafts, private coach notes, and other students' data are never returned.

| Method | Path | Notes |
|---|---|---|
| GET | `/me/dashboard` | Dashboard overview: today's open tasks, scheduled calendar blocks, upcoming deadlines, coach & groups summary, unread notifications. |
| GET | `/me/tasks` | Published tasks assigned to the student or their groups, with own submission & coach feedback. |
| POST | `/me/tasks/:id/submission` | `{ body, attachments? }`. Creates or resubmits assignment. |
| POST | `/me/tasks/:id/plans` | Generates a new breakdown proposal with subtasks and suggested work blocks (AI or deterministic planner). |
| GET | `/me/plans?taskId=` | Lists active plans for assigned tasks. |
| GET | `/me/plans/:id` | Full details of a proposed or approved plan with subtasks, work blocks, and feasibility status. |
| PATCH | `/me/plans/:id` | `{ subtasks?, blocks? }`. Edits proposed subtasks or validates manual work blocks before approval. |
| POST | `/me/plans/:id/approve` | Explicitly approves plan proposal. Converts proposed work blocks into `CalendarEvent` records. |
| POST | `/me/plans/:id/reject` | Discards a plan proposal. |
| POST | `/me/plans/:id/reschedule` | Re-proposes calendar work blocks for remaining unfinished subtasks. |
| PATCH | `/me/plans/:id/subtasks/:subtaskId` | `{ done: true \| false }`. Toggles subtask completion and marks corresponding calendar event. |
| GET | `/me/calendar?from=&to=` | Weekly calendar feed combining approved work blocks and group activities. |
| PATCH | `/me/calendar/events/:id` | `{ done: true \| false }`. Toggles work block completion on calendar. |
| POST | `/me/assistant/chat` | `{ message }`. Task breakdown and study strategy assistant (uses Gemini when `AI_API_KEY` is set; deterministic local fallback otherwise). |
| GET | `/me/coach` | Assigned coach card, direct line message history, coach feedback history, latest focus goals, and submitted reviews. |
| POST | `/me/coach/messages` | `{ body }`. Sends asynchronous direct message to assigned coach and notifies them. |
| GET | `/me/groups` | Enrolled cohort groups. |
| GET | `/me/groups/:id` | Group classroom: coach announcements, threaded discussions, shared resources, and activities. |
| POST | `/me/groups/:id/posts` | `{ body, parentId? }`. Posts student discussion or reply to coach announcement. |
| GET | `/me/progress` | Progress metrics: task completion, on-time submission rate, activity attendance, coach goals, planner insights. |
| GET | `/me/notifications?unread=true\|false` | Notification feed with unread counter. |
| POST | `/me/notifications/read-all` | Marks all notifications as read. |
| POST | `/me/notifications/:id/read` | Marks a single notification as read. |
| GET | `/me/settings` | Student settings: weekly availability windows (UTC), reminder lead times, accessibility preferences. |
| PATCH | `/me/settings` | Updates availability windows, preferences, or accessibility toggles. |
| POST | `/me/security/password` | `{ currentPassword, newPassword }`. Changes password with constant-time verification. |

---

## Health
`GET /api/health` returns `{ "status": "ok" }`.
