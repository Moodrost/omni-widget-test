"use strict";
document.getElementById("run").onclick = async () => {
  const result = document.getElementById("result");
  const run = document.getElementById("run");
  const frame = document.getElementById("page");
  const key = "omni-widget-test:embed:v1";
  const saved = localStorage.getItem(key);
  const channel = "11111111-2222-3333-4444-555555555555";
  const snippet = `<script src="https://tcs-gw.targetai.ai/widget/tcs-widget.js" data-key="pk_test" data-channel-id="${channel}" async></script>`;
  let count = 0;
  const assert = (condition, message) => { if (!condition) throw new Error(message); count++; };
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  run.disabled = true;
  try {
    localStorage.removeItem(key);
    await new Promise((resolve) => { frame.onload = resolve; frame.src = "../index.html"; });
    let win = frame.contentWindow;
    let doc = win.document;
    const parse = win.parseWidgetEmbed;
    const config = parse(snippet).config;
    assert(config.apiUrl === "https://tcs-gw.targetai.ai/api/v1", "API inference");
    assert(config.channelId === channel && config.publicKey === "pk_test", "Channel/key extraction");
    const custom = parse(snippet.replace(" async", ' data-api-url="https://other.targetai.ai/api/v1/" data-light')).config;
    assert(custom.light && custom.apiUrl === "https://other.targetai.ai/api/v1", "Custom API and light attribute");
    assert(parse(parse(snippet).snippet).config.apiUrl === config.apiUrl, "Saved snippet roundtrip");
    const invalid = ["", snippet + snippet, snippet + "<img src=x>", snippet.replace(" async", ' onclick="alert(1)"'), snippet.replace("</script>", "alert(1)</script>"), snippet.replace("https:", "http:"), snippet.replace("tcs-gw.targetai.ai", "targetai.ai.example.com"), snippet.replace("pk_test", "secret_test"), snippet.replace(channel, "bad"), snippet.replace("tcs-widget.js", "evil.js")];
    for (const value of invalid) {
      let rejected = false;
      try { parse(value); } catch { rejected = true; }
      assert(rejected, "Reject invalid embed: " + value);
    }
    let calls = 0;
    let status = 404;
    let payload = { config: { enabled: true }, channel_id: channel };
    let lastUrl;
    win.fetch = async (url) => { calls++; lastUrl = new URL(url); return { status, ok: status === 200, json: async () => payload }; };
    const input = () => doc.getElementById("embed-code");
    const edit = (value) => { input().value = value; input().dispatchEvent(new win.Event("input")); };
    const check = async () => { doc.getElementById("check").click(); await tick(); };
    assert(calls === 0 && !input().value, "Empty startup does not restore old channel");
    edit("bad"); await check();
    assert(calls === 0, "Invalid embed does not fetch");
    edit(snippet); await check();
    assert(doc.getElementById("http-status").textContent === "HTTP 404", "404 shown");
    assert(doc.getElementById("load").disabled, "404 prevents SDK load");
    assert(lastUrl.searchParams.get("channel_id") === channel && lastUrl.pathname.endsWith("/pk_test/config"), "Config targets pasted channel/key");
    status = 200; await check();
    assert(!doc.getElementById("load").disabled, "Enabled config permits load");
    edit(snippet.replace("pk_test", "pk_next"));
    assert(doc.getElementById("load").disabled, "Editing invalidates successful check");
    payload = { config: { enabled: false } }; await check();
    assert(doc.getElementById("load").disabled, "Disabled config rejected");
    payload = { config: { enabled: true }, channel_id: "different" }; await check();
    assert(doc.getElementById("load").disabled, "Mismatched channel rejected");
    payload = { config: { enabled: true }, auth: { mode: "required" } }; await check();
    assert(doc.getElementById("load").disabled, "Required auth rejected");
    payload = null; await check();
    assert(doc.getElementById("load").disabled, "Invalid JSON shape rejected");
    payload = { config: { enabled: true }, channel_id: channel }; await check();
    let sdkLoads = 0;
    let sdk;
    const append = doc.body.appendChild.bind(doc.body);
    doc.body.appendChild = (node) => {
      if (node.id !== "omni-test-sdk") return append(node);
      sdkLoads++; sdk = node;
      const dummy = doc.createElement("div"); dummy.id = "tcs-widget-frame";
      return append(dummy); // Never load real SDK or create a backend session.
    };
    doc.getElementById("load").click(); doc.getElementById("load").click(); await tick();
    assert(sdkLoads === 1, "No duplicate SDK load");
    assert(sdk.dataset.key === "pk_next" && sdk.dataset.channelId === channel, "SDK receives current identifiers");
    assert(input().disabled && doc.getElementById("status-title").textContent === "Виджет загружен", "Loaded state and edits locked");
    await new Promise((resolve) => { frame.onload = resolve; win.location.reload(); });
    win = frame.contentWindow; doc = win.document;
    assert(input().value.includes("pk_next"), "Config survives reload");
    assert(doc.getElementById("load").disabled && !doc.getElementById("omni-test-sdk"), "Reload does not auto-load SDK");
    await new Promise((resolve) => { frame.onload = resolve; doc.getElementById("reset").click(); });
    win = frame.contentWindow; doc = win.document;
    assert(!input().value && !localStorage.getItem(key), "Switch clears saved config and runtime");
    result.textContent = `PASS: ${count} проверок. Реальный SDK и API не вызывались.`;
  } catch (error) {
    result.textContent = `FAIL после ${count} проверок: ${error.stack}`;
  } finally {
    if (saved === null) localStorage.removeItem(key); else localStorage.setItem(key, saved);
    run.disabled = false;
  }
};
