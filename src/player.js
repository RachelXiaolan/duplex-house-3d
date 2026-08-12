/**
 * 第一人称角色：Pointer Lock + WASD + 重力 + 胶囊(圆柱)碰撞。
 * 碰撞体与支撑面全部来自 geom/build.js —— 与可视几何同源。
 * 楼梯使用与踏步同坡度（31.6°）的隐形坡道支撑，Y 连续变化，无瞬移。
 */
import * as THREE from 'three';
import { colliders, supports } from './geom/build.js';

export const P = {
  R: 0.29,          // 胶囊半径
  EYE: 1.60,        // 眼高
  HEAD: 1.70,       // 身体总高
  SPEED: 1.5,       // m/s
  RUN: 2.6,
  STEP: 0.30,       // 最大可跨台阶高
  GRAV: 12.0,
};

export class Player {
  constructor(camera, dom) {
    this.cam = camera; this.dom = dom;
    this.pos = new THREE.Vector3(7.80, 0, 11.70); // 玄关
    this.yaw = Math.PI; this.pitch = 0;           // 朝北（-Z）
    this.vy = 0; this.grounded = true; this.active = false; this.frozen = false;
    this.keys = new Set();
    this.cols = colliders();

    // 空间哈希，减少每帧碰撞检测数量
    this.CELL = 1.5; this.hash = new Map();
    for (const b of this.cols)
      for (let i = Math.floor((b.x0 - P.R) / this.CELL); i <= Math.floor((b.x1 + P.R) / this.CELL); i++)
        for (let j = Math.floor((b.z0 - P.R) / this.CELL); j <= Math.floor((b.z1 + P.R) / this.CELL); j++) {
          const k = i + ',' + j; if (!this.hash.has(k)) this.hash.set(k, []); this.hash.get(k).push(b);
        }

    this._onKey = e => {
      if (!this.active) return;
      if (e.type === 'keydown') this.keys.add(e.code); else this.keys.delete(e.code);
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code)) e.preventDefault();
    };
    this._onMove = e => {
      if (!this.active) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - e.movementY * 0.0022));
    };
    this._onLock = () => {
      this.active = document.pointerLockElement === this.dom;
      if (!this.active) { this.keys.clear(); this.onExit?.(); }
    };
    addEventListener('keydown', this._onKey); addEventListener('keyup', this._onKey);
    document.addEventListener('mousemove', this._onMove);
    document.addEventListener('pointerlockchange', this._onLock);
  }

  near(x, z) { return this.hash.get(Math.floor(x / this.CELL) + ',' + Math.floor(z / this.CELL)) || []; }

  request() { this.dom.requestPointerLock?.(); }
  release() { if (document.pointerLockElement === this.dom) document.exitPointerLock(); }

  /** 传送到指定位置（切换视图/测试用）；给定 y 时吸附到最接近的支撑面 */
  place(x, z, yaw, y) {
    this.pos.set(x, 0, z); this.yaw = yaw ?? this.yaw; this.pitch = 0; this.vy = 0;
    const s = supports(x, z);
    if (!s.length) { this.pos.y = 0; return; }
    this.pos.y = y === undefined ? s[0]
      : s.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a));
  }

  /** 水平推出解算：3 次迭代，仅对与身体竖向重叠的盒生效 */
  resolveXZ() {
    const p = this.pos;
    for (let it = 0; it < 4; it++) {
      let hit = false;
      for (const b of this.near(p.x, p.z)) {
        if (!(b.y0 < p.y + P.HEAD - 0.05 && b.y1 > p.y + P.STEP)) continue; // 站在其上/位于其下 → 不碰
        const cx = Math.max(b.x0, Math.min(p.x, b.x1)), cz = Math.max(b.z0, Math.min(p.z, b.z1));
        const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
        if (d2 >= P.R * P.R) continue;
        hit = true;
        if (d2 > 1e-9) { const d = Math.sqrt(d2); p.x += (dx / d) * (P.R - d); p.z += (dz / d) * (P.R - d); }
        else { // 圆心陷入盒内：沿最小穿透方向弹出
          const px = Math.min(p.x - b.x0, b.x1 - p.x), pz = Math.min(p.z - b.z0, b.z1 - p.z);
          if (px < pz) p.x += (p.x > (b.x0 + b.x1) / 2 ? 1 : -1) * (px + P.R);
          else p.z += (p.z > (b.z0 + b.z1) / 2 ? 1 : -1) * (pz + P.R);
        }
      }
      if (!hit) break;
    }
  }

  update(dt) {
    if (!this.active || this.frozen) { this.syncCamera(); return; }
    dt = Math.min(dt, 0.05);
    const k = this.keys;
    let fx = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    let sx = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const len = Math.hypot(fx, sx) || 1;
    const sp = (k.has('ShiftLeft') || k.has('ShiftRight')) ? P.RUN : P.SPEED;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const p = this.pos;
    const px = p.x, pz = p.z;
    p.x += ((-sin * fx / len) + (cos * sx / len)) * sp * dt;
    p.z += ((-cos * fx / len) - (sin * sx / len)) * sp * dt;
    this.resolveXZ();

    // 竖向：重力 + 支撑面吸附（含楼梯坡道）
    this.vy -= P.GRAV * dt;
    p.y += this.vy * dt;
    let best = null;
    for (const h of supports(p.x, p.z)) if (h <= p.y + P.STEP && (best === null || h > best)) best = h;
    if (best === null) { // 站不住 → 退回上一帧位置（防止掉出洞口/走出世界）
      p.x = px; p.z = pz; p.y = Math.max(p.y, 0); this.vy = 0;
    } else if (p.y <= best + 1e-6 || (this.vy <= 0 && p.y < best + P.STEP)) {
      p.y = best; this.vy = 0; this.grounded = true;
    } else this.grounded = false;

    this.syncCamera();
  }

  syncCamera() {
    this.cam.position.set(this.pos.x, this.pos.y + P.EYE, this.pos.z);
    this.cam.rotation.set(0, 0, 0, 'YXZ');
    this.cam.rotation.order = 'YXZ';
    this.cam.rotation.y = this.yaw; this.cam.rotation.x = this.pitch;
  }

  dispose() {
    removeEventListener('keydown', this._onKey); removeEventListener('keyup', this._onKey);
    document.removeEventListener('mousemove', this._onMove);
    document.removeEventListener('pointerlockchange', this._onLock);
  }
}
