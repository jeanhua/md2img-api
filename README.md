# md2img-api

Markdown/HTML 转 PNG 图片渲染 API 服务

## 功能特性

- 📝 **Markdown 转 PNG** - 将 Markdown 内容渲染为精美图片
- 🌐 **HTML 转 PNG** - 支持自定义 HTML 内容截图
- 🎨 **代码高亮** - 内置 Tokyo Night Dark 主题语法高亮
- 📱 **响应式样式** - 采用 GitHub Markdown 风格
- 🚀 **高性能** - 浏览器实例全局复用，支持并发请求
- 🐳 **Docker 支持** - 一键部署，开箱即用

## API 接口

### 1. Markdown 转 PNG

```http
POST /render
```

**请求方式一：JSON 格式**

```json
{
  "markdown": "# 标题\n\n这是一段 **粗体** 文字"
}
```

**请求方式二：纯文本格式**

```
# 标题

这是一段 **粗体** 文字
```

**响应**：PNG 图片

### 2. HTML 转 PNG

```http
POST /render-html
```

**请求参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| html | string | 是 | HTML 内容 |
| width | number | 否 | 视口宽度，默认 1280 |
| height | number | 否 | 视口高度，默认 800 |
| scale | number | 否 | 设备像素比，默认 1.5 |
| fullPage | boolean | 否 | 是否截取完整页面，默认 true |

**请求示例：**

```json
{
  "html": "<h1>Hello World</h1>",
  "width": 1920,
  "height": 1080,
  "scale": 2
}
```

**响应**：PNG 图片

### 3. 健康检查

```http
GET /health
```

**响应：**

```json
{
  "status": "ok",
  "chrome": "/usr/bin/google-chrome"
}
```

## 快速开始

### Docker 部署（推荐）

```bash
# 运行镜像
docker run -d -p 3000:3000 --name md2img-api jeanhua/md2img-api:latest

# 或者手动构建镜像
docker build -t md2img-api .
# 运行容器
docker run -d -p 3000:3000 --name md2img-api md2img-api
```

### 本地运行

**环境要求：**

- Node.js 20+
- Google Chrome 浏览器

**安装依赖：**

```bash
npm install
```

**配置 Chrome 路径（可选）：**

```bash
# Linux/Mac
export CHROME_PATH=/usr/bin/google-chrome

# Windows
set CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

**启动服务：**

```bash
npm start
```

服务将在 `http://localhost:3000` 启动

## 使用示例

### cURL 示例

```bash
# Markdown 转 PNG
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{"markdown": "# Hello\n\n```js\nconsole.log(\"world\");\n```"}' \
  -o output.png

# HTML 转 PNG
curl -X POST http://localhost:3000/render-html \
  -H "Content-Type: application/json" \
  -d '{"html": "<div style=\"padding:20px;\"><h1>Hello</h1></div>"}' \
  -o output.png
```

### JavaScript 示例

```javascript
const response = await fetch('http://localhost:3000/render', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    markdown: '# 标题\n\n这是一段内容'
  })
});

const blob = await response.blob();
const url = URL.createObjectURL(blob);
```

## 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| PORT | 3000 | 服务端口 |
| CHROME_PATH | /usr/bin/google-chrome | Chrome 可执行文件路径 |

## 许可证

[MIT](LICENSE)
