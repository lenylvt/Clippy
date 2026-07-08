chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'open-clip-editor') return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes('youtube.com/watch')) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_CLIP_EDITOR' });
  } catch {
    // Content script pas encore prêt
  }
});
