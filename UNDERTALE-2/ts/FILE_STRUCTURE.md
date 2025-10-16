# ファイル構成の説明

## constants.ts と config.ts の違い

このプロジェクトでは、設定値を**システム定数**と**ゲームバランス設定**に明確に分離しています。

### 📐 constants.ts - システム定数
**変更頻度：低** | **対象：技術的パラメータ**

以下のような、ゲームシステムの基盤となる定数を管理します：

- **UI関連**
  - フォントサイズ（`PLAYER_OVERLAY_FONT_SIZE`, `HEART_SIZE`など）
  - 画面サイズ（`PLAYFIELD_INITIAL_WIDTH`, `PLAYFIELD_MAX_WIDTH`など）
  
- **キーバインディング**
  - `KEY_BINDINGS`：すべての操作キーの定義
  - ヘルパー関数（`isConfirmKey()`, `isMoveUpKey()`など）
  
- **技術的パラメータ**
  - エンティティの削除マージン
  - フェード時間
  - アニメーション設定

```typescript
// 例：UI設定
export const PLAYER_OVERLAY_FONT_SIZE = "1.5rem";
export const HEART_SIZE = "30px";

// 例：キーバインディング
export const KEY_BINDINGS = {
  CONFIRM: ["z", "Enter"],
  CANCEL: ["x", "Escape"],
  // ...
};
```

### 🎮 config.ts - ゲームバランス設定
**変更頻度：高** | **対象：ゲームデザイン値**

以下のような、ゲームの難易度やバランスに関わる設定を管理します：

- **プレイヤー設定**
  - `PLAYER_CONFIG`：HP、移動速度、無敵時間など
  - `PLAYER_VISUAL_CONFIG`：視覚効果、色パレット
  
- **敵設定**
  - `ENEMY_DATA_PRESETS`：各敵のHP、攻撃力、防御力
  - `ATTACK_PATTERNS`：攻撃パターンの定義
  
- **戦闘設定**
  - `COMBAT_CONFIG`：戦闘時間、攻撃バー速度
  - `ENTITY_CONFIG`：弾幕のダメージ、寿命、追尾力

```typescript
// 例：プレイヤー設定
export const PLAYER_CONFIG = {
  name: "CHARA",
  level: 1,
  maxHp: 20,
  currentHp: 20,
  speed: 180,
  invincibilityMs: 250,
};

// 例：敵設定
export const ENEMY_DATA_PRESETS = {
  skull: {
    id: "skull",
    name: "がいこつ",
    maxHp: 30,
    attack: 5,
    defense: 0,
  },
  // ...
};

// 例：戦闘設定
export const COMBAT_CONFIG = {
  durationMs: 10000,
  attackBarDurationMs: 1000,
};
```

## 使い分けのガイドライン

### constants.ts に追加すべき値
- ✅ UI要素のサイズやフォント
- ✅ キーボード操作の設定
- ✅ 画面サイズの制限
- ✅ デバッグ用の設定
- ✅ 技術的な閾値やマージン

### config.ts に追加すべき値
- ✅ キャラクターのステータス（HP、攻撃力など）
- ✅ 敵のデータ
- ✅ ダメージ量
- ✅ 戦闘時間
- ✅ ゲームバランスに影響する数値

## 後方互換性

既存のコードとの互換性を保つため、`constants.ts`では`config.ts`の値を再エクスポートしています：

```typescript
// constants.ts内
export const SPEED = PLAYER_CONFIG.speed; // @deprecated
export const ENTITY_DAMAGE = ENTITY_CONFIG.damage; // @deprecated
```

新しいコードでは、直接`config.ts`からインポートすることを推奨します：

```typescript
// 推奨される方法
import { PLAYER_CONFIG, ENTITY_CONFIG } from "./config.ts";
const speed = PLAYER_CONFIG.speed;
const damage = ENTITY_CONFIG.damage;
```

## ゲームバランスの調整方法

ゲームの難易度を変更する場合、`config.ts`を編集してください：

```typescript
// config.ts

// プレイヤーを強化する例
export const PLAYER_CONFIG = {
  maxHp: 30,      // 20 → 30 に増加
  speed: 220,     // 180 → 220 に高速化
  // ...
};

// 敵を弱体化する例
export const ENEMY_DATA_PRESETS = {
  skull: {
    maxHp: 20,    // 30 → 20 に減少
    attack: 3,    // 5 → 3 に減少
    // ...
  },
};

// 戦闘時間を短縮する例
export const COMBAT_CONFIG = {
  durationMs: 7000,  // 10000 → 7000 に短縮
};
```

これにより、システムコードを変更せずにゲームバランスを調整できます。
