let authUrl = '';
let timerInterval = null;
let modalCallback = null;
let buttonsEnabled = true;

function disableOAuthButtons() {
  document.getElementById('oauthBtn').disabled = true;
  document.getElementById('copyBtn').disabled = true;
  buttonsEnabled = false;
}

function enableOAuthButtons() {
  document.getElementById('oauthBtn').disabled = false;
  document.getElementById('copyBtn').disabled = false;
  buttonsEnabled = true;
  authUrl = '';
}

function showInstructionModal(callback) {
  const modal = document.getElementById('instructionModal');
  const timerProgress = document.getElementById('timerProgress');
  const timerText = document.getElementById('timerText');
  const confirmBtn = document.getElementById('confirmBtn');
  
  modal.classList.add('show');
  modalCallback = callback;
  
  confirmBtn.disabled = true;
  confirmBtn.classList.remove('active');
  confirmBtn.textContent = '请仔细阅读说明...';
  
  let timeLeft = 30;
  timerProgress.style.width = '0%';
  timerText.textContent = '请认真阅读以上步骤 (30秒)';
  if (timerInterval) clearInterval(timerInterval);
  
  timerInterval = setInterval(() => {
    timeLeft--;
    const progress = ((30 - timeLeft) / 30) * 100;
    timerProgress.style.width = progress + '%';
    timerText.textContent = '请认真阅读以上步骤 (' + timeLeft + '秒)';
    
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      confirmBtn.disabled = false;
      confirmBtn.classList.add('active');
      confirmBtn.textContent = '✅ 我已阅读，继续';
      timerText.textContent = '✅ 您现在可以继续了';
    }
  }, 1000);
}

function closeInstructionModal() {
  const modal = document.getElementById('instructionModal');
  modal.classList.remove('show');
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (modalCallback) {
    modalCallback();
    modalCallback = null;
  }
}

async function openOAuthWindow() {
  if (!buttonsEnabled) return;
  showInstructionModal(async () => {
    const response = await fetch('/auth/generate-url');
    const data = await response.json();
    authUrl = data.url;
    window.open(authUrl, '_blank');
  });
}

function copyAuthUrl() {
  if (!buttonsEnabled) return;
  showInstructionModal(() => {
    if (!authUrl) {
      alert('请先打开授权页面');
      return;
    }
    navigator.clipboard.writeText(authUrl).then(() => {
      alert('授权链接已复制到剪贴板');
    }).catch(() => {
      prompt('复制以下链接:', authUrl);
    });
  });
}

async function processCallback() {
  const callbackUrl = document.getElementById('callbackUrl').value.trim();
  if (!callbackUrl) {
    alert('请输入回调URL');
    return;
  }
  
  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = '处理中...';
  disableOAuthButtons();
  
  try {
    const response = await fetch('/auth/process-callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callbackUrl })
    });
    
    const data = await response.json();
    
    if (data.success) {
      document.body.innerHTML = `
        <div class="container">
          <div class="icon" style="animation: bounce 0.6s ease;">✅</div>
          <h1 style="color: #10b981;">授权成功</h1>
          <div class="message">Token 已成功保存！</div>
          <div class="extra">
            <p><strong>📧 邮箱：</strong>${data.email || '未获取'}</p>
            <p><strong>🆔 Project ID：</strong>${data.projectId}</p>
            <p><strong>💾 已保存至：</strong>accounts.json</p>
            ${data.fallbackMode ? '<p><strong>⚠️ 提示：</strong>该账号无资格，已自动使用随机ProjectId</p>' : ''}
          </div>
          <button class="btn" onclick="location.reload()">添加更多账号</button>
        </div>
      `;
    } else {
      alert('处理失败: ' + data.message);
      document.getElementById('callbackUrl').value = '';
      enableOAuthButtons();
    }
  } catch (error) {
    alert('请求失败: ' + error.message);
    document.getElementById('callbackUrl').value = '';
    enableOAuthButtons();
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '✅ 提交';
  }
}
