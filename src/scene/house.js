/**
 * 由 geom/build.js 的盒体数据生成 Three.js 网格。
 * 同一批盒体同时用于碰撞（见 player.js），因此视觉与物理不可能错位。
 * 每种材质合并为一个 BufferGeometry → draw call 极低。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { C, SOLIDS, GUARDRAILS, WINDOWS } from '../data/building.js';
import { walls, slabs, stairSteps, floorY, handrails, RAIL } from '../geom/build.js';
import { MAT } from './materials.js';

const box = b => {
  const g = new THREE.BoxGeometry(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0);
  g.translate((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
  return g;
};
const merge = (boxes, mat, cast = true) => {
  if (!boxes || !boxes.length) return null;
  const m = new THREE.Mesh(mergeGeometries(boxes.map(box)), mat);
  m.castShadow = cast; m.receiveShadow = true;
  return m;
};

export const M = {
  wall:   MAT.wall,
  floor1: MAT.floorOak,
  floor2: MAT.floorOak2,
  slab:   MAT.ceiling,
  stone:  MAT.microCem,
  wood:   MAT.walnut,
  rail:   MAT.blackMtl,
  glass:  MAT.glass,
};

const SIDE = { N: ['x', C.LINE_N], S: ['x', C.LINE_S], W: ['z', C.LINE_W], E: ['z', C.LINE_E] };

/** 窗洞玻璃（仅视觉，不参与碰撞） */
function glassPanes(f) {
  const fy = floorY(f), t = 0.015;
  return WINDOWS.filter(w => w.floor === f).map(w => {
    const [axis, line] = SIDE[w.side];
    const y0 = fy + w.sill, y1 = y0 + w.h;
    return axis === 'x'
      ? { x0: w.pos - w.w / 2, x1: w.pos + w.w / 2, z0: line - t, z1: line + t, y0, y1 }
      : { z0: w.pos - w.w / 2, z1: w.pos + w.w / 2, x0: line - t, x1: line + t, y0, y1 };
  });
}

/** 栏板（横杆 + 立柱） */
function railBoxes() {
  const out = [];
  for (const g of GUARDRAILS) {
    const [ax, az] = g.a, [bx, bz] = g.b, y = floorY(g.floor), t = 0.04;
    out.push({
      x0: Math.min(ax, bx) - (ax === bx ? t : 0), x1: Math.max(ax, bx) + (ax === bx ? t : 0),
      z0: Math.min(az, bz) - (az === bz ? t : 0), z1: Math.max(az, bz) + (az === bz ? t : 0),
      y0: y + g.h - 0.06, y1: y + g.h,
    });
    const n = Math.max(2, Math.round(Math.hypot(bx - ax, bz - az) / 0.9));
    for (let i = 0; i <= n; i++) {
      const s = i / n, x = ax + (bx - ax) * s, z = az + (bz - az) * s;
      out.push({ x0: x - 0.02, x1: x + 0.02, z0: z - 0.02, z1: z + 0.02, y0: y, y1: y + g.h });
    }
  }
  return out;
}

/** 楼梯扶手：黄铜圆管 + 转角球接 + 墙面托架 + 起步立柱 */
function railGeoms() {
  const V = THREE.Vector3, UP = new V(0, 1, 0), out = [];
  const tube = (a, b, r) => {
    const A = new V(...a), B = new V(...b), d = new V().subVectors(B, A), len = d.length();
    const g = new THREE.CylinderGeometry(r, r, len, 12, 1);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
    g.translate(A.x, A.y, A.z);
    return g.toNonIndexed();
  };
  const ball = p => { const g = new THREE.SphereGeometry(RAIL.r * 1.05, 12, 10); g.translate(...p); return g.toNonIndexed(); };
  for (const seg of handrails()) {
    const { a, b, n } = seg;
    out.push(tube(a, b, RAIL.r), ball(a), ball(b));
    // 墙面托架：沿段每 ~0.85m 一个
    const A = new V(...a), B = new V(...b), len = new V().subVectors(B, A).length();
    const cnt = Math.max(2, Math.round(len / 0.85));
    for (let i = 0; i <= cnt; i++) {
      const t = i / cnt, p = new V().lerpVectors(A, B, t);
      const wall = [p.x + n[0] * (RAIL.off + 0.01), p.y, p.z + n[2] * (RAIL.off + 0.01)];
      out.push(tube([p.x, p.y, p.z], wall, 0.010));
      out.push(tube(wall, [wall[0] + n[0] * 0.012, wall[1], wall[2] + n[2] * 0.012], 0.026)); // 底座
    }
  }
  // 起步立柱（两跑底端各一根，落到踏面）
  for (const seg of handrails().filter(s2 => Math.abs(s2.a[2] - 10.25) < 1e-6)) {
    const [x, y, z] = seg.a;
    out.push(tube([x, 0.03, z], [x, y, z], RAIL.r * 0.95));
  }
  return out;
}

export function buildHouse() {
  const S = slabs();
  const g1 = new THREE.Group(), g2 = new THREE.Group(), roof = new THREE.Group();
  g1.name = 'floor1'; g2.name = 'floor2'; roof.name = 'roof';

  const add = (g, mesh) => { if (mesh) g.add(mesh); };

  // 一层：地面 / 露台 / 墙 / 楼梯 / 梯井实体
  add(g1, merge(S.terrace, M.stone, false));
  add(g1, merge(S.ground, M.floor1, false));
  add(g1, merge(walls(1), M.wall));
  add(g1, merge(stairSteps(), M.wood));
  { const rg = railGeoms(); if (rg.length) { const m = new THREE.Mesh(mergeGeometries(rg), MAT.brass); m.castShadow = m.receiveShadow = true; g1.add(m); } }
  add(g1, merge(SOLIDS, M.wall));
  add(g1, merge(glassPanes(1), M.glass, false));

  // 二层：楼板(=一层天花) / 面层 / 阳台 / 墙 / 栏板
  add(g2, merge(S.f2, M.slab, false));
  add(g2, merge(S.f2.map(r => ({ ...r, y0: C.FLOOR_TO_FLOOR, y1: C.FLOOR_TO_FLOOR + 0.02 })), M.floor2, false));
  add(g2, merge(S.balcony, M.stone, false));
  add(g2, merge(walls(2), M.wall));
  add(g2, merge(railBoxes(), M.rail));
  add(g2, merge(glassPanes(2), M.glass, false));

  // 屋面（轴测时隐藏）
  add(roof, merge(S.roof, M.slab, false));

  const drawCalls = g1.children.length + g2.children.length + roof.children.length;
  return { g1, g2, roof, drawCalls };
}
