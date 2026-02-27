'use strict';

// === 定数 ===
const STORAGE_KEY = 'kokudo_sticker_data';
const REGIONS = ['北海道','東北','関東','中部','北陸','近畿','中国','四国','九州','沖縄'];

// === 状態 ===
let collectedData = {};
let currentFilter = 'all';
let currentRegion = '';
let currentType = '';
let currentSort = 'number-asc';
let gallerySortOrder = 'date-desc';
let searchQuery = '';
let isListView = false;
let activeModalId = null;
let currentPhotos = [];
let tapTimers = {};
let currentView = 'home';
let mapInstance = null;

// === データ管理 ===
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    collectedData = raw ? JSON.parse(raw) : {};
  } catch (e) { collectedData = {}; }
}
function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collectedData));
}
function getRouteData(id) {
  return collectedData[id] || { collected: false, memo: '', date: null, location: '', lat: null, lng: null, photos: [] };
}
function setRouteData(id, patch) {
  collectedData[id] = { ...getRouteData(id), ...patch };
  saveData();
}

// === トースト ===
let toastTimer;
function showToast(msg, type = 'default') {
  const t = document.getElementById('toast');
  clearTimeout(toastTimer);
  t.textContent = msg;
  t.className = 'toast show ' + type;
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 2200);
}

// 都道府県の五十音順インデックス
const PREF_ORDER = ['北海道','青森','岩手','宮城','秋田','山形','福島','茨城','栃木','群馬','埼玉','千葉','東京','神奈川','新潟','富山','石川','福井','山梨','長野','岐阜','静岡','愛知','三重','滋賀','京都','大阪','兵庫','奈良','和歌山','鳥取','島根','岡山','広島','山口','徳島','香川','愛媛','高知','福岡','佐賀','長崎','熊本','大分','宮崎','鹿児島','沖縄'];

function getPrefOrder(route) {
  const from = route.from || '';
  const idx = PREF_ORDER.findIndex(p => from.includes(p));
  return idx === -1 ? 99 : idx;
}

function getSortedRoutes(routes) {
  const arr = [...routes];
  switch (currentSort) {
    case 'number-asc':
      return arr.sort((a, b) => a.id - b.id);
    case 'number-desc':
      return arr.sort((a, b) => b.id - a.id);
    case 'date-desc':
      return arr.sort((a, b) => {
        const da = getRouteData(a.id).date || '';
        const db = getRouteData(b.id).date || '';
        if (db !== da) return db.localeCompare(da);
        return a.id - b.id;
      });
    case 'date-asc':
      return arr.sort((a, b) => {
        const da = getRouteData(a.id).date || '';
        const db = getRouteData(b.id).date || '';
        if (da !== db) return da.localeCompare(db);
        return a.id - b.id;
      });
    case 'pref-asc':
      return arr.sort((a, b) => {
        const pa = getPrefOrder(a);
        const pb = getPrefOrder(b);
        if (pa !== pb) return pa - pb;
        return a.id - b.id;
      });
    default:
      return arr;
  }
}

// === フィルタ ===
function getFilteredRoutes() {
  const filtered = KOKUDO_ROUTES.filter((r) => {
    const d = getRouteData(r.id);
    if (currentFilter === 'collected' && !d.collected) return false;
    if (currentFilter === 'not-collected' && d.collected) return false;
    if (currentRegion && !r.region.includes(currentRegion)) return false;
    if (currentType && r.type !== currentType) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!String(r.id).includes(q) && !r.region.includes(q) && !r.from.includes(q) && !r.to.includes(q)) return false;
    }
    return true;
  });
  return getSortedRoutes(filtered);
}

// === 統計更新 ===
function updateStats() {
  const total = KOKUDO_ROUTES.length;
  const collected = KOKUDO_ROUTES.filter(r => getRouteData(r.id).collected).length;
  const pct = total > 0 ? Math.round(collected / total * 100) : 0;
  document.getElementById('stat-collected').textContent = collected;
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-pct').textContent = pct + '%';
  document.getElementById('progress-bar').style.width = pct + '%';
}

// === 地方サマリー ===
function buildRegionSummary() {
  const container = document.getElementById('region-cards');
  container.innerHTML = '';
  REGIONS.forEach(region => {
    const routes = KOKUDO_ROUTES.filter(r => r.region.includes(region));
    if (routes.length === 0) return;
    const done = routes.filter(r => getRouteData(r.id).collected).length;
    const pct = Math.round(done / routes.length * 100);
    const card = document.createElement('div');
    card.className = 'region-card' + (currentRegion === region ? ' active' : '');
    card.innerHTML = `
      <div class="r-name">${region}</div>
      <div class="r-count">${done}/${routes.length}</div>
      <div class="r-bar"><div class="r-bar-fill" style="width:${pct}%"></div></div>
    `;
    card.addEventListener('click', () => {
      currentRegion = currentRegion === region ? '' : region;
      switchView('list');
    });
    container.appendChild(card);
  });
}

// === 最近の取得 ===
function buildRecentList() {
  const container = document.getElementById('recent-list');
  const items = Object.entries(collectedData)
    .filter(([, d]) => d.collected && d.date)
    .sort((a, b) => (b[1].date || '').localeCompare(a[1].date || ''))
    .slice(0, 2);

  if (items.length === 0) {
    container.innerHTML = '<p class="recent-empty">まだ取得記録がありません</p>';
    return;
  }
  container.innerHTML = '';
  items.forEach(([id, d]) => {
    const route = KOKUDO_ROUTES.find(r => r.id === parseInt(id));
    if (!route) return;
    const row = document.createElement('div');
    row.className = 'recent-row';
    row.innerHTML = `
      <div class="recent-num">${id}号</div>
      <div class="recent-body">
        <div class="recent-name">${route.region}　${route.from}→${route.to}</div>
        <div class="recent-meta">${d.location ? '📍 ' + d.location + '　' : ''}📅 ${d.date}</div>
      </div>
    `;
    row.addEventListener('click', () => openDetail(parseInt(id)));
    container.appendChild(row);
  });
}

// === ルートカード ===
function createRouteCard(route) {
  const d = getRouteData(route.id);
  const card = document.createElement('div');
  card.className = 'route-card' + (d.collected ? ' collected' : '');
  card.dataset.id = route.id;

  if (isListView) {
    card.innerHTML = `
      <div class="route-num">${route.id}号</div>
      <div class="route-info">
        <div class="route-label">${route.region}</div>
        <div class="route-path">${route.from} → ${route.to}</div>
      </div>
    `;
  } else {
    card.innerHTML = `
      <div class="route-num">${route.id}</div>
      <div class="route-label">号</div>
    `;
    card.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      card._touchStartX = t.clientX;
      card._touchStartY = t.clientY;
    }, { passive: true });
    card.addEventListener('touchend', (e) => {
      const id = route.id;
      const t = e.changedTouches[0];
      const dx = Math.abs(t.clientX - (card._touchStartX || 0));
      const dy = Math.abs(t.clientY - (card._touchStartY || 0));
      // 10px以上動いていたらスクロールとみなしてタップ判定しない
      if (dx > 10 || dy > 10) return;
      if (tapTimers[id]) {
        clearTimeout(tapTimers[id]);
        delete tapTimers[id];
        e.preventDefault();
        quickToggle(id, card);
      } else {
        tapTimers[id] = setTimeout(() => { delete tapTimers[id]; openDetail(id); }, 280);
      }
    });
  }
  card.addEventListener('click', (e) => { if (e.defaultPrevented) return; openDetail(route.id); });
  return card;
}

