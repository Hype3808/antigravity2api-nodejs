import express from 'express';
import http from 'http';
import crypto from 'crypto';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';
import config from '../config/config.js';
import { generateProjectId } from '../utils/idGenerator.js';
import { OAUTH_CONFIG } from '../constants/oauth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ACCOUNTS_FILE = path.join(__dirname, '../../data/accounts.json');

const router = express.Router();

// Store active OAuth sessions
const oauthSessions = new Map();

function getAxiosConfig() {
  const axiosConfig = { timeout: config.timeout };
  if (config.proxy) {
    try {
      const proxyUrl = new URL(config.proxy);
      axiosConfig.proxy = {
        protocol: proxyUrl.protocol.replace(':', ''),
        host: proxyUrl.hostname,
        port: parseInt(proxyUrl.port)
      };
    } catch (error) {
      logger.warn('Invalid proxy URL:', error.message);
    }
  }
  return axiosConfig;
}

async function fetchUserEmail(accessToken) {
  const response = await axios({
    method: 'GET',
    url: 'https://www.googleapis.com/oauth2/v2/userinfo',
    headers: {
      'Host': 'www.googleapis.com',
      'User-Agent': 'Go-http-client/1.1',
      'Authorization': `Bearer ${accessToken}`,
      'Accept-Encoding': 'gzip'
    },
    ...getAxiosConfig()
  });
  return response.data?.email;
}

async function fetchProjectId(accessToken) {
  const response = await axios({
    method: 'POST',
    url: 'https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:loadCodeAssist',
    headers: {
      'Host': 'daily-cloudcode-pa.sandbox.googleapis.com',
      'User-Agent': 'antigravity/1.11.9 windows/amd64',
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept-Encoding': 'gzip'
    },
    data: JSON.stringify({ metadata: { ideType: 'ANTIGRAVITY' } }),
    ...getAxiosConfig()
  });
  return response.data?.cloudaicompanionProject;
}

async function saveAccountToFile(account) {
  let accounts = [];
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
      const fileContent = fs.readFileSync(ACCOUNTS_FILE, 'utf-8');
      accounts = JSON.parse(fileContent);
    }
  } catch (err) {
    logger.warn('读取 accounts.json 失败，将创建新文件');
  }
  
  accounts.push(account);
  
  const dir = path.dirname(ACCOUNTS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
  logger.info(`Token 已保存到 ${ACCOUNTS_FILE}`);
}

// Generate OAuth URL
function generateOAuthUrl() {
  const state = crypto.randomUUID();
  const port = config.port || 3000;
  const redirectUri = `http://localhost:${port}/auth/callback`;
  
  oauthSessions.set(state, { timestamp: Date.now() });
  
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.append('access_type', 'offline');
  authUrl.searchParams.append('client_id', OAUTH_CONFIG.CLIENT_ID);
  authUrl.searchParams.append('prompt', 'consent');
  authUrl.searchParams.append('redirect_uri', redirectUri);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('scope', OAUTH_CONFIG.SCOPES.join(' '));
  authUrl.searchParams.append('state', state);
  
  return authUrl.toString();
}

// Start OAuth flow
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/auth.html'));
});

// Generate OAuth URL endpoint
router.get('/generate-url', (req, res) => {
  const url = generateOAuthUrl();
  res.json({ success: true, url });
});

// Process callback URL endpoint
router.post('/process-callback', async (req, res) => {
  const { callbackUrl } = req.body;
  
  if (!callbackUrl) {
    return res.status(400).json({ success: false, message: '缺少回调URL' });
  }
  
  try {
    const url = new URL(callbackUrl);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    
    if (error) {
      return res.json({ success: false, message: '授权失败: ' + error });
    }
    
    if (!code || !state) {
      return res.json({ success: false, message: '缺少必要的参数' });
    }
    
    // Validate state
    if (!oauthSessions.has(state)) {
      return res.json({ success: false, message: '无效的会话状态或会话已过期' });
    }
    
    oauthSessions.delete(state);
    
    const port = config.port || 3000;
    const redirectUri = `http://localhost:${port}/auth/callback`;
    
    // Exchange code for tokens
    const postData = new URLSearchParams({
      code,
      client_id: OAUTH_CONFIG.CLIENT_ID,
      client_secret: OAUTH_CONFIG.CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    });
    
    const tokenResponse = await axios({
      method: 'POST',
      url: OAUTH_CONFIG.TOKEN_URL,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: postData.toString(),
      ...getAxiosConfig()
    });
    
    const tokenData = tokenResponse.data;
    
    if (!tokenData.access_token || !tokenData.refresh_token) {
      throw new Error('Token交换失败：未收到有效的令牌');
    }
    
    const account = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      timestamp: Date.now(),
      enable: true
    };
    
    // Fetch user email
    try {
      const email = await fetchUserEmail(account.access_token);
      if (email) {
        account.email = email;
        logger.info('获取到用户邮箱: ' + email);
      }
    } catch (err) {
      logger.warn('获取用户邮箱失败:', err.message);
    }
    
    // Fetch or generate projectId
    if (config.skipProjectIdFetch) {
      account.projectId = generateProjectId();
      logger.info('跳过API验证，使用随机生成的projectId: ' + account.projectId);
    } else {
      logger.info('正在验证账号资格...');
      try {
        const projectId = await fetchProjectId(account.access_token);
        if (projectId === undefined) {
          logger.warn('该账号无资格使用（无法获取projectId）');
          return res.json({ success: false, message: '该账号无资格使用（无法获取projectId）' });
        }
        account.projectId = projectId;
        logger.info('账号验证通过，projectId: ' + projectId);
      } catch (err) {
        logger.error('验证账号资格失败:', err.message);
        return res.json({ success: false, message: '验证账号资格失败: ' + err.message });
      }
    }
    
    // Save to accounts.json
    await saveAccountToFile(account);
    
    res.json({ 
      success: true, 
      email: account.email,
      projectId: account.projectId
    });
  } catch (error) {
    logger.error('处理回调失败:', error.message);
    res.json({ success: false, message: error.message });
  }
});

