# Novel-games

ノベル風の学生生活シミュレーションプロトタイプです。

このプロジェクトは次の特徴を持ちます。

- 日付・時間（午前／放課後／夜）で分かれたターン制
- メニュー（所持品、ステータス、履歴、セーブ／ロード）
- 店舗（購買／コンビニ／スーパー）での購入と所持アイテム管理
- 行動履歴の記録（訪問・購入・退店・選択・アイテム使用）

ローカルでの実行方法

1. リポジトリのルートで簡易HTTPサーバを立てる（Pythonが便利です）

```powershell
python -m http.server 8000
```

2. ブラウザで `http://localhost:8000/Novel-games/` を開く

PowerShell環境でnpm等を使う場合の例（任意）

```powershell
# 任意: Live Server 相当のツールを使う場合
# npx serve などを利用するなら Node.js をインストールしてから
npx serve -l 8000 .
```

主要ファイル

- `index.html` — エントリページ（ゲームUI）
- `css/style.css` — スタイル定義
- `js/config.js` — ゲーム設定／ラベル／ショップ一覧
- `js/items.js` — アイテム定義
- `js/gameManager.js` — ゲーム状態管理（ステータス、履歴、セーブ/ロード）
- `js/ui.js` — UI描画／メニュー処理
- `js/events.js` — 行動・ショップ・イベント処理
- `js/main.js` — 初期化と起動シーケンス
- `js/eventsData.js` — 定義済みイベント/ランダムイベント（データ、集約）

開発者向けメモ（イベントスキーマ）

- EventData 形式（簡易）
	- name?: 話者名
	- message?: 最初のメッセージ
	- changes?: 状態変化（基本は stats: { academic?, condition? }, money?, cp?, itemsAdd? など）
	- afterMessage?: 変化後のメッセージ
	- nextAction?: 次に実行するアクション（例: "showMainActions"）
- 旧仕様のキー（connections/mental/physical/condition トップレベルなど）はロジック側で互換処理されますが、可能な限り現仕様に合わせてください。
- ランダムイベントは `js/eventsData.js` に統合しました。

開発メモ

- 履歴は `gameManager.addHistory` によって記録され、メニューから閲覧できます。
- 通貨単位やラベルは `js/config.js` の `CONFIG.LABELS` で一元管理しています。表示文言を変更したい場合はここを編集してください。
- ショップのラインナップなどは `CONFIG.SHOPS` で拡張可能です。ランダムイベントは `js/eventsData.js` の `RANDOM_EVENTS` を編集してください。

今後の改良案

- 履歴UIのフィルタリング（店舗別／種類別）
- 店舗ごとの価格差や在庫管理の導入
- モバイル向けレイアウトの最適化

ポータルに戻る: `../index.html`

