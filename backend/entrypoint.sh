#!/bin/bash
set -e

echo "Waiting for database..."
while ! python -c "
import psycopg, os
psycopg.connect(
    dbname=os.environ.get('DB_NAME', 'ck_db'),
    user=os.environ.get('DB_USER', 'ck_user'),
    password=os.environ.get('DB_PASSWORD', 'ck_pass'),
    host=os.environ.get('DB_HOST', 'db'),
    port=os.environ.get('DB_PORT', '5432'),
)
" 2>/dev/null; do
  sleep 1
done
echo "Database ready."

echo "Running migrations..."
python manage.py migrate --noinput

echo "Collecting static files..."
python manage.py collectstatic --noinput 2>/dev/null || true

echo "Starting server..."
exec daphne -b 0.0.0.0 -p 8000 config.asgi:application
