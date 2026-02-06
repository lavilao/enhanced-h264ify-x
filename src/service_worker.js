// Note: The codec check script is now injected by content_script.js
// to work around Chrome 144+ restrictions on MAIN world content scripts.
// This approach also works on Chrome 109 (last version for Windows 7/8).
// See https://stackoverflow.com/a/72607832
chrome.runtime.onInstalled.addListener(async () => {
  // Unregister any previously registered MAIN world scripts to avoid conflicts
  await chrome.scripting.unregisterContentScripts({ids: ['inject']}).catch(() => {});
});