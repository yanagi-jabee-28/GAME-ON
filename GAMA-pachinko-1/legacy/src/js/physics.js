/**
 * @file physics.js
 * @brief 物理シミュレーションのワールド設定と、物理オブジェクトの管理を行うファイルです。
 *
 * CANNON.jsを使用して物理ワールドを初期化し、重力やスリープ設定、
 * そして異なる物理マテリアル間の相互作用（摩擦、反発）を定義します。
 *
 * 主な役割：
 * - 物理ワールド（world）の初期化と設定
 * - 更新が必要な物理オブジェクトのリスト（objectsToUpdate）の管理
 * - 物理マテリアル間の接触設定（ContactMaterial）
 */

import * as CANNON from 'cannon-es';
// 必要なマテリアル設定のみインポート
import {
    SPHERE_MATERIAL_CANNON,
    GROUND_MATERIAL_CANNON,
} from './config.js';

// 物理ワールドの初期化
export const world = new CANNON.World();
world.gravity.set(0, -9.82, 0); // 重力設定（Y軸負の方向）
world.allowSleep = true; // パフォーマンス向上のため、静止したオブジェクトのスリープを許可

// 更新が必要な物理オブジェクトのリスト
// このリストには、アニメーションループ（main.js）で位置と回転を同期する必要がある
// 物理ボディと3Dメッシュのペアが格納されます。
// オブジェクトはobjects.jsのcreateObject関数でこのリストに追加されます。
export const objectsToUpdate = [];

// 物理マテリアル間の相互作用を定義します
// ボール（SPHERE_MATERIAL_CANNON）と地面（GROUND_MATERIAL_CANNON）が接触した際の挙動を設定します。
const sphereGroundContactMaterial = new CANNON.ContactMaterial(
    SPHERE_MATERIAL_CANNON,
    GROUND_MATERIAL_CANNON,
    {
        friction: 0.3,    // 摩擦係数：接触面間の滑りにくさ
        restitution: 0.4, // 反発係数：衝突時の跳ね返り具合
    }
);
// 定義した相互作用を物理ワールドに追加します
world.addContactMaterial(sphereGroundContactMaterial);
