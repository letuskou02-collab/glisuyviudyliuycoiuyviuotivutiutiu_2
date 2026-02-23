'use strict';

// === 定数 ===
const MICHI_STORAGE_KEY = 'michinoeki_data';

// === 状態 ===
let michiData = [];       // [{id, name, pref, date, visited, stamp, memo, photos:[base64]}]
let michiCurrentView = 'home';
let michiFilter = 'all';
let michiSearchQuery = '';
let michiMap = null;
let michiMarkers = [];
let michiEditingId = null;

// === データ管理 ===
function michiLoad() {
  try {
    const raw = localStorage.getItem(MICHI_STORAGE_KEY);
    michiData = raw ? JSON.parse(raw) : [];
  } catch (e) { michiData = []; }
}
function michiSave() {
  localStorage.setItem(MICHI_STORAGE_KEY, JSON.stringify(michiData));
}
function michiGenId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// === ビュー切替 ===
function michiSwitchView(view) {
  michiCurrentView = view;
  document.querySelectorAll('#app-body .view-page').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.michi-tab-bar .tab-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  const page = document.getElementById('michi-view-' + view);
  if (page) page.style.display = 'block';

  if (view === 'home') michiRenderHome();
  if (view === 'list') michiRenderList();
  if (view === 'map') {
    requestAnimationFrame(() => requestAnimationFrame(() => michiInitMap()));
  }
}

// === ホーム ===
function michiRenderHome() {
  const visited = michiData.filter(d => d.visited);
  const stamps = michiData.filter(d => d.stamp);
  const photos = michiData.reduce((acc, d) => acc + (d.photos ? d.photos.length : 0), 0);
  document.getElementById('michi-stat-total').textContent = visited.length;
  document.getElementById('michi-stat-stamp').textContent = stamps.length;
  document.getElementById('michi-stat-photos').textContent = photos;

  // 最近の訪問（日付降順 上位5件）
  const recent = [...michiData]
    .filter(d => d.visited && d.date)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  const list = document.getElementById('michi-recent-list');
  if (recent.length === 0) {
    list.innerHTML = '<p class="michi-empty">まだ訪問記録がありません</p>';
    return;
  }
  list.innerHTML = recent.map(d => `
    <div class="michi-recent-item" data-id="${d.id}">
      <span class="michi-recent-icon">${d.stamp ? '📮' : '🏪'}</span>
      <div class="michi-recent-body">
        <div class="michi-recent-name">${escHtml(d.name)}</div>
        <div class="michi-recent-meta">${escHtml(d.pref || '')} ${d.date || ''}</div>
      </div>
    </div>
  `).join('');
  list.querySelectorAll('.michi-recent-item').forEach(el => {
    el.addEventListener('click', () => michiOpenModal(el.dataset.id));
  });
}

// === 一覧 ===
function michiRenderList() {
  const q = michiSearchQuery.trim().toLowerCase();
  let items = michiData.filter(d => {
    if (michiFilter === 'visited' && !d.visited) return false;
    if (michiFilter === 'unvisited' && d.visited) return false;
    if (q && !d.name.toLowerCase().includes(q) && !(d.pref || '').toLowerCase().includes(q)) return false;
    return true;
  });
  items.sort((a, b) => {
    if (a.pref !== b.pref) return (a.pref || '').localeCompare(b.pref || '', 'ja');
    return a.name.localeCompare(b.name, 'ja');
  });

  const container = document.getElementById('michi-list');
  if (items.length === 0) {
    container.innerHTML = '<p class="michi-empty">該当する道の駅がありません</p>';
    return;
  }
  container.innerHTML = items.map(d => `
    <div class="michi-card ${d.visited ? 'visited' : ''}" data-id="${d.id}">
      <div class="michi-card-left">
        <div class="michi-card-status">${d.visited ? (d.stamp ? '📮' : '✅') : '⬜'}</div>
      </div>
      <div class="michi-card-body">
        <div class="michi-card-name">${escHtml(d.name)}</div>
        <div class="michi-card-meta">
          ${d.pref ? `<span class="michi-tag">${escHtml(d.pref)}</span>` : ''}
          ${d.date ? `<span class="michi-date">${d.date}</span>` : ''}
        </div>
        ${d.memo ? `<div class="michi-card-memo">${escHtml(d.memo).substring(0, 40)}${d.memo.length > 40 ? '…' : ''}</div>` : ''}
      </div>
      ${d.photos && d.photos.length > 0 ? `<img class="michi-card-thumb" src="${d.photos[0]}" />` : ''}
    </div>
  `).join('');
  container.querySelectorAll('.michi-card').forEach(el => {
    el.addEventListener('click', () => michiOpenModal(el.dataset.id));
  });
}

