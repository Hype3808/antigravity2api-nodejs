# Antigravity to OpenAI API 代理服务

将 Google Antigravity API 转换为 OpenAI 兼容格式的代理服务，支持流式响应、工具调用和多账号管理。

## 功能特性

- ✅ OpenAI API 兼容格式
- ✅ 流式和非流式响应
- ✅ 工具调用（Function Calling）支持
- ✅ 多账号自动轮换
- ✅ Token 自动刷新
- ✅ API Key 认证
- ✅ 思维链（Thinking）输出
- ✅ 图片输入支持（Base64 编码）
- ✅ 图片生成支持（大/小香蕉 模型）
- ✅ Pro 账号随机 ProjectId 支持

## 环境要求

- Node.js >= 18.0.0

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并编辑配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件配置必要参数：

```env
# 必填配置
API_KEY=sk-text
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
JWT_SECRET=your-jwt-secret-key-change-this-in-production

# 可选配置
# PROXY=http://127.0.0.1:7897
# SYSTEM_INSTRUCTION=你是聊天机器人
# IMAGE_BASE_URL=http://your-domain.com
```

### 3. 登录获取 Token

```bash
npm run login
```

浏览器会自动打开 Google 授权页面，授权后 Token 会保存到 `data/accounts.json`。

### 4. 启动服务

```bash
npm start
```

服务将在 `http://localhost:8045` 启动。

## Docker 部署

### 使用 Docker Compose（推荐）

1. **配置环境变量**

创建 `.env` 文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件配置必要参数。

2. **启动服务**

```bash
docker-compose up -d
```

3. **查看日志**

```bash
docker-compose logs -f
```

4. **停止服务**

```bash
docker-compose down
```

### 使用 Docker

1. **构建镜像**

```bash
docker build -t antigravity2api .
```

2. **运行容器**

```bash
docker run -d \
  --name antigravity2api \
  -p 8045:8045 \
  -e API_KEY=sk-text \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=admin123 \
  -e JWT_SECRET=your-jwt-secret-key \
  -e IMAGE_BASE_URL=http://your-domain.com \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/public/images:/app/public/images \
  -v $(pwd)/.env:/app/.env \
  -v $(pwd)/config.json:/app/config.json \
  antigravity2api
```

3. **查看日志**

```bash
docker logs -f antigravity2api
```

### Docker 部署说明

- 数据持久化：`data/` 目录挂载到容器，保存 Token 数据
- 图片存储：`public/images/` 目录挂载到容器，保存生成的图片
- 配置文件：`.env` 和 `config.json` 挂载到容器，支持热更新
- 端口映射：默认映射 8045 端口，可根据需要修改
- 自动重启：容器异常退出会自动重启

## Zeabur 部署

### 使用预构建镜像部署

1. **创建服务**

在 Zeabur 控制台创建新服务，使用以下镜像：

```
ghcr.io/liuw1535/antigravity2api-nodejs
```

2. **配置环境变量**

在服务设置中添加以下环境变量：

| 环境变量 | 说明 | 示例值 |
|--------|------|--------|
| `API_KEY` | API 认证密钥 | `sk-your-api-key` |
| `ADMIN_USERNAME` | 管理员用户名 | `admin` |
| `ADMIN_PASSWORD` | 管理员密码 | `your-secure-password` |
| `JWT_SECRET` | JWT 密钥 | `your-jwt-secret-key` |
| `IMAGE_BASE_URL` | 图片服务基础 URL | `https://your-domain.zeabur.app` |

可选环境变量：
- `PROXY`：代理地址
- `SYSTEM_INSTRUCTION`：系统提示词

3. **配置持久化存储**

在服务的「Volumes」设置中添加以下挂载点：

| 挂载路径 | 说明 |
|---------|------|
| `/app/data` | Token 数据存储 |
| `/app/public/images` | 生成的图片存储 |

⚠️ **重要提示**：
- 只挂载 `/app/data` 和 `/app/public/images` 这两个目录
- 不要挂载其他目录（如 `/app/.env`、`/app/config.json` 等），否则会导致必要配置文件被清空，项目无法启动

