# 🛣 国道ステッカーコレクション

日本の一般国道（1号〜507号）のステッカー取得状況を記録するPWAアプリです。

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live-brightgreen)](https://YOUR_USERNAME.github.io/kokudo-sticker-pwa/)

## ✨ 機能

- 📋 **約260路線を網羅** — 一桁・二桁・三桁国道すべてをカバー
- ✅ **取得状況の記録** — 取得済み/未取得を管理
- 📝 **メモ機能** — 撮影場所や取得日のメモ
- 🗂 **地方別フィルタ** — 北海道〜沖縄の10地方で絞り込み
- 🔍 **検索機能** — 号数・地方名・区間で検索
- 📊 **進捗バー** — 地方別・全体の取得率を可視化
- 📱 **PWA対応** — ホーム画面に追加、オフライン動作
- 💾 **データ管理** — JSON形式でエクスポート/インポート

## 📸 スクリーンショット

> *(スクリーンショットをここに追加)*

## 🚀 使い方

### ブラウザで開く

[GitHub Pages のライブデモ](https://YOUR_USERNAME.github.io/kokudo-sticker-pwa/) を開くだけで使えます。

### ローカルで実行

```bash
git clone https://github.com/YOUR_USERNAME/kokudo-sticker-pwa.git
cd kokudo-sticker-pwa
python3 -m http.server 3456
# → http://localhost:3456 をブラウザで開く
```

### スマートフォンにインストール（PWA）

1. スマートフォンのブラウザでサイトを開く
2. 「ホーム画面に追加」をタップ
3. アプリとして利用可能

## 🛠 技術スタック

- **フロントエンド**: HTML5 / CSS3 / JavaScript (Vanilla)
- **PWA**: Web App Manifest + Service Worker（Cache First戦略）
- **データ永続化**: localStorage
- **CI/CD**: GitHub Actions → GitHub Pages

## 📁 ファイル構成

```
kokudo-sticker-pwa/
├── index.html          # メインHTML
├── style.css           # スタイルシート
├── app.js              # アプリケーションロジック
├── sw.js               # Service Worker
├── manifest.json       # PWAマニフェスト
├── data/
│   └── routes.js       # 国道データ（約260路線）
├── icons/
│   ├── icon.svg
│   ├── icon-192.png
│   └── icon-512.png
└── .github/
    └── workflows/
        └── deploy.yml  # GitHub Actions
```

## 🤝 コントリビュート

バグ報告・機能提案は [Issues](https://github.com/YOUR_USERNAME/kokudo-sticker-pwa/issues) へどうぞ。

## 📄 ライセンス

MIT License