// === クイックトグル ===
function quickToggle(id, card) {
  const d = getRouteData(id);
  const newVal = !d.collected;
  setRouteData(id, { collected: newVal, date: newVal ? new Date().toISOString().slice(0, 10) : null });
  card.classList.toggle('collected', newVal);
  updateStats();
  buildRegionSummary();
  buildRecentList();
  showToast(newVal ? `国道${id}号 ✓ 取得済みに設定` : `国道${id}号 未取得に戻しました`, newVal ? 'success' : 'default');
}

// === ルート一覧レンダリング ===
function renderRoutes() {
  const container = document.getElementById('routes-container');
  const filtered = getFilteredRoutes();
  container.className = isListView ? 'routes-list' : 'routes-grid';
  container.innerHTML = '';
  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state"><span>🔍</span><br>該当する国道が見つかりません</div>';
    return;
  }
  const frag = document.createDocumentFragment();
  filtered.forEach(r => frag.appendChild(createRouteCard(r)));
  container.appendChild(frag);
  document.getElementById('section-count').textContent = `${filtered.length}件`;
}

// === 一覧（2列メディアカード） ===
function buildGallery() {
  const q = (document.getElementById('gallery-search-input')?.value || '').trim();
  const container = document.getElementById('gallery-container');
  container.innerHTML = '';

  // 取得済みのみ
  let items = KOKUDO_ROUTES.filter(r => getRouteData(r.id).collected);

  // ソート
  switch (gallerySortOrder) {
    case 'date-desc':
      items.sort((a, b) => {
        const da = getRouteData(a.id).date || '';
        const db = getRouteData(b.id).date || '';
        return db.localeCompare(da) || a.id - b.id;
      });
      break;
    case 'date-asc':
      items.sort((a, b) => {
        const da = getRouteData(a.id).date || '';
        const db = getRouteData(b.id).date || '';
        return da.localeCompare(db) || a.id - b.id;
      });
      break;
    case 'number-asc':
      items.sort((a, b) => a.id - b.id);
      break;
    case 'number-desc':
      items.sort((a, b) => b.id - a.id);
      break;
    case 'pref-asc':
      items.sort((a, b) => {
        const pa = getPrefOrder(a);
        const pb = getPrefOrder(b);
        return pa !== pb ? pa - pb : a.id - b.id;
      });
      break;
  }

  // 番号検索
  if (q !== '') {
    items = items.filter(r => String(r.id).includes(q));
  }

  if (items.length === 0) {
    container.innerHTML = '<div class="gallery-empty"><span>📸</span><br>まだ取得記録がありません</div>';
    return;
  }

  items.forEach(route => {
    const d = getRouteData(route.id);
    const card = document.createElement('div');
    card.className = 'gallery-card';

    const signUrl = getRouteSignUrl(route.id);
    const thumb = (d.photos && d.photos.length > 0)
      ? `<div class="gallery-thumb"><img src="${d.photos[0]}" alt="国道${route.id}号" loading="lazy" /></div>`
      : signUrl
        ? `<div class="gallery-thumb sign-thumb"><img src="${signUrl}" alt="国道${route.id}号標識" /></div>`
        : `<div class="gallery-thumb no-photo"><span>📸</span></div>`;

    card.innerHTML = `
      ${thumb}
      <div class="gallery-info">
        <div class="gallery-num">${route.id}号</div>
        <div class="gallery-region">${route.region}</div>
        ${d.location ? `<div class="gallery-location">📍 ${d.location}</div>` : ''}
        ${d.date ? `<div class="gallery-date">📅 ${d.date}</div>` : ''}
      </div>
    `;
    card.addEventListener('click', () => openGalleryDetail(route.id));
    container.appendChild(card);
  });
}

// === 全体レンダリング ===
function renderAll() {
  updateStats();
  buildRegionSummary();
  buildRecentList();
  buildGallery();
  renderRoutes();
}

// === モーダル ===
// === 国道詳細シート ===
let activeDetailId = null;

// モーダル表示中の背景スクロール防止（position:fixed方式 - iOS Safari対応）
let _scrollY = 0;
function _lockBgScroll() {
  const appBody = document.getElementById('app-body');
  _scrollY = appBody.scrollTop;
  appBody.style.position = 'fixed';
  appBody.style.top = `-${_scrollY}px`;
  appBody.style.left = '0';
  appBody.style.right = '0';
  appBody.style.overflow = 'hidden';
}
function _unlockBgScroll() {
  const appBody = document.getElementById('app-body');
  appBody.style.position = '';
  appBody.style.top = '';
  appBody.style.left = '';
  appBody.style.right = '';
  appBody.style.overflow = '';
  appBody.scrollTop = _scrollY;
}

function openDetail(id) {
  const route = KOKUDO_ROUTES.find(r => r.id === id);
  if (!route) return;
  activeDetailId = id;

  const d = getRouteData(id);
  const collected = !!d.collected;

  // バッジ・タイトル
  const badge = document.getElementById('detail-route-badge');
  const _signUrl = getRouteSignUrl(id);
  if (_signUrl) {
    badge.innerHTML = `<img src="${_signUrl}" alt="国道${id}号標識" style="width:100%;height:100%;object-fit:contain;" />`;
    badge.className = 'detail-route-badge sign-img' + (collected ? ' collected' : '');
  } else {
    badge.innerHTML = id;
    badge.className = 'detail-route-badge' + (collected ? ' collected' : '');
  }
  document.getElementById('detail-route-num').textContent = `国道${id}号`;
  document.getElementById('detail-route-type').textContent =
    `${route.region}　／　${route.type}国道`;

  // 路線情報（まず routes.js の値で表示、Wiki取得後に更新）
  document.getElementById('detail-from').textContent = route.from;
  document.getElementById('detail-to').textContent = route.to;
  document.getElementById('detail-region').textContent = route.region;
  document.getElementById('detail-length').textContent = '取得中…';
  document.getElementById('detail-length').className = 'detail-info-value loading';

  // 取得状況
  _updateDetailStatus(id, d);

  // Wikipedia infobox から起点・終点・延長・概要（非同期）
  const wikiSec = document.getElementById('detail-wiki-section');
  const wikiText = document.getElementById('detail-wiki-text');
  const wikiLink = document.getElementById('detail-wiki-link');
  wikiSec.style.display = 'none';
  wikiText.textContent = '';
  wikiText.classList.remove('expanded');
  fetchRouteWikiInfo(id).then(info => {
    if (info) {
      // 起点・終点：Wikiの詳細があれば上書き
      if (info.from) document.getElementById('detail-from').textContent = info.from;
      if (info.to)   document.getElementById('detail-to').textContent   = info.to;
      if (info.length) {
        const el = document.getElementById('detail-length');
        el.textContent = info.length;
        el.className = 'detail-info-value';
      } else {
        const el = document.getElementById('detail-length');
        el.textContent = '—';
        el.className = 'detail-info-value';
      }
      if (info.extract) {
        wikiText.textContent = info.extract;
        wikiLink.href = `https://ja.wikipedia.org/wiki/国道${id}号`;
        wikiSec.style.display = 'block';
        // タップで全文展開
        wikiText.addEventListener('click', () => wikiText.classList.toggle('expanded'), { once: false });
      }
    } else {
      const el = document.getElementById('detail-length');
      el.textContent = '—';
      el.className = 'detail-info-value';
    }
  });

  document.getElementById('detail-overlay').classList.add('open');
  document.getElementById('app-body').classList.add('modal-open');
  _lockBgScroll();
}

