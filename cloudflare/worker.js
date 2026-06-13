const HTML_FETCH_CHUNK_PAGES = 40;
const NOGI_MAX_FETCH_PAGES = 45;
const NOGI_FETCH_PAGE_SIZE = 100;
const API_CACHE_VERSION = '2026-06-13-group-audit';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const PROVIDERS = {
  hinata: {
    id: 'hinata',
    label: '日向坂46',
    baseUrl: 'https://www.hinatazaka46.com',
    officialUrl: 'https://www.hinatazaka46.com/s/official/?ima=0000',
    membersPath: '/s/official/diary/member/list?ima=0000',
    imageDomain: 'hinatazaka46.com',
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
    extractPrintData(item, html) {
      return extractHinataPrintData(item, html);
    },
  },
  sakura: {
    id: 'sakura',
    label: '櫻坂46',
    baseUrl: 'https://sakurazaka46.com',
    officialUrl: 'https://sakurazaka46.com/s/s46/?ima=0335',
    membersPath: '/s/s46/diary/blog/list?ima=0000',
    imageDomain: 'sakurazaka46.com',
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
    extractPrintData(item, html) {
      return extractSakuraPrintData(item, html);
    },
  },
  keyaki: {
    id: 'keyaki',
    label: '欅坂46',
    baseUrl: 'https://www.keyakizaka46.com',
    officialUrl: 'https://www.keyakizaka46.com/s/k46o/diary/member?ima=0000',
    membersPath: '/s/k46o/diary/member?ima=0000',
    imageDomain: 'keyakizaka46.com',
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
    extractPrintData(item, html) {
      return extractKeyakiPrintData(item, html);
    },
  },
  nogi: {
    id: 'nogi',
    label: '乃木坂46',
    baseUrl: 'https://www.nogizaka46.com',
    officialUrl: 'https://sp.nogizaka46.com/',
    membersPath: '/s/n46/diary/MEMBER?ima=0000',
    imageDomain: 'nogizaka46.com',
    detailPath(id) {
      return `/s/n46/diary/detail/${id}?ima=0000&cd=MEMBER`;
    },
    parseMembers(html) {
      return parseOptionMembers(this, html, /\/diary\/MEMBER\/list/i);
    },
    extractPrintData(item, html) {
      return extractNogiPrintData(item, html);
    },
  },
};

function corsHeaders(contentType = 'application/json; charset=utf-8') {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
  };
}

function json(body, status = 200, cacheControl = 'no-store') {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(),
      'Cache-Control': cacheControl,
    },
  });
}

function errorResponse(message, status = 500) {
  return json({ error: message }, status);
}

function getProvider(id) {
  return PROVIDERS[id] || PROVIDERS.hinata;
}

function absoluteUrl(provider, value) {
  return new URL(value, provider.baseUrl).toString();
}

function optionalAbsoluteUrl(provider, value) {
  if (!value) {
    return '';
  }
  try {
    const url = new URL(value, provider.baseUrl);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function decodeHtml(value = '') {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number.parseInt(number, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function cleanText(html = '') {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function fetchOfficial(provider, pathOrUrl) {
  const url = new URL(pathOrUrl, provider.baseUrl);
  if (url.origin !== new URL(provider.baseUrl).origin) {
    throw new Error(`${provider.label}公式サイト以外のURLは処理できません。`);
  }

  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.8,en;q=0.6',
      'User-Agent': USER_AGENT,
    },
  });
  if (!response.ok) {
    throw new Error(`${provider.label}公式サイトの取得に失敗しました: ${response.status}`);
  }
  return response.text();
}

function parseOptionMembers(provider, html, pathPattern) {
  const members = [];
  const pattern = /<option\s+value="([^"]*ct=([^"&]+)[^"]*)"[^>]*>([\s\S]*?)<\/option>/g;
  for (const match of html.matchAll(pattern)) {
    if (!pathPattern.test(match[1])) {
      continue;
    }
    pathPattern.lastIndex = 0;
    const label = cleanText(match[3]).split('|')[0].trim();
    const updated = label.match(/\(([^)]+更新)\)$/)?.[1] || '';
    const name = label.replace(/\([^)]*更新\)$/, '').trim();
    const id = decodeURIComponent(match[2]);
    if (id && name) {
      members.push({ id, name, updated, url: absoluteUrl(provider, match[1]) });
    }
  }
  return members;
}

