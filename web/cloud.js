(() => {
  "use strict";

  const SUPABASE_URL = "https://vptyxdhkqklgjaowbrcj.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_rHDFNariizbk0p1qYfygIQ_1hbLMoof";
  const VAPID_PUBLIC_KEY = "BL-1ATl6rBVG5E4rfcn2flQw4t8ZaZrAXkhLLr8MVk9RtzOdU54VrbLCEdxABz7BZJ6KzordTfBLCXQxLfFLEp0";

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: "home-cleaner-auth"
    },
    global: {
      headers: { "X-Client-Info": "home-cleaner-pwa/1.0" }
    }
  });

  let currentUser = null;

  async function initialize(localAppliances) {
    setStatus("syncing", "Подключение к облаку…");

    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;

    let session = sessionData.session;
    if (!session) {
      const { data, error } = await client.auth.signInAnonymously();
      if (error) throw error;
      session = data.session;
    }

    currentUser = session?.user || null;
    if (!currentUser) throw new Error("Не удалось создать облачную сессию");

    const { data: rows, error: loadError } = await client
      .from("appliances")
      .select("id,name,category,last_cleaned,interval_days,records,created_at,updated_at")
      .order("updated_at", { ascending: false });

    if (loadError) throw loadError;

    const merged = mergeAppliances(localAppliances, rows || []);
    await save(merged);
    setStatus("synced", "Сохранено в облаке");
    return merged;
  }

  async function save(appliances) {
    if (!currentUser || !appliances.length) {
      if (currentUser) setStatus("synced", "Сохранено в облаке");
      return;
    }

    setStatus("syncing", "Синхронизация…");
    const rows = appliances.map(toRow);
    const { error } = await client.from("appliances").upsert(rows, { onConflict: "id" });
    if (error) throw error;
    setStatus("synced", "Сохранено в облаке");
  }

  async function remove(id) {
    if (!currentUser) return;
    setStatus("syncing", "Синхронизация…");
    const { error } = await client.from("appliances").delete().eq("id", id);
    if (error) throw error;
    setStatus("synced", "Сохранено в облаке");
  }

  async function savePushSubscription(subscription) {
    if (!currentUser) throw new Error("Облачная сессия ещё не готова");

    const value = subscription.toJSON();
    const row = {
      user_id: currentUser.id,
      endpoint: value.endpoint,
      p256dh: value.keys?.p256dh,
      auth_key: value.keys?.auth,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Moscow",
      preferred_hour: 10,
      updated_at: new Date().toISOString()
    };

    const { error } = await client
      .from("push_subscriptions")
      .upsert(row, { onConflict: "endpoint" });

    if (error) throw error;
  }

  function mergeAppliances(localItems, remoteRows) {
    const localById = new Map(localItems.map((item) => [item.id, normalizeLocal(item)]));

    for (const row of remoteRows) {
      const remote = fromRow(row);
      const local = localById.get(remote.id);
      if (!local || updatedAt(remote) > updatedAt(local)) {
        localById.set(remote.id, remote);
      }
    }

    return [...localById.values()];
  }

  function normalizeLocal(item) {
    return {
      ...item,
      records: Array.isArray(item.records) ? item.records : [],
      updatedAt: item.updatedAt || item.createdAt || new Date().toISOString()
    };
  }

  function toRow(item) {
    return {
      id: item.id,
      user_id: currentUser.id,
      name: item.name,
      category: item.category,
      last_cleaned: item.lastCleaned,
      interval_days: item.interval,
      records: item.records || [],
      created_at: item.createdAt,
      updated_at: item.updatedAt || new Date().toISOString()
    };
  }

  function fromRow(row) {
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      lastCleaned: row.last_cleaned,
      interval: row.interval_days,
      records: Array.isArray(row.records) ? row.records : [],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  function updatedAt(item) {
    return new Date(item.updatedAt || item.createdAt || 0).getTime();
  }

  function setStatus(state, label, detail = "") {
    window.dispatchEvent(new CustomEvent("homecleaner:cloudstatus", {
      detail: { state, label, detail }
    }));
  }

  function reportError(error) {
    const schemaMissing = error?.code === "PGRST205" || error?.code === "42P01";
    const authDisabled = /anonymous sign-ins are disabled/i.test(error?.message || "");

    let label = "Только на устройстве";
    let detail = error?.message || "Облако временно недоступно";
    if (schemaMissing) detail = "Примените миграцию Supabase";
    if (authDisabled) detail = "Включите Anonymous Sign-Ins в Supabase";

    setStatus("offline", label, detail);
    console.warn("Supabase sync is unavailable:", error);
  }

  window.HomeCleanerCloud = {
    initialize,
    save,
    remove,
    savePushSubscription,
    reportError,
    vapidPublicKey: VAPID_PUBLIC_KEY,
    get client() { return client; },
    get user() { return currentUser; }
  };
})();