4. **绑定域名**

在服务的「Networking」设置中绑定域名，然后将该域名设置到 `IMAGE_BASE_URL` 环境变量中。

5. **启动服务**

保存配置后，Zeabur 会自动拉取镜像并启动服务。访问绑定的域名即可使用。

### Zeabur 部署说明

- 使用预构建的 Docker 镜像，无需手动构建
- 通过环境变量配置所有必要参数
- 持久化存储确保 Token 和图片数据不丢失

## Web 管理界面

服务启动后，访问 `http://localhost:8045` 即可打开 Web 管理界面。

### 功能特性

- 🔐 **安全登录**：JWT Token 认证，保护管理接口
- 📊 **实时统计**：显示总 Token 数、启用/禁用状态统计
- ➕ **多种添加方式**：
  - OAuth 授权登录（推荐）：自动完成 Google 授权流程
  - 手动填入：直接输入 Access Token 和 Refresh Token
- 🎯 **Token 管理**：
  - 查看所有 Token 的详细信息（Access Token 后缀、Project ID、过期时间）
  - 📊 查看模型额度：按类型分组显示（Claude/Gemini/其他），实时查看剩余额度和重置时间
  - 一键启用/禁用 Token
  - 删除无效 Token
  - 实时刷新 Token 列表
- ⚙️ **配置管理**：
  - 在线编辑服务器配置（端口、监听地址）
  - 调整默认参数（温度、Top P/K、最大 Token 数）
  - 修改安全配置（API 密钥、请求大小限制）
  - 配置代理、系统提示词等可选项
  - 热重载配置（部分配置需重启生效）

### 使用流程

1. **登录系统**
   - 使用 `.env` 中配置的 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 登录
   - 登录成功后会自动保存 JWT Token 到浏览器

2. **添加 Token**
   - **OAuth 方式**（推荐）：
     1. 点击「OAuth登录」按钮
     2. 在弹窗中点击「打开授权页面」
     3. 在新窗口完成 Google 授权
     4. 复制浏览器地址栏的完整回调 URL
     5. 粘贴到输入框并提交
   - **手动方式**：
     1. 点击「手动填入」按钮
     2. 填写 Access Token、Refresh Token 和过期时间
     3. 提交保存

3. **管理 Token**
   - 查看 Token 卡片显示的状态和信息
   - 点击「📊 查看额度」按钮查看该账号的模型额度信息
     - 自动按模型类型分组（Claude/Gemini/其他）
     - 显示剩余额度百分比和进度条
     - 显示额度重置时间（北京时间）
     - 支持「立即刷新」强制更新额度数据
   - 使用「启用/禁用」按钮控制 Token 状态
   - 使用「删除」按钮移除无效 Token
   - 点击「刷新」按钮更新列表

4. **修改配置**
   - 切换到「设置」标签页
   - 修改需要调整的配置项
   - 点击「保存配置」按钮应用更改
   - 注意：端口和监听地址修改需要重启服务

### 界面预览

- **Token 管理页面**：卡片式展示所有 Token，支持快速操作
- **设置页面**：分类展示所有配置项，支持在线编辑
- **响应式设计**：支持桌面和移动设备访问

## API 使用

服务提供 OpenAI 兼容的 API 接口，详细使用说明请查看 [API.md](API.md)。

### 快速测试

