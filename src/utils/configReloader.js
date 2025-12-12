import config, { getConfigJson } from '../config/config.js';

/**
 * 配置字段映射表：config对象路径 -> config.json路径 / 环境变量
 */
const CONFIG_MAPPING = [
  { target: 'server.port', source: 'server.port', default: 8045 },
  { target: 'server.host', source: 'server.host', default: '0.0.0.0' },
  { target: 'defaults.temperature', source: 'defaults.temperature', default: 1 },
  { target: 'defaults.top_p', source: 'defaults.topP', default: 0.85 },
  { target: 'defaults.top_k', source: 'defaults.topK', default: 50 },
  { target: 'defaults.max_tokens', source: 'defaults.maxTokens', default: 8096 },
  { target: 'timeout', source: 'other.timeout', default: 180000 },
  { target: 'skipProjectIdFetch', source: 'other.skipProjectIdFetch', default: false, transform: v => v === true },
  { target: 'maxImages', source: 'other.maxImages', default: 10 },
  { target: 'useNativeAxios', source: 'other.useNativeAxios', default: true, transform: v => v !== false },
  { target: 'api.url', source: 'api.url', default: 'https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:streamGenerateContent?alt=sse' },
  { target: 'api.modelsUrl', source: 'api.modelsUrl', default: 'https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels' },
  { target: 'api.noStreamUrl', source: 'api.noStreamUrl', default: 'https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:generateContent' },
  { target: 'api.host', source: 'api.host', default: 'daily-cloudcode-pa.sandbox.googleapis.com' },
  { target: 'api.userAgent', source: 'api.userAgent', default: 'antigravity/1.11.3 windows/amd64' }
];

const ENV_MAPPING = [
  { target: 'security.apiKey', env: 'API_KEY', default: null },
  { target: 'proxy', env: 'PROXY', default: null },
  { target: 'systemInstruction', env: 'SYSTEM_INSTRUCTION', default: '' }
];

/**
 * 从嵌套路径获取值
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

/**
 * 设置嵌套路径的值
 */
function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  const target = keys.reduce((acc, key) => acc[key], obj);
  target[lastKey] = value;
}

/**
 * 重新加载配置到 config 对象
 */
export function reloadConfig() {
  const jsonConfig = getConfigJson();
  
  // 更新 JSON 配置
  CONFIG_MAPPING.forEach(({ target, source, default: defaultValue, transform }) => {
    let value = getNestedValue(jsonConfig, source) ?? defaultValue;
    if (transform) value = transform(value);
    setNestedValue(config, target, value);
  });
  
  // 更新环境变量配置
  ENV_MAPPING.forEach(({ target, env, default: defaultValue }) => {
    const value = process.env[env] || defaultValue;
    setNestedValue(config, target, value);
  });

  // 复合字段：同时支持 config.json 与环境变量的动态生效
  // 注意：此逻辑要与 src/config/config.js 初始化逻辑保持一致
  config.enableFakeStreaming = jsonConfig.other?.enableFakeStreaming === true || process.env.ENABLE_FAKE_STREAMING === 'true';
}
