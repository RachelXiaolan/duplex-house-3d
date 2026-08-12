/**
 * 程序化家具：全部带倒角、板厚与结构分件（腿/抽屉/门板/把手/坐垫/靠背…），
 * 不用纯方盒冒充成品。按材质合并 BufferGeometry → 每层每种材质仅 1 个 draw call。
 *
 * 局部坐标约定：原点在footprint中心、底面 y=0；「正面」朝 +Z，「背面」朝 −Z。
 * 摆放时先绕 Y 旋转 ry，再平移到 (x, 层完成面 + y, z)。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAT } from './materials.js';
import { ITEMS } from '../data/furniture.js';
import { floorY } from '../geom/build.js';

/* ───────────────────────── 基础几何 ───────────────────────── */
function rrShape(w, d, r) {
  const s = new THREE.Shape(), x = w / 2, z = d / 2;
  r = Math.max(0.001, Math.min(r, x - 0.001, z - 0.001));
  s.moveTo(-x + r, -z); s.lineTo(x - r, -z); s.quadraticCurveTo(x, -z, x, -z + r);
  s.lineTo(x, z - r); s.quadraticCurveTo(x, z, x - r, z);
  s.lineTo(-x + r, z); s.quadraticCurveTo(-x, z, -x, z - r);
  s.lineTo(-x, -z + r); s.quadraticCurveTo(-x, -z, -x + r, -z);
  return s;
}
/** 倒角圆角盒：底面 y=0，尺寸 w×h×d */
function rbox(w, h, d, r = 0.03) {
  const b = Math.max(0.0015, Math.min(0.012, h / 3.2, w / 4, d / 4));
  const g = new THREE.ExtrudeGeometry(rrShape(w - 2 * b, d - 2 * b, Math.max(r - b, 0.002)), {
    depth: Math.max(0.001, h - 2 * b), bevelEnabled: true,
    bevelSize: b, bevelThickness: b, bevelSegments: 2, curveSegments: 3,
  });
  g.rotateX(-Math.PI / 2); g.translate(0, b, 0);   // 旋转后 y∈[-b, h-b] → 平移 b 得 [0, h]
  return g;
}
const cyl = (rt, rb, h, seg = 14) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(0, h / 2, 0); return g; };
const sph = (r, seg = 12) => new THREE.SphereGeometry(r, seg, seg);
const at = (g, x, y, z, ry) => { if (ry) g.rotateY(ry); g.translate(x, y, z); return g; };

/* ───────────────────────── 构件库 ───────────────────────── */
// 每个 builder 返回 [{g, m}]，m 为 MAT 的键名
const P = [];                                  // 临时收集器
// mergeGeometries 要求同批几何全为索引或全为非索引：ExtrudeGeometry 非索引、
// Cylinder/Sphere/Torus 索引 —— 统一转成非索引再收集。
const put = (g, m) => { if (g) P.push({ g: g.index ? g.toNonIndexed() : g, m }); };

function legs4(w, d, h, m = 'blackMtl', inset = 0.07, r = 0.022) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    put(at(cyl(r, r * 0.85, h), sx * (w / 2 - inset), 0, sz * (d / 2 - inset)), m);
}

function seat(w, d, h, mat, arms = true) {
  const armW = arms ? 0.16 : 0, lg = 0.20;
  put(at(rbox(w, 0.16, d, 0.04), 0, lg, 0), mat);                      // 座箱
  legs4(w, d, lg, 'walnut', 0.10, 0.026);
  const inner = w - 2 * armW, n = Math.max(1, Math.round(inner / 0.78));
  for (let i = 0; i < n; i++) {                                        // 坐垫
    const cw = inner / n - 0.025;
    put(at(rbox(cw, 0.17, d - 0.20, 0.06), -inner / 2 + inner / n * (i + 0.5), lg + 0.16, 0.06), mat);
  }
  put(at(rbox(w, h - lg - 0.16, 0.15, 0.05), 0, lg + 0.16, -d / 2 + 0.075), mat);  // 靠背板
  for (let i = 0; i < n; i++) {                                        // 靠背垫
    const cw = inner / n - 0.03;
    const g = rbox(cw, 0.40, 0.15, 0.07); g.rotateX(0.10);
    put(at(g, -inner / 2 + inner / n * (i + 0.5), lg + 0.31, -d / 2 + 0.20), mat);
  }
  if (arms) for (const sx of [-1, 1])
    put(at(rbox(armW, h - lg - 0.10, d - 0.06, 0.06), sx * (w - armW) / 2, lg, 0.03), mat);
}

