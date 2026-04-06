// content.js — content script for Adult Ad Detector

(function () {
  let foundAds = [];
  let rules = null;
  let observer = null;
  let cssInjected = false;
  let scanDebounce = null;
  let scanning = false;

  function injectCSS() {
    if (cssInjected) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('highlight.css');
    document.head.appendChild(link);
    cssInjected = true;
  }

  function clearHighlights() {
    document.querySelectorAll('.ad-detector-highlight').forEach(el => {
      el.classList.remove('ad-detector-highlight', 'ad-detector-focus');
      el.querySelectorAll('.ad-detector-badge').forEach(b => b.remove());
    });
  }

  function applyHighlights(ads) {
    ads.forEach(ad => {
      if (ad.element.classList.contains('ad-detector-highlight')) return;
      ad.element.classList.add('ad-detector-highlight');
      const badge = document.createElement('div');
      badge.className = 'ad-detector-badge';
      badge.innerText = 'AD';
      ad.element.appendChild(badge);
    });
  }

  function runScan() {
    if (!rules) return [];
    scanning = true;
    injectCSS();
    clearHighlights();
    foundAds = detectAds(rules);
    applyHighlights(foundAds);
    scanning = false;
    chrome.runtime.sendMessage({ action: 'updateBadge', count: foundAds.length });
    return foundAds;
  }

  function startObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      if (scanning) return;
      if (scanDebounce) clearTimeout(scanDebounce);
      scanDebounce = setTimeout(() => runScan(), 1000);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function serializeAds(ads) {
    return ads.map(({ network, format, size, reason }) => ({ network, format, size, reason }));
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'filterAds') {
      if (!rules) {
        chrome.runtime.sendMessage({ action: 'getRules' }, (resp) => {
          if (resp?.rules) {
            rules = resp.rules;
            const ads = runScan();
            startObserver();
            sendResponse({ ads: serializeAds(ads) });
          } else {
            sendResponse({ ads: [] });
          }
        });
        return true;
      }
      const ads = runScan();
      startObserver();
      sendResponse({ ads: serializeAds(ads) });
      return true;
    }

    if (msg.action === 'getResults') {
      sendResponse({ ads: serializeAds(foundAds) });
      return;
    }

    if (msg.action === 'disableHighlight') {
      scanning = true;
      clearHighlights();
      scanning = false;
      foundAds = [];
      if (observer) { observer.disconnect(); observer = null; }
      chrome.runtime.sendMessage({ action: 'updateBadge', count: 0 });
    }

    if (msg.action === 'scrollToAd') {
      const target = foundAds[msg.adIndex];
      if (target?.element) {
        target.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.element.classList.add('ad-detector-focus');
        setTimeout(() => target.element.classList.remove('ad-detector-focus'), 2000);
      }
    }
  });
})();
