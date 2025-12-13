import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateAssistantResponse, generateAssistantResponseNoStream, getAvailableModels, generateImageForSD, closeRequester } from '../api/client.js';
import { generateRequestBody } from '../utils/utils.js';
import logger from '../utils/logger.js';
import config from '../config/config.js';
import tokenManager from '../auth/token_manager.js';
import adminRouter from '../routes/admin.js';
import sdRouter from '../routes/sd.js';
import authRouter from '../routes/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// 工具函数：生成响应元数据
const createResponseMeta = () => ({
  id: `chatcmpl-${Date.now()}`,
  created: Math.floor(Date.now() / 1000)
});

// 工具函数：设置流式响应头
const setStreamHeaders = (res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // 禁用部分反向代理/网关的缓冲（例如 Nginx）
  res.setHeader('X-Accel-Buffering', 'no');
};

// 工具函数：尽可能立即刷新响应头/数据（在支持的情况下）
const flushStream = (res) => {
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }
  if (typeof res.flush === 'function') {
    res.flush();
  }
};

// 工具函数：构建流式数据块
const createStreamChunk = (id, created, model, delta, finish_reason = null) => ({
  id,
  object: 'chat.completion.chunk',
  created,
  model,
  choices: [{ index: 0, delta, finish_reason }]
});

// 工具函数：写入流式数据
const writeStreamData = (res, data) => {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  flushStream(res);
};

// 工具函数：结束流式响应
const endStream = (res) => {
  res.write('data: [DONE]\n\n');
  res.end();
};

app.use(cors());
app.use(express.json({ limit: config.security.maxRequestSize }));

// 静态文件服务
app.use('/images', express.static(path.join(__dirname, '../../public/images')));
app.use(express.static(path.join(__dirname, '../../public')));

// OAuth 认证路由
app.use('/auth', authRouter);

// 管理路由
app.use('/admin', adminRouter);

app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: `请求体过大，最大支持 ${config.security.maxRequestSize}` });
  }
  next(err);
});

app.use((req, res, next) => {
  const ignorePaths = ['/images', '/favicon.ico', '/.well-known', '/sdapi/v1/options', '/sdapi/v1/samplers', '/sdapi/v1/schedulers', '/sdapi/v1/upscalers', '/sdapi/v1/latent-upscale-modes', '/sdapi/v1/sd-vae', '/sdapi/v1/sd-modules'];
  if (!ignorePaths.some(path => req.path.startsWith(path))) {
    const start = Date.now();
    res.on('finish', () => {
      logger.request(req.method, req.path, res.statusCode, Date.now() - start);
    });
  }
  next();
});
app.use('/sdapi/v1', sdRouter);

app.use((req, res, next) => {
  if (req.path.startsWith('/v1/')) {
    const apiKey = config.security?.apiKey;
    if (apiKey) {
      const authHeader = req.headers.authorization;
      const providedKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
      if (providedKey !== apiKey) {
        logger.warn(`API Key 验证失败: ${req.method} ${req.path}`);
        return res.status(401).json({ error: 'Invalid API Key' });
      }
    }
  }
  next();
});

app.get('/v1/models', async (req, res) => {
  try {
    const models = await getAvailableModels();
    res.json(models);
  } catch (error) {
    logger.error('获取模型列表失败:', error.message);
    res.status(500).json({ error: error.message });
  }
});



