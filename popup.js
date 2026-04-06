// popup.js — popup UI controller

const scanBtn = document.getElementById('scanAds');
const clearBtn = document.getElementById('clearHighlight');
const summaryEl = document.getElementById('summary');
const listEl = document.getElementById('adsList');

scanBtn.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab) {
    summaryEl.textContent = 'Эта страница не поддерживается';
    return;
  }
  summaryEl.textContent = 'Сканирование...';
  chrome.tabs.sendMessage(tab.id, { action: 'filterAds' }, (response) => {
    if (chrome.runtime.lastError || !response?.ads) {
      summaryEl.textContent = 'Ошибка сканирования';
      return;
    }
    renderResults(response.ads, tab.id);
  });
});

clearBtn.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab) return;
  chrome.tabs.sendMessage(tab.id, { action: 'disableHighlight' });
  listEl.innerHTML = '';
  summaryEl.textContent = 'Найдено: 0';
});

// Restore results on popup open
(async () => {
  const tab = await getActiveTab();
  if (!tab) return;
  chrome.tabs.sendMessage(tab.id, { action: 'getResults' }, (response) => {
    if (chrome.runtime.lastError || !response?.ads?.length) return;
    renderResults(response.ads, tab.id);
  });
})();

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) return null;
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) return null;
  if (tab.url.startsWith('chrome-extension://')) return null;
  return tab;
}

function renderResults(ads, tabId) {
  listEl.innerHTML = '';
  summaryEl.textContent = 'Найдено: ' + ads.length;
  ads.forEach((ad, i) => {
    const div = document.createElement('div');
    div.className = 'ad-entry';
    div.textContent = (i + 1) + '. [' + ad.format + '] ' + ad.network + ' (' + ad.size + ')';
    div.title = ad.reason;
    div.addEventListener('click', () => {
      if (tabId) chrome.tabs.sendMessage(tabId, { action: 'scrollToAd', adIndex: i });
    });
    listEl.appendChild(div);
  });
}
