#!/usr/bin/env node
'use strict';

const fs = require('fs/promises');
const fsSync = require('fs');
const http = require('http');
const path = require('path');
const os = require('os');
const { createRequire } = require('module');
const { once } = require('events');

const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || 4173);
const MAX_FETCH_PAGES = 500;
const NOGI_FETCH_PAGE_SIZE = 100;
const MAX_DOWNLOAD_ITEMS = 60;
const PDF_IMAGE_MAX_WIDTH = 360;
const PDF_IMAGE_MAX_HEIGHT = 540;
const PDF_IMAGE_MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const PDF_BROWSER_LAUNCH_TIMEOUT = 30000;
const PDF_RENDER_TIMEOUT = 60000;
const TRANSPARENT_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER || '';
const BASIC_AUTH_PASSWORD = process.env.BASIC_AUTH_PASSWORD || '';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const PROVIDERS = {
  hinata: {
    id: 'hinata',
    label: '日向坂46',
    slug: 'hinata',
    baseUrl: 'https://www.hinatazaka46.com',
    officialUrl: 'https://www.hinatazaka46.com/s/official/?ima=0000',
    membersPath: '/s/official/diary/member/list?ima=0000',
    detailPath(id) {
      return `/s/official/diary/detail/${id}?ima=0000&cd=member`;
    },
    memberListPath(memberId, pageIndex = 0) {
      const url = new URL('/s/official/diary/member/list', this.baseUrl);
      url.searchParams.set('ima', '0000');

      if (pageIndex > 0) {
        url.searchParams.set('page', String(pageIndex));
      }

      url.searchParams.set('ct', memberId);
      url.searchParams.set('cd', 'member');
      return `${url.pathname}${url.search}`;
    },
    parseMembers(html) {
      return parseOptionMembers(this, html, /\/diary\/member\/list/);
    },
    parseArticles(html, memberId, pageIndex) {
      return parseHinataArticles(this, html, memberId, pageIndex);
    },
    extractPrintData(item, officialHtml) {
      return extractHinataPrintData(item, officialHtml);
    },
  },
  sakura: {
    id: 'sakura',
    label: '櫻坂46',
    slug: 'sakura',
    baseUrl: 'https://sakurazaka46.com',
    officialUrl: 'https://sakurazaka46.com/s/s46/?ima=0335',
    membersPath: '/s/s46/diary/blog/list?ima=0000',
    detailPath(id) {
      return `/s/s46/diary/detail/${id}?ima=0000&cd=blog`;
    },
    memberListPath(memberId, pageIndex = 0) {
      const url = new URL('/s/s46/diary/blog/list', this.baseUrl);
      url.searchParams.set('ima', '0000');

      if (pageIndex > 0) {
        url.searchParams.set('page', String(pageIndex));
        url.searchParams.set('cd', 'blog');
      }

      url.searchParams.set('ct', memberId);
      return `${url.pathname}${url.search}`;
    },
    parseMembers(html) {
      return parseOptionMembers(this, html, /\/diary\/blog\/list/);
    },
    parseArticles(html, memberId, pageIndex) {
      return parseSakuraArticles(this, html, memberId, pageIndex);
    },
    extractPrintData(item, officialHtml) {
      return extractSakuraPrintData(item, officialHtml);
    },
  },
  keyaki: {
    id: 'keyaki',
    label: '欅坂46',
    slug: 'keyaki',
    baseUrl: 'https://www.keyakizaka46.com',
    officialUrl: 'https://www.keyakizaka46.com/s/k46o/diary/member?ima=0000',
    membersPath: '/s/k46o/diary/member?ima=0000',
    detailPath(id) {
      return `/s/k46o/diary/detail/${id}?ima=0000&cd=member`;
    },
    memberListPath(memberId, pageIndex = 0) {
      const url = new URL('/s/k46o/diary/member/list', this.baseUrl);
      url.searchParams.set('ima', '0000');

      if (pageIndex > 0) {
        url.searchParams.set('page', String(pageIndex));
        url.searchParams.set('cd', 'member');
      }

      url.searchParams.set('ct', memberId);
      return `${url.pathname}${url.search}`;
    },
    parseMembers(html) {
      return parseKeyakiMembers(this, html);
    },
    parseArticles(html, memberId, pageIndex) {
      return parseKeyakiArticles(this, html, memberId, pageIndex);
    },
    extractPrintData(item, officialHtml) {
      return extractKeyakiPrintData(item, officialHtml);
    },
  },
  nogi: {
    id: 'nogi',
    label: '乃木坂46',
    slug: 'nogi',
    baseUrl: 'https://www.nogizaka46.com',
    officialUrl: 'https://sp.nogizaka46.com/',
    membersPath: '/s/n46/diary/MEMBER?ima=0000',
    detailPath(id) {
      return `/s/n46/diary/detail/${id}?ima=0000&cd=MEMBER`;
    },
    parseMembers(html) {
      return parseOptionMembers(this, html, /\/diary\/MEMBER\/list/i);
    },
    getBlogs(memberIds) {
      return getNogiBlogs(this, memberIds);
    },
    extractPrintData(item, officialHtml) {
      return extractNogiPrintData(item, officialHtml);
    },
  },
};

