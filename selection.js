
(function() {
  if (window.hasSelectionScript) return;
  window.hasSelectionScript = true;

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'initSelection') {
      startSelection(request.dataUrl);
    }
  });

  function startSelection(dataUrl) {
    // 1. 创建全屏遮罩
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0, 0, 0, 0.4);
      cursor: crosshair;
      z-index: 2147483647;
      user-select: none;
    `;
    document.body.appendChild(overlay);

    // 2. 创建划选区域
    const selection = document.createElement('div');
    selection.style.cssText = `
      position: absolute;
      border: 2px solid #0d6efd;
      background: rgba(13, 110, 253, 0.1);
      display: none;
      pointer-events: none;
    `;
    overlay.appendChild(selection);

    let startX, startY;
    let isDrawing = false;

    overlay.onmousedown = (e) => {
      isDrawing = true;
      startX = e.clientX;
      startY = e.clientY;
      selection.style.display = 'block';
      selection.style.left = startX + 'px';
      selection.style.top = startY + 'px';
      selection.style.width = '0px';
      selection.style.height = '0px';
    };

    overlay.onmousemove = (e) => {
      if (!isDrawing) return;
      const currentX = e.clientX;
      const currentY = e.clientY;
      
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);
      const left = Math.min(currentX, startX);
      const top = Math.min(currentY, startY);

      selection.style.width = width + 'px';
      selection.style.height = height + 'px';
      selection.style.left = left + 'px';
      selection.style.top = top + 'px';
    };

    overlay.onmouseup = () => {
      if (!isDrawing) return;
      isDrawing = false;
      
      const rect = selection.getBoundingClientRect();
      if (rect.width > 5 && rect.height > 5) {
        processSelection(dataUrl, rect);
      }
      
      document.body.removeChild(overlay);
    };

    // 按 Esc 键退出
    const handleKeydown = (e) => {
      if (e.key === 'Escape') {
        document.body.removeChild(overlay);
        window.removeEventListener('keydown', handleKeydown);
      }
    };
    window.addEventListener('keydown', handleKeydown);
  }

  function processSelection(dataUrl, rect) {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // 这里的 rect 是基于视口的坐标
      // 截图是基于设备像素的，所以需要处理 devicePixelRatio
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      ctx.drawImage(
        img,
        rect.left * dpr, rect.top * dpr, rect.width * dpr, rect.height * dpr, // 源
        0, 0, canvas.width, canvas.height // 目标
      );

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const qrCode = jsQR(imageData.data, imageData.width, imageData.height);

      if (qrCode) {
        // 存储结果供 Popup 使用
        chrome.storage.local.set({ lastScannedQR: qrCode.data }, () => {
          alert('二维码识别成功！重新打开插件即可添加。');
        });
      } else {
        alert('未在所选区域内识别到二维码，请重试。');
      }
    };
    img.src = dataUrl;
  }
})();