function tableTop(w, d, h, mat, legStyle) {
  put(at(rbox(w, 0.045, d, 0.02), 0, h - 0.045, 0), mat);
  if (legStyle === 'metal') {
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      put(at(cyl(0.018, 0.018, h - 0.045), sx * (w / 2 - 0.09), 0, sz * (d / 2 - 0.09)), 'blackMtl');
    put(at(rbox(w - 0.16, 0.02, 0.03, 0.008), 0, 0.09, 0), 'blackMtl');
  } else {
    put(at(rbox(w - 0.14, 0.06, d - 0.14, 0.01), 0, h - 0.10, 0), mat);        // 望板
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      put(at(rbox(0.07, h - 0.10, 0.07, 0.012), sx * (w / 2 - 0.08), 0, sz * (d / 2 - 0.08)), mat);
  }
}

/** 通用柜体：可做电视柜 / 边柜 / 衣柜 / 盥洗柜 */
function cabinet(w, d, h, mat, { doors = 2, kick = 0.06, handle = true, open = false } = {}) {
  put(at(rbox(w - 0.10, kick, d - 0.06, 0.005), 0, 0, 0), 'blackMtl');
  put(at(rbox(w, h - kick, d, 0.012), 0, kick, 0), mat);
  if (open) {                                                          // 开放式：内隔板
    const n = 3;
    for (let i = 1; i <= n; i++) put(at(rbox(w - 0.06, 0.022, d - 0.05, 0.004), 0, kick + (h - kick) * i / (n + 1), 0.01), mat);
  } else {
    const gap = 0.008, pw = (w - 0.03) / doors - gap;
    for (let i = 0; i < doors; i++) {
      const px = -w / 2 + 0.015 + (pw + gap) * (i + 0.5);
      put(at(rbox(pw, h - kick - 0.03, 0.022, 0.006), px, kick + 0.015, d / 2 - 0.011), mat);
      if (handle) put(at(cyl(0.008, 0.008, Math.min(0.20, h * 0.28)), px + pw / 2 - 0.05, kick + (h - kick) * 0.55, d / 2 + 0.014), 'brass');
    }
  }
}

function shelfUnit(w, d, h, mat, tiers = 4) {
  const t = 0.025;
  for (const sx of [-1, 1]) put(at(rbox(t, h, d, 0.004), sx * (w - t) / 2, 0, 0), mat);
  for (let i = 0; i <= tiers; i++) put(at(rbox(w - 2 * t, t, d, 0.004), 0, Math.min(h - t, h * i / tiers), 0), mat);
  put(at(rbox(w - 2 * t, 0.012, 0.012, 0.003), 0, h - t, -d / 2 + 0.006), mat);
}

function bedBuild(w, l, h, pillows) {
  put(at(rbox(w, h - 0.10, l, 0.02), 0, 0.10, 0), 'walnut');            // 床台
  legs4(w, l, 0.10, 'blackMtl', 0.12, 0.03);
  put(at(rbox(w - 0.06, 0.26, l - 0.06, 0.05), 0, h - 0.02, 0), 'linen');// 床垫
  const dl = l * 0.60;                                                   // 被
  put(at(rbox(w - 0.015, 0.12, dl, 0.06), 0, h + 0.24, l / 2 - dl / 2 - 0.03), 'fabric');  // 被（与床垫形成层次）
  put(at(rbox(w + 0.10, 1.22, 0.09, 0.03), 0, 0.10, -l / 2 - 0.02), 'fabricDk'); // 软包床头板
  const pw = pillows > 2 ? w / 2 - 0.09 : w - 0.20;
  for (let i = 0; i < Math.min(pillows, 2); i++) {
    const px = pillows > 2 ? (i ? 1 : -1) * (w / 4) : 0;
    put(at(rbox(pw, 0.16, 0.38, 0.09), px, h + 0.24, -l / 2 + 0.30), 'linen');
    if (pillows > 2) put(at(rbox(pw * 0.8, 0.13, 0.32, 0.08), px, h + 0.40, -l / 2 + 0.36), 'fabric');
  }
}

