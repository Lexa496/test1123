# Проект: статика + Supabase + Vercel

Краткая инструкция по настройке **Supabase** для этого репозитория. На странице форма: **номер билета** и **сумма задержек**. В таблице три поля данных: **дата** (`event_date`), **номер билета** (`ticket_number`), **задержка** (`delay_amount`). Данные уходят из браузера (anon key) и через serverless на Vercel (service role).

## 1. Проект в Supabase

1. Зайдите на [supabase.com](https://supabase.com) и создайте проект (или откройте существующий).
2. Дождитесь, пока база поднимется. Регион выбирайте ближе к пользователям или к Vercel.

## 2. Таблица и политики (RLS)

В Supabase откройте **SQL Editor**. Если таблица `demo_events` уже была со старой схемой, скрипт ниже удалит её (`drop table`). В результате: служебный столбец `id` и три поля данных — **дата** `event_date`, **номер билета** `ticket_number`, **задержка** `delay_amount`. При вставке из формы дата подставляется автоматически (текущая дата в UTC).

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

Если переименуете таблицу — обновите `tableName` в `app.js` и имя таблицы в `api/submit.js`.

## 3. Ключи и URL (Settings → API)

В разделе **Project Settings → API** возьмите:

| Параметр | Где используется |
|----------|------------------|
| **Project URL** | `https://xxxxx.supabase.co` — подставьте в `CONFIG.supabaseUrl` в `app.js` и в переменную `SUPABASE_URL` на Vercel. |
| **anon public** | Публичный ключ для браузера — только в `CONFIG.supabaseAnonKey` в `app.js`. Не считается секретом в том смысле, что он попадает в клиент; доступ ограничивают **RLS**. |
| **service_role** | Секретный ключ — **только на сервере**. В Vercel: `SUPABASE_SERVICE_ROLE_KEY`. Никогда не вставляйте его в статику и не коммитьте в репозиторий. |

## 4. Настройка `app.js`

Откройте `app.js` и задайте:

- `supabaseUrl` — ваш **Project URL**.
- `supabaseAnonKey` — ключ **anon public**.
- `tableName` — имя таблицы (по умолчанию `demo_events`).
- `vercelApiUrl` — путь к API после деплоя, например `/api/submit`. Для локальной разработки с `vercel dev` можно указать полный URL, например `http://localhost:3000/api/submit`.

## 5. Vercel: пошагово (после Supabase)

Supabase у вас уже настроен — дальше нужно **залить этот проект на Vercel** и **прописать секреты**, чтобы работала функция `api/submit.js` (она пишет в БД через **service_role**; ключ в браузер не попадает).

### 5.1. Как устроен проект на Vercel

- **`index.html` и `app.js`** — обычный статический сайт: Vercel отдаёт их как есть.
- **`api/submit.js`** — serverless-функция. После деплоя она доступна по адресу **`https://ваш-домен.vercel.app/api/submit`** (метод `POST`).
- **`package.json`** нужен из‑за `@supabase/supabase-js` внутри `api/submit.js`. При деплое Vercel сам выполнит `npm install`.

Корень репозитория = корень проекта (где лежат `index.html`, `app.js`, папка `api/`). Отдельный «билд» для статики не обязателен.

### 5.2. Деплой через сайт vercel.com (удобно с Git)

1. Залейте папку проекта в репозиторий на **GitHub / GitLab / Bitbucket** (если ещё не залили).
2. Зайдите на [vercel.com](https://vercel.com) → **Add New…** → **Project** → импортируйте этот репозиторий.
3. В настройках импорта:
   - **Framework Preset** — **Other** (или оставьте авто; для чистой статики часто подходит).
   - **Root Directory** — оставьте пустым, если в корне репозитория лежат `index.html` и `api`. Если сайт в подпапке — укажите эту подпапку.
   - **Build Command** — можно **оставить пустым** (ничего собирать не нужно).
   - **Output Directory** — не требуется для такого варианта; Vercel сам отдаст файлы из корня.
4. Нажмите **Deploy**. После сборки вы получите URL вида `https://something.vercel.app`.

### 5.3. Переменные окружения (обязательно)

Без них функция `/api/submit` вернёт ошибку про отсутствие ключей.

1. В Vercel откройте проект → **Settings** → **Environment Variables**.
2. Добавьте две переменные (имена **строго** такие):

   | Name | Value |
   |------|--------|
   | `SUPABASE_URL` | **Project URL** из Supabase (например `https://xxxx.supabase.co`) |
   | `SUPABASE_SERVICE_ROLE_KEY` | ключ **service_role** (Settings → API в Supabase) |

3. Для каждой переменной отметьте окружения: **Production**, **Preview**, **Development** (чтобы работало и на превью-деплоях).
4. Сохраните. После **первого** добавления переменных сделайте **Redeploy**: вкладка **Deployments** → три точки у последнего деплоя → **Redeploy** (или новый push в Git).

`SUPABASE_SERVICE_ROLE_KEY` не кладите в `app.js` и не коммитьте в репозиторий — только в Vercel.

### 5.4. Настройка `app.js` под ваш домен

В `app.js` уже указано `vercelApiUrl: "/api/submit"`. Это верно, когда страница открыта **на том же домене**, что и деплой Vercel (запрос пойдёт на `https://ваш-проект.vercel.app/api/submit`).

Локально, если запускаете `vercel dev` из корня проекта, путь тоже будет `/api/submit` на `http://localhost:3000` (или другой порт, который покажет CLI).

Если по какой-то причине фронт лежит на другом домене, временно укажите полный URL:  
`vercelApiUrl: "https://ваш-проект.vercel.app/api/submit"`.

### 5.5. Деплой без Git (CLI)

Из папки проекта:

```bash
npm install
npx vercel login
npx vercel
```

Следуйте вопросам мастера. Потом в [Vercel Dashboard](https://vercel.com/dashboard) → ваш проект → **Settings** → **Environment Variables** — добавьте те же `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY`, затем снова `npx vercel --prod` или Redeploy.

Локальная разработка с теми же секретами:

```bash
npx vercel env pull .env.local
npx vercel dev
```

(если `vercel` предложит связать проект — согласитесь).

### 5.6. Если что-то не работает

- **404 на `/api/submit`** — проверьте, что в репозитории есть папка **`api`** с файлом **`submit.js`** (путь: `api/submit.js`).
- **500 / ошибка про `Missing SUPABASE_...`** — переменные не заданы или деплой был **до** их добавления; добавьте переменные и сделайте **Redeploy**.
- **CORS** — для этого проекта API уже отдаёт `Access-Control-Allow-Origin: *`; если открываете HTML с другого домена, убедитесь, что запросы идут на полный URL вашего API на Vercel.
- Страницу открывайте по **https://…**, не как файл с диска (`file://`), иначе модуль `app.js` и запросы могут не сработать.

## 6. Проверка

1. В корне проекта выполните `npm install` (для локального `vercel dev` и для проверки зависимостей).
2. Запустите `npx vercel dev`, откройте выданный URL, отправьте форму с кнопкой «Отправить на API» (или цепочку с API).
3. В Supabase → **Table Editor** откройте `demo_events` — должна появиться новая строка с `ticket_number`, `delay_amount`, `event_date`.
4. После деплоя на Vercel повторите то же на продакшен-URL.

## Безопасность (кратко)

- Anon key в клиенте нормален при корректном **RLS**.
- Service role обходит RLS — храните его только в секретах Vercel.
- При необходимости отключите лишние политики для `anon` (например, убрать `select`, если список событий не должен быть публичным).
