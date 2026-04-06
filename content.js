// content.js — content script orchestrator

(function () {
  var foundAds = [];
  var rules = null;
  var observer = null;
  var cssInjected = false;
  var scanDebounce = null;
  var scanning = false;

  function injectCSS() {
    if (cssInjected) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('highlight.css');
    document.head.appendChild(link);
    cssInjected = true;
  }

  function clearHighlights() {
    document.querySelectorAll('.ad-detector-highlight').forEach(function (el) {
      el.classList.remove('ad-detector-highlight', 'ad-detector-focus');
      el.querySelectorAll('.ad-detector-badge').forEach(function (b) { b.remove(); });
    });
  }

  function applyHighlights(ads) {
    ads.forEach(function (ad) {
      if (!ad.element || ad.element.classList.contains('ad-detector-highlight')) return;
      ad.element.classList.add('ad-detector-highlight');
      var badge = document.createElement('div');
      badge.className = 'ad-detector-badge';
      badge.innerText = ad.network.substring(0, 12);
      ad.element.appendChild(badge);
    });
  }

  function calcDensity(ads) {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var vpArea = vw * vh;
    if (vpArea === 0) return 0;
    var adArea = 0;
    ads.forEach(function (ad) {
      if (!ad.element) return;
      var r = ad.element.getBoundingClientRect();
      adArea += r.width * r.height;
    });
    return Math.min(Math.round((adArea / vpArea) * 100), 100);
  }

  function runScan() {
    if (!rules) return { ads: [], popunders: [], vast: [], density: 0 };
    scanning = true;
    injectCSS();
    clearHighlights();
    foundAds = detectAds(rules);
    applyHighlights(foundAds);
    var popunders = (typeof detectPopunders === 'function') ? detectPopunders(rules) : [];
    var vast = (typeof detectVAST === 'function') ? detectVAST() : [];
    var density = calcDensity(foundAds);
    scanning = false;
    var total = foundAds.length + popunders.length + vast.length;
    chrome.runtime.sendMessage({ action: 'updateBadge', count: total }, function () {
      void chrome.runtime.lastError;
    });
    return { ads: foundAds, popunders: popunders, vast: vast, density: density };
  }

  function startObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(function () {
      if (scanning) return;
      if (scanDebounce) clearTimeout(scanDebounce);
      scanDebounce = setTimeout(function () { runScan(); }, 1500);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function serializeResult(scan) {
    return {
      ads: scan.ads.map(function (a) {
        return { network: a.network, format: a.format, size: a.size, reason: a.reason };
      }),
      popunders: scan.popunders.map(function (p) {
        return { type: p.type, detail: p.detail };
      }),
      vast: scan.vast.map(function (v) {
        return { type: v.type, detail: v.detail };
      }),
      density: scan.density
    };
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg.action === 'filterAds') {
      if (!rules) {
        chrome.runtime.sendMessage({ action: 'getRules' }, function (resp) {
          if (resp && resp.rules) {
            rules = resp.rules;
            // Also load custom rules from storage
            chrome.storage.local.get('customDomains', function (data) {
              if (data.customDomains) applyCustomRules(data.customDomains);
              var scan = runScan();
              startObserver();
              sendResponse(serializeResult(scan));
            });
          } else {
            sendResponse({ ads: [], popunders: [], vast: [], density: 0 });
          }
        });
        return true;
      }
      var scan = runScan();
      startObserver();
      sendResponse(serializeResult(scan));
      return;
    }

    if (msg.action === 'getResults') {
      var scan = { ads: foundAds, popunders: [], vast: [], density: calcDensity(foundAds) };
      sendResponse(serializeResult(scan));
      return;
    }

    if (msg.action === 'disableHighlight') {
      scanning = true;
      clearHighlights();
      scanning = false;
      foundAds = [];
      if (observer) { observer.disconnect(); observer = null; }
      chrome.runtime.sendMessage({ action: 'updateBadge', count: 0 }, function () {
        void chrome.runtime.lastError;
      });
    }

    if (msg.action === 'scrollToAd') {
      var target = foundAds[msg.adIndex];
      if (target && target.element && document.contains(target.element)) {
        target.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.element.classList.add('ad-detector-focus');
        setTimeout(function () { target.element.classList.remove('ad-detector-focus'); }, 2000);
      }
    }
  });

  function applyCustomRules(customDomains) {
    if (!rules || !customDomains || !customDomains.length) return;
    if (!rules.networks['Custom']) {
      rules.networks['Custom'] = { domains: [], scriptPatterns: [] };
    }
    rules.networks['Custom'].domains = customDomains;
  }
})();
