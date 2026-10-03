import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type SubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  timezone: string;
  preferred_hour: number;
  remind_days_before?: number;
};

type ApplianceRow = {
  id: string;
  name: string;
  last_cleaned: string;
  interval_days: number;
};

const jsonHeaders = { "Content-Type": "application/json" };

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders
    });
  }

  const cronSecret = Deno.env.get("PUSH_CRON_SECRET");
  if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: jsonHeaders
    });
  }

  const forceSend = request.headers.get("x-force-send") === "true";

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT");

  if (!supabaseUrl || !serviceKey || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return new Response(JSON.stringify({ error: "Missing server configuration" }), {
      status: 500,
      headers: jsonHeaders
    });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("*");

  if (error) return serverError(error.message);

  const subscriptions = (data || []) as SubscriptionRow[];
  const byUser = new Map<string, SubscriptionRow[]>();
  for (const subscription of subscriptions) {
    const list = byUser.get(subscription.user_id) || [];
    list.push(subscription);
    byUser.set(subscription.user_id, list);
  }

  let sent = 0;
  let removed = 0;

  for (const [userId, userSubscriptions] of byUser) {
    const activeSubscriptions = userSubscriptions.filter((subscription) => {
      const local = localDateParts(subscription.timezone);
      return forceSend || local.hour === subscription.preferred_hour;
    });
    if (!activeSubscriptions.length) continue;

    const { data: applianceData, error: applianceError } = await supabase
      .from("appliances")
      .select("id,name,last_cleaned,interval_days")
      .eq("user_id", userId);
    if (applianceError) continue;

    const appliances = (applianceData || []) as ApplianceRow[];

    for (const subscription of activeSubscriptions) {
      const localToday = localDateParts(subscription.timezone).date;
      const reminderBoundary = addDays(localToday, subscription.remind_days_before || 0);
      const due = appliances.filter((appliance) => dueDate(appliance) <= reminderBoundary);
      if (!due.length) continue;

      const { data: delivered } = await supabase
        .from("notification_deliveries")
        .select("appliance_id,due_date")
        .eq("subscription_id", subscription.id)
        .in("appliance_id", due.map((item) => item.id));

      const deliveredKeys = new Set(
        (delivered || []).map((item) => `${item.appliance_id}:${item.due_date}`)
      );
      const pending = due.filter((item) => !deliveredKeys.has(`${item.id}:${dueDate(item)}`));
      if (!pending.length) continue;

      const payload = JSON.stringify({
        title: "Пора почистить технику",
        body: pending.length === 1
          ? `${pending[0].name} ждёт плановой очистки.`
          : `Устройств к очистке: ${pending.length}.`,
        data: { url: "./" }
      });

      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth_key }
        }, payload);

        await supabase.from("notification_deliveries").insert(
          pending.map((item) => ({
            subscription_id: subscription.id,
            appliance_id: item.id,
            due_date: dueDate(item)
          }))
        );
        sent += 1;
      } catch (pushError) {
        const statusCode = Number((pushError as { statusCode?: number }).statusCode || 0);
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", subscription.id);
          removed += 1;
        }
      }
    }
  }

  return new Response(JSON.stringify({ checked: subscriptions.length, sent, removed }), {
    status: 200,
    headers: jsonHeaders
  });
});

function localDateParts(timezone: string): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${value.year}-${value.month}-${value.day}`,
    hour: Number(value.hour)
  };
}

function dueDate(appliance: ApplianceRow): string {
  const date = new Date(`${appliance.last_cleaned}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + appliance.interval_days);
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function serverError(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 500,
    headers: jsonHeaders
  });
}