function _updateDetailStatus(id, d) {
  const badge = document.getElementById('detail-status-badge');
  const meta = document.getElementById('detail-status-meta');
  const toggleBtn = document.getElementById('detail-toggle-btn');

  if (d.collected) {
    badge.textContent = '✓ 取得済み';
    badge.className = 'detail-status-badge collected';
    const parts = [];
    if (d.date) parts.push(`📅 ${d.date}`);
    if (d.location) parts.push(`📍 ${d.location}`);
    meta.innerHTML = parts.join('<br>');
    toggleBtn.textContent = '取得済みを解除';
    toggleBtn.className = 'detail-action-btn detail-action-toggle active';
  } else {
    badge.textContent = '未取得';
    badge.className = 'detail-status-badge';
    meta.textContent = '';
    toggleBtn.textContent = '○ 取得済みにする';
    toggleBtn.className = 'detail-action-btn detail-action-toggle';
  }
}

function closeDetail() {
  document.getElementById('detail-overlay').classList.remove('open');
  activeDetailId = null;
  document.getElementById('app-body').classList.remove('modal-open');
  _unlockBgScroll();
}

async function exportDetail() {
  if (activeDetailId === null) return;
  const route = KOKUDO_ROUTES.find(r => r.id === activeDetailId);
  const d = getRouteData(activeDetailId);
  if (!route) return;

  const lines = [
    `国道${activeDetailId}号`,
    `地域: ${route.region}`,
    `起点: ${route.from}`,
    `終点: ${route.to}`,
    '',
    `取得状況: ${d.collected ? '取得済み' : '未取得'}`,
  ];
  if (d.collected) {
    if (d.date) lines.push(`取得日: ${d.date}`);
    if (d.location) lines.push(`取得場所: ${d.location}`);
    if (d.memo) lines.push(`メモ: ${d.memo}`);
  }
  const wikiSummary = document.getElementById('detail-wiki-text')?.textContent?.trim();
  if (wikiSummary) {
    lines.push('');
    lines.push(`概要: ${wikiSummary}`);
  }
  const text = lines.join('\n');

  // 写真をFileオブジェクトに変換
  const files = [];
  if (d.photos && d.photos.length > 0) {
    for (let i = 0; i < d.photos.length; i++) {
      const src = d.photos[i];
      try {
        const res = await fetch(src);
        const blob = await res.blob();
        const ext = blob.type === 'image/png' ? 'png' : 'jpg';
        files.push(new File([blob], `kokudo${activeDetailId}_${i + 1}.${ext}`, { type: blob.type }));
      } catch (e) { /* skip */ }
    }
  }

  if (navigator.share) {
    try {
      const shareData = { title: `国道${activeDetailId}号`, text };
      if (files.length > 0 && navigator.canShare && navigator.canShare({ files })) {
        shareData.files = files;
      }
      await navigator.share(shareData);
    } catch (e) {
      if (e.name !== 'AbortError') showToast('共有に失敗しました', 'error');
    }
  } else {
    try {
      await navigator.clipboard.writeText(text);
      showToast('クリップボードにコピーしました', 'success');
    } catch (e) {
      showToast('共有非対応の環境です', 'error');
    }
  }
}

// === 一覧用詳細シート（表示専用） ===
let activeGalleryDetailId = null;

