// detection-popunder.js — pop-under, tab-under, and interstitial detection

var popunderLog = [];

function detectPopunders(rules) {
  popunderLog = [];
  detectPopunderScripts(rules);
  detectOverlayAds(rules);
  return popunderLog;
}

// Detect scripts that set up pop-unders by content analysis
function detectPopunderScripts(rules) {
  var hints = (rules.formatRules.popunder || {}).scriptHints || [];
  document.querySelectorAll('script').forEach(function (el) {
    var src = (el.src || '').toLowerCase();
    var text = (el.textContent || '').toLowerCase();

    // Check src URL
    if (src && hints.some(function (h) { return src.includes(h); })) {
      popunderLog.push({
        type: 'popunder_script',
        detail: 'Script src: ' + extractHost(src),
        element: el
      });
      return;
    }

    // Check inline script content
    if (text.length < 20) return;
    var found = hints.find(function (h) { return text.includes(h); });
    if (found) {
      popunderLog.push({
        type: 'popunder_script',
        detail: 'Inline script contains: ' + found,
        element: el
      });
      return;
    }

    // Detect window.open patterns
    if (/window\s*\.\s*open\s*\(/.test(text) && /click|mouse|touch/i.test(text)) {
      popunderLog.push({
        type: 'popunder_script',
        detail: 'window.open on click event',
        element: el
      });
    }
  });

  // Check for known popunder network domains in all src attributes
  var popDomains = ['popads.net', 'popcash.net', 'popunder.net', 'propu.sh'];
  document.querySelectorAll('script[src]').forEach(function (el) {
    var src = el.src.toLowerCase();
    var match = popDomains.find(function (d) { return src.includes(d); });
    if (match) {
      popunderLog.push({
        type: 'popunder_network',
        detail: 'Pop network: ' + match,
        element: el
      });
    }
  });
}

// Detect full-screen overlay ads / interstitials
function detectOverlayAds(rules) {
  var threshold = (rules.formatRules.interstitial || {}).sizeThreshold || 0.7;
  var vw = window.innerWidth;
  var vh = window.innerHeight;

  document.querySelectorAll('div, section').forEach(function (el) {
    var style = window.getComputedStyle(el);
    var isOverlay = (style.position === 'fixed' || style.position === 'absolute') &&
      parseInt(style.zIndex) > 1000;

    if (!isOverlay) return;

    var rect = el.getBoundingClientRect();
    if (rect.width < vw * threshold || rect.height < vh * threshold) return;

    // Check if it looks like an ad (has iframe, img, or ad-related classes)
    var hasAdContent = el.querySelector('iframe, img, video') ||
      /ad|banner|promo|sponsor|overlay/i.test(el.className);

    if (hasAdContent) {
      popunderLog.push({
        type: 'interstitial',
        detail: 'Overlay ' + Math.round(rect.width) + 'x' + Math.round(rect.height),
        element: el
      });
    }
  });
}
