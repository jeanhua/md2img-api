const express = require('express');
const puppeteer = require('puppeteer-core');
const { marked } = require('marked');
const { markedHighlight } = require('marked-highlight');
const hljs = require('highlight.js');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome';

app.use(express.json({ limit: '10mb' }));
app.use(express.text({ limit: '10mb', type: ['text/plain', 'text/html'] }));

const STYLES_DIR = path.join(__dirname, 'styles');
const githubMarkdownCss = fs.readFileSync(path.join(STYLES_DIR, 'github-markdown.min.css'), 'utf-8');
const tokyoNightCss     = fs.readFileSync(path.join(STYLES_DIR, 'tokyo-night-dark.min.css'), 'utf-8');

const INLINE_STYLES = `
<style>
${githubMarkdownCss}
${tokyoNightCss}

:root { --bg-gradient: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); }
body {
    margin: 0; display: flex; justify-content: center;
    background: var(--bg-gradient); padding: 30px 10px;
    min-height: fit-content; height: auto;
}
.container {
    background: white; padding: 45px 35px; border-radius: 16px;
    box-shadow: 0 15px 35px rgba(0,0,0,0.1); width: 750px; box-sizing: border-box;
}
.markdown-body {
    font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif,
                 "Noto Color Emoji", "Segoe UI Emoji", "Apple Color Emoji" !important;
    font-size: 20px !important; line-height: 1.85 !important;
    color: #2c3e50; -webkit-font-smoothing: antialiased;
}
.markdown-body h1, .markdown-body h2, .markdown-body h3 {
    font-weight: 600 !important; color: #1a1a1a;
    margin-top: 24px !important; margin-bottom: 16px !important;
}
.markdown-body pre {
    border-radius: 12px !important; background-color: #1a1b26 !important;
    padding: 24px !important; font-size: 16px !important;
    line-height: 1.6 !important; overflow: hidden; border: 1px solid #292e42;
}
.markdown-body pre code {
    font-family: 'Fira Code', 'Menlo', 'Monaco', monospace !important;
    color: #cfc9c2 !important; background: transparent !important; text-shadow: none !important;
}
.hljs { display: block; overflow-x: auto; padding: 0; color: #a9b1d6 !important; background: transparent !important; }
</style>
`;

// ─── 配置 marked 语法高亮
marked.use(markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
    }
}));

// ─── 全局复用浏览器实例
let browserInstance = null;

async function getBrowser() {
    if (browserInstance && browserInstance.connected) {
        return browserInstance;
    }
    browserInstance = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-zygote',
            '--single-process'
        ]
    });
    browserInstance.on('disconnected', () => { browserInstance = null; });
    console.log('🟢 Chrome 已启动');
    return browserInstance;
}

// 服务启动时预热浏览器
getBrowser().catch(console.error);

async function renderToImage(htmlContent, viewportOptions = {}) {
    const viewport = {
        width: 850,
        height: 100,
        deviceScaleFactor: 1.5,
        ...viewportOptions
    };

    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
        await page.setViewport(viewport);
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const imgBuffer = await page.screenshot({ type: 'png', fullPage: true, omitBackground: false });
        return imgBuffer;
    } finally {
        await page.close().catch(() => {});
    }
}

/**
 * POST /render  —  Markdown → PNG
 */
app.post('/render', async (req, res) => {
    let mdContent;

    if (typeof req.body === 'string') {
        mdContent = req.body;
    } else if (req.body && typeof req.body.markdown === 'string') {
        mdContent = req.body.markdown;
    } else {
        return res.status(400).json({ error: '请提供 markdown 内容（JSON 字段 "markdown" 或纯文本 body）' });
    }

    if (!mdContent.trim()) {
        return res.status(400).json({ error: 'markdown 内容不能为空' });
    }

    try {
        const htmlContent = marked.parse(mdContent);

        const fullHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${INLINE_STYLES}
</head>
<body>
    <div id="capture-target" class="container">
        <article class="markdown-body">${htmlContent}</article>
    </div>
</body>
</html>`;

        const imgBuffer = await renderToImage(fullHtml);
        res.set('Content-Type', 'image/png');
        res.set('Content-Disposition', 'inline; filename="render.png"');
        res.send(imgBuffer);

    } catch (err) {
        console.error('💥 Markdown 渲染出错:', err.message);
        if (!res.headersSent) {
            res.status(500).json({ error: '渲染失败', detail: err.message });
        }
    }
});

/**
 * POST /render-html  —  HTML → PNG
 */
app.post('/render-html', async (req, res) => {
    let htmlContent;
    let width = 1280;
    let height = 800;
    let scale = 1.5;
    let fullPage = true;

    if (typeof req.body === 'string') {
        htmlContent = req.body;
    } else if (req.body && typeof req.body.html === 'string') {
        htmlContent = req.body.html;
        width = Number(req.body.width) || width;
        height = Number(req.body.height) || height;
        scale = Number(req.body.scale) || scale;
        fullPage = req.body.fullPage !== undefined ? Boolean(req.body.fullPage) : fullPage;
    } else {
        return res.status(400).json({ error: '请提供 HTML 内容（JSON 字段 "html" 或纯文本 body）' });
    }

    if (!htmlContent.trim()) {
        return res.status(400).json({ error: 'HTML 内容不能为空' });
    }

    const isFullDocument = /<html[\s>]/i.test(htmlContent);
    const fullHtml = isFullDocument ? htmlContent : `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>body { margin: 0; padding: 0; box-sizing: border-box; }</style>
</head>
<body>${htmlContent}</body>
</html>`;

    try {
        const browser = await getBrowser();
        const page = await browser.newPage();
        try {
            await page.setViewport({ width, height, deviceScaleFactor: scale });
            await page.setContent(fullHtml, { waitUntil: 'domcontentloaded', timeout: 30000 });

            const imgBuffer = await page.screenshot({ type: 'png', fullPage, omitBackground: false });

            res.set('Content-Type', 'image/png');
            res.set('Content-Disposition', 'inline; filename="render-html.png"');
            res.send(imgBuffer);

        } finally {
            await page.close().catch(() => {});
        }

    } catch (err) {
        console.error('💥 HTML 渲染出错:', err.message);
        if (!res.headersSent) {
            res.status(500).json({ error: '渲染失败', detail: err.message });
        }
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', chrome: CHROME_PATH });
});

app.listen(PORT, () => {
    console.log(`🚀 服务已启动: http://localhost:${PORT}`);
    console.log(`🌐 Chrome 路径: ${CHROME_PATH}`);
    console.log(`📌 接口: POST /render       （Markdown → PNG）`);
    console.log(`📌 接口: POST /render-html  （HTML → PNG）`);
    console.log(`📌 健康检查: GET /health`);
});