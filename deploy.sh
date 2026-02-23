#!/bin/zsh
# デプロイスクリプト
# sw.js の __BUILD_DATE__ をデプロイ日時に置換してから git push する

BUILD_DATE=$(date +%Y%m%d%H%M%S)

# sw.js の BUILD_DATE を更新
sed -i '' "s/kokudo-sticker-[0-9_-]*/kokudo-sticker-${BUILD_DATE}/" sw.js

echo "✅ キャッシュバージョン: kokudo-sticker-${BUILD_DATE}"

git add sw.js
git commit -m "chore: deploy ${BUILD_DATE}" --allow-empty

git push

echo "🚀 デプロイ完了"