function formatKeyakiMemberUpdated(value = '') {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}.${match[2]}.${match[3]}更新` : '';
}

function parseKeyakiMembers(provider, html) {
  const updates = new Map();
  for (const match of html.matchAll(/member:\s*"([^"]+)"\s*,\s*update:\s*"([^"]+)"/g)) {
    updates.set(match[1], formatKeyakiMemberUpdated(match[2]));
  }

  const members = [];
  const seen = new Set();
  const pattern =
    /<li\b[^>]*data-member="([^"]+)"[\s\S]*?<a href="([^"]*\/s\/k46o\/diary\/member\/list[^"]*ct=([^"&]+)[^"]*)"[\s\S]*?<p\s+class="name"[^>]*>([\s\S]*?)<\/p>/g;

  for (const match of html.matchAll(pattern)) {
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
      url: absoluteUrl(provider, match[2]),
    });
  }
  return members;
}

function extractClass(block, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return block.match(new RegExp(`<div\\s+class="${escaped}"[^>]*>([\\s\\S]*?)<\\/div>`, 'i'))?.[1] || '';
}

function extractAnyClass(block, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (
    block.match(
      new RegExp(`<([a-z0-9]+)\\b[^>]*class="[^"]*\\b${escaped}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/\\1>`, 'i'),
    )?.[2] || ''
  );
}

function extractDivByClass(block, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (
    block.match(
      new RegExp(`<div\\b[^>]*class="[^"]*\\b${escaped}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/div>`, 'i'),
    )?.[1] || ''
  );
}

function extractBalancedDivByClass(html, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const startMatch = new RegExp(`<div\\b[^>]*class="[^"]*\\b${escaped}\\b[^"]*"[^>]*>`, 'i').exec(html);
  if (!startMatch) {
    return '';
  }
  const start = startMatch.index + startMatch[0].length;
  const tags = /<\/?div\b[^>]*>/gi;
  tags.lastIndex = start;
  let depth = 1;
  let match;
  while ((match = tags.exec(html))) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (depth === 0) {
      return html.slice(start, match.index);
    }
  }
  return html.slice(start);
}

function parseHinataArticles(provider, html, memberId, pageIndex) {
  const articles = [];
  for (const block of html.split('<div class="p-blog-article">').slice(1)) {
    const detailTag =
      block.match(/<a\b[^>]*class="[^"]*\bc-button-blog-detail\b[^"]*"[^>]*>/i)?.[0] || '';
    const detail = detailTag.match(/href="([^"]*\/s\/official\/diary\/detail\/(\d+)[^"]*)"/i);
    if (!detail) {
      continue;
    }
    const id = detail[2];
    const image = block.match(/<img[^>]+src="([^"]+)"/i)?.[1] || '';
    articles.push({
      id,
      title: cleanText(extractClass(block, 'c-blog-article__title')) || `blog-${id}`,
      date: cleanText(extractClass(block, 'c-blog-article__date')),
      memberId,
      memberName: cleanText(extractClass(block, 'c-blog-article__name')),
      page: pageIndex + 1,
      group: provider.id,
      groupLabel: provider.label,
      url: absoluteUrl(provider, detail[1]),
      image: optionalAbsoluteUrl(provider, image),
    });
  }
  return articles;
}

function parseSakuraArticles(provider, html, memberId, pageIndex) {
  const listMatch = html.match(/<ul\s+class="com-blog-part[^"]*">/i);
  if (!listMatch) {
    return [];
  }
  const start = listMatch.index;
  const end = html.indexOf('</ul>', start);
  const list = html.slice(start, end > start ? end : html.length);
  const articles = [];
  const pattern = /<li class="box"><a href="([^"]*\/s\/s46\/diary\/detail\/(\d+)[^"]*)"[\s\S]*?(?=<\/a><\/li>)/g;
  for (const match of list.matchAll(pattern)) {
    const block = match[0];
    const id = match[2];
    const rawImage = block.match(/background-image:\s*url\(([^)]+)\)/i)?.[1]?.replace(/^['"]|['"]$/g, '') || '';
    articles.push({
      id,
      title: cleanText(block.match(/<h3\s+class="title"[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || '') || `blog-${id}`,
      date: cleanText(block.match(/<p\s+class="date[^"]*"[^>]*>([\s\S]*?)<\/p>/i)?.[1] || ''),
      memberId,
      memberName: cleanText(block.match(/<p\s+class="name"[^>]*>([\s\S]*?)<\/p>/i)?.[1] || ''),
      page: pageIndex + 1,
      group: provider.id,
      groupLabel: provider.label,
      url: absoluteUrl(provider, match[1]),
      image: optionalAbsoluteUrl(provider, rawImage),
    });
  }
  return articles;
}

function keyakiDate(block) {
  const match = block.match(
    /<div\s+class="box-date"[\s\S]*?<time[^>]*>([\s\S]*?)<\/time>\s*<time[^>]*>([\s\S]*?)<\/time>/i,
  );
  if (!match) {
    return '';
  }
  const month = cleanText(match[1]);
  const day = cleanText(match[2]);
  return month && day ? `${month}.${day}` : `${month}${day}`;
}

function parseKeyakiArticles(provider, html, memberId, pageIndex) {
  const start = html.indexOf('<div class="keyaki-blog_list">');
  if (start === -1) {
    return [];
  }
  const pager = html.indexOf('<div class="pager"', start);
  const list = html.slice(start, pager > start ? pager : html.length);
  const articles = [];
  for (const article of list.matchAll(/<article\b[\s\S]*?<\/article>/gi)) {
    const block = article[0];
    const title = block.match(
      /<div\s+class="box-ttl"[\s\S]*?<a href="([^"]*\/s\/k46o\/diary\/detail\/(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/i,
    );
    if (!title) {
      continue;
    }
    const image = Array.from(block.matchAll(/<img[^>]+src="([^"]*)"/gi)).find((item) => item[1])?.[1] || '';
    articles.push({
      id: title[2],
      title: cleanText(title[3]) || `blog-${title[2]}`,
      date: keyakiDate(block),
      memberId,
      memberName: cleanText(block.match(/<p\s+class="name"[^>]*>([\s\S]*?)<\/p>/i)?.[1] || ''),
      page: pageIndex + 1,
      group: provider.id,
      groupLabel: provider.label,
      url: absoluteUrl(provider, title[1]),
      image: optionalAbsoluteUrl(provider, image),
    });
  }
  return articles;
}

function parseJsonp(raw) {
  return JSON.parse(raw.trim().replace(/^res\(/, '').replace(/\);?$/, ''));
}

function formatNogiDate(value = '') {
  const match = String(value).match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);
  return match ? `${match[1]}.${match[2]}.${match[3]} ${match[4]}:${match[5]}` : value;
}

function parseNogiArticles(provider, data, memberId, pageIndex) {
  return (data || []).map((item) => {
    const id = String(item.code || '');
    return {
      id,
      title: item.title || `blog-${id}`,
      date: formatNogiDate(item.date || ''),
      memberId,
      memberName: item.name || '',
      page: pageIndex + 1,
      group: provider.id,
      groupLabel: provider.label,
      url: optionalAbsoluteUrl(provider, item.link) || absoluteUrl(provider, provider.detailPath(id)),
      image: optionalAbsoluteUrl(provider, item.img),
    };
  });
}

async function getMembers(provider) {
  return provider.parseMembers(await fetchOfficial(provider, provider.membersPath));
}

async function getHtmlBlogs(provider, memberId, startPage = 0) {
  const articles = [];
  const seen = new Set();
  let complete = false;
  const endPage = startPage + HTML_FETCH_CHUNK_PAGES;
  for (let pageIndex = startPage; pageIndex < endPage; pageIndex += 1) {
    const html = await fetchOfficial(provider, provider.memberListPath(memberId, pageIndex));
    const page = provider.parseArticles(html, memberId, pageIndex);
    if (page.length === 0) {
      complete = true;
      break;
    }
    let added = 0;
    for (const article of page) {
      if (!seen.has(article.id)) {
        seen.add(article.id);
        articles.push(article);
        added += 1;
      }
    }
    if (added === 0) {
      complete = true;
      break;
    }
  }
  return {
    blogs: articles,
    nextPage: complete ? null : endPage,
  };
}

async function getNogiBlogs(provider, memberId) {
  const articles = [];
  const seen = new Set();
  for (
    let offset = 0;
    offset < NOGI_MAX_FETCH_PAGES * NOGI_FETCH_PAGE_SIZE;
    offset += NOGI_FETCH_PAGE_SIZE
  ) {
    const url = new URL('/s/n46/api/list/blog', provider.baseUrl);
    url.searchParams.set('rw', String(NOGI_FETCH_PAGE_SIZE));
    url.searchParams.set('st', String(offset));
    url.searchParams.set('ct', memberId);
    const payload = parseJsonp(await fetchOfficial(provider, `${url.pathname}${url.search}`));
    const page = parseNogiArticles(provider, Array.isArray(payload.data) ? payload.data : [], memberId, offset / 100);
    if (page.length === 0) {
      break;
    }
    let added = 0;
    for (const article of page) {
      if (!seen.has(article.id)) {
        seen.add(article.id);
        articles.push(article);
        added += 1;
      }
    }
    const total = Number.parseInt(payload.count, 10);
    if (added === 0 || (Number.isFinite(total) && offset + page.length >= total)) {
      break;
    }
  }
  return { blogs: articles, nextPage: null };
}

async function getBlogs(provider, memberId, startPage = 0) {
  const result =
    provider.id === 'nogi'
      ? await getNogiBlogs(provider, memberId)
      : await getHtmlBlogs(provider, memberId, startPage);
  result.blogs.sort((a, b) => b.id.localeCompare(a.id, 'en', { numeric: true }));
  return result;
}

function extractHinataArticleBlock(html) {
  const start = html.indexOf('<div class="p-blog-article">');
  if (start === -1) {
    throw new Error('ブログ本文を見つけられませんでした。');
  }
  const ends = [
    html.indexOf('<div class="p-pager"', start),
    html.indexOf('<div class="l-other-contents--blog"', start),
    html.indexOf('<div class="p-blog-entry__group"', start),
    html.indexOf('<footer', start),
  ].filter((index) => index > start);
  return html.slice(start, ends.length ? Math.min(...ends) : html.length);
}

function extractHinataPrintData(item, html) {
  const article = extractHinataArticleBlock(html);
  return {
    article,
    title: cleanText(extractClass(article, 'c-blog-article__title')) || item.title || `blog-${item.id}`,
    memberName: cleanText(extractClass(article, 'c-blog-article__name')) || item.memberName || '',
    date: cleanText(extractClass(article, 'c-blog-article__date')) || item.date || '',
  };
}

function extractSakuraPrintData(item, html) {
  const body = extractDivByClass(html, 'box-article');
  if (!body) {
    throw new Error('ブログ本文を見つけられませんでした。');
  }
  const foot = html.match(
    /<div\s+class="blog-foot"[\s\S]*?<p\s+class="name">([\s\S]*?)<\/p>\s*<p\s+class="date[^"]*">([\s\S]*?)<\/p>/i,
  );
  return {
    article: `<div class="blog-content-body">${body}</div>`,
    title: cleanText(html.match(/<h1\s+class="title"[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '') || item.title,
    memberName: cleanText(foot?.[1] || '') || item.memberName || '',
    date: cleanText(foot?.[2] || '') || item.date || '',
  };
}

function extractKeyakiPrintData(item, html) {
  const body = extractBalancedDivByClass(html, 'box-article');
  if (!body) {
    throw new Error('ブログ本文を見つけられませんでした。');
  }
  const single = extractBalancedDivByClass(html, 'keyaki-blog_single') || html;
  return {
    article: `<div class="blog-content-body">${body}</div>`,
    title:
      cleanText(single.match(/<div\s+class="box-ttl"[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || '') ||
      item.title,
    memberName:
      cleanText(
        single.match(/<p\s+class="name"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] ||
          single.match(/<p\s+class="name"[^>]*>([\s\S]*?)<\/p>/i)?.[1] ||
          '',
      ) || item.memberName,
    date:
      cleanText(single.match(/<div\s+class="box-bottom"[\s\S]*?<li>\s*([\s\S]*?)\s*<\/li>/i)?.[1] || '') ||
      item.date,
  };
}

function extractNogiPrintData(item, html) {
  const body = extractDivByClass(html, 'bd--edit');
  if (!body) {
    throw new Error('ブログ本文を見つけられませんでした。');
  }
  return {
    article: `<div class="blog-content-body">${body}</div>`,
    title: cleanText(extractAnyClass(html, 'bd--hd__ttl')) || item.title,
    memberName: cleanText(extractAnyClass(html, 'bd--prof__name')) || item.memberName,
    date: cleanText(extractAnyClass(html, 'bd--hd__date')) || item.date,
  };
}

function sanitizeArticle(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\ssrcset\s*=\s*"[^"]*"/gi, '')
    .replace(/\ssrcset\s*=\s*'[^']*'/gi, '');
}

function imageAllowed(provider, url) {
  return url.protocol === 'https:' && (url.hostname === provider.imageDomain || url.hostname.endsWith(`.${provider.imageDomain}`));
}

function rewriteImages(html, provider, requestUrl) {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const source =
      tag.match(/\bsrc\s*=\s*(["'])(.*?)\1/i)?.[2] ||
      tag.match(/\bdata-src\s*=\s*(["'])(.*?)\1/i)?.[2] ||
      '';
    if (!source) {
      return tag;
    }

    let imageUrl;
    try {
      imageUrl = new URL(decodeHtml(source), provider.baseUrl);
    } catch {
      return tag;
    }
    if (!imageAllowed(provider, imageUrl)) {
      return tag.replace(/\bsrc\s*=\s*(["']).*?\1/i, 'src=""');
    }

    const proxy = new URL('/api/image', requestUrl);
    proxy.searchParams.set('group', provider.id);
    proxy.searchParams.set('url', imageUrl.toString());
    let rewritten = tag
      .replace(/\sdata-src\s*=\s*(["']).*?\1/gi, '')
      .replace(/\sloading\s*=\s*(["']).*?\1/gi, '')
      .replace(/\bcrossorigin\s*=\s*(["']).*?\1/gi, '');
    if (/\bsrc\s*=/i.test(rewritten)) {
      rewritten = rewritten.replace(/\bsrc\s*=\s*(["']).*?\1/i, `src="${escapeHtml(proxy.toString())}"`);
    } else {
      rewritten = rewritten.replace(/>$/, ` src="${escapeHtml(proxy.toString())}">`);
    }
    return rewritten.replace(/>$/, ' crossorigin="anonymous">');
  });
}

async function articlePayload(provider, item, requestUrl) {
  const html = await fetchOfficial(provider, provider.detailPath(item.id));
  const printData = provider.extractPrintData(item, html);
  return {
    id: item.id,
    group: provider.id,
    groupLabel: provider.label,
    title: printData.title || item.title || `blog-${item.id}`,
    memberName: printData.memberName || item.memberName || '',
    date: printData.date || item.date || '',
    sourceUrl: absoluteUrl(provider, provider.detailPath(item.id)),
    article: rewriteImages(sanitizeArticle(printData.article), provider, requestUrl),
  };
}

async function cachedJson(request, ctx, ttl, producer) {
  const cache = caches.default;
  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.set('__version', API_CACHE_VERSION);
  const cacheKey = new Request(cacheUrl.toString(), request);
  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }
  const body = await producer();
  const response = json(body, 200, `public, max-age=${ttl}`);
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

async function handleImage(request, ctx, url) {
  const provider = getProvider(url.searchParams.get('group') || '');
  const value = url.searchParams.get('url') || '';
  let imageUrl;
  try {
    imageUrl = new URL(value);
  } catch {
    return errorResponse('画像URLが正しくありません。', 400);
  }
  if (!imageAllowed(provider, imageUrl)) {
    return errorResponse('許可されていない画像URLです。', 403);
  }

  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  const upstream = await fetch(imageUrl, {
    headers: {
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      Referer: provider.officialUrl,
      'User-Agent': USER_AGENT,
    },
  });
  if (!upstream.ok) {
    return errorResponse(`画像の取得に失敗しました: ${upstream.status}`, 502);
  }

  const headers = {
    ...corsHeaders(upstream.headers.get('content-type') || 'image/jpeg'),
    'Cache-Control': 'public, max-age=604800, immutable',
  };
  const response = new Response(upstream.body, { status: 200, headers });
  ctx.waitUntil(cache.put(request, response.clone()));
  return response;
}

async function handleApi(request, ctx) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (request.method !== 'GET') {
    return errorResponse('GETリクエストのみ利用できます。', 405);
  }
  if (url.pathname === '/api/groups') {
    return json({
      groups: Object.values(PROVIDERS).map(({ id, label, officialUrl }) => ({ id, label, officialUrl })),
    });
  }
  if (url.pathname === '/api/image') {
    return handleImage(request, ctx, url);
  }

  const provider = getProvider(url.searchParams.get('group') || 'hinata');
  if (url.pathname === '/api/members') {
    return cachedJson(request, ctx, 3600, async () => ({
      group: provider.id,
      members: await getMembers(provider),
    }));
  }
  if (url.pathname === '/api/blogs') {
    const memberId = String(url.searchParams.get('member') || '');
    const startPage = Number.parseInt(url.searchParams.get('startPage') || '0', 10);
    if (!/^\d{1,8}$/.test(memberId)) {
      return errorResponse('メンバーを選択してください。', 400);
    }
    if (!Number.isInteger(startPage) || startPage < 0 || startPage > 1000) {
      return errorResponse('取得開始ページが正しくありません。', 400);
    }
    return cachedJson(request, ctx, 900, async () => {
      const result = await getBlogs(provider, memberId, startPage);
      return {
        group: provider.id,
        blogs: result.blogs,
        count: result.blogs.length,
        nextPage: result.nextPage,
      };
    });
  }
  if (url.pathname === '/api/article') {
    const id = String(url.searchParams.get('id') || '');
    if (!/^\d{1,10}$/.test(id)) {
      return errorResponse('ブログIDが正しくありません。', 400);
    }
    const item = {
      id,
      title: String(url.searchParams.get('title') || ''),
      date: String(url.searchParams.get('date') || ''),
      memberName: String(url.searchParams.get('memberName') || ''),
    };
    return cachedJson(request, ctx, 86400, async () => articlePayload(provider, item, request.url));
  }
  return errorResponse('APIが見つかりません。', 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/healthz') {
        return json({ ok: true, runtime: 'cloudflare-workers' }, 200, 'no-store');
      }
      if (url.pathname.startsWith('/api/')) {
        return await handleApi(request, ctx);
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : '処理に失敗しました。');
    }
  },
};