function openGalleryDetail(id) {
  const route = KOKUDO_ROUTES.find(r => r.id === id);
  if (!route) return;
  activeGalleryDetailId = id;

  const d = getRouteData(id);
  const collected = !!d.collected;

  // バッジ・タイトル
  const badge = document.getElementById('gd-route-badge');
  const _signUrl = getRouteSignUrl(id);
  if (_signUrl) {
    badge.innerHTML = `<img src="${_signUrl}" alt="国道${id}号標識" style="width:100%;height:100%;object-fit:contain;" />`;
    badge.className = 'detail-route-badge sign-img' + (collected ? ' collected' : '');
  } else {
    badge.innerHTML = id;
    badge.className = 'detail-route-badge' + (collected ? ' collected' : '');
  }
  document.getElementById('gd-route-num').textContent = `国道${id}号`;
  document.getElementById('gd-route-type').textContent = `${route.region}　／　${route.type}国道`;

  // 路線情報（routes.jsの値で初期表示）
  document.getElementById('gd-from').textContent = route.from;
  document.getElementById('gd-to').textContent = route.to;
  document.getElementById('gd-region').textContent = route.region;
  document.getElementById('gd-length').textContent = '取得中…';
  document.getElementById('gd-length').className = 'detail-info-value loading';



  // Wikipedia情報（非同期）
  const wikiSec = document.getElementById('gd-wiki-section');
  const wikiText = document.getElementById('gd-wiki-text');
  const wikiLink = document.getElementById('gd-wiki-link');
  wikiSec.style.display = 'none';
  wikiText.textContent = '';
  wikiText.classList.remove('expanded');
  fetchRouteWikiInfo(id).then(info => {
    if (info) {
      if (info.from) document.getElementById('gd-from').textContent = info.from;
      if (info.to)   document.getElementById('gd-to').textContent   = info.to;
      const lenEl = document.getElementById('gd-length');
      lenEl.textContent = info.length || '—';
      lenEl.className = 'detail-info-value';
      if (info.extract) {
        wikiText.textContent = info.extract;
        wikiLink.href = `https://ja.wikipedia.org/wiki/国道${id}号`;
        wikiSec.style.display = 'block';
        wikiText.addEventListener('click', () => wikiText.classList.toggle('expanded'), { once: false });
      }

    } else {
      const lenEl = document.getElementById('gd-length');
      lenEl.textContent = '—';
      lenEl.className = 'detail-info-value';
    }
  });

  // 取得情報（日時・場所）
  const collectedInfoEl = document.getElementById('gd-collected-info');
  if (collectedInfoEl) {
    const rows = [];
    if (d.date)     rows.push(`<div class="gd-info-row"><svg class="label-icon" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" fill="currentColor" opacity=".85"/><path d="M2 6h12" stroke="#fff" stroke-width="1"/><path d="M5 2v2M11 2v2" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/><rect x="4.5" y="8" width="2" height="2" rx=".4" fill="#fff"/><rect x="7.5" y="8" width="2" height="2" rx=".4" fill="#fff"/></svg> <span>${d.date}</span></div>`);
    if (d.location) rows.push(`<div class="gd-info-row"><svg class="label-icon" viewBox="0 0 16 16" fill="none"><path d="M8 1.5C5.51 1.5 3.5 3.51 3.5 6c0 3.75 4.5 8.5 4.5 8.5S12.5 9.75 12.5 6c0-2.49-2.01-4.5-4.5-4.5zm0 6.25A1.75 1.75 0 1 1 8 4a1.75 1.75 0 0 1 0 3.75z" fill="currentColor"/></svg> <span>${d.location}</span></div>`);
    collectedInfoEl.innerHTML = rows.join('');
    collectedInfoEl.style.display = rows.length ? 'block' : 'none';
  }

  // 写真
  const photosSec = document.getElementById('gd-photos-section');
  const photosGrid = document.getElementById('gd-photos-grid');
  photosGrid.innerHTML = '';
  if (d.photos && d.photos.length > 0) {
    d.photos.forEach(src => {
      const img = document.createElement('img');
      img.src = src;
      img.className = 'gd-photo-thumb';
      img.alt = `国道${id}号の写真`;
      img.loading = 'lazy';
      img.addEventListener('click', () => {
        const ov = document.createElement('div');
        ov.style.cssText = 'position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;';
        const full = document.createElement('img');
        full.src = src;
        full.style.cssText = 'max-width:95vw;max-height:90dvh;border-radius:8px;object-fit:contain;';
        ov.appendChild(full);
        ov.addEventListener('click', () => document.body.removeChild(ov));
        document.body.appendChild(ov);
      });
      photosGrid.appendChild(img);
    });
    photosSec.style.display = 'block';
  } else {
    photosSec.style.display = 'none';
  }

  document.getElementById('gallery-detail-overlay').classList.add('open');
  document.getElementById('app-body').classList.add('modal-open');
  _lockBgScroll();
}

function closeGalleryDetail() {
  document.getElementById('gallery-detail-overlay').classList.remove('open');
  activeGalleryDetailId = null;
  document.getElementById('app-body').classList.remove('modal-open');
  _unlockBgScroll();
}

// wikitextのマークアップを平文に変換
function _cleanWikitext(s) {
  for (let i = 0; i < 8; i++) {
    const prev = s;
    s = s.replace(/\[\[[^\[\]]*\|([^\[\]]*)\]\]/g, '$1'); // [[X|Y]] → Y
    s = s.replace(/\[\[([^\[\]]*)\]\]/g, '$1');           // [[X]] → X
    if (s === prev) break;
  }
  for (let i = 0; i < 5; i++) {
    const prev = s;
    s = s.replace(/\{\{[^{}]*\}\}/g, '');                  // {{...}} 除去
    if (s === prev) break;
  }
  s = s.replace(/<br\s*\/?>/gi, ' ');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/（\s*）/g, '').replace(/\(\s*\)/g, '');
  s = s.replace(/[\[\]{}]/g, '');
  s = s.replace(/[ \t\u3000]+/g, ' ').trim();
  s = s.replace(/\s*[（(]\s*$/, '').trim();
  return s;
}

async function fetchRouteWikiInfo(routeId) {
  try {
    const title = encodeURIComponent(`国道${routeId}号`);

    // wikitext（infobox）から起点・終点・総延長を取得
    const revUrl = `https://ja.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&redirects=1&titles=${title}&format=json&origin=*`;
    const revRes = await fetch(revUrl);
    if (!revRes.ok) return null;
    const revData = await revRes.json();
    const pages = revData?.query?.pages;
    if (!pages) return null;
    const page = Object.values(pages)[0];
    if (!page || page.missing !== undefined) return null;
    const wikitext = page?.revisions?.[0]?.slots?.main?.['*'] || '';

    function extractField(field) {
      const re = new RegExp(`\\|${field}\\s*=\\s*([\\s\\S]*?)(?=\\n\\s*\\||\\n\\n|$)`);
      const m = wikitext.match(re);
      return m ? _cleanWikitext(m[1].trim()) : null;
    }

    const from   = extractField('起点');
    const to     = extractField('終点');
    const rawLen = extractField('総延長');
    let length = null;
    if (rawLen) {
      const rawLen2 = rawLen.replace(/キロメートル/g, 'km');
      const lm = rawLen2.match(/([\d,]+(?:\.\d+)?)\s*km/);
      if (lm) length = lm[1].replace(',', '') + ' km';
    }

    // 概要文（extracts API）
    const extUrl = `https://ja.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&titles=${title}&format=json&origin=*`;
    const extRes = await fetch(extUrl);
    let extract = null;
    if (extRes.ok) {
      const extData = await extRes.json();
      const extPage = Object.values(extData?.query?.pages || {})[0];
      const raw = extPage?.extract || '';
      const firstPara = raw.split(/\n\n+/)[0].trim();
      if (firstPara.length > 20) extract = firstPara;
    }

    return { from, to, length, extract };
  } catch {
    return null;
  }
}

function openModal(id) {
  const route = KOKUDO_ROUTES.find(r => r.id === id);
  if (!route) return;
  activeModalId = id;
  const d = getRouteData(id);

  document.getElementById('modal-route-num').textContent = `国道${id}号`;
  document.getElementById('modal-route-region').textContent = `${route.region} ／ ${route.type}国道`;
  document.getElementById('modal-route-from').textContent = route.from;
  document.getElementById('modal-route-to').textContent = route.to;

  const btn = document.getElementById('collect-toggle-btn');
  btn.textContent = d.collected ? '✓ 取得済み' : '○ 取得済みにする';
  btn.className = 'collect-toggle' + (d.collected ? ' active' : '');

  document.getElementById('modal-memo-input').value = d.memo || '';
  const _dateRow = document.getElementById('modal-date-row');
  const _dateInput = document.getElementById('modal-date-input');
  if (d.collected) {
    _dateRow.style.display = '';
    _dateInput.value = d.date || '';
  } else {
    _dateRow.style.display = 'none';
    _dateInput.value = '';
  }
  document.getElementById('modal-location-input').value = d.location || '';
  document.getElementById('modal-lat-input').value = (d.lat != null) ? d.lat : '';
  document.getElementById('modal-lng-input').value = (d.lng != null) ? d.lng : '';
  updateMapLink(d.lat, d.lng);
  currentPhotos = Array.isArray(d.photos) ? [...d.photos] : [];
  renderPhotoGrid();

  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('app-body').classList.add('modal-open');
  document.querySelector('.bottom-tab-bar').style.display = 'none';
  _lockBgScroll();
}

