
document.addEventListener('DOMContentLoaded', function () {
  // 主题切换逻辑
  const themeSwitch = document.querySelector('.theme-switch input[type="checkbox"]');
  const body = document.body;

  // 加载保存的主题
  chrome.storage.local.get({ theme: 'light' }, (data) => {
    if (data.theme === 'dark') {
      body.classList.add('dark-mode');
      themeSwitch.checked = true;
    }
  });

  themeSwitch.addEventListener('change', (e) => {
    if (e.target.checked) {
      body.classList.add('dark-mode');
      chrome.storage.local.set({ theme: 'dark' });
    } else {
      body.classList.remove('dark-mode');
      chrome.storage.local.set({ theme: 'light' });
    }
  });

  // Tab 切换逻辑
  const mfaTabBtn = document.getElementById('mfa-tab-btn');
  const akSkTabBtn = document.getElementById('ak-sk-tab-btn');
  const mfaPane = document.getElementById('mfa-pane');
  const akSkPane = document.getElementById('ak-sk-pane');

  mfaTabBtn.addEventListener('click', () => {
    mfaTabBtn.classList.add('active');
    akSkTabBtn.classList.remove('active');
    mfaPane.classList.remove('d-none');
    akSkPane.classList.add('d-none');
  });

  akSkTabBtn.addEventListener('click', () => {
    akSkTabBtn.classList.add('active');
    mfaTabBtn.classList.remove('active');
    akSkPane.classList.remove('d-none');
    mfaPane.classList.add('d-none');
  });

  // MFA 相关元素
  const mfaList = document.getElementById('mfa-list');
  const mfaSecretInput = document.getElementById('mfa-secret');
  const mfaNameInput = document.getElementById('mfa-name');
  const addMfaButton = document.getElementById('add-mfa');
  const mfaPreview = document.getElementById('mfa-preview');
  const previewCode = document.getElementById('preview-code');
  const uploadQrButton = document.getElementById('upload-qr');
  const qrFileInput = document.getElementById('qr-file-input');
  const scanPageButton = document.getElementById('scan-page');
  const toggleAddMfaBtn = document.getElementById('toggle-add-mfa');
  const addMfaCard = document.getElementById('add-mfa-card');

  // AK/SK 相关元素
  const akSkList = document.getElementById('ak-sk-list');
  const akSkNameInput = document.getElementById('ak-sk-name');
  const akInput = document.getElementById('ak');
  const skInput = document.getElementById('sk');
  const addAkSkButton = document.getElementById('add-ak-sk');
  const toggleAddAkskBtn = document.getElementById('toggle-add-aksk');
  const addAkskCard = document.getElementById('add-aksk-card');

  let mfaInterval;

  // --- 折叠/展开逻辑 ---
  toggleAddMfaBtn.addEventListener('click', () => {
    addMfaCard.classList.toggle('d-none');
    toggleAddMfaBtn.textContent = addMfaCard.classList.contains('d-none') ? '+ 添加新 MFA' : '- 取消添加';
  });

  toggleAddAkskBtn.addEventListener('click', () => {
    addAkskCard.classList.toggle('d-none');
    toggleAddAkskBtn.textContent = addAkskCard.classList.contains('d-none') ? '+ 添加新 AK/SK 对' : '- 取消添加';
  });

  // --- MFA 逻辑 ---

  // 通用识别二维码函数
  function decodeQRFromDataURL(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        context.drawImage(img, 0, 0);

        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        
        if (code) {
          try {
            // 尝试解析为 URL
            const url = new URL(code.data);
            if (url.protocol === 'otpauth:') {
              const secret = url.searchParams.get('secret');
              const issuer = url.searchParams.get('issuer') || '';
              let name = decodeURIComponent(url.pathname.split('/').pop() || '');
              if (issuer && !name.includes(issuer)) {
                name = `${issuer}:${name}`;
              }
              resolve({ secret, name });
            } else {
              reject('该二维码不是有效的 MFA 配置链接');
            }
          } catch (err) {
            // 如果不是 URL，尝试直接作为 secret
            resolve({ secret: code.data, name: '识别出的密钥' });
          }
        } else {
          reject('未能识别二维码，请确保图片清晰且包含二维码');
        }
      };
      img.onerror = () => reject('图片加载失败');
      img.src = dataUrl;
    });
  }

  // 处理识别结果
  function handleDecodeResult(result) {
    if (result.secret) {
      mfaSecretInput.value = result.secret;
      mfaNameInput.value = result.name || '识别出的 MFA';
      mfaSecretInput.dispatchEvent(new Event('input'));
      showFeedback('二维码识别成功');
    }
  }

  // 1. 上传图片识别
  uploadQrButton.addEventListener('click', () => {
    qrFileInput.click();
  });

  qrFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      decodeQRFromDataURL(event.target.result)
        .then(handleDecodeResult)
        .catch(alert);
    };
    reader.readAsDataURL(file);
    qrFileInput.value = '';
  });

  // 2. 截图扫描 (区域识别)
  scanPageButton.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        // 发送消息给后台脚本启动截图流程
        chrome.runtime.sendMessage({
          action: 'startScreenshotScan',
          tabId: tabs[0].id
        });
        // 关闭弹出框以便划选
        window.close();
      }
    });
  });

  // 3. 支持粘贴截图
  document.addEventListener('paste', (event) => {
    const items = (event.clipboardData || event.originalEvent.clipboardData).items;
    for (let index in items) {
      const item = items[index];
      if (item.kind === 'file' && item.type.indexOf('image') !== -1) {
        const blob = item.getAsFile();
        const reader = new FileReader();
        reader.onload = (event) => {
          decodeQRFromDataURL(event.target.result)
            .then(handleDecodeResult)
            .catch(() => {
              // 粘贴不含二维码时不弹 alert，以免干扰正常使用
              console.log('粘贴的内容不含有效二维码');
            });
        };
        reader.readAsDataURL(blob);
      }
    }
  });

  // 实时预览动态码
  mfaSecretInput.addEventListener('input', function() {
    const secret = mfaSecretInput.value.trim().replace(/\s/g, '');
    if (secret.length > 5) { // 至少输入 6 位才开始尝试计算
      try {
        let totp = new OTPAuth.TOTP({ 
          secret: secret,
          digits: 6,
          period: 30
        });
        const code = totp.generate();
        previewCode.textContent = code;
        mfaPreview.classList.remove('d-none');
        mfaSecretInput.classList.remove('is-invalid');
      } catch (e) {
        previewCode.textContent = '无效 Secret';
        mfaPreview.classList.remove('d-none');
        mfaSecretInput.classList.add('is-invalid');
      }
    } else {
      mfaPreview.classList.add('d-none');
      mfaSecretInput.classList.remove('is-invalid');
    }
  });

  function loadMfaSecrets() {
    chrome.storage.local.get({ mfaSecrets: [] }, function (data) {
      mfaList.innerHTML = '';
      const secrets = data.mfaSecrets;
      if (secrets.length === 0) {
        mfaList.innerHTML = '<div class="p-3 text-center text-muted small">暂无 MFA 密钥</div>';
        return;
      }

      secrets.forEach((secret, index) => {
        const item = document.createElement('div');
        item.className = 'mfa-item';

        const mainInfo = document.createElement('div');
        mainInfo.className = 'mfa-main';

        const nameInfo = document.createElement('div');
        nameInfo.className = 'mfa-name';
        nameInfo.textContent = secret.name;
        nameInfo.title = secret.name; // 悬停显示完整名称

        const codeSpan = document.createElement('span');
        codeSpan.className = 'mfa-code';
        codeSpan.title = '点击复制';
        codeSpan.addEventListener('click', () => copyToClipboard(codeSpan.textContent, '动态码已复制'));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-outline-danger btn-sm py-0 px-2';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.title = '删除';
        deleteBtn.addEventListener('click', () => deleteMfaSecret(index));

        mainInfo.appendChild(nameInfo);
        mainInfo.appendChild(codeSpan);
        mainInfo.appendChild(deleteBtn);

        // 进度条容器
        const progressContainer = document.createElement('div');
        progressContainer.className = 'mfa-progress-container';
        const progressBar = document.createElement('div');
        progressBar.className = 'mfa-progress-bar';
        progressContainer.appendChild(progressBar);

        item.appendChild(mainInfo);
        item.appendChild(progressContainer);
        mfaList.appendChild(item);
      });

      updateMfaCodes(secrets);
      if (mfaInterval) clearInterval(mfaInterval);
      mfaInterval = setInterval(() => updateMfaCodes(secrets), 200); // 频率提高到 200ms
    });
  }

  function updateMfaCodes(secrets) {
    const mfaCodeElements = document.querySelectorAll('.mfa-code');
    const progressBars = document.querySelectorAll('.mfa-progress-bar');
    
    secrets.forEach((secret, index) => {
      try {
        const secretClean = secret.secret.replace(/\s/g, '');
        let totp = new OTPAuth.TOTP({
          issuer: "MFA",
          label: secret.name,
          algorithm: "SHA1",
          digits: 6,
          period: 30,
          secret: secretClean,
        });

        // 获取精确的时间（包含毫秒）以实现更平滑的进度条
        const now = Date.now();
        const seconds = Math.floor(now / 1000);
        const msInPeriod = now % 30000; // 30 秒周期内的毫秒数
        const remainingMs = 30000 - msInPeriod;
        const remainingSeconds = Math.ceil(remainingMs / 1000);
        
        let token = totp.generate();
        if (mfaCodeElements[index]) {
          mfaCodeElements[index].textContent = token;
        }

        // 更新进度条
        if (progressBars[index]) {
          const width = (remainingMs / 30000) * 100;
          progressBars[index].style.width = width + '%';
          
          // 倒计时少于 5 秒时变红
          if (remainingSeconds <= 5) {
            progressBars[index].style.backgroundColor = '#dc3545';
          } else {
            progressBars[index].style.backgroundColor = '#0d6efd';
          }
        }
      } catch (e) {
        if (mfaCodeElements[index]) {
          mfaCodeElements[index].textContent = '错误';
          mfaCodeElements[index].classList.add('text-danger');
        }
      }
    });
  }

  addMfaButton.addEventListener('click', function () {
    const secret = mfaSecretInput.value.trim();
    const name = mfaNameInput.value.trim();

    if (!secret || !name) {
      alert('请填写完整的名称和密钥');
      return;
    }

    chrome.storage.local.get({ mfaSecrets: [] }, function (data) {
      const secrets = data.mfaSecrets;
      secrets.push({ name, secret });
      chrome.storage.local.set({ mfaSecrets: secrets }, function () {
        mfaSecretInput.value = '';
        mfaNameInput.value = '';
        mfaPreview.classList.add('d-none');
        addMfaCard.classList.add('d-none');
        toggleAddMfaBtn.textContent = '+ 添加新 MFA';
        loadMfaSecrets();
      });
    });
  });

  function deleteMfaSecret(index) {
    if (confirm('确定要删除这个 MFA 密钥吗？')) {
      chrome.storage.local.get({ mfaSecrets: [] }, function (data) {
        let secrets = data.mfaSecrets;
        secrets.splice(index, 1);
        chrome.storage.local.set({ mfaSecrets: secrets }, function () {
          loadMfaSecrets();
        });
      });
    }
  }

  // --- AK/SK 逻辑 ---

  function loadAkSkPairs() {
    chrome.storage.local.get({ akSkPairs: [] }, function (data) {
      akSkList.innerHTML = '';
      const pairs = data.akSkPairs;
      if (pairs.length === 0) {
        akSkList.innerHTML = '<div class="p-3 text-center text-muted small">暂无 AK/SK 对</div>';
        return;
      }

      pairs.forEach((pair, index) => {
        const item = document.createElement('div');
        item.className = 'aksk-item';

        const header = document.createElement('div');
        header.className = 'aksk-header';
        header.innerHTML = `<span class="aksk-name">${pair.name}</span>`;

        const actions = document.createElement('div');
        actions.className = 'aksk-actions';

        const copyAkBtn = document.createElement('button');
        copyAkBtn.className = 'btn btn-outline-primary btn-sm px-2';
        copyAkBtn.textContent = 'AK';
        copyAkBtn.addEventListener('click', () => copyToClipboard(pair.ak, 'Access Key 已复制'));

        const copySkBtn = document.createElement('button');
        copySkBtn.className = 'btn btn-outline-primary btn-sm px-2';
        copySkBtn.textContent = 'SK';
        copySkBtn.addEventListener('click', () => copyToClipboard(pair.sk, 'Secret Key 已复制'));

        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn-outline-danger btn-sm px-2';
        delBtn.innerHTML = '&times;';
        delBtn.addEventListener('click', () => deleteAkSkPair(index));

        actions.appendChild(copyAkBtn);
        actions.appendChild(copySkBtn);
        actions.appendChild(delBtn);

        header.appendChild(actions);
        item.appendChild(header);
        akSkList.appendChild(item);
      });
    });
  }

  addAkSkButton.addEventListener('click', function () {
    const name = akSkNameInput.value.trim();
    const ak = akInput.value.trim();
    const sk = skInput.value.trim();

    if (!name || !ak || !sk) {
      alert('请填写完整的信息');
      return;
    }

    chrome.storage.local.get({ akSkPairs: [] }, function (data) {
      const pairs = data.akSkPairs;
      pairs.push({ name, ak, sk });
      chrome.storage.local.set({ akSkPairs: pairs }, function () {
        akSkNameInput.value = '';
        akInput.value = '';
        skInput.value = '';
        addAkskCard.classList.add('d-none');
        toggleAddAkskBtn.textContent = '+ 添加新 AK/SK 对';
        loadAkSkPairs();
      });
    });
  });

  function deleteAkSkPair(index) {
    if (confirm('确定要删除这个 AK/SK 对吗？')) {
      chrome.storage.local.get({ akSkPairs: [] }, function (data) {
        let pairs = data.akSkPairs;
        pairs.splice(index, 1);
        chrome.storage.local.set({ akSkPairs: pairs }, function () {
          loadAkSkPairs();
        });
      });
    }
  }

  // --- 通用工具 ---

  function copyToClipboard(text, message) {
    navigator.clipboard.writeText(text).then(() => {
      showFeedback(message);
    });
  }

  function showFeedback(message) {
    const feedback = document.createElement('div');
    feedback.className = 'copy-feedback';
    feedback.textContent = message;
    document.body.appendChild(feedback);
    setTimeout(() => {
      feedback.remove();
    }, 1500);
  }

  // 检查是否有上次扫描到的二维码结果
  function checkLastScanned() {
    chrome.storage.local.get(['lastScannedQR'], (result) => {
      if (result.lastScannedQR) {
        const qrData = result.lastScannedQR;
        // 清除结果，防止重复提醒
        chrome.storage.local.remove(['lastScannedQR']);

        // 尝试解析并处理
        try {
          const url = new URL(qrData);
          if (url.protocol === 'otpauth:') {
            const secret = url.searchParams.get('secret');
            const issuer = url.searchParams.get('issuer') || '';
            let name = decodeURIComponent(url.pathname.split('/').pop() || '');
            if (issuer && !name.includes(issuer)) {
              name = `${issuer}:${name}`;
            }
            if (secret) {
              // 自动展开添加面板并填充
              addMfaCard.classList.remove('d-none');
              toggleAddMfaBtn.textContent = '- 取消添加';
              mfaSecretInput.value = secret;
              mfaNameInput.value = name || '识别出的 MFA';
              mfaSecretInput.dispatchEvent(new Event('input'));
              showFeedback('已自动填充截图识别结果');
            }
          } else {
            // 直接作为密钥填充
            addMfaCard.classList.remove('d-none');
            toggleAddMfaBtn.textContent = '- 取消添加';
            mfaSecretInput.value = qrData;
            mfaNameInput.value = '识别出的密钥';
            mfaSecretInput.dispatchEvent(new Event('input'));
          }
        } catch (e) {
          // 直接作为密钥填充
          addMfaCard.classList.remove('d-none');
          toggleAddMfaBtn.textContent = '- 取消添加';
          mfaSecretInput.value = qrData;
          mfaNameInput.value = '识别出的密钥';
          mfaSecretInput.dispatchEvent(new Event('input'));
        }
      }
    });
  }

  // 初始化加载
  loadMfaSecrets();
  loadAkSkPairs();
  checkLastScanned();
});
