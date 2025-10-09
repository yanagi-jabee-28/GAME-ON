# Number-BATTLE-3 (Chopsticks)

ブラウザ向けの指ゲーム「Chopsticks」の実装です。Tailwind CSS を用いた UI と、テーブルベースを参照する CPU を備えています。本リファクタリングではモジュール境界を整理し、状態管理・AI・UI を疎結合にしました。

## 主な特徴


- **テーブルベース AI**: `ts/ai.ts` が JSON テーブルベースを非同期ロードし、CPU 強度に応じた手を選択します。
- **状態管理ユーティリティ**: `ts/game.ts` がゲーム状態のスナップショット、シミュレーション、Undo 履歴などを一元管理します。
- **UI レイヤーの分離**: `ts/ui.ts` は DOM 更新とアニメーションのみを担当し、ゲーム状態は呼び出し元から渡されます。
- **デバッグ支援**: `ts/debug.ts` を有効にすると AI ターンの手動操作が可能です。
## 構成イメージ

```
Number-BATTLE-3/
├── index.html                # 画面の土台
├── css/style.css             # Tailwind の補助スタイル
├── ts/                      # TypeScript ソース（開発用）
│   ├── game.ts              # ゲーム状態・合法手生成・シミュレーション
│   ├── ai.ts                # テーブルベース AI とヒント計算
│   ├── ui.ts                # DOM 更新・アニメーション
│   ├── main.ts              # イベント束ねとターン管理 (エントリーポイント)
│   └── debug.ts             # AI 手動操作モード（開発用）
└── chopsticks-tablebase.json # テーブルベースデータ
```

## 起動方法

1. 任意のローカル HTTP サーバー（`npx serve`, `python -m http.server` など）でルートをホストします。
2. ブラウザで `Number-BATTLE-3/index.html` にアクセスします。

> ⚠️ ファイルを `file://` で直接開くと、テーブルベース JSON のフェッチがブロックされる場合があります。必ず HTTP サーバー経由でアクセスしてください。

## 主な操作

- **先攻 / 後攻**: 画面上部のセレクトボックスで切替可能。
- **CPU 強度**: `最強 / 強い / 弱い / 最弱` から選べます。`config.ts` の `FORCE_CPU_STRENGTH` を設定すると UI 無視で固定できます。
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

- `ts/game.ts` の `getSnapshot` / `simulateMove` を使うと副作用なしに状態を検査できます。
- `ts/ai.ts` の `getPlayerMovesAnalysis` はヒント表示のほか、デバッグコンソールからの局面検証にも便利です。
- テーブルベースを更新する場合は `generate-tablebase.js` を参照してください。

### すぐに動かす（開発用）

このリポジトリでは TypeScript ソースを `ts/` に置いています。開発中は Vite を使うと便利です。

1. ルートで依存をインストールします（既にやっている場合は不要）：

```bash
npm install
```

2. 開発サーバを起動します（プロジェクトルートで実行）：

```bash
npm run dev
```

3. ブラウザで http://localhost:5173/Number-BATTLE-3/ を開くと、Vite が TypeScript を自動でバンドルしてくれます。

注意: 直接 `file://` で開く場合や Vite を使わない場合、`index.html` が `ts/` のままでは動かないので、事前に TypeScript をトランスパイルして `js/` に出力するか、Vite のようなバンドラを使って下さい。

### generate-tablebase の実行について

`generate-tablebase.js` は局面テーブルを生成するための Node スクリプトです。リポジトリ内のゲームロジックは TypeScript に移行しているため、直接 `ts/` を import している場合は次のいずれかの方法で実行してください。

- ts-node を使う（手軽。事前にインストールが必要）:

```bash
npx ts-node Number-BATTLE-3/generate-tablebase.js
```

- あるいは先に TypeScript をトランスパイルしてから Node で実行する:

```bash
# プロジェクトルートで
npx tsc
node Number-BATTLE-3/generate-tablebase.js
```

上記どちらかを選べば、スクリプト内で `ts/` のモジュールを利用してテーブルを生成できます。

---
何か不具合や改善アイデアがあれば issue やコメントで共有してください。

http://127.0.0.1:5500/Number-BATTLE-3/index.html?showHints=true&showCpuStrength=true&showAiManual=false&CPU_STRENGTH=normal&hints=1&hintMode=full