function closeModal(save = true) {
  if (activeModalId !== null && save) {
    const memo = document.getElementById('modal-memo-input').value;
    const location = document.getElementById('modal-location-input').value.trim();
    const latVal = document.getElementById('modal-lat-input').value;
    const lngVal = document.getElementById('modal-lng-input').value;
    const lat = latVal !== '' ? parseFloat(latVal) : null;
    const lng = lngVal !== '' ? parseFloat(lngVal) : null;
    const dateVal = document.getElementById('modal-date-input').value || null;
    const d = getRouteData(activeModalId);
    if (d.collected) setRouteData(activeModalId, { date: dateVal });
    setRouteData(activeModalId, { memo, location, lat, lng, photos: currentPhotos });
    renderAll();
  }
  document.getElementById('modal-overlay').classList.remove('open');
  activeModalId = null;
  document.getElementById('app-body').classList.remove('modal-open');
  document.querySelector('.bottom-tab-bar').style.display = '';
  _unlockBgScroll();
}

// === エクスポート / インポート / リセット ===
function exportData() {
  const json = JSON.stringify(collectedData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kokudo-sticker-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('エクスポートしました', 'success');
}
let _importPending = null; // 選択ダイアログ中に保持するパース済みデータ

function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        // 簡易バリデーション：オブジェクトかどうか
        if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
        _importPending = parsed;
        openImportModal();
      } catch { showToast('ファイルの読み込みに失敗しました', 'error'); }
    };
    reader.readAsText(file);
  };
  input.click();
}

function openImportModal() {
  document.getElementById('import-modal-overlay').classList.add('open');
  document.getElementById('app-body').classList.add('modal-open');
  _lockBgScroll();
}
function closeImportModal() {
  document.getElementById('import-modal-overlay').classList.remove('open');
  _importPending = null;
  document.getElementById('app-body').classList.remove('modal-open');
  _unlockBgScroll();
}

function applyImportMerge() {
  if (!_importPending) return;
  const incoming = _importPending;
  // 国道IDごとにマージ：各フィールドを既存優先でマージ
  // collected: どちらかがtrueなら true（取得済み情報を失わない）
  // 他フィールド: 既存が空なら incoming の値を採用
  let added = 0, updated = 0;
  for (const id of Object.keys(incoming)) {
    const cur = collectedData[id];
    const inc = incoming[id];
    if (!cur) {
      // 既存にない → そのまま追加
      collectedData[id] = inc;
      if (inc.collected) added++;
    } else {
      // 既存あり → フィールドごとにマージ
      const merged = { ...cur };
      // collected: どちらかがtrueなら true
      if (inc.collected && !cur.collected) { merged.collected = true; updated++; }
      // memo: 既存が空なら incoming を採用
      if (!cur.memo && inc.memo) merged.memo = inc.memo;
      // date: 既存が空なら incoming を採用
      if (!cur.date && inc.date) merged.date = inc.date;
      // location: 既存が空なら incoming を採用
      if (!cur.location && inc.location) merged.location = inc.location;
      // lat/lng: 既存が未設定なら incoming を採用
      if ((cur.lat == null) && inc.lat != null) { merged.lat = inc.lat; merged.lng = inc.lng; }
      // photos: 既存に未登録のものを追加
      if (inc.photos && inc.photos.length > 0) {
        const existingUrls = new Set((cur.photos || []).map(p => typeof p === 'string' ? p : p.url));
        const newPhotos = inc.photos.filter(p => {
          const url = typeof p === 'string' ? p : p.url;
          return !existingUrls.has(url);
        });
        if (newPhotos.length > 0) merged.photos = [...(cur.photos || []), ...newPhotos];
      }
      collectedData[id] = merged;
    }
  }
  saveData(); renderAll();
  closeImportModal();
  const total = Object.keys(incoming).length;
  showToast(`マージ完了（${total}件処理）`, 'success');
}

function applyImportOverwrite() {
  if (!_importPending) return;
  if (!confirm('現在のすべての記録が削除され、インポートデータに置き換えられます。よろしいですか？')) return;
  collectedData = _importPending;
  saveData(); renderAll();
  closeImportModal();
  showToast('インポートしました（上書き）', 'success');
}
function resetData() {
  if (!confirm('すべての取得記録をリセットしますか？この操作は元に戻せません。')) return;
  collectedData = {};
  saveData(); renderAll();
  showToast('データをリセットしました');
}

async function clearCache() {
  if (!confirm('アプリのキャッシュを削除します。\n次回起動時に最新版を再取得します。\nよろしいですか？')) return;
  try {
    // Service Worker の登録を解除
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    // キャッシュストレージを全削除
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    showToast('キャッシュを削除しました。再起動します…', 'success');
    setTimeout(() => window.location.reload(), 1200);
  } catch (e) {
    showToast('キャッシュの削除に失敗しました', 'error');
  }
}

// コンビニ等チェーン名の略称→正式名 正規化テーブル
const CHAIN_NORMALIZE = [
  [/^セブン(?!イレブン)/, 'セブンイレブン'],
  [/^ファミマ/, 'ファミリーマート'],
  [/^ファミ(?!リーマート)/, 'ファミリーマート'],
  [/^ロー(?!ソン)/, 'ローソン'],
  [/^エネオス?/i, 'ENEOS'],
  [/^マック$|^マクド$/, 'マクドナルド'],
  [/^スタバ/, 'スターバックス'],
  [/^ドンキ(?!ホーテ)/, 'ドン・キホーテ'],
];

function normalizeChainName(q) {
  for (const [pat, replacement] of CHAIN_NORMALIZE) {
    if (pat.test(q)) return q.replace(pat, replacement);
  }
  return q;
}

// === ジオコーディング ===
async function geocodeLocation() {
  const raw = document.getElementById('modal-location-input').value.trim();
  if (!raw) { showToast('取得場所を入力してください', 'error'); return; }
  const query = normalizeChainName(raw);
  // 正規化で変わった場合は入力欄を更新（ユーザーに分かりやすく）
  if (query !== raw) {
    document.getElementById('modal-location-input').value = query;
  }
  const btn = document.getElementById('btn-geocode');
  btn.textContent = '⏳'; btn.disabled = true;
  hideCandidates();
  try {
    const candidates = await fetchCandidates(query);
    if (candidates.length === 0) {
      showToast('施設が見つかりませんでした', 'error');
    } else if (candidates.length === 1) {
      applyCandidate(candidates[0]);
    } else {
      showCandidates(candidates);
    }
  } catch { showToast('検索に失敗しました', 'error'); }
  finally { btn.textContent = '🔍'; btn.disabled = false; }
}

