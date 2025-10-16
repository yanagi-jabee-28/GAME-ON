// 敵データ管理システムのテスト例
// ブラウザのコンソールで以下のコマンドを実行できます

/*
// 敵データを取得
import { getEnemyData, getAllEnemyData, damageEnemy, healEnemy } from './game.ts';

// 特定の敵のデータを取得
const skull = getEnemyData('skull');
console.log('がいこつのHP:', skull?.currentHp, '/', skull?.maxHp);

// すべての敵データを取得
const allEnemies = getAllEnemyData();
console.log('全敵データ:', allEnemies);

// 敵にダメージを与える
damageEnemy('skull', 10);
console.log('ダメージ後:', getEnemyData('skull'));

// 敵を回復
healEnemy('skull', 5);
console.log('回復後:', getEnemyData('skull'));

// 敵を倒す
damageEnemy('skull', 100);
// => コンソールに "enemy:defeated" イベントが発火されます
*/

/**
 * 使用例：
 * 
 * 1. 敵データの取得
 *    const enemyData = getEnemyData('skull');
 *    console.log(enemyData.currentHp, enemyData.maxHp);
 * 
 * 2. ダメージ処理
 *    damageEnemy('skull', 10);
 * 
 * 3. 回復処理
 *    healEnemy('skull', 5);
 * 
 * 4. 敵が倒された時のイベント
 *    document.addEventListener('enemy:defeated', (e) => {
 *      console.log(`${e.detail.name}を倒した！`);
 *    });
 * 
 * 5. 将来の拡張
 *    - config.tsで敵のパラメータを調整
 *    - 攻撃パターンを追加してエンティティ生成に反映
 *    - UIでHPバーを表示
 */