const activeBrowsers = new Set();
let pdfJobTail = Promise.resolve();

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
        const requireRoot = path.basename(root) === 'node_modules' ? path.dirname(root) : root;
        const req = createRequire(path.join(requireRoot, 'codex-require.cjs'));
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
    'WWW-Authenticate': 'Basic realm="Sakamichi Blog PDF", charset="UTF-8"',
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

function providerList() {
  return Object.values(PROVIDERS).map((provider) => ({
    id: provider.id,
    label: provider.label,
    officialUrl: provider.officialUrl,
  }));
}

function getProvider(group = 'hinata') {
  const provider = PROVIDERS[group] || PROVIDERS.hinata;
  return provider;
}

function providerAbsoluteUrl(provider, value) {
  return new URL(value, provider.baseUrl).toString();
}

function providerOptionalAbsoluteUrl(provider, value) {
  if (!value) {
    return '';
  }

  try {
    const url = new URL(value, provider.baseUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch (_) {
    return '';
  }
}

function assertOfficialUrl(provider, value) {
  const url = new URL(value, provider.baseUrl);
  if (url.origin !== new URL(provider.baseUrl).origin) {
    throw new Error(`${provider.label}公式サイト以外のURLは処理できません。`);
  }
  return url;
}

async function fetchOfficial(provider, pathOrUrl) {
  const url = assertOfficialUrl(provider, pathOrUrl);
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.8,en;q=0.6',
      'User-Agent': USER_AGENT,
    },
    signal: AbortSignal.timeout(25000),
  });

  if (!response.ok) {
    throw new Error(`${provider.label}公式サイトの取得に失敗しました: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function parseOptionMembers(provider, html, pathPattern) {
  const members = [];
  const optionPattern = /<option\s+value="([^"]*ct=([^"&]+)[^"]*)"[^>]*>([\s\S]*?)<\/option>/g;

  for (const match of html.matchAll(optionPattern)) {
    if (!pathPattern.test(match[1])) {
      continue;
    }

    const label = cleanText(match[3]).split('|')[0].trim();
    const updated = label.match(/\(([^)]+更新)\)$/)?.[1] || '';
    const name = label.replace(/\([^)]*更新\)$/, '').trim();
    const id = decodeURIComponent(match[2]);

    if (id && name) {
      members.push({
        id,
        name,
        updated,
        url: providerAbsoluteUrl(provider, match[1]),
      });
    }
  }

  return members;
}

function extractHinataArticleBlock(html) {
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

function extractAnyClass(block, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = block.match(
    new RegExp(`<([a-z0-9]+)\\b[^>]*class="[^"]*\\b${escaped}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/\\1>`, 'i'),
  );
  return match ? match[2] : '';
}

function extractDivByClass(block, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = block.match(
    new RegExp(`<div\\b[^>]*class="[^"]*\\b${escaped}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/div>`, 'i'),
  );
  return match ? match[1] : '';
}

function extractBalancedDivByClass(html, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const startPattern = new RegExp(`<div\\b[^>]*class="[^"]*\\b${escaped}\\b[^"]*"[^>]*>`, 'i');
  const startMatch = startPattern.exec(html);

  if (!startMatch) {
    return '';
  }

  const start = startMatch.index + startMatch[0].length;
  const tagPattern = /<\/?div\b[^>]*>/gi;
  tagPattern.lastIndex = start;
  let depth = 1;
  let match;

  while ((match = tagPattern.exec(html))) {
    const tag = match[0];
    if (tag.startsWith('</')) {
      depth -= 1;
    } else if (!tag.endsWith('/>')) {
      depth += 1;
    }

    if (depth === 0) {
      return html.slice(start, match.index);
    }
  }

  return html.slice(start);
}

function formatKeyakiMemberUpdated(value = '') {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}.${match[2]}.${match[3]}更新` : '';
}