async function fetchCandidates(query) {
  const results = [];

  // --- 1. 国土地理院 地名検索API ---
  try {
    const gsiUrl = 'https://msearch.gsi.go.jp/address-search/AddressSearch?q=' + encodeURIComponent(query);
    const gsiRes = await fetch(gsiUrl);
    if (gsiRes.ok) {
      const gsiData = await gsiRes.json();
      gsiData.slice(0, 3).forEach(item => {
        const coords = item.geometry?.coordinates;
        if (coords) results.push({
          label: item.properties?.title || query,
          lat: Math.round(parseFloat(coords[1]) * 1000000) / 1000000,
          lng: Math.round(parseFloat(coords[0]) * 1000000) / 1000000,
          source: '地理院'
        });
      });
    }
  } catch {}

  // --- 2. Nominatim（日本限定・複数バリアント） ---
  // コンビニ・飲食・ガソリンスタンドなどのチェーン店キーワード
  const CHAIN_KEYWORDS = [
    'セブンイレブン', 'ローソン', 'ファミリーマート', 'ミニストップ',
    'デイリーヤマザキ', 'ポプラ', 'スリーエフ', 'セイコーマート',
    'エネオス', 'ENEOS', '出光', 'コスモ石油', '昭和シェル',
    'すき家', '吉野家', '松屋', 'マクドナルド', 'モスバーガー', 'ケンタッキー',
    'スターバックス', 'ドトール', 'コメダ', 'サイゼリヤ', 'ガスト', 'デニーズ',
    'イオン', 'イトーヨーカドー', 'ドン・キホーテ',
  ];
  const isChain = CHAIN_KEYWORDS.some(k => query.includes(k));

  const searchVariants = [query];

  if (isChain) {
    // チェーン店: 店舗名そのままを優先。「〇〇店」を末尾に付けたバリアントも追加
    if (!query.endsWith('店') && !query.endsWith('号店')) {
      searchVariants.push(query + '店');
    }
  } else {
    // 道の駅・SA・IC 補完パターン
    if (!query.includes('道の駅') && !query.includes('駅') && query.length <= 10) {
      searchVariants.push('道の駅' + query);
    }
    if (!query.includes('SA') && !query.includes('サービスエリア') && query.length <= 8) {
      searchVariants.push(query + 'サービスエリア');
      searchVariants.push(query + 'SA');
    }
    if (!query.includes('道路') && !query.includes('IC') && query.length <= 8) {
      searchVariants.push(query + 'インターチェンジ');
    }
    // 一般施設: 「〇〇店」も試す
    if (query.length <= 12 && !query.endsWith('店')) {
      searchVariants.push(query + '店');
    }
  }

  let reqCount = 0;
  for (const variant of searchVariants) {
    if (results.length >= 5) break;
    try {
      const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=3&countrycodes=jp&q='
        + encodeURIComponent(variant);
      if (reqCount > 0) await new Promise(r => setTimeout(r, 1000));
      const res = await fetch(url, { headers: { 'Accept-Language': 'ja' } });
      reqCount++;
      if (!res.ok) continue;
      const data = await res.json();
      data.forEach(item => {
        const lat = Math.round(parseFloat(item.lat) * 1000000) / 1000000;
        const lng = Math.round(parseFloat(item.lon) * 1000000) / 1000000;
        const isDup = results.some(r => Math.abs(r.lat - lat) < 0.001 && Math.abs(r.lng - lng) < 0.001);
        if (!isDup) results.push({
          label: item.display_name.split(',').slice(0, 2).join(' '),
          lat, lng, source: 'OSM'
        });
      });
    } catch {}
  }

  return results.slice(0, 5);
}

function applyCandidate(c) {
  document.getElementById('modal-lat-input').value = c.lat;
  document.getElementById('modal-lng-input').value = c.lng;
  updateMapLink(c.lat, c.lng);
  hideCandidates();
  showToast(`📍 ${c.label}`, 'success');
}

function showCandidates(candidates) {
  const box = document.getElementById('geocode-candidates');
  box.innerHTML = '';
  candidates.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'geocode-candidate-btn';
    btn.innerHTML = `<span class="gc-label">${c.label}</span><span class="gc-source">${c.source}</span>`;
    btn.addEventListener('click', () => applyCandidate(c));
    box.appendChild(btn);
  });
  box.style.display = 'block';
}

function hideCandidates() {
  const box = document.getElementById('geocode-candidates');
  if (box) { box.style.display = 'none'; box.innerHTML = ''; }
}

function updateMapLink(lat, lng) {
  const link = document.getElementById('modal-map-link');
  if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
    link.href = `https://maps.google.com/maps?q=${lat},${lng}`;
    link.style.display = 'inline';
  } else {
    link.style.display = 'none';
  }
}

// === 写真 ===
function addPhotos(files) {
  const MAX = 800, QUALITY = 0.72;
  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        currentPhotos.push(canvas.toDataURL('image/jpeg', QUALITY));
        renderPhotoGrid();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}
function renderPhotoGrid() {
  const grid = document.getElementById('photo-grid');
  grid.innerHTML = '';
  currentPhotos.forEach((src, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'photo-thumb' + (idx === 0 && currentPhotos.length > 1 ? ' photo-thumb-cover' : '');

    const img = document.createElement('img');
    img.src = src; img.alt = `写真${idx+1}`; img.loading = 'lazy';
    img.addEventListener('click', () => {
      const ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;';
      const big = document.createElement('img');
      big.src = src; big.style.cssText = 'max-width:92vw;max-height:92vh;border-radius:8px;';
      ov.appendChild(big);
      ov.addEventListener('click', () => document.body.removeChild(ov));
      document.body.appendChild(ov);
    });

    // カバー選択UI（複数枚のとき表示）
    if (currentPhotos.length > 1) {
      if (idx === 0) {
        const badge = document.createElement('div');
        badge.className = 'photo-cover-badge';
        badge.textContent = '表紙';
        wrap.appendChild(badge);
      } else {
        const coverBtn = document.createElement('button');
        coverBtn.className = 'photo-cover-btn';
        coverBtn.title = '一覧の表紙にする';
        coverBtn.textContent = '⭐';
        coverBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          currentPhotos.splice(idx, 1);
          currentPhotos.unshift(src);
          renderPhotoGrid();
          showToast('表紙の写真を変更しました', 'success');
        });
        wrap.appendChild(coverBtn);
      }
    }

    const rm = document.createElement('button');
    rm.className = 'photo-thumb-remove'; rm.textContent = '✕';
    rm.addEventListener('click', (e) => {
      e.stopPropagation();
      currentPhotos.splice(idx, 1);
      renderPhotoGrid();
    });
    wrap.appendChild(img); wrap.appendChild(rm);
    grid.appendChild(wrap);
  });
}

