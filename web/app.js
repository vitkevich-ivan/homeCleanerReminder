(() => {
  "use strict";

  const STORAGE_KEY = "home-cleaner-appliances-v1";
  const NOTICE_KEY = "home-cleaner-last-notice";

  const categories = {
    washingMachine: { label: "Стиральная машина", icon: "🫧", interval: 60 },
    coffeeMachine: { label: "Кофемашина", icon: "☕️", interval: 30 },
    dishwasher: { label: "Посудомоечная машина", icon: "🍽️", interval: 60 },
    kettle: { label: "Чайник", icon: "🫖", interval: 30 },
    airConditioner: { label: "Кондиционер", icon: "❄️", interval: 180 },
    vacuum: { label: "Пылесос", icon: "🧹", interval: 60 },
    refrigerator: { label: "Холодильник", icon: "🧊", interval: 180 },
    other: { label: "Другое", icon: "🔧", interval: 90 }
  };

  const elements = {
    summary: document.querySelector("#summary"),
    list: document.querySelector("#applianceList"),
    addButton: document.querySelector("#addButton"),
    installButton: document.querySelector("#installButton"),
    syncStatus: document.querySelector("#syncStatus"),
    syncStatusLabel: document.querySelector("#syncStatusLabel"),
    notificationButton: document.querySelector("#notificationButton"),
    dialog: document.querySelector("#applianceDialog"),
    form: document.querySelector("#applianceForm"),
    formTitle: document.querySelector("#formTitle"),
    id: document.querySelector("#applianceId"),
    name: document.querySelector("#nameInput"),
    category: document.querySelector("#categoryInput"),
    lastCleaned: document.querySelector("#lastCleanedInput"),
    interval: document.querySelector("#intervalInput"),
    deleteButton: document.querySelector("#deleteButton"),
    cancelFormButton: document.querySelector("#cancelFormButton"),
    installDialog: document.querySelector("#installDialog"),
    closeInstallButton: document.querySelector("#closeInstallButton"),
    accountDialog: document.querySelector("#accountDialog"),
    accountForm: document.querySelector("#accountForm"),
    accountTitle: document.querySelector("#accountTitle"),
    accountDescription: document.querySelector("#accountDescription"),
    emailAuthFields: document.querySelector("#emailAuthFields"),
    accountEmailInput: document.querySelector("#accountEmailInput"),
    accountPasswordInput: document.querySelector("#accountPasswordInput"),
    registerEmailButton: document.querySelector("#registerEmailButton"),
    signInEmailButton: document.querySelector("#signInEmailButton"),
    accountEmailStatus: document.querySelector("#accountEmailStatus"),
    closeAccountButton: document.querySelector("#closeAccountButton"),
    toast: document.querySelector("#toast")
  };

  let appliances = loadAppliances();
  let deferredInstallPrompt = null;
  let toastTimer = null;
  let cloudSyncTimer = null;
  let cloudReady = false;

  initialize();

  function initialize() {
    populateCategories();
    bindEvents();
    render();
    registerServiceWorker();
    checkDueNotifications();
    initializeCloudSync();

    if (isStandalone()) {
      elements.installButton.classList.add("hidden");
    }
  }

  function bindEvents() {
    elements.addButton.addEventListener("click", () => openForm());
    elements.cancelFormButton.addEventListener("click", () => elements.dialog.close());
    elements.form.addEventListener("submit", saveFromForm);
    elements.deleteButton.addEventListener("click", deleteFromForm);
    elements.category.addEventListener("change", applySuggestedInterval);
    elements.list.addEventListener("click", handleListClick);
    elements.installButton.addEventListener("click", handleInstall);
    elements.closeInstallButton.addEventListener("click", () => elements.installDialog.close());
    elements.notificationButton.addEventListener("click", enableNotifications);
    elements.syncStatus.addEventListener("click", openAccountDialog);
    elements.closeAccountButton.addEventListener("click", () => elements.accountDialog.close());
    elements.accountForm.addEventListener("submit", registerEmailAccount);
    elements.signInEmailButton.addEventListener("click", signInEmailAccount);

    window.addEventListener("homecleaner:cloudstatus", (event) => {
      const { state, label, detail } = event.detail;
      elements.syncStatus.className = `sync-status ${state}`;
      elements.syncStatusLabel.textContent = label;
      elements.syncStatus.dataset.detail = detail || label;
      elements.syncStatus.title = detail || label;
    });

    window.addEventListener("homecleaner:authstate", (event) => {
      renderAccountState(event.detail);
    });

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
    });

    window.addEventListener("appinstalled", () => {
      deferredInstallPrompt = null;
      elements.installButton.classList.add("hidden");
      showToast("Приложение установлено");
    });
  }

  function populateCategories() {
    elements.category.innerHTML = Object.entries(categories)
      .map(([value, item]) => `<option value="${value}">${item.icon} ${item.label}</option>`)
      .join("");
  }

  function loadAppliances() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function persist(sync = true) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appliances));
    if (sync) scheduleCloudSync();
  }

  async function initializeCloudSync() {
    if (!window.HomeCleanerCloud) return;

    try {
      appliances = await window.HomeCleanerCloud.initialize(appliances);
      cloudReady = true;
      persist(false);
      render();
    } catch (error) {
      window.HomeCleanerCloud.reportError(error);
    }
  }

  function openAccountDialog() {
    if (window.HomeCleanerCloud?.account) {
      renderAccountState(window.HomeCleanerCloud.account);
    }
    elements.accountDialog.showModal();
  }

  function renderAccountState(account) {
    const pendingEmail = account.pendingEmail || (!account.emailConfirmed ? account.email : "");
    const awaitingConfirmation = Boolean(pendingEmail) && !account.emailConfirmed;
    const connected = !account.isAnonymous && account.emailConfirmed && Boolean(account.email);
    elements.emailAuthFields.classList.toggle("hidden", connected);
    elements.accountEmailStatus.classList.toggle("hidden", !connected && !awaitingConfirmation);

    if (connected) {
      elements.accountTitle.textContent = "Email подключён";
      elements.accountDescription.textContent = "Данные можно восстановить после переустановки и использовать на другом устройстве.";
      elements.accountEmailStatus.textContent = account.email;
      return;
    }

    if (awaitingConfirmation) {
      elements.accountTitle.textContent = "Подтвердите email";
      elements.accountDescription.textContent = "Откройте ссылку из письма, затем вернитесь сюда и нажмите «У меня уже есть аккаунт».";
      elements.accountEmailStatus.textContent = pendingEmail;
      elements.accountEmailInput.value = pendingEmail;
      return;
    }

    elements.accountTitle.textContent = "Защитите свои данные";
    elements.accountDescription.textContent = "Создайте email-аккаунт без смены текущего профиля или войдите в существующий.";
    elements.accountEmailStatus.classList.add("hidden");
  }

  async function registerEmailAccount(event) {
    event.preventDefault();
    const credentials = accountCredentials();
    if (!credentials) return;

    setAccountBusy(true, "Создание…");
    try {
      const result = await window.HomeCleanerCloud.registerWithEmail(credentials.email, credentials.password);
      renderAccountState(window.HomeCleanerCloud.account);
      showToast(result.confirmationRequired ? "Проверьте письмо для подтверждения email" : "Email подключён");
    } catch (error) {
      showToast(authErrorMessage(error));
    } finally {
      setAccountBusy(false);
    }
  }

  async function signInEmailAccount() {
    const credentials = accountCredentials();
    if (!credentials) return;

    setAccountBusy(true, "Вход…");
    try {
      const result = await window.HomeCleanerCloud.signInWithEmail(credentials.email, credentials.password);
      if (result.changedUser && appliances.length) {
        const now = new Date().toISOString();
        appliances = appliances.map((item) => ({
          ...item,
          id: createId(),
          createdAt: item.createdAt || now,
          updatedAt: now
        }));
        persist(false);
      }
      await initializeCloudSync();
      renderAccountState(window.HomeCleanerCloud.account);
      showToast("Вход выполнен");
    } catch (error) {
      showToast(authErrorMessage(error));
    } finally {
      setAccountBusy(false);
    }
  }

  function accountCredentials() {
    const email = elements.accountEmailInput.value.trim().toLowerCase();
    const password = elements.accountPasswordInput.value;
    if (!elements.accountEmailInput.reportValidity() || !elements.accountPasswordInput.reportValidity()) return null;
    return { email, password };
  }

  function setAccountBusy(busy, label = "Создать аккаунт") {
    elements.registerEmailButton.disabled = busy;
    elements.signInEmailButton.disabled = busy;
    elements.accountEmailInput.disabled = busy;
    elements.accountPasswordInput.disabled = busy;
    elements.registerEmailButton.textContent = busy ? label : "Создать аккаунт";
  }

  function authErrorMessage(error) {
    const code = error?.code || "";
    if (code === "invalid_credentials") return "Неверный email или пароль";
    if (code === "email_not_confirmed") return "Сначала подтвердите email по ссылке из письма";
    if (code === "user_already_exists" || /already registered/i.test(error?.message || "")) {
      return "Этот email уже зарегистрирован — нажмите «У меня уже есть аккаунт»";
    }
    return error?.message || "Не удалось выполнить вход";
  }

  function scheduleCloudSync() {
    if (!cloudReady) return;
    window.clearTimeout(cloudSyncTimer);
    cloudSyncTimer = window.setTimeout(async () => {
      try {
        await window.HomeCleanerCloud.save(appliances);
      } catch (error) {
        window.HomeCleanerCloud.reportError(error);
      }
    }, 500);
  }

  function render() {
    const ordered = [...appliances].sort((a, b) => dueDate(a) - dueDate(b));
    renderSummary(ordered);

    if (ordered.length === 0) {
      elements.list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon" aria-hidden="true">✨</div>
          <h2>Добавьте первую технику</h2>
          <p>Укажите дату и периодичность — приложение рассчитает следующую чистку.</p>
        </div>`;
      return;
    }

    elements.list.innerHTML = ordered.map(renderCard).join("");
  }

  function renderSummary(ordered) {
    const overdue = ordered.filter((item) => daysUntilDue(item) < 0).length;
    const dueSoon = ordered.filter((item) => {
      const days = daysUntilDue(item);
      return days >= 0 && days <= 7;
    }).length;

    let value = "Всё под контролем";
    let note = ordered.length === 0 ? "Добавьте технику, чтобы начать" : "Ближайших чисток пока нет";

    if (overdue > 0) {
      value = "Пора заняться чисткой";
      note = `Просрочено устройств: ${overdue}`;
    } else if (dueSoon > 0) {
      value = "Скоро понадобится забота";
      note = `В ближайшие 7 дней: ${dueSoon}`;
    }

    elements.summary.innerHTML = `
      <p class="summary-label">Состояние дома</p>
      <p class="summary-value">${value}</p>
      <p class="summary-note">${note}</p>`;
  }

  function renderCard(appliance) {
    const category = categories[appliance.category] || categories.other;
    const status = statusFor(appliance);
    const cleanCount = Array.isArray(appliance.records) ? appliance.records.length : 0;

    return `
      <article class="appliance-card">
        <div class="card-main">
          <div class="category-icon" aria-hidden="true">${category.icon}</div>
          <div class="card-copy">
            <p class="card-title">${escapeHtml(appliance.name)}</p>
            <p class="card-date">Следующая: ${formatDate(dueDate(appliance))}</p>
          </div>
          <span class="status ${status.kind}">${status.label}</span>
        </div>
        <div class="card-actions">
          <button class="card-action" type="button" data-action="clean" data-id="${appliance.id}">✓ Очищено</button>
          <button class="card-action secondary" type="button" data-action="edit" data-id="${appliance.id}">
            ${cleanCount ? `История: ${cleanCount}` : "Изменить"}
          </button>
        </div>
      </article>`;
  }

  function openForm(appliance = null) {
    const today = toDateInput(new Date());
    elements.form.reset();
    elements.id.value = appliance?.id || "";
    elements.name.value = appliance?.name || "";
    elements.category.value = appliance?.category || "washingMachine";
    elements.lastCleaned.value = appliance?.lastCleaned || today;
    elements.lastCleaned.max = today;
    elements.interval.value = appliance?.interval || categories.washingMachine.interval;
    elements.formTitle.textContent = appliance ? "Техника" : "Новая техника";
    elements.deleteButton.classList.toggle("hidden", !appliance);
    elements.dialog.showModal();
    window.setTimeout(() => elements.name.focus(), 100);
  }

  function saveFromForm(event) {
    event.preventDefault();

    const id = elements.id.value;
    const existing = appliances.find((item) => item.id === id);
    const item = {
      id: id || createId(),
      name: elements.name.value.trim(),
      category: elements.category.value,
      lastCleaned: elements.lastCleaned.value,
      interval: clamp(Number(elements.interval.value), 1, 730),
      createdAt: existing?.createdAt || new Date().toISOString(),
      records: existing?.records || [],
      updatedAt: new Date().toISOString()
    };

    if (!item.name) return;

    appliances = existing
      ? appliances.map((current) => current.id === id ? item : current)
      : [...appliances, item];

    persist();
    render();
    elements.dialog.close();
    showToast(existing ? "Изменения сохранены" : "Техника добавлена");
  }

  function deleteFromForm() {
    const id = elements.id.value;
    const appliance = appliances.find((item) => item.id === id);
    if (!appliance || !window.confirm(`Удалить «${appliance.name}» вместе с историей?`)) return;

    appliances = appliances.filter((item) => item.id !== id);
    persist();
    if (cloudReady) {
      window.HomeCleanerCloud.remove(id).catch(window.HomeCleanerCloud.reportError);
    }
    render();
    elements.dialog.close();
    showToast("Техника удалена");
  }

  function handleListClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const appliance = appliances.find((item) => item.id === button.dataset.id);
    if (!appliance) return;

    if (button.dataset.action === "edit") {
      openForm(appliance);
      return;
    }

    if (button.dataset.action === "clean") {
      const now = new Date();
      appliance.lastCleaned = toDateInput(now);
      appliance.records = [now.toISOString(), ...(appliance.records || [])].slice(0, 100);
      appliance.updatedAt = now.toISOString();
      persist();
      render();
      showToast(`«${appliance.name}» отмечена как очищенная`);
    }
  }

  function applySuggestedInterval() {
    elements.interval.value = categories[elements.category.value]?.interval || 90;
  }

  function dueDate(appliance) {
    const date = parseLocalDate(appliance.lastCleaned);
    date.setDate(date.getDate() + Number(appliance.interval || 1));
    return date;
  }

  function daysUntilDue(appliance) {
    const today = startOfDay(new Date());
    const due = startOfDay(dueDate(appliance));
    return Math.round((due - today) / 86400000);
  }

  function statusFor(appliance) {
    const days = daysUntilDue(appliance);
    if (days < 0) return { kind: "overdue", label: `Просрочено ${Math.abs(days)} дн.` };
    if (days === 0) return { kind: "soon", label: "Сегодня" };
    if (days <= 7) return { kind: "soon", label: `Через ${days} дн.` };
    return { kind: "planned", label: `Через ${days} дн.` };
  }

  async function enableNotifications() {
    if (!("Notification" in window)) {
      showToast("Этот браузер не поддерживает уведомления");
      return;
    }

    if (!isStandalone() && isIOS()) {
      elements.installDialog.showModal();
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      const pushEnabled = await subscribeToPush();
      showToast(pushEnabled ? "Фоновые напоминания включены" : "Напоминания включены при открытии");
      await checkDueNotifications(true);
    } else {
      showToast("Уведомления не разрешены");
    }
  }

  async function subscribeToPush() {
    if (!window.HomeCleanerCloud?.user || !("PushManager" in window)) return false;

    try {
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(window.HomeCleanerCloud.vapidPublicKey)
        });
      }
      await window.HomeCleanerCloud.savePushSubscription(subscription);
      return true;
    } catch (error) {
      window.HomeCleanerCloud.reportError(error);
      return false;
    }
  }

  async function checkDueNotifications(force = false) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    const today = toDateInput(new Date());
    if (!force && localStorage.getItem(NOTICE_KEY) === today) return;

    const dueItems = appliances.filter((item) => daysUntilDue(item) <= 0);
    if (dueItems.length === 0) return;

    const registration = await navigator.serviceWorker?.ready;
    if (!registration) return;

    await registration.showNotification("Пора почистить технику", {
      body: dueItems.length === 1
        ? `${dueItems[0].name} ждёт плановой очистки.`
        : `Устройств к очистке: ${dueItems.length}.`,
      icon: "./app-icon-192.png",
      badge: "./app-icon-192.png",
      tag: `cleaning-${today}`,
      data: { url: "./" }
    });
    localStorage.setItem(NOTICE_KEY, today);
  }

  async function handleInstall() {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      return;
    }

    elements.installDialog.showModal();
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch (error) {
      console.warn("Service worker registration failed", error);
    }
  }

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }

  function createId() {
    return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function urlBase64ToUint8Array(value) {
    const padding = "=".repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
    const bytes = atob(base64);
    return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
  }

  function parseLocalDate(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function toDateInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDate(date) {
    return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(date);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function escapeHtml(value) {
    return value.replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      "\"": "&quot;"
    })[character]);
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("visible");
    toastTimer = window.setTimeout(() => elements.toast.classList.remove("visible"), 2600);
  }
})();
