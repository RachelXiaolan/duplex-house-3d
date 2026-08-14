/**
 * 硬装（精装修）图层：踢脚线 / 分区地面 / 厨卫墙砖 / 背景墙 / 窗帘 / 筒灯灯带 / 挂画。
 * 全部由 building.js 的房间矩形与门窗表推导，自动避开门洞与门套。
 * 均为墙面·顶面·地面的附着物，【不参与碰撞】，因此不影响既有通行测试。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { C, ROOMS, DOORS, WINDOWS } from '../data/building.js';
import { floorY } from '../geom/build.js';
import { MAT } from './materials.js';

const WET   = ['wc_f1', 'laundry_f1', 'wc_f2', 'mbath_f2'];
const STONE = [...WET, 'kitchen_f1', 'foyer_f1'];
const SKIP  = ['understair_f1', 'terrace_f1', 'balcony_f2', 'stair_f1', 'void_f2'];
const COVE  = ['living_f1', 'master_f2', 'family_f2'];      // 做灯带的房间

const SK_H = 0.10, SK_P = 0.018;      // 踢脚线 高 / 出墙
const TILE_H = 2.10, TILE_P = 0.012;  // 卫浴墙砖 高 / 出墙
const CEIL = 2.88;                    // 顶面附着物标高（相对楼层完成面）

/** 房间某一侧扣掉门洞（含门套）后剩余的连续段 */
function runs(r, side, f) {
  const horiz = side === 'N' || side === 'S';
  const line = side === 'N' ? r.z0 : side === 'S' ? r.z1 : side === 'W' ? r.x0 : r.x1;
  const lo = horiz ? r.x0 : r.z0, hi = horiz ? r.x1 : r.z1;
  const cuts = DOORS
    .filter(d => d.floor === f && d.axis === (horiz ? 'x' : 'z') && Math.abs(d.line - line) <= 0.13)
    .map(d => [d.pos - d.w / 2 - 0.09, d.pos + d.w / 2 + 0.09])
    .sort((a, b) => a[0] - b[0]);
  const out = []; let p = lo;
  for (const [a, b] of cuts) { if (a > p) out.push([p, Math.min(a, hi)]); p = Math.max(p, b); }
  if (p < hi) out.push([p, hi]);
  return out.filter(([a, b]) => b - a > 0.06);
}

/** 沿房间某侧生成贴墙条带（踢脚线 / 墙砖） */
function band(r, side, f, y0, y1, proud, push) {
  const horiz = side === 'N' || side === 'S';
  const line = side === 'N' ? r.z0 : side === 'S' ? r.z1 : side === 'W' ? r.x0 : r.x1;
  const s = (side === 'N' || side === 'W') ? 1 : -1;      // 房间内侧方向
  for (const [a, b] of runs(r, side, f)) {
    push(horiz
      ? { x0: a, x1: b, z0: Math.min(line, line + s * proud), z1: Math.max(line, line + s * proud), y0, y1 }
      : { z0: a, z1: b, x0: Math.min(line, line + s * proud), x1: Math.max(line, line + s * proud), y0, y1 });
  }
}

