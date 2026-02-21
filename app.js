'use strict';

// === 定数 ===
const STORAGE_KEY = 'kokudo_sticker_data';
const REGIONS = ['北海道','東北','関東','中部','北陸','近畿','中国','四国','九州','沖縄'];

// === 状態 ===
let collectedData = {};
let currentFilter = 'all';
let currentRegion = '';
let currentType = '';
let searchQuery = '';
let isListView = false;
let activeModalId = null;
let currentPhotos = [];
let tapTimers = {};
let currentView = 'menu';
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

// === フィルタ ===
function getFilteredRoutes() {
  return KOKUDO_ROUTES.filter((r) => {
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
    .slice(0, 5);

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
    row.addEventListener('click', () => openModal(parseInt(id)));
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
      <div class="collected-badge">✓</div>
    `;
  } else {
    card.innerHTML = `
      <div class="route-num">${route.id}</div>
      <div class="route-label">号</div>
      <div class="collected-badge">✓</div>
    `;
    card.addEventListener('touchend', (e) => {
      const id = route.id;
      if (tapTimers[id]) {
        clearTimeout(tapTimers[id]);
        delete tapTimers[id];
        e.preventDefault();
        quickToggle(id, card);
      } else {
        tapTimers[id] = setTimeout(() => { delete tapTimers[id]; openModal(id); }, 280);
      }
    });
  }
  card.addEventListener('click', (e) => { if (e.defaultPrevented) return; openModal(route.id); });
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
  const container = document.getElementById('gallery-container');
  container.innerHTML = '';

  // 取得済みのみ、日付降順
  const items = KOKUDO_ROUTES
    .filter(r => getRouteData(r.id).collected)
    .sort((a, b) => {
      const da = getRouteData(a.id).date || '';
      const db = getRouteData(b.id).date || '';
      return db.localeCompare(da);
    });

  if (items.length === 0) {
    container.innerHTML = '<div class="gallery-empty"><span>📸</span><br>まだ取得記録がありません</div>';
    return;
  }

  items.forEach(route => {
    const d = getRouteData(route.id);
    const card = document.createElement('div');
    card.className = 'gallery-card';

    const thumb = (d.photos && d.photos.length > 0)
      ? `<div class="gallery-thumb"><img src="${d.photos[0]}" alt="国道${route.id}号" loading="lazy" /></div>`
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
    card.addEventListener('click', () => openModal(route.id));
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
  document.getElementById('modal-date').textContent = d.date ? `取得日: ${d.date}` : '';
  document.getElementById('modal-location-input').value = d.location || '';
  document.getElementById('modal-lat-input').value = (d.lat != null) ? d.lat : '';
  document.getElementById('modal-lng-input').value = (d.lng != null) ? d.lng : '';
  updateMapLink(d.lat, d.lng);
  currentPhotos = Array.isArray(d.photos) ? [...d.photos] : [];
  renderPhotoGrid();

  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal(save = true) {
  if (activeModalId !== null && save) {
    const memo = document.getElementById('modal-memo-input').value;
    const location = document.getElementById('modal-location-input').value.trim();
    const latVal = document.getElementById('modal-lat-input').value;
    const lngVal = document.getElementById('modal-lng-input').value;
    const lat = latVal !== '' ? parseFloat(latVal) : null;
    const lng = lngVal !== '' ? parseFloat(lngVal) : null;
    setRouteData(activeModalId, { memo, location, lat, lng, photos: currentPhotos });
    renderAll();
  }
  document.getElementById('modal-overlay').classList.remove('open');
  activeModalId = null;
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
        collectedData = JSON.parse(ev.target.result);
        saveData(); renderAll();
        showToast('インポートしました', 'success');
      } catch { showToast('ファイルの読み込みに失敗しました', 'error'); }
    };
    reader.readAsText(file);
  };
  input.click();
}
function resetData() {
  if (!confirm('すべての取得記録をリセットしますか？この操作は元に戻せません。')) return;
  collectedData = {};
  saveData(); renderAll();
  showToast('データをリセットしました');
}

// === ジオコーディング ===
async function geocodeLocation() {
  const query = document.getElementById('modal-location-input').value.trim();
  if (!query) { showToast('取得場所を入力してください', 'error'); return; }
  const btn = document.getElementById('btn-geocode');
  btn.textContent = '⏳'; btn.disabled = true;
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=jp&q=' + encodeURIComponent(query);
    const res = await fetch(url, { headers: { 'Accept-Language': 'ja' } });
    if (!res.ok) throw new Error();
    const data = await res.json();
    if (!data.length) { showToast('施設が見つかりませんでした', 'error'); return; }
    const lat = Math.round(parseFloat(data[0].lat) * 1000000) / 1000000;
    const lng = Math.round(parseFloat(data[0].lon) * 1000000) / 1000000;
    document.getElementById('modal-lat-input').value = lat;
    document.getElementById('modal-lng-input').value = lng;
    updateMapLink(lat, lng);
    showToast(`📍 緯度 ${lat} / 経度 ${lng}`, 'success');
  } catch { showToast('検索に失敗しました', 'error'); }
  finally { btn.textContent = '🔍'; btn.disabled = false; }
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
    wrap.className = 'photo-thumb';
    const img = document.createElement('img');
    img.src = src; img.alt = `写真${idx+1}`; img.loading = 'lazy';
    img.addEventListener('click', () => {
      const ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;z-index:999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;';
      const big = document.createElement('img');
      big.src = src; big.style.cssText = 'max-width:92vw;max-height:92vh;border-radius:8px;';
      ov.appendChild(big);
      ov.addEventListener('click', () => document.body.removeChild(ov));
      document.body.appendChild(ov);
    });
    const rm = document.createElement('button');
    rm.className = 'photo-thumb-remove'; rm.textContent = '✕';
    rm.addEventListener('click', () => { currentPhotos.splice(idx, 1); renderPhotoGrid(); });
    wrap.appendChild(img); wrap.appendChild(rm);
    grid.appendChild(wrap);
  });
}

// === ビュー切替 ===
function switchView(view) {
  if (view === currentView) return;
  currentView = view;
  document.querySelectorAll('.view-page').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.tab-item').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
  const pageEl = document.getElementById('view-' + view);
  pageEl.style.display = '';
  // メニュー画面時はボトムタブを隠す
  document.querySelector('.bottom-tab-bar').style.display = view === 'menu' ? 'none' : '';
  if (view === 'home') {
    // ホーム表示時に地図サイズを再計算（表示切り替え完了を待つ）
    setTimeout(() => initHomeMap(), 200);
  }
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
    // display:none から復帰後に必ずサイズ再計算とタイル再描画
    setTimeout(() => {
      mapInstance.invalidateSize({ animate: false });
    }, 50);
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
    const icon = L.divIcon({
      className: '',
      html: `<div style="background:#0055c8;color:white;font-size:10px;font-weight:700;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);">${id}</div>`,
      iconSize: [28, 28], iconAnchor: [14, 14]
    });
    const photoHtml = (d.photos && d.photos.length > 0)
      ? `<img src="${d.photos[0]}" style="width:100%;max-width:200px;border-radius:6px;margin-top:6px;display:block;" />`
      : '';
    const marker = L.marker([lat, lng], { icon }).addTo(mapInstance._markerLayer);
    marker.bindPopup(
      `<b>国道${id}号</b> ✅<br>` +
      `<small style="color:#666">${route.region}　${route.from}→${route.to}</small><br>` +
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
  document.getElementById('modal-close').addEventListener('click', () => closeModal(true));
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-overlay')) closeModal(true);
  });

  // 取得トグル
  document.getElementById('collect-toggle-btn').addEventListener('click', () => {
    if (activeModalId === null) return;
    const d = getRouteData(activeModalId);
    const newVal = !d.collected;
    const today = new Date().toISOString().slice(0, 10);
    setRouteData(activeModalId, { collected: newVal, date: newVal ? today : null });
    const btn = document.getElementById('collect-toggle-btn');
    btn.textContent = newVal ? '✓ 取得済み' : '○ 取得済みにする';
    btn.className = 'collect-toggle' + (newVal ? ' active' : '');
    document.getElementById('modal-date').textContent = newVal ? `取得日: ${today}` : '';
    updateStats(); buildRegionSummary(); buildRecentList();
    const card = document.querySelector(`.route-card[data-id="${activeModalId}"]`);
    if (card) card.classList.toggle('collected', newVal);
  });

  // その他ページのボタン
  document.getElementById('btn-export').addEventListener('click', exportData);
  document.getElementById('btn-import').addEventListener('click', importData);
  document.getElementById('btn-reset').addEventListener('click', resetData);

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

  // 写真
  ['photo-input-camera', 'photo-input-library', 'photo-input-file'].forEach(id => {
    document.getElementById(id).addEventListener('change', (e) => {
      addPhotos(e.target.files); e.target.value = '';
    });
  });

  // ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeModalId !== null) closeModal(true);
  });
}

// === Service Worker ===
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
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

  // 毎回メニューから起動
  document.getElementById('view-menu').style.display = '';
  document.querySelector('.bottom-tab-bar').style.display = 'none';

  // ホーム地図の初期化（メニューから遷移後に呼ばれるが念のため遅延呼び出し）
  // 実際の初期化はhomeビューに切り替えた際にswitchView経由で行われる
  registerSW();
});
