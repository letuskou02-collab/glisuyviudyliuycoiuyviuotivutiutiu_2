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

// === データ管理 ===
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    collectedData = raw ? JSON.parse(raw) : {};
  } catch (e) {
    collectedData = {};
  }
}
function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collectedData));
}
function getRouteData(id) {
  return collectedData[id] || { collected: false, memo: '', date: null, location: '', lat: null, lng: null, photos: [] };
}
function setRouteData(id, patch) {
  const current = getRouteData(id);
  collectedData[id] = { ...current, ...patch };
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
      if (!String(r.id).includes(q) && !r.name.includes(q) && !r.region.includes(q) && !r.from.includes(q) && !r.to.includes(q)) return false;
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
  document.getElementById('stat-pct').textContent = pct;
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
      renderAll();
    });
    container.appendChild(card);
  });
}

// === ルートカード生成 ===
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
    // ダブルタップでクイックトグル
    card.addEventListener('touchend', (e) => {
      const id = route.id;
      if (tapTimers[id]) {
        clearTimeout(tapTimers[id]);
        delete tapTimers[id];
        e.preventDefault();
        quickToggle(id, card);
      } else {
        tapTimers[id] = setTimeout(() => {
          delete tapTimers[id];
          openModal(id);
        }, 280);
      }
    });
  }

  card.addEventListener('click', (e) => {
    if (e.defaultPrevented) return;
    openModal(route.id);
  });

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
  showToast(newVal ? `国道${id}号 ✓ 取得済みに設定` : `国道${id}号 未取得に戻しました`, newVal ? 'success' : 'default');
}

// === ルート一覧レンダリング ===
function renderRoutes() {
  const container = document.getElementById('routes-container');
  const filtered = getFilteredRoutes();

  container.className = isListView ? 'routes-list' : 'routes-grid';
  container.innerHTML = '';

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state"><span class="icon">🔍</span>該当する国道が見つかりません</div>';
    return;
  }

  const frag = document.createDocumentFragment();
  filtered.forEach(r => frag.appendChild(createRouteCard(r)));
  container.appendChild(frag);

  document.getElementById('section-count').textContent = `${filtered.length}件`;
}

// === 全体レンダリング ===
function renderAll() {
  updateStats();
  buildRegionSummary();
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

  // 取得場所
  document.getElementById('modal-location-input').value = d.location || '';

  // 緯度経度
  document.getElementById('modal-lat-input').value = (d.lat !== null && d.lat !== undefined) ? d.lat : '';
  document.getElementById('modal-lng-input').value = (d.lng !== null && d.lng !== undefined) ? d.lng : '';
  updateMapLink(d.lat, d.lng);

  // 写真
  currentPhotos = Array.isArray(d.photos) ? [...d.photos] : [];
  renderPhotoGrid();

  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('modal-memo-input').focus();
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
  showToast('データをエクスポートしました', 'success');
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
        const data = JSON.parse(ev.target.result);
        collectedData = data;
        saveData();
        renderAll();
        showToast('データをインポートしました', 'success');
      } catch {
        showToast('ファイルの読み込みに失敗しました', 'error');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function resetData() {
  if (!confirm('すべての取得記録をリセットしますか？この操作は元に戻せません。')) return;
  collectedData = {};
  saveData();
  renderAll();
  showToast('データをリセットしました');
}

// === イベント設定 ===
function setupEvents() {
  // ナビタブ切替
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view);
    });
  });

  // 検索
  document.getElementById('search-input').addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    renderRoutes();
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

  // 地方セレクト
  document.getElementById('region-select').addEventListener('change', (e) => {
    currentRegion = e.target.value;
    buildRegionSummary();
    renderRoutes();
  });

  // 種別セレクト
  document.getElementById('type-select').addEventListener('change', (e) => {
    currentType = e.target.value;
    renderRoutes();
  });

  // ビュー切替
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

  // 収集トグルボタン
  document.getElementById('collect-toggle-btn').addEventListener('click', () => {
    if (activeModalId === null) return;
    const d = getRouteData(activeModalId);
    const newVal = !d.collected;
    setRouteData(activeModalId, { collected: newVal, date: newVal ? new Date().toISOString().slice(0,10) : null });
    const btn = document.getElementById('collect-toggle-btn');
    btn.textContent = newVal ? '✓ 取得済み' : '○ 取得済みにする';
    btn.className = 'collect-toggle' + (newVal ? ' active' : '');
    document.getElementById('modal-date').textContent = newVal ? `取得日: ${new Date().toISOString().slice(0,10)}` : '';
    updateStats();
    buildRegionSummary();
    // カードの見た目も即時更新
    const card = document.querySelector(`.route-card[data-id="${activeModalId}"]`);
    if (card) card.classList.toggle('collected', newVal);
  });

  // データ管理ページのボタン
  document.getElementById('btn-export').addEventListener('click', exportData);
  document.getElementById('btn-import').addEventListener('click', importData);
  document.getElementById('btn-reset').addEventListener('click', resetData);

  // 施設名からジオコーディング
  document.getElementById('btn-geocode').addEventListener('click', geocodeLocation);
  document.getElementById('modal-location-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); geocodeLocation(); }
  });


  // 緯度経度入力でマップリンク更新
  document.getElementById('modal-lat-input').addEventListener('input', () => {
    const lat = parseFloat(document.getElementById('modal-lat-input').value);
    const lng = parseFloat(document.getElementById('modal-lng-input').value);
    updateMapLink(isNaN(lat) ? null : lat, isNaN(lng) ? null : lng);
  });
  document.getElementById('modal-lng-input').addEventListener('input', () => {
    const lat = parseFloat(document.getElementById('modal-lat-input').value);
    const lng = parseFloat(document.getElementById('modal-lng-input').value);
    updateMapLink(isNaN(lat) ? null : lat, isNaN(lng) ? null : lng);
  });

  // 写真追加
  document.getElementById('photo-input').addEventListener('change', (e) => {
    addPhotos(e.target.files);
    e.target.value = '';
  });


  // ESC キーでモーダルを閉じる
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeModalId !== null) closeModal(true);
  });
}


