(() => {
  "use strict";

  const LEGACY_STORAGE_KEY = "home-cleaner-appliances-v1";
  const STORAGE_PREFIX = "home-cleaner-appliances-v2:";
  const ACTIVE_USER_KEY = "home-cleaner-active-user-v1";
  const DELETION_QUEUE_KEY = "home-cleaner-deletions-v1";
  const NOTIFICATION_HOUR_KEY = "home-cleaner-notification-hour-v1";
  const NOTIFICATION_LEAD_KEY = "home-cleaner-notification-lead-v1";
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
    notificationDialog: document.querySelector("#notificationDialog"),
    notificationStatus: document.querySelector("#notificationStatus"),
    notificationTimeInput: document.querySelector("#notificationTimeInput"),
    notificationLeadInput: document.querySelector("#notificationLeadInput"),
    enableNotificationButton: document.querySelector("#enableNotificationButton"),
    testNotificationButton: document.querySelector("#testNotificationButton"),
    disableNotificationButton: document.querySelector("#disableNotificationButton"),
    closeNotificationButton: document.querySelector("#closeNotificationButton"),
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
    historyDialog: document.querySelector("#historyDialog"),
    historyForm: document.querySelector("#historyForm"),
    historyTitle: document.querySelector("#historyTitle"),
    historyDateInput: document.querySelector("#historyDateInput"),
    historyList: document.querySelector("#historyList"),
    closeHistoryButton: document.querySelector("#closeHistoryButton"),
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
    resetPasswordButton: document.querySelector("#resetPasswordButton"),
    accountEmailStatus: document.querySelector("#accountEmailStatus"),
    resendEmailButton: document.querySelector("#resendEmailButton"),
    accountManagement: document.querySelector("#accountManagement"),
    newEmailInput: document.querySelector("#newEmailInput"),
    newPasswordInput: document.querySelector("#newPasswordInput"),
    changeEmailButton: document.querySelector("#changeEmailButton"),
    changePasswordButton: document.querySelector("#changePasswordButton"),
    syncNowButton: document.querySelector("#syncNowButton"),
    signOutButton: document.querySelector("#signOutButton"),
    deleteAccountButton: document.querySelector("#deleteAccountButton"),
    closeAccountButton: document.querySelector("#closeAccountButton"),
    updateBanner: document.querySelector("#updateBanner"),
    reloadAppButton: document.querySelector("#reloadAppButton"),
    toast: document.querySelector("#toast")
  };

  let appliances = loadAppliances();
  let deferredInstallPrompt = null;
  let toastTimer = null;
  let cloudSyncTimer = null;
  let cloudReady = false;
  let historyApplianceId = null;

  initialize();

  function initialize() {
    populateCategories();
    bindEvents();
    render();
    registerServiceWorker();
    checkDueNotifications();
    initializeCloudSync();
    handleAuthRedirectError();

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
    elements.historyForm.addEventListener("submit", addHistoryDate);
    elements.historyList.addEventListener("click", deleteHistoryDate);
    elements.closeHistoryButton.addEventListener("click", () => elements.historyDialog.close());
    elements.installButton.addEventListener("click", handleInstall);
    elements.closeInstallButton.addEventListener("click", () => elements.installDialog.close());
    elements.notificationButton.addEventListener("click", openNotificationSettings);
    elements.enableNotificationButton.addEventListener("click", enableNotifications);
    elements.testNotificationButton.addEventListener("click", testNotification);
    elements.disableNotificationButton.addEventListener("click", disableNotifications);
    elements.closeNotificationButton.addEventListener("click", () => elements.notificationDialog.close());
    elements.syncStatus.addEventListener("click", openAccountDialog);
    elements.closeAccountButton.addEventListener("click", () => elements.accountDialog.close());
    elements.accountForm.addEventListener("submit", registerEmailAccount);
    elements.signInEmailButton.addEventListener("click", signInEmailAccount);
    elements.resetPasswordButton.addEventListener("click", sendPasswordReset);
    elements.resendEmailButton.addEventListener("click", resendEmailConfirmation);
    elements.changeEmailButton.addEventListener("click", changeAccountEmail);
    elements.changePasswordButton.addEventListener("click", changeAccountPassword);
    elements.syncNowButton.addEventListener("click", syncNow);
    elements.signOutButton.addEventListener("click", signOutAccount);
    elements.deleteAccountButton.addEventListener("click", deleteAccount);
    elements.reloadAppButton.addEventListener("click", () => window.location.reload());

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

    window.addEventListener("homecleaner:passwordrecovery", () => {
      window.setTimeout(() => {
        renderAccountState(window.HomeCleanerCloud.account);
        elements.accountDialog.showModal();
        elements.newPasswordInput.focus();
        showToast("Введите новый пароль");
      }, 250);
    });

    window.addEventListener("homecleaner:deletionssynced", (event) => {
      clearDeletionQueue(event.detail.userId);
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
      const activeUserId = localStorage.getItem(ACTIVE_USER_KEY);
      const scoped = activeUserId ? localStorage.getItem(`${STORAGE_PREFIX}${activeUserId}`) : null;
      const parsed = JSON.parse(scoped || localStorage.getItem(LEGACY_STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.map(normalizeApplianceHistory) : [];
    } catch {
      return [];
    }
  }

  function persist(sync = true) {
    const userId = window.HomeCleanerCloud?.user?.id || localStorage.getItem(ACTIVE_USER_KEY);
    const key = userId ? `${STORAGE_PREFIX}${userId}` : LEGACY_STORAGE_KEY;
    localStorage.setItem(key, JSON.stringify(appliances));
    if (sync) scheduleCloudSync();
  }

  async function initializeCloudSync() {
    if (!window.HomeCleanerCloud) return;

    try {
      appliances = (await window.HomeCleanerCloud.initialize(appliances, loadDeletionQueue())).map(normalizeApplianceHistory);
      cloudReady = true;
      localStorage.setItem(ACTIVE_USER_KEY, window.HomeCleanerCloud.user.id);
      persist(false);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
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
    const awaitingConfirmation = Boolean(pendingEmail);
    const connected = !account.isAnonymous && account.emailConfirmed && Boolean(account.email);
    const showAuthFields = account.isAnonymous || !account.emailConfirmed;
    elements.emailAuthFields.classList.toggle("hidden", !showAuthFields);
    elements.accountManagement.classList.toggle("hidden", !connected);
    elements.accountEmailStatus.classList.toggle("hidden", !connected && !awaitingConfirmation);
    elements.resendEmailButton.classList.toggle("hidden", !awaitingConfirmation);

    if (awaitingConfirmation) {
      elements.accountTitle.textContent = connected ? "Подтвердите новый email" : "Подтвердите email";
      elements.accountDescription.textContent = connected
        ? "Откройте ссылку из письма — после подтверждения новый адрес появится в приложении."
        : "Откройте ссылку из письма, затем вернитесь сюда и нажмите «У меня уже есть аккаунт».";
      elements.accountEmailStatus.textContent = pendingEmail;
      elements.accountEmailInput.value = pendingEmail;
      return;
    }

    if (connected) {
      elements.accountTitle.textContent = "Email подключён";
      elements.accountDescription.textContent = "Данные можно восстановить после переустановки и использовать на другом устройстве.";
      elements.accountEmailStatus.textContent = account.email;
      return;
    }

    elements.accountTitle.textContent = "Защитите свои данные";
    elements.accountDescription.textContent = "Создайте email-аккаунт без смены текущего профиля или войдите в существующий.";
    elements.accountEmailStatus.classList.add("hidden");
  }

  async function registerEmailAccount(event) {
    event.preventDefault();
    if (elements.emailAuthFields.classList.contains("hidden")) return;
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
      if (result.changedUser) {
        appliances = [];
        localStorage.removeItem(ACTIVE_USER_KEY);
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

  async function resendEmailConfirmation() {
    const email = elements.accountEmailInput.value.trim().toLowerCase()
      || window.HomeCleanerCloud.account.pendingEmail
      || window.HomeCleanerCloud.account.email;
    if (!email) return;

    setAccountBusy(true, "Отправка…");
    elements.resendEmailButton.disabled = true;
    try {
      await window.HomeCleanerCloud.resendEmailConfirmation(email);
      showToast("Новое письмо отправлено");
    } catch (error) {
      showToast(authErrorMessage(error));
    } finally {
      elements.resendEmailButton.disabled = false;
      setAccountBusy(false);
    }
  }

  async function sendPasswordReset() {
    const email = elements.accountEmailInput.value.trim().toLowerCase();
    if (!email || !elements.accountEmailInput.reportValidity()) return;
    setAccountBusy(true, "Отправка…");
    try {
      await window.HomeCleanerCloud.sendPasswordReset(email);
      showToast("Ссылка для восстановления отправлена");
    } catch (error) {
      showToast(authErrorMessage(error));
    } finally {
      setAccountBusy(false);
    }
  }

  async function changeAccountEmail() {
    const email = elements.newEmailInput.value.trim().toLowerCase();
    if (!email || !elements.newEmailInput.reportValidity()) return;
    setAccountBusy(true, "Сохранение…");
    try {
      await window.HomeCleanerCloud.changeEmail(email);
      renderAccountState(window.HomeCleanerCloud.account);
      showToast("Подтвердите новый email по ссылке из письма");
    } catch (error) {
      showToast(authErrorMessage(error));
    } finally {
      setAccountBusy(false);
    }
  }

  async function changeAccountPassword() {
    if (!elements.newPasswordInput.reportValidity() || !elements.newPasswordInput.value) return;
    setAccountBusy(true, "Сохранение…");
    try {
      await window.HomeCleanerCloud.changePassword(elements.newPasswordInput.value);
      elements.newPasswordInput.value = "";
      showToast("Пароль изменён");
    } catch (error) {
      showToast(authErrorMessage(error));
    } finally {
      setAccountBusy(false);
    }
  }

  async function signOutAccount() {
    if (!window.confirm("Выйти из аккаунта на этом устройстве?")) return;
    setAccountBusy(true, "Выход…");
    try {
      await window.HomeCleanerCloud.signOutUser();
      appliances = [];
      localStorage.removeItem(ACTIVE_USER_KEY);
      cloudReady = false;
      render();
      await initializeCloudSync();
      elements.accountDialog.close();
      showToast("Вы вышли из аккаунта");
    } catch (error) {
      showToast(authErrorMessage(error));
    } finally {
      setAccountBusy(false);
    }
  }

  async function deleteAccount() {
    const confirmed = window.confirm("Удалить аккаунт, всю технику, историю и подписки? Это действие нельзя отменить.");
    if (!confirmed) return;
    setAccountBusy(true, "Удаление…");
    try {
      const deletedUserId = window.HomeCleanerCloud.user?.id;
      await window.HomeCleanerCloud.deleteAccount();
      if (deletedUserId) {
        localStorage.removeItem(`${STORAGE_PREFIX}${deletedUserId}`);
        clearDeletionQueue(deletedUserId);
      }
      appliances = [];
      localStorage.removeItem(ACTIVE_USER_KEY);
      cloudReady = false;
      render();
      await initializeCloudSync();
      elements.accountDialog.close();
      showToast("Аккаунт и облачные данные удалены");
    } catch (error) {
      showToast(authErrorMessage(error));
    } finally {
      setAccountBusy(false);
    }
  }

  async function syncNow() {
    setAccountBusy(true, "Синхронизация…");
    try {
      await initializeCloudSync();
      showToast("Синхронизация завершена");
    } finally {
      setAccountBusy(false);
    }
  }

  function handleAuthRedirectError() {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const errorCode = params.get("error_code");
    if (!errorCode) return;

    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
    window.setTimeout(() => {
      openAccountDialog();
      showToast(errorCode === "otp_expired"
        ? "Ссылка устарела — запросите новое письмо"
        : "Не удалось подтвердить email");
    }, 300);
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
    elements.resetPasswordButton.disabled = busy;
    elements.accountEmailInput.disabled = busy;
    elements.accountPasswordInput.disabled = busy;
    elements.resendEmailButton.disabled = busy;
    elements.changeEmailButton.disabled = busy;
    elements.changePasswordButton.disabled = busy;
    elements.syncNowButton.disabled = busy;
    elements.signOutButton.disabled = busy;
    elements.deleteAccountButton.disabled = busy;
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
    const cleanCount = appliance.records.length;

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
          <button class="card-action secondary" type="button" data-action="history" data-id="${appliance.id}">История: ${cleanCount}</button>
          <button class="card-action secondary" type="button" data-action="edit" data-id="${appliance.id}">Изменить</button>
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
      records: existing?.records || [recordTimestamp(elements.lastCleaned.value)],
      updatedAt: new Date().toISOString()
    };
    const normalizedItem = normalizeApplianceHistory(item);
    item.records = normalizedItem.records;
    item.lastCleaned = normalizedItem.records[0].slice(0, 10);

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

    queueDeletion(id);
    appliances = appliances.filter((item) => item.id !== id);
    persist();
    if (cloudReady) {
      const userId = window.HomeCleanerCloud.user?.id;
      window.HomeCleanerCloud.remove(id)
        .then(() => clearQueuedDeletion(userId, id))
        .catch(window.HomeCleanerCloud.reportError);
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

    if (button.dataset.action === "history") {
      openHistory(appliance);
      return;
    }

    if (button.dataset.action === "clean") {
      const now = new Date();
      appliance.lastCleaned = toDateInput(now);
      appliance.records = [now.toISOString(), ...normalizedRecords(appliance)
        .filter((record) => record.slice(0, 10) !== appliance.lastCleaned)].slice(0, 100);
      appliance.updatedAt = now.toISOString();
      persist();
      render();
      showToast(`«${appliance.name}» отмечена как очищенная`);
    }
  }

  function loadDeletionQueue() {
    try {
      const value = JSON.parse(localStorage.getItem(DELETION_QUEUE_KEY) || "{}");
      return value && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  }

  function queueDeletion(id) {
    const userId = window.HomeCleanerCloud?.user?.id;
    if (!userId) return;
    const queue = loadDeletionQueue();
    queue[userId] = [...new Set([...(queue[userId] || []), id])];
    localStorage.setItem(DELETION_QUEUE_KEY, JSON.stringify(queue));
  }

  function clearQueuedDeletion(userId, id) {
    if (!userId) return;
    const queue = loadDeletionQueue();
    queue[userId] = (queue[userId] || []).filter((current) => current !== id);
    if (!queue[userId].length) delete queue[userId];
    localStorage.setItem(DELETION_QUEUE_KEY, JSON.stringify(queue));
  }

  function clearDeletionQueue(userId) {
    if (!userId) return;
    const queue = loadDeletionQueue();
    delete queue[userId];
    localStorage.setItem(DELETION_QUEUE_KEY, JSON.stringify(queue));
  }

  function openHistory(appliance) {
    historyApplianceId = appliance.id;
    elements.historyTitle.textContent = appliance.name;
    elements.historyDateInput.value = toDateInput(new Date());
    elements.historyDateInput.max = toDateInput(new Date());
    renderHistory(appliance);
    elements.historyDialog.showModal();
  }

  function renderHistory(appliance) {
    const records = normalizedRecords(appliance);
    elements.historyList.innerHTML = records.length
      ? records.map((record) => {
          const date = record.slice(0, 10);
          return `<div class="history-row">
            <time datetime="${date}">${formatDate(parseLocalDate(date))}</time>
            <button class="history-delete" type="button" data-date="${date}" ${records.length === 1 ? "disabled" : ""}>Удалить</button>
          </div>`;
        }).join("")
      : '<p class="history-empty">Записей пока нет</p>';
  }

  function addHistoryDate(event) {
    event.preventDefault();
    const appliance = appliances.find((item) => item.id === historyApplianceId);
    const date = elements.historyDateInput.value;
    if (!appliance || !date) return;
    const dates = new Set(normalizedRecords(appliance).map((record) => record.slice(0, 10)));
    if (dates.has(date)) {
      showToast("Эта дата уже есть в истории");
      return;
    }
    appliance.records = [recordTimestamp(date), ...appliance.records];
    updateFromHistory(appliance);
    showToast("Дата добавлена");
  }

  function deleteHistoryDate(event) {
    const button = event.target.closest("button[data-date]");
    if (!button || button.disabled) return;
    const appliance = appliances.find((item) => item.id === historyApplianceId);
    if (!appliance) return;
    appliance.records = normalizedRecords(appliance).filter((record) => record.slice(0, 10) !== button.dataset.date);
    updateFromHistory(appliance);
    showToast("Запись удалена");
  }

  function updateFromHistory(appliance) {
    appliance.records = normalizedRecords(appliance);
    appliance.lastCleaned = appliance.records[0].slice(0, 10);
    appliance.updatedAt = new Date().toISOString();
    persist();
    render();
    renderHistory(appliance);
  }

  function normalizeApplianceHistory(item) {
    const records = normalizedRecords(item);
    const lastCleaned = item.lastCleaned || toDateInput(new Date());
    if (!records.some((record) => record.slice(0, 10) === lastCleaned)) {
      records.push(recordTimestamp(lastCleaned));
      records.sort().reverse();
    }
    return { ...item, lastCleaned, records };
  }

  function normalizedRecords(item) {
    const unique = new Map();
    for (const value of Array.isArray(item.records) ? item.records : []) {
      const date = String(value).slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) unique.set(date, recordTimestamp(date));
    }
    return [...unique.values()].sort().reverse();
  }

  function recordTimestamp(date) {
    return new Date(`${date}T12:00:00`).toISOString();
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
      elements.notificationDialog.close();
      elements.installDialog.showModal();
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      const hour = notificationHour();
      const leadDays = notificationLeadDays();
      localStorage.setItem(NOTIFICATION_HOUR_KEY, String(hour));
      localStorage.setItem(NOTIFICATION_LEAD_KEY, String(leadDays));
      const pushResult = await subscribeToPush(hour, leadDays);
      await renderNotificationSettings();
      if (pushResult.enabled && !pushResult.leadDaysSupported && leadDays > 0) {
        showToast("Время сохранено; примените миграцию для раннего напоминания");
      } else {
        showToast(pushResult.enabled ? "Фоновые напоминания включены" : "Напоминания включены при открытии");
      }
      await checkDueNotifications(true);
    } else {
      showToast("Уведомления не разрешены");
    }
  }

  async function openNotificationSettings() {
    const hour = Number(localStorage.getItem(NOTIFICATION_HOUR_KEY) || 10);
    const leadDays = Number(localStorage.getItem(NOTIFICATION_LEAD_KEY) || 0);
    elements.notificationTimeInput.value = `${String(hour).padStart(2, "0")}:00`;
    elements.notificationLeadInput.value = String(leadDays);
    await renderNotificationSettings();
    elements.notificationDialog.showModal();
  }

  async function renderNotificationSettings() {
    const subscription = await currentPushSubscription();
    const supported = "Notification" in window;
    const enabled = supported && Notification.permission === "granted" && Boolean(subscription);
    elements.notificationStatus.textContent = enabled
      ? `Фоновые напоминания включены на ${elements.notificationTimeInput.value}`
      : supported && Notification.permission === "denied"
        ? "Уведомления запрещены в настройках iPhone"
        : supported
          ? "Фоновые напоминания ещё не включены"
          : "Этот браузер не поддерживает уведомления";
    elements.enableNotificationButton.textContent = enabled ? "Сохранить время" : "Включить напоминания";
    elements.disableNotificationButton.classList.toggle("hidden", !enabled);
  }

  function notificationHour() {
    return clamp(Number(elements.notificationTimeInput.value.split(":")[0]), 0, 23);
  }

  function notificationLeadDays() {
    return clamp(Number(elements.notificationLeadInput.value), 0, 30);
  }

  async function currentPushSubscription() {
    if (!("serviceWorker" in navigator)) return null;
    try {
      const registration = await navigator.serviceWorker.ready;
      return registration.pushManager.getSubscription();
    } catch {
      return null;
    }
  }

  async function subscribeToPush(preferredHour = notificationHour(), remindDaysBefore = notificationLeadDays()) {
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
      const result = await window.HomeCleanerCloud.savePushSubscription(subscription, preferredHour, remindDaysBefore);
      return { enabled: true, leadDaysSupported: result.leadDaysSupported };
    } catch (error) {
      window.HomeCleanerCloud.reportError(error);
      return { enabled: false, leadDaysSupported: false };
    }
  }

  async function testNotification() {
    if (!("Notification" in window) || Notification.permission !== "granted") {
      showToast("Сначала включите уведомления");
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification("Дом в порядке", {
      body: "Тестовое напоминание работает.",
      icon: "./app-icon-192.png",
      badge: "./app-icon-192.png",
      data: { url: "./" }
    });
    showToast("Тестовое уведомление отправлено");
  }

  async function disableNotifications() {
    const subscription = await currentPushSubscription();
    if (!subscription) return;
    try {
      await window.HomeCleanerCloud.removePushSubscription(subscription.endpoint);
      await subscription.unsubscribe();
      await renderNotificationSettings();
      showToast("Фоновые напоминания отключены");
    } catch (error) {
      window.HomeCleanerCloud.reportError(error);
      showToast("Не удалось отключить напоминания");
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
      const hadController = Boolean(navigator.serviceWorker.controller);
      let updateAvailable = false;
      const registration = await navigator.serviceWorker.register("./sw.js");
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && hadController) updateAvailable = true;
        });
      });
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (hadController || updateAvailable) elements.updateBanner.classList.remove("hidden");
      });
      await registration.update();
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
