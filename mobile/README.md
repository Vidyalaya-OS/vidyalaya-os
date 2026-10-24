# Vidyalaya OS mobile app

The Vidyalaya OS school app for Android and iOS, built with Expo (React Native,
TypeScript). It talks to the same Django API as the web app in `../web`, with
the same colours, fonts, light and dark themes, and every feature for all five
kinds of user:

| Who | What they can do |
|---|---|
| Platform owner | See all schools with head counts and fees, suspend, archive or reactivate a school, resend an admin invite, onboard a new school in four steps |
| School admin | Home dashboard, teacher attendance, fees (overview, balances, overdue list with tap-to-call, fee structure, billing, payments, discounts, reversals, printable receipts), students, teachers, parents, admins, classes & subjects with guided setup, spreadsheet import, report cards |
| Teacher | Today's timetable, roll call, homework with attachments, quizzes, tests and marks, report cards |
| Student | Timetable, homework, quizzes, attendance calendar, results, report cards, fees |
| Parent | Everything about each child (switch between children), sign in with a one-time code |

The layout adapts to the screen: a bottom tab bar and menu drawer on phones,
and a sidebar with wider tables on tablets.

## Run it

You need Node.js 20 or newer and the **Expo Go** app on your phone (from the
App Store or Play Store). The app uses Expo SDK 58, the version the
current Expo Go runs. If Expo or npm offers to upgrade or "fix" package
versions, say no: they are already the ones SDK 58 expects.

1. Start the API so your phone can reach it. In `backend/`, with its virtual
   environment active:

   ```bash
   # your Mac's address on the Wi-Fi, for example 192.168.1.20
   ipconfig getifaddr en0
   ```

   Add that address to `DJANGO_ALLOWED_HOSTS` in `backend/.env`, for example
   `DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,192.168.1.20`, then:

   ```bash
   python manage.py runserver 0.0.0.0:8000
   ```

   `0.0.0.0` makes the API listen on the Wi-Fi, not only on the Mac itself.

2. Start the app:

   ```bash
   cd mobile
   npm install
   npx expo start
   ```

3. Scan the QR code with the iPhone camera, or from Expo Go on Android. The
   phone must be on the same Wi-Fi as the Mac.

The app finds the API on its own: it uses the address Expo is running on, with
port 8000. If that does not work (for example on a different network), either
copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL`, then restart
`npx expo start`, or tap **Server** at the bottom of the sign-in screen and
type the address.

Press `i` or `a` in the terminal to open the iOS Simulator or an Android
emulator instead. On the Android emulator the Mac is `http://10.0.2.2:8000`.

## Demo logins

With the demo data (`python manage.py seed_demo`), every password is
`Demo-pass-2026`:

| Who | Login |
|---|---|
| Platform owner | owner@demo.test |
| School admin | admin@greenvalley.test |
| Teacher | teacher@greenvalley.test |
| Student | student1@greenvalley.test |
| Parent | parent1@greenvalley.test |

Parents can also choose **Parent code**: in development the code is printed in
the API's terminal (and shown on screen in demo mode).

## Checks

```bash
npm run typecheck     # TypeScript check
```

## Where things are

- `src/app/` is the screens, one file per route (expo-router), mirroring
  `web/src/app/`: `login`, `choose-school`, `invite/`, `app/` (school
  portal) and `platform/` (platform owner).
- `src/components/ui.tsx` is the design system: buttons, fields, cards,
  tables that turn into cards on phones, sheets, tabs, badges and the motion.
- `src/lib/theme.tsx` holds the colours (the web's palette) for light and dark.
- `src/lib/api.ts` is the API client: login tokens in the secure store, the
  chosen school in the `X-School` header, and token refresh.
- `src/lib/server.ts` decides the API address.

## Building an installable app

Expo Go is for development. To make an `.apk`/`.aab` or an App Store build, use
EAS Build (`npm install -g eas-cli`, `eas build`). A production build talks to
the API over HTTPS: set `EXPO_PUBLIC_API_URL` to the deployed API.
