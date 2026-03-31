
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
  const exportYamlButton = document.getElementById('export-yaml');
  const importBackupButton = document.getElementById('import-backup');
  const importFileInput = document.getElementById('import-file-input');
  const importPreviewModal = document.getElementById('import-preview-modal');
  const importPreviewSummary = document.getElementById('import-preview-summary');
  const importPreviewConflicts = document.getElementById('import-preview-conflicts');
  const importOptionMfaWrap = document.getElementById('import-option-mfa-wrap');
  const importOptionAkskWrap = document.getElementById('import-option-aksk-wrap');
  const importOptionMfa = document.getElementById('import-option-mfa');
  const importOptionAksk = document.getElementById('import-option-aksk');
  const importPreviewCancel = document.getElementById('import-preview-cancel');
  const importPreviewConfirm = document.getElementById('import-preview-confirm');

  let mfaInterval;
  let lastScannedMfaOptions = null;

  // --- 折叠/展开逻辑 ---
  toggleAddMfaBtn.addEventListener('click', () => {
    addMfaCard.classList.toggle('d-none');
    toggleAddMfaBtn.textContent = addMfaCard.classList.contains('d-none') ? '+ 添加新 MFA' : '- 取消添加';
  });

  toggleAddAkskBtn.addEventListener('click', () => {
    addAkskCard.classList.toggle('d-none');
    toggleAddAkskBtn.textContent = addAkskCard.classList.contains('d-none') ? '+ 添加新 AK/SK 对' : '- 取消添加';
  });

  function formatBackupFileTime(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }

  function yamlEscape(value) {
    return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function toBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function toBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function toBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function toYamlBackup(data) {
    const mfaLines = data.mfaSecrets.map((item) => `  - name: "${yamlEscape(item.name)}"\n    secret: "${yamlEscape(item.secret)}"`);
    const akskLines = data.akSkPairs.map((item) => `  - name: "${yamlEscape(item.name)}"\n    ak: "${yamlEscape(item.ak)}"\n    sk: "${yamlEscape(item.sk)}"`);
    return [
      `version: ${data.version}`,
      `exportedAt: "${yamlEscape(data.exportedAt)}"`,
      'mfaSecrets:',
      ...(mfaLines.length ? mfaLines : ['  []']),
      'akSkPairs:',
      ...(akskLines.length ? akskLines : ['  []'])
    ].join('\n');
  }

  function assignYamlField(target, line) {
    const index = line.indexOf(':');
    if (index < 0) return;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    value = value.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    target[key] = value;
  }

  function parseYamlBackup(text) {
    const lines = text.replace(/\r/g, '').split('\n');
    const backup = { mfaSecrets: [], akSkPairs: [] };
    let section = '';
    let current = null;

    lines.forEach((raw) => {
      const line = raw.trim();
      if (!line || line === '[]') return;
      if (line === 'mfaSecrets:') {
        section = 'mfa';
        current = null;
        return;
      }
      if (line === 'akSkPairs:') {
        section = 'aksk';
        current = null;
        return;
      }
      if (line.startsWith('- ')) {
        current = section === 'mfa' ? { name: '', secret: '' } : section === 'aksk' ? { name: '', ak: '', sk: '' } : null;
        if (!current) return;
        assignYamlField(current, line.slice(2));
        if (section === 'mfa') backup.mfaSecrets.push(current);
        if (section === 'aksk') backup.akSkPairs.push(current);
        return;
      }
      if (current && line.includes(':')) {
        assignYamlField(current, line);
      }
    });

    return backup;
  }

  function downloadTextFile(fileName, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function toBase64(bytes) {
    return btoa(String.fromCharCode(...bytes));
  }

  function fromBase64(base64) {
    const binary = atob(base64);
    return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  }

  async function deriveAesKey(password, salt, iterations = 120000) {
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function encryptPayload(payloadText, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const iterations = 120000;
    const key = await deriveAesKey(password, salt, iterations);
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(payloadText));
    return { iterations, salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(encrypted)) };
  }

  async function decryptPayload(envelope, password) {
    const salt = fromBase64(envelope.salt);
    const iv = fromBase64(envelope.iv);
    const ciphertext = fromBase64(envelope.ciphertext);
    const key = await deriveAesKey(password, salt, Number(envelope.iterations || 120000));
    const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(plainBuffer);
  }

  function parseSimpleYamlMap(text) {
    const out = {};
    text.replace(/\r/g, '').split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf(':');
      if (idx < 0) return;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      out[key] = value;
    });
    return out;
  }

  function buildEncryptedYaml(payload, encrypted) {
    return [
      'version: 2',
      'encrypted: true',
      `exportedAt: "${yamlEscape(payload.exportedAt)}"`,
      'kdf: PBKDF2-SHA256',
      `iterations: ${encrypted.iterations}`,
      `salt: "${encrypted.salt}"`,
      `iv: "${encrypted.iv}"`,
      `ciphertext: "${encrypted.ciphertext}"`
    ].join('\n');
  }

  function normalizeBackupData(raw) {
    const mfaSecrets = Array.isArray(raw.mfaSecrets) ? raw.mfaSecrets
      .filter((item) => item && typeof item.name === 'string' && typeof item.secret === 'string' && item.name.trim() && item.secret.trim())
      .map((item) => ({ name: item.name.trim(), secret: item.secret.trim() })) : [];
    const akSkPairs = Array.isArray(raw.akSkPairs) ? raw.akSkPairs
      .filter((item) => item && typeof item.name === 'string' && typeof item.ak === 'string' && typeof item.sk === 'string' && item.name.trim() && item.ak.trim() && item.sk.trim())
      .map((item) => ({ name: item.name.trim(), ak: item.ak.trim(), sk: item.sk.trim() })) : [];
    return { mfaSecrets, akSkPairs };
  }

  function mergeUnique(existing, incoming, keyGetter) {
    const result = [...existing];
    const keys = new Set(existing.map(keyGetter));
    incoming.forEach((item) => {
      const key = keyGetter(item);
      if (!keys.has(key)) {
        keys.add(key);
        result.push(item);
      }
    });
    return result;
  }

  function previewImport(current, incoming) {
    const currentMfaByName = new Map(current.mfaSecrets.map((item) => [item.name, item]));
    const currentAkByName = new Map(current.akSkPairs.map((item) => [item.name, item]));
    const mfaExact = new Set(current.mfaSecrets.map((item) => `${item.name}__${item.secret}`));
    const akskExact = new Set(current.akSkPairs.map((item) => `${item.name}__${item.ak}__${item.sk}`));

    const mfaIncoming = incoming.mfaSecrets.filter((item) => !mfaExact.has(`${item.name}__${item.secret}`));
    const akskIncoming = incoming.akSkPairs.filter((item) => !akskExact.has(`${item.name}__${item.ak}__${item.sk}`));

    const mfaConflicts = mfaIncoming.filter((item) => currentMfaByName.has(item.name) && currentMfaByName.get(item.name).secret !== item.secret);
    const akskConflicts = akskIncoming.filter((item) => currentAkByName.has(item.name) && (currentAkByName.get(item.name).ak !== item.ak || currentAkByName.get(item.name).sk !== item.sk));

    return { mfaIncoming, akskIncoming, mfaConflicts, akskConflicts };
  }

  function formatConflictPreview(items) {
    const names = [...new Set(items.map((item) => item.name))];
    return names.slice(0, 4).join('、') + (names.length > 4 ? ` 等 ${names.length} 项` : '');
  }

  function showImportPreviewDialog(preview) {
    return new Promise((resolve) => {
      importPreviewSummary.innerHTML = `MFA：新增 <strong>${preview.mfaIncoming.length}</strong>，冲突 <strong>${preview.mfaConflicts.length}</strong><br>AK/SK：新增 <strong>${preview.akskIncoming.length}</strong>，冲突 <strong>${preview.akskConflicts.length}</strong>`;

      const conflicts = [];
      if (preview.mfaConflicts.length) {
        conflicts.push(`<li>MFA 冲突：${formatConflictPreview(preview.mfaConflicts)}</li>`);
      }
      if (preview.akskConflicts.length) {
        conflicts.push(`<li>AK/SK 冲突：${formatConflictPreview(preview.akskConflicts)}</li>`);
      }
      importPreviewConflicts.innerHTML = conflicts.length ? `<ul>${conflicts.join('')}</ul>` : '';

      importOptionMfaWrap.classList.toggle('d-none', preview.mfaConflicts.length === 0);
      importOptionAkskWrap.classList.toggle('d-none', preview.akskConflicts.length === 0);
      importOptionMfa.checked = true;
      importOptionAksk.checked = true;
      importPreviewModal.classList.remove('d-none');

      const close = (result) => {
        importPreviewModal.classList.add('d-none');
        importPreviewCancel.removeEventListener('click', onCancel);
        importPreviewConfirm.removeEventListener('click', onConfirm);
        resolve(result);
      };
      const onCancel = () => close({ confirmed: false, importMfaConflicts: false, importAkConflicts: false });
      const onConfirm = () => close({ confirmed: true, importMfaConflicts: importOptionMfa.checked, importAkConflicts: importOptionAksk.checked });

      importPreviewCancel.addEventListener('click', onCancel);
      importPreviewConfirm.addEventListener('click', onConfirm);
    });
  }

  async function exportBackupYaml() {
    chrome.storage.local.get({ mfaSecrets: [], akSkPairs: [] }, async (data) => {
      const payload = { version: 1, exportedAt: new Date().toISOString(), mfaSecrets: data.mfaSecrets, akSkPairs: data.akSkPairs };
      const password = prompt('请输入备份加密口令（至少 6 位）');
      if (!password) return;
      if (password.length < 6) {
        alert('口令长度至少 6 位');
        return;
      }
      const encrypted = await encryptPayload(JSON.stringify(payload), password);
      const timePart = formatBackupFileTime(new Date());
      downloadTextFile(`mfa-aksk-backup-${timePart}.yaml`, buildEncryptedYaml(payload, encrypted), 'text/yaml;charset=utf-8');
      showFeedback('YAML 加密备份导出成功');
    });
  }

  exportYamlButton.addEventListener('click', () => exportBackupYaml());
  importBackupButton.addEventListener('click', () => importFileInput.click());

  importFileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = String(e.target.result || '');
        const envelope = parseSimpleYamlMap(text);
        let importedRaw;

        if (String(envelope.encrypted).toLowerCase() === 'true') {
          const password = prompt('请输入备份文件解密口令');
          if (!password) return;
          const plain = await decryptPayload(envelope, password);
          importedRaw = JSON.parse(plain);
        } else {
          importedRaw = parseYamlBackup(text);
        }

        const normalized = normalizeBackupData(importedRaw || {});
        chrome.storage.local.get({ mfaSecrets: [], akSkPairs: [] }, async (current) => {
          const preview = previewImport(current, normalized);
          const decision = await showImportPreviewDialog(preview);
          if (!decision.confirmed) return;

          const mfaConflictNames = new Set(preview.mfaConflicts.map((item) => item.name));
          const akskConflictNames = new Set(preview.akskConflicts.map((item) => item.name));

          const keptMfa = current.mfaSecrets.filter((item) => !decision.importMfaConflicts || !mfaConflictNames.has(item.name));
          const keptAkSk = current.akSkPairs.filter((item) => !decision.importAkConflicts || !akskConflictNames.has(item.name));
          const toImportMfa = preview.mfaIncoming.filter((item) => decision.importMfaConflicts || !mfaConflictNames.has(item.name));
          const toImportAkSk = preview.akskIncoming.filter((item) => decision.importAkConflicts || !akskConflictNames.has(item.name));

          const mergedMfa = mergeUnique(keptMfa, toImportMfa, (item) => `${item.name}__${item.secret}`);
          const mergedAkSk = mergeUnique(keptAkSk, toImportAkSk, (item) => `${item.name}__${item.ak}__${item.sk}`);

          chrome.storage.local.set({ mfaSecrets: mergedMfa, akSkPairs: mergedAkSk }, () => {
            loadMfaSecrets();
            loadAkSkPairs();
          });
        });
      } catch (err) {
        alert('导入失败：格式无效或口令错误');
      }
    };
    reader.readAsText(file, 'utf-8');
    importFileInput.value = '';
  });

  function getProgressColor(remainingMs) {
    if (remainingMs >= 15000) {
      return '#28a745';
    }
    if (remainingMs > 5000) {
      return '#ffc107';
    }
    const t = Math.max(0, Math.min(1, remainingMs / 5000));
    const start = { r: 255, g: 193, b: 7 };
    const end = { r: 220, g: 53, b: 69 };
    const r = Math.round(end.r + (start.r - end.r) * t);
    const g = Math.round(end.g + (start.g - end.g) * t);
    const b = Math.round(end.b + (start.b - end.b) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }

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
      mfaInterval = setInterval(() => updateMfaCodes(secrets), 100);
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
        const periodMs = (Number(secret.period || 30) || 30) * 1000;
        const now = Date.now();
        const msInPeriod = now % periodMs;
        const remainingMs = periodMs - msInPeriod;
        
        let token = totp.generate();
        if (mfaCodeElements[index]) {
          mfaCodeElements[index].textContent = token;
        }

        // 更新进度条
        if (progressBars[index]) {
          const width = (remainingMs / periodMs) * 100;
          progressBars[index].style.width = width + '%';
          
          progressBars[index].style.backgroundColor = getProgressColor(remainingMs);
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
        chrome.storage.local.remove(['lastScannedQR']);

        try {
          const url = new URL(qrData);
          if (url.protocol === 'otpauth:') {
            const secret = normalizeBase32Secret(url.searchParams.get('secret'));
            const issuer = url.searchParams.get('issuer') || '';
            const algorithm = (url.searchParams.get('algorithm') || 'SHA1').toUpperCase();
            const digits = Number(url.searchParams.get('digits') || 6);
            const period = Number(url.searchParams.get('period') || 30);
            let name = decodeURIComponent(url.pathname.split('/').pop() || '');
            if (issuer && !name.includes(issuer)) {
              name = `${issuer}:${name}`;
            }
            if (secret) {
              addMfaCard.classList.remove('d-none');
              toggleAddMfaBtn.textContent = '- 取消添加';
              lastScannedMfaOptions = { issuer: issuer || 'MFA', algorithm, digits, period };
              mfaSecretInput.value = secret;
              mfaNameInput.value = name || '识别出的 MFA';
              mfaSecretInput.dispatchEvent(new Event('input'));
              showFeedback('已自动填充截图识别结果');
            }
          } else {
            addMfaCard.classList.remove('d-none');
            toggleAddMfaBtn.textContent = '- 取消添加';
            lastScannedMfaOptions = null;
            mfaSecretInput.value = normalizeBase32Secret(qrData);
            mfaNameInput.value = '识别出的密钥';
            mfaSecretInput.dispatchEvent(new Event('input'));
          }
        } catch (e) {
          addMfaCard.classList.remove('d-none');
          toggleAddMfaBtn.textContent = '- 取消添加';
          lastScannedMfaOptions = null;
          mfaSecretInput.value = normalizeBase32Secret(qrData);
          mfaNameInput.value = '识别出的密钥';
          mfaSecretInput.dispatchEvent(new Event('input'));
        }
      }
    });
  }

  loadMfaSecrets();
  loadAkSkPairs();
  checkLastScanned();
  checkTimeSkew();
});
