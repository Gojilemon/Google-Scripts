
// 监听来自 Popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startScreenshotScan') {
    // 1. 捕获当前可见标签页
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        return;
      }

      // 2. 注入脚本进行划选
      chrome.scripting.executeScript({
        target: { tabId: request.tabId },
        files: ['jsQR.js', 'selection.js']
      }).then(() => {
        // 3. 将截图传给 Content Script
        chrome.tabs.sendMessage(request.tabId, {
          action: 'initSelection',
          dataUrl: dataUrl
        });
      });
    });
  }
});
