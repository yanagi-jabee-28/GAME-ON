/**
 * @file objects.js
 * @brief シーンに配置する様々なオブジェクトの生成ロジックを管理するファイルです。
 *
 * config.jsで定義されたオブジェクトの定義（OBJECT_DEFINITIONS）に基づいて、
 * 物理ボディ（CANNON.js）と3Dメッシュ（Three.js）を生成し、
 * それぞれ物理ワールドと3Dシーンに追加します。
 *
 * 新しい種類のオブジェクトを追加する場合は、このファイル内のcreateObject関数に
 * 新しい'case'を追加し、対応する物理ボディと3Dメッシュの生成ロジックを記述します。
 */

import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// 物理・描画のコア要素をインポート
import { world, objectsToUpdate } from './physics.js';
import { scene } from './scene.js';

// 設定値をインポート
import {
    SPHERE_RADIUS,
    SPHERE_MATERIAL_CANNON,
    GROUND_MATERIAL_CANNON,
    SLOPE_ANGLE, // 坂の角度はpropertiesから取得するため、ここでは直接使用しないが、importは残す
    OBJECT_DEFINITIONS
} from './config.js';

/**
 * オブジェクト定義に基づいて物理ボディと3Dメッシュを作成し、ワールドとシーンに追加します。
 * この関数は、config.jsのOBJECT_DEFINITIONSで定義された各オブジェクトタイプに対応します。
 *
 * @param {object} objectDefinition - 生成するオブジェクトの定義オブジェクト。
 *   - `type`: オブジェクトの種類を示す文字列（例: 'ball', 'slope', 'floor'）。
 *   - `properties`: オブジェクト固有のプロパティを含むオブジェクト。
 * @returns {{body: CANNON.Body, mesh: THREE.Mesh | null}} 作成された物理ボディと3Dメッシュのペア。
 *   床のように視覚的なメッシュを持たない場合はmeshがnullになります。
 */
export function createObject(objectDefinition) {
    const { type, properties } = objectDefinition;
    let body, mesh;

    switch (type) {
        case 'ball':
            // ボールオブジェクトの生成
            // properties: radius, mass, initialPos, material, color
            body = new CANNON.Body({
                mass: properties.mass,
                position: properties.initialPos.clone(), // 初期位置
                shape: new CANNON.Sphere(properties.radius), // 球体形状
                material: properties.material, // 物理マテリアル
                allowSleep: false, // 常にアクティブにしておく
            });
            world.addBody(body);

            mesh = new THREE.Mesh(
                new THREE.SphereGeometry(properties.radius),
                new THREE.MeshStandardMaterial({
                    color: properties.color,
                    metalness: 0.5,
                    roughness: 0.4
                })
            );
            mesh.position.copy(body.position);
            scene.add(mesh);

            // アニメーションループで位置を同期するために更新リストに追加
            objectsToUpdate.push({ mesh, body });
            break;

        case 'slope':
            // 坂オブジェクトの生成
            // properties: angle, width, height, depth, pos, material, color
            const angleRad = (Math.PI / 180) * properties.angle;
            const slopeHalfExtents = new CANNON.Vec3(properties.width / 2, properties.height / 2, properties.depth / 2);

            // 坂の上端のZ座標とY座標を計算
            // 坂の中心を基準に、奥行きと角度を考慮して上端を算出
            const halfDepth = properties.depth / 2;
            const halfHeight = properties.height / 2; // 坂の厚みの半分

            // 坂の回転後の上端の相対座標を計算
            // Z軸方向のオフセット: 坂の奥行きの半分 * cos(角度)
            // Y軸方向のオフセット: 坂の奥行きの半分 * sin(角度)
            const rotatedZOffset = Math.cos(angleRad) * halfDepth;
            const rotatedYOffset = Math.sin(angleRad) * halfDepth;

            // 坂の表面のY座標をボールの初期Y座標に合わせるためのオフセット
            // 坂の厚みを考慮し、坂の表面がボールの初期位置に来るように調整
            // 坂の傾斜によって厚みの影響も変わるため、cos(angleRad)を掛ける
            const surfaceOffsetDueToThickness = Math.cos(angleRad) * halfHeight;

            // ボールの初期位置を取得 (config.jsのOBJECT_DEFINITIONSから)
            const ballDefinition = OBJECT_DEFINITIONS.find(def => def.type === 'ball');
            const ballInitialPos = ballDefinition ? ballDefinition.properties.initialPos : new CANNON.Vec3(0, 0, 0);

            // 坂の新しい中心位置を計算
            // ボールの初期位置のYとZに、坂の上端からのオフセットを考慮して坂の中心を逆算
            // 坂の表面がボールの初期位置に来るように調整
            // config で与えた pos.y / pos.z をオフセットとして加味できるようにする
            const newSlopePosY = ballInitialPos.y - rotatedYOffset - surfaceOffsetDueToThickness + (properties.pos.y || 0);
            const newSlopePosZ = ballInitialPos.z - rotatedZOffset + (properties.pos.z || 0);
            const newSlopePos = new CANNON.Vec3(properties.pos.x, newSlopePosY, newSlopePosZ); // Xはそのまま

            body = new CANNON.Body({
                mass: 0,
                shape: new CANNON.Box(slopeHalfExtents), // 箱型形状
                material: properties.material, // 物理マテリアル
                position: newSlopePos // 新しい中心位置を設定
            });
            body.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), angleRad);
            world.addBody(body);

            mesh = new THREE.Mesh(
                new THREE.BoxGeometry(properties.width, properties.height, properties.depth), // 箱型ジオメトリ
                new THREE.MeshStandardMaterial({
                    color: properties.color,
                    side: THREE.DoubleSide // 裏面も描画
                })
            );
            mesh.position.copy(body.position);
            mesh.quaternion.copy(body.quaternion);
            scene.add(mesh);
            break;

        case 'floor':
            // 床オブジェクトの生成（無限平面）
            // properties: pos, material, color
            body = new CANNON.Body({
                mass: 0, // 質量0は静的なオブジェクトを意味します
                shape: new CANNON.Plane(), // 無限平面形状
                material: properties.material, // 物理マテリアル
                position: properties.pos.clone() // 平面が通過する点
            });
            // CANNON.PlaneはデフォルトでY軸に垂直（XZ平面に平行）なので、
            // X軸周りに-90度回転させて水平（XY平面に平行）にします。
            body.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
            world.addBody(body);

            // 床の3DメッシュはGridHelperで表現するため、ここでは生成しません。
            // meshはnullになります。
            mesh = null;
            break;

        default:
            // 未知のオブジェクトタイプが指定された場合の警告
            console.warn(`Unknown object type: ${type}. Please check OBJECT_DEFINITIONS in config.js.`);
            return null;
    }

    return { body, mesh };
}