function counterBuild(w, d, h, mat, o) {
  cabinet(w, d, h - 0.04, mat, { doors: Math.max(2, Math.round(w / 0.65)), handle: true });
  put(at(rbox(w + 0.02, 0.045, d + 0.02, 0.006), 0, h - 0.045, 0), 'stone');  // 石材台面
  put(at(rbox(w, 0.05, 0.03, 0.004), 0, h, -d / 2 + 0.015), 'stone');         // 挡水
  if (o.sink) {
    put(at(rbox(0.52, 0.03, 0.40, 0.03), 0, h - 0.055, 0.02), 'blackMtl');
    put(at(cyl(0.016, 0.016, 0.30), 0, h, -0.14), 'brass');
    put(at(cyl(0.014, 0.014, 0.13).rotateX(Math.PI / 2), 0, h + 0.29, -0.08), 'brass');
  }
  if (o.hob) put(at(rbox(0.58, 0.012, 0.48, 0.02), 0, h, 0.02), 'blackMtl');
}

function toiletBuild(w, d, h) {
  put(at(rbox(0.34, 0.30, d - 0.20, 0.10), 0, 0, 0.06), 'ceramic');
  put(at(rbox(w, 0.10, d - 0.22, 0.13), 0, 0.30, 0.06), 'ceramic');
  put(at(rbox(w - 0.02, h - 0.40, 0.20, 0.05), 0, 0.30, -d / 2 + 0.10), 'ceramic');
  put(at(rbox(0.20, 0.02, 0.06, 0.01), 0.06, h - 0.02, -d / 2 + 0.10), 'brass');
}

function tubBuild(w, d, h) {
  put(at(rbox(w, h, d, 0.16), 0, 0, 0), 'ceramic');
  put(at(rbox(w - 0.14, 0.06, d - 0.14, 0.14), 0, h - 0.05, 0), 'glass');   // 水面
  put(at(cyl(0.016, 0.016, 0.26), -w / 2 + 0.14, h, 0), 'brass');
}

function showerBuild(w, d, h) {
  put(at(rbox(w, 0.04, d, 0.01), 0, 0, 0), 'stone');
  put(at(rbox(w, h, 0.012, 0.004), 0, 0.04, d / 2 - 0.006), 'glass');
  put(at(rbox(0.012, h, d, 0.004), -w / 2 + 0.006, 0.04, 0), 'glass');
  put(at(rbox(w, 0.03, 0.03, 0.008), 0, h, d / 2 - 0.006), 'blackMtl');
  put(at(cyl(0.11, 0.11, 0.03), w / 2 - 0.28, h - 0.30, -d / 2 + 0.26), 'brass');
}

function plantBuild(w, h) {
  const pr = w / 2 * 0.62;
  put(at(cyl(pr, pr * 0.82, h * 0.26), 0, 0, 0), 'stone');
  put(at(cyl(pr - 0.02, pr - 0.02, 0.03), 0, h * 0.26 - 0.03, 0), 'soil');
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2, rr = pr * (0.3 + Math.random() * 0.8);
    const g = sph(w * 0.20); g.scale(1, 0.7, 1);
    put(at(g, Math.cos(a) * rr, h * (0.42 + Math.random() * 0.5), Math.sin(a) * rr), 'plant');
  }
  put(at(cyl(0.018, 0.024, h * 0.55), 0, h * 0.24, 0), 'plant');
}

