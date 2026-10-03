(() => {
  "use strict";

  const SUPABASE_URL = "https://vptyxdhkqklgjaowbrcj.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_rHDFNariizbk0p1qYfygIQ_1hbLMoof";
  const VAPID_PUBLIC_KEY = "BL-1ATl6rBVG5E4rfcn2flQw4t8ZaZrAXkhLLr8MVk9RtzOdU54VrbLCEdxABz7BZJ6KzordTfBLCXQxLfFLEp0";
  const APP_URL = "https://vitkevich-ivan.github.io/homeCleanerReminder/";

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "home-cleaner-auth"
    },
    global: {
      headers: { "X-Client-Info": "home-cleaner-pwa/1.0" }
    }
  });

  let currentUser = null;

  client.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    emitAuthState();
  });

  async function initialize(localAppliances) {
    setStatus("syncing", "Подключение к облаку…");

    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;

    let session = sessionData.session;
    if (session) {
      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError && isInvalidUserSession(userError)) {
        await client.auth.signOut({ scope: "local" });
        session = null;
      } else if (userError) {
        throw userError;
      } else if (userData.user) {
        session = { ...session, user: userData.user };
      }
    }

    if (!session) {
      const { data, error } = await client.auth.signInAnonymously();
      if (error) throw error;
      session = data.session;
    }

    currentUser = session?.user || null;
    if (!currentUser) throw new Error("Не удалось создать облачную сессию");
    emitAuthState();

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

  async function registerWithEmail(email, password) {
    if (!currentUser) throw new Error("Облачная сессия ещё не готова");
    if (!currentUser.is_anonymous) throw new Error("Email уже подключён к аккаунту");

    const { data, error } = await client.auth.updateUser(
      { email, password },
      { emailRedirectTo: APP_URL }
    );
    if (error) throw error;

    currentUser = data.user || currentUser;
    emitAuthState();
    return {
      email: currentUser.new_email || currentUser.email || email,
      confirmationRequired: !currentUser.email_confirmed_at
    };
  }

  async function signInWithEmail(email, password) {
    const previousUserId = currentUser?.id || null;
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;

    currentUser = data.user;
    emitAuthState();
    return { changedUser: Boolean(previousUserId && previousUserId !== currentUser.id) };
  }

  async function resendEmailConfirmation(email) {
    const { error } = await client.auth.resend({
      type: "email_change",
      email,
      options: { emailRedirectTo: APP_URL }
    });
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

  function emitAuthState() {
    if (!currentUser) return;
    window.dispatchEvent(new CustomEvent("homecleaner:authstate", {
      detail: accountState()
    }));
  }

  function accountState() {
    return {
      isAnonymous: currentUser?.is_anonymous === true,
      email: currentUser?.email || currentUser?.new_email || "",
      pendingEmail: currentUser?.new_email || "",
      emailConfirmed: Boolean(currentUser?.email_confirmed_at)
    };
  }

  function isInvalidUserSession(error) {
    const invalidCodes = new Set([
      "user_not_found",
      "session_not_found",
      "refresh_token_not_found",
      "refresh_token_already_used",
      "bad_jwt"
    ]);
    return invalidCodes.has(error?.code) || error?.status === 401 || error?.status === 403;
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
    registerWithEmail,
    signInWithEmail,
    resendEmailConfirmation,
    reportError,
    vapidPublicKey: VAPID_PUBLIC_KEY,
    get client() { return client; },
    get user() { return currentUser; },
    get account() { return accountState(); }
  };
})();
