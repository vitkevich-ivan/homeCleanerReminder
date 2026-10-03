# Настройка Supabase для HomeCleaner

Публичный URL и publishable key уже подключены в `web/cloud.js`. Секретный `service_role` key нельзя добавлять в клиентский код, Git или переписку.

## 1. Включить анонимный вход

В Supabase Dashboard откройте **Authentication → Providers → Anonymous Sign-Ins** и включите провайдер.

## 2. Создать таблицы и RLS-политики

Откройте **SQL Editor → New query**, по очереди вставьте содержимое файлов ниже и нажмите **Run** для каждого:

1. `migrations/202610030001_home_cleaner.sql`;
2. `migrations/202610030002_push_delivery.sql`.

После обновления PWA существующие локальные данные автоматически загрузятся в таблицу `appliances`. Каждая анонимная сессия видит только собственные записи благодаря Row Level Security.

## Важно

Анонимная сессия привязана к установленной PWA. Для восстановления данных после удаления приложения или синхронизации нескольких устройств следующим этапом нужно добавить вход по email или Sign in with Apple.

## 3. Включить фоновые push-уведомления

Ключи VAPID находятся только в локальном файле `.env.push.local`, который исключён из Git. Создайте в **GitHub → Settings → Secrets and variables → Actions** следующие repository secrets:

- `SUPABASE_ACCESS_TOKEN` — personal access token из Supabase Account Settings;
- `VAPID_PUBLIC_KEY` — значение из `.env.push.local`;
- `VAPID_PRIVATE_KEY` — значение из `.env.push.local`;
- `VAPID_SUBJECT` — значение из `.env.push.local`;
- `PUSH_CRON_SECRET` — значение из `.env.push.local`.

После добавления секретов запустите workflow **Deploy Supabase Push Function** вручную. Workflow **Send Due Reminders** будет вызывать функцию раз в час; каждому пользователю уведомления отправляются в 10:00 его локального часового пояса.
