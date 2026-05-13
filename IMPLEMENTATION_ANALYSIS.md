# StudyStack Implementation Analysis

Pre-implementation analysis for the FIXES / IMPROVEMENTS / ADDITIONS spec.
**No code has been changed yet.** This document maps the spec onto the
current codebase so we can agree on scope before touching anything.

---

## 0. Current System Architecture (verified by reading the code)

**Stack**
- Angular 20 (standalone components, signals/zone, SSR-aware)
- Firestore as primary persistence ([firestore.service.ts](src/app/services/firestore.service.ts)) with
  a json-server fallback on `http://localhost:3000` ([db.json](db.json))
- SweetAlert2 already in deps — used for toasts/dialogs in admin pages
- LocalStorage used for: `currentUser`, cached `students`/`teachers`,
  read-state of announcements, activity bookmarks

**Roles & routing** — guards in [src/app/guards/](src/app/guards/), routes in
[app.routes.ts](src/app/app.routes.ts). Three roles: `admin`, `student`, `teacher`.

**Domain model** (academic.service.ts:7-63)

| Entity         | Key fields                                                                          |
|----------------|-------------------------------------------------------------------------------------|
| Program        | id, name                                                                            |
| Faculty        | id, name, programId                                                                 |
| YearLevel      | id, name, programId, order                                                          |
| Section        | id, name, programId, yearLevelId                                                    |
| **Course**     | id, name, units, **schedule (free-text string)**, semester, programId               |
| CourseSection  | id, courseId, sectionId, teacherUID (one teacher per (course, section))             |
| Enrollment     | id, studentUID, studentID, courseId, sectionId, teacherUID, enrolledAt              |

**Activities** (activity.service.ts:9-47)

| Entity              | Key fields                                                              |
|---------------------|-------------------------------------------------------------------------|
| **Activity**        | id, title, description, **type: `'quiz' \| 'output'`**, teacherID, teacherUID?, courseId?, deadline, closeAt, maxPoints?, scoresReleased?, shuffleQuestions? |
| ActivitySubmission  | id, activityId, studentID, studentUID, submittedAt, lastEditedAt, content, links?, quizAnswers?, score?, feedback?, graded?, submitted? |

**Announcements** (announcement.service.ts:6-13) — `{ id, title, message, createdAt, teacherID, courseId? }`. Note: existing code stores **the teacher's UID in the `teacherID` field** (student-announcement.ts:162).

