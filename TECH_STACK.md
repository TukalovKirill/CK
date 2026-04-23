# StaffOnly — Технологический стек

Справочник технологий, библиотек и инфраструктуры проекта. Предназначен для воспроизведения стека в другом репозитории.

---

## Backend

| Технология | Версия | Назначение |
|-----------|--------|-----------|
| **Python** | 3.13 | Язык бэкенда |
| **Django** | 5.2 LTS | Web-фреймворк (ORM, миграции, admin, management-команды) |
| **Django REST Framework** | 3.16 | REST API (ViewSets, сериализаторы, пермишены, пагинация) |
| **SimpleJWT** | 5.5 | JWT-аутентификация (email-based, без username), refresh token rotation + blacklist |
| **Channels** | 4.3 | WebSocket (ASGI), real-time обновления через group broadcast |
| **Daphne** | 4.2 | ASGI-сервер (HTTP + WebSocket) |
| **channels-redis** | 4.3 | Channel layer backend (Redis) |
| **PostgreSQL** | 16 | Основная БД (host-level, не в Docker) |
| **Redis** | 7 | Channel layer для WebSocket, кэш |
| **psycopg** | 3.3 | PostgreSQL-драйвер (binary для dev, C-расширение для prod) |
| **httpx** | 0.28 | Async HTTP-клиент (вызовы DeepSeek API, Qwen VL API) |
| **Pillow** | 10+ | Обработка изображений (ImageField) |
| **scikit-image** | 0.24+ | SSIM-сравнение фото (чек-листы) |
| **opencv-python-headless** | 4.8+ | Обработка изображений для сравнения |
| **imagehash** | 4.3+ | Perceptual hashing фото |
| **python-magic** | 0.4 | Валидация MIME-типов загружаемых файлов |
| **whitenoise** | 6.9 | Раздача статики в production |
| **python-dotenv** | 1.2 | Загрузка .env-файлов |
| **drf-spectacular** | 0.29 | Авто-генерация OpenAPI/Swagger документации |
| **django-cors-headers** | 4.9 | CORS для фронтенда |
| **pywebpush / py-vapid** | 2.0+ / 1.9+ | Web Push уведомления (VAPID) |
| **sentry-sdk** | 2.0+ | Мониторинг ошибок (Django-интеграция) |

### Системные зависимости (Docker)

```
libpq-dev libjpeg62-turbo-dev zlib1g-dev cron libmagic1 libgl1 libglib2.0-0
```

---

## Frontend

| Технология | Версия | Назначение |
|-----------|--------|-----------|
| **React** | 19 | UI-фреймворк |
| **Vite** | 6.3 | Сборщик и dev-сервер |
| **Tailwind CSS** | 3.4 | Utility-first CSS |
| **React Router DOM** | 7.6 | Клиентский роутинг, route guards |
| **Axios** | 1.10 | HTTP-клиент (interceptors для JWT refresh) |
| **Headless UI** | 2.2 | Доступные UI-компоненты (модалки, dropdown, transition) |
| **Lucide React** | 0.525 | Иконки |
| **@hello-pangea/dnd** | 18 | Drag & Drop (сортировка элементов) |
| **react-hot-toast** | 2.5 | Уведомления (toast) |
| **qrcode.react** | 4.2 | Генерация QR-кодов |
| **@sentry/react** | 10.47 | Мониторинг ошибок на фронте |
| **vite-plugin-svgr** | 4.3 | SVG как React-компоненты |
| **PostCSS** | 8.5 | CSS-процессинг (Tailwind) |
| **Autoprefixer** | 10.4 | Вендорные CSS-префиксы |
| **Node.js** | 20 | Сборка (multi-stage Docker) |

---

## Инфраструктура и деплой

