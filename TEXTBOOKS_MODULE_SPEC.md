# Модуль «Учебники» (Textbooks) — Полная спецификация для реализации

## Оглавление

1. [Обзор модуля](#1-обзор-модуля)
2. [Архитектура и зависимости](#2-архитектура-и-зависимости)
3. [Модели данных (Backend)](#3-модели-данных-backend)
4. [API Endpoints](#4-api-endpoints)
5. [Сериализаторы](#5-сериализаторы)
6. [Views (ViewSets и APIView)](#6-views)
7. [Система прав](#7-система-прав)
8. [Поиск](#8-поиск)
9. [AI-генерация (DeepSeek)](#9-ai-генерация)
10. [WebSocket / Real-time](#10-websocket--real-time)
11. [Django Admin](#11-django-admin)
12. [Frontend — API-слой](#12-frontend--api-слой)
13. [Frontend — Страницы](#13-frontend--страницы)
14. [Frontend — Роутинг](#14-frontend--роутинг)
15. [Seed-данные (пермишены)](#15-seed-данные)
16. [Конфигурация Django](#16-конфигурация-django)

---

## 1. Обзор модуля

Модуль «Учебники» — это банк знаний для персонала ресторана/бара. Позволяет:

- Создавать **карточки знаний** (напр. описание вина, коктейля, блюда) с параграфами, фото, тегами
- Организовывать карточки по **разделам** и **категориям** (напр. "Вино" → "Красные вина")
- **Назначать** карточки подразделениям (юнит → департамент → роль)
- **Генерировать** карточки с помощью AI (DeepSeek API)
- **Улучшать** тексты существующих карточек через AI
- **Искать** по карточкам с fuzzy-matching
- Получать **real-time обновления** через WebSocket

### Ключевые принципы
- **Multi-tenant**: все данные скоупятся по `company` FK
- **Feature toggle**: модуль включается/выключается через `CompanyTextbookSettings`
- **Иерархическое назначение**: карточка → юнит → (опц.) департамент → (опц.) роль
- **Двухтипные параграфы**: `front` (видно сразу) и `detail` (раскрывается по клику)

---

## 2. Архитектура и зависимости

### Backend-стек
- Django 5.2 + DRF 3.16 + Channels 4.3
- PostgreSQL, Redis 7
- httpx (для вызовов DeepSeek API)
- python-magic (валидация MIME-типов фото)

### Зависимости от других модулей (core)
- `Company` — компания (tenant)
- `CustomUser` — пользователь (email-based, JWT auth)
- `Unit` — юнит (заведение)
- `Department` — департамент внутри юнита
- `OrgRole` — организационная роль
- `Employee` / `EmployeeAssignment` — привязка сотрудника к юнит/департамент/роль
- `OrgPermission` — именованные пермишены
- `has_org_permission()` — функция проверки прав
- `_is_full_access()` — проверка superuser/owner
- `CompanyScopedCreateMixin` — миксин для автоподстановки company
- `BroadcastMixin` — миксин для WebSocket-уведомлений

### Структура файлов

```
apps/textbooks/
├── __init__.py
├── apps.py                    # AppConfig: name="apps.textbooks"
├── models.py                  # 8 моделей
├── serializers.py             # ~15 сериализаторов
├── views.py                   # 9 views/viewsets
├── urls.py                    # DRF router + path()
├── permissions.py             # 5 permission-классов
├── permissions_utils.py       # Утилиты проверки прав на уровне объекта
├── search.py                  # Fuzzy-поиск по карточкам
├── ai_generate.py             # Интеграция с DeepSeek API
├── admin.py                   # Django Admin
└── migrations/
```

---

## 3. Модели данных (Backend)

### 3.1 CompanyTextbookSettings (Toggle)

```python
class CompanyTextbookSettings(models.Model):
    company = models.OneToOneField("core.Company", on_delete=CASCADE, related_name="textbook_settings")
    is_enabled = models.BooleanField("Модуль включён", default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "textbook_settings"
```

**Назначение**: включение/отключение модуля для конкретной компании. Проверяется в каждом permission-классе.

### 3.2 TextbookSection (Раздел)

```python
class TextbookSection(models.Model):
    company = models.ForeignKey("core.Company", on_delete=CASCADE, related_name="textbook_sections")
    units = models.ManyToManyField("core.Unit", blank=True, related_name="textbook_sections")
    name = models.CharField(max_length=200)
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "textbook_sections"
        ordering = ["order", "name"]
        unique_together = ("company", "name")
```

**Назначение**: верхний уровень организации карточек (напр. "Вино", "Коктейли", "Кухня").
**M2M к units**: обычные пользователи видят только разделы, назначенные их юнитам.

### 3.3 TextbookCategory (Категория)

```python
class TextbookCategory(models.Model):
    section = models.ForeignKey(TextbookSection, on_delete=CASCADE, related_name="categories")
    name = models.CharField(max_length=200)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "textbook_categories"
        ordering = ["order", "name"]
        unique_together = ("section", "name")
```

**Назначение**: подгруппа внутри раздела (напр. "Красные вина" в разделе "Вино").

### 3.4 TextbookCard (Карточка знаний) — ЯДРО

```python
class TextbookCard(models.Model):
    company = models.ForeignKey("core.Company", on_delete=CASCADE, related_name="textbook_cards")
    section = models.ForeignKey(TextbookSection, on_delete=SET_NULL, null=True, blank=True, related_name="cards")
    category = models.ForeignKey(TextbookCategory, on_delete=SET_NULL, null=True, blank=True, related_name="cards")
    name = models.CharField(max_length=300, db_index=True)
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey("core.CustomUser", on_delete=SET_NULL, null=True, blank=True, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    ai_generated = models.BooleanField(default=False)

    class Meta:
        db_table = "textbook_cards"
        ordering = ["order", "name"]
        indexes = [models.Index(fields=["company", "section", "category"])]
```

**Ключевые решения**:
- `section` и `category` — SET_NULL: при удалении раздела/категории карточка не теряется, просто становится «без раздела»
- `ai_generated` — маркер AI-генерации (для UI-бейджа)
- `created_by` — для проверки прав на удаление (создатель может удалить)

### 3.5 CardParagraph (Параграф карточки)

```python
class CardParagraph(models.Model):
    class ParagraphType(models.TextChoices):
        FRONT = "front", "Основной"
        DETAIL = "detail", "Подробность"

    card = models.ForeignKey(TextbookCard, on_delete=CASCADE, related_name="paragraphs")
    paragraph_type = models.CharField(max_length=10, choices=ParagraphType.choices, default="front")
    label = models.CharField(max_length=200)       # Заголовок параграфа
    text = models.TextField()                        # Текст параграфа
    order = models.PositiveIntegerField(default=0)
    photo = models.ImageField(upload_to=paragraph_photo_upload_path, null=True, blank=True)

    class Meta:
        db_table = "textbook_card_paragraphs"
        ordering = ["card", "paragraph_type", "order"]
```

**Upload path**: `textbook_paragraph_photos/{card_id}/{uuid}.{ext}`

**Два типа**:
- `front` — отображается сразу на странице карточки (основная информация)
- `detail` — скрыт за аккордеоном, раскрывается по клику (подробности)

### 3.6 CardTag (Тег)

```python
class CardTag(models.Model):
    card = models.ForeignKey(TextbookCard, on_delete=CASCADE, related_name="tags")
    tag = models.CharField(max_length=100, db_index=True)

    class Meta:
        db_table = "textbook_card_tags"
        unique_together = ("card", "tag")
```

**Назначение**: поисковые теги, нормализованные (lowercase). Используются в поиске и отображаются как бейджи.

### 3.7 CardPhoto (Фото карточки)

```python
class CardPhoto(models.Model):
    card = models.ForeignKey(TextbookCard, on_delete=CASCADE, related_name="photos")
    file = models.ImageField(upload_to=card_photo_upload_path)
    order = models.PositiveIntegerField(default=0)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "textbook_card_photos"
        ordering = ["order", "uploaded_at"]
```

**Upload path**: `textbook_photos/{card_id}/{uuid}.{ext}`

### 3.8 CardAssignment (Назначение карточки)

```python
class CardAssignment(models.Model):
    card = models.ForeignKey(TextbookCard, on_delete=CASCADE, related_name="assignments")
    unit = models.ForeignKey("core.Unit", on_delete=CASCADE, related_name="textbook_assignments")
    department = models.ForeignKey("core.Department", on_delete=CASCADE, null=True, blank=True)
    org_role = models.ForeignKey("core.OrgRole", on_delete=CASCADE, null=True, blank=True)
    assigned_by = models.ForeignKey("core.CustomUser", on_delete=SET_NULL, null=True, blank=True, related_name="+")
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "textbook_card_assignments"
        constraints = [
            models.UniqueConstraint(
                fields=["card", "unit", "department", "org_role"],
                name="unique_card_assignment",
                nulls_distinct=False,  # PostgreSQL: NULL = NULL для unique
            ),
        ]
```

**Иерархия назначений**:
- `unit` (обязательно) — карточка доступна всем сотрудникам юнита
- `unit + department` — только сотрудникам конкретного департамента
- `unit + department + org_role` — только конкретной роли в департаменте

**nulls_distinct=False** — PostgreSQL-фича: не позволяет создать два назначения с одинаковыми card+unit, где department и org_role оба NULL.

### 3.9 AIUsageLog (Лог AI-запросов)

```python
class AIUsageLog(models.Model):
    company = models.ForeignKey("core.Company", on_delete=CASCADE, related_name="ai_usage_logs")
    user = models.ForeignKey("core.CustomUser", on_delete=SET_NULL, null=True, blank=True, related_name="+")
    action = models.CharField(max_length=50)           # "generate", "custom", "enhance"
    prompt_tokens = models.PositiveIntegerField(default=0)
    completion_tokens = models.PositiveIntegerField(default=0)
    total_tokens = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "textbook_ai_usage_logs"
        ordering = ["-created_at"]
```

**Назначение**: учёт расходов на AI по компаниям. Используется в view DeepSeekBalanceView для расчёта стоимости.

---

## 4. API Endpoints

Базовый префикс: `/api/textbooks/`

### Router-эндпоинты (DRF DefaultRouter)

| Эндпоинт | ViewSet | Методы |
|----------|---------|--------|
| `sections/` | TextbookSectionViewSet | GET, POST |
| `sections/{id}/` | TextbookSectionViewSet | GET, PUT, PATCH, DELETE |
| `categories/` | TextbookCategoryViewSet | GET, POST |
| `categories/{id}/` | TextbookCategoryViewSet | GET, PUT, PATCH, DELETE |
| `cards/` | TextbookCardViewSet | GET, POST |
| `cards/{id}/` | TextbookCardViewSet | GET, PUT, PATCH, DELETE |
| `cards/my-available/` | TextbookCardViewSet (action) | GET |
| `cards/reorder/` | TextbookCardViewSet (action) | POST |
| `paragraphs/` | CardParagraphViewSet | GET, POST |
| `paragraphs/{id}/` | CardParagraphViewSet | GET, PUT, PATCH, DELETE |
| `paragraphs/{id}/upload-photo/` | CardParagraphViewSet (action) | POST |
| `paragraphs/{id}/delete-photo/` | CardParagraphViewSet (action) | DELETE |
| `card-photos/` | CardPhotoViewSet | GET, POST |
| `card-photos/{id}/` | CardPhotoViewSet | GET, PUT, PATCH, DELETE |
| `assignments/` | CardAssignmentViewSet | GET, POST |
| `assignments/{id}/` | CardAssignmentViewSet | GET, DELETE |
| `assignments/bulk-delete/` | CardAssignmentViewSet (action) | POST |

### Path-эндпоинты (APIView)

| Эндпоинт | View | Метод | Назначение |
|----------|------|-------|-----------|
| `settings/` | TextbookSettingsView | GET | Статус модуля (включён/выключен) |
| `search/` | SearchView | GET | Fuzzy-поиск по карточкам |
| `ai-generate/` | AIGenerateView | POST | Генерация карточки через AI |
| `ai-enhance/` | AIEnhanceView | POST | Улучшение текста через AI |
| `ai-balance/` | DeepSeekBalanceView | GET | Баланс DeepSeek + расход компании |

---

## 5. Сериализаторы

### CompanyScopedCreateMixin (из core)

```python
class CompanyScopedCreateMixin:
    """Подставляет company из request.user при create()."""
    def create(self, validated_data):
        request = self.context.get("request")
        if request and getattr(request.user, "company_id", None):
            model = self.Meta.model
            if any(f.name == "company" for f in model._meta.fields):
                validated_data["company"] = request.user.company
        return super().create(validated_data)
```

### Валидация изображений

```python
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB

def validate_image_file(value):
    # 1. Проверка расширения
    # 2. Проверка размера (макс. 20 MB)
    # 3. Проверка MIME-типа через python-magic (если доступен)
```

### Основные сериализаторы

| Сериализатор | Модель | Назначение |
|-------------|--------|-----------|
| `TextbookSettingsSerializer` | CompanyTextbookSettings | read-only, поле `enabled` |
| `TextbookSectionSerializer` | TextbookSection | чтение (+ `categories_count`, `cards_count`) |
| `TextbookSectionWriteSerializer` | TextbookSection | создание/обновление (+ CompanyScopedCreateMixin) |
| `TextbookCategorySerializer` | TextbookCategory | чтение (+ `cards_count`, `section_name`) |
| `TextbookCategoryWriteSerializer` | TextbookCategory | создание/обновление |
| `CardParagraphSerializer` | CardParagraph | чтение (+ `photo` URL через SerializerMethodField) |
| `CardTagSerializer` | CardTag | чтение |
| `CardPhotoSerializer` | CardPhoto | чтение + валидация файла |
| `CardAssignmentSerializer` | CardAssignment | чтение (+ вложенные имена unit/dept/role, `first_photo`) |
| `CardAssignmentWriteSerializer` | CardAssignment | создание |
| `TextbookCardListSerializer` | TextbookCard | список (+ `first_photo`, `photos_count`, `tags` через SlugRelatedField) |
| `TextbookCardDetailSerializer` | TextbookCard | детали (+ вложенные paragraphs, tags, photos, assignments, `can_edit`) |
| `TextbookCardWriteSerializer` | TextbookCard | создание/обновление (+ inline paragraphs_data, tags_data) |
| `AIGenerateRequestSerializer` | — | валидация запроса AI-генерации |
| `AIEnhanceRequestSerializer` | — | валидация запроса AI-улучшения |

### TextbookCardWriteSerializer — ключевая логика

**create()**:
1. Извлекает `paragraphs_data` и `tags_data` из validated_data
2. Подставляет `created_by = request.user`
3. Создаёт карточку
4. Создаёт параграфы (CardParagraph) в цикле
5. Создаёт теги (CardTag.get_or_create, нормализация lowercase)

**update()**:
1. Если пришли `paragraphs_data` — удаляет все старые параграфы и создаёт заново
   - Сохраняет фото старых параграфов по `order` для переноса (если `has_photo=True`)
2. Если пришли `tags_data` — удаляет все старые теги и создаёт заново

### ParagraphInlineSerializer (для inline-создания)

```python
class ParagraphInlineSerializer(serializers.Serializer):
    paragraph_type = ChoiceField(choices=["front", "detail"], default="front")
    label = CharField(max_length=200, allow_blank=True, default="")
    text = CharField(allow_blank=True, default="")
    order = IntegerField(default=0)
    has_photo = BooleanField(default=False)  # маркер: сохранять ли фото при update
```

---

## 6. Views

### BroadcastMixin (из core)

Автоматически отправляет WebSocket-уведомления при CUD-операциях:
```python
class BroadcastMixin:
    broadcast_entity = None  # строка, напр. "textbook_card"

    # Автоматически при:
    # - create (201) → broadcast "created"
    # - update/partial_update (200) → broadcast "updated"
    # - destroy (204) → broadcast "deleted"

    def _broadcast(self, action, entity_id=None, extra=None):
        # Ручной вызов для кастомных actions (напр. reorder)
```

### TextbookSettingsView

```
GET /api/textbooks/settings/
Response: {"enabled": true/false}
```

Проверяет наличие `company.textbook_settings` и его `is_enabled`.

### TextbookSectionViewSet

- **broadcast_entity**: `"textbook_section"`
- **pagination_class**: `None` (все разделы одним запросом)
- **get_queryset()**: фильтр по company + фильтр по units для обычных пользователей
- **perform_create()**: автоматически привязывает section к юнитам текущего пользователя
- **Query params**: `?all_companies=true` (только для superuser)

### TextbookCategoryViewSet

- **broadcast_entity**: `"textbook_category"`
- **get_queryset()**: фильтр по `section__company` + units
- **Query params**: `?section=ID`, `?all_companies=true`

### TextbookCardViewSet

- **broadcast_entity**: `"textbook_card"`
- **parser_classes**: `[JSONParser, MultiPartParser, FormParser]`
- **get_queryset()**:
  - Superuser/owner → все карточки компании
  - Пользователь с `textbooks.manage_all` или `textbooks.edit` → все карточки компании
  - Обычный пользователь → только карточки, назначенные его юнитам через `assignments`
- **perform_create()**: если карточка привязана к секции → автоматически создаёт CardAssignment для всех юнитов секции
- **destroy()**: проверяет `can_delete_card()` — только создатель или админ
- **Query params**: `?section=ID`, `?category=ID`, `?all_companies=true`

**Кастомные actions**:
- `GET /cards/my-available/?unit=ID` — карточки, назначенные подразделениям текущего сотрудника с учётом иерархии (unit → department → role)
- `POST /cards/reorder/` — обновление порядка: `{"items": [{"id": 1, "order": 0}, ...]}`

### CardParagraphViewSet

- **parser_classes**: `[JSONParser, MultiPartParser, FormParser]`
- **Кастомные actions**:
  - `POST /paragraphs/{id}/upload-photo/` — загрузка фото параграфа (multipart, поле `file`)
  - `DELETE /paragraphs/{id}/delete-photo/` — удаление фото параграфа

### CardPhotoViewSet

- **parser_classes**: `[MultiPartParser, FormParser, JSONParser]`
- **Query params**: `?card=ID`

### CardAssignmentViewSet

- **http_method_names**: `["get", "post", "delete"]` (без PUT/PATCH)
- **perform_create()**: проверяет `can_assign_card()` — пользователь может назначать только своим юнитам/департаментам
- **Кастомные actions**:
  - `POST /assignments/bulk-delete/` — удаление всех назначений по юниту (+ опционально департаменту): `{"unit": 1, "department": 2}`
- **Query params**: `?unit=ID`, `?department=ID`, `?org_role=ID`, `?card=ID`

### SearchView

```
GET /api/textbooks/search/?q=бомбей&section=1
Response: [{"id": 1, "name": "Bombay Sapphire", "section_name": "...", "category_name": "...", "first_photo": "...", "score": 0.95}]
```

### AIGenerateView

```
POST /api/textbooks/ai-generate/
Body (mode="generate"): {"name": "Bombay Sapphire", "prompt": "...", "mode": "generate"}
Body (mode="custom"):   {"name": "Дивия", "mode": "custom", "composition": "...", "taste": "...", "serving": "..."}
Response: {"name": "...", "section": "...", "category": "...", "section_id": 1, "category_id": 2, "paragraphs": [...], "tags": [...]}
```

Логика:
1. Собирает каталог разделов/категорий компании
2. Вызывает DeepSeek API с соответствующим промтом
3. Логирует использование в AIUsageLog
4. Маппит названия section/category из AI-ответа на ID реальных объектов

### AIEnhanceView

```
POST /api/textbooks/ai-enhance/
Body: {"paragraphs": [{"label": "...", "text": "...", "paragraph_type": "front"}, ...]}
Response: {"paragraphs": [{"label": "...", "text": "улучшенный текст", "paragraph_type": "front"}, ...]}
```

### DeepSeekBalanceView

```
GET /api/textbooks/ai-balance/
Response: {
    "balance": {"total_balance": "10.00", "currency": "USD"},
    "company_usage": {"total_tokens": 12345, "estimated_cost": 0.0123, "currency": "USD"}
}
```

Доступен только для superuser/developer. Запрашивает баланс через DeepSeek API + считает расход компании из AIUsageLog.

---

## 7. Система прав

### Именованные пермишены (seed)

| Код | Название | Описание |
|-----|---------|-----------|
| `textbooks.view` | Просматривать учебники | Чтение карточек, назначенных подразделениям сотрудника |
| `textbooks.edit` | Редактировать карточки | Создание/редактирование содержания карточек |
| `textbooks.manage_assignments` | Распределять карточки | Назначение карточек подразделениям |
| `textbooks.manage_all` | Полный доступ | Полный доступ ко всем операциям |

### Permission-классы

```python
# Базовый — проверяет модуль включён
class TextbookModuleEnabled(BasePermission):
    # Superuser/owner → всегда True
    # Иначе → company.textbook_settings.is_enabled

# Базовый с пермишеном
class TextbookPermission(TextbookModuleEnabled):
    permission_code = ""
    # Проверяет: модуль включён + has_org_permission(user, code)

# Конкретные классы
class CanViewTextbooks(TextbookPermission):       # textbooks.view
class CanEditTextbooks(TextbookPermission):       # textbooks.edit
class CanManageAssignments(TextbookPermission):   # textbooks.manage_assignments
class CanManageAllTextbooks(TextbookPermission):  # textbooks.manage_all
```

### Object-level permissions (permissions_utils.py)

```python
def can_edit_card(user, card):
    # superuser/owner → да
    # manage_all → да
    # edit + карточка назначена юниту/департаменту пользователя → да

def can_delete_card(user, card):
    # superuser/owner → да
    # manage_all → да
    # created_by == user → да (создатель может удалить)

def can_assign_card(user, target_unit_id, target_department_id):
    # superuser/owner → да
    # manage_all → да
    # manage_assignments + target юнит/департамент принадлежит пользователю → да
```

### Вспомогательные функции

```python
def _get_user_unit_ids(user):
    # set unit_id из EmployeeAssignment

def _get_user_department_ids(user):
    # set department_id из EmployeeAssignment

def _get_managed_department_ids(user):
    # set department_id, где пользователь — руководитель через OrgRole.parent_role
```

---

## 8. Поиск

Файл: `search.py`

### Алгоритм

1. **Queryset**: `TextbookCard.filter(company, is_active=True)` + scope по правам
2. **Haystack**: для каждой карточки собирается строка из: `name + section.name + category.name + tags + paragraphs (label + text)`
3. **Tokenize**: `query.lower().split()`
4. **Scoring** (для каждого токена запроса):
   - Exact token match → 1.0
   - Substring match → 0.85
   - Fuzzy (SequenceMatcher ≥ 0.75) → ratio * 0.8
5. **Threshold**: score ≥ 0.5
6. **Сортировка**: по score desc
7. **Лимит**: 50 результатов

### Результат

```json
[{
    "id": 1,
    "name": "Bombay Sapphire",
    "section_name": "Крепкий алкоголь",
    "category_name": "Джин",
    "first_photo": "/media/textbook_photos/1/abc.jpg",
    "score": 0.95
}]
```

---

## 9. AI-генерация

Файл: `ai_generate.py`

### Общая архитектура

```
Frontend → POST /ai-generate/ → AIGenerateView → ai_generate.py → DeepSeek API → JSON-ответ → Frontend
```

### DeepSeek API

```python
DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions"

def _call_deepseek(system_prompt, messages):
    # Модель: settings.DEEPSEEK_MODEL (по умолчанию "deepseek-chat")
    # Temperature: 0.7
    # response_format: {"type": "json_object"}
    # Timeout: 60 секунд
    # Возвращает: (parsed_json, usage_dict)
```

### Django Settings (необходимые)

```python
DEEPSEEK_API_KEY = "sk-..."      # API-ключ DeepSeek
DEEPSEEK_MODEL = "deepseek-chat"  # Модель (опционально, по умолчанию deepseek-chat)
```

### Три режима генерации

#### 1. Полная генерация (generate)

**Функция**: `generate_card_sync(position_name, user_prompt, catalog)`

**Для**: вино, крепкий алкоголь, саке, пиво — известные позиции, AI генерирует всё по названию.

**Системный промт** (GENERATE_SYSTEM_PROMPT):
- Создаёт учебную карточку для персонала ресторана
- Исправляет сокращения/ошибки в названии ("чивас" → "Chivas Regal 12")
- Структура по категориям: вино (вкус, регион, сорт, объём + описание, история, производство, факты), саке, крепкий алкоголь, пиво/сидр
- Возвращает JSON: `{name, section, category, paragraphs: [{label, text, paragraph_type}], tags}`
- Раздел/категория выбираются из переданного каталога компании
- Теги включают транслитерацию названия (латиница ↔ кириллица)

#### 2. Авторская позиция (custom)

**Функция**: `generate_custom_card_sync(position_name, composition, taste, serving, user_prompt, catalog)`

**Для**: коктейли, блюда, чаи, лимонады, соусы — пользователь даёт сырые данные, AI оформляет.

**Системный промт** (CUSTOM_SYSTEM_PROMPT):
- Берёт состав и вкус из данных пользователя → front-параграфы
- Генерирует: красочное описание, подача, рекомендация → detail-параграфы
- Структуры: коктейли/моктейли, лимонады, чай, блюда, соусы
- НЕ выдумывает состав — только то, что дал пользователь

#### 3. Улучшение текста (enhance)

**Функция**: `enhance_card_sync(paragraphs)`

**Для**: улучшение уже написанных текстов.

**Системный промт** (ENHANCE_SYSTEM_PROMPT):
- Делает формулировки красочнее и продающими
- НЕ меняет суть, факты, состав
- НЕ добавляет/удаляет параграфы
- Изменяет только поле `text`, сохраняя `label` и `paragraph_type`

### Каталог разделов/категорий

Перед вызовом AI собирается каталог текущих разделов/категорий компании:
```python
def _build_catalog(company):
    # [{"name": "Вино", "categories": ["Красные", "Белые"]}, ...]

def _format_catalog(catalog):
    # "Каталог разделов и категорий:\n  Вино: Красные, Белые\n  Коктейли: Классика"
```

### Маппинг AI-ответа на ID

```python
def _resolve_section_category(result, company):
    # AI возвращает названия (строки), маппим на ID:
    # section_name → TextbookSection.objects.filter(name__iexact=...) → section_id
    # category_name → TextbookCategory.objects.filter(name__iexact=...) → category_id
```

### Расчёт стоимости

```python
# Цены DeepSeek (USD за 1M токенов)
INPUT_PRICE_PER_M = 0.27
OUTPUT_PRICE_PER_M = 1.10

company_cost = (prompt_tokens * 0.27 + completion_tokens * 1.10) / 1_000_000
```

---

## 10. WebSocket / Real-time

### BroadcastMixin

Каждый ViewSet с `BroadcastMixin` автоматически отправляет уведомления при CRUD:

```python
# Канал: f"company_{company_id}_updates"
# Payload: {"entity": "textbook_card", "action": "created/updated/deleted", "id": 123, "user_id": 456}
```

### Entity-типы для учебников:
- `textbook_section`
- `textbook_category`
- `textbook_card`

### Фронтенд — useRealtimeUpdates

```javascript
useRealtimeUpdates(
    ["textbook_card", "textbook_section", "textbook_category"],
    () => { /* перезагрузка данных */ },
);
```

При получении WebSocket-сообщения с matching entity — вызывает callback для обновления данных.

---

## 11. Django Admin

```python
@admin.register(CompanyTextbookSettings)
class CompanyTextbookSettingsAdmin(ModelAdmin):
    list_display = ("company", "is_enabled", "created_at")
    list_filter = ("is_enabled",)
    list_editable = ("is_enabled",)  # Можно включать/выключать прямо из списка

@admin.register(TextbookCard)
class TextbookCardAdmin(ModelAdmin):
    list_display = ("name", "section", "category", "is_active", "ai_generated", "created_at")
    inlines = [CardParagraphInline, CardPhotoInline]  # Параграфы и фото внутри карточки

@admin.register(CardAssignment)
class CardAssignmentAdmin(ModelAdmin):
    list_display = ("card", "unit", "department", "assigned_at")
```

---

## 12. Frontend — API-слой

Файл: `src/api/textbooks.js`

```javascript
import axiosInstance from "./axiosInstance";
const BASE = "textbooks/";

// Settings
export const getTextbookSettings = () => axiosInstance.get(`${BASE}settings/`);

// Sections CRUD
export const getSections = (params) => axiosInstance.get(`${BASE}sections/`, { params });
export const createSection = (data) => axiosInstance.post(`${BASE}sections/`, data);
export const updateSection = (id, data) => axiosInstance.patch(`${BASE}sections/${id}/`, data);
export const deleteSection = (id) => axiosInstance.delete(`${BASE}sections/${id}/`);

// Categories CRUD
export const getCategories = (params) => axiosInstance.get(`${BASE}categories/`, { params });
export const createCategory = (data) => axiosInstance.post(`${BASE}categories/`, data);
export const updateCategory = (id, data) => axiosInstance.patch(`${BASE}categories/${id}/`, data);
export const deleteCategory = (id) => axiosInstance.delete(`${BASE}categories/${id}/`);

// Cards CRUD
export const getCards = (params) => axiosInstance.get(`${BASE}cards/`, { params });
export const getCard = (id) => axiosInstance.get(`${BASE}cards/${id}/`);
export const getMyAvailableCards = (params) => axiosInstance.get(`${BASE}cards/my-available/`, { params });
export const createCard = (data) => axiosInstance.post(`${BASE}cards/`, data);
export const updateCard = (id, data) => axiosInstance.patch(`${BASE}cards/${id}/`, data);
export const deleteCard = (id) => axiosInstance.delete(`${BASE}cards/${id}/`);
export const reorderCards = (items) => axiosInstance.post(`${BASE}cards/reorder/`, { items });

// Paragraphs
export const createParagraph = (data) => axiosInstance.post(`${BASE}paragraphs/`, data);
export const updateParagraph = (id, data) => axiosInstance.patch(`${BASE}paragraphs/${id}/`, data);
export const deleteParagraph = (id) => axiosInstance.delete(`${BASE}paragraphs/${id}/`);
export const uploadParagraphPhoto = (paragraphId, file) => {
    const fd = new FormData();
    fd.append("file", file);
    return axiosInstance.post(`${BASE}paragraphs/${paragraphId}/upload-photo/`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
    });
};
export const deleteParagraphPhoto = (paragraphId) =>
    axiosInstance.delete(`${BASE}paragraphs/${paragraphId}/delete-photo/`);

// Photos (альбом карточки)
export const getCardPhotos = (params) => axiosInstance.get(`${BASE}card-photos/`, { params });
export const uploadCardPhoto = (cardId, file) => {
    const fd = new FormData();
    fd.append("card", cardId);
    fd.append("file", file);
    return axiosInstance.post(`${BASE}card-photos/`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
    });
};
export const deleteCardPhoto = (id) => axiosInstance.delete(`${BASE}card-photos/${id}/`);

// Assignments
export const getAssignments = (params) => axiosInstance.get(`${BASE}assignments/`, { params });
export const createAssignment = (data) => axiosInstance.post(`${BASE}assignments/`, data);
export const deleteAssignment = (id) => axiosInstance.delete(`${BASE}assignments/${id}/`);
export const bulkDeleteAssignments = (data) => axiosInstance.post(`${BASE}assignments/bulk-delete/`, data);

// Search
export const searchCards = (params) => axiosInstance.get(`${BASE}search/`, { params });

// AI
export const aiGenerateCard = (data) => axiosInstance.post(`${BASE}ai-generate/`, data);
export const aiEnhanceCard = (data) => axiosInstance.post(`${BASE}ai-enhance/`, data);
export const getDeepSeekBalance = () => axiosInstance.get(`${BASE}ai-balance/`);
```

---

## 13. Frontend — Страницы

### 13.1 TextbooksPage — Мои учебники

**Путь**: `/textbooks`
**Пермишен**: `textbooks.view`

**Функционал**:
- Отображает карточки, назначенные подразделениям текущего пользователя
- Группировка: по юнитам → разделам (табы) → категориям → карточки
- **Два режима отображения**: Плитка (grid 2-3-4 колонки) и Карусель (горизонтальная прокрутка)
- **Поиск**: глобальный fuzzy-поиск с dropdown-результатами (debounce 300ms, мин. 2 символа)
- **Full-access пользователи**: загружают все юниты компании через API
- **Обычные пользователи**: юниты из `user.assignments`
- **Real-time**: подписка на `textbook_card`, `textbook_section`, `textbook_category`
- **Session bookmark**: запоминает открытую карточку в sessionStorage для возврата

**Компоненты**:
- `CardItem` — плитка карточки (фото + название + теги)
- `CategoryCarousel` — горизонтальная карусель карточек одной категории
- `UnitSection` — секция одного юнита с табами разделов

### 13.2 TextbookCardPage — Просмотр карточки

**Путь**: `/textbooks/card/:id`
**Пермишен**: `textbooks.view`

**Функционал**:
- Отображает полную карточку: фото (одно большое или альбом), front-параграфы, detail-аккордеон, теги, назначения
- **Навигация**: кнопки «Предыдущая/Следующая» по карточкам той же категории (sibling-карточки)
- **Lightbox**: полноэкранный просмотр фото (закрытие по клику, свайпу, Esc, history back)
- **AnimatedCollapse**: плавное раскрытие/закрытие деталей с CSS transition на height
- **Кнопка «Редактировать»**: если `card.can_edit = true`
- **Real-time**: подписка на `textbook_card`
- **Session bookmark**: сохраняет путь для возврата со списка

### 13.3 TextbookManagePage — Настройка учебников

**Путь**: `/textbooks/manage`
**Пермишен**: `textbooks.edit`

**Функционал**:
- **Разделы**: chips с CRUD (создание, переименование, удаление), счётчик карточек
- **Категории**: chips внутри выбранного раздела, CRUD
- **Карточки**: список с фильтрами (раздел, категория, поиск по названию)
- **Кнопки**: «Новая карточка», «Распределение» (если есть `manage_assignments`)
- **Модальное окно**: создание/редактирование раздела или категории
- **Superuser**: чекбокс «Все компании» для просмотра данных всех компаний
- **Real-time обновления**

### 13.4 TextbookCardEditPage — Создание/Редактирование карточки

**Путь**: `/textbooks/manage/card/new` или `/textbooks/manage/card/:id/edit`
**Пермишен**: `textbooks.edit`

**Функционал**:
- **AI-генерация**: чекбокс «Сгенерировать с помощью ИИ» с двумя режимами:
  - Классическая (по названию) — для вина, алкоголя
  - Авторская (с полями состав/вкус/подача) — для коктейлей, блюд
  - Дополнительный промт (опц.)
  - Результат заполняет форму ниже
- **Основные данные**: название, раздел (dropdown), категория (dropdown)
- **Фото**: альбом (drag&drop, множественная загрузка, удаление, lightbox)
- **Параграфы**: список с добавлением/удалением, каждый имеет:
  - Заголовок (label)
  - Текст (textarea)
  - Тип (front/detail — segmented control)
  - Фото (опционально, чекбокс + загрузка)
- **Теги**: chips с добавлением по Enter
- **AI-улучшение**: кнопка «Улучшить текст» — отправляет все параграфы в AI для beautification
- **Session cache**: все поля формы сохраняются в sessionStorage (не теряются при навигации)
- **Сохранение**: создание/обновление карточки + загрузка фото карточки + загрузка фото параграфов

**Поток сохранения**:
1. `createCard()` или `updateCard()` с `paragraphs_data` и `tags_data`
2. Цикл `uploadCardPhoto()` для новых фото
3. `getCard()` для получения ID параграфов → цикл `uploadParagraphPhoto()` для фото параграфов

### 13.5 TextbookAssignmentsPage — Распределение учебников

**Путь**: `/textbooks/assignments`
**Пермишен**: `textbooks.manage_assignments`

**Функционал**:
- **Дерево оргструктуры**: Юниты → Департаменты → Роли
- Каждый уровень раскрывается аккордеоном
- Показывает назначенные карточки (группированные по раздел → категория)
- **Кнопки на каждом уровне**:
  - «Назначить» → модальное окно
  - «Очистить» → удаление всех назначений уровня (с подтверждением)
- **Модальное окно назначения**:
  - Показывает все карточки банка знаний (группированные по раздел → категория)
  - Поиск по названию + фильтры (раздел, категория)
  - Поштучное назначение или «Весь раздел» / «Категорию» (bulk)
  - Визуальный маркер «Назначена» для уже назначенных
  - Удаление назначения (кнопка «Убрать»)
- **Оптимистичное удаление**: UI обновляется мгновенно, при ошибке — откат
- **Фильтр**: dropdown по юниту
- **Real-time**: подписка на `textbook_card`

---

## 14. Frontend — Роутинг

```jsx
// App.jsx
<Route path="/textbooks" element={
    <RequirePermission code="textbooks.view"><TextbooksPage /></RequirePermission>
} />
<Route path="/textbooks/card/:id" element={
    <RequirePermission code="textbooks.view"><TextbookCardPage /></RequirePermission>
} />
<Route path="/textbooks/manage" element={
    <RequirePermission code="textbooks.edit"><TextbookManagePage /></RequirePermission>
} />
<Route path="/textbooks/manage/card/new" element={
    <RequirePermission code="textbooks.edit"><TextbookCardEditPage /></RequirePermission>
} />
<Route path="/textbooks/manage/card/:id/edit" element={
    <RequirePermission code="textbooks.edit"><TextbookCardEditPage /></RequirePermission>
} />
<Route path="/textbooks/assignments" element={
    <RequirePermission code="textbooks.manage_assignments"><TextbookAssignmentsPage /></RequirePermission>
} />
```

---

## 15. Seed-данные

### Пермишены (seed_permissions command)

```python
PERMISSIONS = [
    ("textbooks.view", "Просматривать учебники (назначенные подразделениям)",
     "Позволяет читать учебники и карточки, назначенные подразделениям сотрудника."),
    ("textbooks.edit", "Редактировать карточки учебников",
     "Позволяет редактировать содержание карточек в учебниках: тексты, изображения и порядок."),
    ("textbooks.manage_assignments", "Распределять карточки по подразделениям",
     "Позволяет назначать учебные карточки подразделениям и управлять тем, кто какие карточки видит."),
    ("textbooks.manage_all", "Управлять всеми учебниками (полный доступ)",
     "Полный доступ к учебникам: создание, удаление, редактирование и распределение всех карточек."),
]
```

---

## 16. Конфигурация Django

### settings.py

```python
INSTALLED_APPS = [
    ...
    "apps.textbooks",
]

# AI (DeepSeek)
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")
```

### urls.py (project-level)

```python
urlpatterns = [
    ...
    path("api/textbooks/", include("apps.textbooks.urls")),
]
```

### apps.py

```python
class TextbooksConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.textbooks"
    verbose_name = "Учебники"
```

---

## Приложение A: Полная ER-диаграмма (текстовая)

```
Company (1) ──────┐
                   │
     ┌─────────────┼──────────────────────┐
     │             │                      │
     ▼             ▼                      ▼
CompanyTextbook  TextbookSection (M2M)  TextbookCard ──► AIUsageLog
Settings         ├── units              │
                 │                      ├── section (FK, nullable)
                 ▼                      ├── category (FK, nullable)
           TextbookCategory             ├── created_by (FK user)
                                        │
                          ┌─────────────┼─────────────┐──────────────┐
                          ▼             ▼             ▼              ▼
                    CardParagraph   CardTag      CardPhoto    CardAssignment
                    (front/detail)  (lowercase)  (album)     ├── unit (FK)
                    ├── photo                                ├── department (FK, opt)
                                                             ├── org_role (FK, opt)
                                                             └── assigned_by (FK user)
```

## Приложение B: Поток данных

### Создание карточки через AI

```
1. Пользователь вводит название + (опц.) промт
2. Frontend → POST /api/textbooks/ai-generate/
3. Backend собирает каталог разделов/категорий компании
4. Backend → DeepSeek API (system_prompt + user_message + каталог)
5. DeepSeek → JSON {name, section, category, paragraphs, tags}
6. Backend маппит section/category на ID из БД
7. Backend логирует usage в AIUsageLog
8. Backend → Frontend: обогащённый JSON с section_id, category_id
9. Frontend заполняет форму (пользователь может отредактировать)
10. Пользователь нажимает «Сохранить»
11. Frontend → POST /api/textbooks/cards/ (+ paragraphs_data, tags_data)
12. Backend создаёт Card + Paragraphs + Tags
13. Backend авто-назначает Card юнитам секции (CardAssignment)
14. Frontend → POST /api/textbooks/card-photos/ (для каждого фото)
15. Frontend → POST /api/textbooks/paragraphs/{id}/upload-photo/ (для фото параграфов)
16. WebSocket broadcast → все подписчики обновляют данные
```

### Видимость карточки для сотрудника

```
1. GET /api/textbooks/cards/my-available/?unit=1
2. Backend:
   a. Получает unit_ids, dept_ids, role_ids сотрудника из EmployeeAssignment
   b. Фильтрует карточки:
      - assignments__unit_id IN user_units AND department IS NULL AND org_role IS NULL
      - OR assignments__department_id IN user_depts AND org_role IS NULL
      - OR assignments__org_role_id IN user_roles
   c. Если full_access → показывает все карточки компании
3. Результат: список карточек, доступных сотруднику в этом юните
```