export function buildFinishes() {
  const bag = { 1: new Map(), 2: new Map() };
  const put = (f, m, b) => {
    if (!bag[f].has(m)) bag[f].set(m, []);
    const g = new THREE.BoxGeometry(Math.max(2e-4, b.x1 - b.x0), Math.max(2e-4, b.y1 - b.y0), Math.max(2e-4, b.z1 - b.z0));
    g.translate((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
    bag[f].get(m).push(g);
  };
  const disc = (f, m, x, y, z, r, h) => {
    if (!bag[f].has(m)) bag[f].set(m, []);
    const g = new THREE.CylinderGeometry(r, r, h, 14); g.translate(x, y + h / 2, z);
    bag[f].get(m).push(g.toNonIndexed());
  };

  for (const r of ROOMS) {
    if (SKIP.includes(r.id) || r.z1 <= 0) continue;
    const f = r.floor, fy = floorY(f), wet = WET.includes(r.id);

    // ① 地面分区面层
    if (STONE.includes(r.id)) {
      const y = fy + (f === 1 ? 0.002 : 0.021);
      put(f, wet ? 'stone' : 'microCem', { x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, y0: y, y1: y + 0.013 });
    }

    // ② 踢脚线（干区） / 墙砖（湿区）
    for (const side of ['N', 'S', 'W', 'E']) {
      if (wet) band(r, side, f, fy + 0.015, fy + TILE_H, TILE_P, b => put(f, 'stone', b));
      else band(r, side, f, fy, fy + SK_H, SK_P, b => put(f, 'lacquer', b));
    }
    // 厨房防溅砖（东 / 北墙，台面之上）
    if (r.id === 'kitchen_f1') for (const side of ['E', 'N'])
      band(r, side, f, fy + 0.90, fy + 1.50, TILE_P, b => put(f, 'stone', b));

    // ③ 筒灯：按 ~2m 网格
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    if (w * d > 5.5) {
      const nx = Math.max(1, Math.round(w / 2.2)), nz = Math.max(1, Math.round(d / 2.2));
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++)
        disc(f, 'shade', r.x0 + w * (i + 0.5) / nx, fy + CEIL, r.z0 + d * (j + 0.5) / nz, 0.072, 0.016);
    }

    // ④ 灯带（回光灯槽）：沿房间内缩 0.35m 一圈
    if (COVE.includes(r.id)) {
      const i = 0.35, t = 0.055, y = fy + CEIL - 0.045;
      const [a, b, c, e] = [r.x0 + i, r.x1 - i, r.z0 + i, r.z1 - i];
      put(f, 'shade', { x0: a, x1: b, z0: c, z1: c + t, y0: y, y1: y + 0.035 });
      put(f, 'shade', { x0: a, x1: b, z0: e - t, z1: e, y0: y, y1: y + 0.035 });
      put(f, 'shade', { x0: a, x1: a + t, z0: c, z1: e, y0: y, y1: y + 0.035 });
      put(f, 'shade', { x0: b - t, x1: b, z0: c, z1: e, y0: y, y1: y + 0.035 });
    }
  }

  /* ⑤ 窗帘：低窗台的窗才做，落地对开 */
  const SIDE = { N: ['x', C.LINE_N, 1], S: ['x', C.LINE_S, -1], W: ['z', C.LINE_W, 1], E: ['z', C.LINE_E, -1] };
  for (const w of WINDOWS) {
    if (w.sill > 1.0) continue;
    const f = w.floor, fy = floorY(f), [axis, line, s] = SIDE[w.side];
    const top = fy + w.sill + w.h + 0.22, y0 = fy + 0.02;
    const off = line + s * 0.16, pw = 0.30, dep = 0.11;
    const rod = axis === 'x'
      ? { x0: w.pos - w.w / 2 - 0.34, x1: w.pos + w.w / 2 + 0.34, z0: off - 0.016, z1: off + 0.016, y0: top, y1: top + 0.032 }
      : { z0: w.pos - w.w / 2 - 0.34, z1: w.pos + w.w / 2 + 0.34, x0: off - 0.016, x1: off + 0.016, y0: top, y1: top + 0.032 };
    put(f, 'blackMtl', rod);
    for (const k of [-1, 1]) {
      const cc = w.pos + k * (w.w / 2 + pw / 2 + 0.02);
      put(f, 'linen', axis === 'x'
        ? { x0: cc - pw / 2, x1: cc + pw / 2, z0: off - dep / 2, z1: off + dep / 2, y0, y1: top }
        : { z0: cc - pw / 2, z1: cc + pw / 2, x0: off - dep / 2, x1: off + dep / 2, y0, y1: top });
    }
  }

  /* ⑥ 背景墙 */
  // 客厅电视墙：西墙木格栅
  for (let z = 1.95; z < 4.58; z += 0.11)
    put(1, 'oak', { x0: 0.24, x1: 0.278, z0: z, z1: z + 0.058, y0: 0.10, y1: 2.66 });
  put(1, 'walnut', { x0: 0.24, x1: 0.30, z0: 1.90, z1: 4.65, y0: 2.66, y1: 2.74 });
  put(1, 'walnut', { x0: 0.24, x1: 0.30, z0: 1.90, z1: 4.65, y0: 0.10, y1: 0.16 });
  // 主卧床头软包：北墙 3×2 分格
  // 软包分格排在床头板顶（4.42m）之上，避免与床头板穿插
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++)
    put(2, 'fabricDk', {
      x0: 2.22 + i * 0.74, x1: 2.22 + i * 0.74 + 0.68,
      z0: 4.94, z1: 4.995, y0: C.F2_Y + 1.45 + j * 0.47, y1: C.F2_Y + 1.45 + j * 0.47 + 0.42,
    });

  /* ⑦ 挂画 */
  const art = [
    [1, 5.60, 1.55, 6.72, 'x', 1.10, 0.80],   // 客厅南墙
    [1, 4.10, 1.50, 12.94, 'x', 0.70, 0.90],  // 多功能室南墙
    [2, 13.10, 1.55, 12.94, 'x', 0.90, 0.70], // 上层休息厅南墙
    [2, 8.20, 1.55, 0.26, 'x', 1.00, 0.72],   // 家庭起居室北墙
  ];
  for (const [f, x, y, z, axis, aw, ah] of art) {
    const fy = floorY(f), s = z < 6 ? 1 : -1;
    const p0 = z + s * 0.02, p1 = z + s * 0.05;
    put(f, 'walnut', { x0: x - aw / 2, x1: x + aw / 2, z0: Math.min(p0, p1), z1: Math.max(p0, p1), y0: fy + y - ah / 2, y1: fy + y + ah / 2 });
    const q0 = z + s * 0.05, q1 = z + s * 0.062;
    put(f, 'linen', { x0: x - aw / 2 + 0.05, x1: x + aw / 2 - 0.05, z0: Math.min(q0, q1), z1: Math.max(q0, q1), y0: fy + y - ah / 2 + 0.05, y1: fy + y + ah / 2 - 0.05 });
    void axis;
  }

  const out = {};
  for (const f of [1, 2]) {
    const g = new THREE.Group(); g.name = `finish${f}`;
    for (const [m, list] of bag[f]) {
      if (!list.length) continue;
      const norm = list.map(x => (x.index ? x.toNonIndexed() : x));
      const merged = mergeGeometries(norm);
      if (!merged) { console.warn('[finishes] 合并失败', m); continue; }
      const mesh = new THREE.Mesh(merged, MAT[m]);
      mesh.castShadow = m !== 'shade'; mesh.receiveShadow = true;
      g.add(mesh);
    }
    out[f] = g;
  }
  return out;
}
