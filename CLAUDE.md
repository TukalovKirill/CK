# CK Project

## Stack
- Backend: Django 5.2, DRF 3.16, SimpleJWT, Channels 4.3 (ASGI via Daphne)
- Frontend: React 19, Vite 6, Tailwind CSS 3.4
- DB: PostgreSQL 16
- Channel layer: InMemoryChannelLayer (no Redis)
- Docker: docker-compose with 3 services (db, backend, frontend)

## Structure
- `backend/` — Django project, config in `backend/config/`, apps in `backend/apps/`
- `frontend/` — React SPA, Vite config in root, source in `frontend/src/`

## Key decisions
- No AI features (DeepSeek, Qwen removed)
- No Sentry
- No Redis — using InMemoryChannelLayer
- No pre-seeded permissions — RBAC infrastructure exists, permissions will be added later
- Console email backend for development
- Email-based auth (no username field)

## Commands
```bash
# Docker
docker compose up --build

# Backend (local dev)
cd backend && pip install -r requirements.txt
python manage.py migrate
daphne -b 0.0.0.0 -p 8000 config.asgi:application

# Frontend (local dev)
cd frontend && npm install && npm run dev
```
