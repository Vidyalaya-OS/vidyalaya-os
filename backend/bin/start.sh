#!/usr/bin/env bash
# Start the API on a host such as Render: update the database, load the demo
# when DEMO_MODE is on, then serve with gunicorn on $PORT.
set -euo pipefail
cd "$(dirname "$0")/.."

python manage.py migrate --noinput
python manage.py check_db_role
# First deploy on a host without a shell: set PLATFORM_OWNER_EMAIL and
# PLATFORM_OWNER_NAME and the owner is created once and emailed an invite.
if [ -n "${PLATFORM_OWNER_EMAIL:-}" ]; then
  python manage.py create_platform_owner --if-missing \
    --email "$PLATFORM_OWNER_EMAIL" --name "${PLATFORM_OWNER_NAME:-Platform owner}" \
    || echo "WARNING: could not create the platform owner; see the error above."
fi
case "${DEMO_MODE:-false}" in
  1|true|yes|on) python manage.py seed_demo ;;
esac
exec gunicorn config.wsgi:application \
  --bind "0.0.0.0:${PORT:-8000}" \
  --workers "${WEB_CONCURRENCY:-2}" \
  --timeout 120 \
  --access-logfile -
