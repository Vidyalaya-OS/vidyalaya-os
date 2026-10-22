# School Management System

One web platform that many schools join. Each school gets its own private portal, run by its own admin, where teachers, students and parents each see only what concerns them.

This repository holds the **core platform** (build step 2 of the spec), the **academic and fee features** (build step 3), and **quizzes and the student and parent dashboards** (part of build step 4):

- **School onboarding** by the platform owner, with the first admin invited by email. Schools can be suspended (read-only) or archived.
- **School data kept separate** by PostgreSQL row-level security, not just application code.
- **Login** by email or phone plus password, with an optional one-time code for parents. JWT access and refresh tokens, Argon2 password hashing, rate-limited login.
- **Five roles**: platform owner, school admin, teacher, student, parent. One person can hold several roles and belong to several schools with one login.
- **Academic structure**: academic years, classes, sections, subjects, class teachers and who teaches what.
- **Registration** of students, teachers, parents and other admins, with invites, spreadsheet import (CSV or Excel), moving sections, year-end promotion and marking as left. Nothing is deleted; history is kept.
- **Timetable**: periods of the day and a weekly grid per section. Saving a slot that books a teacher in two sections at once is refused with the clash listed, unless the admin confirms.
- **Attendance**: one record per student per day. Everyone starts present; the teacher taps the absent, late or on-leave ones. Parents and students see a month calendar and percentage; admins see daily and monthly reports and a list of students under a threshold (75% by default). Changes after the day are logged.
- **Homework**: teachers post to sections and subjects they teach, with attachments (served only through the API, after a permission check). Students mark it done; parents see each child's list.
- **Tests and report cards**: exam terms, a grading scale (percentage bands, with a default), tests per subject per section, a marks grid for teachers, results with grade, class average and highest. Admins publish results, which locks marks. Report cards combine a term's marks, attendance and teacher remarks; students and parents see them once published, and can print them or save them as PDF from the browser.
- **Fees**: fee heads, fee structures per class with installments, dues billed to each enrolled student, discounts and one-off charges, payments with numbered receipts (oldest dues paid first), reversals instead of edits, and for every student: total due, paid, remaining and overdue. Admin reports: collected today, this month and this year, outstanding by class, and an overdue list with parents' contacts. Payments are recorded by the school office; online payment comes later.
- **After-class quizzes**: a teacher sets a short quiz on the topic taught that day (multiple choice or true/false, with marks per question and an open and close time) for a section and subject they teach. Questions are saved to the teacher's own question bank, tagged by subject and topic, to reuse later. Students take it once while it is open and get their score straight away; the right answers show after it closes (or when the teacher closes it early). Teachers see each student's score and which questions most of the class got wrong. Parents see their children's scores. Once anyone has taken a quiz its questions are fixed and it cannot be removed.
- **Student home screen**: today's classes, quizzes to take, homework due this week (and overdue), latest test results with report card links, recent quiz scores and attendance.
- **Parent home screen**: for each child, today's attendance and this month's percentage, homework due, latest marks and report cards, quiz scores, and fees: total, paid, remaining, overdue and the next installment.
- **Web app** for all of the above, mobile-first.

Notifications, announcements and the admin and teacher home screens come next.

## Layout

```
backend/   Django 6 + Django REST Framework API
  config/          settings and URLs
  apps/tenancy/    schools, the current-school context, row-level security, platform endpoints
  apps/accounts/   users, memberships (roles), login, invites, one-time codes, audit log
  apps/academics/  academic years, classes, sections, subjects, subject teachers
  apps/people/     students, enrollments, teachers, parents, imports, setup checklist
  apps/timetable/  periods and the weekly timetable
  apps/attendance/ daily attendance, calendars and reports
  apps/homework/   homework, attachments, done marks
  apps/exams/      grading scales, exam terms, tests, marks, results, report cards
  apps/fees/       fee heads and structures, dues, payments, receipts, balances
  apps/quizzes/    topics, question bank, quizzes, attempts and scoring
  apps/dashboards/ the student and parent home screens
  tests/           API and isolation tests
web/       Next.js web app
```

## Run it locally

You need Python 3.12+, Node 22 and PostgreSQL 16.

```bash
# 1. Database (or use your own PostgreSQL and run backend/db/init.sql as a superuser)
docker compose up -d db

# 2. API
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate        # settings come from environment variables; see .env.example
python manage.py seed_demo      # optional: two demo schools with people, a timetable, attendance, marks, fees and quizzes
python manage.py runserver      # http://localhost:8000

# 3. Web app, in another terminal
cd web
npm install
npm run dev                     # http://localhost:3000
```

With the demo data, every account's password is `Demo-pass-2026`:

| Who | Login |
|---|---|
| Platform owner | owner@demo.test |
| School admin | admin@greenvalley.test |
| Teacher | teacher@greenvalley.test |
| Student | student1@greenvalley.test |
| Parent | parent1@greenvalley.test |