// === 地図 ===
function michiInitMap() {
  const el = document.getElementById('michi-map');
  if (!el) return;
  if (!michiMap) {
    michiMap = L.map('michi-map', { zoomControl: true }).setView([36.5, 137.0], 5);
    L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
      attribution: '国土地理院',
      maxZoom: 18
    }).addTo(michiMap);
  }
  michiMap.invalidateSize();
  michiMarkers.forEach(m => m.remove());
  michiMarkers = [];

  const visited = michiData.filter(d => d.visited && d.lat && d.lng);
  visited.forEach(d => {
    const m = L.marker([d.lat, d.lng])
      .addTo(michiMap)
      .bindPopup(`<b>${escHtml(d.name)}</b><br>${d.pref || ''}`);
    michiMarkers.push(m);
  });
}

// === モーダル（登録・編集） ===
function michiOpenModal(id) {
  michiEditingId = id || null;
  const overlay = document.getElementById('michi-modal-overlay');
  const title = document.getElementById('michi-modal-title');
  const d = id ? michiData.find(x => x.id === id) : null;

  title.textContent = d ? '道の駅を編集' : '道の駅を登録';
  document.getElementById('michi-edit-id').value = id || '';
  document.getElementById('michi-name').value = d ? d.name : '';
  document.getElementById('michi-pref').value = d ? (d.pref || '') : '';
  document.getElementById('michi-date').value = d ? (d.date || '') : new Date().toISOString().slice(0, 10);
  document.getElementById('michi-visited').checked = d ? !!d.visited : true;
  document.getElementById('michi-stamp').checked = d ? !!d.stamp : false;
  document.getElementById('michi-memo').value = d ? (d.memo || '') : '';

  // 写真プレビュー
  const preview = document.getElementById('michi-photo-preview');
  const photos = d ? (d.photos || []) : [];
  michiRenderPhotoPreview(photos);
  document.getElementById('michi-photo-input').value = '';

  overlay.style.display = 'flex';
}

function michiCloseModal() {
  document.getElementById('michi-modal-overlay').style.display = 'none';
  michiEditingId = null;
}

function michiRenderPhotoPreview(photos) {
  const preview = document.getElementById('michi-photo-preview');
  preview.innerHTML = photos.map((src, i) => `
    <div class="michi-photo-wrap">
      <img src="${src}" class="michi-photo-thumb" />
      <button class="michi-photo-remove" data-idx="${i}">×</button>
    </div>
  `).join('');
  preview.querySelectorAll('.michi-photo-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      const id = document.getElementById('michi-edit-id').value;
      const d = id ? michiData.find(x => x.id === id) : null;
      const cur = d ? [...(d.photos || [])] : [];
      cur.splice(idx, 1);
      michiRenderPhotoPreview(cur);
      if (d) d.photos = cur;
    });
  });
}

