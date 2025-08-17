/**
 * @file controls.js
 * @brief UI要素（ボタン）のイベントリスナーを設定し、シミュレーションの制御を行うファイルです。
 *
 * シミュレーションの再生、停止、リセット、カメラ視点のリセット機能を提供します。
 * ボールの初期位置はconfig.jsで定義された値と同期されます。
 */

import { initialCameraPos, initialTarget } from './scene.js';
import { OBJECT_DEFINITIONS } from './config.js'; // config.jsからオブジェクト定義をインポート
import * as CANNON from 'cannon-es'; // CANNON.Vec3を使用するためインポート

// シミュレーションの状態を管理するフラグ
export let isPaused = false;

/**
 * UIコントロールのイベントリスナーをセットアップします。
 *
 * @param {THREE.PerspectiveCamera} camera - 操作対象のThree.jsカメラ。
 * @param {OrbitControls} controls - 操作対象のOrbitControlsインスタンス。
 * @param {CANNON.Body} sphereBody - 操作対象のボールのCANNON.js物理ボディ。
 * @param {Array} objectsToUpdate - アニメーションループで更新されるオブジェクトのリスト。
 */
export function setupEventListeners(camera, controls, sphereBody, objectsToUpdate) {
    // DOM要素の取得
    const playBtn = document.getElementById('playBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const resetBtn = document.getElementById('resetBtn');
    const resetViewBtn = document.getElementById('resetViewBtn');
    // launchButtonは現在未使用ですが、将来のためにIDを保持しています。
    // const launchButton = document.getElementById('launchButton');

    // config.jsからボールの初期位置定義を取得します。
    // OBJECT_DEFINITIONSリストからtypeが'ball'のオブジェクト定義を検索します。
    const ballDefinition = OBJECT_DEFINITIONS.find(def => def.type === 'ball');
    // ボールの初期位置が見つからない場合は、安全のためデフォルト値(0,0,0)を使用します。
    const initialBallPos = ballDefinition ? ballDefinition.properties.initialPos : new CANNON.Vec3(0, 0, 0);

    // 再生ボタンのイベントリスナー
    // クリックするとシミュレーションを再開します。
    playBtn.addEventListener('click', () => {
        isPaused = false;
    });

    // 停止ボタンのイベントリスナー
    // クリックするとシミュレーションを一時停止します。
    pauseBtn.addEventListener('click', () => {
        isPaused = true;
    });

    // リセットボタンのイベントリスナー
    // クリックするとシミュレーションを一時停止し、すべての物理オブジェクトを初期状態に戻します。
    resetBtn.addEventListener('click', () => {
        isPaused = true; // シミュレーションを一時停止

        // objectsToUpdateリスト内のすべての物理オブジェクトをリセットします。
        // このリストには、ボールのような動的なオブジェクトが含まれます。
        for (const obj of objectsToUpdate) {
            const { body, mesh } = obj;

            // 物理ボディの状態を初期化します。
            // 速度と角速度をゼロに設定し、動きを止めます。
            body.velocity.set(0, 0, 0);
            body.angularVelocity.set(0, 0, 0);
            // ボールの初期位置にリセットします。
            // config.jsで定義されたinitialBallPosを使用することで、一貫性を保ちます。
            body.position.copy(initialBallPos); 
            body.quaternion.set(0, 0, 0, 1); // 回転をリセット

            // Three.jsメッシュの位置も物理ボディに即座に同期させます。
            // これにより、リセット時に視覚的な位置も即座に更新されます。
            mesh.position.copy(body.position);
            mesh.quaternion.copy(body.quaternion);
        }
    });

    // 視点リセットボタンのイベントリスナー
    // クリックするとカメラの視点を初期状態に戻します。
    resetViewBtn.addEventListener('click', () => {
        camera.position.copy(initialCameraPos); // カメラ位置を初期位置に
        controls.target.copy(initialTarget); // カメラのターゲットを初期ターゲットに
        controls.update(); // OrbitControlsを更新して変更を適用
    });
}
