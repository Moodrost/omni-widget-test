"use strict";

(() => {
  const config = window.OMNI_WIDGET_TEST;
  const checkButton = document.getElementById("check");
  const loadButton = document.getElementById("load");
  const state = document.querySelector(".connection-state");
  const title = document.getElementById("status-title");
  const detail = document.getElementById("status-detail");
  const httpStatus = document.getElementById("http-status");
  let ready = false;
  let loading = false;

  function setStatus(heading, message, error = false) {
    title.textContent = heading;
    detail.textContent = message;
    state.dataset.state = error ? "error" : "normal";
  }

  document.getElementById("origin").textContent = location.origin === "null" ? "Нет HTTP-адреса (file://)" : location.origin;
  document.getElementById("channel-name").textContent = config?.channelName || "Канал не задан";

  if (!config?.publicKey?.startsWith("pk_") || !config.channelId || !config.apiUrl || !config.sdkUrl) {
    checkButton.disabled = true;
    setStatus("Настройки не заполнены", "Добавьте публичные параметры из штатного кода вставки в config.js.", true);
    return;
  }

  checkButton.addEventListener("click", async () => {
    if (loading) return;
    ready = false;
    loadButton.disabled = true;
    if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      setStatus("Нужен адрес по HTTPS", "Разместите страницу на GitHub Pages или другом HTTPS-сайте.", true);
      return;
    }
    checkButton.disabled = true;
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
            ? "Виджет выключен или ключ не найден. Проверьте включение канала и актуальный код вставки в Space."
            : "Сервер не вернул настройки. Повторите проверку и проверьте dev-сервис.";
        setStatus("Виджет пока недоступен", explanation, true);
        return;
      }
      let payload;
      try {
        payload = await response.json();
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid config");
      } catch {
        setStatus("Сервер вернул некорректные настройки", "HTTP-запрос прошёл, но конфигурацию не удалось прочитать. Повторите проверку или проверьте dev-сервис.", true);
        return;
      }
      if (payload.channel_id && payload.channel_id !== config.channelId) {
        setStatus("Настройки относятся к другому каналу", "Получите актуальный код вставки нужного канала в Space и обновите config.js.", true);
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
      document.getElementById("checked-at").textContent = new Date().toLocaleString("ru-RU", { timeZoneName: "short" });
    }
  });

  loadButton.addEventListener("click", () => {
    if (!ready || loading || document.getElementById("omni-test-sdk")) return;
    loading = true;
    loadButton.disabled = true;
    checkButton.disabled = true;
    setStatus("Загружаем виджет", "Ожидаем окно чата от dev-сервиса.");
    const script = document.createElement("script");
    script.id = "omni-test-sdk";
    script.src = config.sdkUrl;
    script.async = true;
    script.dataset.key = config.publicKey;
    script.dataset.channelId = config.channelId;
    script.dataset.apiUrl = config.apiUrl;
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
