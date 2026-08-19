/* content.js — точка входа на страницах аукционов:
   1) кнопка «APEX» поверх страницы открывает панель прямо на сайте аукциона;
   2) отвечает на запрос данных от панели/фонового скрипта. */
(function (global) {
  "use strict";
  const ApexX = global.ApexX;
  const isIaai = /(^|\.)iaai\.com$/i.test(location.hostname);
  const site = isIaai ? ApexX.iaai : ApexX.copart;

  let panel = null;
  let button = null;

  function panelUrl(tabId) {
    const base = chrome.runtime.getURL("src/ui/panel.html");
    return `${base}?mode=inline${tabId ? "&tabId=" + tabId : ""}`;
  }

  function togglePanel() {
    if (panel) {
      panel.remove();
      panel = null;
      return;
    }
    chrome.runtime.sendMessage({ type: "apex:whoami" }, (res) => {
      panel = document.createElement("iframe");
      panel.className = "apexPanelFrame";
      panel.src = panelUrl(res && res.tabId);
      panel.setAttribute("allow", "clipboard-write");
      document.documentElement.appendChild(panel);
    });
  }

  function mountButton() {
    if (button || !site || !site.isLotPage()) return;
    button = document.createElement("button");
    button.className = "apexFloatBtn";
    button.type = "button";
    button.textContent = "APEX → пост";
    button.title = "Собрать данные лота и подготовить пост";
    button.addEventListener("click", togglePanel);
    document.documentElement.appendChild(button);
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "apex:extract") {
      Promise.resolve()
        .then(() => site.extract(msg.pageVars))
        .then((lot) => {
          lot.pageUrl = location.href;
          lot.grabbedAt = new Date().toISOString();
          sendResponse({ ok: true, lot });
        })
        .catch((error) => sendResponse({ ok: false, error: String((error && error.message) || error) }));
      return true;
    }
    if (msg && msg.type === "apex:closePanel") {
      if (panel) {
        panel.remove();
        panel = null;
      }
      sendResponse({ ok: true });
      return true;
    }
    if (msg && msg.type === "apex:ping") {
      sendResponse({ ok: true, auction: isIaai ? "iaai" : "copart", isLotPage: !!(site && site.isLotPage()) });
      return true;
    }
    return false;
  });

  mountButton();
  // SPA-навигация: Copart и IAAI меняют URL без перезагрузки
  let lastHref = location.href;
  setInterval(() => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    if (panel) {
      panel.remove();
      panel = null;
    }
    if (button && !(site && site.isLotPage())) {
      button.remove();
      button = null;
    }
    mountButton();
  }, 1200);
})(typeof window !== "undefined" ? window : self);