```bash
curl http://localhost:8045/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-text" \
  -d '{
    "model": "gemini-2.0-flash-exp",
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

## 多账号管理

`data/accounts.json` 支持多个账号，服务会自动轮换使用：

```json
[
  {
    "access_token": "ya29.xxx",
    "refresh_token": "1//xxx",
    "expires_in": 3599,
    "timestamp": 1234567890000,
    "enable": true
  },
  {
    "access_token": "ya29.yyy",
    "refresh_token": "1//yyy",
    "expires_in": 3599,
    "timestamp": 1234567890000,
    "enable": true
  }
]
```

- `enable: false` 可禁用某个账号
- Token 过期会自动刷新
- 刷新失败（403）会自动禁用并切换下一个账号

## 配置说明

项目配置分为两部分：

### 1. config.json（基础配置）

基础配置文件，包含服务器、API 和默认参数设置：

```json
{
  "server": {
    "port": 8045,              // 服务端口
    "host": "0.0.0.0",         // 监听地址
    "maxRequestSize": "500mb"  // 最大请求体大小
  },
  "defaults": {
    "temperature": 1,          // 默认温度参数
    "topP": 0.85,              // 默认 top_p
    "topK": 50,                // 默认 top_k
    "maxTokens": 8096          // 默认最大 token 数
  },
  "other": {
    "timeout": 180000,         // 请求超时时间（毫秒）
    "skipProjectIdFetch": true // 跳过 ProjectId 获取，直接随机生成
  }
}
```

### 2. .env（敏感配置）

环境变量配置文件，包含敏感信息和可选配置：

| 环境变量 | 说明 | 必填 |
|--------|------|------|
| `API_KEY` | API 认证密钥 | ✅ |
| `ADMIN_USERNAME` | 管理员用户名 | ✅ |
| `ADMIN_PASSWORD` | 管理员密码 | ✅ |
| `JWT_SECRET` | JWT 密钥 | ✅ |
| `PROXY` | 代理地址（如：http://127.0.0.1:7897） | ❌ |
| `SYSTEM_INSTRUCTION` | 系统提示词 | ❌ |
| `IMAGE_BASE_URL` | 图片服务基础 URL | ❌ |

完整配置示例请参考 `.env.example` 文件。

## 开发命令

```bash
# 启动服务
npm start

# 开发模式（自动重启）
npm run dev

# 登录获取 Token
npm run login
```

## 项目结构

```
.
├── data/
│   └── accounts.json       # Token 存储（自动生成）
├── public/
│   ├── index.html          # Web 管理界面
│   ├── app.js              # 前端逻辑
│   └── style.css           # 界面样式
├── scripts/
│   ├── oauth-server.js     # OAuth 登录服务
│   └── refresh-tokens.js   # Token 刷新脚本
├── src/
│   ├── api/
│   │   └── client.js       # API 调用逻辑
│   ├── auth/
│   │   ├── jwt.js          # JWT 认证
│   │   └── token_manager.js # Token 管理
│   ├── routes/
│   │   └── admin.js        # 管理接口路由
│   ├── bin/
│   │   ├── antigravity_requester_android_arm64   # Android ARM64 TLS 请求器
│   │   ├── antigravity_requester_linux_amd64     # Linux AMD64 TLS 请求器
│   │   └── antigravity_requester_windows_amd64.exe # Windows AMD64 TLS 请求器
│   ├── config/
│   │   └── config.js       # 配置加载
│   ├── server/
│   │   └── index.js        # 主服务器
│   ├── utils/
│   │   ├── idGenerator.js  # ID 生成器
│   │   ├── logger.js       # 日志模块
│   │   └── utils.js        # 工具函数
│   └── AntigravityRequester.js # TLS 指纹请求器封装
├── test/
│   ├── test-request.js     # 请求测试
│   └── test-transform.js   # 转换测试
├── .env                    # 环境变量配置（敏感信息）
├── .env.example            # 环境变量配置示例
├── config.json             # 基础配置文件
└── package.json            # 项目配置
```

## Pro 账号随机 ProjectId

对于 Pro 订阅账号，可以跳过 API 验证直接使用随机生成的 ProjectId：

1. 在 `config.json` 文件中设置：
```json
{
  "other": {
    "skipProjectIdFetch": true
  }
}
```

2. 运行 `npm run login` 登录时会自动使用随机生成的 ProjectId

3. 已有账号也会在使用时自动生成随机 ProjectId

注意：此功能仅适用于 Pro 订阅账号。官方已修复免费账号使用随机 ProjectId 的漏洞。

## 注意事项

1. 首次使用需要复制 `.env.example` 为 `.env` 并配置
2. 运行 `npm run login` 获取 Token
3. `.env` 和 `data/accounts.json` 包含敏感信息，请勿泄露
4. 支持多账号轮换，提高可用性
5. Token 会自动刷新，无需手动维护

## License

MIT
