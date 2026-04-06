// popup.js — popup UI controller
var summaryEl = document.getElementById('summary');
var listEl = document.getElementById('adsList');
var densityFill = document.getElementById('densityFill');
var densityPct = document.getElementById('densityPct');
var filterNet = document.getElementById('filterNetwork');
var filterFmt = document.getElementById('filterFormat');
var extraSection = document.getElementById('extraSection');
var extraList = document.getElementById('extraList');
var manualBtn = document.getElementById('manualMode');
var allAds = [], currentTabId = null;

// Tabs
document.querySelectorAll('.tab').forEach(function (tab) {
  tab.addEventListener('click', function () {
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
    document.querySelectorAll('.tab-content').forEach(function (c) { c.classList.remove('active'); });
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// Scan
document.getElementById('scanAds').addEventListener('click', async function () {
  var tab = await getActiveTab();
  if (!tab) { summaryEl.textContent = 'Страница не поддерживается'; return; }
  summaryEl.textContent = 'Сканирование...';
  chrome.tabs.sendMessage(tab.id, { action: 'filterAds' }, function (resp) {
    if (chrome.runtime.lastError || !resp) { summaryEl.textContent = 'Ошибка: перезагрузите страницу'; return; }
    currentTabId = tab.id;
    allAds = resp.ads || [];
    updateFilters(allAds); renderResults(allAds);
    renderDensity(resp.density || 0);
    renderExtra(resp.popunders || [], resp.vast || []);
  });
});

// Clear
document.getElementById('clearHighlight').addEventListener('click', async function () {
  var tab = await getActiveTab();
  if (!tab) return;
  chrome.tabs.sendMessage(tab.id, { action: 'disableHighlight' });
  allAds = []; listEl.innerHTML = '';
  summaryEl.textContent = 'Найдено: 0';
  renderDensity(0); extraSection.style.display = 'none';
});

// Manual mode
manualBtn.addEventListener('click', async function () {
  var tab = await getActiveTab();
  if (!tab) return;
  if (manualBtn.classList.contains('active-mode')) {
    chrome.tabs.sendMessage(tab.id, { action: 'stopManualMode' });
    manualBtn.textContent = 'Отметить вручную';
    manualBtn.classList.remove('active-mode');
    chrome.tabs.sendMessage(tab.id, { action: 'getResults' }, function (resp) {
      if (!resp) return;
      currentTabId = tab.id; allAds = resp.ads || [];
      updateFilters(allAds); renderResults(allAds); renderDensity(resp.density || 0);
    });
  } else {
    chrome.tabs.sendMessage(tab.id, { action: 'startManualMode' });
    manualBtn.textContent = 'Завершить пометку';
    manualBtn.classList.add('active-mode');
    window.close();
  }
});

// Export report
document.getElementById('exportReport').addEventListener('click', async function () {
  var tab = await getActiveTab();
  if (!tab) return;
  chrome.tabs.sendMessage(tab.id, { action: 'getResults' }, function (resp) {
    if (chrome.runtime.lastError || !resp) return;
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, function (screenshot) {
      var report = { url: tab.url, title: tab.title, timestamp: new Date().toISOString(),
        ads: resp.ads || [], popunders: resp.popunders || [], vast: resp.vast || [],
        density: resp.density || 0, screenshot: screenshot || null };
      var blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'ad-report-' + Date.now() + '.json';
      document.body.appendChild(a); a.click(); a.remove();
    });
  });
});

// Filters
filterNet.addEventListener('change', applyFilters);
filterFmt.addEventListener('change', applyFilters);
function applyFilters() {
  var net = filterNet.value, fmt = filterFmt.value;
  renderResults(allAds.filter(function (ad) {
    return (!net || ad.network === net) && (!fmt || ad.format === fmt);
  }));
}
function updateFilters(ads) {
  var nets = new Set(), fmts = new Set();
  ads.forEach(function (a) { nets.add(a.network); fmts.add(a.format); });
  filterNet.innerHTML = '<option value="">Все сети (' + nets.size + ')</option>';
  nets.forEach(function (n) { filterNet.innerHTML += '<option>' + n + '</option>'; });
  filterFmt.innerHTML = '<option value="">Все форматы</option>';
  fmts.forEach(function (f) { filterFmt.innerHTML += '<option>' + f + '</option>'; });
}
function renderResults(ads) {
  listEl.innerHTML = ''; summaryEl.textContent = 'Найдено: ' + ads.length;
  ads.forEach(function (ad, i) {
    var div = document.createElement('div');
    div.className = 'ad-entry';
    div.innerHTML = '<span class="format-tag ' + ad.format + '">' + ad.format + '</span> <span>' + ad.network + ' (' + ad.size + ')</span>';
    div.title = ad.reason;
    div.addEventListener('click', function () {
      if (currentTabId) chrome.tabs.sendMessage(currentTabId, { action: 'scrollToAd', adIndex: i });
    });
    listEl.appendChild(div);
  });
}
function renderDensity(pct) {
  densityFill.style.width = pct + '%';
  densityFill.className = 'bar-fill' + (pct > 30 ? ' high' : '');
  densityPct.textContent = pct + '%';
}
function renderExtra(popunders, vast) {
  var items = popunders.concat(vast);
  if (!items.length) { extraSection.style.display = 'none'; return; }
  extraSection.style.display = 'block'; extraList.innerHTML = '';
  items.forEach(function (item) {
    var div = document.createElement('div');
    div.className = 'extra-entry';
    div.innerHTML = '<span class="format-tag ' + item.type + '">' + item.type + '</span> ' + item.detail;
    extraList.appendChild(div);
  });
}

// Restore on open + check manual mode
(async function () {
  var tab = await getActiveTab();
  if (!tab) return;
  currentTabId = tab.id;
  chrome.tabs.sendMessage(tab.id, { action: 'getMode' }, function (r) {
    if (!chrome.runtime.lastError && r && r.manualMode) {
      manualBtn.textContent = 'Завершить пометку';
      manualBtn.classList.add('active-mode');
    }
  });
  chrome.tabs.sendMessage(tab.id, { action: 'getResults' }, function (r) {
    if (chrome.runtime.lastError || !r || !r.ads || !r.ads.length) return;
    allAds = r.ads; updateFilters(allAds); renderResults(allAds); renderDensity(r.density || 0);
  });
})();

// Settings
(function () {
  var ta = document.getElementById('customDomains');
  var st = document.getElementById('saveStatus');
  chrome.storage.local.get('customDomains', function (d) {
    if (d.customDomains) ta.value = d.customDomains.join('\n');
  });
  document.getElementById('saveCustom').addEventListener('click', function () {
    var domains = ta.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    chrome.storage.local.set({ customDomains: domains }, function () {
      st.textContent = 'Сохранено (' + domains.length + ')';
      setTimeout(function () { st.textContent = ''; }, 2000);
    });
  });
})();

async function getActiveTab() {
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  var t = tabs[0];
  if (!t || !t.id || !t.url || /^(chrome|about|chrome-extension):/.test(t.url)) return null;
  return t;
}
