#!/usr/bin/env node
'use strict';

const fs = require('fs/promises');
const fsSync = require('fs');
const http = require('http');
const path = require('path');
const os = require('os');
const { createRequire } = require('module');

const BASE_URL = 'https://www.hinatazaka46.com';
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || 4173);
const MAX_FETCH_PAGES = 500;
const MAX_DOWNLOAD_ITEMS = 60;
const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER || '';
const BASIC_AUTH_PASSWORD = process.env.BASIC_AUTH_PASSWORD || '';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

let browserPromise;

function loadModule(name) {
  try {
    return require(name);
  } catch (error) {
    const candidates = [
      process.env.CODEX_NODE_MODULES,
      process.env.NODE_PATH,
      path.join(
        os.homedir(),
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules',
      ),
    ]
      .filter(Boolean)
      .flatMap((entry) => entry.split(path.delimiter).filter(Boolean));

    for (const root of candidates) {
      try {
        const req = createRequire(path.join(root, 'codex-require.cjs'));
        return req(name);
      } catch (_) {
        // Try the next known module root.
      }
    }

    throw error;
  }
}

function sendJson(res, status, body) {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': payload.length,
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function sendText(res, status, body) {
  const payload = Buffer.from(body);
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': payload.length,
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function sendError(res, status, message, details) {
  sendJson(res, status, { error: message, details });
}

function contentDisposition(filename, fallback = 'download') {
  const ascii = fallback.replace(/[^\x20-\x7e]+/g, '_').replace(/["\\]/g, '');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function basicAuthEnabled() {
  return Boolean(BASIC_AUTH_USER && BASIC_AUTH_PASSWORD);
}

function authorized(req) {
  if (!basicAuthEnabled()) {
    return true;
  }

  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Basic' || !token) {
    return false;
  }

  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator === -1) {
      return false;
    }

    const user = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    return user === BASIC_AUTH_USER && password === BASIC_AUTH_PASSWORD;
  } catch (_) {
    return false;
  }
}

function requestAuth(res) {
  res.writeHead(401, {
    'Content-Type': 'text/plain; charset=utf-8',
    'WWW-Authenticate': 'Basic realm="Hinata Blog PDF", charset="UTF-8"',
    'Cache-Control': 'no-store',
  });
  res.end('認証が必要です。');
}

function decodeHtml(value = '') {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number.parseInt(num, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(html = '') {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ');
}

function cleanText(html = '') {
  return decodeHtml(stripTags(html)).replace(/\s+/g, ' ').trim();
}

function escapeForHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function absoluteUrl(value) {
  return new URL(value, BASE_URL).toString();
}

function assertOfficialUrl(value) {
  const url = new URL(value, BASE_URL);
  if (url.origin !== BASE_URL) {
    throw new Error('公式サイト以外のURLは処理できません。');
  }
  return url;
}

async function fetchOfficial(pathOrUrl) {
  const url = assertOfficialUrl(pathOrUrl);
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.8,en;q=0.6',
      'User-Agent': USER_AGENT,
    },
    signal: AbortSignal.timeout(25000),
  });

  if (!response.ok) {
    throw new Error(`公式サイトの取得に失敗しました: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function parseMembers(html) {
  const members = [];
  const optionPattern = /<option\s+value="([^"]*\/diary\/member\/list[^"]*ct=([^"&]+)[^"]*)">([\s\S]*?)<\/option>/g;

  for (const match of html.matchAll(optionPattern)) {
    const label = cleanText(match[3]).replace(/\s*\|\s*$/, '');
    const updated = label.match(/\(([^)]+更新)\)$/)?.[1] || '';
    const name = label.replace(/\([^)]*更新\)$/, '').trim();
    const id = decodeURIComponent(match[2]);

    if (id && name) {
      members.push({
        id,
        name,
        updated,
        url: absoluteUrl(match[1]),
      });
    }
  }

  return members;
}

function memberListPath(memberId, pageIndex = 0) {
  const url = new URL('/s/official/diary/member/list', BASE_URL);
  url.searchParams.set('ima', '0000');

  if (pageIndex > 0) {
    url.searchParams.set('page', String(pageIndex));
  }

  url.searchParams.set('ct', memberId);
  url.searchParams.set('cd', 'member');
  return `${url.pathname}${url.search}`;
}

function detailPath(id) {
  return `/s/official/diary/detail/${id}?ima=0000&cd=member`;
}

function extractArticleBlock(html) {
  const start = html.indexOf('<div class="p-blog-article">');
  if (start === -1) {
    throw new Error('ブログ本文を見つけられませんでした。');
  }

  const endCandidates = [
    html.indexOf('<div class="p-pager"', start),
    html.indexOf('<div class="l-other-contents--blog"', start),
    html.indexOf('<div class="p-blog-entry__group"', start),
    html.indexOf('<footer', start),
  ].filter((index) => index > start);
  const end = endCandidates.length ? Math.min(...endCandidates) : html.length;
  return html.slice(start, end);
}

function extractClass(block, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = block.match(new RegExp(`<div\\s+class="${escaped}"[^>]*>([\\s\\S]*?)<\\/div>`, 'i'));
  return match ? match[1] : '';
}

function parseArticles(html, memberId, pageIndex) {
  const articles = [];
  const blocks = html.split('<div class="p-blog-article">').slice(1);

  for (const block of blocks) {
    const detailMatch = block.match(/href="([^"]*\/s\/official\/diary\/detail\/(\d+)[^"]*)"/);
    if (!detailMatch) {
      continue;
    }

    const id = detailMatch[2];
    const title = cleanText(extractClass(block, 'c-blog-article__title'));
    const date = cleanText(extractClass(block, 'c-blog-article__date'));
    const memberName = cleanText(extractClass(block, 'c-blog-article__name'));
    const imageMatch = block.match(/<img[^>]+src="([^"]+)"/i);

    articles.push({
      id,
      title: title || `blog-${id}`,
      date,
      memberId,
      memberName,
      page: pageIndex + 1,
      url: absoluteUrl(detailMatch[1]),
      image: imageMatch ? absoluteUrl(imageMatch[1]) : '',
    });
  }

  return articles;
}

function validMemberId(id) {
  return /^(?:\d{1,3}|000)$/.test(String(id));
}

function validBlogId(id) {
  return /^\d{1,10}$/.test(String(id));
}

async function getMembers() {
  const html = await fetchOfficial('/s/official/diary/member/list?ima=0000');
  return parseMembers(html);
}

async function getBlogs(memberIds) {
  const articles = [];
  const seen = new Set();

  for (const memberId of memberIds) {
    const seenForMember = new Set();

    for (let pageIndex = 0; pageIndex < MAX_FETCH_PAGES; pageIndex += 1) {
      const html = await fetchOfficial(memberListPath(memberId, pageIndex));
      const pageArticles = parseArticles(html, memberId, pageIndex);

      if (pageArticles.length === 0) {
        break;
      }

      let newForMember = 0;

      for (const article of pageArticles) {
        if (!seenForMember.has(article.id)) {
          seenForMember.add(article.id);
          newForMember += 1;
        }

        if (!seen.has(article.id)) {
          seen.add(article.id);
          articles.push(article);
        }
      }

      if (newForMember === 0) {
        break;
      }

      if (pageIndex === MAX_FETCH_PAGES - 1) {
        throw new Error(`取得ページ上限に達しました。メンバーID ${memberId} の取得を中断しました。`);
      }
    }
  }

  articles.sort((a, b) => b.id.localeCompare(a.id, 'en', { numeric: true }));
  return articles;
}

async function getBrowser() {
  if (!browserPromise) {
    const { chromium } = loadModule('playwright');
    const executablePath = [
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      chromium.executablePath(),
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ].find((candidate) => candidate && fsSync.existsSync(candidate));

    browserPromise = chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    });
  }
  return browserPromise;
}

async function waitForImages(page) {
  await page.evaluate(async () => {
    const images = Array.from(document.images);
    await Promise.all(
      images.map((image) => {
        if (image.complete) {
          return undefined;
        }
        return new Promise((resolve) => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', resolve, { once: true });
        });
      }),
    );
  });
}

function buildPrintHtml(item, officialHtml) {
  const articleBlock = extractArticleBlock(officialHtml);
  const title = cleanText(extractClass(articleBlock, 'c-blog-article__title')) || item.title || `blog-${item.id}`;
  const memberName = cleanText(extractClass(articleBlock, 'c-blog-article__name')) || item.memberName || '';
  const date = cleanText(extractClass(articleBlock, 'c-blog-article__date')) || item.date || '';
  const sourceUrl = absoluteUrl(detailPath(item.id));

  return `<!doctype html>
    <html lang="ja">
      <head>
        <meta charset="utf-8">
        <base href="${BASE_URL}/">
        <title>${escapeForHtml(title)}</title>
        <style>
          @page {
            size: A4;
            margin: 13mm 12mm 15mm;
          }
          * {
            box-sizing: border-box;
          }
          body {
            margin: 0;
            color: #20242b;
            background: #ffffff;
            font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif;
            font-size: 14px;
            line-height: 1.86;
            letter-spacing: 0;
          }
          .print-shell {
            max-width: 760px;
            margin: 0 auto;
          }
          .print-kicker {
            margin: 0 0 7px;
            color: #2878b8;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0;
          }
          .print-title {
            margin: 0 0 8px;
            font-size: 25px;
            line-height: 1.35;
            word-break: break-word;
          }
          .print-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 6px 14px;
            margin: 0 0 20px;
            color: #626c78;
            font-size: 12px;
          }
          .p-blog-article__head {
            display: none;
          }
          .c-blog-article__text {
            word-break: break-word;
          }
          .c-blog-article__text p {
            margin: 0;
          }
          .c-blog-article__text img {
            display: block;
            width: auto !important;
            max-width: 25% !important;
            height: auto !important;
            margin: 8px auto;
            break-inside: avoid;
            border-radius: 2px;
          }
          .c-blog-article__text a {
            color: #1d5f94;
            text-decoration: underline;
            overflow-wrap: anywhere;
          }
          .c-blog-article__text iframe,
          .c-blog-article__text video {
            max-width: 100%;
          }
          .print-source {
            margin-top: 26px;
            padding-top: 10px;
            border-top: 1px solid #dfe4ea;
            color: #6a7382;
            font-size: 10px;
            overflow-wrap: anywhere;
          }
        </style>
      </head>
      <body>
        <main class="print-shell">
          <p class="print-kicker">日向坂46 公式ブログ</p>
          <h1 class="print-title">${escapeForHtml(title)}</h1>
          <div class="print-meta">
            <span>${escapeForHtml(date)}</span>
            <span>${escapeForHtml(memberName)}</span>
          </div>
          ${articleBlock}
          <div class="print-source">${escapeForHtml(sourceUrl)}</div>
        </main>
      </body>
    </html>`;
}

async function renderBlogPdf(item) {
  const officialHtml = await fetchOfficial(detailPath(item.id));
  const printHtml = buildPrintHtml(item, officialHtml);
  const browser = await getBrowser();
  const page = await browser.newPage({
    viewport: { width: 980, height: 1400 },
    deviceScaleFactor: 1,
    userAgent: USER_AGENT,
  });

  try {
    await page.setContent(printHtml, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {});
    await waitForImages(page).catch(() => {});

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '10mm',
        right: '10mm',
        bottom: '12mm',
        left: '10mm',
      },
    });
    return pdf;
  } finally {
    await page.close();
  }
}

function sanitizeFilename(value, fallback = 'blog') {
  const cleaned = String(value || fallback)
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');

  return (cleaned || fallback).slice(0, 150);
}

function pdfFilename(item, index) {
  const date = sanitizeFilename(item.date || '', '')
    .replace(/\./g, '-')
    .replace(/\s+/g, '_')
    .replace(/:/g, '-');
  const base = [date, item.memberName, item.title, item.id].filter(Boolean).join('_');
  return `${sanitizeFilename(base || `blog-${index + 1}`)}.pdf`;
}

function uniqueFilenames(items) {
  const used = new Map();
  return items.map((item, index) => {
    const name = pdfFilename(item, index);
    const lower = name.toLowerCase();
    const count = used.get(lower) || 0;
    used.set(lower, count + 1);

    if (count === 0) {
      return name;
    }

    return name.replace(/\.pdf$/i, `-${count + 1}.pdf`);
  });
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function u16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const now = new Date();
  const { dosTime, dosDate } = dosDateTime(now);

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const crc = crc32(data);
    const flag = 0x0800;
    const method = 0;

    const localHeader = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(flag),
      u16(method),
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
    ]);

    localParts.push(localHeader, data);

    const centralHeader = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(flag),
      u16(method),
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);

    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDirectory.length),
    u32(offset),
    u16(0),
  ]);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      throw new Error('リクエストが大きすぎます。');
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/members') {
    const members = await getMembers();
    sendJson(res, 200, { members });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/blogs') {
    const memberIds = (url.searchParams.get('members') || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (memberIds.length === 0 || memberIds.some((id) => !validMemberId(id))) {
      sendError(res, 400, 'メンバーを選択してください。');
      return;
    }

    const blogs = await getBlogs(memberIds);
    sendJson(res, 200, {
      blogs,
      count: blogs.length,
      fetchedAt: new Date().toISOString(),
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/download') {
    const body = await readJson(req);
    const items = Array.isArray(body.blogs) ? body.blogs : [];

    if (items.length === 0) {
      sendError(res, 400, '保存するブログを選択してください。');
      return;
    }

    if (items.length > MAX_DOWNLOAD_ITEMS) {
      sendError(res, 400, `一度に保存できるブログは${MAX_DOWNLOAD_ITEMS}件までです。`);
      return;
    }

    const normalized = items.map((item) => ({
      id: String(item.id || ''),
      title: String(item.title || ''),
      date: String(item.date || ''),
      memberName: String(item.memberName || ''),
    }));

    if (normalized.some((item) => !validBlogId(item.id))) {
      sendError(res, 400, 'ブログIDが正しくありません。');
      return;
    }

    const names = uniqueFilenames(normalized);
    const pdfs = [];

    for (let index = 0; index < normalized.length; index += 1) {
      const pdf = await renderBlogPdf(normalized[index]);
      pdfs.push({ name: names[index], data: pdf });
    }

    if (pdfs.length === 1) {
      const filename = pdfs[0].name;
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Length': pdfs[0].data.length,
        'Content-Disposition': contentDisposition(filename, 'hinata-blog.pdf'),
        'Cache-Control': 'no-store',
      });
      res.end(pdfs[0].data);
      return;
    }

    const zip = createZip(pdfs);
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '_');
    const filename = `hinata_blog_${stamp}.zip`;

    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Length': zip.length,
      'Content-Disposition': contentDisposition(filename, 'hinata-blogs.zip'),
      'Cache-Control': 'no-store',
    });
    res.end(zip);
    return;
  }

  sendError(res, 404, 'APIが見つかりません。');
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

async function serveStatic(req, res, url) {
  const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendError(res, 403, 'アクセスできません。');
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    const type = mimeTypes[path.extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': data.length,
      'Cache-Control': 'no-store',
    });
    res.end(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      sendError(res, 404, 'ページが見つかりません。');
      return;
    }
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  try {
    if (url.pathname === '/healthz') {
      sendText(res, 200, 'ok');
      return;
    }

    if (!authorized(req)) {
      requestAuth(res);
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else {
      await serveStatic(req, res, url);
    }
  } catch (error) {
    console.error(error);
    sendError(res, 500, error.message || 'サーバーエラーが発生しました。');
  }
});

server.listen(PORT, () => {
  console.log(`Hinata Blog PDF is running: http://localhost:${PORT}`);
});

async function shutdown() {
  server.close();
  if (browserPromise) {
    const browser = await browserPromise.catch(() => null);
    if (browser) {
      await browser.close();
    }
  }
}

process.on('SIGINT', async () => {
  await shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await shutdown();
  process.exit(0);
});