// === ビュー切替 ===
function switchView(view) {
  // 詳細シートが開いていたら閉じる
  if (document.getElementById('detail-overlay').classList.contains('open')) {
    closeDetail();
  }
  if (document.getElementById('gallery-detail-overlay').classList.contains('open')) {
    closeGalleryDetail();
  }
  currentView = view;
  document.querySelectorAll('.view-page').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.tab-item').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
  const pageEl = document.getElementById('view-' + view);
  pageEl.style.display = 'block';
  // メニュー画面時はボトムタブを隠す
  document.querySelector('.bottom-tab-bar').style.display = view === 'menu' ? 'none' : '';
  if (view === 'home') {
    // rAFを1回振った後に地図初期化（DOM描画完了を保証）
    requestAnimationFrame(() => {
      requestAnimationFrame(() => initHomeMap());
    });
  }
  if (view === 'shop') {
    const btn = document.getElementById('btn-open-shop');
    if (btn && !btn._bound) {
      btn._bound = true;
      btn.addEventListener('click', () => {
        window.open('https://vcountry.jp/kokudou/map/', '_blank');
      });
    }
  }
}

// === 地図ピッカー ===
let pickerMap = null;
let pickerMarker = null;
let pickerLatLng = null;

function openMapPicker() {
  const overlay = document.getElementById('map-picker-overlay');
  overlay.style.display = 'flex';
  _lockBgScroll();

  // 現在の緯度経度があれば中心に、なければ日本全体
  const curLat = parseFloat(document.getElementById('modal-lat-input').value);
  const curLng = parseFloat(document.getElementById('modal-lng-input').value);
  const hasCoords = !isNaN(curLat) && !isNaN(curLng);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!pickerMap) {
        pickerMap = L.map('map-picker-container', { zoomControl: true });
        L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
          attribution: '地理院タイル',
          maxZoom: 18
        }).addTo(pickerMap);

        pickerMap.on('click', (e) => {
          pickerLatLng = e.latlng;
          if (pickerMarker) {
            pickerMarker.setLatLng(e.latlng);
          } else {
            pickerMarker = L.marker(e.latlng, { draggable: true }).addTo(pickerMap);
            pickerMarker.on('dragend', (ev) => {
              pickerLatLng = ev.target.getLatLng();
              updatePickerHint(pickerLatLng);
            });
          }
          document.getElementById('map-picker-confirm').disabled = false;
          updatePickerHint(e.latlng);
        });
      } else {
        pickerMap.invalidateSize({ animate: false });
      }

      if (hasCoords) {
        pickerMap.setView([curLat, curLng], 13);
        // 既存座標にマーカーを置く
        pickerLatLng = L.latLng(curLat, curLng);
        if (pickerMarker) {
          pickerMarker.setLatLng(pickerLatLng);
        } else {
          pickerMarker = L.marker(pickerLatLng, { draggable: true }).addTo(pickerMap);
          pickerMarker.on('dragend', (ev) => {
            pickerLatLng = ev.target.getLatLng();
            updatePickerHint(pickerLatLng);
          });
        }
        document.getElementById('map-picker-confirm').disabled = false;
        updatePickerHint(pickerLatLng);
      } else {
        pickerMap.setView([36.5, 137.0], 5);
        pickerLatLng = null;
        document.getElementById('map-picker-confirm').disabled = true;
        document.getElementById('map-picker-hint').textContent = '地図をタップして場所を指定してください';
      }
    });
  });
}

function updatePickerHint(latlng) {
  const lat = latlng.lat.toFixed(6);
  const lng = latlng.lng.toFixed(6);
  document.getElementById('map-picker-hint').textContent = `📍 緯度: ${lat}　経度: ${lng}　（ドラッグで調整できます）`;
}

function closeMapPicker() {
  document.getElementById('map-picker-overlay').style.display = 'none';
  _unlockBgScroll();
}

function confirmMapPicker() {
  if (!pickerLatLng) return;
  const lat = parseFloat(pickerLatLng.lat.toFixed(6));
  const lng = parseFloat(pickerLatLng.lng.toFixed(6));
  document.getElementById('modal-lat-input').value = lat;
  document.getElementById('modal-lng-input').value = lng;
  updateMapLink(lat, lng);
  closeMapPicker();
}

// === 地図 ===
function initHomeMap() {
  const container = document.getElementById('home-map-container');
  if (!container) return;
  if (!mapInstance) {
    mapInstance = L.map(container, { zoomControl: true }).setView([36.5, 137.0], 5);
    L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
      attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">地理院タイル</a>',
      maxZoom: 18
    }).addTo(mapInstance);
    mapInstance._markerLayer = L.layerGroup().addTo(mapInstance);
  } else {
    mapInstance.invalidateSize({ animate: false });
  }
  mapInstance._markerLayer.clearLayers();

  const pins = [];
  Object.entries(collectedData).forEach(([id, d]) => {
    if (!d.collected) return;
    if (d.lat == null || d.lng == null) return;
    const lat = parseFloat(d.lat), lng = parseFloat(d.lng);
    if (isNaN(lat) || isNaN(lng)) return;
    const route = KOKUDO_ROUTES.find(r => r.id === parseInt(id));
    if (!route) return;
    const signUrl = getRouteSignUrl(parseInt(id));
    const icon = L.divIcon({
      className: '',
      html: signUrl
        ? `<img src="${signUrl}" style="width:36px;height:36px;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4));" />`
        : `<div style="background:#0055c8;color:white;font-size:10px;font-weight:700;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);">${id}</div>`,
      iconSize: [36, 36], iconAnchor: [18, 18]
    });
    const photoHtml = (d.photos && d.photos.length > 0)
      ? `<img src="${d.photos[0]}" style="width:100%;max-width:200px;border-radius:6px;margin-top:6px;display:block;" />`
      : '';
    const marker = L.marker([lat, lng], { icon }).addTo(mapInstance._markerLayer);
    marker.bindPopup(
      `<b>国道${id}号</b><br>` +
      (d.location ? `📍 ${d.location}<br>` : '') +
      (d.date ? `📅 ${d.date}<br>` : '') +
      (d.memo ? `📝 ${d.memo}<br>` : '') +
      photoHtml,
      { maxWidth: 220 }
    );
    pins.push([lat, lng]);
  });
  if (pins.length === 1) mapInstance.setView(pins[0], 12);
  else if (pins.length > 1) mapInstance.fitBounds(pins, { padding: [40, 40], maxZoom: 13 });
}