function michiSaveModal() {
  const name = document.getElementById('michi-name').value.trim();
  if (!name) { alert('道の駅名を入力してください'); return; }

  const id = document.getElementById('michi-edit-id').value || michiGenId();
  const existing = michiData.find(x => x.id === id);

  // 写真（既存プレビューのsrc + 新規追加分）
  const previewImgs = [...document.querySelectorAll('#michi-photo-preview .michi-photo-thumb')].map(img => img.src);

  const entry = {
    id,
    name,
    pref: document.getElementById('michi-pref').value,
    date: document.getElementById('michi-date').value,
    visited: document.getElementById('michi-visited').checked,
    stamp: document.getElementById('michi-stamp').checked,
    memo: document.getElementById('michi-memo').value.trim(),
    photos: previewImgs,
    lat: existing ? existing.lat : null,
    lng: existing ? existing.lng : null,
  };

  if (existing) {
    Object.assign(existing, entry);
  } else {
    michiData.push(entry);
  }
  michiSave();
  michiCloseModal();
  if (michiCurrentView === 'home') michiRenderHome();
  if (michiCurrentView === 'list') michiRenderList();
}

// === 写真追加 ===
function michiHandlePhotoInput(files) {
  const preview = document.getElementById('michi-photo-preview');
  const current = [...preview.querySelectorAll('.michi-photo-thumb')].map(img => img.src);
  let remaining = 10 - current.length;
  if (remaining <= 0) return;
  [...files].slice(0, remaining).forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      current.push(e.target.result);
      michiRenderPhotoPreview(current);
    };
    reader.readAsDataURL(file);
  });
}

// === エクスポート ===
function michiExport() {
  const blob = new Blob([JSON.stringify(michiData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `michinoeki_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// === インポート ===
function michiImport() {
  document.getElementById('michi-import-file').click();
}
function michiHandleImport(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!Array.isArray(imported)) { alert('形式が正しくありません'); return; }
      if (!confirm(`${imported.length}件のデータをインポートします。既存データとマージしますか？`)) return;
      // IDをキーにマージ（インポート優先）
      const map = {};
      michiData.forEach(d => { map[d.id] = d; });
      imported.forEach(d => { map[d.id] = d; });
      michiData = Object.values(map);
      michiSave();
      michiRenderHome();
      if (michiCurrentView === 'list') michiRenderList();
      alert('インポートが完了しました');
    } catch (err) {
      alert('読み込みに失敗しました: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// === リセット ===
function michiReset() {
  if (!confirm('全ての道の駅記録を削除します。この操作は元に戻せません。')) return;
  michiData = [];
  michiSave();
  michiRenderHome();
  michiSwitchView('home');
}

// === ユーティリティ ===
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// === イベント設定 ===
document.addEventListener('DOMContentLoaded', () => {
  michiLoad();

  // タブ切り替え
  document.querySelectorAll('.michi-tab-bar .tab-item').forEach(btn => {
    btn.addEventListener('click', () => michiSwitchView(btn.dataset.view));
  });

  // FABボタン（新規追加）
  document.getElementById('michi-add-fab').addEventListener('click', () => michiOpenModal(null));

  // モーダル
  document.getElementById('michi-modal-cancel').addEventListener('click', michiCloseModal);
  document.getElementById('michi-modal-save').addEventListener('click', michiSaveModal);
  document.getElementById('michi-modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('michi-modal-overlay')) michiCloseModal();
  });

  // 写真入力
  document.getElementById('michi-photo-input').addEventListener('change', e => {
    michiHandlePhotoInput(e.target.files);
  });

  // フィルターボタン
  document.querySelectorAll('.michi-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.michi-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      michiFilter = btn.dataset.filter;
      michiRenderList();
    });
  });

  // 検索
  document.getElementById('michi-search').addEventListener('input', e => {
    michiSearchQuery = e.target.value;
    michiRenderList();
  });

  // エクスポート・インポート
  document.getElementById('michi-btn-export').addEventListener('click', michiExport);
  document.getElementById('michi-btn-import').addEventListener('click', michiImport);
  document.getElementById('michi-import-file').addEventListener('change', e => {
    if (e.target.files[0]) michiHandleImport(e.target.files[0]);
  });

  // リセット
  document.getElementById('michi-btn-reset').addEventListener('click', michiReset);

  // 国道ステッカーへ切り替え
  document.getElementById('michi-btn-switch-kokudo').addEventListener('click', () => {
    location.href = './index.html';
  });

  // 初期表示
  michiSwitchView('home');
});
