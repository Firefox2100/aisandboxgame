// js/ui/cardPlatformUI.js
// 社区世界卡分享平台 UI（在线模式独有）
// 包含：广场 header 按钮（含 lock 态）+ 离线点击登录提示 + 全屏 platform overlay
// 阶段 1：mock 数据驱动，所有写入操作仅 toast 提示
// 阶段 2 替换为 Supabase / Edge functions 调用

(function () {
  'use strict';

  const SQUARE_BTN_ID = 'square-btn';
  const PROMPT_ID = 'square-login-prompt';
  const OVERLAY_ID = 'card-platform-overlay';

  // ────── i18n 文案 ──────
  function isEnglish() {
    return window.i18nService?.getResolvedLanguage?.() === 'en';
  }

  function getCopy() {
    const en = isEnglish();
    return {
      title: en ? 'Community World Cards' : '社区世界卡',
      subtitle: en
        ? 'Browse, download, and share world cards crafted by the community.'
        : '浏览、下载并分享社区创作的世界卡',
      close: en ? 'Close' : '关闭',
      searchPlaceholder: en ? 'Search world cards...' : '搜索世界卡...',
      filterAll: en ? 'All' : '全部',
      uploadBtn: en ? 'Upload My Card' : '上传我的世界卡',
      downloadBtn: en ? 'Download' : '下载到本地',
      downloadSuccess: en ? 'Downloaded (mock)' : '下载成功（mock）',
      uploadSuccess: en ? 'Uploaded (mock)' : '上传成功（mock）',
      cardAuthor: en ? 'by' : '作者',
      cardDownloads: en ? 'downloads' : '下载',
      detailDescription: en ? 'Description' : '简介',
      detailRating: en ? 'Rating' : '评分',
      // login prompt
      promptTitle: en ? 'Community World Cards' : '社区世界卡',
      promptBody: en ? 'Sign in to browse and share community world cards.' : '登录后即可浏览并分享社区世界卡。',
      promptLoginBtn: en ? 'Sign in now' : '现在登录',
      promptCancelBtn: en ? 'Cancel' : '取消',
      // categories
      catFantasy: en ? 'Fantasy' : '奇幻',
      catSciFi: en ? 'Sci-Fi' : '科幻',
      catCultivation: en ? 'Cultivation' : '修仙',
      catCyberpunk: en ? 'Cyberpunk' : '赛博朋克',
      catCartoon: en ? 'Cartoon' : '卡通',
      catHistory: en ? 'History' : '历史',
      // upload wizard
      uploadStep1Title: en ? 'Step 1 / 3 — Pick a card' : '第 1 / 3 步 — 选择世界卡',
      uploadStep1Hint: en ? 'Choose one of your local world cards.' : '从你的本地世界卡中选一张。',
      uploadStep2Title: en ? 'Step 2 / 3 — Describe' : '第 2 / 3 步 — 填写描述',
      uploadStep2Hint: en ? 'Add a short description and tags.' : '为它写一段简介，加几个标签。',
      uploadStep3Title: en ? 'Step 3 / 3 — Review' : '第 3 / 3 步 — 确认提交',
      uploadStep3Hint: en ? 'Review and submit.' : '请确认信息后提交。',
      uploadNext: en ? 'Next' : '下一步',
      uploadBack: en ? 'Back' : '上一步',
      uploadSubmit: en ? 'Submit' : '提交',
      uploadCancel: en ? 'Cancel' : '取消',
      uploadCardPlaceholder: en ? '[Mock] My World Card' : '[Mock] 我的世界卡',
      uploadDescPlaceholder: en ? 'A short description...' : '简介...',
      uploadTagsPlaceholder: en ? 'tags, comma-separated' : '标签，逗号分隔',
    };
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isGuest() {
    return window.accountStore?.isGuest?.() !== false;
  }

  // ────── Mock 卡片数据 ──────
  const MOCK_CARDS = [
    { id: 'c1', title: '坠星之夜', author: '云上观', category: 'fantasy', downloads: 1284, rating: 4.7, cover: null, desc: '在群山之间，一颗陨石坠落引发了世界的连锁反应。你被卷入这场剧变，必须在多个派系之间作出抉择。' },
    { id: 'c2', title: '霓虹回声', author: 'NeonEcho', category: 'cyberpunk', downloads: 892, rating: 4.5, cover: null, desc: '在 2087 年的新香港，一段被加密的回忆将你引向公司高层的秘密。义体、AI 与人性的边界等你来定义。' },
    { id: 'c3', title: '剑出青冥', author: '青冥道人', category: 'cultivation', downloads: 2156, rating: 4.8, cover: null, desc: '少年抱剑入门，宗门内斗、外敌环伺。你将一步步登顶剑道之巅，或是另辟蹊径。' },
    { id: 'c4', title: '地球编年史', author: 'Chronicler', category: 'sci-fi', downloads: 542, rating: 4.3, cover: null, desc: '人类殖民第三个外星系。你是首批观测者之一，必须记录这片新土地的奇观与危机。' },
    { id: 'c5', title: '糖果王国冒险', author: '小甜甜', category: 'cartoon', downloads: 345, rating: 4.6, cover: null, desc: '糖果国王失踪了！作为皇家糖果守卫，你必须穿越棒棒糖森林、巧克力河流，找回王国希望。' },
    { id: 'c6', title: '永乐奇案', author: '夜读人', category: 'history', downloads: 678, rating: 4.4, cover: null, desc: '永乐年间，一桩离奇命案搅动京城。你扮演一位刚入仕的年轻官员，要在权力的旋涡中找出真相。' },
    { id: 'c7', title: '群山的呼唤', author: 'MountainWhisper', category: 'fantasy', downloads: 412, rating: 4.2, cover: null, desc: '古老的山脉中藏着失落的文明遗迹。带上你的伙伴，深入冰雪与遗忘。' },
    { id: 'c8', title: '机械神都', author: '齿轮匠', category: 'sci-fi', downloads: 920, rating: 4.6, cover: null, desc: '一座由蒸汽与齿轮构成的浮空城市，正面临能源枯竭。你是工程师，能否找到新的能量源？' },
    { id: 'c9', title: '九霄录', author: '云海客', category: 'cultivation', downloads: 1450, rating: 4.7, cover: null, desc: '上古修仙界的史诗。你是一个失忆的散修，每一段记忆碎片都将带你接近真相。' },
  ];

  // ────── 状态 ──────
  let activeCategory = 'all';
  let searchQuery = '';
  let uploadStep = 1;
  let uploadDraft = { title: '', desc: '', tags: '' };

  // ────── 广场按钮 lock 态 ──────
  function syncSquareLockState() {
    const btn = document.getElementById(SQUARE_BTN_ID);
    if (!btn) return;
    if (isGuest()) {
      btn.classList.add('is-locked');
    } else {
      btn.classList.remove('is-locked');
    }
  }

  function onSquareClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (isGuest()) {
      openLoginPrompt();
    } else {
      openOverlay();
    }
  }

  // ────── 登录提示模态 ──────
  function openLoginPrompt() {
    const root = document.getElementById(PROMPT_ID);
    if (!root) return;
    const copy = getCopy();
    root.innerHTML = `
      <div class="square-login-prompt-content themed-modal" role="dialog" aria-modal="true">
        <div class="square-login-prompt-icon">
          <span class="material-symbols-outlined">lock</span>
        </div>
        <h3 class="square-login-prompt-title">${escapeHtml(copy.promptTitle)}</h3>
        <p class="square-login-prompt-body">${escapeHtml(copy.promptBody)}</p>
        <div class="square-login-prompt-actions">
          <button class="btn-secondary" data-action="cancel">${escapeHtml(copy.promptCancelBtn)}</button>
          <button class="btn-primary" data-action="login">${escapeHtml(copy.promptLoginBtn)}</button>
        </div>
      </div>
    `;
    root.setAttribute('aria-hidden', 'false');
    root.classList.add('is-open');

    root.querySelector('[data-action="cancel"]').addEventListener('click', closeLoginPrompt);
    root.querySelector('[data-action="login"]').addEventListener('click', () => {
      closeLoginPrompt();
      window.accountCenterUI?.open?.();
    });
    root.addEventListener('click', e => {
      if (e.target === root) closeLoginPrompt();
    });
  }

  function closeLoginPrompt() {
    const root = document.getElementById(PROMPT_ID);
    if (!root) return;
    root.classList.remove('is-open');
    root.setAttribute('aria-hidden', 'true');
  }

  // ────── 平台 overlay ──────
  function getCategories() {
    const copy = getCopy();
    return [
      { id: 'all', label: copy.filterAll },
      { id: 'fantasy', label: copy.catFantasy },
      { id: 'sci-fi', label: copy.catSciFi },
      { id: 'cultivation', label: copy.catCultivation },
      { id: 'cyberpunk', label: copy.catCyberpunk },
      { id: 'cartoon', label: copy.catCartoon },
      { id: 'history', label: copy.catHistory },
    ];
  }

  function getFilteredCards() {
    const q = searchQuery.trim().toLowerCase();
    return MOCK_CARDS.filter(c => {
      if (activeCategory !== 'all' && c.category !== activeCategory) return false;
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        c.author.toLowerCase().includes(q) ||
        (c.desc || '').toLowerCase().includes(q)
      );
    });
  }

  function renderCardCell(card) {
    const copy = getCopy();
    return `
      <button class="card-platform-cell themed-card" data-card-id="${escapeHtml(card.id)}" type="button">
        <div class="card-platform-cell-cover" data-category="${escapeHtml(card.category)}">
          <span class="material-symbols-outlined">auto_stories</span>
        </div>
        <div class="card-platform-cell-body">
          <div class="card-platform-cell-title">${escapeHtml(card.title)}</div>
          <div class="card-platform-cell-meta">
            <span class="card-platform-cell-author">${escapeHtml(copy.cardAuthor)} ${escapeHtml(card.author)}</span>
            <span class="card-platform-cell-stats">
              <span class="material-symbols-outlined">download</span>
              ${escapeHtml(String(card.downloads))}
            </span>
          </div>
        </div>
      </button>`;
  }

  function renderOverlay() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    const copy = getCopy();
    const cats = getCategories();
    const cards = getFilteredCards();

    overlay.innerHTML = `
      <div class="card-platform-shell">
        <header class="card-platform-header">
          <div class="card-platform-header-titles">
            <h2 class="card-platform-title">${escapeHtml(copy.title)}</h2>
            <p class="card-platform-subtitle">${escapeHtml(copy.subtitle)}</p>
          </div>
          <div class="card-platform-header-actions">
            <button class="btn-primary" data-action="open-upload">
              <span class="material-symbols-outlined">add</span>
              ${escapeHtml(copy.uploadBtn)}
            </button>
            <button class="btn-secondary btn-icon" data-action="close" aria-label="${escapeHtml(copy.close)}">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
        </header>
        <div class="card-platform-toolbar">
          <div class="card-platform-search">
            <span class="material-symbols-outlined">search</span>
            <input
              type="text"
              class="card-platform-search-input"
              placeholder="${escapeHtml(copy.searchPlaceholder)}"
              value="${escapeHtml(searchQuery)}"
            />
          </div>
          <div class="card-platform-filters">
            ${cats.map(c => `
              <button class="card-platform-chip ${activeCategory === c.id ? 'is-active' : ''}" data-cat="${escapeHtml(c.id)}">
                ${escapeHtml(c.label)}
              </button>
            `).join('')}
          </div>
        </div>
        <div class="card-platform-grid">
          ${cards.map(renderCardCell).join('')}
        </div>
        <div id="card-platform-detail-anchor"></div>
        <div id="card-platform-upload-anchor"></div>
      </div>
    `;

    bindOverlayEvents();
  }

  function bindOverlayEvents() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    overlay.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', e => {
        const action = btn.getAttribute('data-action');
        if (action === 'close') closeOverlay();
        if (action === 'open-upload') openUploadWizard();
      });
    });

    overlay.querySelectorAll('[data-cat]').forEach(chip => {
      chip.addEventListener('click', () => {
        activeCategory = chip.getAttribute('data-cat');
        renderOverlay();
      });
    });

    const searchInput = overlay.querySelector('.card-platform-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', e => {
        searchQuery = e.target.value;
        // 防抖：仅重渲染 grid，不改 toolbar/header
        const grid = overlay.querySelector('.card-platform-grid');
        if (grid) {
          grid.innerHTML = getFilteredCards().map(renderCardCell).join('');
          // re-bind cell clicks
          grid.querySelectorAll('[data-card-id]').forEach(cell => {
            cell.addEventListener('click', () => openCardDetail(cell.getAttribute('data-card-id')));
          });
        }
      });
    }

    overlay.querySelectorAll('[data-card-id]').forEach(cell => {
      cell.addEventListener('click', () => openCardDetail(cell.getAttribute('data-card-id')));
    });

    // 点击背景关闭
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeOverlay();
    });
  }

  function openCardDetail(cardId) {
    const card = MOCK_CARDS.find(c => c.id === cardId);
    if (!card) return;
    const overlay = document.getElementById(OVERLAY_ID);
    const anchor = overlay?.querySelector('#card-platform-detail-anchor');
    if (!anchor) return;
    const copy = getCopy();

    anchor.innerHTML = `
      <div class="card-platform-detail-backdrop is-open">
        <div class="card-platform-detail themed-modal" role="dialog" aria-modal="true">
          <button class="card-platform-detail-close btn-secondary btn-icon" data-action="detail-close" aria-label="${escapeHtml(copy.close)}">
            <span class="material-symbols-outlined">close</span>
          </button>
          <div class="card-platform-detail-cover" data-category="${escapeHtml(card.category)}">
            <span class="material-symbols-outlined">auto_stories</span>
          </div>
          <h3 class="card-platform-detail-title">${escapeHtml(card.title)}</h3>
          <div class="card-platform-detail-meta">
            <span>${escapeHtml(copy.cardAuthor)} ${escapeHtml(card.author)}</span>
            <span>·</span>
            <span>${escapeHtml(String(card.downloads))} ${escapeHtml(copy.cardDownloads)}</span>
            <span>·</span>
            <span>★ ${escapeHtml(card.rating.toFixed(1))}</span>
          </div>
          <div class="card-platform-detail-section">
            <div class="card-platform-detail-section-title">${escapeHtml(copy.detailDescription)}</div>
            <p class="card-platform-detail-desc">${escapeHtml(card.desc)}</p>
          </div>
          <div class="card-platform-detail-actions">
            <button class="btn-primary" data-action="detail-download">
              <span class="material-symbols-outlined">download</span>
              ${escapeHtml(copy.downloadBtn)}
            </button>
          </div>
        </div>
      </div>
    `;

    anchor.querySelector('[data-action="detail-close"]').addEventListener('click', closeCardDetail);
    anchor.querySelector('[data-action="detail-download"]').addEventListener('click', () => {
      showOverlayToast(copy.downloadSuccess);
    });
    anchor.querySelector('.card-platform-detail-backdrop').addEventListener('click', e => {
      if (e.target === e.currentTarget) closeCardDetail();
    });
  }

  function closeCardDetail() {
    const overlay = document.getElementById(OVERLAY_ID);
    const anchor = overlay?.querySelector('#card-platform-detail-anchor');
    if (anchor) anchor.innerHTML = '';
  }

  // ────── 上传向导 ──────
  function openUploadWizard() {
    uploadStep = 1;
    uploadDraft = { title: '', desc: '', tags: '' };
    renderUploadWizard();
  }

  function closeUploadWizard() {
    const overlay = document.getElementById(OVERLAY_ID);
    const anchor = overlay?.querySelector('#card-platform-upload-anchor');
    if (anchor) anchor.innerHTML = '';
  }

  function renderUploadWizard() {
    const overlay = document.getElementById(OVERLAY_ID);
    const anchor = overlay?.querySelector('#card-platform-upload-anchor');
    if (!anchor) return;
    const copy = getCopy();

    let stepBody = '';
    let stepTitle = '';
    let stepHint = '';
    if (uploadStep === 1) {
      stepTitle = copy.uploadStep1Title;
      stepHint = copy.uploadStep1Hint;
      stepBody = `
        <div class="card-platform-upload-cardpicker">
          <button class="card-platform-upload-cardchoice is-selected" data-mock-card="1">
            <span class="material-symbols-outlined">auto_stories</span>
            <span>${escapeHtml(copy.uploadCardPlaceholder)} 1</span>
          </button>
          <button class="card-platform-upload-cardchoice" data-mock-card="2">
            <span class="material-symbols-outlined">auto_stories</span>
            <span>${escapeHtml(copy.uploadCardPlaceholder)} 2</span>
          </button>
        </div>`;
    } else if (uploadStep === 2) {
      stepTitle = copy.uploadStep2Title;
      stepHint = copy.uploadStep2Hint;
      stepBody = `
        <div class="card-platform-upload-form">
          <input type="text" class="card-platform-upload-input" placeholder="${escapeHtml(copy.uploadDescPlaceholder)}" data-field="desc" value="${escapeHtml(uploadDraft.desc)}" />
          <input type="text" class="card-platform-upload-input" placeholder="${escapeHtml(copy.uploadTagsPlaceholder)}" data-field="tags" value="${escapeHtml(uploadDraft.tags)}" />
        </div>`;
    } else {
      stepTitle = copy.uploadStep3Title;
      stepHint = copy.uploadStep3Hint;
      stepBody = `
        <div class="card-platform-upload-review">
          <p>${escapeHtml(copy.uploadCardPlaceholder)} 1</p>
          <p>${escapeHtml(uploadDraft.desc || copy.uploadDescPlaceholder)}</p>
          <p>${escapeHtml(uploadDraft.tags || copy.uploadTagsPlaceholder)}</p>
        </div>`;
    }

    anchor.innerHTML = `
      <div class="card-platform-detail-backdrop is-open">
        <div class="card-platform-upload themed-modal" role="dialog" aria-modal="true">
          <button class="card-platform-detail-close btn-secondary btn-icon" data-action="upload-cancel" aria-label="${escapeHtml(copy.close)}">
            <span class="material-symbols-outlined">close</span>
          </button>
          <h3 class="card-platform-upload-title">${escapeHtml(stepTitle)}</h3>
          <p class="card-platform-upload-hint">${escapeHtml(stepHint)}</p>
          <div class="card-platform-upload-body">${stepBody}</div>
          <div class="card-platform-upload-actions">
            ${uploadStep > 1
              ? `<button class="btn-secondary" data-action="upload-back">${escapeHtml(copy.uploadBack)}</button>`
              : ''
            }
            ${uploadStep < 3
              ? `<button class="btn-primary" data-action="upload-next">${escapeHtml(copy.uploadNext)}</button>`
              : `<button class="btn-primary" data-action="upload-submit">${escapeHtml(copy.uploadSubmit)}</button>`
            }
          </div>
        </div>
      </div>
    `;

    anchor.querySelector('[data-action="upload-cancel"]').addEventListener('click', closeUploadWizard);
    anchor.querySelector('[data-action="upload-back"]')?.addEventListener('click', () => {
      uploadStep = Math.max(1, uploadStep - 1);
      renderUploadWizard();
    });
    anchor.querySelector('[data-action="upload-next"]')?.addEventListener('click', () => {
      // 抓取 step2 的输入
      if (uploadStep === 2) {
        anchor.querySelectorAll('[data-field]').forEach(el => {
          uploadDraft[el.getAttribute('data-field')] = el.value;
        });
      }
      uploadStep = Math.min(3, uploadStep + 1);
      renderUploadWizard();
    });
    anchor.querySelector('[data-action="upload-submit"]')?.addEventListener('click', () => {
      closeUploadWizard();
      showOverlayToast(getCopy().uploadSuccess);
    });
    anchor.querySelector('.card-platform-detail-backdrop').addEventListener('click', e => {
      if (e.target === e.currentTarget) closeUploadWizard();
    });
  }

  // ────── Toast（overlay 内部） ──────
  function showOverlayToast(message) {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    let toast = overlay.querySelector('.card-platform-toast');
    if (toast) toast.remove();
    toast = document.createElement('div');
    toast.className = 'card-platform-toast';
    toast.textContent = message;
    overlay.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    setTimeout(() => {
      toast.classList.remove('is-visible');
      setTimeout(() => toast.remove(), 240);
    }, 1800);
  }

  // ────── Overlay 开关 ──────
  function openOverlay() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    if (isGuest()) {
      openLoginPrompt();
      return;
    }
    renderOverlay();
    overlay.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => overlay.classList.add('is-open'));
  }

  function closeOverlay() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
  }

  function isOverlayOpen() {
    const overlay = document.getElementById(OVERLAY_ID);
    return overlay?.classList.contains('is-open') === true;
  }

  // ────── 初始化 ──────
  function init() {
    const btn = document.getElementById(SQUARE_BTN_ID);
    if (btn) {
      btn.addEventListener('click', onSquareClick);
    }

    syncSquareLockState();

    // Esc 关闭 overlay 或 prompt
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      const promptOpen = document.getElementById(PROMPT_ID)?.classList.contains('is-open');
      if (promptOpen) {
        closeLoginPrompt();
        return;
      }
      // 优先关闭嵌套 modal（详情/上传），再关闭 overlay
      const overlay = document.getElementById(OVERLAY_ID);
      if (overlay && isOverlayOpen()) {
        const detailHasContent = overlay.querySelector('#card-platform-detail-anchor')?.children.length > 0;
        const uploadHasContent = overlay.querySelector('#card-platform-upload-anchor')?.children.length > 0;
        if (detailHasContent) {
          closeCardDetail();
          return;
        }
        if (uploadHasContent) {
          closeUploadWizard();
          return;
        }
        closeOverlay();
      }
    });

    // 订阅账户变化
    if (window.eventBus) {
      window.eventBus.on('account:changed', () => {
        syncSquareLockState();
        // 如果用户登出时 overlay 还开着，关闭它
        if (isGuest() && isOverlayOpen()) {
          closeOverlay();
        }
      });
    }

    window.addEventListener('ui-language-changed', () => {
      if (isOverlayOpen()) renderOverlay();
    });
  }

  window.cardPlatformUI = {
    open: openOverlay,
    close: closeOverlay,
    isOpen: isOverlayOpen,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  console.log('[CardPlatformUI] Initialized');
})();
