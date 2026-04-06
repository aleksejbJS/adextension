// content.js — content script orchestrator
(function () {
  var foundAds = [], rules = null, observer = null;
  var cssInjected = false, scanDebounce = null, scanning = false;
  var manualMode = false, hoverTarget = null;

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
    var vpArea = window.innerWidth * window.innerHeight;
    if (!vpArea) return 0;
    var area = 0;
    ads.forEach(function (ad) {
      if (!ad.element) return;
      var r = ad.element.getBoundingClientRect();
      area += r.width * r.height;
    });
    return Math.min(Math.round((area / vpArea) * 100), 100);
  }

  function sendBadge(count) {
    chrome.runtime.sendMessage({ action: 'updateBadge', count: count }, function () {
      void chrome.runtime.lastError;
    });
  }

  function runScan() {
    if (!rules) return { ads: [], popunders: [], vast: [], density: 0 };
    scanning = true; injectCSS(); clearHighlights();
    foundAds = detectAds(rules);
    applyHighlights(foundAds);
    var pop = (typeof detectPopunders === 'function') ? detectPopunders(rules) : [];
    var vast = (typeof detectVAST === 'function') ? detectVAST() : [];
    var density = calcDensity(foundAds);
    scanning = false;
    sendBadge(foundAds.length + pop.length + vast.length);
    return { ads: foundAds, popunders: pop, vast: vast, density: density };
  }

  function startObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(function () {
      if (scanning || manualMode) return;
      if (scanDebounce) clearTimeout(scanDebounce);
      scanDebounce = setTimeout(function () { runScan(); }, 1500);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function serialize(scan) {
    var mapAd = function (a) { return { network: a.network, format: a.format, size: a.size, reason: a.reason }; };
    var mapExtra = function (p) { return { type: p.type, detail: p.detail }; };
    return { ads: scan.ads.map(mapAd), popunders: (scan.popunders||[]).map(mapExtra),
      vast: (scan.vast||[]).map(mapExtra), density: scan.density || 0 };
  }

  // --- Manual marking ---
  function onManualHover(e) {
    e.stopPropagation();
    if (hoverTarget) hoverTarget.classList.remove('ad-detector-hover');
    hoverTarget = e.target;
    if (!hoverTarget.classList.contains('ad-detector-highlight')) hoverTarget.classList.add('ad-detector-hover');
  }
  function onManualClick(e) {
    e.preventDefault(); e.stopPropagation();
    var el = e.target;
    el.classList.remove('ad-detector-hover');
    if (el.classList.contains('ad-detector-highlight')) return;
    injectCSS();
    el.classList.add('ad-detector-highlight');
    var badge = document.createElement('div');
    badge.className = 'ad-detector-badge';
    badge.innerText = 'Manual';
    el.appendChild(badge);
    var fmt = (typeof detectFormat === 'function') ? detectFormat(el, rules ? rules.formatRules : null) : 'unknown';
    foundAds.push({ element: el, network: 'Manual', format: fmt,
      size: el.offsetWidth + 'x' + el.offsetHeight, reason: 'manual: user-selected' });
    sendBadge(foundAds.length);
  }
  function onManualKey(e) { if (e.key === 'Escape') stopManual(); }
  function startManual() {
    manualMode = true; injectCSS(); document.body.style.cursor = 'crosshair';
    document.addEventListener('mouseover', onManualHover, true);
    document.addEventListener('click', onManualClick, true);
    document.addEventListener('keydown', onManualKey, true);
  }
  function stopManual() {
    manualMode = false; document.body.style.cursor = '';
    if (hoverTarget) hoverTarget.classList.remove('ad-detector-hover');
    hoverTarget = null;
    document.removeEventListener('mouseover', onManualHover, true);
    document.removeEventListener('click', onManualClick, true);
    document.removeEventListener('keydown', onManualKey, true);
  }

  // --- Messages ---
  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg.action === 'filterAds') {
      if (!rules) {
        chrome.runtime.sendMessage({ action: 'getRules' }, function (resp) {
          if (resp && resp.rules) {
            rules = resp.rules;
            chrome.storage.local.get('customDomains', function (data) {
              if (data.customDomains) applyCustomRules(data.customDomains);
              sendResponse(serialize(runScan()));
              startObserver();
            });
          } else { sendResponse({ ads: [], popunders: [], vast: [], density: 0 }); }
        });
        return true;
      }
      var scan = runScan(); startObserver();
      sendResponse(serialize(scan));
      return;
    }
    if (msg.action === 'getResults') {
      sendResponse(serialize({ ads: foundAds, density: calcDensity(foundAds) }));
      return;
    }
    if (msg.action === 'getMode') { sendResponse({ manualMode: manualMode }); return; }
    if (msg.action === 'startManualMode') startManual();
    if (msg.action === 'stopManualMode') stopManual();
    if (msg.action === 'disableHighlight') {
      scanning = true; clearHighlights(); scanning = false;
      foundAds = [];
      if (observer) { observer.disconnect(); observer = null; }
      sendBadge(0);
    }
    if (msg.action === 'scrollToAd') {
      var t = foundAds[msg.adIndex];
      if (t && t.element && document.contains(t.element)) {
        t.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        t.element.classList.add('ad-detector-focus');
        setTimeout(function () { t.element.classList.remove('ad-detector-focus'); }, 2000);
      }
    }
  });

  function applyCustomRules(domains) {
    if (!rules || !domains || !domains.length) return;
    if (!rules.networks['Custom']) rules.networks['Custom'] = { domains: [], scriptPatterns: [] };
    rules.networks['Custom'].domains = domains;
  }
})();
