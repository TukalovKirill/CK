#!/bin/bash
set -e

APP_DIR="/opt/ck"
COMPOSE="docker compose"

cd "$APP_DIR"

echo "=== Building images (no cache) ==="
$COMPOSE build --no-cache

echo "=== Restarting backend (zero-downtime) ==="
$COMPOSE up -d --no-deps --build backend
echo "Waiting for backend to be ready..."
sleep 5

echo "=== Restarting frontend ==="
$COMPOSE up -d --no-deps --build frontend

echo "=== Running migrations ==="
$COMPOSE exec -T backend python manage.py migrate --noinput

echo "=== Cleanup old images ==="
docker image prune -f

echo "=== Deploy complete ==="
$COMPOSE ps
