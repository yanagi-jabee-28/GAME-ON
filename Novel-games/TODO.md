# Novel-games プロジェクト TODOリスト

このファイルは、ゲーム開発における今後のタスクをまとめたものです。

## 1. ランダムイベント関連

- [ ] **`gameManager.js` の `checkAndTriggerRandomEvent` メソッドの完成**
  - `GameEventManager.handleRandomEvent` を呼び出す処理を実装する。
  - ランダムイベントの発生確率を考慮したロジックを実装する。
    - `RANDOM_EVENTS` の `conditions` に `status` 以外の条件（例: 過去の行動履歴）を追加する。
    - `gameManager.addHistory` で記録された詳細な履歴データを利用して、イベントの発生確率を動的に計算する。
      - 特定の行動（例: 「内職して勉強する」）の回数や、アイテム使用履歴などが確率に影響するようにする。

- [ ] **`events.js` の `handleRandomEvent` メソッドの完成**
  - 選択肢がないランダムイベントの場合に、直接結果を適用するロジックを実装する。

- [ ] **ランダムイベントの条件拡張**
  - `randomEvents.js` に定義されているイベントの条件を、より詳細に実装する。
    - `SOLDER_CHALLENGE` イベントの「実験・実習のある日」という条件を、ゲーム内の日付やイベントフラグと連携させて実装する。
    - `MIDNIGHT_RAMEN` イベントの `conditions.status` のようなステータス条件を `checkAndTriggerRandomEvent` で適切に評価し、イベント発生に反映させる。

## 2. ゲームシステム関連

- [ ] **初期設定診断のイベント開始**
  - `events.js` の `startGame` メソッド内で、ゲーム開始時の初期設定診断イベントを開始する処理を実装する。

- [ ] **`executeAction` の `nextAction` の種類拡張**
  - `events.js` の `executeAction` メソッドにおいて、`showMainActions` 以外の `nextAction` の種類（例: 特定のシナリオイベントへ遷移、ゲーム終了など）を考慮し、実装する。

## 3. ステータス・データ関連

- [ ] **ステータス定義の拡張**
  - `config.js` において、`condition` に一本化されたステータスの内部パラメータ（`physical` や `mental` など）を再導入するかどうか検討し、必要であれば実装する。
    - これにより、より詳細なステータス管理と、それに基づくイベントや行動の結果の多様化が可能になる。

## 4. その他

- [ ] **既存の `TODO` コメントの確認と対応**
  - プロジェクト内の他のファイルに存在する `TODO` コメントを改めて確認し、このリストに統合するか、個別に解決する。