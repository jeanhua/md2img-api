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

const style = fs.readFileSync('./style.css')

const INLINE_STYLES = `
<style>
${githubMarkdownCss}
${tokyoNightCss}
${style}
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