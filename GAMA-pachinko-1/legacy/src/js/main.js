/**
 * @file main.js
 * @brief アプリケーションのエントリーポイントであり、メインループを管理するファイルです。
 *
 * Three.jsとCANNON.jsの初期化、オブジェクトの生成、UIイベントリスナーの設定、
 * そして物理シミュレーションと3D描画を同期させるアニメーションループを実行します。
 *
 * 主な役割：
 * - 必要なモジュールのインポート
 * - シーン、カメラ、レンダラー、物理ワールドの初期化
 * - config.jsで定義されたオブジェクトの生成
 * - UIコントロール（再生、停止、リセット）のセットアップ
 * - 物理シミュレーションのステップと3Dオブジェクトの更新
 * - シーンのレンダリング
 */

import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// 各モジュールのコア要素をインポート
import { scene, camera, renderer, controls } from './scene.js'; // 3Dシーン関連
import { world, objectsToUpdate } from './physics.js'; // 物理ワールド関連
import { setupEventListeners, isPaused } from './controls.js'; // UIコントロール関連
import { createObject } from './objects.js'; // オブジェクト生成ロジック
import { OBJECT_DEFINITIONS } from './config.js'; // オブジェクト定義リスト

//==================================================
// 初期化処理
//==================================================

/**
 * シーン内のすべてのオブジェクトを生成し、初期設定を行います。
 * config.jsのOBJECT_DEFINITIONSに基づいてオブジェクトを動的に作成します。
 */
const createdObjects = {}; // 生成されたオブジェクトをタイプ名で格納するマップ

OBJECT_DEFINITIONS.forEach(objDef => {
    const obj = createObject(objDef); // objects.jsのcreateObject関数を呼び出し
    if (obj) {
        createdObjects[objDef.type] = obj; // 生成されたオブジェクトをマップに保存
    }
});

/**
 * UIイベントリスナーをセットアップします。
 * ボールオブジェクトの物理ボディと、更新対象のオブジェクトリストを渡します。
 */
setupEventListeners(camera, controls, createdObjects.ball.body, objectsToUpdate);

//==================================================
// アニメーションループ
//==================================================
const clock = new THREE.Clock(); // 時間管理のためのThree.jsのClock
let oldElapsedTime = 0; // 前回のフレームからの経過時間を計算するために使用

/**
 * アニメーションループ関数です。
 * requestAnimationFrameによって毎フレーム呼び出されます。
 * 物理シミュレーションの更新、3Dオブジェクトの位置同期、レンダリングを行います。
 */
function animate() {
    requestAnimationFrame(animate); // 次のフレームを要求

    const elapsedTime = clock.getElapsedTime(); // アプリケーション開始からの経過時間
    const deltaTime = elapsedTime - oldElapsedTime; // 前のフレームからの経過時間
    oldElapsedTime = elapsedTime;

    // 物理ワールドの計算を進める（シミュレーションが停止中でない場合）
    if (!isPaused) {
        // world.step(固定タイムステップ, デルタタイム, 最大サブステップ数)
        // 固定タイムステップ: 物理計算の精度を保つための固定時間間隔 (例: 1/60秒)
        // デルタタイム: 実際のフレーム間の時間
        // 最大サブステップ数: デルタタイムが固定タイムステップより大きい場合に、物理計算を分割して実行する最大回数
        world.step(1 / 60, deltaTime, 3);
    }

    // Three.jsのオブジェクトを物理ボディに同期
    // objectsToUpdateリスト内の各オブジェクトについて、物理ボディの位置と回転を3Dメッシュにコピーします。
    for (const obj of objectsToUpdate) {
        // meshがnullでないことを確認（例: 床はmeshがnull）
        if (obj.mesh) {
            obj.mesh.position.copy(obj.body.position);
            obj.mesh.quaternion.copy(obj.body.quaternion);
        }
    }

    // カメラコントロールの更新
    // OrbitControlsがカメラの位置やターゲットを更新するために必要です。
    controls.update();

    // シーンのレンダリング
    // 更新された3Dオブジェクトとカメラの設定でシーンを描画します。
    renderer.render(scene, camera);
}

// アニメーションループを開始
animate();