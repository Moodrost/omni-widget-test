"use strict";

// Parse inert markup; never execute pasted HTML or copy event handlers.
window.parseWidgetEmbed = (value) => {
  const template = document.createElement("template");
  template.innerHTML = value.trim();
  const nodes = [...template.content.childNodes].filter(
    (node) => node.nodeType !== 8 && !(node.nodeType === 3 && !node.textContent.trim()),
  );
  if (nodes.length !== 1 || nodes[0].nodeName !== "SCRIPT") {
    throw new Error("Вставьте один тег <script …></script> из вкладки «Виджет на сайт».");
  }
  const script = nodes[0];
  const allowed = new Set(["src", "async", "defer", "id", "data-key", "data-channel-id", "data-api-url", "data-light"]);
  if (script.textContent.trim() || [...script.attributes].some((attr) => !allowed.has(attr.name))) {
    throw new Error("Нужен штатный код виджета без встроенного JavaScript и дополнительных атрибутов.");
  }
  function targetUrl(value) {
    let url;
    try { url = new URL(value); } catch { throw new Error("В коде указан некорректный URL."); }
    if (url.protocol !== "https:" || url.username || url.password || url.hash || url.port ||
        !(url.hostname === "targetai.ai" || url.hostname.endsWith(".targetai.ai"))) {
      throw new Error("Используйте HTTPS-адрес виджета Target AI из штатного кода интеграции.");
    }
    return url;
  }
  const sdk = targetUrl(script.getAttribute("src"));
  if (sdk.pathname !== "/widget/tcs-widget.js") throw new Error("Ожидается адрес /widget/tcs-widget.js.");
  const publicKey = script.getAttribute("data-key") || "";
  const channelId = script.getAttribute("data-channel-id") || "";
  if (!/^pk_[A-Za-z0-9_-]+$/.test(publicKey)) throw new Error("В коде отсутствует публичный data-key вида pk_….");
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(channelId)) {
    throw new Error("В коде отсутствует корректный data-channel-id. Скопируйте код нужного канала целиком.");
  }
  const api = targetUrl(script.getAttribute("data-api-url") || `${sdk.origin}/api/v1`);
  if (api.search) throw new Error("Адрес API должен быть без параметров запроса.");
  const config = { sdkUrl: sdk.href, apiUrl: api.href.replace(/\/$/, ""), publicKey, channelId, light: script.hasAttribute("data-light") };
  const clean = document.createElement("script");
  clean.src = config.sdkUrl;
  clean.dataset.key = publicKey;
  clean.dataset.channelId = channelId;
  clean.dataset.apiUrl = config.apiUrl;
  clean.async = true;
  if (config.light) clean.setAttribute("data-light", "");
  return { config, snippet: clean.outerHTML };
};
