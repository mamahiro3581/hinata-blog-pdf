const DEFAULT_BLOG_PAGE_SIZE = '10';
const GROUPS = {
  hinata: {
    label: '日向坂46',
    officialUrl: 'https://www.hinatazaka46.com/s/official/?ima=0000',
    buttonColor: '#7cc7e8',
    buttonHoverColor: '#62b6dc',
  },
  sakura: {
    label: '櫻坂46',
    officialUrl: 'https://sakurazaka46.com/s/s46/?ima=0335',
    buttonColor: '#f19db5',
    buttonHoverColor: '#de829e',
  },
  nogi: {
    label: '乃木坂46',
    officialUrl: 'https://sp.nogizaka46.com/',
    buttonColor: '#812990',
    buttonHoverColor: '#6f217d',
  },
};

const state = {
  group: 'hinata',
  members: [],
  selectedMembers: new Set(),
  blogs: [],
  selectedBlogs: new Set(),
  currentBlogPage: 1,
  blogPageSize: DEFAULT_BLOG_PAGE_SIZE,
  busy: false,
};

const els = {
  status: document.querySelector('#status'),
  groupSelect: document.querySelector('#groupSelect'),
  officialLink: document.querySelector('#officialLink'),
  memberCount: document.querySelector('#memberCount'),
  memberSearch: document.querySelector('#memberSearch'),
  memberList: document.querySelector('#memberList'),
  selectAllMembers: document.querySelector('#selectAllMembers'),
  clearMembers: document.querySelector('#clearMembers'),
  loadBlogs: document.querySelector('#loadBlogs'),
  blogSummary: document.querySelector('#blogSummary'),
  blogPageSize: document.querySelector('#blogPageSize'),
  selectAllBlogs: document.querySelector('#selectAllBlogs'),
  clearBlogs: document.querySelector('#clearBlogs'),
  downloadBlogs: document.querySelector('#downloadBlogs'),
  emptyState: document.querySelector('#emptyState'),
  blogListWrap: document.querySelector('.blog-list-wrap'),
  blogList: document.querySelector('#blogList'),
  pagination: document.querySelector('#pagination'),
  prevBlogPage: document.querySelector('#prevBlogPage'),
  paginationPages: document.querySelector('#paginationPages'),
  nextBlogPage: document.querySelector('#nextBlogPage'),
};

function setStatus(message) {
  els.status.textContent = message;
}

function currentGroup() {
  return GROUPS[state.group] || GROUPS.hinata;
}

function updateGroupChrome() {
  const group = currentGroup();
  els.groupSelect.value = state.group;
  els.officialLink.href = group.officialUrl;
  document.documentElement.style.setProperty('--primary-button', group.buttonColor);
  document.documentElement.style.setProperty('--primary-button-hover', group.buttonHoverColor);
}

function setBusy(isBusy) {
  state.busy = isBusy;
  document.body.classList.toggle('is-loading', isBusy);
  updateButtons();
}

