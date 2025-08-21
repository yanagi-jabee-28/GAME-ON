# GAMA-pachinko

Matter.js を使ったパチンコ／ピンボール風の物理シミュレーションプロジェクトです。

概要
- Matter.js（物理エンジン）によりボールの重力、衝突、反発挙動を再現しています。
- プレイヤーはボールを発射してスコアや得点マスを狙います。

遊び方（ユーザー向け）
- 画面の「落下」ボタンでボールを発射します。
- 得点や演出は画面上に表示されます。

主要ファイル
- `index.html` — エントリページ（Canvas と UI）
- `src/js/config.js` — 物理パラメータ、初期配置などの設定
- `src/js/main.js`, `src/js/scene.js`, `src/js/objects.js`, `src/js/physics.js` — ゲームロジックと物理オブジェクト
- `src/js/audio.js` — 効果音（存在する場合）

ローカルでの実行方法

```powershell
# リポジトリのルートで実行
python -m http.server 8000
# ブラウザで http://localhost:8000/GAMA-pachinko-1/ を開く
```

開発メモ
- Matter.js のバージョンや CDN の読み込み順に依存するため、ライブラリの互換性に注意してください。
- 物理パラメータ（重力、摩擦、反発係数）を `src/js/config.js` で調整できます。
- パフォーマンス改善が必要な場合は、衝突処理やレンダラの更新頻度を見直してください。

ポータルに戻る: `../index.html`