function parseKeyakiMembers(provider, html) {
  const updates = new Map();
  const updatePattern = /member:\s*"([^"]+)"\s*,\s*update:\s*"([^"]+)"/g;

  for (const match of html.matchAll(updatePattern)) {
    updates.set(match[1], formatKeyakiMemberUpdated(match[2]));
  }

  const members = [];
  const seen = new Set();
  const memberPattern =
    /<li\b[^>]*data-member="([^"]+)"[\s\S]*?<a href="([^"]*\/s\/k46o\/diary\/member\/list[^"]*ct=([^"&]+)[^"]*)"[\s\S]*?<p\s+class="name"[^>]*>([\s\S]*?)<\/p>/g;

  for (const match of html.matchAll(memberPattern)) {
    const id = decodeURIComponent(match[3] || match[1]);
    const name = cleanText(match[4]);

    if (!id || !name || seen.has(id)) {
      continue;
    }

    seen.add(id);
    members.push({
      id,
      name,
      updated: updates.get(id) || '',
      url: providerAbsoluteUrl(provider, match[2]),
    });
  }

  return members;
}

function parseHinataArticles(provider, html, memberId, pageIndex) {
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
      group: provider.id,
      groupLabel: provider.label,
      url: providerAbsoluteUrl(provider, detailMatch[1]),
      image: imageMatch ? providerAbsoluteUrl(provider, imageMatch[1]) : '',
    });
  }

  return articles;
}

function parseKeyakiListDate(block) {
  const dateMatch = block.match(
    /<div\s+class="box-date"[\s\S]*?<time[^>]*>([\s\S]*?)<\/time>\s*<time[^>]*>([\s\S]*?)<\/time>/i,
  );

  if (!dateMatch) {
    return '';
  }

  const month = cleanText(dateMatch[1]);
  const day = cleanText(dateMatch[2]);
  return month && day ? `${month}.${day}` : `${month}${day}`;
}

function parseKeyakiArticles(provider, html, memberId, pageIndex) {
  const listStart = html.indexOf('<div class="keyaki-blog_list">');
  if (listStart === -1) {
    return [];
  }

  const pagerStart = html.indexOf('<div class="pager"', listStart);
  const listBlock = html.slice(listStart, pagerStart > listStart ? pagerStart : html.length);
  const articles = [];
  const articlePattern = /<article\b[\s\S]*?<\/article>/gi;

  for (const match of listBlock.matchAll(articlePattern)) {
    const block = match[0];
    const titleMatch = block.match(
      /<div\s+class="box-ttl"[\s\S]*?<a href="([^"]*\/s\/k46o\/diary\/detail\/(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/i,
    );

    if (!titleMatch) {
      continue;
    }

    const imageMatch = Array.from(block.matchAll(/<img[^>]+src="([^"]*)"/gi)).find((item) => item[1]);
    const id = titleMatch[2];

    articles.push({
      id,
      title: cleanText(titleMatch[3]) || `blog-${id}`,
      date: parseKeyakiListDate(block),
      memberId,
      memberName: cleanText(block.match(/<p\s+class="name"[^>]*>([\s\S]*?)<\/p>/i)?.[1] || ''),
      page: pageIndex + 1,
      group: provider.id,
      groupLabel: provider.label,
      url: providerAbsoluteUrl(provider, titleMatch[1]),
      image: imageMatch ? providerAbsoluteUrl(provider, imageMatch[1]) : '',
    });
  }

  return articles;
}