**Identifier model — important caveat**
There are two parallel IDs per teacher: `teacherID` (credential e.g. `T-0001`)
and `UID` (account UID e.g. `teacher1`). Activities historically stored either,
which is why [activity.service.ts:122-242](src/app/services/activity.service.ts#L122-L242)
has fallback chains. **Any new feature that joins to teacher should follow
the same defensive pattern** or we will reintroduce the existing bug class.

**Pages already present:** every page named in the spec already exists as a
route — student/teacher profile, settings, activity, announcement, attendance,
class-record. The work below is mostly fixes/extensions to existing pages,
not greenfield.

---

## 1. Spec ↔ Reality Discrepancies (must resolve before coding)

These are explicit gaps between what the spec assumes and what the code
actually has. **We should answer these before any implementation begins.**

### D1. Activity-type taxonomy mismatch (affects Fix #3)
The spec branches on `ASSIGNMENT | GENERAL | QUIZ`. The code only has
`'quiz' | 'output'` (activity.service.ts:9). There is no `GENERAL` and no
`ASSIGNMENT` distinct from `output`. **Decision needed:**
- (a) treat `output` as the combined `ASSIGNMENT/GENERAL` branch (simplest, no schema change), or
- (b) add `'general'` to the union and migrate existing activities.

### D2. Course.schedule is unstructured (affects Fix #1)
`Course.schedule` is a single free-text string with no day/time semantics
(academic.service.ts:42, admin-courses.ts:60-68). The spec requires "time
overlap" detection. **Decision needed:** introduce a structured field
(e.g. `meetings: { day: string; start: string; end: string }[]`) or parse
the existing string. Without structure, "conflict detection" is impossible
to do correctly.

### D3. "Resubmission" semantics (Fix #3)
The spec describes a separate resubmission timestamp. The existing model
uses one record per (activity, student) with `submittedAt` (created) +
`lastEditedAt` (most recent edit) — see activity.service.ts:506-588. The
existing attendance rule at activity.service.ts:635-654 already does what
the spec asks: it promotes PRESENT → LATE if `lastEditedAt > deadline`.
**Decision needed:** confirm `lastEditedAt` is acceptable as the
"resubmission time" — otherwise we need a submission history collection.

### D4. Announcement field naming (Fix #2)
`Announcement.teacherID` actually stores a teacher's **UID** in the
current code (student-announcement.ts:162-186). If we "fix" that by
renaming or normalizing, existing rows in Firestore must be migrated.

### D5. "Duplicate course" definition (Fix #1)
The spec says "Allow duplicate courses if their schedules don't match."
The code currently allows duplicates unconditionally — there's no
uniqueness check on `(name, ...)`. So Fix #1 is really *adding* a
conflict check, not removing one. **Decision needed:** what is the
uniqueness key? `(name, semester, programId)`? And the conflict check
applies *within* that scope, on the schedule field?

### D6. Quiz attendance vs. submission edits (Fix #3 quiz branch)
Spec says quiz answers cannot be edited. Code currently allows resubmit
of quiz answers via `submitOrUpdateSubmission` (activity.service.ts:506).
Need to confirm: lock quiz submissions after first submit, ignoring
`lastEditedAt` for the quiz attendance branch.

---

## 2. Per-Item Analysis

### FIX #1 — Schedule-conflict-aware duplicate courses
**Status:** New feature; current code has no schedule structure or conflict check.

**Affected**
- [academic.service.ts](src/app/services/academic.service.ts) — `addCourse`, `updateCourse`, `Course` interface
- [admin-courses.ts](src/app/pages/admin-courses/admin-courses.ts) — `saveCourse` (lines 182-205), course form schema
- [admin-courses.html](src/app/pages/admin-courses/admin-courses.html) — schedule input
- [admin-enrollments](src/app/pages/admin-enrollments/) — student/teacher assignment flow (need to read; spec says check at enroll time too)
- `assignSectionToTeacher` (academic.service.ts:333-348) — teacher assignment

**Decisions needed (block implementation)**
- D2 above (structured schedule field — recommended) and D5 (uniqueness key).
- Time granularity: minutes (15-min steps?).
- Conflict scope: per-teacher (no double-booked teacher), per-section (no
  clashing classes for one section), per-student? The spec says all three.
- Buffer time between back-to-back classes (default 0).

**Implementation outline** (pending decisions)
1. Migrate `Course.schedule: string` → `meetings: Meeting[]` (each meeting:
   day-of-week, start HH:mm, end HH:mm). Provide a one-time migration in
   [src/app/migration/](src/app/migration/) that parses existing strings on
   best-effort and falls back to "unscheduled".
2. Add `ScheduleConflictService.hasConflict(a: Meeting[], b: Meeting[]): Conflict | null`.
3. Hook into:
   - `AcademicService.addCourse` / `updateCourse` — validates against
     existing courses in the same `(semester, programId)` scope.
   - `assignSectionToTeacher` — checks the teacher isn't double-booked.
   - `enrollStudent` — checks the student isn't double-booked.
4. UI: SweetAlert error explaining which course/section conflicts and
   when (covers Improvement #1's "clear messages" naturally).
5. Tests: at least three conflict cases (overlapping, touching, different days).

**Edge cases:** open-ended classes (no closeAt) → reject before conflict
check; same course re-assigned to itself → ignore self in conflict scan.

---

### FIX #2 — Teacher announcements on student end
**Status:** Already implemented; spec asks for verification + likely a small bug fix.

**What exists**
- [student-announcement.ts](src/app/pages/student-announcement/student-announcement.ts):126-155 already
  filters announcements to enrolled teachers, groups by course, supports
  unread tracking, and auto-refreshes every 30 s.
- [announcement.service.ts](src/app/services/announcement.service.ts) supports per-teacher queries.

**Likely actual issue (to confirm with user)**
- D4 — `teacherID` field stores a UID, so the student-side filter
  (`a.teacherID === uid` on line 162 / 186) works only because both sides
  agree on "store UID under name `teacherID`". If a teacher uses a flow
  that writes the real `teacherID` credential, those announcements vanish
  for students. The most common bug is: a teacher creates an announcement
  on a new course but no enrollments yet exist for that course's
  `teacherUID`, so it stays hidden.

**Minimal change** (assuming no migration needed)
1. Make `Announcement.teacherID` semantics explicit in service comments.
2. In `getForTeacher`, OR-match `teacherID == uid` against the announcements
   collection where `teacherUID == uid` also works (mirror the activity
   resilience pattern).
3. Optionally tie announcement → courseId so the student page can group
   precisely (the field already exists at announcement.service.ts:12, just
   unused on the student page).
4. Add real-time stream (replace 30 s polling) using
   `firestoreService.watchAll` to match the activity stream pattern.

**Edge cases:** notifications for students should fire on create — see
notification.service.ts. Currently announcement creation does NOT trigger
notifications. Adding it requires fetching enrolled students for the
teacher (`getEnrollmentsByTeacher`) at create time.

---

### FIX #3 — Teacher attendance & class record with activity-based status
**Status:** Largely implemented. Spec's algorithm essentially matches the existing one.

**What exists**
- `ActivityService.getAttendanceStatus` (activity.service.ts:635-654) —
  exactly implements the spec's PRESENT/LATE/ABSENT logic, with
  `lastEditedAt > deadline` acting as the "resubmission promotes to LATE" rule.
- [teacher-attendance.ts](src/app/pages/teacher-attendance/teacher-attendance.ts) — has filters by course/section,
  by-activity vs. by-student views, attendance rate, CSV export.
- [teacher-class-record.ts](src/app/pages/teacher-class-record/teacher-class-record.ts) — class record with scores, sort, search, CSV export.

**Gaps vs. spec**
1. **Quiz-vs-output branch**: code uses one unified rule. Spec wants the
   quiz branch to *not* count edits as LATE since quiz resubmission "is
   disabled". Action: branch in `getAttendanceStatus`:
   - `output`: existing rule (PRESENT can be downgraded to LATE on late edit).
   - `quiz`: use `submittedAt` only; ignore `lastEditedAt`. Then enforce in
     `submitOrUpdateSubmission` that quizzes cannot be re-submitted after
     first submit (D6).
2. **Activity type taxonomy** (D1): if we keep `output`, document it as the
   union of "ASSIGNMENT" + "GENERAL"; otherwise add `'general'`.
3. **Closed-without-submission states** — already returns ABSENT for no
   submission (line 639); confirm spec accepts that.
4. **Invalid config** (closing_time < deadline): add validation when teacher
   creates an activity, not at attendance-calc time.
5. **Per-section attendance metrics**: already there; just verify the
   filter chip UI matches the spec's "filter by date / by activity type /
   by student".
6. **Excused absences**: not modeled. **Decision needed:** add or skip.

**Decisions needed:** D1, D3, D6, and "excused absences" yes/no.

---

### IMPROVEMENT #1 — Clear pop-up messages
**Status:** Partially done; needs consolidation.

- SweetAlert2 (`sweetalert2` in dependencies) is already used in
  [admin-courses.ts:54-58](src/app/pages/admin-courses/admin-courses.ts#L54-L58)
  via a private `toast()` helper.
- Other pages use raw `alert()` (e.g. student-activity.ts:527, 654, 664, 675).

**Plan**
1. Extract a shared `ToastService` in `src/app/services/toast.service.ts`
   wrapping SweetAlert2 with `success`, `error`, `warning`, `info`, plus
   a `confirm()` returning a Promise<boolean>.
2. Replace every raw `alert()` and inline `Swal.fire` with the service.
3. Standardize position (top-end), durations by severity (2 s success,
   3 s info, sticky error until dismissed).
4. ARIA: SweetAlert2 has `aria-labelledby`, verify it's enabled.
5. Hook into all create/update/delete/error paths flagged in the spec.

**Decisions needed:** I18n now or later? Action buttons (Retry/Undo)
needed in v1?

---

### IMPROVEMENT #2 — Functional Settings & Profile pages
**Status:** Stubs only — actual implementation needed.

[student-profile.ts](src/app/pages/student-profile/student-profile.ts) is 34 lines and only renders read-only
user info. Settings pages similarly thin.

**Plan**
- Student profile: editable email + name + program (read-only ID), with
  `StudentAccountService.update` (already exists at student-account.service.ts:127).
- Teacher profile: same shape over `TeacherAccountService`.
- Settings: notification preferences, theme (theme.service exists), language placeholder.
- Password change: see Addition #1 — couple them.
- Email uniqueness check via existing `getAll()` + filter.

**Decisions needed:** Which fields are editable for student vs. teacher
(spec asks)? Need email verification? Audit log on changes
(audit-log.service exists)?

**Edge cases:** sync between localStorage cache and Firestore on update
must invalidate `currentUser` if the logged-in user edits their own
record.

---

### IMPROVEMENT #3 — Course name in all activity references
**Status:** Inconsistent. Activity has `courseId?` but UI doesn't always display the resolved name.

**Audit targets**
- [student-activity.html](src/app/pages/student-activity/student-activity.html) — activity cards and stream
- [teacher-activity.html](src/app/pages/teacher-activity/teacher-activity.html) — teacher's activity list
- [teacher-class-record.ts:75-115](src/app/pages/teacher-class-record/teacher-class-record.ts#L75-L115) already resolves
  course name once; extend to per-activity display
- [teacher-attendance.ts:85-94](src/app/pages/teacher-attendance/teacher-attendance.ts#L85-L94) maps course names
- Announcements and notifications panels in [src/app/components/](src/app/components/)

**Plan**
1. Add a `CourseLookupService` that caches `id → name` map (load once,
   subscribe to `watchAll('courses')` for invalidation).
2. Replace bare `activity.title` displays with `{ courseName, title }`
   patterns where the spec requires it.
3. Activity has `courseId?` (optional!) — for legacy activities without
   one, render "Unassigned" or skip the chip.

---

### IMPROVEMENT #4 — Student program cards with real data
**Status:** Mostly done; might just need extra fields.

[student-activity.ts:206-247](src/app/pages/student-activity/student-activity.ts#L206-L247) already builds CourseCards with
course, enrollment, teacherUID, pendingCount. Missing per spec: teacher
name, schedule, semester, activity count, last-activity timestamp.

**Plan** — augment `recomputeFromState` to compute those extras and
expose them in the template. No new service work needed.

---

### IMPROVEMENT #5 — Teacher course cards mirroring student layout
**Status:** Need to verify; teacher-dashboard layout exists ([teacher-dashboard](src/app/layouts/teacher/)).

**Plan**
1. Read current teacher dashboard cards.
2. Compute per-card: enrolled count (`getEnrollmentsByTeacher` filtered by course),
   activity count (`getActivitiesForTeacher` filtered), pending grading count
   (submissions where `!graded && submitted`), most-recent submission timestamp.
3. Performance: aggregate once per dashboard load; do not poll. If we add a
   "pending" badge that needs to be live, use the `firestoreService.watchAll`
   pattern as in student-activity.

**Decisions needed:** Show archived courses? Definition of "archived" —
there's no `archived` flag on `Course` today.

---

### IMPROVEMENT #6 — Teacher reply to student questions
**Status:** Backend done, frontend missing.

- [student-question.service.ts](src/app/services/student-question.service.ts) has `createQuestion`, `answerQuestion`, fetch helpers.
- Student already submits questions via [student-activity.ts:557-628](src/app/pages/student-activity/student-activity.ts#L557-L628).
- Notification is wired (student-question.service.ts:42-51).
- **Teacher side has no UI** — search of teacher-activity.ts shows no Q&A surfaces.

**Plan**
1. New panel on teacher-activity activity-detail view listing questions for
   that activity (`getQuestionsForTeacher` + filter by activityId).
2. Reply textarea + Send button calling `answerQuestion`.
3. On reply, create an `AppNotification` for the student
   (`type: 'student-question'` is teacher-bound today — add a new
   `'question-answered'` type or reuse).
4. Student page: when viewing an activity, fetch their own questions for
   that activity and show the teacher's reply inline.

**Decisions needed:** thread or flat? Visible to other students? Edit/delete?

---

### ADDITION #1 — Profile pictures + password management
**Status:** None of this exists.

**Profile pictures**
- No avatar field on `StudentAccount`/`TeacherAccount`.
- Storage: Firebase Storage is **not** in the project (only Firestore is wired).
  Either add `@angular/fire/storage` and Storage bucket config in
  [firebase.config.ts](src/app/firebase.config.ts), or store as base64 in
  Firestore (cap small, e.g. 200KB after client-side resize).
- Decision: cloud Storage is the right call long-term but requires
  Firebase project changes — start with base64+resize to avoid that.

**Password change**
- Passwords are stored in **plaintext** in `StudentAccount.password`
  (student-account.service.ts:13). This is a critical security issue
  independent of the spec.
- Auth is local — no Firebase Auth integration. So "rate limit",
  "audit log", "session invalidation" only make sense if we either
  add Firebase Auth or keep things in-app and rely on the existing
  `audit-log.service`.
- **Recommendation:** migrate to Firebase Auth as part of this addition.
  That's a big scope expansion — call this out explicitly to the user.

**Decisions needed (large):** Firebase Auth or not? Cloud Storage or
inline base64? Password hashing (bcrypt? — would require server-side;
without backend we cannot do safe hashing in the browser).

---

### ADDITION #2 — Chat box (student ↔ teacher)
**Status:** Greenfield. No chat service or collection.

**Plan outline**
- Firestore collection `chatMessages: { id, threadId, senderUID, recipientUID, content, createdAt, readAt? }`.
- `ChatService` with `watchThread(threadId)` using `firestoreService.watchAll`
  with `where` clauses — Firestore real-time gives us WebSocket-like
  semantics for free; no separate server required.
- Floating component in [src/app/components/](src/app/components/) mounted from
  the appropriate layout (student/teacher). Hidden for admin.
- Access control: derive allowed contacts from enrollments
  (`getEnrollmentsByStudent` for students; `getEnrollmentsByTeacher` for
  teachers). No client-side enforcement is secure without Firestore
  security rules — we should write rules for this.

**Decisions needed:** Group chat? File sharing? Hours-of-availability
gating? Mobile presentation?

**Cost note:** every keystroke "typing" indicator in Firestore is expensive.
Throttle typing events to ≤1 write/3s if we add typing indicators.

---

### ADDITION #3 — Teacher-created learning materials
**Status:** Greenfield.

**Plan outline**
- New Firestore collection `materials: { id, courseId, teacherUID, title, description, type: 'link' | 'file', url, visibility, createdAt, updatedAt, ... }`.
- New `MaterialService` mirroring `AnnouncementService`.
- New teacher page `teacher-materials` (mounted in teacher-dashboard) +
  student materials section on the existing course view in
  [student-activity.ts](src/app/pages/student-activity/student-activity.ts) (we can extend the
  course-stream view).
- Files: same Storage decision as Addition #1. Reuse whatever we land on.

**Decisions needed:** allowed file types, max size, virus scan (not
feasible without a backend), comments/completion-tracking.

---

## 3. Recommended Implementation Sequence

Order chosen to minimize rework — earlier items establish foundations
for later ones, and we resolve open decisions in the same order they
unblock work.

1. **Decision pass with the user** on D1–D6 and the "decisions needed"
   bullets above. No code yet.
2. **Improvement #1 (Toast service)** — small, no schema risk, dependency
   for clean error UX on every later item.
3. **Improvement #3 (Course name everywhere)** — establishes
   `CourseLookupService`, reused below.
4. **Fix #2 (Announcements display)** — verify-and-fix only; small.
5. **Improvement #6 (Teacher Q&A reply UI)** — backend already exists;
   UI-only.
6. **Fix #3 (Attendance / class record refinements)** — branch quiz/output,
   lock quiz resubmissions, optional excused-absence flag.
7. **Improvement #4 + #5 (Student / teacher course cards)** — once
   `CourseLookupService` and attendance branches are in.
8. **Fix #1 (Schedule conflicts)** — requires `Course.schedule` schema
   migration; deliberately late so it doesn't block other items.
9. **Improvement #2 (Profile + Settings functional)** — combine with #1
   below for password.
10. **Addition #1 (Profile pic + password)** — heaviest auth/storage
    decision; do once with the user fully aligned.
11. **Addition #3 (Learning materials)** — reuses Storage decision.
12. **Addition #2 (Chat)** — last; biggest UX surface, builds on Storage
    + Auth choices.

---

## 4. Cross-cutting Risks

- **Identifier dualism (teacherID vs UID)** — every join must be resilient.
  Mirror the pattern in activity.service.ts:212-242 for any new collection
  that joins to teachers.
- **No Firebase Security Rules visible in the repo.** The fallback to
  json-server means all data is currently world-readable in dev. Anything
  touching passwords, chat, or materials needs rules written and pushed
  before going to prod.
- **Plaintext passwords today** — flagged regardless of whether Addition #1
  is approved.
- **SSR awareness** — many pages already guard with `isPlatformBrowser`.
  Any new `localStorage` / `window` use must follow the same pattern.
- **Real-time listener leaks** — every `.subscribe(...)` must be
  unsubscribed in `ngOnDestroy`. The existing patterns are good models.
- **Migration safety** — `Course.schedule` (Fix #1) and any rename of
  `Announcement.teacherID` (Fix #2) need a one-shot migration script in
  [src/app/migration/](src/app/migration/).
- **Performance** — `getSubmissionsForActivities` does a full-collection
  fetch then client-side filter (activity.service.ts:487-504). Fine for
  small classes; will need pagination or batched `where in` queries if
  enrollment grows.

---

## 5. Open Decisions Summary (needed from the user)

| #   | Decision                                                                                              | Blocks                          |
|-----|--------------------------------------------------------------------------------------------------------|---------------------------------|
| D1  | Keep `type: 'quiz' \| 'output'` or add `'general'`?                                                    | Fix #3                          |
| D2  | Migrate `Course.schedule` to structured meetings, or stick with parsed strings?                        | Fix #1                          |
| D3  | Is `lastEditedAt` an acceptable "resubmission timestamp"?                                              | Fix #3                          |
| D4  | Migrate `Announcement.teacherID` field or just clarify semantics in comments?                          | Fix #2                          |
| D5  | What uniqueness key for "duplicate course"? `(name, semester, programId)`?                             | Fix #1                          |
| D6  | Lock quizzes against resubmission?                                                                     | Fix #3                          |
| D7  | Conflict scope for Fix #1: teacher? section? student? all three?                                       | Fix #1                          |
| D8  | Add excused-absence concept?                                                                           | Fix #3                          |
| D9  | Migrate to Firebase Auth (and hashed passwords), or stay in-app?                                       | Addition #1, #2                 |
| D10 | Firebase Storage or inline base64 for images/files?                                                    | Addition #1, #3                 |
| D11 | Edit profile fields list for student vs. teacher?                                                      | Improvement #2                  |
| D12 | Q&A: thread or flat? Visible to other students?                                                        | Improvement #6                  |
| D13 | Chat: group support? File sharing? Hours-gated?                                                        | Addition #2                     |
| D14 | Materials: allowed file types and size cap?                                                            | Addition #3                     |

Once these are resolved, the sequence in §3 turns into a concrete plan
with PR-sized chunks.
