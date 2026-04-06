// detection-core.js — ad detection engine

function detectAds(rules) {
  const results = [];
  const seen = new Set();

  // 1. Detect by domains in src attributes
  var tagSelectors = 'script[src],iframe[src],img[src],source[src],video[src],a[href]';
  document.querySelectorAll(tagSelectors).forEach(function (el) {
    var src = el.src || el.href || el.getAttribute('src') || '';
    if (!src) return;
    matchNetwork(el, src, rules, results, seen);
  });

  // 2. Detect by inline script content (scriptPatterns)
  document.querySelectorAll('script:not([src])').forEach(function (el) {
    var text = el.textContent || '';
    if (text.length < 10) return;
    for (var _a = 0, _b = Object.entries(rules.networks); _a < _b.length; _a++) {
      var entry = _b[_a];
      var network = entry[0], config = entry[1];
      var patterns = config.scriptPatterns || [];
      if (!patterns.some(function (p) { return text.toLowerCase().includes(p); })) continue;
      // Find the ad container near this script
      var container = findAdContainer(el);
      if (seen.has(container)) continue;
      seen.add(container);
      results.push(buildResult(container, network, rules, 'script: ' + patterns.find(function (p) { return text.toLowerCase().includes(p); })));
      break;
    }
  });

  // 3. Detect by data-* attributes
  document.querySelectorAll('[data-ad],[data-ad-zone],[data-zone-id]').forEach(function (el) {
    if (seen.has(el)) return;
    seen.add(el);
    results.push(buildResult(el, 'Unknown (data-attr)', rules, 'data-attribute: ' + (el.dataset.ad || el.dataset.adZone || el.dataset.zoneId)));
  });

  // 4. Text-based heuristic (TreeWalker)
  detectByText(rules, results, seen);

  return results;
}

function matchNetwork(el, src, rules, results, seen) {
  for (var _a = 0, _b = Object.entries(rules.networks); _a < _b.length; _a++) {
    var entry = _b[_a];
    var network = entry[0], config = entry[1];
    var domains = config.domains || [];
    if (!domains.some(function (d) { return src.includes(d); })) continue;

    var container = el;
    if (el.tagName === 'SOURCE') {
      var video = el.closest('video');
      if (video) container = video;
    }
    if (el.tagName === 'IFRAME' && config.iframeWrapper) {
      var wrapper = el.closest(config.iframeWrapper);
      if (wrapper) container = wrapper;
    }
    if (seen.has(container)) return;
    seen.add(container);
    results.push(buildResult(container, network, rules, 'domain: ' + extractHost(src)));
    return;
  }
}

function detectByText(rules, results, seen) {
  if (!document.body) return;
  for (var _a = 0, _b = Object.entries(rules.networks); _a < _b.length; _a++) {
    var entry = _b[_a];
    var network = entry[0], config = entry[1];
    var patterns = config.textPatterns || [];
    if (!patterns.length) continue;
    var containerSels = config.containerSelectors || [];
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      var text = walker.currentNode.textContent.toLowerCase();
      if (!patterns.some(function (p) { return text.includes(p); })) continue;
      var el = walker.currentNode.parentElement;
      if (!el) continue;
      var container = el;
      for (var i = 0; i < containerSels.length; i++) {
        var match = el.closest(containerSels[i]);
        if (match) { container = match; break; }
      }
      if (seen.has(container)) continue;
      seen.add(container);
      results.push(buildResult(container, network, rules, 'text: "' + text.trim().substring(0, 50) + '"'));
    }
  }
}

function buildResult(container, network, rules, reason) {
  return {
    element: container,
    network: network,
    format: detectFormat(container, rules.formatRules),
    size: container.offsetWidth + 'x' + container.offsetHeight,
    reason: reason
  };
}

function findAdContainer(scriptEl) {
  var next = scriptEl.nextElementSibling;
  if (next && (next.tagName === 'DIV' || next.tagName === 'IFRAME' || next.tagName === 'INS')) {
    return next;
  }
  var parent = scriptEl.parentElement;
  if (parent && parent.tagName !== 'HEAD' && parent.tagName !== 'BODY') {
    return parent;
  }
  return scriptEl;
}

function detectFormat(container, formatRules) {
  if (!formatRules) return 'unknown';
  var videoEl = container.querySelector('video') || container.closest('video');
  if (videoEl) {
    var prerollSels = (formatRules.video_preroll || {}).parentSelectors || [];
    if (prerollSels.some(function (s) { return videoEl.closest(s); })) return 'video_preroll';
    var cls = (container.className || '').toLowerCase();
    var outHints = (formatRules.outstream || {}).classHints || [];
    if (outHints.some(function (h) { return cls.includes(h); })) return 'outstream';
    return 'video';
  }
  var cls2 = (container.className || '').toLowerCase();
  var nativeHints = (formatRules.native || {}).classHints || [];
  if (nativeHints.some(function (h) { return cls2.includes(h); })) return 'native';
  var w = container.offsetWidth, h = container.offsetHeight;
  var vw = window.innerWidth, vh = window.innerHeight;
  var threshold = (formatRules.interstitial || {}).sizeThreshold || 0.7;
  if (w > vw * threshold && h > vh * threshold) return 'interstitial';
  var bannerSizes = (formatRules.banner || {}).sizes || [];
  if (bannerSizes.includes(w + 'x' + h)) return 'banner';
  if ((container.tagName === 'IFRAME' || container.tagName === 'IMG') && w >= 100 && h >= 50) return 'banner';
  return 'unknown';
}

function extractHost(src) {
  try { return new URL(src, location.href).hostname; }
  catch (e) { return src.substring(0, 40); }
}
