# Система анализа подозрительных операций (AML)

## Обзор

Встроенная система Anti-Money Laundering (AML) для обнаружения и блокировки подозрительных операций с внутренней валютой (коинами). Система работает в реальном времени: при выполнении операции движок оценивает risk score, и если он превышает порог — операция блокируется и отправляется на ручную проверку.

**Расположение:** `backend/apps/shop/aml/`

---

## Архитектура

```
Операция (начисление, покупка, возврат...)
    │
    ▼
┌──────────────────────┐
│   AMLEngine.evaluate │  ← Проверяет все активные правила
│   (engine.py)        │
└──────────┬───────────┘
           │
    risk_score >= threshold?
           │
     ┌─────┴─────┐
     │ Нет       │ Да
     ▼           ▼
 Операция    ┌───────────────────┐
 выполняется │ AMLEngine.record  │ → FlaggedOperation (status=pending)
             │                   │ → WebSocket-уведомление рецензентам
             └───────────────────┘
                      │
                      ▼
              ┌───────────────┐
              │ Ручная проверка│
              │ (review)       │
              └───┬───────┬───┘
                  │       │
            approved   rejected
                  │
                  ▼
         ┌─────────────────┐
         │ executor.py     │ → Выполняет отложенную операцию
         └─────────────────┘
```

---

## Модели данных

### AMLSettings

Настройки AML на уровне компании (одна запись на компанию).

| Поле | Тип | По умолчанию | Описание |
|------|-----|--------------|----------|
| `company` | OneToOneField → Company | — | Компания |
| `is_enabled` | BooleanField | `False` | Включена ли система |
| `threshold` | FloatField | `50.0` | Порог risk_score для блокировки |
| `lookback_days` | PositiveIntegerField | `30` | Окно анализа в днях |

### AMLRule

Правила обнаружения подозрительных операций. Уникальное ограничение: `(company, rule_code)`.

| Поле | Тип | Описание |
|------|-----|----------|
| `company` | FK → Company | Компания |
| `rule_code` | CharField | Код правила (A1, B3, ...) |
| `category` | CharField | Категория: A / B / C / D / E / F |
| `name` | CharField | Название правила |
| `description` | TextField | Описание |
| `is_enabled` | BooleanField | Активно ли правило |
| `weight` | FloatField | Вклад в risk_score |
| `params` | JSONField | Конфигурируемые параметры |

### FlaggedOperation

Заблокированная операция, ожидающая проверки.

| Поле | Тип | Описание |
|------|-----|----------|
| `company` | FK → Company | Компания |
| `operation_type` | CharField | Тип операции (см. таблицу ниже) |
| `initiated_by` | FK → CustomUser | Кто инициировал операцию |
| `target_employee` | FK → Employee | Целевой сотрудник |
| `payload` | JSONField | Сырые данные операции |
| `risk_score` | FloatField | Итоговый risk score |
| `triggered_rules` | JSONField | Список сработавших правил |
| `status` | CharField | `pending` / `approved` / `rejected` |
| `reviewed_by` | FK → CustomUser | Кто проверил |
| `reviewed_at` | DateTimeField | Когда проверено |
| `review_comment` | TextField | Комментарий рецензента |
| `related_transaction` | FK → CoinTransaction | Связанная транзакция |
| `related_order` | FK → Order | Связанный заказ |

### AMLAuditLog

Журнал аудита всех действий с системой AML.

| Поле | Тип | Описание |
|------|-----|----------|
| `flagged_operation` | FK → FlaggedOperation | Связанная операция |
| `company` | FK → Company | Компания |
| `actor` | FK → CustomUser | Кто совершил действие |
| `action` | CharField | `viewed` / `approved` / `rejected` / `settings_changed` / `rule_changed` |
| `ip_address` | GenericIPAddressField | IP-адрес |
| `details` | JSONField | Детали действия |

---

## Список отслеживаемых операций

| Код | Отображение | Описание |
|-----|-------------|----------|
| `accrual` | Начисление | Ручное начисление коинов сотруднику |
| `bulk_accrual` | Массовое начисление | Начисление коинов группе сотрудников |
| `purchase` | Покупка | Покупка товара в магазине |
| `order_approve` | Одобрение заказа | Одобрение заказа менеджером |
| `order_reject` | Отклонение заказа | Отклонение заказа менеджером |
| `refund_create` | Запрос возврата | Создание запроса на возврат |
| `refund_approve` | Одобрение возврата | Одобрение возврата менеджером |
| `auto_rule_change` | Изменение автоправила | Изменение правила автоначисления |
| `item_price_change` | Изменение цены товара | Изменение цены товара в каталоге |
| `item_stock_change` | Изменение стока товара | Изменение количества товара на складе |

