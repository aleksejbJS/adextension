// detection-vast.js — VAST/VPAID video ad tag detection

var vastLog = [];

function detectVAST() {
  vastLog = [];
  scanVASTScripts();
  scanVASTElements();
  scanVideoPlayers();
  return vastLog;
}

// Look for VAST/VPAID URLs in script tags
function scanVASTScripts() {
  document.querySelectorAll('script').forEach(function (el) {
    var text = el.textContent || '';
    if (text.length < 20) return;

    // VAST URL patterns
    var vastPatterns = [
      /vast[_\-]?tag/i,
      /vast[_\-]?url/i,
      /vpaid/i,
      /\.xml.*(?:vast|ad)/i,
      /adTagUrl/i,
      /ad[_\-]?tag[_\-]?url/i,
      /getVAST/i
    ];

    var matched = vastPatterns.find(function (p) { return p.test(text); });
    if (matched) {
      // Try to extract the actual URL
      var urlMatch = text.match(/["'](https?:\/\/[^"']+(?:vast|vpaid|xml|ad)[^"']*?)["']/i);
      vastLog.push({
        type: 'vast_tag',
        detail: urlMatch ? 'VAST URL: ' + urlMatch[1].substring(0, 80) : 'VAST reference in script',
        source: matched.toString()
      });
    }
  });
}

// Look for VAST-related elements and attributes
function scanVASTElements() {
  // Check for ad-related data attributes on video elements
  var videoEls = document.querySelectorAll('video, [data-vast], [data-ad-tag], [data-vpaid]');
  videoEls.forEach(function (el) {
    var vastUrl = el.dataset.vast || el.dataset.adTag || el.dataset.vpaid || '';
    if (vastUrl) {
      vastLog.push({
        type: 'vast_element',
        detail: 'VAST attr: ' + vastUrl.substring(0, 80),
        element: el
      });
    }
  });

  // Check for VAST XML in iframes
  document.querySelectorAll('iframe[src]').forEach(function (el) {
    var src = el.src.toLowerCase();
    if (/vast|vpaid|xml.*ad|ad.*xml/.test(src)) {
      vastLog.push({
        type: 'vast_iframe',
        detail: 'VAST iframe: ' + extractHost(src),
        element: el
      });
    }
  });
}

// Detect known video players with ad integrations
function scanVideoPlayers() {
  var players = [
    { selector: '.jw-wrapper, [class*="jwplayer"]', name: 'JW Player' },
    { selector: '.video-js, .vjs-tech', name: 'Video.js' },
    { selector: '.flowplayer', name: 'Flowplayer' },
    { selector: '[class*="plyr"]', name: 'Plyr' },
    { selector: '.fp-player', name: 'Fluid Player' }
  ];

  players.forEach(function (p) {
    var els = document.querySelectorAll(p.selector);
    if (!els.length) return;
    els.forEach(function (el) {
      // Check if player has ad overlay elements
      var adOverlay = el.querySelector('[class*="ad-"], [class*="-ad"], [id*="ad-"]');
      if (adOverlay) {
        vastLog.push({
          type: 'video_player_ad',
          detail: p.name + ' with ad overlay',
          element: el
        });
      }
    });
  });
}