function updateButtons() {
  const hasMembers = state.selectedMembers.size > 0;
  const hasBlogs = state.blogs.length > 0;
  const hasSelectedBlogs = state.selectedBlogs.size > 0;

  els.groupSelect.disabled = state.busy;
  els.loadBlogs.disabled = state.busy || !hasMembers;
  els.blogPageSize.disabled = state.busy;
  els.selectAllBlogs.disabled = state.busy || !hasBlogs;
  els.clearBlogs.disabled = state.busy || !hasSelectedBlogs;
  els.downloadBlogs.disabled = state.busy || !hasSelectedBlogs;

  if (els.pagination && !els.pagination.hidden) {
    const totalPages = totalBlogPages();
    els.prevBlogPage.disabled = state.busy || state.currentBlogPage <= 1;
    els.nextBlogPage.disabled = state.busy || state.currentBlogPage >= totalPages;
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function apiJson(path, options = {}) {
  const response = await fetch(path, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(data.error || '通信に失敗しました。');
  }

  return data;
}

function visibleMembers() {
  const query = els.memberSearch.value.trim().toLowerCase();
  if (!query) {
    return state.members;
  }

  return state.members.filter((member) => member.name.toLowerCase().includes(query));
}

function totalBlogPages() {
  return Math.max(1, Math.ceil(state.blogs.length / currentBlogPageSize()));
}

function clampBlogPage(page) {
  return Math.min(Math.max(page, 1), totalBlogPages());
}

function pageWindow(totalPages) {
  return Array.from({ length: totalPages }, (_, index) => index + 1);
}

function currentBlogPageSize() {
  const parsed = Number.parseInt(state.blogPageSize, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number.parseInt(DEFAULT_BLOG_PAGE_SIZE, 10);
}

function currentPageBlogs() {
  const pageSize = currentBlogPageSize();
  const startIndex = (state.currentBlogPage - 1) * pageSize;
  return state.blogs.slice(startIndex, startIndex + pageSize);
}

function renderMembers() {
  const members = visibleMembers();
  els.memberCount.textContent = `${state.selectedMembers.size}/${state.members.length}`;

  if (members.length === 0) {
    els.memberList.innerHTML = '<div class="empty-state">該当なし</div>';
    updateButtons();
    return;
  }

  els.memberList.innerHTML = members
    .map((member) => {
      const checked = state.selectedMembers.has(member.id) ? 'checked' : '';
      return `
        <label class="member-item">
          <input type="checkbox" data-member-id="${escapeHtml(member.id)}" ${checked} />
          <span>
            <span class="member-name">${escapeHtml(member.name)}</span>
            <span class="member-updated">${escapeHtml(member.updated || '')}</span>
          </span>
        </label>
      `;
    })
    .join('');

  updateButtons();
}

function renderBlogs() {
  state.currentBlogPage = clampBlogPage(state.currentBlogPage);
  const totalPages = totalBlogPages();
  const pageSize = currentBlogPageSize();
  const startIndex = (state.currentBlogPage - 1) * pageSize;
  const pageBlogs = currentPageBlogs();
  const displayStart = pageBlogs.length ? startIndex + 1 : 0;
  const displayEnd = startIndex + pageBlogs.length;

  els.blogSummary.textContent =
    state.blogs.length > pageSize
      ? `${state.blogs.length}件 / 選択 ${state.selectedBlogs.size}件 / ${displayStart}-${displayEnd}件表示`
      : `${state.blogs.length}件 / 選択 ${state.selectedBlogs.size}件`;
  els.emptyState.hidden = state.blogs.length > 0;

  if (state.blogs.length === 0) {
    els.blogList.innerHTML = '';
    renderPagination();
    updateButtons();
    return;
  }

  els.blogList.innerHTML = pageBlogs
    .map((blog) => {
      const checked = state.selectedBlogs.has(blog.id) ? 'checked' : '';
      const thumb = blog.image
        ? `<img src="${escapeHtml(blog.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
        : `<span class="thumb-fallback">${escapeHtml((blog.memberName || currentGroup().label).slice(0, 1))}</span>`;

      return `
        <article class="blog-item">
          <input class="blog-check" type="checkbox" data-blog-id="${escapeHtml(blog.id)}" ${checked} aria-label="${escapeHtml(blog.title)}" />
          <div class="thumb">${thumb}</div>
          <div class="blog-main">
            <p class="blog-title" title="${escapeHtml(blog.title)}">${escapeHtml(blog.title)}</p>
            <div class="blog-meta">
              <span>${escapeHtml(blog.date || '')}</span>
              <span>${escapeHtml(blog.memberName || '')}</span>
              <span>${escapeHtml(`一覧${blog.page}ページ`)}</span>
            </div>
          </div>
          <a class="blog-link" href="${escapeHtml(blog.url)}" target="_blank" rel="noreferrer">表示</a>
        </article>
      `;
    })
    .join('');

  renderPagination(totalPages);
  updateButtons();
}

function renderPagination(totalPages = totalBlogPages()) {
  const hasPagination = state.blogs.length > currentBlogPageSize();
  els.pagination.hidden = !hasPagination;

  if (!hasPagination) {
    els.paginationPages.innerHTML = '';
    return;
  }

  els.paginationPages.innerHTML = pageWindow(totalPages)
    .map((page) => {
      const current = page === state.currentBlogPage;
      return `
        <button
          class="secondary page-number ${current ? 'is-current' : ''}"
          type="button"
          data-blog-page="${page}"
          ${current ? 'aria-current="page"' : ''}
        >${page}</button>
      `;
    })
    .join('');

  els.prevBlogPage.disabled = state.busy || state.currentBlogPage <= 1;
  els.nextBlogPage.disabled = state.busy || state.currentBlogPage >= totalPages;
}

function setBlogPage(page, shouldScroll = true) {
  const nextPage = clampBlogPage(page);
  if (nextPage === state.currentBlogPage) {
    return;
  }

  state.currentBlogPage = nextPage;
  renderBlogs();

  if (shouldScroll) {
    els.blogListWrap.scrollTop = 0;
    els.blogList.scrollIntoView({ block: 'start' });
  }
}

async function loadMembers() {
  setBusy(true);
  setStatus(`${currentGroup().label} 取得中`);
  try {
    const query = new URLSearchParams({ group: state.group });
    const data = await apiJson(`/api/members?${query.toString()}`);
    state.members = data.members || [];
    state.selectedMembers.clear();

    if (state.members[0]) {
      state.selectedMembers.add(state.members[0].id);
    }

    renderMembers();
    setStatus('準備完了');
  } catch (error) {
    setStatus('取得失敗');
    els.memberList.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  } finally {
    setBusy(false);
  }
}

async function loadBlogs() {
  const memberIds = Array.from(state.selectedMembers);
  if (memberIds.length === 0) {
    return;
  }

  setBusy(true);
  setStatus(`${currentGroup().label} 全ブログ取得中`);
  state.blogs = [];
  state.selectedBlogs.clear();
  state.currentBlogPage = 1;
  renderBlogs();

  try {
    const query = new URLSearchParams({
      group: state.group,
      members: memberIds.join(','),
    });
    const data = await apiJson(`/api/blogs?${query.toString()}`);
    state.blogs = data.blogs || [];
    state.selectedBlogs.clear();
    state.currentBlogPage = 1;
    renderBlogs();
    setStatus(`${state.blogs.length}件取得`);
  } catch (error) {
    setStatus('取得失敗');
    els.emptyState.hidden = false;
    els.emptyState.textContent = error.message;
  } finally {
    setBusy(false);
  }
}

function selectedBlogItems() {
  return state.blogs.filter((blog) => state.selectedBlogs.has(blog.id));
}

function filenameFromDisposition(header) {
  if (!header) {
    return '';
  }

  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8) {
    return decodeURIComponent(utf8[1]);
  }

  const ascii = header.match(/filename="([^"]+)"/i);
  return ascii ? ascii[1] : '';
}

async function downloadSelectedBlogs() {
  const blogs = selectedBlogItems();
  if (blogs.length === 0) {
    return;
  }

  setBusy(true);
  setStatus('PDF作成中');

  try {
    const response = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group: state.group, blogs }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || '保存に失敗しました。');
    }

    const blob = await response.blob();
    const filename =
      filenameFromDisposition(response.headers.get('Content-Disposition')) ||
      (blogs.length === 1 ? 'sakamichi-blog.pdf' : 'sakamichi-blogs.zip');
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
    setStatus('保存完了');
  } catch (error) {
    setStatus('保存失敗');
    alert(error.message);
  } finally {
    setBusy(false);
  }
}

els.memberList.addEventListener('change', (event) => {
  const checkbox = event.target.closest('input[data-member-id]');
  if (!checkbox) {
    return;
  }

  if (checkbox.checked) {
    state.selectedMembers.add(checkbox.dataset.memberId);
  } else {
    state.selectedMembers.delete(checkbox.dataset.memberId);
  }

  renderMembers();
});

els.blogList.addEventListener('change', (event) => {
  const checkbox = event.target.closest('input[data-blog-id]');
  if (!checkbox) {
    return;
  }

  if (checkbox.checked) {
    state.selectedBlogs.add(checkbox.dataset.blogId);
  } else {
    state.selectedBlogs.delete(checkbox.dataset.blogId);
  }

  renderBlogs();
});

els.memberSearch.addEventListener('input', renderMembers);

els.groupSelect.addEventListener('change', () => {
  state.group = GROUPS[els.groupSelect.value] ? els.groupSelect.value : 'hinata';
  state.members = [];
  state.selectedMembers.clear();
  state.blogs = [];
  state.selectedBlogs.clear();
  state.currentBlogPage = 1;
  els.memberSearch.value = '';
  els.emptyState.textContent = 'メンバーを選んでブログを取得してください';
  updateGroupChrome();
  renderMembers();
  renderBlogs();
  loadMembers();
});

els.selectAllMembers.addEventListener('click', () => {
  for (const member of visibleMembers()) {
    state.selectedMembers.add(member.id);
  }
  renderMembers();
});

els.clearMembers.addEventListener('click', () => {
  state.selectedMembers.clear();
  renderMembers();
});

els.loadBlogs.addEventListener('click', loadBlogs);

els.selectAllBlogs.addEventListener('click', () => {
  for (const blog of currentPageBlogs()) {
    state.selectedBlogs.add(blog.id);
  }
  renderBlogs();
});

els.clearBlogs.addEventListener('click', () => {
  state.selectedBlogs.clear();
  renderBlogs();
});

els.blogPageSize.addEventListener('change', () => {
  state.blogPageSize = els.blogPageSize.value;
  state.currentBlogPage = 1;
  renderBlogs();
  els.blogListWrap.scrollTop = 0;
});

els.prevBlogPage.addEventListener('click', () => {
  setBlogPage(state.currentBlogPage - 1);
});

els.nextBlogPage.addEventListener('click', () => {
  setBlogPage(state.currentBlogPage + 1);
});

els.paginationPages.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-blog-page]');
  if (!button) {
    return;
  }

  setBlogPage(Number.parseInt(button.dataset.blogPage, 10));
});

els.downloadBlogs.addEventListener('click', downloadSelectedBlogs);

updateGroupChrome();
loadMembers();