/* ───────────────────────── 分发 ───────────────────────── */
const B = {
  rug: (i) => put(at(rbox(i.w, i.h, i.d, 0.02), 0, 0, 0), 'rug'),
  sofa: (i) => seat(i.w, i.d, i.h, i.mat || 'fabric'),
  daybed: (i) => seat(i.w, i.d, i.h, i.mat || 'fabricDk'),
  armchair: (i) => seat(i.w, i.d, i.h, i.mat || 'fabric'),
  table: (i) => tableTop(i.w, i.d, i.h, i.mat || 'walnut', i.legs || 'metal'),
  dtable: (i) => tableTop(i.w, i.d, i.h, i.mat || 'oak', 'wood'),
  desk: (i) => {
    tableTop(i.w, i.d, i.h, i.mat || 'oak', 'metal');
    const n0 = P.length;                                   // 侧挂抽屉柜
    cabinet(0.42, i.d - 0.08, i.h - 0.10, i.mat || 'oak', { doors: 1, kick: 0.04 });
    for (let k = n0; k < P.length; k++) P[k].g.translate(i.w / 2 - 0.26, 0, 0);
  },
  chair: (i) => {
    put(at(rbox(i.w, 0.06, i.d, 0.03), 0, 0.44, 0), i.mat || 'linen');
    put(at(rbox(i.w, 0.46, 0.055, 0.03), 0, 0.44, -i.d / 2 + 0.03), 'walnut');
    legs4(i.w, i.d, 0.44, 'walnut', 0.045, 0.019);
  },
  stool: (i) => {
    put(at(cyl(i.w / 2, i.w / 2, 0.05), 0, i.h - 0.05, 0), 'leather');
    legs4(i.w * 0.9, i.d * 0.9, i.h - 0.05, 'blackMtl', 0.03, 0.015);
    put(at(new THREE.TorusGeometry(i.w * 0.42, 0.011, 6, 18).rotateX(Math.PI / 2), 0, 0.19, 0), 'blackMtl');
  },
  bench: (i) => {
    put(at(rbox(i.w, 0.10, i.d, 0.04), 0, i.h - 0.10, 0), i.mat === 'leather' ? 'leather' : 'linen');
    legs4(i.w, i.d, i.h - 0.10, i.mat === 'leather' ? 'blackMtl' : 'oak', 0.07, 0.022);
  },
  console: (i) => cabinet(i.w, i.d, i.h, i.mat || 'walnut', { doors: i.doors ?? 2 }),
  nightstd: (i) => cabinet(i.w, i.d, i.h, i.mat || 'walnut', { doors: 1, kick: 0.10 }),
  wardrobe: (i) => cabinet(i.w, i.d, i.h, i.mat || 'lacquer', { doors: i.doors ?? 3, kick: 0.05, open: i.open }),
  shelf: (i) => shelfUnit(i.w, i.d, i.h, i.mat || 'oak', i.tiers ?? 4),
  upper: (i) => cabinet(i.w, i.d, i.h, i.mat || 'lacquer', { doors: Math.round(i.w / 0.6), kick: 0.001 }),
  counter: (i) => counterBuild(i.w, i.d, i.h, i.mat || 'lacquer', i),
  island: (i) => {
    counterBuild(i.w, i.d - 0.22, i.h, i.mat || 'walnut', {});
    put(at(rbox(i.w + 0.04, 0.045, i.d + 0.04, 0.006), 0, i.h - 0.045, 0.10), 'stone'); // 出挑吧台面
  },
  fridge: (i) => {
    put(at(rbox(i.w, i.h, i.d, 0.02), 0, 0, 0), 'blackMtl');
    put(at(rbox(i.w - 0.03, i.h * 0.62 - 0.01, 0.02, 0.008), 0, i.h * 0.38, i.d / 2 - 0.008), 'lacquer');
    put(at(rbox(i.w - 0.03, i.h * 0.38 - 0.02, 0.02, 0.008), 0, 0.01, i.d / 2 - 0.008), 'lacquer');
    put(at(cyl(0.012, 0.012, 0.5), i.w / 2 - 0.07, i.h * 0.42, i.d / 2 + 0.016), 'brass');
  },
  washer: (i) => {
    for (let k = 0; k < (i.units || 1); k++) {
      const x = (k - ((i.units || 1) - 1) / 2) * (i.w / (i.units || 1));
      put(at(rbox(i.w / (i.units || 1) - 0.02, i.h, i.d, 0.015), x, 0, 0), 'lacquer');
      put(at(cyl(0.20, 0.20, 0.03).rotateX(Math.PI / 2), x, i.h * 0.52, i.d / 2 - 0.005), 'glass');
      put(at(new THREE.TorusGeometry(0.21, 0.014, 6, 20), x, i.h * 0.52, i.d / 2 - 0.01), 'blackMtl');
    }
  },
  vanity: (i) => {
    cabinet(i.w, i.d, i.h - 0.05, i.mat || 'walnut', { doors: i.twin ? 4 : 2, kick: 0.10 });
    put(at(rbox(i.w + 0.02, 0.05, i.d + 0.02, 0.006), 0, i.h - 0.05, 0), 'stone');
    const n = i.twin ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const x = (k - (n - 1) / 2) * (i.w / 2);
      put(at(rbox(0.40, 0.10, 0.32, 0.06), x, i.h - 0.045, 0.03), 'ceramic');
      put(at(cyl(0.014, 0.014, 0.20), x, i.h, -0.14), 'brass');
    }
  },
  toilet: (i) => toiletBuild(i.w, i.d, i.h),
  tub: (i) => tubBuild(i.w, i.d, i.h),
  shower: (i) => showerBuild(i.w, i.d, i.h),
  tv: (i) => {
    put(at(rbox(i.w, i.h, 0.035, 0.006), 0, 0, 0), 'blackMtl');
    put(at(rbox(i.w - 0.03, i.h - 0.03, 0.012, 0.004), 0, 0.015, 0.02), 'screen');
  },
  mirror: (i) => {
    put(at(rbox(i.w, i.h, 0.03, 0.01), 0, 0, 0), 'brass');
    put(at(rbox(i.w - 0.05, i.h - 0.05, 0.012, 0.008), 0, 0.025, 0.014), 'glass');
  },
  hood: (i) => {
    put(at(rbox(i.w, 0.14, i.d, 0.02), 0, 0, 0), 'blackMtl');
    const g = rbox(i.w * 0.42, i.h - 0.14, i.d * 0.5, 0.02);
    put(at(g, 0, 0.14, -0.02), 'blackMtl');
  },
  pendant: (i) => {
    put(at(cyl(0.006, 0.006, 0.55), 0, i.h, 0), 'blackMtl');
    put(at(rbox(i.w, i.h, i.d, 0.05), 0, 0, 0), 'brass');
    put(at(rbox(i.w - 0.06, 0.02, i.d - 0.04, 0.02), 0, 0.01, 0), 'shade');
  },
  floorlamp: (i) => {
    put(at(cyl(i.w * 0.55, i.w * 0.62, 0.03), 0, 0, 0), 'blackMtl');
    put(at(cyl(0.012, 0.012, i.h - 0.28), 0, 0.03, 0), 'brass');
    put(at(cyl(i.w * 0.62, i.w * 0.50, 0.26, 18), 0, i.h - 0.28, 0), 'shade');
  },
  tablelamp: (i) => {
    put(at(cyl(i.w * 0.42, i.w * 0.48, 0.04), 0, 0, 0), 'brass');
    put(at(cyl(0.014, 0.02, i.h - 0.20), 0, 0.04, 0), 'brass');
    put(at(cyl(i.w * 0.52, i.w * 0.38, 0.20, 16), 0, i.h - 0.20, 0), 'shade');
  },
  plant: (i) => plantBuild(i.w, i.h),
  planter: (i) => {
    put(at(rbox(i.w, i.h * 0.55, i.d, 0.03), 0, 0, 0), 'stone');
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * Math.PI * 2, g = sph(i.w * 0.22); g.scale(1, 0.75, 1);
      put(at(g, Math.cos(a) * i.w * 0.22, i.h * (0.55 + Math.random() * 0.4), Math.sin(a) * i.d * 0.22), 'plant');
    }
  },
  bed: (i) => bedBuild(i.w, i.d, i.h, i.pillows ?? 2),
};

