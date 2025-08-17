/**
 * @file scene.js
 * @brief Three.jsのシーン、カメラ、レンダラー、ライト、カメラコントロールの設定を行うファイルです。
 *
 * 3D空間の基本的な構成要素を初期化し、ウィンドウのリサイズイベントにも対応します。
 * また、床の視覚的な表現としてGridHelperを追加します。
 *
 * 主な役割：
 * - シーン（scene）の初期化
 * - カメラ（camera）の初期化と設定
 * - レンダラー（renderer）の初期化と設定
 * - カメラコントロール（OrbitControls）の初期化と設定
 * - ライトの追加
 * - ウィンドウリサイズイベントへの対応
 * - 床のGridHelperの追加
 */

import * as THREE from 'three';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { FRUSTUM_SIZE, FLOOR_POS } from './config.js'; // config.jsから必要な定数をインポート

// シーンの初期化
export const scene = new THREE.Scene();

// カメラの初期化
// OrthographicCameraを使用しており、FRUSTUM_SIZEに基づいて視錐台のサイズを決定します。
const aspect = window.innerWidth / window.innerHeight;
export const camera = new THREE.OrthographicCamera(FRUSTUM_SIZE * aspect / -2, FRUSTUM_SIZE * aspect / 2, FRUSTUM_SIZE / 2, FRUSTUM_SIZE / -2, 0.1, 1000);
// 坂や床全体が見やすいようにカメラの初期位置を調整
camera.position.set(0, 10, 25);
camera.lookAt(0, 0, 0); // シーンの中心を見るように設定

// レンダラーの初期化
// HTMLのcanvas要素（id="myCanvas"）に描画します。アンチエイリアスを有効にしています。
export const renderer = new THREE.WebGLRenderer({
    canvas: document.querySelector('#myCanvas'),
    antialias: true
});
renderer.setSize(window.innerWidth, window.innerHeight); // レンダラーのサイズをウィンドウに合わせる
renderer.setPixelRatio(window.devicePixelRatio); // デバイスのピクセル比を設定し、高解像度ディスプレイに対応

// カメラコントロールの初期化
// OrbitControlsはマウス操作でカメラを回転、ズーム、パンできるようにします。
export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // カメラの動きに慣性を加える
controls.dampingFactor = 0.07; // 慣性の強さ
controls.enablePan = true; // カメラのパン（平行移動）を許可
controls.target.set(0, 0, 0); // カメラが常にシーンの中心を見るように設定

// 初期視点の保存
// リセットボタンなどでカメラの視点を初期状態に戻すために使用します。
export const initialCameraPos = camera.position.clone();
export const initialTarget = controls.target.clone();

// ライトの追加
// AmbientLightはシーン全体を均一に照らし、DirectionalLightは特定方向からの光をシミュレートします。
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // 全体的な環境光
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8); // 特定方向からの平行光
directionalLight.position.set(30, 10, 0); // ライトの位置
scene.add(directionalLight);

// 床のグリッドヘルパーを追加
// 物理的な床はCANNON.Planeで無限ですが、視覚的に無限に見せるために大きなグリッドを表示します。
const floorGridHelper = new THREE.GridHelper(1000, 100); // サイズ1000x1000、100分割のグリッド
floorGridHelper.position.y = FLOOR_POS.y; // config.jsで定義した床のY座標に合わせる
scene.add(floorGridHelper);

// ウィンドウリサイズ処理
// ウィンドウのサイズが変更された際に、カメラのアスペクト比とレンダラーのサイズを更新します。
window.addEventListener('resize', () => {
    const aspect = window.innerWidth / window.innerHeight;
    camera.left = FRUSTUM_SIZE * aspect / -2;
    camera.right = FRUSTUM_SIZE * aspect / 2;
    camera.top = FRUSTUM_SIZE / 2;
    camera.bottom = FRUSTUM_SIZE / -2;
    camera.updateProjectionMatrix(); // プロジェクション行列を更新
    renderer.setSize(window.innerWidth, window.innerHeight); // レンダラーのサイズを更新
});
