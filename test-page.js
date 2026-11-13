"use strict";

(() => {
  const storageKey = "omni-widget-test:embed:v1";
  const input = document.getElementById("embed-code");
  const resetButton = document.getElementById("reset");
  let config;
  const checkButton = document.getElementById("check");
  const loadButton = document.getElementById("load");
  const state = document.querySelector(".connection-state");
  const title = document.getElementById("status-title");
  const detail = document.getElementById("status-detail");
  const httpStatus = document.getElementById("http-status");
  let ready = false;
  let loading = false;
  let checking = false;

  function setStatus(heading, message, error = false) {
    title.textContent = heading;
    detail.textContent = message;
    state.dataset.state = error ? "error" : "normal";
  }

  document.getElementById("origin").textContent = location.origin === "null" ? "Нет HTTP-адреса (file://)" : location.origin;
  document.getElementById("allowed-origin").textContent = location.origin;
  document.getElementById("channel-name").textContent = "Канал не задан";
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      input.value = window.parseWidgetEmbed(saved).snippet;
      setStatus("Код восстановлен", "Проверьте подключение или вставьте код другого канала. Виджет ещё не загружен.");
    }
  } catch { /* An invalid saved value or unavailable storage must not block the form. */ }

  input.addEventListener("input", () => {
    ready = false;
    config = undefined;
    loadButton.disabled = true;
    httpStatus.textContent = "Проверка ещё не запускалась";
    document.getElementById("checked-at").textContent = "Проверка ещё не запускалась";
    document.getElementById("channel-name").textContent = "Канал не задан";
    document.getElementById("api-url").textContent = "Не задан";
    setStatus("Код изменён", "Нажмите «Проверить подключение», чтобы проверить выбранный канал.");
  });

  resetButton.addEventListener("click", () => {
    try { localStorage.removeItem(storageKey); } catch { /* Storage can be disabled. */ }
    // A full reload also removes the SDK listeners; destroy() would revoke a session.
    location.reload();
  });

  checkButton.addEventListener("click", async () => {
    if (loading || checking) return;
    ready = false;
    loadButton.disabled = true;
    httpStatus.textContent = "Проверка ещё не запускалась";
    try {
      const parsed = window.parseWidgetEmbed(input.value);
      config = parsed.config;
      input.value = parsed.snippet;
      try { localStorage.setItem(storageKey, parsed.snippet); }
      catch { document.getElementById("embed-help").textContent = "Браузер запретил сохранение. Код работает до перезагрузки страницы."; }
      document.getElementById("channel-name").textContent = config.channelId;
      document.getElementById("api-url").textContent = config.apiUrl;
    } catch (error) {
      setStatus("Проверьте код интеграции", error.message, true);
      return;
    }
    if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      setStatus("Нужен адрес по HTTPS", "Разместите страницу на GitHub Pages или другом HTTPS-сайте.", true);
      return;
    }
    checkButton.disabled = true;
    checking = true;
    input.disabled = true;
    httpStatus.textContent = "Запрос выполняется";
    setStatus("Проверяем подключение", "Запрашиваем настройки виджета для этого адреса сайта.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const url = new URL(`${config.apiUrl.replace(/\/$/, "")}/public/widget/${encodeURIComponent(config.publicKey)}/config`);
      url.searchParams.set("channel_id", config.channelId);
      const response = await fetch(url, { cache: "no-store", credentials: "omit", signal: controller.signal });
      httpStatus.textContent = `HTTP ${response.status}`;
      if (!response.ok) {
        const explanation = response.status === 403
          ? "Сервер отказал в доступе. Проверьте, что этот адрес сайта разрешён и развёртывание виджета активно."
          : response.status === 404
            ? "Сервер не нашёл активный виджет для этого ключа и канала. Включите канал в Омни или вставьте актуальный код из «Виджет на сайт». Обновлять репозиторий не нужно."
            : "Сервер не вернул настройки. Повторите проверку и проверьте доступность сервиса.";
        setStatus("Виджет пока недоступен", explanation, true);
        return;
      }
      let payload;
      try {
        payload = await response.json();
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid config");
      } catch {
        setStatus("Сервер вернул некорректные настройки", "HTTP-запрос прошёл, но конфигурацию не удалось прочитать. Повторите проверку или проверьте доступность сервиса.", true);
        return;
      }
      if (payload.channel_id && payload.channel_id !== config.channelId) {
        setStatus("Настройки относятся к другому каналу", "Вставьте актуальный код нужного канала из вкладки «Виджет на сайт».", true);
        return;
      }
      const widgetConfig = payload.config && typeof payload.config === "object" ? payload.config : payload;
      if (widgetConfig.enabled !== true) {
        setStatus("Виджет выключен или не готов", "Проверьте включение канала и виджета в Space, затем повторите проверку.", true);
        return;
      }
      if (payload.auth?.mode === "required") {
        setStatus("Нужна авторизация посетителя", "Этот канал требует интеграцию входа на сайте. Для простого теста нужен отдельный канал с подходящим режимом авторизации.", true);
        return;
      }
      ready = true;
      loadButton.disabled = false;
      setStatus("Настройки доступны", "Можно загрузить виджет. Маршрут к агенту проверяется отправкой сообщения в чате.");
    } catch (error) {
      httpStatus.textContent = "HTTP-ответ недоступен браузеру";
      setStatus(
        "Не удалось получить настройки",
        error.name === "AbortError"
          ? "Сервер не ответил за 12 секунд. Повторите проверку."
          : "Проверьте соединение и разрешённый адрес сайта. Браузер также может блокировать запрос из-за CORS.",
        true,
      );
    } finally {
      clearTimeout(timeout);
      checkButton.disabled = false;
      checking = false;
      input.disabled = false;
      document.getElementById("checked-at").textContent = new Date().toLocaleString("ru-RU", { timeZoneName: "short" });
    }
  });

  loadButton.addEventListener("click", () => {
    if (!ready || loading || document.getElementById("omni-test-sdk")) return;
    loading = true;
    loadButton.disabled = true;
    checkButton.disabled = true;
    input.disabled = true;
    setStatus("Загружаем виджет", "Ожидаем окно чата.");
    const script = document.createElement("script");
    script.id = "omni-test-sdk";
    const sdkUrl = new URL(config.sdkUrl);
    // Leave the old, long-lived cache entry once; reuse this URL for revalidation.
    sdkUrl.searchParams.set("omni_loader", "revalidate-v1");
    script.src = sdkUrl.toString();
    script.async = true;
    script.dataset.key = config.publicKey;
    script.dataset.channelId = config.channelId;
    script.dataset.apiUrl = config.apiUrl;
    if (config.light) script.setAttribute("data-light", "");
    let observer;
    let timeout;
    const stopWatching = () => {
      observer?.disconnect();
      clearTimeout(timeout);
    };
    const fail = () => {
      stopWatching();
      // Reload before retrying: removing a script does not undo its runtime.
      setStatus("Не удалось загрузить виджет", "Перезагрузите страницу и повторите проверку. Если ошибка повторится, проверьте доступность SDK и настройки в Space.", true);
    };
    observer = new MutationObserver(() => {
      if (!document.getElementById("tcs-widget-frame")) return;
      stopWatching();
      setStatus("Виджет загружен", "Откройте чат в углу страницы и отправьте тестовое сообщение. Ответ агента ещё не проверен.");
    });
    observer.observe(document.body, { childList: true });
    timeout = setTimeout(() => {
      setStatus("Загрузка занимает больше времени", "Окно чата пока не появилось. Подождите или перезагрузите страницу для новой проверки.");
    }, 20000);
    script.onerror = fail;
    document.body.appendChild(script);
  });
})();