Create a real platform owner with `python manage.py createsuperuser`. In development, invite emails and login codes are printed in the API's console.

## Tests

```bash
cd backend && python manage.py test tests
```

The tests need the database role from `backend/db/init.sql` (it may create a test database). CI runs the same tests plus the web app's lint and build (`.github/workflows/ci.yml`).

## How school data is kept separate

- Every school-owned table inherits `TenantModel`, so every row carries `school_id`.
- Each request is tied to one school, from its subdomain (`greenvalley.<PLATFORM_DOMAIN>`) or the `X-School` header the web app sends. Middleware sets `app.current_school` on the database connection and clears it when the request ends.
- PostgreSQL row-level security policies on every school-owned table only return and accept rows for that school. Tables use `FORCE ROW LEVEL SECURITY`, and the app connects as a role that is neither a superuser nor `BYPASSRLS`, so a query that forgets to filter still sees nothing from other schools.
- The policies are applied after every `migrate` (`apps/tenancy/rls.py`), so tables added by later features are covered automatically. A test fails if any school table is missing its policy.
- On top of that, every endpoint checks the user's role in the current school and narrows rows to what the role allows: teachers see students of the sections they teach, students see themselves, parents see their children.
- The platform owner sees schools and head counts, not student records. Reading across schools goes through `audit.platform_access`, which logs it. The audit log is append-only at the database level.
- `tests/test_isolation.py`, `tests/test_isolation_academic.py` and `tests/test_dashboards.py` log into school A and try to read, change and link school B's data through every endpoint.
- Payments and their allocations can never be updated or deleted: a database trigger refuses it, so a mistake is undone with a reversing entry and totals always reconcile.
- Marks, attendance changes after the day, fee changes and payments are written to the audit log.

## API overview

All paths are under `/api/`, with or without a trailing slash. School endpoints need the school (subdomain or `X-School` header) and a JWT (`Authorization: Bearer …`).

| Area | Endpoints |
|---|---|
| Login | `auth/login`, `auth/refresh`, `auth/logout`, `auth/me`, `auth/password`, `auth/invites/<token>`, `auth/otp/request`, `auth/otp/verify` |
| Platform owner | `platform/schools/` (list, create, update), `…/<id>/suspend`, `activate`, `archive`, `resend-admin-invite` |
| School setup | `school/`, `academic-years/`, `classes/`, `sections/`, `subjects/`, `section-subjects/`, `setup-status` |
| People | `students/` (+ `move`, `leave`, `rejoin`, `promote`, `history`, `guardians`, `resend-invite`), `teachers/` (+ `leave`), `guardians/`, `admins/`, `my-children` |
| Import | `imports/students`, `imports/teachers` (GET for a template, POST a file; `?dry_run=true` to check only) |
| Timetable | `periods/`, `timetable/` (`?section=`, `?teacher=`, `?day=1-7` or `today`, `?mine=true`), `timetable/clashes` |
| Attendance | `attendance/sheet` (GET `?section=&date=`, POST to save), `attendance/pending`, `attendance/students/<id>?month=YYYY-MM`, `attendance/reports/daily`, `…/monthly`, `…/low?threshold=75` |
| Homework | `homework/` (`?section=`, `?student=`, `?upcoming=true`, `?due_from=`, `?due_to=`), `…/<id>/attachments`, `…/<id>/done` (POST or DELETE), `…/<id>/statuses` |
| Tests | `grade-scales/`, `exam-terms/` (+ `create-exams`), `exams/` (+ `marks` GET/PUT, `publish`, `unpublish`, `results`), `results/students/<id>` |
| Report cards | `report-cards/section?exam_term=&section=`, `report-cards/remarks` (PUT), `report-cards/publish` (POST, DELETE to unpublish), `report-cards/students/<id>/<term_id>` |
| Quizzes | `quizzes/` (`?state=` open, upcoming, closed or pending, `?section=`, `?student=`, `?mine=true`; + `paper`, `submit`, `results`, `close`), `question-bank/`, `quiz-topics/` |
| Home screens | `dashboard/student`, `dashboard/parent` |
| Fees | `fee-heads/`, `fee-structures/` (+ `generate-dues`), `fee-dues/`, `payments/` (+ `reverse`, `receipt`), `fees/students/<id>`, `fees/balances`, `fees/defaulters`, `fees/summary` |

Money goes in and out of the API as decimal strings with two places ("1500.00") and is stored as whole paise or cents.

## Not done yet

- SMS is logged instead of sent until an SMS gateway is chosen, so phone-only invites and login codes do not reach people yet.
- Files (logos, photos) are stored on local disk; S3 with per-school folders and signed links comes with deployment.
- Two-step login for admins is not built yet.
- Report cards and receipts are printed (or saved as PDF) from the browser; server-made PDFs come with deployment.
- Absent-student alerts to parents come with notifications in the next build step.
