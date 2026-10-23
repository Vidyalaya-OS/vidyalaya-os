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
- **Admin home screen**: students and teachers, attendance today with the sections not marked yet, fees collected this month and overdue, fee collection by class, the overdue list with parents' phone numbers to call, and the school setup checklist.
- **Teacher home screen**: today's classes with the one going on now, attendance still to mark, open quizzes, tests waiting for marks and homework due.
- **Web app** for all of the above. See "The web app" below.

Notifications and announcements come next.

## The web app

The web app in `web/` works on phones, tablets and computers, in light and dark mode.

- **Landing page** at `/`: the 3D SMS logo, a "Choose who you are" explainer for owners, admins, teachers, students and parents, how it works, features, privacy and an FAQ (including what the Parent code is). Signed-in people go straight to their portal.
- **One layout for every role.** On a computer there is a sidebar; on a phone there is a top bar, four tabs at the bottom for that role's most used screens, and a "More" drawer for the rest. The menu follows the person's current **portal** (Admin, Teacher, Student or Parent), so an admin sees admin sections only. Someone with several roles switches portal at the top of the menu or on Home; a link into another of their portals switches automatically, and a page none of their roles may open shows a clear message.
- **Owner space**: a banner with the 3D logo, totals that tilt in 3D, a schools table (School, Plan, Students, Teachers, Fees this year, Status) with Active, Suspend and Archive buttons and Resend admin invite, status filters, students per school, plan mix, and schools that need a look. Onboarding is four steps (school, academic year, first admin, review) with a live preview.
- **Sign-in**: password, or the **Parent code** for parent accounts: a 6-digit code sent to the parent's phone or email, valid once for 10 minutes (printed in the API console while developing).
- **Portals**: the platform owner sees every school with head counts and fees; admins get the school office; teachers get their classes; students get their own record; parents get each child's record, with a child switcher at the top.
- **Admin setup path**: Home shows the school's setup in order (year, classes, sections, subjects, subjects per section, teachers, a teacher for every subject, class teachers, timetable, students, parents, fees). Each step says what is missing; a step waits until the ones it builds on are done, and a "Next step" panel always points at the one thing to do now. Classes & subjects has **New class** and **New subject** guides that walk through naming, sections, subjects and teacher allocation with guidelines at each step.
- **Section guides**: every admin section (Home, Calendar, Timetable, Attendance, Homework, Quizzes, Tests & marks, Report cards, Fees, Students, Teachers, Parents, Classes & subjects, Import, Admins) opens with a short explainer: what it is for, how to use it step by step, the rule to know, and a link to the next section, with an animated CSS 3D picture. It can be hidden per section (remembered on the device). Content is in `web/src/lib/guides.ts`.
- **Who marks attendance**: admins mark **teachers** only (required every day: Home and every admin screen remind until it is saved); teachers mark **students** of the sections they teach only. Admins can read every student report but not change one, and a teacher marked absent or on leave cannot take a roll call that day. Teachers see their own attendance under Attendance, My attendance.
- **Calendar**: one month of homework due dates, tests, quizzes closing and fee installments, with filters, the chosen day's items and that day's classes. The timetable has a week grid and a day-by-day view with the current class highlighted. Attendance has a month calendar, the month's split and a six-month trend.
- **Design**: Plus Jakarta Sans at a 16px base size, a shared set of components (`src/components/ui.tsx`), simple charts (`charts.tsx`), tables that turn into cards on phones, and light animation (page entry, count-up numbers, growing bars). Animation is switched off for people who ask their device for reduced motion. The theme button cycles system, light and dark.
- **Errors and loading**: skeletons while loading, empty states with a next step, error boxes with Retry, a separate message when the device is offline, toasts instead of browser alerts, confirm and input dialogs instead of browser pop-ups, field-level form messages, crash screens per area, a 404 page, and a return to sign-in (then back to the same page) when a session ends.
- **Production**: strict TypeScript, ESLint clean, `next build` passes, security headers, an installable web app manifest with icons, keyboard focus rings, a skip link and screen reader labels. API responses are cached for a few minutes per school and stale requests are cancelled.

Screenshots of every role on phone and computer are in the shared `screenshots/` folder.

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
  apps/core/       public app config (catalog.py, GET /api/config) and demo data (demo.py)
  config/demo_data.json  the demo platform: schools, people, fees, quizzes (edit to change the demo)
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
python manage.py seed_demo      # optional: the demo from config/demo_data.json (or set DEMO_AUTOLOAD=true to load it on migrate into an empty database)
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

## How the API code is organised

Each app keeps the same split, so a change has one obvious home:

- **views.py** decides who may do what (roles, sections they teach, their own children) and shapes the response. Nothing else.
- **selectors.py** holds read-only queries: lists, filters, totals, a quiz paper, class results.
- **services.py** holds the rules for changing data: onboarding a school, changing its status, setting and closing a quiz, grading and handing in, recording a payment. Services are plain functions that take plain values, so they are easy to test on their own (see `tests/test_core.py`).
- **serializers.py** checks input and formats output.

The platform (`apps/tenancy`) and quizzes (`apps/quizzes`) follow this fully; fees, accounts and dashboards already kept their logic in services. Lists the web app shows in forms (plans, boards, time zones, currencies, payment modes) come from `apps/core/catalog.py` through `GET /api/config`; the web app has the same lists built in (`web/src/lib/config.ts`) and uses them if the API can't be reached. Boards and time zones can be replaced with `SCHOOL_BOARDS` and `SCHOOL_TIMEZONES`.

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
| App config | `config` (public: plans, boards, time zones, currencies, payment modes, and demo logins when `DEMO_LOGINS_VISIBLE` is on) |
| Login | `auth/login`, `auth/refresh`, `auth/logout`, `auth/me`, `auth/password`, `auth/invites/<token>`, `auth/otp/request`, `auth/otp/verify` |
| Platform owner | `platform/schools/` (list, create, update), `…/<id>/suspend`, `activate`, `archive`, `resend-admin-invite` |
| School setup | `school/`, `academic-years/`, `classes/`, `sections/`, `subjects/`, `section-subjects/`, `setup-status` |
| People | `students/` (+ `move`, `leave`, `rejoin`, `promote`, `history`, `guardians`, `resend-invite`), `teachers/` (+ `leave`), `guardians/`, `admins/`, `my-children` |
| Import | `imports/students`, `imports/teachers` (GET for a template, POST a file; `?dry_run=true` to check only) |
| Timetable | `periods/`, `timetable/` (`?section=`, `?teacher=`, `?day=1-7` or `today`, `?mine=true`), `timetable/clashes` |
| Attendance | `attendance/sheet` (GET `?section=&date=`, POST to save: the section's teachers only), `attendance/teachers/sheet` (admins: GET `?date=`, POST to save), `attendance/teachers/monthly?month=`, `attendance/teachers/me?month=` (a teacher's own), `attendance/pending`, `attendance/students/<id>?month=YYYY-MM`, `attendance/reports/daily`, `…/monthly`, `…/low?threshold=75` |
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
