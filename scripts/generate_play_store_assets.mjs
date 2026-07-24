import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const outputDir = path.resolve('android/PlayStore/assets');

const groups = [
  { label: '日向坂46', color: '#7cc7e8' },
  { label: '櫻坂46', color: '#f19db5' },
  { label: '欅坂46', color: '#5eb954' },
  { label: '乃木坂46', color: '#812990' },
];

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function text(x, y, value, size = 36, fill = '#1f2630', weight = 600, anchor = 'start') {
  return `<text x="${x}" y="${y}" font-family="Hiragino Sans, Noto Sans CJK JP, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${escapeXml(value)}</text>`;
}

function roundedRect(x, y, w, h, r, fill, stroke = 'none', sw = 0) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
}

function phoneFrame(inner) {
  return `
    <svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
      <rect width="1080" height="1920" fill="#f6f8fa"/>
      <rect x="0" y="0" width="1080" height="176" fill="#ffffff"/>
      ${text(56, 70, 'OFFICIAL BLOG PDF', 24, '#2878b8', 700)}
      ${text(56, 128, 'Sakamichi Blog PDF', 46, '#20242b', 800)}
      ${roundedRect(824, 58, 200, 58, 8, '#ffffff', '#cfd6df', 2)}
      ${text(924, 97, '日向坂46', 27, '#20242b', 600, 'middle')}
      ${inner}
    </svg>
  `;
}

