# Route status (29 approved routes)

Legend: ✅ built in this release · ⏳ planned for a later phase

## Public (4)
| # | Route | Status |
|---|---|---|
| 1 | `/` Landing | ✅ (functional Tailwind layout; Figma visual pass pending) |
| 2 | `/about` | ✅ (functional Tailwind layout; Figma visual pass pending) |
| 3 | `/register` (organization registration and invitation activation) | ✅ |
| 4 | `/login` (role-aware sign-in, forgot password, reset via `?reset=`) | ✅ |

## Admin (8)
| # | Route | Status |
|---|---|---|
| 5 | `/admin/dashboard` (Executive overview, metrics, quick actions, pending approvals) | ✅ |
| 6 | `/admin/students` (Student management, program assignment, status toggling) | ✅ |
| 7 | `/admin/coaches` (Coach management, pending approvals, caseload) | ✅ |
| 8 | `/admin/allocations` (Coach-to-student allocation matrix) | ✅ |
| 9 | `/admin/groups` (Cohort and group management, member rosters) | ✅ |
| 10 | `/admin/programs` (Curriculum and program management) | ✅ |
| 11 | `/admin/reports` (Executive analytics and formula-neutralized CSV exports) | ✅ |
| 12 | `/admin/settings` (Organization profile, invitation expiry, notification toggles) | ✅ |

## Coach (8)
| # | Route | Status |
|---|---|---|
| 13 | `/coach/dashboard` (Coach overview, metrics, allocated student roster, upcoming activities) | ✅ |
| 14 | `/coach/students` (My students — search, group/review filters, pagination) | ✅ |
| 15 | `/coach/students/[id]` (Individual student profile, goals, tasks, history, reviews, private notes) | ✅ |
| 16 | `/coach/groups` (My groups & cohort classroom — announcements, discussions, resources, members, activities, assignments) | ✅ |
| 17 | `/coach/tasks` (Tasks & assignments — draft, publish, revise, archive, submission feedback) | ✅ |
| 18 | `/coach/reviews` (Individual reviews — draft/submit workflow, locked submitted history) | ✅ |
| 19 | `/coach/activities` (Sessions & group activities — schedule, edit, complete, cancel) | ✅ |
| 20 | `/coach/reports` (Progress & longitudinal reports — date/group filters, weekly trends, CSV exports) | ✅ |

## Student (9)
| # | Route | Status |
|---|---|---|
| 21 | `/student/dashboard` (Today's tasks, calendar blocks, upcoming deadlines, coach & groups summary) | ✅ |
| 22 | `/student/coach` (Asynchronous direct line messaging, coach feedback, submitted reviews & goals) | ✅ |
| 23 | `/student/groups` (Enrolled cohort classroom — announcements, threaded discussions, resources, activities) | ✅ |
| 24 | `/student/tasks` (Assigned tasks, planner breakdown, proposal review, subtasks, submission) | ✅ |
| 25 | `/student/assistant` (AI-powered study & task planning assistant with deterministic fallback) | ✅ |
| 26 | `/student/calendar` (Weekly calendar feed with approved work blocks and group activities) | ✅ |
| 27 | `/student/progress` (Completion metrics, on-time rate, attendance, coach goals, planner insights) | ✅ |
| 28 | `/student/notifications` (Real-time task, feedback, deadline, review, and group announcement alerts) | ✅ |
| 29 | `/student/settings` (Weekly availability windows in UTC, reminder lead times, accessibility preferences) | ✅ |

All 29 approved routes are fully implemented, connected to the MongoDB backend, and verified.
Excluded by instruction: separate Coach Resources page, Coach Profile & Caseload Settings page, Silent Body-Doubling Room, medical diagnoses or automated AI review writing.
