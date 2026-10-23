#!/usr/bin/env bash
# Start the API on a host such as Render: update the database, load the demo
# when DEMO_MODE is on, then serve with gunicorn on $PORT.
set -euo pipefail
cd "$(dirname "$0")/.."

python manage.py migrate --noinput
python manage.py check_db_role
case "${DEMO_MODE:-false}" in
  1|true|yes|on) python manage.py seed_demo ;;
esac
exec gunicorn config.wsgi:application \
  --bind "0.0.0.0:${PORT:-8000}" \
  --workers "${WEB_CONCURRENCY:-2}" \
  --timeout 120 \
  --access-logfile -
