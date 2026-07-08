importScripts('../lib/log.js');

/** @param {chrome.tabs.Tab} tab */
async function openEditorOnTab(tab) {
  if (!tab.id || !tab.url?.includes('youtube.com/watch')) {
    clippyLog('bg', 'open_editor:skip', { url: tab.url });
    return;
  }

  clippyLog('bg', 'action:open_editor', { tabId: tab.id });

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_CLIP_EDITOR' });
  } catch (error) {
    clippyLog('bg', 'action:content_unavailable', {
      tabId: tab.id,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

async function openEditorOnActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes('youtube.com/watch')) {
    clippyLog('bg', 'command:skip', { url: tab?.url });
    return;
  }

  clippyLog('bg', 'command:open_editor', { tabId: tab.id });
  await openEditorOnTab(tab);
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url?.includes('youtube.com/watch')) {
    chrome.runtime.openOptionsPage();
    return;
  }

  await openEditorOnTab(tab);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'open-clip-editor') return;
  await openEditorOnActiveTab();
});