// === イベント設定 ===
function setupEvents() {
  // ボトムタブ
  document.querySelectorAll('.tab-item').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // 検索
  document.getElementById('search-input').addEventListener('input', (e) => {
    searchQuery = e.target.value.trim(); renderRoutes();
  });

  // ギャラリー検索
  document.getElementById('gallery-search-input').addEventListener('input', () => buildGallery());
  document.getElementById('gallery-sort-select').addEventListener('change', (e) => {
    gallerySortOrder = e.target.value; buildGallery();
  });

  // フィルタタブ
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderRoutes();
    });
  });

  // セレクト
  document.getElementById('region-select').addEventListener('change', (e) => {
    currentRegion = e.target.value; renderRoutes();
  });
  document.getElementById('type-select').addEventListener('change', (e) => {
    currentType = e.target.value; renderRoutes();
  });

  // グリッド/リスト切替
  document.getElementById('btn-grid-view').addEventListener('click', () => {
    isListView = false;
    document.getElementById('btn-grid-view').classList.add('active');
    document.getElementById('btn-list-view').classList.remove('active');
    renderRoutes();
  });
  document.getElementById('btn-list-view').addEventListener('click', () => {
    isListView = true;
    document.getElementById('btn-list-view').classList.add('active');
    document.getElementById('btn-grid-view').classList.remove('active');
    renderRoutes();
  });

  // モーダル
  document.getElementById('modal-close').addEventListener('click', () => closeModal(false));
  document.getElementById('btn-modal-submit').addEventListener('click', () => closeModal(true));
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-overlay')) closeModal(true);
  });

  // 詳細シート
  document.getElementById('detail-close').addEventListener('click', closeDetail);
  document.getElementById('detail-export').addEventListener('click', exportDetail);
  document.getElementById('detail-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('detail-overlay')) closeDetail();
  });
  // 一覧用詳細シート
  document.getElementById('gd-close').addEventListener('click', closeGalleryDetail);
  document.getElementById('gallery-detail-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('gallery-detail-overlay')) closeGalleryDetail();
  });
  document.getElementById('detail-edit-btn').addEventListener('click', () => {
    const id = activeDetailId;
    closeDetail();
    openModal(id);
  });
  document.getElementById('detail-toggle-btn').addEventListener('click', () => {
    if (activeDetailId === null) return;
    const id = activeDetailId;
    const d = getRouteData(id);
    const newVal = !d.collected;
    const today = new Date().toISOString().slice(0, 10);
    setRouteData(id, { collected: newVal, date: newVal ? today : null });
    renderAll();
    _updateDetailStatus(id, getRouteData(id));
    // バッジも更新（sign-imgクラスを維持）
    const badge = document.getElementById('detail-route-badge');
    const hasSign = badge.classList.contains('sign-img');
    badge.className = 'detail-route-badge' + (hasSign ? ' sign-img' : '') + (newVal ? ' collected' : '');
    showToast(newVal ? `国道${id}号 ✓ 取得済みに設定` : `国道${id}号 未取得に戻しました`, newVal ? 'success' : 'default');
  });

  // 取得トグル
  document.getElementById('collect-toggle-btn').addEventListener('click', () => {
    if (activeModalId === null) return;
    const d = getRouteData(activeModalId);
    const newVal = !d.collected;
    const today = new Date().toISOString().slice(0, 10);
    const _toggleDateRow = document.getElementById('modal-date-row');
    const _toggleDateInput = document.getElementById('modal-date-input');
    if (newVal) {
      _toggleDateRow.style.display = '';
      if (!_toggleDateInput.value) _toggleDateInput.value = today;
    } else {
      _toggleDateRow.style.display = 'none';
      _toggleDateInput.value = '';
    }
    const dateToSave = newVal ? (_toggleDateInput.value || today) : null;
    setRouteData(activeModalId, { collected: newVal, date: dateToSave });
    const btn = document.getElementById('collect-toggle-btn');
    btn.textContent = newVal ? '✓ 取得済み' : '○ 取得済みにする';
    btn.className = 'collect-toggle' + (newVal ? ' active' : '');
    updateStats(); buildRegionSummary(); buildRecentList();
    const card = document.querySelector(`.route-card[data-id="${activeModalId}"]`);
    if (card) card.classList.toggle('collected', newVal);
  });

  // その他ページのボタン
  document.getElementById('btn-export').addEventListener('click', exportData);
  document.getElementById('btn-import').addEventListener('click', importData);
  document.getElementById('btn-reset').addEventListener('click', resetData);
  document.getElementById('btn-clear-cache').addEventListener('click', clearCache);

  // インポートモーダルのボタン
  document.getElementById('import-btn-merge').addEventListener('click', applyImportMerge);
  document.getElementById('import-btn-overwrite').addEventListener('click', applyImportOverwrite);
  document.getElementById('import-btn-cancel').addEventListener('click', closeImportModal);
  document.getElementById('import-modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeImportModal();
  });

  // ジオコーディング
  document.getElementById('btn-geocode').addEventListener('click', geocodeLocation);
  document.getElementById('modal-location-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); geocodeLocation(); }
  });

  // 緯度経度入力でリンク更新
  ['modal-lat-input', 'modal-lng-input'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      const lat = parseFloat(document.getElementById('modal-lat-input').value);
      const lng = parseFloat(document.getElementById('modal-lng-input').value);
      updateMapLink(isNaN(lat) ? null : lat, isNaN(lng) ? null : lng);
    });
  });

  // 地図ピッカー
  document.getElementById('btn-map-picker').addEventListener('click', openMapPicker);
  document.getElementById('map-picker-cancel').addEventListener('click', closeMapPicker);
  document.getElementById('map-picker-confirm').addEventListener('click', confirmMapPicker);

  // 写真
  document.getElementById('photo-input').addEventListener('change', (e) => {
    addPhotos(e.target.files); e.target.value = '';
  });

  // ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeModalId !== null) closeModal(true);
  });
}

// === Service Worker ===
function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('./sw.js').then((reg) => {
    // 起動時すでに waiting 状態のSWがある場合（タブが長時間開いたままの場合など）
    if (reg.waiting && navigator.serviceWorker.controller) {
      showUpdateBanner(reg.waiting);
    }

    // 新しいSWがインストールされ始めたとき
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        // installed（=waiting）になり、かつ既存SWあり → バナー表示
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner(newWorker);
        }
      });
    });
  }).catch(() => {});

  // SWがskipWaitingした後に全ページをリロード
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

function showUpdateBanner(newWorker) {
  const banner = document.getElementById('update-banner');
  if (!banner || banner.style.display !== 'none') return;
  banner.style.display = 'flex';
  document.getElementById('update-banner-btn').addEventListener('click', () => {
    banner.style.display = 'none';
    // SWにSKIP_WAITINGを送信 → controllerchangeイベントで自動リロード
    newWorker.postMessage({ type: 'SKIP_WAITING' });
  });
}

// === 起動 ===
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  setupEvents();
  renderAll();

  // メニューカードの遷移イベント
  document.querySelectorAll('.menu-card').forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.goto);
    });
  });

  // ホーム画面から起動
  switchView('home');

  registerSW();
});
