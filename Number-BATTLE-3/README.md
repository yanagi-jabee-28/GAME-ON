# Number-BATTLE-3 (Chopsticks)

ブラウザ向けの指ゲーム「Chopsticks」の実装です。Tailwind CSS を用いた UI と、テーブルベースを参照する CPU を備えています。本リファクタリングではモジュール境界を整理し、状態管理・AI・UI を疎結合にしました。

## 主な特徴

- **テーブルベース AI**: `js/ai.js` が JSON テーブルベースを非同期ロードし、CPU 強度に応じた手を選択します。
- **状態管理ユーティリティ**: `js/game.js` がゲーム状態のスナップショット、シミュレーション、Undo 履歴などを一元管理します。
- **UI レイヤーの分離**: `js/ui.js` は DOM 更新とアニメーションのみを担当し、ゲーム状態は呼び出し元から渡されます。
- **ヒント表示**: テーブルベースに基づくプレイヤーの最善手分析と、選択中の手に合わせたハイライトを提供します。
- **デバッグ支援**: `js/debug.js` を有効にすると AI ターンの手動操作が可能です。

## 構成イメージ

```
Number-BATTLE-3/
├── index.html           # 画面の土台
├── css/style.css        # Tailwind の補助スタイル
├── js/
│   ├── game.js          # ゲーム状態・合法手生成・シミュレーション
│   ├── ai.js            # テーブルベース AI とヒント計算
│   ├── ui.js            # DOM 更新・アニメーション
│   ├── main.js          # イベント束ねとターン管理
│   └── debug.js         # AI 手動操作モード
└── chopsticks-tablebase.json # テーブルベースデータ
```

## 起動方法

1. 任意のローカル HTTP サーバー（`npx serve`, `python -m http.server` など）でルートをホストします。
2. ブラウザで `Number-BATTLE-3/index.html` にアクセスします。

> ⚠️ ファイルを `file://` で直接開くと、テーブルベース JSON のフェッチがブロックされる場合があります。必ず HTTP サーバー経由でアクセスしてください。

## 主な操作

- **先攻 / 後攻**: 画面上部のセレクトボックスで切替可能。
- **CPU 強度**: `最強 / 強い / 弱い / 最弱` から選べます。`config.js` の `FORCE_CPU_STRENGTH` を設定すると UI 無視で固定できます。
- **ヒント**: チェックボックスとドロップダウンでオン/オフと表示粒度を調整。
- **分配 (スプリット)**: ボタンからモーダルを開き、合計本数を崩さない別配置を選択。
- **戻す**: 2 手分まで Undo 可能。

## URL パラメータによる設定

`index.html?showHints=false&defaultStrength=normal` のようにクエリで機能を制御できます。

| パラメータ名                                    | 型      | 説明                                                               |
| ----------------------------------------------- | ------- | ------------------------------------------------------------------ |
| `showHints`                                     | boolean | ヒント UI の表示/非表示                                            |
| `showCpuStrength`                               | boolean | CPU 強度セレクトの表示                                             |
| `showAiManual`                                  | boolean | AI 手動操作トグルの表示                                            |
| `defaultStrength`                               | string  | CPU の初期強度 (`hard`, `normal`, `weak`, `weakest`)               |
| `CPU_STRENGTH` / `cpuStrength` / `cpu_strength` | string  | `defaultStrength` の別名                                           |
| `forceStrength`                                 | string  | 指定すると UI と無関係に CPU 強度を固定 (例: `forceStrength=hard`) |

## 開発時のヒント

- `js/game.js` の `getSnapshot` / `simulateMove` を使うと副作用なしに状態を検査できます。
- `js/ai.js` の `getPlayerMovesAnalysis` はヒント表示のほか、デバッグコンソールからの局面検証にも便利です。
- テーブルベースを更新する場合は `generate-tablebase.js` を参照してください。

---
何か不具合や改善アイデアがあれば issue やコメントで共有してください。

http://127.0.0.1:5500/Number-BATTLE-3/index.html?showHints=false&showCpuStrength=true&showAiManual=false&CPU_STRENGTH=normal