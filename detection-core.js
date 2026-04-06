// detection-core.js — ad detection engine (pure detection, no DOM changes)

function detectAds(rules) {
  const results = [];
  const seen = new Set();

  // Detect by domains in <script>, <iframe>, <img>, <source>
  const tagSelectors = ['script[src]', 'iframe[src]', 'img[src]', 'source[src]'];
  document.querySelectorAll(tagSelectors.join(',')).forEach(el => {
    const src = el.src || el.getAttribute('src');
    if (!src) return;

    for (const [network, config] of Object.entries(rules.networks)) {
      const domains = config.domains || [];
      if (!domains.some(d => src.includes(d))) continue;

      let container = el;

      // source → find parent <video>
      if (el.tagName === 'SOURCE') {
        const video = el.closest('video');
        if (video) container = video;
      }

      // iframe with wrapper config → highlight parent container
      if (el.tagName === 'IFRAME' && config.iframeWrapper) {
        const wrapper = el.closest(config.iframeWrapper);
        if (wrapper) container = wrapper;
      }

      if (seen.has(container)) break;
      seen.add(container);

      results.push({
        element: container,
        network,
        format: detectFormat(container, rules.formatRules),
        size: container.offsetWidth + 'x' + container.offsetHeight,
        reason: 'domain: ' + extractHost(src)
      });
      break;
    }
  });

  // Heuristic: text patterns per network (TreeWalker instead of querySelectorAll('*'))
  for (const [network, config] of Object.entries(rules.networks)) {
    const patterns = config.textPatterns || [];
    if (!patterns.length || !document.body) continue;

    const containerSels = config.containerSelectors || [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

    while (walker.nextNode()) {
      const text = walker.currentNode.textContent.toLowerCase();
      if (!patterns.some(p => text.includes(p))) continue;

      const el = walker.currentNode.parentElement;
      if (!el) continue;

      let container = el;
      for (const sel of containerSels) {
        const match = el.closest(sel);
        if (match) { container = match; break; }
      }

      if (seen.has(container)) continue;
      seen.add(container);

      results.push({
        element: container,
        network,
        format: detectFormat(container, rules.formatRules),
        size: container.offsetWidth + 'x' + container.offsetHeight,
        reason: 'text: "' + text.trim().substring(0, 50) + '"'
      });
    }
  }

  return results;
}

function detectFormat(container, formatRules) {
  if (!formatRules) return 'unknown';

  // Video detection
  const videoEl = container.querySelector('video') || container.closest('video');
  if (videoEl) {
    const prerollSels = formatRules.video_preroll?.parentSelectors || [];
    if (prerollSels.some(s => videoEl.closest(s))) return 'video_preroll';
    const outstreamHints = formatRules.outstream?.classHints || [];
    const cls = container.className?.toLowerCase() || '';
    if (outstreamHints.some(h => cls.includes(h))) return 'outstream';
    return 'video';
  }

  // Native ad detection
  const cls = container.className?.toLowerCase() || '';
  const nativeHints = formatRules.native?.classHints || [];
  if (nativeHints.some(h => cls.includes(h))) return 'native';
  const nativeSels = formatRules.native?.selectors || [];
  if (nativeSels.some(s => container.matches?.(s) || container.querySelector(s))) return 'native';

  // Banner detection by IAB size
  const w = container.offsetWidth;
  const h = container.offsetHeight;
  const bannerSizes = formatRules.banner?.sizes || [];
  if (bannerSizes.includes(w + 'x' + h)) return 'banner';

  // Fallback: iframe/img with reasonable size is likely a banner
  if ((container.tagName === 'IFRAME' || container.tagName === 'IMG') && w >= 100 && h >= 50) {
    return 'banner';
  }

  return 'unknown';
}

function extractHost(src) {
  try { return new URL(src, location.href).hostname; }
  catch { return src.substring(0, 40); }
}
