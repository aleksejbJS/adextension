// popup.js — popup UI controller with filters and settings

var summaryEl = document.getElementById('summary');
var listEl = document.getElementById('adsList');
var densityFill = document.getElementById('densityFill');
var densityPct = document.getElementById('densityPct');
var filterNet = document.getElementById('filterNetwork');
var filterFmt = document.getElementById('filterFormat');
var extraSection = document.getElementById('extraSection');
var extraList = document.getElementById('extraList');
var allAds = [];
var currentTabId = null;

// Tab switching
document.querySelectorAll('.tab').forEach(function (tab) {
  tab.addEventListener('click', function () {
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
    document.querySelectorAll('.tab-content').forEach(function (c) { c.classList.remove('active'); });
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// Scan button
document.getElementById('scanAds').addEventListener('click', async function () {
  var tab = await getActiveTab();
  if (!tab) { summaryEl.textContent = 'Страница не поддерживается'; return; }
  summaryEl.textContent = 'Сканирование...';
  chrome.tabs.sendMessage(tab.id, { action: 'filterAds' }, function (resp) {
    if (chrome.runtime.lastError || !resp) {
      summaryEl.textContent = 'Ошибка: перезагрузите страницу';
      return;
    }
    currentTabId = tab.id;
    allAds = resp.ads || [];
    updateFilters(allAds);
    renderResults(allAds);
    renderDensity(resp.density || 0);
    renderExtra(resp.popunders || [], resp.vast || []);
  });
});

// Clear button
document.getElementById('clearHighlight').addEventListener('click', async function () {
  var tab = await getActiveTab();
  if (!tab) return;
  chrome.tabs.sendMessage(tab.id, { action: 'disableHighlight' });
  allAds = [];
  listEl.innerHTML = '';
  summaryEl.textContent = 'Найдено: 0';
  renderDensity(0);
  extraSection.style.display = 'none';
});

// Filters
filterNet.addEventListener('change', applyFilters);
filterFmt.addEventListener('change', applyFilters);

function applyFilters() {
  var net = filterNet.value;
  var fmt = filterFmt.value;
  var filtered = allAds.filter(function (ad) {
    if (net && ad.network !== net) return false;
    if (fmt && ad.format !== fmt) return false;
    return true;
  });
  renderResults(filtered);
}

function updateFilters(ads) {
  var networks = new Set(); var formats = new Set();
  ads.forEach(function (a) { networks.add(a.network); formats.add(a.format); });
  filterNet.innerHTML = '<option value="">Все сети (' + networks.size + ')</option>';
  networks.forEach(function (n) {
    filterNet.innerHTML += '<option value="' + n + '">' + n + '</option>';
  });
  filterFmt.innerHTML = '<option value="">Все форматы</option>';
  formats.forEach(function (f) {
    filterFmt.innerHTML += '<option value="' + f + '">' + f + '</option>';
  });
}

function renderResults(ads) {
  listEl.innerHTML = '';
  summaryEl.textContent = 'Найдено: ' + ads.length;
  ads.forEach(function (ad, i) {
    var div = document.createElement('div');
    div.className = 'ad-entry';
    var tag = '<span class="format-tag ' + ad.format + '">' + ad.format + '</span>';
    div.innerHTML = tag + ' <span>' + ad.network + ' (' + ad.size + ')</span>';
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
  extraSection.style.display = 'block';
  extraList.innerHTML = '';
  items.forEach(function (item) {
    var div = document.createElement('div');
    div.className = 'extra-entry';
    var tag = '<span class="format-tag ' + item.type + '">' + item.type + '</span> ';
    div.innerHTML = tag + item.detail;
    extraList.appendChild(div);
  });
}

// Restore on popup open
(async function () {
  var tab = await getActiveTab();
  if (!tab) return;
  currentTabId = tab.id;
  chrome.tabs.sendMessage(tab.id, { action: 'getResults' }, function (resp) {
    if (chrome.runtime.lastError || !resp || !resp.ads || !resp.ads.length) return;
    allAds = resp.ads;
    updateFilters(allAds);
    renderResults(allAds);
    renderDensity(resp.density || 0);
  });
})();

// Settings — custom domains
(function () {
  var textarea = document.getElementById('customDomains');
  var saveBtn = document.getElementById('saveCustom');
  var status = document.getElementById('saveStatus');

  chrome.storage.local.get('customDomains', function (data) {
    if (data.customDomains) textarea.value = data.customDomains.join('\n');
  });

  saveBtn.addEventListener('click', function () {
    var domains = textarea.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    chrome.storage.local.set({ customDomains: domains }, function () {
      status.textContent = 'Сохранено (' + domains.length + ' доменов)';
      setTimeout(function () { status.textContent = ''; }, 2000);
    });
  });
})();

async function getActiveTab() {
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  var tab = tabs[0];
  if (!tab || !tab.id || !tab.url) return null;
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('about:') || tab.url.startsWith('chrome-extension://')) return null;
  return tab;
}
