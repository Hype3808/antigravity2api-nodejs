import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';
import config from '../config/config.js';
import oauthManager from '../auth/oauth_manager.js';
import tokenManager from '../auth/token_manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

const SESSION_TTL = 10 * 60 * 1000;
const oauthSessions = new Map();
const isPkg = typeof process.pkg !== 'undefined';

function resolvePublicFile(filename) {
  if (isPkg) {
    const exeDir = path.dirname(process.execPath);
    const exeFile = path.join(exeDir, 'public', filename);
    if (fs.existsSync(exeFile)) return exeFile;
    const cwdFile = path.join(process.cwd(), 'public', filename);
    if (fs.existsSync(cwdFile)) return cwdFile;
    return path.join(__dirname, '../../public', filename);
  }
  return path.join(__dirname, '../../public', filename);
}

function getEffectivePort(req, callbackUrl) {
  if (callbackUrl?.port) {
    const port = Number(callbackUrl.port);
    if (Number.isFinite(port)) return port;
  }
  const host = req.get('host');
  const hostPort = host ? Number(host.split(':')[1]) : NaN;
  if (Number.isFinite(hostPort)) return hostPort;
  return config.server.port || 8045;
}

function cleanupSessions() {
  const now = Date.now();
  for (const [state, session] of oauthSessions.entries()) {
    if (now - session.timestamp > SESSION_TTL) {
      oauthSessions.delete(state);
    }
  }
}

setInterval(cleanupSessions, 60 * 1000);

router.get('/', (req, res) => {
  res.sendFile(resolvePublicFile('auth.html'));
});

router.get('/generate-url', (req, res) => {
  const state = crypto.randomUUID();
  const port = getEffectivePort(req);
  const url = oauthManager.generateAuthUrl(port, '/auth/callback', state);
  oauthSessions.set(state, { timestamp: Date.now() });
  res.json({ success: true, url });
});

router.post('/process-callback', async (req, res) => {
  const { callbackUrl } = req.body || {};
  if (!callbackUrl) {
    return res.status(400).json({ success: false, message: '缺少回调URL' });
  }

  try {
    const url = new URL(callbackUrl);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) {
      return res.json({ success: false, message: `授权失败: ${error}` });
    }

    if (!code || !state) {
      return res.json({ success: false, message: '缺少必要的参数' });
    }

    if (!oauthSessions.has(state)) {
      return res.json({ success: false, message: '无效的会话状态或会话已过期' });
    }

    oauthSessions.delete(state);

    const port = getEffectivePort(req, url);
    const account = await oauthManager.authenticate(code, port, '/auth/callback');
    const result = tokenManager.addToken(account);

    if (!result.success) {
      return res.json({ success: false, message: result.message });
    }

    const fallbackMode = account.hasQuota === false;
    res.json({
      success: true,
      email: account.email || null,
      projectId: account.projectId || null,
      fallbackMode
    });
  } catch (error) {
    logger.error('处理授权回调失败:', error.message);
    res.json({ success: false, message: error.message });
  }
});

router.get('/callback', (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    logger.error('OAuth授权失败:', error);
    return res.send(renderCallbackPage(false, `授权失败: ${error}`));
  }

  if (!code || !state) {
    return res.send(renderCallbackPage(false, '缺少必要的参数'));
  }

  const currentUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  return res.send(renderCallbackPage(true, '请复制此页面的完整URL', currentUrl));
});

function renderCallbackPage(success, message, url = '') {
  const icon = success ? '📋' : '❌';
  const title = success ? '复制URL' : '授权失败';
  const color = success ? '#3b82f6' : '#ef4444';
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      padding: 40px;
      max-width: 600px;
      width: 100%;
      text-align: center;
    }
    .icon { font-size: 72px; margin-bottom: 16px; }
    h1 { color: ${color}; margin-bottom: 12px; font-size: 28px; }
    .message { color: #4b5563; font-size: 16px; line-height: 1.6; margin-bottom: 20px; }
    .url-box {
      background: #f3f4f6;
      padding: 14px;
      border-radius: 10px;
      word-break: break-all;
      font-family: monospace;
      font-size: 13px;
      color: #1f2937;
      margin-bottom: 14px;
      text-align: left;
      max-height: 160px;
      overflow-y: auto;
    }
    .btn {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      color: white;
      border: none;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s;
      text-decoration: none;
      display: inline-block;
      margin: 4px;
    }
    .btn:hover { transform: translateY(-2px); }
    .instructions {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 12px;
      border-radius: 8px;
      margin-top: 16px;
      text-align: left;
      font-size: 13px;
    }
    .instructions strong { color: #92400e; display: block; margin-bottom: 8px; }
    .instructions ol { margin-left: 18px; color: #78350f; }
    .instructions li { margin-bottom: 6px; }
  </style>
  <script>
    function copyUrl() {
      const url = document.getElementById('urlText').textContent;
      navigator.clipboard.writeText(url).then(() => {
        const btn = document.getElementById('copyBtn');
        const originalText = btn.textContent;
        btn.textContent = '✅ 已复制';
        setTimeout(() => { btn.textContent = originalText; }, 1800);
      }).catch(() => { alert('复制失败，请手动选择并复制'); });
    }
  </script>
</head>
<body>
  <div class="container">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <div class="message">${message}</div>
    ${url ? `
      <div class="url-box" id="urlText">${url}</div>
      <button class="btn" id="copyBtn" onclick="copyUrl()">📋 复制URL</button>
      <div class="instructions">
        <strong>⚠️ 重要步骤：</strong>
        <ol>
          <li>点击上方按钮复制完整的URL</li>
          <li>返回到 /auth 页面</li>
          <li>将URL粘贴到输入框中</li>
          <li>点击"提交"完成授权</li>
        </ol>
      </div>
    ` : ''}
    <button class="btn" onclick="window.close()" style="background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%);">关闭窗口</button>
  </div>
</body>
</html>`;
}

export default router;
