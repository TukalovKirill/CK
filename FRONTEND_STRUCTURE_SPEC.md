# Frontend Structure Specification — Оргструктура, Учебники, Команда

Полная спецификация фронтенд-реализации для воспроизведения в другом репозитории.
Описана структура страниц, компоненты, модалки, сайдбары, формы, таблицы, паттерны взаимодействия.

---

## Оглавление

1. [Общая архитектура](#1-общая-архитектура)
2. [Layout-система](#2-layout-система)
3. [Переиспользуемые компоненты](#3-переиспользуемые-компоненты)
4. [API-слой и инфраструктура](#4-api-слой-и-инфраструктура)
5. [Страницы оргструктуры](#5-страницы-оргструктуры)
6. [Страницы команды](#6-страницы-команды)
7. [Страницы учебников](#7-страницы-учебников)

---

## 1. Общая архитектура

### Стек
- React 19 + Vite 6 + Tailwind 3
- React Router DOM 7 (BrowserRouter, вложенные Routes)
- Axios (кастомный instance с JWT interceptor)
- WebSocket (нативный, для real-time обновлений)
- react-hot-toast (уведомления)
- lucide-react (иконки)
- @headlessui/react (только для LegalModal)

### Дерево провайдеров (App.jsx)

```
DialogProvider                 ← Глобальная система alert/confirm модалок
  AuthProvider                 ← JWT-аутентификация, объект user, permissions
    Toaster                    ← react-hot-toast (позиция: bottom-right, 3000ms)
    RealtimeProvider           ← WebSocket-подключение для live-обновлений
      Routes                   ← React Router
```

### Маршрутизация

Публичные маршруты обёрнуты в `<PublicOnly>` (редирект на `/profile` если авторизован).
Приватные маршруты обёрнуты в `<RequireAuth>` → `<Layout>` → `<RequirePermission code="...">`.

| Маршрут | Компонент | Пермишен |
|---------|-----------|----------|
| `/company-settings` | `CompanySettingsPage` | `org.view` |
| `/team` | `TeamPage` | `team.view` |
| `/zones` | `ZonesPage` | `org.view` |
| `/textbooks` | `TextbooksPage` | `textbooks.view` |
| `/textbooks/card/:id` | `TextbookCardPage` | `textbooks.view` |
| `/textbooks/manage` | `TextbookManagePage` | `textbooks.edit` |
| `/textbooks/manage/card/new` | `TextbookCardEditPage` | `textbooks.edit` |
| `/textbooks/manage/card/:id/edit` | `TextbookCardEditPage` | `textbooks.edit` |
| `/textbooks/assignments` | `TextbookAssignmentsPage` | `textbooks.manage_assignments` |
| `/profile` | `ProfilePage` | (нет) |
| `/accept-invite` | `AcceptInvitePage` | (публичный, без Layout) |

### Guards

- **RequireAuth** — проверяет `loading` из AuthContext. Пока загружается — спиннер. Нет токена — редирект на `/login` с сохранением `state.from`.
- **RequirePermission** — принимает `code: string`. Нет пермишена — редирект на `/profile`.
- **PublicOnly** — если есть `accessToken` в localStorage → редирект на `/profile`.

---

## 2. Layout-система

### Layout.jsx

Единый layout для всех авторизованных страниц.

```
┌──────────────────────────────────────────────────┐
│                    Topbar (fixed, h-20, z-50)     │
├────────┬─────────────────────────────────────────┤
│        │                                         │
│ Sidebar│              <main>                     │
│ (fixed │     app-main mt-20 flex-1               │
│  left) │     overflow-y-auto p-2 sm:p-4          │
│ w-56 / │                                         │
│ w-16   │          {children / <Outlet>}          │
│        │                                         │
│        ├─────────────────────────────────────────┤
│        │              Footer (compact)           │
└────────┴─────────────────────────────────────────┘
```

**Sidebar**:
- Позиция: `fixed top-20 bottom-0 left-0 z-40`
- Ширина: `w-56` (развёрнут) / `w-16` (свёрнут). Переход: `transition-all duration-300`
- Мобильные: начинается закрытым (`-translate-x-full`), открывается по кнопке в Topbar
- Контент-фрейм: `md:ml-56` (sidebar open) / `md:ml-16` (collapsed), `transition-[margin] duration-300`
- При смене маршрута на мобильных (`< 768px`): sidebar автоматически закрывается

**Мобильный оверлей**: `fixed inset-0 bg-black/40 z-30 md:hidden` — клик закрывает sidebar.

**Тема**: dark/light, хранится в `localStorage["theme"]`, по умолчанию `"dark"`. Переключается через `document.documentElement.classList.toggle("dark")`.

### Topbar.jsx

- Позиция: `fixed top-0 left-0 right-0 z-50 h-20`
- **Слева**: кнопка-гамбургер (иконка меню, `w-10 h-10`), `absolute left-4`. CSS-анимация поворота при клике (`rotate-once`).
- **Центр**: Логотип (изображение), `cursor-pointer`, клик → `/profile`.
- **Справа** (flex row):
  - Иконка колокольчика (только мобильные `md:hidden`) → `/notifications`, красная точка если `unreadCount > 0`
  - Кнопка выхода (иконка exit) → очищает токены, редирект на `/login`

### Sidebar.jsx — Навигация

Sidebar загружает настройки модулей при монтировании (`getChecklistSettings()`, `getTextbookSettings()`, `getFeedbackSettings()`). Ссылки с `module` скрыты если модуль отключён. Ссылки с `permission` фильтруются через `hasPermission(user, code)`.

**Структура групп:**

| Ключ группы | Лейбл | Ссылки |
|-------------|--------|--------|
| `textbooks` | Учебники | `/textbooks` (textbooks.view), `/textbooks/manage` (textbooks.edit) |
| `checklists` | Чеклисты | `/checklists/fill`, `/checklists/status`, `/checklists` |
| `feedback` | Отзывы | `/feedback/submit`, `/feedback`, `/feedback/wishes`, `/feedback/templates` |
| `schedule` | График | `/preferences`, `/schedule`, `/zones`, `/master-schedule`, `/schedule/generator` |
| `company` | Настройки компании | `/company-settings`, `/team`, `/subscription` |
| `finance` | Финансы | `/dashboard` |

**Standalone-ссылки** (ниже разделителя): `/notifications` (с красной точкой), `/profile`.

**NavItem** (внутренний компонент):
- Активная ссылка: определяется по точному совпадению пути ИЛИ по prefix-совпадению (если нет более конкретной активной ссылки-сиблинга)
- Визуальный индикатор активности: `box-shadow: inset 3px 0 0` на левом крае
- Иконки: `w-5 h-5`, CSS-класс `.nav-icon` / `.active`
- Красная точка: для notifications, если есть непрочитанные

**GroupAccordion** (внутренний компонент):
- Развёрнутый sidebar: анимированный аккордеон через `scrollHeight` + `transition-[height] duration-300`. Автоматически раскрывается при переходе на дочернюю страницу.
- Свёрнутый sidebar (`w-16`): при клике/ховере — портал-попап справа от иконки (`createPortal` → `document.body`, `z-[9999]`, `min-w-[200px]`). Закрывается при клике вне.

### Footer.jsx

- Скрыт на мобильных (`hidden md:block`)
- Ссылки на юридические документы (открываются через `useLegalModal()`)
- Строка компании с ИНН/ОГРН

---

## 3. Переиспользуемые компоненты

### 3.1 Dropdown (single-select)

Кастомный выпадающий список, рендерится через `createPortal` в `document.body`.

**Props:**
```
label?: string           — подпись над кнопкой
value: string | number   — текущее значение (сравнение через String())
onChange: (value) => void — callback при выборе
options: [{value, label}] — массив вариантов
placeholder?: string     — текст-заглушка
disabled?: boolean
className?, buttonClassName?, menuClassName?
```

**Поведение:**
- Кнопка-триггер показывает лейбл выбранного или placeholder
- Меню: портал, позиционируется через `getBoundingClientRect()`, пересчитывает позицию при scroll/resize
- Максимум 7 видимых элементов (каждый `min-height: 52px`), далее скролл
- Первый элемент меню — всегда placeholder (сброс значения на `""`)
- Прозрачный backdrop `fixed inset-0 z-40` для закрытия
- Меню: `z-50`, закрытие по клику вне или выбору
- `document.body.style.overflow = "hidden"` пока открыт
- Текст в элементах переносится (word-wrap)

### 3.2 MultiDropdown (multi-select)

Мультиселект с чекбоксами, тот же портал-паттерн.

**Props:**
```
label?, values?: any[], onChange: (values) => void,
options: [{value, label}], placeholder?, disabled?,
className?, buttonClassName?, menuClassName?
```

**Поведение:**
- Summary: comma-joined лейблы выбранных, обрезка с `truncate`
- Toggle: добавляет/удаляет из массива
- Максимум 5 видимых (`ITEM_HEIGHT=40px`)
- Кастомные чекбоксы (span, не input), заливка при выделении
- Портал + backdrop + scroll lock

### 3.3 DatePicker

Кастомный date picker с текстовым вводом + календарным popup.

**Props:**
```
label?, value: string | null (YYYY-MM-DD), onChange: (ymd) => void,
placeholder?: "дд.мм.гггг", disabled?
```

**Поведение:**
- Текстовый input: принимает `dd.mm.yyyy`, авто-форматирует цифры
- Иконка календаря справа → открывает popup
- Popup порталится в `document.body`, позиционируется под input
- Три вида: `days` → `months` → `years` (клик по заголовку поднимает уровень)
- Год: страницы по 20 лет
- Сегодня: обводка. Выбранная дата: заливка.
- Enter подтверждает, Escape закрывает
- Дни недели: Пн–Вс (понедельник — первый)
- Месяцы: русские сокращения

### 3.4 ModalDialog (DialogProvider + useDialog)

Контекстная система промис-модалок, оборачивает всё приложение.

**API:**
```js
const dialog = useDialog();
await dialog.alert(title, description)        // → Promise<true>
await dialog.confirm(title, description, opts) // → Promise<boolean>
```

**options для confirm:**
- `destructive: boolean` — если true, кнопка подтверждения становится danger с иконкой Trash2
- `confirmText: string` — кастомный текст кнопки подтверждения

**Поведение:**
- Backdrop клик: false для confirm, true для alert
- `z-[100]` (выше RoleSidebar)
- `document.body.style.overflow = "hidden"`
- Один диалог одновременно (глобальный state)
- Стилизация: тёмный градиент фон, `rounded-[24px]`, border, `max-w-sm sm:max-w-md`

### 3.5 AuthImage

Аутентифицированная загрузка изображений с кешированием.

**Props:** `src, alt?, lazy?: boolean (default true), ...rest`

**Поведение:**
- Глобальный кеш blob-URL (Map на уровне модуля) + дедупликация in-flight запросов
- Максимум 4 параллельных fetch, остальные в очереди
- Fetch с заголовком `Authorization: Bearer <token>`, создаёт blob URL
- Lazy loading через `IntersectionObserver` (rootMargin: 200px), отключается `lazy=false`
- Пока грузится: пустой div с тем же className. При ошибке: пустой `<img>`.
- `React.memo`

### 3.6 PhotoGallery

Фотогалерея с лайтбоксом.

**Props:**
```
photos?: [{id, file: string}], onUpload?: (file) => Promise,
onDelete?: (photoId) => Promise, editable?: true,
multiple?: true, capture?, className?
```

**Поведение:**
- Превью: `80x80 / 96x96`, `object-cover rounded-lg`
- Ховер: кнопка удаления (красный круг с X, `opacity-0 → group-hover:opacity-100`)
- Загрузка: кнопка с dashed border и Plus иконкой
- Использует `AuthImage` для серверных URL, обычный `<img>` для blob: URL
- **Лайтбокс**: портал, полноэкранный overlay
  - Навигация: ‹ › кнопки + mouse wheel + swipe (dx>50 или dy>50 — закрытие)
  - `history.pushState` — кнопка назад в браузере закрывает лайтбокс
  - Счётчик: `{current} / {total}`

### 3.7 LegalModal + useLegalModal

- `@headlessui/react` Dialog. `z-[120]`, backdrop с blur, `max-w-4xl`, `rounded-[28px]`, скроллируемый контент `max-h-[78vh]`.
- `useLegalModal()` возвращает `{ documents, openLegalDocument(key), legalModal }`. `legalModal` — JSX для рендера.

---

## 4. API-слой и инфраструктура

### 4.1 axiosInstance

**Base URL:** `import.meta.env.VITE_API_BASE || "http://localhost:8000/api/"`

**Request interceptor:**
1. Инжектит `Authorization: Bearer <accessToken>` из localStorage
2. Инжектит `X-Dev-Context` если есть в localStorage

**Response interceptor (401):**
- Не ретраит: если уже ретраен (`_retry`) или если это сам refresh endpoint
- Система очереди: если уже идёт refresh, все 401-запросы становятся в очередь и резолвятся после refresh
- Успешный refresh: сохраняет новые токены (access + опционально refresh) в localStorage
- Неуспешный refresh: очищает все токены, reject
- Refresh вызывается через обычный `axios.post` (не axiosInstance) — избегает цикла interceptor

### 4.2 API-модули

#### org.js

| Функция | Метод | URL |
|---------|-------|-----|
| `getUnits()` | GET | `units/` |
| `createUnit(data)` | POST | `units/` |
| `updateUnit(id, data)` | PATCH | `units/{id}/` |
| `deleteUnit(id)` | DELETE | `units/{id}/` |
| `reorderUnits(ids)` | POST | `units/reorder/` — `{ids: [...]}` |
| `getDepartments(params)` | GET | `departments/` — params: `{unit}` |
| `createDepartment(data)` | POST | `departments/` |
| `updateDepartment(id, data)` | PATCH | `departments/{id}/` |
| `deleteDepartment(id)` | DELETE | `departments/{id}/` |
| `reorderDepartments(ids)` | POST | `departments/reorder/` — `{ids: [...]}` |
| `getOrgRoles(params)` | GET | `org-roles/` — params: `{department}` |
| `getOrgRole(id)` | GET | `org-roles/{id}/` |
| `getRoleHierarchy()` | GET | `org-roles/hierarchy/` |
| `createOrgRole(data)` | POST | `org-roles/` |
| `updateOrgRole(id, data)` | PATCH | `org-roles/{id}/` |
| `deleteOrgRole(id)` | DELETE | `org-roles/{id}/` |
| `getAssignableRoles()` | GET | `org-roles/assignable/` |
| `getOrgPermissions()` | GET | `org-permissions/` |

#### assignments.js

| Функция | Метод | URL |
|---------|-------|-----|
| `getAssignments(params)` | GET | `employee-assignments/` |
| `createAssignment(data)` | POST | `employee-assignments/` |
| `updateAssignment(id, data)` | PATCH | `employee-assignments/{id}/` |
| `deleteAssignment(id)` | DELETE | `employee-assignments/{id}/` |
| `bulkCreateAssignments(data)` | POST | `employee-assignments/bulk_create/` — `{employee, assignments: [...]}` |

#### textbooks.js

| Функция | Метод | URL |
|---------|-------|-----|
| `getTextbookSettings` | GET | `textbooks/settings/` |
| `getSections(params)` | GET | `textbooks/sections/` |
| `createSection(data)` | POST | `textbooks/sections/` |
| `updateSection(id, data)` | PATCH | `textbooks/sections/{id}/` |
| `deleteSection(id)` | DELETE | `textbooks/sections/{id}/` |
| `getCategories(params)` | GET | `textbooks/categories/` |
| `createCategory(data)` | POST | `textbooks/categories/` |
| `updateCategory(id, data)` | PATCH | `textbooks/categories/{id}/` |
| `deleteCategory(id)` | DELETE | `textbooks/categories/{id}/` |
| `getCards(params)` | GET | `textbooks/cards/` |
| `getCard(id)` | GET | `textbooks/cards/{id}/` |
| `getMyAvailableCards(params)` | GET | `textbooks/cards/my-available/` |
| `createCard(data)` | POST | `textbooks/cards/` |
| `updateCard(id, data)` | PATCH | `textbooks/cards/{id}/` |
| `deleteCard(id)` | DELETE | `textbooks/cards/{id}/` |
| `uploadCardPhoto(cardId, file)` | POST multipart | `textbooks/card-photos/` |
| `deleteCardPhoto(id)` | DELETE | `textbooks/card-photos/{id}/` |
| `uploadParagraphPhoto(paragraphId, file)` | POST multipart | `textbooks/paragraphs/{id}/upload-photo/` |
| `getAssignments(params)` | GET | `textbooks/assignments/` |
| `createAssignment(data)` | POST | `textbooks/assignments/` |
| `deleteAssignment(id)` | DELETE | `textbooks/assignments/{id}/` |
| `bulkDeleteAssignments(data)` | POST | `textbooks/assignments/bulk-delete/` |
| `searchCards(params)` | GET | `textbooks/search/` |
| `aiGenerateCard(data)` | POST | `textbooks/ai-generate/` |
| `aiEnhanceCard(data)` | POST | `textbooks/ai-enhance/` |

#### Прямые вызовы axiosInstance (не обёрнуты в модули)

TeamPage делает вызовы напрямую через `axiosInstance`:
- `GET employees/`, `GET employees/{id}/`, `PATCH employees/{id}/`, `DELETE employees/{id}/`
- `GET invites/`, `POST invites/`, `POST invites/{id}/resend/`, `POST invites/{id}/revoke/`
- `GET zones/`, `POST zones/`, `PATCH zones/{id}/`, `DELETE zones/{id}/`

### 4.3 Кастомные хуки

#### useSessionState

Drop-in замена `useState` с персистенцией в `sessionStorage`.

```js
const [value, setValue, clearValue] = useSessionState(key, defaultValue)
```

- Ключ в storage: `ss:{key}`
- Обрабатывает невалидный JSON
- `clearValue()` — удаляет из storage, сбрасывает на defaultValue
- Первый рендер пропускает sync-to-storage эффект

#### useRealtimeUpdates

Подписка на WebSocket-события из RealtimeContext.

```js
useRealtimeUpdates(entities, callback, deps?)
```

- `entities`: string | string[] — имена сущностей для подписки
- `callback`: вызывается с payload (дебаунс 300мс)
- Отписка при unmount

### 4.4 WebSocket (RealtimeContext)

- URL: `{ws|wss}://{host}/ws/updates/?token={accessToken}` (или `VITE_WS_BASE`)
- Реконнект через 5 секунд после закрытия
- Формат сообщений: `{ entity: string, ... }`
- `subscribe(callback)` → возвращает функцию отписки
- Все подписчики делят одно соединение

### 4.5 AuthContext

**Предоставляет:** `{ user, loading, login, logout, reloadMe }`

**Объект user (из `GET me/`):**
- `permissions: string[]` — плоский массив кодов пермишенов
- `unit_permissions: { [unitId]: string[] } | null` — `null` = полный доступ (owner/developer)
- `role`, `org_role_code`, `can_manage_permissions`
- `assignments: [{unit_name, department_name, org_role_title}]`

**Хелперы:**
- `hasPermission(user, code)` — проверяет `user.permissions.includes(code)`
- `getUserUnitsForPermission(user, code)` — возвращает `number[]` unit ID или `null` (полный доступ)
- `hasPermissionInUnit(user, code, unitId)` — проверяет `user.unit_permissions[unitId]`

---

## 5. Страницы оргструктуры

### 5.1 CompanySettingsPage (`/company-settings`)

**Пермишен:** `org.view`

#### Состояние

| Переменная | Тип | Назначение |
|-----------|-----|-----------|
| `units` | array | Все юниты |
| `departments` | array | Все департаменты |
| `roles` | array | Плоский список всех ролей |
| `tree` | array | Иерархическое дерево из `getRoleHierarchy()` |
| `loading` | boolean | Флаг начальной загрузки |
| `err` | string | Ошибка страницы |
| `newUnitName` | string | Инпут нового юнита |
| `newDeptName` | string | Инпут нового департамента |
| `newDeptUnit` | string/number | ID юнита для нового департамента |
| `showUnitInput` | boolean | Показать инлайн-инпут юнита |
| `editingUnitId` | number/null | ID юнита при переименовании |
| `editingUnitName` | string | Буфер переименования юнита |
| `editingDeptId` | number/null | ID департамента при переименовании |
| `editingDeptName` | string | Буфер переименования департамента |
| `sidebarOpen` | boolean | Открыт ли RoleSidebar |
| `editingRole` | object/null | Роль для редактирования (null = создание) |

#### Загрузка данных

`loadAll()` — вызывается при монтировании и при realtime-событиях. 4 параллельных запроса:
- `GET units/`
- `GET departments/`
- `GET org-roles/`
- `GET org-roles/hierarchy/`

**Realtime:** подписка на `["unit", "department", "org_role"]`, дебаунс 300мс → `loadAll()`.

#### Структура страницы

```
div.page-shell.page-stack
├── h1 "Оргструктура"
├── [Баннер ошибки, если есть]
├── [Текст загрузки, если loading]
│
├── section "ЮНИТЫ"
│   └── div.surface-panel
│       └── [Фишки юнитов + "+" кнопка добавления]
│
├── section "ДЕПАРТАМЕНТЫ"
│   └── [По одному surface-panel на юнит]
│       ├── Заголовок юнита + badge с количеством
│       └── [Фишки департаментов + "+" кнопка]
│
├── section "ИЕРАРХИЯ РОЛЕЙ"
│   ├── Заголовок "Иерархия ролей" + кнопка "+ Роль"
│   └── <RoleHierarchyTree />
│
└── <RoleSidebar /> — всегда рендерится, управляется sidebarOpen/editingRole
```

#### Секция юнитов — UX

- Каждый юнит: pill/chip кнопка с названием + кнопка `×` (удаление)
- Клик по названию: переключается на инлайн `<input>` с autofocus
- Клавиатура: `Enter` сохраняет, `Escape` отменяет, `onBlur` тоже сохраняет
- "+" фишка с dashed border переключается в инлайн input + кнопка "Добавить"

#### Секция департаментов — UX

- Группировка по юнитам (computed `deptsByUnit` мемо)
- Badge количества на юнит
- Тот же паттерн chip + инлайн-переименование что и у юнитов
- "+" кнопка привязана к конкретному юниту (устанавливает `newDeptUnit`)
- Гард: если нет юнитов — пустое состояние "Сначала добавьте хотя бы один юнит."

#### CRUD операции

| Действие | API | Подтверждение |
|----------|-----|---------------|
| Добавить юнит | `POST units/` | Нет |
| Переименовать юнит | `PATCH units/{id}/` | Нет (blur/enter) |
| Удалить юнит | `DELETE units/{id}/` | `dialog.confirm("Удалить юнит?", "Связанные департаменты и роли тоже будут удалены.")` |
| Добавить департамент | `POST departments/` с `{name, unit}` | Нет |
| Переименовать департамент | `PATCH departments/{id}/` | Нет (blur/enter) |
| Удалить департамент | `DELETE departments/{id}/` | `dialog.confirm("Удалить департамент?")` |
| Сохранить роль | делегировано в `RoleSidebar.onSave` | — |
| Удалить роль | делегировано в `RoleSidebar.onDelete` | В RoleSidebar |
| Перетащить роль | `PATCH org-roles/{id}/` с `{parent_role}` | Нет |

---

### 5.2 RoleHierarchyTree (компонент)

Интерактивное дерево оргструктуры с drag-and-drop.

**Props:**
```
tree: array              — иерархические данные из GET org-roles/hierarchy/
onSelectRole: (role) => void
onMoveRole: (dragId, newParentId) => void
onReload?: () => void
```

#### Состояние
- `dragState`: `{type, dragId, dragTitle, overId}` — текущий drag. `type`: `"role"` | `"unit"` | `"dept"`
- `ghostPos`: `{x, y}` — позиция курсора для ghost-элемента

#### Механизм drag — useLongPressDrag (внутренний хук)

- Активируется после удержания 400мс
- Допуск движения 8px до отмены (чтобы не конфликтовать со скроллом)
- Использует `pointerdown / pointermove / pointerup / pointercancel`
- `document.body.style.userSelect = "none"` во время drag

#### Ghost-элемент

`DragGhost` рендерится через `createPortal` в `document.body`:
- `position: fixed` на курсоре, `transform: translate(-50%, -110%)` (над курсором)
- Border, `z-index: 9999`

#### Обнаружение drop-зоны

- `document.elementFromPoint(x, y)` на каждом `pointermove`
- Поиск ближайшего предка с `[data-drag-type]`
- Системные роли (`data-drag-system="1"`) исключены из drop-целей

#### Построение дерева

`buildFullTree(unit)` объединяет:
- `unit.departments[].roles[]`
- `unit.roles_without_department[]`
В дерево используя parent-child связи. Департаменты — визуальные группирующие заголовки.

#### Подкомпоненты

- **UnitSection** — сворачиваемый блок на юнит (аккордеон через chevron `▾`). Название юнита, badge количества ролей, разворачиваемое дерево. Long-press переупорядочивает юниты.
- **DeptHeader** — показывается только для **пустых** департаментов (без ролей). Long-press переупорядочивает департаменты внутри юнита.
- **RoleNode** — рекурсивный. Показывает фишку роли, badge "система" для системных. Дочерние группируются по `_dept` с заголовком. Long-press не включён для системных ролей.

#### Действия drop

| Тип | Действие |
|-----|---------|
| `role` → `role` | Проверка не-потомок, `PATCH org-roles/{id}/` с `{parent_role: targetId}` |
| `unit` → `unit` | Пересчёт порядка, `POST units/reorder/` с `{ids}` |
| `dept` → `dept` | Аналогично внутри юнита, `POST departments/reorder/` с `{ids}` |

#### Подсветка состояний

- Перетаскиваемый узел: `opacity: 0.25`
- Drop-цель: ring + полупрозрачный фон

#### CSS дерева

Ветвления рисуются через CSS-классы `org-tree-node` / `org-tree-node--root` / `org-tree-children` — L-образные линии соединения.

---

### 5.3 RoleSidebar (компонент)

Slide-in панель для создания/редактирования роли + назначения пермишенов.

**Props:**
```
isOpen: boolean
onClose: () => void
role: object | null          — null = создание
units: array
departments: array
roles: array                 — все роли для выбора parent
user: object
onSave: async (data) => void
onDelete: async (id) => void
```

#### Позиционирование

- **Мобильные (< sm):** Bottom sheet. `fixed inset-x-0 bottom-0`, `max-h-[85vh]`, `rounded-t-[28px]`, `border-t`. Drag handle (10px × 4px pill) сверху.
- **Десктоп (sm+):** Правая панель. `fixed right-0 top-0 bottom-0 w-[30rem]`, `border-l`. Полная высота, скроллируемая.
- Backdrop: `z-40`, sidebar `z-[45]`
- Padding top на десктопе: `sm:pt-24` (чтобы не перекрывать Topbar)
- `document.body.style.overflow = "hidden"`
- Скролл: класс `legal-modal-scroll`

#### Состояние

| Переменная | Тип | Назначение |
|-----------|-----|-----------|
| `form` | object | `{title, group, unit, department, parent_role, can_manage_permissions}` |
| `saving` | boolean | Блокировка кнопки |
| `err` | string | Ошибка в sidebar |
| `allPerms` | array | Все пермишены из `GET org-permissions/` |
| `selectedPerms` | Set | ID выбранных пермишенов |
| `openDomains` | Set | Развёрнутые группы пермишенов |
| `existingGroups` | array | Предложения для автокомплита группы |
| `groupFocused` | boolean | Фокус на инпуте группы (показывает автокомплит) |

#### Загрузка при открытии

`Promise.all`:
1. `GET org-permissions/` — всегда
2. `GET org-roles/{id}/` — только при редактировании (полные данные включая `permissions[]`)

При смене `form.department`: `GET org-roles/?department={id}` — для предложений группы.

#### Поля формы

| Поле | Тип | Особенности |
|------|-----|-------------|
| Название (title) | text input | Обязательно. Disabled для системных ролей. |
| Группа для графика (group) | text input + autocomplete | Опционально. Предложения из ролей того же департамента. Фильтрация по вводу. |
| Юнит | `<Dropdown>` | Сброс департамента при смене. Disabled для системных. |
| Департамент | `<Dropdown>` | Фильтрация по юниту. Disabled если нет юнита или системная роль. |
| Подчиняется (parent_role) | `<Dropdown>` | Все роли кроме себя, дедупликация по title (приоритет тому же юниту), лейбл: `title (Unit / Dept)` |
| Управление правами | checkbox | Только для owner/developer |
| Права доступа | аккордеон по доменам | Только если не системная И user.can_manage_permissions |

#### Панель пермишенов (PermGroup)

Пермишены группируются по `domain` в сворачиваемые аккордеоны:
- Заголовок группы: checkbox (с indeterminate для частичного выбора), лейбл домена, badge `N/total`
- Раскрытие/свёртка: анимация height через `ref.scrollHeight`, CSS transition на `height`
- Каждый пермишен: checkbox + name + опциональная кнопка `Info` (Lucide) → `dialog.alert(perm.name, perm.description)`
- "Отметить все в группе": отдельный checkbox

#### Payload при сохранении

```js
{
  title: string,
  group: string,
  department: number | null,
  parent_role: number | null,
  permissions: number[],
  can_manage_permissions: boolean
}
```

#### Удаление

`dialog.confirm("Удалить роль?", "Все подчинённые станут корневыми.")` → `onDelete(role.id)`

#### Гард системных ролей

Если `role.is_system === true`: все инпуты disabled, предупреждение "Системная роль. Редактирование и удаление недоступны.", кнопки действий скрыты.

---

### 5.4 ZonesPage (`/zones`)

**Пермишен:** `org.view`

#### Состояние

| Переменная | Хранение | Назначение |
|-----------|----------|-----------|
| `units` | useState | Юниты видимые юзеру |
| `unitId` | useSessionState `"zones:unitId"` | Выбранный юнит |
| `departments` | useState | Департаменты в выбранном юните |
| `departmentId` | useSessionState `"zones:deptId"` | Выбранный департамент |
| `orgRoles` | useState | Роли в выбранном департаменте |
| `orgRoleId` | useSessionState `"zones:roleId"` | Выбранная роль |
| `zones` | useState | Зоны для комбинации dept+role |
| `loading` | useState | Загрузка зон |
| `newName` | useState | Имя новой зоны |
| `newDesc` | useState | Описание новой зоны |
| `reloadKey` | useState | Инкремент при realtime → перезагрузка |

#### Скопинг доступа — getAccessibleDeptIds

BFS-обход дерева ролей. От назначенных ролей пользователя → все дочерние роли через `parent_role` → собираем все `department` ID. Используется для фильтрации видимых департаментов.

#### Каскадная загрузка (цепочка useEffect)

1. Mount: юниты → фильтр по `allowedUnitIds`. Если 1 юнит — автовыбор.
2. unitId: департаменты (`GET departments/?unit=`) + все роли, фильтрация по BFS, автовыбор если 1.
3. departmentId: роли (`GET org-roles/?department=`). Автовыбор если 1.
4. departmentId + orgRoleId: зоны (`GET zones/?department=&org_role=`).

#### Структура страницы

```
div.page-shell.page-stack
├── h1 "Зоны"
│
├── div.surface-toolbar — Панель фильтров
│   └── div.grid.gap-3.md:grid-cols-3
│       ├── [Dropdown Юнит — только если units.length > 1]
│       ├── [Dropdown Департамент]
│       └── [Dropdown Роль/Должность — disabled если нет dept]
│
├── [Только при departmentId && orgRoleId:]
│
├── div.surface-panel — ФОРМА ДОБАВЛЕНИЯ ЗОНЫ
│   ├── div.section-title "Добавить зону"
│   └── div.grid.gap-3.lg:grid-cols-[1fr_1fr_auto].lg:items-end
│       ├── [Input Название]
│       ├── [Input Описание]
│       └── [Кнопка "Добавить"]
│
└── div.space-y-3 — СПИСОК ЗОН
    ├── div.section-title "Список зон"
    ├── [loading / empty state]
    └── div.grid.gap-3
        └── [surface-panel для каждой зоны]
            └── div.grid.gap-3.lg:grid-cols-[1fr_1fr_auto].lg:items-end
                ├── [Input Название — инлайн-редактирование]
                ├── [Input Описание — инлайн-редактирование]
                └── [Кнопка "Удалить"]
```

#### CRUD зон

| Действие | API | Особенности |
|----------|-----|-------------|
| Добавить | `POST zones/` с `{name, description, department, org_role}` | Добавление в локальный state сразу |
| Редактировать | `PATCH zones/{id}/` с одним полем | Срабатывает на каждый `onChange` (без debounce/blur) |
| Удалить | `DELETE zones/{id}/` | `dialog.confirm("Удалить зону?")` |

#### Responsive

- Фильтры: `md:grid-cols-3` (3 колонки на medium+, стек на мобильных)
- Форма зон и элементы: `lg:grid-cols-[1fr_1fr_auto]` (два инпута + кнопка на large+, стек на остальных)

#### Realtime

Подписка: `["zone", "unit", "department", "org_role"]`. Инкремент `reloadKey` → перезагрузка юнитов.

---

## 6. Страницы команды

### 6.1 TeamPage (`/team`)

**Пермишен:** `team.view`

#### Состояние

| Переменная | Хранение | Назначение |
|-----------|----------|-----------|
| `units` | useState | Все юниты |
| `departments` | useState | Все департаменты |
| `orgRoles` | useState | Все роли |
| `assignableRoles` | useState | Роли доступные для назначения (`null` если не загружены) |
| `invites` | useState | Приглашения |
| `employees` | useState | Все сотрудники |
| `selectedUnit` | useState | Фильтр: юнит |
| `selectedDept` | useState | Фильтр: департамент |
| `selectedRole` | useState | Фильтр: роль (по title) |
| `searchQuery` | useState | Текстовый поиск |
| `showModal` | useSessionState `"team:modal"` | Открыта ли модалка |
| `editing` | useSessionState `"team:editing"` | ID редактируемого сотрудника |
| `form` | useSessionState `"team:form"` | `{full_name, email, grade, birth_date}` |
| `inviteAssignments` | useSessionState `"team:invAssign"` | Назначения для приглашения |
| `pendingAssign` | useSessionState `"team:pending"` | `{unit, department, org_role}` — текущий билдер |
| `editingEmp` | useState | Полный объект сотрудника |
| `loading` | useState | Загрузка |
| `err` | useState | Ошибка |

#### Модель доступа

- `canManage = hasPermission(user, "team.manage")` — глобальный флаг
- `allowedViewUnitIds = getUserUnitsForPermission(user, "team.view")` — `null` = полный доступ
- `allowedManageUnitIds = getUserUnitsForPermission(user, "team.manage")`
- `assignableRoleIds`, `assignableDeptIds`, `assignableUnitIds` — Set из `assignableRoles`

#### Загрузка данных

`loadAll()` параллелизирует:
- `GET units/`
- `GET departments/`
- `GET org-roles/`
- `GET employees/`
- `GET invites/` — только если `canManage`
- `GET org-roles/assignable/` — только если `canManage`

При монтировании и realtime-событиях: `["employee", "employee_assignment", "invite"]`.

#### Логика фильтрации (useMemo)

- `availableUnits`: юниты где юзер имеет `team.view` ИЛИ имеет подчинённые роли
- `filterDepts`: департаменты из `employees[].assignments`, фильтрованные по `selectedUnit`
- `filterRoles`: названия ролей из assignments
- `filteredEmployees`: по selectedUnit/Dept/Role (на `emp.assignments[]`), затем текстовый поиск по full_name, email, текст назначений
- `filteredInvites`: аналогичная логика на `inv.invite_assignments[]`

#### Структура страницы

```
div.page-shell.page-stack
├── div.page-header
│   ├── h1 "Команда"
│   └── [Кнопка "+ Добавить сотрудника" — если hasAnyManageUnit]
│
├── input.input-premium — полноширинный поиск
│
├── div.flex.flex-wrap.gap-2 — Панель фильтров
│   ├── [Dropdown Юнит — если availableUnits.length > 0]
│   ├── [Dropdown Департамент — если selectedUnit && filterDepts.length > 0]
│   └── [Dropdown Роль — если filterRoles.length > 0]
│
├── [Баннер ошибки — если err && !showModal]
│
├── section "СОТРУДНИКИ"
│   ├── div.section-title "Сотрудники"
│   ├── [loading state]
│   ├── [empty state]
│   └── div.grid.gap-3
│       └── [Карточки сотрудников]
│
├── section "ПРИГЛАШЕНИЯ" (только canManage)
│   ├── div.section-title "Приглашения"
│   └── div.grid.gap-3
│       └── [Карточки приглашений]
│
└── [Модалка — если showModal]
```

#### Карточка сотрудника

`surface-panel` с flex layout:
- **Слева:** ФИО (bold) или `${first_name} ${last_name}` или email (fallback). Дата рождения (DD.MM.YYYY). Назначения как pill badges: `{unit_name} / {org_role_title}`. Грейд inline.
- **Справа (если canManageEmployee):** кнопки "Редактировать" (`btn-surface`) + "Удалить" (`btn-danger`)

#### Карточка приглашения

- **Слева:** `{first_name} {last_name} — {email}`, грейд + резюме назначений, дата истечения
- **Справа:** status badge + кнопки:
  - "Скопировать ссылку" (всегда) → `navigator.clipboard.writeText(origin + /accept-invite?token=...)`
  - "Отправить ещё раз" (pending) → `POST invites/{id}/resend/`
  - "Отозвать" (pending) → `dialog.confirm` → `POST invites/{id}/revoke/`

**Статусы:** `{ pending: "Ожидает", accepted: "Принято", revoked: "Отозвано", expired: "Истекло" }`
**Классы badge:** accepted → `badge-success`, revoked/expired → `badge-danger`, else → `badge-muted`

#### Модалка — Добавление/Редактирование сотрудника

Fixed overlay `z-50`, `bg-black/60`, карточка `max-w-xl`, `rounded-[24px]`, тёмный градиент, border.

**Заголовок:** "Добавить сотрудника" / "Редактировать сотрудника"
**Подзаголовок:** "Создание приглашения..." / "Обновление роли и грейда..."
**Кнопка закрытия:** × в правом верхнем углу

**Поля формы:**

| Поле | Режим создания | Режим редактирования | Тип | Детали |
|------|---------------|---------------------|-----|--------|
| ФИО | editable | editable | text | Placeholder "ФИО (Фамилия Имя Отчество)" |
| Email | editable, required | read-only (opacity-60) | email | |
| Дата рождения | hidden | editable | date | `<input type="date">` |
| Назначения | pills из inviteAssignments[] | pills из editingEmp.assignments[] | display | Каждый pill с × для удаления |
| Билдер назначения — Юнит | Dropdown | Dropdown | select | Фильтр по assignableUnitIds |
| Билдер назначения — Департамент | Dropdown | Dropdown | select | Disabled без юнита, фильтр по assignableDeptIds |
| Билдер назначения — Роль | Dropdown | Dropdown | select | Disabled без юнита, фильтр по assignableRoleIds |
| "Добавить назначение" | добавляет в inviteAssignments[] | API-вызов bulkCreateAssignments сразу | button | |
| Грейд | editable | editable | numeric text | Фильтр к цифрам, 0 = пусто, подсказка "от 1 до 5" |

**Кнопки футера:** "Отмена" (btn-surface) + "Пригласить"/"Сохранить" (btn-save)

**Каскад dropdown назначения:**
1. Юнит: фильтруется по `assignableUnitIds`
2. Департамент: disabled пока нет юнита, фильтр по департаментам юнита + `assignableDeptIds`
3. Роль: disabled пока нет юнита, показывает роли из департамента + общекомпанейские, фильтр по `assignableRoleIds`

#### Управление назначениями (режим редактирования)

- Существующие назначения: removable pills в модалке
- Удаление: `DELETE employee-assignments/{id}/` → `GET employees/{id}/` (перезагрузка)
- Добавление: `POST employee-assignments/bulk_create/` → перезагрузка

#### Создание приглашения

`POST invites/` с `{first_name, last_name, email, grade, assignments: [{unit, department, org_role}]}`

#### Действия с приглашениями

| Действие | API |
|----------|-----|
| Копировать ссылку | `navigator.clipboard.writeText(origin + /accept-invite?token=...)` |
| Повторная отправка | `POST invites/{id}/resend/` |
| Отозвать | `POST invites/{id}/revoke/` (с confirm) |
| Удалить сотрудника | `DELETE employees/{id}/` (с confirm) |

---

### 6.2 ProfilePage (`/profile`)

**Пермишен:** нет

#### Структура

`page-shell` → `max-w-3xl mx-auto`

Один `surface-panel` с grid `md:grid-cols-2`:

**Левая колонка "Аккаунт":**
- Email из `user.email`
- Дата рождения (если есть): `new Date(user.birth_date).toLocaleDateString("ru-RU")`

**Правая колонка "Роль":**
- Если есть `user.assignments`: каждое как `badge-bronze` — `unit_name / department_name / org_role_title`
- Иначе: один `badge-bronze` — `user.org_role_title || "Не назначена"`

**Кнопка "Выйти":** `btn-surface` → `logout()` → `/login`

Чисто read-only, без форм и модалок.

---

### 6.3 AcceptInvitePage (`/accept-invite`)

**Layout:** БЕЗ Layout wrapper (без sidebar/topbar). Использует `div.auth-shell.dark-texture` → центрированная карточка `div.auth-card.mx-auto.max-w-lg`.

#### Состояние

| Переменная | Назначение |
|-----------|-----------|
| `pass1` | Пароль |
| `pass2` | Подтверждение пароля |
| `birthDate` | Дата рождения (YYYY-MM-DD из DatePicker) |
| `agree` | Чекбокс согласия |
| `show1` | Видимость пароля |
| `show2` | Видимость подтверждения |
| `error` | Ошибка |
| `submitting` | В процессе |

#### Поля формы

1. **Пароль** — `type="password"` с Eye/EyeOff toggle
2. **Подтверждение** — аналогично
3. **Дата рождения** — компонент `DatePicker` (лейбл "Дата рождения", placeholder "дд.мм.гггг")
4. **Согласие** — кастомный checkbox-button с SVG-галочкой. Inline-ссылки на юридические документы (через `useLegalModal`)

#### Валидация

1. Токен из URL query param
2. Пароли совпадают
3. Regex: `/^(?=.*[A-Za-z])(?=.*\d)[\S]{8,}$/` (мин 8 символов, буква + цифра, без пробелов)
4. `agree === true`
5. `birthDate` не пустой

#### API

`POST auth/accept-invite/` с `{ token, password, agree: true, birth_date }`

Успех: очистка localStorage, удаление Authorization header, навигация на `/login?pwd_set=1`.

---

## 7. Страницы учебников

### 7.1 TextbooksPage (`/textbooks`) — Просмотр

**Пермишен:** `textbooks.view`

Страница просмотра карточек, доступных пользователю, сгруппированных по Unit → Section (табы) → Category.

#### Состояние

| Переменная | Хранение | Назначение |
|-----------|----------|-----------|
| `viewMode` | localStorage `"textbooks_view_mode"` | `"grid"` или `"carousel"` |
| `unitData` | useState | `{ [unitId]: Card[] }` — карточки по юнитам |
| `globalLoading` | useState | Полноэкранный спиннер |
| `searchQuery` | useSessionState `"tb:search"` | Текст поиска |
| `searchResults` | useState | Результаты поиска из API |
| `isSearching` | useState | Спиннер поиска |
| `showOverlay` | useState | Показ dropdown поиска |
| `companyUnits` | useState | Все юниты (только для owner/developer) |

#### Модель доступа

- `isFullAccess = user.unit_permissions === null` — owner/developer/superuser
- Full access: загрузка всех юнитов через `GET org/units/`, затем карточки для каждого
- Ограниченный: юниты из `user.assignments`

#### API-вызовы

- `getMyAvailableCards({ unit: unitId })` — `GET textbooks/cards/my-available/?unit=<id>` — параллельно для каждого юнита
- `searchCards({ q: query })` — `GET textbooks/search/?q=<query>` — дебаунс 300мс, от 2 символов
- `getUnits()` — только для full-access

#### Bookmark

При монтировании проверяет `sessionStorage["ss:tb:viewCardPath"]`. Если есть — навигация к этой карточке (восстановление после обновления).

#### Структура страницы

```
div.page-shell.page-stack
├── Заголовок
│   ├── h1 "Мои учебники" + подзаголовок
│   └── Переключатель режима (grid / carousel)
│       └── Сегментированная пара кнопок:
│           ├── LayoutGrid иконка — сетка
│           └── GalleryHorizontalEnd иконка — карусель
│
├── surface-toolbar — Поиск
│   └── Input (full-width) с иконкой Search
│       ├── Спиннер при isSearching
│       ├── X для очистки
│       └── Dropdown overlay — абсолютно позиционирован, max-h-80, скроллируемый
│           └── Результаты поиска:
│               ├── Миниатюра (7×7)
│               ├── Название карточки
│               ├── Breadcrumb: Раздел → Категория
│               └── Badge релевантности (%)
│
└── Контент (space-y-8)
    └── UnitSection для каждого юнита
```

#### UnitSection (inline подкомпонент)

- Получает `unitName`, `cards[]`, `navigate`, `viewMode`
- Извлекает `sections[]` из карточек (уникальные section ID). Добавляет `"__none__"` если есть карточки без раздела
- Автоселект первого раздела
- **Табы разделов:** горизонтальный скролл (`overflow-x-auto no-scrollbar`), табы с amber-индикатором (`border-b-2`), кнопки стрелок влево/вправо при overflow (определяется через `ResizeObserver` + scroll event)
- Карточки активного раздела группируются по категории

**Режим carousel:** `CategoryCarousel`
- Горизонтальный scroll-контейнер с заголовком категории
- Кнопки стрелок влево/вправо
- Карточки: `w-[45vw] sm:w-[200px] lg:w-[220px] snap-start`

**Режим grid:** CSS grid `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`

#### CardItem (inline подкомпонент)

- `<button>` → навигация на `/textbooks/card/${card.id}`
- `AuthImage` 4:3 aspect ratio (или BookOpen placeholder)
- Название (truncated)
- До 3 тегов как `badge-muted` pills

#### Поиск overlay

- Абсолютно позиционирован под input, `z-50`, max-h-80
- Закрытие: click outside (mousedown listener), Escape, выбор результата
- Каждый результат: миниатюра 7×7, название, breadcrumb раздел→категория, badge score
- "Ничего не найдено" — пустое состояние

#### Responsive

- Carousel: `45vw` mobile, `200px` sm, `220px` lg
- Grid: 2 колонки mobile, 3 sm, 4 lg
- Toggle режима: иконки-only на mobile (`hidden sm:inline` на текст)
- Табы: горизонтальный скролл, wheel event перехвачен для горизонтального скролла

#### Realtime

Подписка: `["textbook_card", "textbook_section", "textbook_category"]`

---

### 7.2 TextbookCardPage (`/textbooks/card/:id`) — Просмотр карточки

**Пермишен:** `textbooks.view`

#### Состояние

| Переменная | Назначение |
|-----------|-----------|
| `card` | Полный объект карточки |
| `loading` | Спиннер |
| `siblingCards` | Все карточки в той же категории (для prev/next) |
| `expandedDetails` | `{ [paragraphId]: boolean }` — аккордеон, все `true` по умолчанию |
| `lightboxPhoto` | `{ file: url }` или null |
| `lbTouchRef` | Координаты начала свайпа |
| `lbHistoryRef` | Был ли pushState для лайтбокса |

#### API-вызовы

1. `getCard(id)` — `GET textbooks/cards/<id>/`
2. Если `card.category` есть: `getCards({ category: card.category })` — загрузка siblings для prev/next

#### Структура страницы

```
div.page-shell.page-stack
├── Кнопка назад: ArrowLeft + "Назад к учебникам" → /textbooks
│
├── Заголовок (flex-col sm:flex-row)
│   ├── h1: card.name (break-words) + подзаголовок: раздел → категория
│   └── Навигация + Редактирование
│       ├── ChevronLeft (disabled если нет prevCard)
│       ├── ChevronRight (disabled если нет nextCard)
│       └── [если card.can_edit] Pencil + "Редактировать" → edit page
│
├── Секция фото
│   ├── Одно фото: full-width, max-h-72/96, object-contain, клик → лайтбокс
│   └── Несколько: flex-wrap, миниатюры 96×96, клик → лайтбокс
│
├── surface-panel "Основная информация" (paragraphs type="front")
│   └── divide-y список:
│       ├── Лейбл (amber цвет)
│       ├── Текст (whitespace-pre-wrap)
│       └── Опциональное инлайн-фото (max-h-48, клик → лайтбокс)
│
├── surface-panel "Подробности" (paragraphs type="detail")
│   └── Аккордеон-элементы (AnimatedCollapse)
│       ├── Toggle кнопка: amber лейбл + ChevronDown (поворот -90° при сворачивании)
│       ├── Текст (whitespace-pre-wrap, text-secondary)
│       └── Опциональное фото
│
├── [если есть теги] surface-panel: badge-muted pills
│
└── [если есть назначения] Текст: "Доступно в: Unit (Dept) · ..."
```

#### AnimatedCollapse (inline подкомпонент)

- Начинается раскрытым (все detail параграфы раскрыты по умолчанию)
- Использует `ref.scrollHeight` для анимации высоты 0 → content
- CSS: `transition-[height] duration-300 ease-in-out`
- При `transitionEnd` при открытии: height → `"auto"`

#### Лайтбокс

- `fixed inset-0 z-[9999] bg-black/80`, клик в любом месте закрывает
- X кнопка: `absolute top-4 right-4`
- Touch: swipe > 50px в любом направлении закрывает
- History: `history.pushState({ lightbox: true })` при открытии; `popstate` закрывает; при cleanup — `history.back()` если ещё запушен
- Контент: `AuthImage max-w-[90vw] max-h-[90vh] object-contain rounded-lg`

#### Prev/Next навигация

- `siblingCards` = все карточки с тем же `category`
- `currentIndex` по `String(id)` сравнению
- Клик → навигация на `/textbooks/card/${card.id}`

#### Realtime

Подписка: `["textbook_card"]`

---

### 7.3 TextbookManagePage (`/textbooks/manage`) — Управление

**Пермишен:** `textbooks.edit`

#### Состояние

| Переменная | Хранение | Назначение |
|-----------|----------|-----------|
| `allCompanies` | useState | Суперюзер: данные всех компаний |
| `sections` | useState | Все разделы |
| `categories` | useState | Категории активного раздела |
| `cards` | useState | ВСЕ карточки (фильтрация локально) |
| `loading` | useState | Спиннер списка карточек |
| `selectedSection` | useSessionState `"tbManage:section"` | Выбранный раздел (chip) |
| `filters` | useSessionState `"tbManage:filters"` | `{ section: "", category: "", search: "" }` |
| `modalType` | useState | `null` / `"section"` / `"category"` |
| `modalMode` | useState | `"create"` / `"edit"` |
| `modalData` | useState | `{ name: "" }` |
| `editingId` | useState | ID редактируемого объекта |
| `saving` | useState | Спиннер кнопки сохранения |

#### Гейты доступа

- `isSuperUser`: `user.role === "owner"` ИЛИ `user.org_role_code === "owner"` ИЛИ `"developer"` — показывает чекбокс "Все компании"
- `hasPermission(user, "textbooks.manage_assignments")` — показывает кнопку "Распределение"
- `hasPermission(user, "textbooks.manage_all") || card.created_by === user.id` — показывает кнопку удаления

#### Bookmark при монтировании

1. Проверяет `sessionStorage["ss:tb:editPath"]` — если есть, навигация туда (восстановление редактирования)
2. Проверяет `sessionStorage["ss:tbAssign:modal"]` — если есть, навигация на `/textbooks/assignments`

#### Структура страницы

```
div.page-shell.page-stack
├── div.page-header
│   ├── h1 "Настройка учебников" + подзаголовок
│   └── Ряд действий
│       ├── [Суперюзер] Чекбокс "Все компании" + Globe иконка
│       ├── [manage_assignments] Кнопка "Распределение" → /textbooks/assignments
│       └── Кнопка "Новая карточка" → /textbooks/manage/card/new
│
├── surface-panel — РАЗДЕЛЫ
│   ├── Заголовок: "Разделы" + кнопка "Добавить"
│   └── Облако фишек (flex-wrap)
│       └── Фишка раздела (toggle selectedSection):
│           ├── Название + count (cards_count)
│           ├── Pencil иконка (hover-reveal на desktop, always на mobile)
│           └── Trash2 иконка (hover-reveal)
│
├── [если selectedSection] surface-panel — КАТЕГОРИИ
│   ├── Заголовок: "Категории — <название раздела>" + кнопка "Добавить"
│   └── Облако фишек: тот же паттерн
│       └── Фишка категории (toggle filters.category):
│           ├── Название + count
│           └── Pencil + Trash2 (hover-reveal)
│
├── surface-toolbar — ФИЛЬТРЫ КАРТОЧЕК
│   └── Grid 3 колонки (sm: 180px 180px 1fr)
│       ├── Dropdown: разделы (placeholder "Раздел")
│       ├── Dropdown: категории (disabled если нет раздела)
│       └── Текстовый поиск с Search иконкой
│
└── Список карточек (grid gap-3)
    └── surface-panel для каждой карточки (кликабельный → /textbooks/manage/card/<id>/edit)
        ├── Фото (8×8 rounded) или BookOpen placeholder
        ├── Название (truncated)
        ├── "AI" badge (badge-bronze) если ai_generated
        ├── Мета: раздел → категория, кол-во фото, кол-во параграфов
        ├── Теги pills (до 4, badge-muted)
        └── [если можно удалить] Кнопка "Удалить" btn-danger
```

#### Логика фильтрации

- Поиск: игнорирует фильтры раздел/категория; ищет по `name`, `section_name`, `category_name`, `tags`
- Без поиска: сначала фильтр раздела, потом категории
- Фильтрация полностью локальная (все карточки загружены)

#### Модалка Раздела/Категории (inline, не DialogProvider)

Кастомная full-screen модалка `fixed inset-0 z-[100]`:
- Тёмный стеклянный стиль: градиент, border
- Заголовок: "Редактирование раздела" / "Новый раздел" / "Редактирование категории" / "Новая категория"
- Одно поле: "Название" — text input с `autoFocus`, `Enter` подтверждает
- Кнопки: "Отмена" (btn-surface) + "Сохранить" (btn-save, disabled если пусто или saving)

#### Подтверждения удаления

Через `useDialog` (DialogProvider):
- Раздел: "Удалить раздел?" — предупреждение что карточки останутся без раздела — `destructive: true`
- Категория: "Удалить категорию?" — аналогично
- Карточка: "Удалить карточку?" — "безвозвратно"

#### Realtime

Подписка: `["textbook_section", "textbook_category", "textbook_card"]` → `loadSections()` + `loadCards()`

---

### 7.4 TextbookCardEditPage (`/textbooks/manage/card/new` и `/textbooks/manage/card/:id/edit`)

**Пермишен:** `textbooks.edit`

#### Состояние

Все основные поля формы в `useSessionState` с динамическими ключами по `id || "new"`:

| Session Key | Переменная | Default |
|------------|-----------|---------|
| `tbCard:name:<cacheKey>` | `name` | `""` |
| `tbCard:section:<cacheKey>` | `sectionId` | `""` |
| `tbCard:category:<cacheKey>` | `categoryId` | `""` |
| `tbCard:aiGen:<cacheKey>` | `aiGenerated` | `false` |
| `tbCard:paras:<cacheKey>` | `paragraphs` | `[]` |
| `tbCard:tags:<cacheKey>` | `tags` | `[]` |

Не-персистируемое:

| Переменная | Назначение |
|-----------|-----------|
| `allCompanies` | Суперюзер toggle |
| `loading` | Спиннер загрузки (edit) |
| `saving` | Спиннер сохранения |
| `sections` | Варианты для dropdown |
| `categories` | Варианты (загружается при смене sectionId) |
| `aiEnabled` | Показ панели AI |
| `aiName` | Input названия позиции для AI |
| `aiPrompt` | Доп. промт для AI |
| `aiLoading` | Спиннер генерации AI |
| `aiCustom` | false=Классический, true=Авторский |
| `aiComposition` | Авторский: состав |
| `aiTaste` | Авторский: вкус |
| `aiServing` | Авторский: подача |
| `enhanceLoading` | Спиннер улучшения AI |
| `existingPhotos` | Фото карточки из API |
| `newPhotoFiles` | Файлы добавленные но не загруженные |
| `newTag` | Input тега |
| `errors` | `{ name: bool }` |
| `lightboxPhoto` | Лайтбокс |

#### Загрузка данных (edit mode)

- Проверяет `sessionStorage["ss:tbCard:name:<cacheKey>"]` — если есть кеш, загружает только `existingPhotos` из API
- Если нет кеша: полная загрузка карточки, заполнение всех полей

#### Структура страницы

```
div.page-shell.page-stack.max-w-3xl.mx-auto
├── Кнопка назад (ArrowLeft + "Назад к управлению")
├── Заголовок h1 "Новая карточка" / "Редактирование карточки"
│   └── [Суперюзер] Globe чекбокс "Все компании"
│
├── surface-panel — AI ГЕНЕРАЦИЯ
│   ├── Чекбокс + Sparkles иконка "Сгенерировать с помощью ИИ"
│   └── [если aiEnabled] surface-block
│       ├── Сегментированный контрол (Классическая / Авторская)
│       ├── Подсказка (контекстно-зависимая)
│       ├── Input: "Название позиции"
│       ├── [Авторский режим:]
│       │   ├── Textarea: "Состав" (rows=2)
│       │   ├── Textarea: "Вкус" (rows=2)
│       │   └── Textarea: "Подача (опц.)" (rows=2)
│       ├── Textarea: "Дополнительный промт (опц.)" (rows=2)
│       └── Кнопка "Сгенерировать" (disabled если loading или name пусто)
│
├── surface-panel — ОСНОВНЫЕ ДАННЫЕ
│   ├── Input: "Название карточки" (required, красная обводка при ошибке)
│   └── Grid 2 колонки (sm)
│       ├── Dropdown: "Раздел"
│       └── Dropdown: "Категория" (disabled если нет раздела)
│
├── surface-panel — ФОТО
│   └── flex flex-wrap gap-2
│       ├── Существующие: миниатюры 80×80/96×96, hover → X (удаление)
│       ├── Новые staged: FileThumbnail (blob URL), hover → X (удалить до загрузки)
│       └── "+" label кнопка (dashed border, file input, accept="image/*" multiple)
│
├── surface-panel — ПАРАГРАФЫ
│   ├── Заголовок + кнопка "Добавить"
│   └── Для каждого параграфа: surface-block
│       ├── Row: GripVertical иконка (визуально, без DnD) + порядковый номер
│       ├── Input: "Заголовок"
│       ├── Textarea: "Текст" (rows=3, resize-none)
│       ├── Фото-подсекция
│       │   ├── Чекбокс + ImagePlus "Фото"
│       │   └── [если hasPhoto]
│       │       ├── Существующее/staged фото (80×80), hover → X
│       │       └── "+" кнопка загрузки
│       └── Нижний ряд
│           ├── Сегментированный контрол (Основной / Подробность)
│           └── "Удалить" btn-danger
│
├── surface-panel — ТЕГИ
│   ├── Существующие теги: badge-muted с X для удаления
│   └── Text input (Enter добавляет, lowercase, дедупликация)
│
└── Ряд действий
    ├── "Сохранить" btn-save
    ├── [если aiEnabled и paragraphs > 0] Wand2 "Улучшить текст"
    └── "Отмена" btn-surface
```

#### Модель данных параграфа

```js
{
  key: string,                     // React key
  paragraph_type: "front" | "detail",  // тип
  label: string,                   // заголовок
  text: string,                    // текст
  order: number,                   // порядок для API
  hasPhoto: boolean,               // включить ли фото
  photoUrl: string | null,         // существующее фото URL
  photoFile: File | null,          // новый файл для загрузки
}
```

#### Поток сохранения

1. Валидация: `name.trim()` обязательно
2. Фильтрация пустых параграфов (без label и text)
3. POST/PATCH карточки с `paragraphs_data` (все инлайн) и `tags_data`
4. Загрузка новых фото карточки последовательно
5. Для фото параграфов: перезагрузка карточки для получения ID сохранённых параграфов (match по `order`), затем загрузка
6. Очистка session-кеша, навигация на `/textbooks/manage`

#### AI-генерация

**Классический режим** (вино, крепкое, саке, пиво): `{ name, prompt, mode: "generate" }`
**Авторский режим** (коктейли, блюда, чай): `{ name, prompt, mode: "custom", composition, taste, serving }`

Ответ AI заполняет: `name`, `section_id`, `category_id`, `paragraphs[]`, `tags[]`. Устанавливает `aiGenerated=true`, скрывает AI-панель.

**AI Enhance**: отправляет текущие параграфы `label/text/paragraph_type` → получает улучшенные тексты → обновляет на месте. Тоже `aiGenerated=true`.

#### FileThumbnail (inline подкомпонент)

- `URL.createObjectURL(file)` при монтировании
- `URL.revokeObjectURL` при размонтировании
- Обычный `<img>` с blob URL

---

### 7.5 TextbookAssignmentsPage (`/textbooks/assignments`)

**Пермишен:** `textbooks.manage_assignments`

#### Состояние

| Переменная | Хранение | Назначение |
|-----------|----------|-----------|
| `units` | useState | Все юниты |
| `departments` | useState | Все департаменты |
| `roles` | useState | Все роли |
| `assignments` | useState | Все назначения (оптимистичные обновления) |
| `loading` | useState | Спиннер |
| `filters` | useSessionState `"tbAssign:filters"` | `{ unit: "" }` |
| `sections` | useState | Разделы для фильтра модалки |
| `expanded` | useSessionState `"tbAssign:expanded"` | `{ [key]: boolean }` — раскрытые узлы |
| `deletingId` | useState | ID удаляемого назначения |
| `assignModal` | useSessionState `"tbAssign:modal"` | `null` или объект `{ unitId, unitName, departmentId, departmentName, orgRoleId, orgRoleTitle }` |
| `allCards` | useState | Все карточки для модалки |
| `assignSearch` | useSessionState `"tbAssign:modalSearch"` | Поиск в модалке |
| `assignLoading` | useState | Спиннер карточек модалки |
| `modalFilters` | useSessionState `"tbAssign:modalFilters"` | `{ section: "", category: "" }` |
| `modalCategories` | useState | Категории для фильтра модалки |
| `bulkAssigning` | useState | Ключ bulk-операции |
| `clearingKey` | useState | Ключ bulk-очистки |
| `confirmClear` | useState | Данные для модалки подтверждения очистки |

#### Начальная загрузка

`Promise.all` из 4 параллельных:
- `getUnits()`, `getSections()`, `getDepartments()`, `getOrgRoles()`

Затем `loadAssignments()` — перезагрузка при смене фильтра юнита.

#### Структура данных дерева (useMemo)

```
Units (alphabetical) → фильтрация по dropdown
  └── Departments (фильтрация по unit, sort_order)
        └── Roles (фильтрация по department, sort по level)
```

#### Структура страницы

```
div.page-shell.page-stack
├── page-header: h1 "Распределение учебников" + подзаголовок
├── surface-toolbar
│   └── Dropdown Юнит (220px)
│
└── Дерево оргструктуры (space-y-3)
    └── surface-panel !p-0 для каждого юнита
        ├── Кнопка заголовка юнита (toggle expand)
        │   ├── ChevronDown / ChevronRight
        │   ├── Building2 иконка (amber)
        │   ├── Название юнита
        │   └── Badge общего кол-ва назначений
        │
        └── [если раскрыт] bg-gray-50/50
            ├── Ряд "Весь юнит"
            │   ├── Users иконка (amber)
            │   ├── Лейбл "Весь юнит"
            │   ├── Badge кол-ва карточек юнита
            │   ├── Кнопка AssignBtn (→ модалка)
            │   ├── [если unitTotal>0] Кнопка ClearBtn (→ confirm)
            │   └── GroupedAssignedCards
            │
            └── Для каждого департамента
                ├── Кнопка заголовка департамента (toggle)
                │   ├── ChevronDown / ChevronRight
                │   ├── FolderClosed (blue-400)
                │   ├── Название + badge + AssignBtn + ClearBtn
                │
                └── [если раскрыт]
                    ├── GroupedAssignedCards уровня департамента
                    └── Для каждой роли
                        ├── Кнопка заголовка роли (toggle)
                        │   ├── ChevronDown / ChevronRight
                        │   ├── Shield иконка (purple-400)
                        │   ├── Название + badge + AssignBtn (без ClearBtn)
                        └── [если раскрыт] GroupedAssignedCards
```

#### GroupedAssignedCards (inline подкомпонент)

Показывает назначенные карточки, организованные как:
- **Заголовок раздела:** amber фон, FolderClosed иконка
- **Подзаголовок категории:** более светлый тон, Tag иконка
- **Ряд карточки:** фото (7×7) или BookOpen placeholder, название, кнопка "Убрать" (btn-danger)

Удаление оптимистично: сразу удаляет из state, восстанавливает при ошибке.

#### Модалка назначения

`fixed inset-0 z-[100]`, тёмная панель, `max-w-lg max-h-[80vh] flex flex-col`:

**Заголовок:**
- "Назначить карточку" + breadcrumb цели (Unit → Dept → Role)
- X кнопка закрытия

**Фильтры (shrink-0, border-b):**
- Input поиска с Search иконкой, `autoFocus`, full-width
- Grid 2 колонки: Dropdown разделов + Dropdown категорий (disabled если нет раздела)

**Дерево карточек (overflow-y-auto flex-1):**
- Группировка: Раздел → Категория (amber стиль как в assigned view)
- Заголовок раздела: badge count + кнопка "Весь раздел" (bulk-assign, скрыта если все назначены)
- Заголовок категории: count + кнопка "Категорию" (bulk-assign)
- Ряд карточки: фото, название, badge "Назначена" (success) ИЛИ кнопка "Назначить"
- `isCardAssigned(cardId)` — проверяет по текущей цели (unit/dept/role triple)

#### Модалка подтверждения очистки

`fixed inset-0 z-[110]` (выше модалки назначения), тёмная панель, `max-w-sm`:
- Красный круг с Trash2 иконкой
- "Очистить назначения?" заголовок
- Описание: название dept/unit, кол-во удаляемых
- "Отмена" + "Очистить" btn-danger с Trash2
- Вызывает `bulkDeleteAssignments({ unit, [department] })` → `POST textbooks/assignments/bulk-delete/`
- Оптимистичное удаление из state после успеха

#### Bulk-операции

- **Bulk assign section:** цикл по всем неназначенным карточкам раздела
- **Bulk assign category:** аналогично для категории
- Спиннер в кнопке, `bulkAssigning` ключ блокирует другие bulk
- Summary: `ok` count (success toast) и `fail` count (error toast)

#### Realtime

Подписка: `["textbook_card"]`

---

## Приложение: CSS-классы дизайн-системы

Кодовая база использует консистентный набор кастомных CSS-утилит:

### Layout
- `app-shell`, `app-frame`, `app-topbar`, `app-main`
- `page-shell` — обёртка страницы
- `page-title`, `page-subtitle`, `page-header` — типография
- `page-stack` — вертикальный стек с отступами

### Поверхности
- `surface-panel` — основная карточка/панель
- `surface-block` — блок контента внутри панели
- `surface-toolbar` — панель фильтров
- `surface-empty` — placeholder пустого состояния
- `dark-texture` — фоновая текстура

### Кнопки
- `btn-save` — primary action (amber/gold)
- `btn-danger` — destructive (red)
- `btn-ghost` — ghost/transparent
- `btn-surface` — secondary/cancel

### Инпуты
- `input-premium` — стилизованный text/textarea input
- `check-premium` — стилизованный checkbox

### Badges
- `badge-muted` — dim/gray
- `badge-bronze` — amber/gold
- `badge-success` — green
- `badge-danger` — red

### Сегментированные контролы
- `schedule-segmented` — контейнер
- `schedule-segmented__button` — кнопка
- `schedule-segmented__inner` — внутренний элемент

### Скроллы
- `dropdown-scroll`, `carousel-scroll`, `legal-modal-scroll`, `time-dropdown-scroll`
- `no-scrollbar` — скрыть scrollbar

### Текст
- `text-muted` — приглушённый текст
- `text-secondary` — secondary текст
- `section-title` — заголовок секции в панели

### CSS Custom Properties (темизация)
- `--ui-surface-panel`, `--ui-surface-control`, `--ui-text-primary`, `--ui-text-muted`
- `--ui-border-soft`, `--ui-border-strong`, `--ui-focus-ring`
- `--n-panel`, `--n-card`, `--n-bg`, `--n-fg`, `--n-border`, `--n-border-h`
- `--n-hover`, `--n-accent`, `--n-muted`, `--n-dim`

### Таблицы
- `premium-table` — базовый стиль таблицы
- `premium-table-chip` — shift chip в schedule table

### Дерево оргструктуры
- `org-tree-node` / `org-tree-node--root` / `org-tree-children` — L-образные линии соединения