// OAuth callback handler (for direct redirects, optional)
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;
  
  if (error) {
    logger.error('OAuth授权失败:', error);
    return res.send(generateCallbackPage(false, '授权失败: ' + error));
  }
  
  if (!code || !state) {
    return res.send(generateCallbackPage(false, '缺少必要的参数'));
  }
  
  // Show instructions to copy the URL
  const currentUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
  return res.send(generateCallbackPage(true, '请复制此页面的完整URL', currentUrl));
});

function generateCallbackPage(success, message, url = '') {
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
    .icon {
      font-size: 80px;
      margin-bottom: 20px;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }
    h1 {
      color: ${color};
      margin-bottom: 16px;
      font-size: 32px;
    }
    .message {
      color: #4b5563;
      font-size: 16px;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    .url-box {
      background: #f3f4f6;
      padding: 16px;
      border-radius: 8px;
      word-break: break-all;
      font-family: monospace;
      font-size: 13px;
      color: #1f2937;
      margin-bottom: 16px;
      text-align: left;
      max-height: 150px;
      overflow-y: auto;
    }
    .btn {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 16px;
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
      padding: 16px;
      border-radius: 8px;
      margin-top: 24px;
      text-align: left;
      font-size: 14px;
    }
    .instructions strong { color: #92400e; display: block; margin-bottom: 8px; }
    .instructions ol { margin-left: 20px; }
    .instructions li { margin-bottom: 6px; color: #78350f; }
  </style>
  <script>
    function copyUrl() {
      const url = document.getElementById('urlText').textContent;
      navigator.clipboard.writeText(url).then(() => {
        const btn = document.getElementById('copyBtn');
        const originalText = btn.textContent;
        btn.textContent = '✅ 已复制';
        setTimeout(() => {
          btn.textContent = originalText;
        }, 2000);
      }).catch(() => {
        alert('复制失败，请手动选择并复制');
      });
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

function generateResultPage(success, message, extraContent = '') {
  const icon = success ? '✅' : '❌';
  const title = success ? '授权成功' : '授权失败';
  const color = success ? '#10b981' : '#ef4444';
  
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
      max-width: 500px;
      width: 100%;
      text-align: center;
    }
    .icon {
      font-size: 80px;
      margin-bottom: 20px;
      animation: bounce 0.6s ease;
    }
    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-20px); }
    }
    h1 {
      color: ${color};
      margin-bottom: 16px;
      font-size: 32px;
    }
    .message {
      color: #4b5563;
      font-size: 16px;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    .extra {
      background: #f3f4f6;
      padding: 16px;
      border-radius: 8px;
      font-size: 14px;
      color: #4b5563;
      margin-bottom: 24px;
      text-align: left;
    }
    .extra p { margin-bottom: 8px; }
    .extra p:last-child { margin-bottom: 0; }
    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-20px); }
    }
    .btn {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s;
      text-decoration: none;
      display: inline-block;
    }
    .btn:hover { transform: translateY(-2px); }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <div class="message">${message}</div>
    ${extraContent ? `<div class="extra">${extraContent}</div>` : ''}
    <button class="btn" onclick="window.close()">关闭窗口</button>
  </div>
</body>
</html>`;
}

// Cleanup old sessions periodically
setInterval(() => {
  const now = Date.now();
  const timeout = 10 * 60 * 1000; // 10 minutes
  
  for (const [state, session] of oauthSessions.entries()) {
    if (now - session.timestamp > timeout) {
      oauthSessions.delete(state);
    }
  }
}, 60 * 1000); // Check every minute

export default router;
