// background.js — service worker for Adult Ad Detector

let cachedRules = null;

async function loadRules() {
  try {
    const response = await fetch(chrome.runtime.getURL('rules.json'));
    if (!response.ok) throw new Error('HTTP ' + response.status);
    cachedRules = await response.json();
    return cachedRules;
  } catch (error) {
    console.error('[AD] Failed to load rules.json:', error);
    return null;
  }
}

loadRules();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getRules') {
    if (cachedRules) {
      sendResponse({ rules: cachedRules });
    } else {
      loadRules().then(rules => sendResponse({ rules }));
      return true;
    }
    return;
  }

  if (message.action === 'updateBadge') {
    const tabId = sender.tab?.id;
    if (!tabId) return;
    const count = message.count || 0;

    chrome.action.setBadgeText({ text: count > 0 ? String(count) : '', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#facc15', tabId });

    chrome.action.setIcon({
      path: {
        '16': (count > 0 ? 'icon16.png' : 'icon-off-16.png'),
        '48': (count > 0 ? 'icon48.png' : 'icon-off-48.png'),
        '128': (count > 0 ? 'icon128.png' : 'icon-off-128.png')
      },
      tabId
    });
  }
});