---

## Правила обнаружения (16 правил)

### Категория A — Конфликт интересов

| Код | Название | Вес | Логика |
|-----|----------|-----|--------|
| **A1** | Самоначисление | 90.0 | Инициатор операции совпадает с целевым сотрудником (`initiated_by_id == target_employee.user_id`) |
| **A2** | Начисление вне scope | 70.0 | Менеджер начисляет коины сотруднику, не входящему в его юнит/подразделение |

### Категория B — Статистические аномалии

| Код | Название | Вес | Параметры | Логика |
|-----|----------|-----|-----------|--------|
| **B1** | Устойчивая пара | 30.0 | `max_share_pct=50`, `min_transactions=5`, `approver_multiplier=1.5` | Один менеджер слишком часто начисляет одному и тому же сотруднику |
| **B2** | Диспропорция внутри группы | 25.0 | `max_ratio=3.0`, `min_group_size=3` | Один сотрудник в группе получает непропорционально много коинов |
| **B3** | Аномальная сумма | 35.0 | `k_factor=2.5`, `min_history=10` | Сумма начисления отклоняется от среднего более чем на k × стандартное отклонение |
| **B4** | Аномальная частота | 25.0 | `max_accruals_per_day=5`, `max_accruals_per_week=15` | Слишком много начислений за короткий период |

### Категория C — Манипуляция каталогом

| Код | Название | Вес | Параметры | Логика |
|-----|----------|-----|-----------|--------|
| **C1** | Ценовая манипуляция | 60.0 | `window_hours=24`, `min_price_drop_pct=30` | Резкое снижение цены товара (более 30% за 24 часа) |
| **C2** | Манипуляция стоком | 40.0 | `window_hours=24` | Снижение стока товара до 1 единицы за 24 часа |

### Категория D — Процессные аномалии

| Код | Название | Вес | Параметры | Логика |
|-----|----------|-----|-----------|--------|
| **D1** | Цикл reject-refund | 45.0 | `min_cycles=3`, `window_days=7` | Повторяющиеся циклы отклонения и возврата (3+ за 7 дней) |
| **D2** | Rubber-stamping | 30.0 | `max_approvals_per_hour=20`, `min_avg_seconds_between=10` | Слишком быстрое одобрение заказов (конвейерное утверждение) |
| **D3** | Аномальный % отклонений | 25.0 | `max_rejection_rate_pct=80`, `min_reviewed=5` | Менеджер отклоняет более 80% заказов |
| **D4** | Refund после активации | 95.0 | — | Попытка возврата товара, который уже был активирован |

### Категория E — Неактивные аккаунты

| Код | Название | Вес | Параметры | Логика |
|-----|----------|-----|-----------|--------|
| **E1** | Начисление неактивному | 50.0 | `inactive_days=30` | Начисление сотруднику, который не входил в систему 30+ дней |
| **E2** | Всплеск перед деактивацией | 40.0 | `spike_ratio=3.0`, `window_days=7` | Резкий рост начислений сотруднику незадолго до деактивации |

### Категория F — Автоначисление

| Код | Название | Вес | Параметры | Логика |
|-----|----------|-----|-----------|--------|
| **F1** | Тривиальные conditions | 55.0 | — | Правило автоначисления с пустыми условиями (срабатывает на всех) |
| **F2** | Аномальный amount в правиле | 40.0 | `k_factor=3.0` | Сумма в правиле автоначисления аномально высока (avg + k × std) |

---

## Алгоритм оценки risk score

1. AML-движок получает операцию и контекст запроса
2. Проверяет, включена ли система AML для компании
3. Собирает контекст: `last_login`, `unit_ids`, `department_id`, флаги активации
4. Последовательно вызывает функцию проверки для каждого активного правила
5. Каждое сработавшее правило добавляет `weight × risk_contribution` к итоговому `risk_score`
6. `risk_score` ограничивается значением 100.0
7. Если `risk_score >= threshold` — операция блокируется

---

## Точки интеграции

AML-проверка встроена в следующие операции (`backend/apps/shop/views.py`):

| Операция | View | Метод |
|----------|------|-------|
| Начисление коинов | `CoinAccrueView` | `post()` |
| Массовое начисление | `CoinBulkAccrueView` | `post()` |
| Одобрение заказа | `OrderViewSet` | `approve()` |
| Одобрение возврата | `RefundRequestViewSet` | `approve()` |

Трекинг изменений каталога (`backend/apps/shop/aml/item_tracking.py`):

