# Проект: статика + Supabase

Краткая инструкция по настройке **Supabase** для этого репозитория. На странице форма: **номер билета** и **сумма задержек**. В таблице три поля данных: **дата** (`event_date`), **номер билета** (`ticket_number`), **задержка** (`delay_amount`). Данные уходят из браузера в Supabase по **anon key** (доступ ограничивают политики RLS).

## 1. Проект в Supabase

1. Зайдите на [supabase.com](https://supabase.com) и создайте проект (или откройте существующий).
2. Дождитесь, пока база поднимется.

## 2. Таблица и политики (RLS)

В Supabase откройте **SQL Editor**. Если таблица `demo_events` уже была со старой схемой, скрипт ниже удалит её (`drop table`). В результате: служебный столбец `id` и три поля данных — **дата** `event_date`, **номер билета** (`ticket_number`), **задержка** (`delay_amount`). При вставке из формы дата подставляется автоматически (текущая дата в UTC).

```sql
drop table if exists public.demo_events cascade;

create table public.demo_events (
  id uuid default gen_random_uuid() primary key,
  event_date date not null default ((timezone('utc', now()))::date),
  ticket_number text not null,
  delay_amount numeric(14, 2) not null check (delay_amount >= 0)
);

alter table public.demo_events enable row level security;

create policy "anon insert demo_events"
  on public.demo_events
  for insert
  to anon
  with check (true);

create policy "anon select demo_events"
  on public.demo_events
  for select
  to anon
  using (true);
```

Зачем это нужно:

- **RLS** включён — без политик клиент с anon key не сможет писать/читать таблицу.
- Политики для роли **`anon`** разрешают вставку и чтение с фронта по **anon key** (как в `app.js`). Для продакшена обычно сужают правила (например, только insert, без select, или проверка `auth.uid()`).

Если переименуете таблицу — обновите `tableName` в `app.js`.

## 3. Ключи и URL (Settings → API)

В разделе **Project Settings → API** возьмите:

| Параметр | Где используется |
|----------|------------------|
| **Project URL** | `https://xxxxx.supabase.co` — подставьте в `CONFIG.supabaseUrl` в `app.js`. |
| **anon public** | Публичный ключ для браузера — только в `CONFIG.supabaseAnonKey` в `app.js`. Не считается секретом в том смысле, что он попадает в клиент; доступ ограничивают **RLS**. |

## 4. Настройка `app.js`

Откройте `app.js` и задайте:

- `supabaseUrl` — ваш **Project URL**.
- `supabaseAnonKey` — ключ **anon public**.
- `tableName` — имя таблицы (по умолчанию `demo_events`).

## 5. Локальный просмотр и деплой

Сайт — обычные `index.html` и `app.js` (Supabase-клиент подключается с CDN в `app.js`). Можно открыть через любой статический сервер или задеплоить на **Vercel**, **Netlify**, **GitHub Pages** и т.д. как статику: отдельный бэкенд и переменные окружения для Supabase не нужны.

Страницу открывайте по **http(s)://…**, не как файл с диска (`file://`), иначе модуль `app.js` может не загрузиться.

## 6. Проверка

1. Запустите локальный сервер в корне проекта, например: `npx serve .` или `python3 -m http.server 8080`, и откройте выданный URL.
2. Отправьте форму.
3. В Supabase → **Table Editor** откройте `demo_events` — должна появиться новая строка с `ticket_number`, `delay_amount`, `event_date`.

## Безопасность (кратко)

- Anon key в клиенте нормален при корректном **RLS**.
- При необходимости отключите лишние политики для `anon` (например, убрать `select`, если список событий не должен быть публичным).