app.post('/v1/chat/completions', async (req, res) => {
  const { messages, model, stream = false, tools, ...params} = req.body;
  try {
    if (!messages) {
      return res.status(400).json({ error: 'messages is required' });
    }
    const token = await tokenManager.getToken();
    if (!token) {
      throw new Error('没有可用的token，请运行 npm run login 获取token');
    }
    
    // 检查是否是假流模型
    const fakeStreamPrefix = '假流式/';
    const isFakeStreamModel = model.startsWith(fakeStreamPrefix);
    const actualModel = isFakeStreamModel ? model.slice(fakeStreamPrefix.length) : model;
    const isImageModel = actualModel.includes('-image');
    
    const requestBody = generateRequestBody(messages, actualModel, params, tools, token);
    if (isImageModel) {
      requestBody.request.generationConfig={
        candidateCount: 1,
        // imageConfig:{
        //   aspectRatio: "1:1"
        // }
      }
      requestBody.requestType="image_gen";
      //requestBody.request.systemInstruction.parts[0].text += "现在你作为绘画模型聚焦于帮助用户生成图片";
      delete requestBody.request.systemInstruction;
      delete requestBody.request.tools;
      delete requestBody.request.toolConfig;
    }
    //console.log(JSON.stringify(requestBody,null,2))
    
    const { id, created } = createResponseMeta();
    
    // 假流模式：客户端要流式，但后端用非流式
    if (isFakeStreamModel && stream) {
      setStreamHeaders(res);
      flushStream(res);
      
      // 先发送空的起始chunk (role + empty content)
      writeStreamData(res, createStreamChunk(id, created, model, { role: 'assistant', content: '' }));

      // 在等待后端响应时，持续发送空chunk来模拟流式响应（每3秒一次）
      const keepAliveIntervalMs = 3000;
      const keepAliveTimer = setInterval(() => {
        // 如果客户端已断开连接，避免继续写入
        if (res.writableEnded || res.destroyed) return;
        writeStreamData(res, createStreamChunk(id, created, model, { content: '' }));
      }, keepAliveIntervalMs);

      const cleanupKeepAlive = () => {
        clearInterval(keepAliveTimer);
      };

      req.on('close', () => {
        cleanupKeepAlive();
      });

      // 从后端获取完整响应
      let content;
      let toolCalls;
      let usage;
      try {
        ({ content, toolCalls, usage } = await generateAssistantResponseNoStream(requestBody, token));
      } finally {
        cleanupKeepAlive();
      }
      
      // 最后发送实际内容
      writeStreamData(res, createStreamChunk(id, created, model, { content }));
      
      if (toolCalls.length > 0) {
        writeStreamData(res, createStreamChunk(id, created, model, { tool_calls: toolCalls }));
      }
      
      writeStreamData(res, { ...createStreamChunk(id, created, model, {}, toolCalls.length > 0 ? 'tool_calls' : 'stop'), usage });
      endStream(res);
    } else if (stream) {
      setStreamHeaders(res);
      
      if (isImageModel) {
        //console.log(JSON.stringify(requestBody,null,2));
        const { content, usage } = await generateAssistantResponseNoStream(requestBody, token);
        writeStreamData(res, createStreamChunk(id, created, model, { content }));
        writeStreamData(res, { ...createStreamChunk(id, created, model, {}, 'stop'), usage });
        endStream(res);
      } else {
        let hasToolCall = false;
        let usageData = null;
        await generateAssistantResponse(requestBody, token, (data) => {
          if (data.type === 'usage') {
            usageData = data.usage;
          } else {
            const delta = data.type === 'tool_calls' 
              ? { tool_calls: data.tool_calls } 
              : { content: data.content };
            if (data.type === 'tool_calls') hasToolCall = true;
            writeStreamData(res, createStreamChunk(id, created, model, delta));
          }
        });
        writeStreamData(res, { ...createStreamChunk(id, created, model, {}, hasToolCall ? 'tool_calls' : 'stop'), usage: usageData });
        endStream(res);
      }
    } else {
      const { content, toolCalls, usage } = await generateAssistantResponseNoStream(requestBody, token);
      const message = { role: 'assistant', content };
      if (toolCalls.length > 0) message.tool_calls = toolCalls;
      
      res.json({
        id,
        object: 'chat.completion',
        created,
        model,
        choices: [{
          index: 0,
          message,
          finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop'
        }],
        usage
      });
    }
  } catch (error) {
    logger.error('生成响应失败:', error.message);
    if (!res.headersSent) {
      const { id, created } = createResponseMeta();
      const errorContent = `错误: ${error.message}`;
      
      if (stream) {
        setStreamHeaders(res);
        writeStreamData(res, createStreamChunk(id, created, model, { content: errorContent }));
        writeStreamData(res, createStreamChunk(id, created, model, {}, 'stop'));
        endStream(res);
      } else {
        res.json({
          id,
          object: 'chat.completion',
          created,
          model,
          choices: [{
            index: 0,
            message: { role: 'assistant', content: errorContent },
            finish_reason: 'stop'
          }]
        });
      }
    }
  }
});

const server = app.listen(config.server.port, config.server.host, () => {
  logger.info(`服务器已启动: ${config.server.host}:${config.server.port}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(`端口 ${config.server.port} 已被占用`);
    process.exit(1);
  } else if (error.code === 'EACCES') {
    logger.error(`端口 ${config.server.port} 无权限访问`);
    process.exit(1);
  } else {
    logger.error('服务器启动失败:', error.message);
    process.exit(1);
  }
});

const shutdown = () => {
  logger.info('正在关闭服务器...');
  closeRequester();
  server.close(() => {
    logger.info('服务器已关闭');
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