function parseSakuraArticles(provider, html, memberId, pageIndex) {
  const listMatch = html.match(/<ul\s+class="com-blog-part[^"]*">/i);
  if (!listMatch) {
    return [];
  }

  const listStart = listMatch.index;
  const listEnd = html.indexOf('</ul>', listStart);
  const listBlock = html.slice(listStart, listEnd > listStart ? listEnd : html.length);
  const articles = [];
  const articlePattern = /<li class="box"><a href="([^"]*\/s\/s46\/diary\/detail\/(\d+)[^"]*)"[\s\S]*?(?=<\/a><\/li>)/g;

  for (const match of listBlock.matchAll(articlePattern)) {
    const block = match[0];
    const id = match[2];
    const title = cleanText(block.match(/<h3\s+class="title"[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || '');
    const date = cleanText(block.match(/<p\s+class="date[^"]*"[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '');
    const memberName = cleanText(block.match(/<p\s+class="name"[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '');
    const imageMatch = block.match(/background-image:\s*url\(([^)]+)\)/i);

    articles.push({
      id,
      title: title || `blog-${id}`,
      date,
      memberId,
      memberName,
      page: pageIndex + 1,
      group: provider.id,
      groupLabel: provider.label,
      url: providerAbsoluteUrl(provider, match[1]),
      image: imageMatch ? providerAbsoluteUrl(provider, imageMatch[1].replace(/^['"]|['"]$/g, '')) : '',
    });
  }

  return articles;
}

function parseJsonp(raw) {
  const json = raw.trim().replace(/^res\(/, '').replace(/\);?$/, '');
  return JSON.parse(json);
}

function formatNogiDate(value = '') {
  const match = String(value).match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);
  return match ? `${match[1]}.${match[2]}.${match[3]} ${match[4]}:${match[5]}` : value;
}

function parseNogiApiArticles(provider, data, memberId, pageIndex) {
  return (data || []).map((item) => {
    const id = String(item.code || '');
    const url =
      providerOptionalAbsoluteUrl(provider, item.link) ||
      providerAbsoluteUrl(provider, provider.detailPath(id));

    return {
      id,
      title: item.title || `blog-${id}`,
      date: formatNogiDate(item.date || ''),
      memberId,
      memberName: item.name || '',
      page: pageIndex + 1,
      group: provider.id,
      groupLabel: provider.label,
      url,
      image: providerOptionalAbsoluteUrl(provider, item.img),
    };
  });
}

function validMemberId(id) {
  return /^\d{1,8}$/.test(String(id));
}

function validBlogId(id) {
  return /^\d{1,10}$/.test(String(id));
}

async function getMembers(group) {
  const provider = getProvider(group);
  const html = await fetchOfficial(provider, provider.membersPath);
  return provider.parseMembers(html);
}

async function getHtmlBlogs(provider, memberIds) {
  const articles = [];
  const seen = new Set();

  for (const memberId of memberIds) {
    const seenForMember = new Set();

    for (let pageIndex = 0; pageIndex < MAX_FETCH_PAGES; pageIndex += 1) {
      const html = await fetchOfficial(provider, provider.memberListPath(memberId, pageIndex));
      const pageArticles = provider.parseArticles(html, memberId, pageIndex);

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
        throw new Error(`取得ページ上限に達しました。${provider.label} メンバーID ${memberId} の取得を中断しました。`);
      }
    }
  }

  articles.sort((a, b) => b.id.localeCompare(a.id, 'en', { numeric: true }));
  return articles;
}

async function getNogiBlogs(provider, memberIds) {
  const articles = [];
  const seen = new Set();

  for (const memberId of memberIds) {
    const seenForMember = new Set();

    for (let offset = 0; offset < MAX_FETCH_PAGES * NOGI_FETCH_PAGE_SIZE; offset += NOGI_FETCH_PAGE_SIZE) {
      const url = new URL('/s/n46/api/list/blog', provider.baseUrl);
      url.searchParams.set('rw', String(NOGI_FETCH_PAGE_SIZE));
      url.searchParams.set('st', String(offset));
      url.searchParams.set('ct', memberId);

      const raw = await fetchOfficial(provider, `${url.pathname}${url.search}`);
      const payload = parseJsonp(raw);
      const pageArticles = parseNogiApiArticles(
        provider,
        Array.isArray(payload.data) ? payload.data : [],
        memberId,
        Math.floor(offset / NOGI_FETCH_PAGE_SIZE),
      );

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

      const total = Number.parseInt(payload.count, 10);
      if (newForMember === 0 || (Number.isFinite(total) && offset + pageArticles.length >= total)) {
        break;
      }
    }
  }

  articles.sort((a, b) => b.id.localeCompare(a.id, 'en', { numeric: true }));
  return articles;
}

async function getBlogs(group, memberIds) {
  const provider = getProvider(group);
  return provider.getBlogs ? provider.getBlogs(memberIds) : getHtmlBlogs(provider, memberIds);
}

async function launchPdfBrowser() {
  const { chromium } = loadModule('playwright');
  const executablePath = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    chromium.executablePath(),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].find((candidate) => candidate && fsSync.existsSync(candidate));

  const browser = await chromium.launch({
    headless: true,
    timeout: PDF_BROWSER_LAUNCH_TIMEOUT,
    ...(executablePath ? { executablePath } : {}),
  });
  activeBrowsers.add(browser);
  return browser;
}

async function runPdfJob(task) {
  const previous = pdfJobTail;
  let release;
  pdfJobTail = new Promise((resolve) => {
    release = resolve;
  });

  await previous.catch(() => {});
  try {
    return await task();
  } finally {
    release();
  }
}

async function withTimeout(promise, timeoutMs, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
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

async function optimizePrintImages(html, provider) {
  const sources = Array.from(
    new Set(
      Array.from(html.matchAll(/<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi))
        .map((match) => match[2].trim())
        .filter(Boolean),
    ),
  );

  if (sources.length === 0) {
    return html;
  }

  const sharp = loadModule('sharp');
  sharp.cache(false);
  sharp.concurrency(1);
  let optimizedHtml = html;

  for (const source of sources) {
    if (source.startsWith('data:')) {
      continue;
    }

    let replacement = TRANSPARENT_PIXEL;

    try {
      const imageUrl = new URL(decodeHtml(source), provider.baseUrl);
      if (!['http:', 'https:'].includes(imageUrl.protocol)) {
        throw new Error('未対応の画像URLです。');
      }

      const response = await fetch(imageUrl, {
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          Referer: provider.officialUrl,
          'User-Agent': USER_AGENT,
        },
        signal: AbortSignal.timeout(20000),
      });

      if (!response.ok) {
        throw new Error(`画像取得エラー: ${response.status}`);
      }

      const contentLength = Number.parseInt(response.headers.get('content-length') || '0', 10);
      if (contentLength > PDF_IMAGE_MAX_SOURCE_BYTES) {
        throw new Error('画像サイズが上限を超えています。');
      }

      const input = Buffer.from(await response.arrayBuffer());
      if (input.length > PDF_IMAGE_MAX_SOURCE_BYTES) {
        throw new Error('画像サイズが上限を超えています。');
      }

      const output = await sharp(input, {
        animated: false,
        failOn: 'none',
        limitInputPixels: 25_000_000,
      })
        .rotate()
        .resize({
          width: PDF_IMAGE_MAX_WIDTH,
          height: PDF_IMAGE_MAX_HEIGHT,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 72, progressive: true })
        .toBuffer();

      replacement = `data:image/jpeg;base64,${output.toString('base64')}`;
    } catch (error) {
      console.warn(`PDF画像を軽量化できませんでした: ${source} (${error.message})`);
    }

    optimizedHtml = optimizedHtml.split(source).join(replacement);
  }

  return optimizedHtml;
}

function extractHinataPrintData(item, officialHtml) {
  const articleBlock = extractHinataArticleBlock(officialHtml);
  return {
    articleBlock,
    title: cleanText(extractClass(articleBlock, 'c-blog-article__title')) || item.title || `blog-${item.id}`,
    memberName: cleanText(extractClass(articleBlock, 'c-blog-article__name')) || item.memberName || '',
    date: cleanText(extractClass(articleBlock, 'c-blog-article__date')) || item.date || '',
  };
}

function extractSakuraPrintData(item, officialHtml) {
  const body = extractDivByClass(officialHtml, 'box-article');
  if (!body) {
    throw new Error('ブログ本文を見つけられませんでした。');
  }

  const title = officialHtml.match(/<h1\s+class="title"[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '';
  const foot = officialHtml.match(
    /<div\s+class="blog-foot"[\s\S]*?<p\s+class="name">([\s\S]*?)<\/p>\s*<p\s+class="date[^"]*">([\s\S]*?)<\/p>/i,
  );

  return {
    articleBlock: `<div class="blog-content-body">${body}</div>`,
    title: cleanText(title) || item.title || `blog-${item.id}`,
    memberName: cleanText(foot?.[1] || '') || item.memberName || '',
    date: cleanText(foot?.[2] || '') || item.date || '',
  };
}

function extractKeyakiPrintData(item, officialHtml) {
  const body = extractBalancedDivByClass(officialHtml, 'box-article');
  if (!body) {
    throw new Error('ブログ本文を見つけられませんでした。');
  }

  const singleBlock = extractBalancedDivByClass(officialHtml, 'keyaki-blog_single') || officialHtml;
  const title = singleBlock.match(/<div\s+class="box-ttl"[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || '';
  const memberName =
    singleBlock.match(/<p\s+class="name"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] ||
    singleBlock.match(/<p\s+class="name"[^>]*>([\s\S]*?)<\/p>/i)?.[1] ||
    '';
  const bottomDate = singleBlock.match(/<div\s+class="box-bottom"[\s\S]*?<li>\s*([\s\S]*?)\s*<\/li>/i)?.[1] || '';

  return {
    articleBlock: `<div class="blog-content-body">${body}</div>`,
    title: cleanText(title) || item.title || `blog-${item.id}`,
    memberName: cleanText(memberName) || item.memberName || '',
    date: cleanText(bottomDate) || item.date || '',
  };
}

function extractNogiPrintData(item, officialHtml) {
  const body = extractDivByClass(officialHtml, 'bd--edit');
  if (!body) {
    throw new Error('ブログ本文を見つけられませんでした。');
  }

  return {
    articleBlock: `<div class="blog-content-body">${body}</div>`,
    title: cleanText(extractAnyClass(officialHtml, 'bd--hd__ttl')) || item.title || `blog-${item.id}`,
    memberName: cleanText(extractAnyClass(officialHtml, 'bd--prof__name')) || item.memberName || '',
    date: cleanText(extractAnyClass(officialHtml, 'bd--hd__date')) || item.date || '',
  };
}

function buildPrintHtml(provider, item, officialHtml) {
  const printData = provider.extractPrintData(item, officialHtml);
  const title = printData.title || item.title || `blog-${item.id}`;
  const memberName = printData.memberName || item.memberName || '';
  const date = printData.date || item.date || '';
  const articleBlock = printData.articleBlock;
  const sourceUrl = providerAbsoluteUrl(provider, provider.detailPath(item.id));

  return `<!doctype html>
    <html lang="ja">
      <head>
        <meta charset="utf-8">
        <base href="${provider.baseUrl}/">
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
            font-family: "Noto Sans CJK JP", "Noto Sans JP", "MS Gothic", "ＭＳ ゴシック", "Yu Gothic", "Hiragino Sans", sans-serif;
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
          .blog-content {
            word-break: break-word;
          }
          .blog-content p {
            margin: 0;
          }
          .c-blog-article__text {
            word-break: break-word;
          }
          .c-blog-article__text p {
            margin: 0;
          }
          .blog-content img,
          .c-blog-article__text img {
            display: block;
            width: auto !important;
            max-width: 25% !important;
            height: auto !important;
            margin: 8px auto;
            break-inside: avoid;
            border-radius: 2px;
          }
          .blog-content a,
          .c-blog-article__text a {
            color: #1d5f94;
            text-decoration: underline;
            overflow-wrap: anywhere;
          }
          .blog-content iframe,
          .blog-content video,
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
          <p class="print-kicker">${escapeForHtml(provider.label)} 公式ブログ</p>
          <h1 class="print-title">${escapeForHtml(title)}</h1>
          <div class="print-meta">
            <span>${escapeForHtml(date)}</span>
            <span>${escapeForHtml(memberName)}</span>
          </div>
          <div class="blog-content group-${escapeForHtml(provider.id)}">${articleBlock}</div>
          <div class="print-source">${escapeForHtml(sourceUrl)}</div>
        </main>
      </body>
    </html>`;
}

async function renderBlogPdf(item) {
  const provider = getProvider(item.group);
  const startedAt = Date.now();
  console.log(`PDF生成開始: ${provider.id}/${item.id}`);
  const officialHtml = await fetchOfficial(provider, provider.detailPath(item.id));
  const printHtml = await optimizePrintImages(buildPrintHtml(provider, item, officialHtml), provider);
  const browser = await launchPdfBrowser();

  try {
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

      return await withTimeout(
        page.pdf({
          format: 'A4',
          printBackground: true,
          margin: {
            top: '10mm',
            right: '10mm',
            bottom: '12mm',
            left: '10mm',
          },
        }),
        PDF_RENDER_TIMEOUT,
        'PDF生成がタイムアウトしました。',
      );
    } finally {
      await page.close().catch(() => {});
    }
  } finally {
    activeBrowsers.delete(browser);
    await browser.close().catch(() => {});
    console.log(`PDF生成終了: ${provider.id}/${item.id} ${Date.now() - startedAt}ms`);
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
    .replace(/\//g, '-')
    .replace(/\s+/g, '_')
    .replace(/:/g, '-');
  const provider = getProvider(item.group);
  const base = [provider.label, date, item.memberName, item.title, item.id].filter(Boolean).join('_');
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

function createZipEntry(entry, offset, dosTime, dosDate) {
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

  return {
    data,
    localHeader,
    centralHeader,
    nextOffset: offset + localHeader.length + data.length,
  };
}

async function writeChunk(res, chunk) {
  if (res.destroyed || res.writableEnded) {
    throw new Error('ダウンロード接続が終了しました。');
  }

  if (res.write(chunk)) {
    return;
  }

  await Promise.race([
    once(res, 'drain'),
    once(res, 'close').then(() => {
      throw new Error('ダウンロード接続が終了しました。');
    }),
  ]);
}

async function streamPdfZip(res, normalized, names) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '_');
  const filename = `sakamichi_blog_${stamp}.zip`;
  const { dosTime, dosDate } = dosDateTime();
  const centralParts = [];
  let offset = 0;

  for (let index = 0; index < normalized.length; index += 1) {
    if (res.destroyed) {
      throw new Error('ダウンロード接続が終了しました。');
    }

    const pdf = await renderBlogPdf(normalized[index]);
    if (res.destroyed || res.writableEnded) {
      throw new Error('ダウンロード接続が終了しました。');
    }

    if (!res.headersSent) {
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': contentDisposition(filename, 'sakamichi-blogs.zip'),
        'Cache-Control': 'no-store',
      });
    }

    const entry = createZipEntry({ name: names[index], data: pdf }, offset, dosTime, dosDate);
    await writeChunk(res, entry.localHeader);
    await writeChunk(res, entry.data);
    centralParts.push(entry.centralHeader);
    offset = entry.nextOffset;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(normalized.length),
    u16(normalized.length),
    u32(centralDirectory.length),
    u32(offset),
    u16(0),
  ]);

  await writeChunk(res, centralDirectory);
  res.end(end);
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
  if (req.method === 'GET' && url.pathname === '/api/groups') {
    sendJson(res, 200, { groups: providerList() });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/members') {
    const group = getProvider(url.searchParams.get('group') || 'hinata').id;
    const members = await getMembers(group);
    sendJson(res, 200, { group, members });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/blogs') {
    const group = getProvider(url.searchParams.get('group') || 'hinata').id;
    const memberIds = (url.searchParams.get('members') || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (memberIds.length === 0 || memberIds.some((id) => !validMemberId(id))) {
      sendError(res, 400, 'メンバーを選択してください。');
      return;
    }

    const blogs = await getBlogs(group, memberIds);
    sendJson(res, 200, {
      group,
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
      group: getProvider(item.group || body.group || 'hinata').id,
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
    try {
      await runPdfJob(async () => {
        if (normalized.length === 1) {
          const pdf = await renderBlogPdf(normalized[0]);
          res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Length': pdf.length,
            'Content-Disposition': contentDisposition(names[0], 'sakamichi-blog.pdf'),
            'Cache-Control': 'no-store',
          });
          res.end(pdf);
          return;
        }

        await streamPdfZip(res, normalized, names);
      });
    } catch (error) {
      if (res.destroyed) {
        return;
      }
      if (res.headersSent) {
        res.destroy(error);
        return;
      }
      throw error;
    }
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
  console.log(`Sakamichi Blog PDF is running: http://localhost:${PORT}`);
});

async function shutdown() {
  server.close();
  await Promise.all(Array.from(activeBrowsers, (browser) => browser.close().catch(() => {})));
  activeBrowsers.clear();
}

process.on('SIGINT', async () => {
  await shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await shutdown();
  process.exit(0);
});