// === ジオコーディング（施設名→緯度経度） ===
async function geocodeLocation() {
  const input = document.getElementById('modal-location-input');
  const query = input.value.trim();
  if (!query) {
    showToast('取得場所を入力してください', 'error');
    return;
  }
  const btn = document.getElementById('btn-geocode');
  btn.textContent = '⏳';
  btn.disabled = true;

  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=jp&q=' + encodeURIComponent(query);
    const res = await fetch(url, { headers: { 'Accept-Language': 'ja' } });
    if (!res.ok) throw new Error('network error');
    const data = await res.json();
    if (data.length === 0) {
      showToast('施設が見つかりませんでした', 'error');
      return;
    }
    const lat = Math.round(parseFloat(data[0].lat) * 1000000) / 1000000;
    const lng = Math.round(parseFloat(data[0].lon) * 1000000) / 1000000;
    document.getElementById('modal-lat-input').value = lat;
    document.getElementById('modal-lng-input').value = lng;
    updateMapLink(lat, lng);
    showToast(`📍 緯度 ${lat} / 経度 ${lng}`, 'success');
  } catch (e) {
    showToast('検索に失敗しました（通信を確認してください）', 'error');
  } finally {
    btn.textContent = '🔍';
    btn.disabled = false;
  }
}

function updateMapLink(lat, lng) {
  const link = document.getElementById('modal-map-link');
  if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
    link.href = `https://maps.google.com/maps?q=${lat},${lng}`;
    link.style.display = 'inline';
  } else {
    link.style.display = 'none';
  }
}

// === 写真処理 ===
function addPhotos(files) {
  const MAX = 800;
  const QUALITY = 0.72;
  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else       { w = Math.round(w * MAX / h); h = MAX; }
        }
        canvas.width = w;
        canvas.height = h;
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
    img.src = src;
    img.alt = `写真${idx + 1}`;
    img.loading = 'lazy';
    // タップで拡大
    img.addEventListener('click', () => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;';
      const big = document.createElement('img');
      big.src = src;
      big.style.cssText = 'max-width:92vw;max-height:92vh;border-radius:8px;';
      overlay.appendChild(big);
      overlay.addEventListener('click', () => document.body.removeChild(overlay));
      document.body.appendChild(overlay);
    });
    const removeBtn = document.createElement('button');
    removeBtn.className = 'photo-thumb-remove';
    removeBtn.textContent = '✕';
    removeBtn.title = '削除';
    removeBtn.addEventListener('click', () => {
      currentPhotos.splice(idx, 1);
      renderPhotoGrid();
    });
    wrap.appendChild(img);
    wrap.appendChild(removeBtn);
    grid.appendChild(wrap);
  });
}

// === ビュー切替 ===
let currentView = 'list';
let mapInstance = null;

function switchView(view) {
  if (view === currentView) return;
  currentView = view;

  document.querySelectorAll('.view-page').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));

  const page = document.getElementById('view-' + view);
  page.style.display = '';

  if (view === 'map') {
    // toolbar を隠す
    document.querySelector('.toolbar').style.display = 'none';
    initMap();
  } else {
    document.querySelector('.toolbar').style.display = '';
  }
}

function initMap() {
  const container = document.getElementById('map-container');
  if (!mapInstance) {
    mapInstance = L.map('map-container').setView([36.5, 137.0], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(mapInstance);
  }
  // 既存マーカーを全削除
  if (mapInstance._markerLayer) {
    mapInstance._markerLayer.clearLayers();
  } else {
    mapInstance._markerLayer = L.layerGroup().addTo(mapInstance);
  }

  const pins = [];
  Object.entries(collectedData).forEach(([id, d]) => {
    if (!d.collected || d.lat == null || d.lng == null) return;
    const route = KOKUDO_ROUTES.find(r => r.id === parseInt(id));
    if (!route) return;
    const lat = parseFloat(d.lat);
    const lng = parseFloat(d.lng);
    if (isNaN(lat) || isNaN(lng)) return;

    const marker = L.marker([lat, lng]).addTo(mapInstance._markerLayer);
    const photoHtml = (d.photos && d.photos.length > 0)
      ? `<img src="${d.photos[0]}" style="width:100%;max-width:200px;border-radius:6px;margin-top:6px;" />`
      : '';
    marker.bindPopup(
      `<b>国道${id}号</b><br>` +
      `<small>${route.region}／${route.from}→${route.to}</small><br>` +
      (d.location ? `📍 ${d.location}<br>` : '') +
      (d.date ? `📅 ${d.date}<br>` : '') +
      (d.memo ? `📝 ${d.memo}<br>` : '') +
      photoHtml
    );
    pins.push([lat, lng]);
  });

  if (pins.length > 0) {
    mapInstance.fitBounds(pins, { padding: [40, 40], maxZoom: 12 });
  }

  // Leaflet のサイズ再計算（非表示→表示時に必要）
  setTimeout(() => mapInstance.invalidateSize(), 50);
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
  registerSW();
});
