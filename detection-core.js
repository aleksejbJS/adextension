// detection-core.js — ad detection engine

function detectAds(rules) {
  var results = [];
  var seen = new Set();

  // 1. Detect by domains in src/href attributes
  var tagSel = 'script[src],iframe[src],img[src],source[src],video[src],a[href],link[href]';
  document.querySelectorAll(tagSel).forEach(function (el) {
    var src = el.src || el.href || el.getAttribute('src') || '';
    if (!src || src.startsWith('data:')) return;
    matchNetwork(el, src, rules, results, seen);
  });

  // 2. Detect by inline script content (scriptPatterns)
  document.querySelectorAll('script:not([src])').forEach(function (el) {
    var text = el.textContent || '';
    if (text.length < 10) return;
    for (var i = 0; i < Object.entries(rules.networks).length; i++) {
      var entry = Object.entries(rules.networks)[i];
      var network = entry[0], config = entry[1];
      var patterns = config.scriptPatterns || [];
      var found = patterns.find(function (p) { return text.toLowerCase().includes(p); });
      if (!found) continue;
      var container = findAdContainer(el);
      if (seen.has(container)) continue;
      seen.add(container);
      results.push(buildResult(container, network, rules, 'script: ' + found));
      break;
    }
  });

  // 3. Detect by data-* attributes (zoneid, ad-zone, zone-id, ad)
  var dataSel = '[data-ad],[data-ad-zone],[data-zone-id],[data-zoneid],[data-ad-slot]';
  document.querySelectorAll(dataSel).forEach(function (el) {
    if (seen.has(el)) return;
    // Try to match to a known network by nearby script/iframe
    var network = identifyNetworkFromContext(el, rules);
    seen.add(el);
    var zoneInfo = el.dataset.zoneid || el.dataset.adZone || el.dataset.zoneId || el.dataset.ad || '';
    results.push(buildResult(el, network, rules, 'zone: ' + zoneInfo));
  });

  // 4. Detect <ins> elements (ExoClick, Adsterra pattern)
  document.querySelectorAll('ins[data-zoneid],ins[class^="eas"]').forEach(function (el) {
    if (seen.has(el)) return;
    var container = el.parentElement || el;
    if (seen.has(container)) return;
    seen.add(container);
    var zid = el.dataset.zoneid || el.className;
    results.push(buildResult(container, 'ExoClick', rules, 'ins-zone: ' + zid));
  });

  // 5. Text-based heuristic (TreeWalker)
  detectByText(rules, results, seen);

  return results;
}

function matchNetwork(el, src, rules, results, seen) {
  var entries = Object.entries(rules.networks);
  for (var i = 0; i < entries.length; i++) {
    var network = entries[i][0], config = entries[i][1];
    var domains = config.domains || [];
    if (!domains.some(function (d) { return src.includes(d); })) continue;

    // Find visible container (SCRIPT/LINK tags are invisible)
    var container = el;
    if (el.tagName === 'SCRIPT' || el.tagName === 'LINK') {
      container = findAdContainer(el);
    } else if (el.tagName === 'SOURCE') {
      var video = el.closest('video');
      if (video) container = video;
    } else if (el.tagName === 'IFRAME' && config.iframeWrapper) {
      var wrapper = el.closest(config.iframeWrapper);
      if (wrapper) container = wrapper;
    }

    if (seen.has(container)) return;
    seen.add(container);
    results.push(buildResult(container, network, rules, 'domain: ' + extractHost(src)));
    return;
  }
}

function findAdContainer(el) {
  // Look at next visible siblings (script is often followed by ad div)
  var sibling = el.nextElementSibling;
  while (sibling) {
    var tag = sibling.tagName;
    if ((tag === 'DIV' || tag === 'IFRAME' || tag === 'INS' || tag === 'SECTION') &&
        sibling.offsetWidth > 0 && sibling.offsetHeight > 0) {
      return sibling;
    }
    sibling = sibling.nextElementSibling;
  }
  // Fall back to parent container (script inside ad wrapper)
  var parent = el.parentElement;
  if (parent && parent.tagName !== 'HEAD' && parent.tagName !== 'BODY' && parent.tagName !== 'HTML') {
    return parent;
  }
  return el;
}

function identifyNetworkFromContext(el, rules) {
  // Check surrounding elements for clues about which network
  var html = (el.parentElement || el).innerHTML || '';
  var entries = Object.entries(rules.networks);
  for (var i = 0; i < entries.length; i++) {
    var network = entries[i][0], config = entries[i][1];
    var patterns = (config.scriptPatterns || []).concat(config.domains || []);
    if (patterns.some(function (p) { return html.toLowerCase().includes(p); })) return network;
  }
  return 'Unknown';
}

function detectByText(rules, results, seen) {
  if (!document.body) return;
  var entries = Object.entries(rules.networks);
  for (var i = 0; i < entries.length; i++) {
    var network = entries[i][0], config = entries[i][1];
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
      for (var j = 0; j < containerSels.length; j++) {
        var match = el.closest(containerSels[j]);
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
    format: detectFormat(container, rules ? rules.formatRules : null),
    size: container.offsetWidth + 'x' + container.offsetHeight,
    reason: reason
  };
}

function detectFormat(container, formatRules) {
  if (!formatRules) return 'unknown';
  var videoEl = container.querySelector && (container.querySelector('video') || container.closest('video'));
  if (videoEl) {
    var prerollSels = (formatRules.video_preroll || {}).parentSelectors || [];
    if (prerollSels.some(function (s) { return videoEl.closest(s); })) return 'video_preroll';
    var cls = (container.className || '').toLowerCase();
    var outHints = (formatRules.outstream || {}).classHints || [];
    if (outHints.some(function (h) { return cls.includes(h); })) return 'outstream';
    return 'video';
  }
  // Native check by class
  var cls2 = (container.className || '').toLowerCase();
  if (/native|widget/.test(cls2)) return 'native';
  var nativeHints = (formatRules.native || {}).classHints || [];
  if (nativeHints.some(function (h) { return cls2.includes(h); })) return 'native';
  // Interstitial by size
  var w = container.offsetWidth, h = container.offsetHeight;
  var vw = window.innerWidth, vh = window.innerHeight;
  if (w > vw * 0.7 && h > vh * 0.7) return 'interstitial';
  // Banner by IAB size
  var bannerSizes = (formatRules.banner || {}).sizes || [];
  if (bannerSizes.includes(w + 'x' + h)) return 'banner';
  if ((container.tagName === 'IFRAME' || container.tagName === 'IMG') && w >= 100 && h >= 50) return 'banner';
  return 'unknown';
}

function extractHost(src) {
  try { return new URL(src, location.href).hostname; }
  catch (e) { return src.substring(0, 40); }
}
