/**
 * 门窗构件：门套（架线）+ 平开门扇（开启 90°）+ 推拉玻璃扇 + 窗框。
 * 门扇的位置直接取自 geom/build.js 的 doorLeaf()/sliderPanels() —— 与碰撞体同源。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { C, DOORS, WINDOWS } from '../data/building.js';
import { doorLeaf, sliderPanels, floorY, LEAF_T } from '../geom/build.js';
import { MAT } from './materials.js';

const box = b => {
  const g = new THREE.BoxGeometry(Math.max(1e-4, b.x1 - b.x0), Math.max(1e-4, b.y1 - b.y0), Math.max(1e-4, b.z1 - b.z0));
  g.translate((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
  return g;
};
const EXT = [C.LINE_N, C.LINE_S, C.LINE_W, C.LINE_E];
const wallT = line => (EXT.some(v => Math.abs(v - line) < 1e-6) ? C.WALL_EXT : C.WALL_INT);
/** 外墙洞口的"室内侧"法向 */
const inward = line =>
  Math.abs(line - C.LINE_N) < 1e-6 || Math.abs(line - C.LINE_W) < 1e-6 ? 1 : -1;

export function buildOpenings() {
  const bucket = { 1: new Map(), 2: new Map() };
  const put = (f, m, b) => { const M = bucket[f]; if (!M.has(m)) M.set(m, []); M.get(m).push(box(b)); };

  /* ── 门套（两面架线；外墙洞口只做室内侧） ── */
  const CW = 0.075, CP = 0.018;                       // 架线宽 / 出墙厚
  for (const d of DOORS) {
    const f = d.floor, fy = floorY(f), t = wallT(d.line);
    const a = d.pos - d.w / 2, b = d.pos + d.w / 2, y0 = fy, y1 = fy + d.h;
    const ext = EXT.some(v => Math.abs(v - d.line) < 1e-6);
    const sides = ext ? [inward(d.line)] : [-1, 1];
    for (const s of sides) {
      const p0 = d.line + s * t / 2, p1 = p0 + s * CP;
      const lo = Math.min(p0, p1), hi = Math.max(p0, p1);
      if (d.axis === 'x') {
        put(f, 'lacquer', { x0: a - CW, x1: a, z0: lo, z1: hi, y0, y1: y1 + CW });
        put(f, 'lacquer', { x0: b, x1: b + CW, z0: lo, z1: hi, y0, y1: y1 + CW });
        put(f, 'lacquer', { x0: a - CW, x1: b + CW, z0: lo, z1: hi, y0: y1, y1: y1 + CW });
      } else {
        put(f, 'lacquer', { z0: a - CW, z1: a, x0: lo, x1: hi, y0, y1: y1 + CW });
        put(f, 'lacquer', { z0: b, z1: b + CW, x0: lo, x1: hi, y0, y1: y1 + CW });
        put(f, 'lacquer', { z0: a - CW, z1: b + CW, x0: lo, x1: hi, y0: y1, y1: y1 + CW });
      }
    }
  }

  /* ── 平开门扇（已开启 90°）/ 入户门扇（关闭） ── */
  for (const d of DOORS) {
    const L = doorLeaf(d); if (!L) continue;
    const f = d.floor, thinX = (L.x1 - L.x0) < (L.z1 - L.z0);   // 门扇的薄向
    put(f, 'oak', L);
    // 门扇双面浅凹槽（两道），做出板式门的层次
    for (const k of [0.30, 0.70]) {
      const yy = L.y0 + (L.y1 - L.y0) * k;
      if (thinX) {
        for (const s of [-1, 1]) put(f, 'walnut', {
          x0: s < 0 ? L.x0 - 0.004 : L.x1, x1: s < 0 ? L.x0 : L.x1 + 0.004,
          z0: L.z0 + 0.09, z1: L.z1 - 0.09, y0: yy - 0.012, y1: yy + 0.012 });
      } else {
        for (const s of [-1, 1]) put(f, 'walnut', {
          z0: s < 0 ? L.z0 - 0.004 : L.z1, z1: s < 0 ? L.z0 : L.z1 + 0.004,
          x0: L.x0 + 0.09, x1: L.x1 - 0.09, y0: yy - 0.012, y1: yy + 0.012 });
      }
    }
    // 把手（自由端一侧）
    const hy = L.y0 + 1.05;
    if (thinX) {
      const far = L.side > 0 ? L.z1 - 0.10 : L.z0 + 0.10;
      for (const s of [-1, 1]) put(f, 'brass', {
        x0: s < 0 ? L.x0 - 0.10 : L.x1, x1: s < 0 ? L.x0 : L.x1 + 0.10,
        z0: far - 0.02, z1: far + 0.02, y0: hy - 0.02, y1: hy + 0.02 });
    } else {
      const far = L.side > 0 ? L.x1 - 0.10 : L.x0 + 0.10;
      for (const s of [-1, 1]) put(f, 'brass', {
        z0: s < 0 ? L.z0 - 0.10 : L.z1, z1: s < 0 ? L.z0 : L.z1 + 0.10,
        x0: far - 0.02, x1: far + 0.02, y0: hy - 0.02, y1: hy + 0.02 });
    }
  }

  /* ── 推拉门：固定扇 + 推开后叠放的活动扇 + 上下轨道 ── */
  for (const d of DOORS) {
    const S = sliderPanels(d); if (!S) continue;
    const f = d.floor, fy = floorY(f), a = d.pos - d.w / 2, b = d.pos + d.w / 2;
    const half = d.w / 2, y1 = fy + d.h, FT = 0.05;
    const along = (lo, hi, off, mat, yy0, yy1) => put(f, mat, d.axis === 'x'
      ? { x0: lo, x1: hi, z0: d.line + off - 0.018, z1: d.line + off + 0.018, y0: yy0, y1: yy1 }
      : { z0: lo, z1: hi, x0: d.line + off - 0.018, x1: d.line + off + 0.018, y0: yy0, y1: yy1 });
    for (const [off, p0] of [[-0.032, a], [0.032, a]]) {          // 两扇都停在 'lo' 半边
      along(p0, p0 + half, off, 'blackMtl', fy, fy + FT);          // 下冒头
      along(p0, p0 + half, off, 'blackMtl', y1 - FT, y1);          // 上冒头
      along(p0, p0 + FT, off, 'blackMtl', fy, y1);                 // 边梃
      along(p0 + half - FT, p0 + half, off, 'blackMtl', fy, y1);
      along(p0 + FT, p0 + half - FT, off, 'glass', fy + FT, y1 - FT);
    }
    along(a, b, 0, 'blackMtl', y1 - 0.03, y1);                     // 上轨
    along(a, b, 0, 'blackMtl', fy, fy + 0.015);                    // 下轨
  }

  /* ── 窗框（框 + 中梃），位于洞口平面内 ── */
  const SIDE = { N: ['x', C.LINE_N], S: ['x', C.LINE_S], W: ['z', C.LINE_W], E: ['z', C.LINE_E] };
  for (const w of WINDOWS) {
    const f = w.floor, fy = floorY(f), [axis, line] = SIDE[w.side];
    const a = w.pos - w.w / 2, b = w.pos + w.w / 2;
    const y0 = fy + w.sill, y1 = y0 + w.h, FW = 0.055, T = 0.035;
    const seg = (lo, hi, yy0, yy1) => put(f, 'blackMtl', axis === 'x'
      ? { x0: lo, x1: hi, z0: line - T, z1: line + T, y0: yy0, y1: yy1 }
      : { z0: lo, z1: hi, x0: line - T, x1: line + T, y0: yy0, y1: yy1 });
    seg(a, b, y0, y0 + FW); seg(a, b, y1 - FW, y1);
    seg(a, a + FW, y0, y1); seg(b - FW, b, y0, y1);
    if (w.w > 1.6) seg((a + b) / 2 - 0.025, (a + b) / 2 + 0.025, y0, y1);
    // 内窗台
    put(f, 'stone', axis === 'x'
      ? { x0: a - 0.05, x1: b + 0.05, z0: line + inward(line) * 0.05, z1: line + inward(line) * 0.18, y0: y0 - 0.035, y1: y0 }
      : { z0: a - 0.05, z1: b + 0.05, x0: line + inward(line) * 0.05, x1: line + inward(line) * 0.18, y0: y0 - 0.035, y1: y0 });
  }

  const out = {};
  for (const f of [1, 2]) {
    const g = new THREE.Group(); g.name = `openings${f}`;
    for (const [m, list] of bucket[f]) {
      if (!list.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(list), MAT[m]);
      mesh.castShadow = m !== 'glass'; mesh.receiveShadow = true;
      g.add(mesh);
    }
    out[f] = g;
  }
  return out;
}
export { LEAF_T };