| Технология | Назначение |
|-----------|-----------|
| **Docker** | Контейнеризация (backend: `python:3.13-slim`, frontend: multi-stage `node:20-alpine` → `nginx:alpine`) |
| **Docker Compose** | Оркестрация (dev, prod, staging — отдельные файлы) |
| **Traefik** | Reverse proxy, TLS (Let's Encrypt), роутинг по path-prefix |
| **Nginx** | Раздача фронтенда внутри контейнера |
| **GitHub Actions** | CI/CD (тесты → сборка образов → push в registry → deploy) |
| **Self-hosted Docker Registry** | Хранение образов (htpasswd auth, порт 5000) |
| **Blue-green deploy** | Zero-downtime деплой production (`deploy.sh`) |

### Контейнеры

| Сервис | Образ | Порт |
|--------|-------|------|
| backend | `python:3.13-slim` + Daphne | 8040 |
| frontend | `nginx:alpine` | 80 |
| redis | `redis:7-alpine` | 6379 |

### Сети (Docker)

- `proxy` — внешняя, Traefik ↔ контейнеры
- `internal` — изолированная, backend ↔ Redis
- `default` — связь между backend и frontend

---

## Аутентификация и авторизация

| Компонент | Реализация |
|-----------|-----------|
| **Аутентификация** | JWT (SimpleJWT), email вместо username, `USERNAME_FIELD = "email"` |
| **Токены** | Access + Refresh, rotation + blacklist |
| **RBAC** | Кастомная система: `OrgPermission` (атомарные права) + `OrgRole` (роли с M2M к пермишенам) |
| **Иерархия ролей** | `OrgRole.parent_role` (FK на self), auto-computed `level` |
| **Проверка прав** | `has_org_permission(user, code)`, DRF permission-классы, фабрики `require_permission()` / `require_read_write()` |
| **Multi-tenant** | Все модели скоупятся по `company` FK, фильтрация по `request.user.company` |
| **Frontend guards** | `<RequireAuth>`, `<RequirePermission code="...">` (React Router) |

---

## WebSocket (Real-time)

| Компонент | Реализация |
|-----------|-----------|
| **Протокол** | WebSocket через Django Channels (ASGI) |
| **Channel layer** | Redis (`channels-redis`) |
| **Паттерн** | Group broadcast по `company_{id}_updates` |
| **Backend** | `BroadcastMixin` — автоматическая рассылка при CRUD |
| **Frontend** | Хук `useRealtimeUpdates(entities, callback)` — подписка на entity-типы |
| **Payload** | `{entity, action, id, user_id}` |

---

## AI-интеграции

| Сервис | Назначение | Библиотека |
|--------|-----------|-----------|
| **DeepSeek API** | Генерация и улучшение карточек учебников | `httpx` (sync POST к `api.deepseek.com/v1/chat/completions`) |
| **Qwen VL** | AI-сравнение фото в чек-листах (второй этап после SSIM) | `httpx` |

---

## Мониторинг

| Сервис | Где | Назначение |
|--------|-----|-----------|
| **Sentry** | Backend (`sentry-sdk[django]`) + Frontend (`@sentry/react`) | Отслеживание ошибок |
| **Docker Healthcheck** | Backend + Frontend | Проверка доступности контейнеров |
| **GitHub Actions health-check** | CI/CD | curl после деплоя |

---

## Паттерны проектирования

| Паттерн | Описание |
|---------|----------|
| **Multi-tenant** | Все данные скоупятся по `company` FK, изоляция на уровне ORM |
| **Feature toggles** | `Company*Settings` (OneToOne к Company) — включение/отключение модулей |
| **Модульность** | Каждый домен — отдельное Django app (`core`, `checklists`, `textbooks`, `feedback`) со своими моделями, views, permissions, urls |
| **BroadcastMixin** | Автоматический WebSocket broadcast при CUD-операциях |
| **CompanyScopedCreateMixin** | Автоподстановка `company` из `request.user` при создании объектов |
| **Иерархические назначения** | Unit → Department → OrgRole — гранулярная привязка данных к оргструктуре |
| **Двухэтапная верификация** | Фото: SSIM (локально) → Qwen VL (AI, облако) |
| **Seed-команды** | Management-команды для создания начальных данных (`seed_permissions`, `seed_feedback_questions`) |

---

## Структура проекта

```
├── config/                     # Django settings/urls для Docker
├── SOBack/
│   ├── config/                 # Django settings/urls для локальной разработки
│   ├── apps/
│   │   ├── core/               # Оргструктура, расписание, пермишены, WebSocket
│   │   ├── checklists/         # Чек-листы с фото-верификацией
│   │   ├── textbooks/          # База знаний + AI-генерация
│   │   └── feedback/           # Отзывы, агрегация из внешних источников
│   ├── Dockerfile
│   └── entrypoint.sh
├── SOFront/
│   ├── src/
│   │   ├── api/                # Axios-обёртки по доменам
│   │   ├── components/         # Переиспользуемые компоненты
│   │   ├── context/            # AuthContext, route guards
│   │   ├── pages/              # Страницы по модулям
│   │   └── utils/              # Хелперы
│   ├── Dockerfile
│   └── nginx.conf
├── docker-compose.yml          # Dev
├── docker-compose.prod.yml     # Production
├── docker-compose.staging.yml  # Staging
├── deploy.sh                   # Blue-green deploy
├── requirements.txt            # Python-зависимости
└── .github/workflows/ci.yml    # CI/CD
```

---

## Минимальный набор для воспроизведения

### Backend
```
Django==5.2
djangorestframework==3.16
djangorestframework-simplejwt==5.5
channels==4.3
channels-redis==4.3
daphne==4.2
psycopg[binary]==3.3
django-cors-headers==4.9
python-dotenv==1.2
Pillow>=10.0
```

### Frontend
```json
{
  "react": "^19",
  "react-dom": "^19",
  "react-router-dom": "^7",
  "axios": "^1.10",
  "tailwindcss": "^3.4",
  "vite": "^6",
  "@vitejs/plugin-react": "^4"
}
```

### Инфраструктура
- PostgreSQL 16
- Redis 7
- Docker + Docker Compose
- Reverse proxy (Traefik / Nginx)
