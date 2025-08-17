/**
 * @file config.js
 * @brief アプリケーション全体の定数と設定を定義するファイルです。
 *
 * カメラ設定、物理マテリアル、ボール、坂、床などのオブジェクトの初期プロパティ、
 * そして生成するオブジェクトの定義リスト（OBJECT_DEFINITIONS）を管理します。
 * 各オブジェクトのプロパティは、このファイルで一元的に設定・調整可能です。
 */

import * as CANNON from 'cannon-es';

// カメラ設定
export const FRUSTUM_SIZE = 30; // 坂全体が見えるように調整

// 物理マテリアル
// ボールと地面（坂、床）の物理的な相互作用を定義するために使用されます。
export const SPHERE_MATERIAL_CANNON = new CANNON.Material('sphere');
export const GROUND_MATERIAL_CANNON = new CANNON.Material('ground');

// ボールの設定
export const SPHERE_RADIUS = 0.5; // ボールの半径

// 坂の設定
export const SLOPE_ANGLE = -80; // 坂の傾斜角度（度）。X軸周りの回転角度。-80に変更
export const SLOPE_WIDTH = 20; // 坂の幅（X軸方向）
export const SLOPE_HEIGHT = 1; // 坂の厚み（Y軸方向）
export const SLOPE_DEPTH = 20; // 坂の奥行き（Z軸方向）
// 坂の中心位置（X, Y, Z座標）。
// Yを負にして全体を下げ、ボールが確実に接触・転がるように初期配置を調整。
export const SLOPE_POS = new CANNON.Vec3(-0, -20, 1);

// 床の設定
export const FLOOR_POS = new CANNON.Vec3(0, -5, 0); // 床の中心位置（X, Y, Z座標）。CANNON.Planeで使用。

/**
 * @property {Array<Object>} OBJECT_DEFINITIONS - シーンに生成するオブジェクトの定義リストです。
 * 各オブジェクトは 'type' と 'properties' を持ちます。
 * 'type' はオブジェクトの種類（'ball', 'slope', 'floor'など）を識別します。
 * 'properties' はそのオブジェクト固有の設定（サイズ、位置、色、物理マテリアルなど）を含みます。
 *
 * 新しいオブジェクトを追加したり、既存のオブジェクトのプロパティを変更したりする場合は、
 * このリストを編集することで、main.jsやobjects.jsのコードを変更することなく調整可能です。
 */
export const OBJECT_DEFINITIONS = [
    {
        type: 'slope',
        properties: {
            angle: SLOPE_ANGLE,
            width: SLOPE_WIDTH,
            height: SLOPE_HEIGHT,
            depth: SLOPE_DEPTH,
            pos: SLOPE_POS,
            material: GROUND_MATERIAL_CANNON,
            color: 'rgb(180, 180, 180)'
        }
    },
    {
        type: 'floor',
        properties: {
            pos: FLOOR_POS,
            material: GROUND_MATERIAL_CANNON,
            color: 'rgb(100, 100, 100)'
        }
    },
    {
        type: 'ball',
        properties: {
            radius: SPHERE_RADIUS,
            mass: 1,
            initialPos: new CANNON.Vec3(0, 15, -2), // Y座標を高く、Z座標を坂に近づける
            material: SPHERE_MATERIAL_CANNON,
            color: 'red'
        }
    }
];