| Событие | Источник |
|---------|----------|
| Изменение цены товара | `ShopItemViewSet.perform_update()` |
| Изменение стока товара | `ShopItemViewSet.perform_update()` |

При блокировке возвращается HTTP 403:
```json
{"detail": "Операция заблокирована системой безопасности", "flagged": true}
```

---

## Исполнители одобренных операций

При одобрении заблокированной операции (`executor.py`) выполняется отложенное действие:

| Тип операции | Действие при одобрении |
|--------------|----------------------|
| `accrual` | Начисление коинов сотруднику |
| `bulk_accrual` | Массовое начисление коинов |
| `order_approve` | Одобрение заказа + создание PurchasedItem |
| `refund_approve` | Возврат коинов + восстановление стока + удаление PurchasedItem |

> **Примечание:** Для типов `purchase`, `order_reject`, `refund_create`, `auto_rule_change`, `item_price_change`, `item_stock_change` исполнители не реализованы.

---

## API Endpoints

Базовый путь: `/api/shop/aml/`

| Метод | URL | Описание | Право доступа |
|-------|-----|----------|---------------|
| GET | `settings/` | Получить настройки AML | `review_flagged` |
| PUT | `settings/` | Обновить настройки AML | `aml_settings` |
| GET | `stats/` | Статистика по операциям | `review_flagged` |
| GET | `audit-log/` | Журнал аудита | `review_flagged` |
| GET | `rules/` | Список правил | `aml_settings` |
| PATCH | `rules/{id}/` | Обновить правило | `aml_settings` |
| GET | `flagged/` | Список заблокированных операций | `review_flagged` |
| GET | `flagged/{id}/` | Детали операции | `review_flagged` |
| POST | `flagged/{id}/review/` | Одобрить/отклонить операцию | `review_flagged` |
| GET | `flagged/{id}/audit/` | Журнал аудита операции | `review_flagged` |

**Фильтры для `GET flagged/`:** `status`, `operation_type`, `min_risk`, `date_from`, `date_to`

---

## Права доступа

| Код | Описание |
|-----|----------|
| `shop.review_flagged` | Просмотр и рецензирование подозрительных операций |
| `shop.aml_settings` | Управление настройками и правилами AML |

---

## Уведомления в реальном времени (WebSocket)

- **WebSocket URL:** `ws/updates/?token=<JWT>`
- **Группа:** `company_{company_id}_updates`
- При создании `FlaggedOperation` отправляется уведомление:
  ```json
  {
    "entity": "aml_flagged",
    "action": "created",
    "id": 123,
    "risk_score": 75.0,
    "operation_type": "accrual",
    "employee_name": "Иванов И.И.",
    "status": "pending"
  }
  ```
- При рецензии отправляется:
  ```json
  {
    "entity": "aml_flagged",
    "action": "updated",
    "id": 123,
    "status": "approved"
  }
  ```

---

## Frontend

| Файл | Назначение |
|------|------------|
| `frontend/src/pages/ShopAMLPage.jsx` | Главная страница AML (3 вкладки: Операции / Журнал / Настройки) |
| `frontend/src/api/aml.js` | API-клиент |
| `frontend/src/hooks/useAMLNotifications.js` | Хук для real-time счётчика pending-операций |
| `frontend/src/components/Topbar.jsx` | Иконка Bell с Badge-счётчиком → `/shop/aml` |
| `frontend/src/context/RealtimeContext.jsx` | WebSocket-провайдер с авто-реконнектом |

**Цветовая индикация risk score:**
- Зелёный: risk < 40
- Жёлтый: 40 ≤ risk < 70
- Красный: risk ≥ 70

**Маршрут:** `/shop/aml` (требует `shop.review_flagged`)

---

## Автоинициализация

При создании новой компании (сигнал `post_save` на модели `Company`) автоматически:
1. Создаётся `AMLSettings` (выключена по умолчанию)
2. Создаются все 16 правил с дефолтными весами и параметрами

---

## Структура файлов

```
backend/apps/shop/aml/
├── __init__.py
├── models.py          — Модели: AMLSettings, AMLRule, FlaggedOperation, AMLAuditLog
├── rules.py           — 16 функций проверки + маппинг RULE_CHECKS
├── engine.py          — AMLEngine: evaluate(), record(), _notify_reviewers()
├── executor.py        — execute_approved_operation() + 4 исполнителя
├── item_tracking.py   — Трекинг изменений цен и стоков
├── signals.py         — Автосоздание правил для новой компании
├── views.py           — 5 API-вьюшек
├── serializers.py     — 6 сериализаторов
├── permissions.py     — 2 DRF-разрешения
├── admin.py           — Django Admin
└── urls.py            — Маршруты
```
