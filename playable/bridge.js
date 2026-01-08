// bridge.js (ad build)
// Click-through:
// - In Pangle/TikTok playable environment: call window.openAppStore()
// - In local browser preview: fall back to opening the store URL

(() => {
  const CLICK_URL = "https://play.google.com/store/apps/details?id=com.filthyfrank.app";

  function safeOpen(url) {
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (_e) {}
  }

  window.PlayableBridge = {
    clickUrl: CLICK_URL,
    openStore() {
      if (typeof window.openAppStore === "function") {
        try {
          window.openAppStore();
          return;
        } catch (_e) {}
      }
      if (CLICK_URL) safeOpen(CLICK_URL);
    },
    track(_eventName, _payload) {},
  };
})();
