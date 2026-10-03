# Настройка Supabase для HomeCleaner

Публичный URL и publishable key уже подключены в `web/cloud.js`. Секретный `service_role` key нельзя добавлять в клиентский код, Git или переписку.

## 1. Включить анонимный вход

В Supabase Dashboard откройте **Authentication → Providers → Anonymous Sign-Ins** и включите провайдер.

## 2. Создать таблицы и RLS-политики

Откройте **SQL Editor → New query**, по очереди вставьте содержимое файлов ниже и нажмите **Run** для каждого:

1. `migrations/202610030001_home_cleaner.sql`;
2. `migrations/202610030002_push_delivery.sql`;
3. `migrations/202610030003_notification_preferences.sql`.

После обновления PWA существующие локальные данные автоматически загрузятся в таблицу `appliances`. Каждая анонимная сессия видит только собственные записи благодаря Row Level Security.

## Важно

Анонимная сессия привязана к установленной PWA. Для восстановления данных и синхронизации нескольких устройств подключите email к профилю по инструкции [`EMAIL_AUTH.md`](EMAIL_AUTH.md). Sign in with Apple не используется.

## 3. Включить фоновые push-уведомления

Ключи VAPID находятся только в локальном файле `.env.push.local`, который исключён из Git. Создайте в **GitHub → Settings → Secrets and variables → Actions** следующие repository secrets:

- `SUPABASE_ACCESS_TOKEN` — personal access token из Supabase Account Settings;
- `VAPID_PUBLIC_KEY` — значение из `.env.push.local`;
- `VAPID_PRIVATE_KEY` — значение из `.env.push.local`;
- `VAPID_SUBJECT` — значение из `.env.push.local`;
- `PUSH_CRON_SECRET` — значение из `.env.push.local`.

После добавления секретов запустите workflow **Deploy Supabase Functions** вручную. Он публикует отправку напоминаний и безопасное удаление аккаунта. Workflow **Send Due Reminders** вызывает функцию раз в час; время выбирается пользователем в PWA.

Для автоматического расписания ветка `dev` должна быть default branch репозитория GitHub.