function screenshotMembers() {
  const rows = ['小坂 菜緒', '金村 美玖', '河田 陽菜', '松田 好花', '佐々木 久美'];
  return phoneFrame(`
    ${roundedRect(56, 222, 968, 330, 8, '#ffffff')}
    ${text(88, 282, 'メンバー', 36, '#20242b', 700)}
    ${roundedRect(88, 316, 872, 72, 8, '#ffffff', '#cbd4df', 2)}
    ${text(118, 363, 'メンバーを選択', 30, '#6d7682', 500)}
    ${roundedRect(88, 420, 872, 84, 8, '#7cc7e8')}
    ${text(524, 474, 'ブログ取得', 30, '#10202a', 700, 'middle')}
    ${roundedRect(56, 600, 968, 1100, 8, '#ffffff')}
    ${text(88, 660, 'メンバー選択', 34, '#20242b', 700)}
    ${roundedRect(88, 692, 872, 70, 8, '#ffffff', '#cbd4df', 2)}
    ${text(118, 737, '検索', 28, '#8b94a1', 500)}
    ${roundedRect(88, 790, 414, 66, 8, '#ffffff', '#cbd4df', 2)}
    ${text(295, 833, '表示中を全選択', 26, '#20242b', 600, 'middle')}
    ${roundedRect(524, 790, 212, 66, 8, '#ffffff', '#cbd4df', 2)}
    ${text(630, 833, '解除', 26, '#20242b', 600, 'middle')}
    ${rows.map((name, index) => {
      const y = 910 + index * 126;
      return `
        <circle cx="120" cy="${y}" r="22" fill="${index < 2 ? '#7cc7e8' : '#ffffff'}" stroke="#7cc7e8" stroke-width="4"/>
        ${index < 2 ? `<path d="M108 ${y} L118 ${y + 10} L135 ${y - 12}" fill="none" stroke="#10202a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
        ${text(166, y + 10, name, 31, '#20242b', 700)}
        <line x1="88" y1="${y + 58}" x2="960" y2="${y + 58}" stroke="#edf0f4" stroke-width="2"/>
      `;
    }).join('')}
    ${roundedRect(88, 1540, 872, 76, 8, '#7cc7e8')}
    ${text(524, 1589, '選択完了', 29, '#10202a', 700, 'middle')}
  `);
}

function screenshotBlogs() {
  const posts = [
    ['夏の予定', '小坂 菜緒 / 2026.07.21'],
    ['青空の下で', '金村 美玖 / 2026.07.20'],
    ['最近のこと', '河田 陽菜 / 2026.07.19'],
    ['お知らせです', '松田 好花 / 2026.07.18'],
  ];
  return phoneFrame(`
    ${roundedRect(56, 222, 968, 282, 8, '#ffffff')}
    ${text(88, 282, 'ブログ', 36, '#20242b', 700)}
    ${text(88, 328, '174件・30件選択', 26, '#68727f', 500)}
    ${[10, 30, 60].map((n, i) => roundedRect(590 + i * 132, 250, 112, 58, 8, n === 30 ? '#7cc7e8' : '#ffffff', n === 30 ? 'none' : '#cbd4df', 2) + text(646 + i * 132, 288, `${n}件`, 24, '#10202a', 700, 'middle')).join('')}
    ${roundedRect(88, 370, 252, 66, 8, '#ffffff', '#cbd4df', 2)}
    ${text(214, 413, '全選択', 26, '#20242b', 600, 'middle')}
    ${roundedRect(360, 370, 200, 66, 8, '#ffffff', '#cbd4df', 2)}
    ${text(460, 413, '解除', 26, '#20242b', 600, 'middle')}
    ${roundedRect(580, 370, 380, 66, 8, '#7cc7e8')}
    ${text(770, 413, '選択PDF保存', 26, '#10202a', 700, 'middle')}
    ${roundedRect(56, 548, 968, 80, 8, '#f6f8fa')}
    ${roundedRect(88, 558, 120, 54, 8, '#ffffff', '#cbd4df', 2)}
    ${text(148, 593, '前へ', 23, '#20242b', 600, 'middle')}
    ${[1, 2, 3, 4, 5].map((n, i) => roundedRect(228 + i * 76, 558, 58, 54, 8, n === 1 ? '#7cc7e8' : '#ffffff', n === 1 ? 'none' : '#cbd4df', 2) + text(257 + i * 76, 593, `${n}`, 23, '#20242b', 700, 'middle')).join('')}
    ${roundedRect(630, 558, 120, 54, 8, '#ffffff', '#cbd4df', 2)}
    ${text(690, 593, '次へ', 23, '#20242b', 600, 'middle')}
    ${posts.map((post, index) => {
      const y = 682 + index * 218;
      return `
        ${roundedRect(56, y, 968, 172, 8, '#ffffff')}
        <circle cx="114" cy="${y + 86}" r="25" fill="${index < 3 ? '#7cc7e8' : '#ffffff'}" stroke="#7cc7e8" stroke-width="4"/>
        ${index < 3 ? `<path d="M101 ${y + 86} L112 ${y + 98} L130 ${y + 73}" fill="none" stroke="#10202a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
        ${text(162, y + 72, post[0], 34, '#20242b', 700)}
        ${text(162, y + 120, post[1], 25, '#68727f', 500)}
      `;
    }).join('')}
  `);
}

function screenshotExport() {
  return phoneFrame(`
    ${roundedRect(56, 222, 968, 270, 8, '#ffffff')}
    ${text(88, 286, '保存完了', 42, '#20242b', 800)}
    ${text(88, 340, '30件のPDFをZIPにまとめました', 30, '#68727f', 500)}
    ${roundedRect(88, 386, 872, 70, 8, '#f3fbfe', '#7cc7e8', 2)}
    ${text(118, 431, 'Sakamichi_Blog_PDF_小坂 菜緒_2026-07-23.zip', 26, '#20242b', 600)}
    ${roundedRect(56, 548, 968, 988, 8, '#ffffff')}
    ${text(88, 612, 'グループ切り替え', 34, '#20242b', 700)}
    ${groups.map((group, index) => {
      const y = 682 + index * 150;
      return `
        ${roundedRect(88, y, 872, 96, 8, group.color)}
        ${text(524, y + 61, group.label, 31, group.label === '乃木坂46' ? '#ffffff' : '#10202a', 800, 'middle')}
      `;
    }).join('')}
    ${text(88, 1370, 'PDFは端末内で生成され、1件ならPDF、複数件ならZIPで保存できます。', 25, '#68727f', 500)}
  `);
}

function iconSvg() {
  return `
    <svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <rect width="512" height="512" rx="96" fill="#f6f8fa"/>
      <rect x="84" y="96" width="344" height="320" rx="28" fill="#7cc7e8"/>
      <rect x="132" y="154" width="248" height="36" rx="8" fill="#ffffff"/>
      <rect x="132" y="228" width="248" height="36" rx="8" fill="#ffffff"/>
      <rect x="132" y="302" width="166" height="36" rx="8" fill="#ffffff"/>
      <rect x="316" y="302" width="80" height="80" rx="12" fill="#812990"/>
      <rect x="340" y="326" width="32" height="32" rx="6" fill="#f19db5"/>
    </svg>
  `;
}

function featureSvg() {
  return `
    <svg width="1024" height="500" viewBox="0 0 1024 500" xmlns="http://www.w3.org/2000/svg">
      <rect width="1024" height="500" fill="#f6f8fa"/>
      <rect x="0" y="0" width="1024" height="500" fill="#ffffff"/>
      <rect x="64" y="82" width="92" height="336" rx="18" fill="#7cc7e8"/>
      <rect x="176" y="82" width="92" height="336" rx="18" fill="#f19db5"/>
      <rect x="288" y="82" width="92" height="336" rx="18" fill="#5eb954"/>
      <rect x="400" y="82" width="92" height="336" rx="18" fill="#812990"/>
      ${text(520, 178, 'Sakamichi Blog PDF', 36, '#20242b', 800)}
      ${text(522, 238, '公式ブログをPDFで保存', 30, '#566170', 600)}
      ${roundedRect(522, 296, 318, 66, 8, '#7cc7e8')}
      ${text(681, 339, 'PDF / ZIP 保存', 27, '#10202a', 800, 'middle')}
    </svg>
  `;
}

async function renderPng(name, svg, width, height) {
  await sharp(Buffer.from(svg))
    .resize(width, height)
    .png()
    .toFile(path.join(outputDir, name));
}

await fs.mkdir(outputDir, { recursive: true });
await renderPng('high-res-icon-512.png', iconSvg(), 512, 512);
await renderPng('feature-graphic-1024x500.png', featureSvg(), 1024, 500);
await renderPng('phone-01-members.png', screenshotMembers(), 1080, 1920);
await renderPng('phone-02-blogs.png', screenshotBlogs(), 1080, 1920);
await renderPng('phone-03-export.png', screenshotExport(), 1080, 1920);
await renderPng('tablet-7-01-members.png', screenshotMembers(), 1200, 1920);
await renderPng('tablet-7-02-blogs.png', screenshotBlogs(), 1200, 1920);
await renderPng('tablet-7-03-export.png', screenshotExport(), 1200, 1920);
await renderPng('tablet-10-01-members.png', screenshotMembers(), 1600, 2560);
await renderPng('tablet-10-02-blogs.png', screenshotBlogs(), 1600, 2560);
await renderPng('tablet-10-03-export.png', screenshotExport(), 1600, 2560);
