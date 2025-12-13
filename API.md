# API 使用文档

本文档介绍如何使用 Antigravity2API 提供的 OpenAI 兼容 API。

## 基础配置

所有 API 请求需要在 Header 中携带 API Key：

```
Authorization: Bearer YOUR_API_KEY
```

默认服务地址：`http://localhost:8045`

## 获取模型列表

```bash
curl http://localhost:8045/v1/models \
  -H "Authorization: Bearer sk-text"
```

## 聊天补全

### 流式响应

```bash
curl http://localhost:8045/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-text" \
  -d '{
    "model": "gemini-2.0-flash-exp",
    "messages": [{"role": "user", "content": "你好"}],
    "stream": true
  }'
```

### 非流式响应

```bash
curl http://localhost:8045/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-text" \
  -d '{
    "model": "gemini-2.0-flash-exp",
    "messages": [{"role": "user", "content": "你好"}],
    "stream": false
  }'
```

## 工具调用（Function Calling）

```bash
curl http://localhost:8045/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-text" \
  -d '{
    "model": "gemini-2.0-flash-exp",
    "messages": [{"role": "user", "content": "北京天气怎么样"}],
    "tools": [{
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "获取天气信息",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {"type": "string", "description": "城市名称"}
          },
          "required": ["location"]
        }
      }
    }]
  }'
```

## 图片输入（多模态）

支持 Base64 编码的图片输入，兼容 OpenAI 的多模态格式：

```bash
curl http://localhost:8045/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-text" \
  -d '{
    "model": "gemini-2.0-flash-exp",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "text", "text": "这张图片里有什么？"},
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
          }
        }
      ]
    }],
    "stream": true
  }'
```

### 支持的图片格式

- JPEG/JPG (`data:image/jpeg;base64,...`)
- PNG (`data:image/png;base64,...`)
- GIF (`data:image/gif;base64,...`)
- WebP (`data:image/webp;base64,...`)

## 图片生成

支持使用 大/小香蕉 模型生成图片，生成的图片会以 Markdown 格式返回：

```bash
curl http://localhost:8045/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-text" \
  -d '{
    "model": "gemimi-3.0-pro-image",
    "messages": [{"role": "user", "content": "画一只可爱的猫"}],
    "stream": false
  }'
```

## 请求参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `model` | string | ✅ | 模型名称 |
| `messages` | array | ✅ | 对话消息列表 |
| `stream` | boolean | ❌ | 是否流式响应，默认 false |
| `temperature` | number | ❌ | 温度参数，默认 1 |
| `top_p` | number | ❌ | Top P 参数，默认 0.85 |
| `top_k` | number | ❌ | Top K 参数，默认 50 |
| `max_tokens` | number | ❌ | 最大 token 数，默认 8096 |
| `tools` | array | ❌ | 工具列表（Function Calling） |

## 响应格式

### 非流式响应

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "gemini-2.0-flash-exp",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "你好！有什么我可以帮助你的吗？"
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 20,
    "total_tokens": 30
  }
}
```

### 流式响应

```
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1234567890,"model":"gemini-2.0-flash-exp","choices":[{"index":0,"delta":{"role":"assistant","content":"你"},"finish_reason":null}]}

data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1234567890,"model":"gemini-2.0-flash-exp","choices":[{"index":0,"delta":{"content":"好"},"finish_reason":null}]}

data: [DONE]
```

## 错误处理

API 返回标准的 HTTP 状态码：

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 400 | 请求参数错误 |
| 401 | API Key 无效 |
| 429 | 请求过于频繁 |
| 500 | 服务器内部错误 |

错误响应格式：

```json
{
  "error": {
    "message": "错误信息",
    "type": "invalid_request_error",
    "code": "invalid_api_key"
  }
}
```

## 使用示例

### Python

```python
import openai

openai.api_base = "http://localhost:8045/v1"
openai.api_key = "sk-text"

response = openai.ChatCompletion.create(
    model="gemini-2.0-flash-exp",
    messages=[{"role": "user", "content": "你好"}],
    stream=True
)

for chunk in response:
    print(chunk.choices[0].delta.get("content", ""), end="")
```

### Node.js

```javascript
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'http://localhost:8045/v1',
  apiKey: 'sk-text'
});

const stream = await openai.chat.completions.create({
  model: 'gemini-2.0-flash-exp',
  messages: [{ role: 'user', content: '你好' }],
  stream: true
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
```

## 注意事项

1. 所有请求必须携带有效的 API Key
2. 图片输入需要使用 Base64 编码
3. 流式响应使用 Server-Sent Events (SSE) 格式
4. 工具调用需要模型支持 Function Calling
5. 图片生成仅支持特定模型（大/小香蕉）
