# School Management System

One web platform that many schools join. Each school gets its own private portal, run by its own admin, where teachers, students and parents each see only what concerns them.

This repository holds the **core platform** (build step 2 of the spec):

- **School onboarding** by the platform owner, with the first admin invited by email. Schools can be suspended (read-only) or archived.
- **School data kept separate** by PostgreSQL row-level security, not just application code.
- **Login** by email or phone plus password, with an optional one-time code for parents. JWT access and refresh tokens, Argon2 password hashing, rate-limited login.
- **Five roles**: platform owner, school admin, teacher, student, parent. One person can hold several roles and belong to several schools with one login.
- **Academic structure**: academic years, classes, sections, subjects, class teachers and who teaches what.
- **Registration** of students, teachers, parents and other admins, with invites, spreadsheet import (CSV or Excel), moving sections, year-end promotion and marking as left. Nothing is deleted; history is kept.
- **Web app** for all of the above, mobile-first.

Timetable, attendance, homework, tests, report cards, fees and quizzes come in the next build steps.

## Layout

```
backend/   Django 6 + Django REST Framework API
  config/          settings and URLs
  apps/tenancy/    schools, the current-school context, row-level security, platform endpoints
  apps/accounts/   users, memberships (roles), login, invites, one-time codes, audit log
  apps/academics/  academic years, classes, sections, subjects, subject teachers
  apps/people/     students, enrollments, teachers, parents, imports, setup checklist
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
python manage.py seed_demo      # optional: two demo schools and people
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
- `tests/test_isolation.py` logs into school A and tries to read, change and link school B's data through every endpoint.

## API overview

All paths are under `/api/`, with or without a trailing slash. School endpoints need the school (subdomain or `X-School` header) and a JWT (`Authorization: Bearer …`).

| Area | Endpoints |
|---|---|
| Login | `auth/login`, `auth/refresh`, `auth/logout`, `auth/me`, `auth/password`, `auth/invites/<token>`, `auth/otp/request`, `auth/otp/verify` |
| Platform owner | `platform/schools/` (list, create, update), `…/<id>/suspend`, `activate`, `archive`, `resend-admin-invite` |
| School setup | `school/`, `academic-years/`, `classes/`, `sections/`, `subjects/`, `section-subjects/`, `setup-status` |
| People | `students/` (+ `move`, `leave`, `rejoin`, `promote`, `history`, `guardians`, `resend-invite`), `teachers/` (+ `leave`), `guardians/`, `admins/`, `my-children` |
| Import | `imports/students`, `imports/teachers` (GET for a template, POST a file; `?dry_run=true` to check only) |

## Not done yet

- SMS is logged instead of sent until an SMS gateway is chosen, so phone-only invites and login codes do not reach people yet.
- Files (logos, photos) are stored on local disk; S3 with per-school folders and signed links comes with deployment.
- Two-step login for admins is not built yet.