/* ───────────────────────── 装配 ───────────────────────── */
/** 生成单件家具的世界坐标几何（tools/furncheck.mjs 也用它做包围盒校核） */
export function collect(item) {
  const fn = B[item.t];
  if (!fn) { console.warn('[furniture] 未知类型', item.t); return []; }
  P.length = 0;
  fn(item);
  const parts = P.slice();
  const m4 = new THREE.Matrix4()
    .makeRotationY((item.ry || 0) * Math.PI / 180)
    .premultiply(new THREE.Matrix4().makeTranslation(item.x, floorY(item.floor) + (item.y || 0), item.z));
  for (const p of parts) {
    p.g.applyMatrix4(m4);
    if (item.c && p.m === 'rug') p.g.setAttribute('color', tint(p.g, item.c));
  }
  return parts;
}

export function buildFurniture() {
  const groups = {};
  for (const f of [1, 2]) {
    const byMat = new Map();
    for (const item of ITEMS.filter(i => i.floor === f)) {
      for (const { g, m } of collect(item)) {
        if (!byMat.has(m)) byMat.set(m, []);
        byMat.get(m).push(g);
      }
    }
    const grp = new THREE.Group(); grp.name = `furn${f}`;
    for (const [m, list] of byMat) {
      if (!list.length) continue;
      const mat = m === 'rug' ? MAT.rug.clone() : MAT[m];
      if (m === 'rug') mat.vertexColors = true;
      const merged = mergeGeometries(list);
      if (!merged) { console.warn('[furniture] 合并失败，跳过材质', m); continue; }
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = m !== 'rug'; mesh.receiveShadow = true;
      grp.add(mesh);
    }
    groups[f] = grp;
  }
  return groups;
}

/** 给地毯几何写顶点色，实现每块地毯不同颜色而仍能合批 */
function tint(g, hex) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  return new THREE.BufferAttribute(a, 3);
}
