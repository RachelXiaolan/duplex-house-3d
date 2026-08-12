/**
 * 可达性洪水填充测试 —— 用与运行时【完全相同】的碰撞体和支撑面，
 * 以真实人体半径 0.29m 模拟"能不能走进去"，专治：厨房进不去 / 门洞被墙堵 / 楼梯走不通。
 * 用法: node tools/navcheck.mjs
 */
import { ROOMS, DOORS } from '../src/data/building.js';
import { colliders, supports, walls, bodyRooms } from '../src/geom/build.js';

const R = 0.29, HEAD = 1.70, STEP = 0.30, G = 0.10;
const X0 = -1.7, X1 = 16.6, Z0 = -1.7, Z1 = 14.9;
const NX = Math.round((X1 - X0) / G), NZ = Math.round((Z1 - Z0) / G);
const COLS = colliders();
let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };

// --- 空间哈希加速 ---
const CELL = 1.0, hash = new Map();
for (const b of COLS)
  for (let i = Math.floor((b.x0 - R) / CELL); i <= Math.floor((b.x1 + R) / CELL); i++)
    for (let j = Math.floor((b.z0 - R) / CELL); j <= Math.floor((b.z1 + R) / CELL); j++) {
      const k = i + ',' + j; if (!hash.has(k)) hash.set(k, []); hash.get(k).push(b);
    }
const near = (x, z) => hash.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || [];

function free(x, z, h) {
  for (const b of near(x, z)) {
    if (!(b.y0 < h + HEAD - 0.05 && b.y1 > h + STEP)) continue;
    const dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1);
    if (dx * dx + dz * dz < R * R) return false;
  }
  return true;
}

// --- 节点 = (i, j, 支撑面序号) ---
const key = (i, j, k) => (i * NZ + j) * 4 + k;
const cx = i => X0 + (i + 0.5) * G, cz = j => Z0 + (j + 0.5) * G;
const supCache = new Map();
const sup = (i, j) => {
  const k = i * NZ + j; let v = supCache.get(k);
  if (v === undefined) { v = supports(cx(i), cz(j)).filter(h => free(cx(i), cz(j), h)); supCache.set(k, v); }
  return v;
};

const seen = new Set(), q = [];
const push = (i, j, k) => { const t = key(i, j, k); if (!seen.has(t)) { seen.add(t); q.push([i, j, k]); } };

// 起点：玄关中心（一层）
const st = ROOMS.find(r => r.id === 'foyer_f1');
const si = Math.floor(((st.x0 + st.x1) / 2 - X0) / G), sj = Math.floor(((st.z0 + st.z1) / 2 - Z0) / G);
console.log('[可达性 — 从玄关出发，人体半径 0.29m，最大跨步 0.30m]');
ok(sup(si, sj).length > 0, '起点玄关中心可站立');
sup(si, sj).forEach((_, k) => push(si, sj, k));

while (q.length) {
  const [i, j, k] = q.pop(), h = sup(i, j)[k];
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const ni = i + di, nj = j + dj;
    if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue;
    sup(ni, nj).forEach((h2, k2) => { if (Math.abs(h2 - h) <= STEP) push(ni, nj, k2); });
  }
}

const reachable = (x, z, h) => {
  const i = Math.floor((x - X0) / G), j = Math.floor((z - Z0) / G);
  return sup(i, j).some((hh, k) => seen.has(key(i, j, k)) && (h === undefined || Math.abs(hh - h) < 0.15));
};
function roomReach(r) {
  for (let x = r.x0 + R; x < r.x1 - R + 1e-9; x += G)
    for (let z = r.z0 + R; z < r.z1 - R + 1e-9; z += G)
      if (reachable(x, z)) return true;
  return false;
}

const skip = new Set(['understair_f1', 'void_f2']);
const bad = ROOMS.filter(r => !skip.has(r.id) && !roomReach(r));
ok(bad.length === 0, `全部 ${ROOMS.length - skip.size} 个空间可达${bad.length ? '：未达 ' + bad.map(r => r.name + '(' + r.id + ')').join(', ') : ''}`);

console.log('\n[关键节点]');
const F2 = 3.10;
const pts = [
  ['1F 厨房', 13.60, 5.60, 0], ['1F 客厅', 5.60, 2.20, 0], ['1F 餐厅', 9.30, 5.20, 0],
  ['1F 客卧/书房', 1.50, 9.50, 0], ['1F 多功能室', 4.10, 9.50, 0], ['1F 公卫', 12.10, 8.00, 0],
  ['1F 洗衣房', 13.00, 9.70, 0], ['1F 储物间', 13.00, 11.90, 0], ['1F 露台', 2.00, -0.75, 0],
  ['梯段起步(1F)', 7.12, 10.15], ['楼梯平台', 7.8, 7.5], ['梯段顶(2F)', 8.47, 10.15],
  ['2F 楼梯厅', 7.80, 11.70, F2], ['2F 主卧', 2.00, 7.60, F2], ['2F 衣帽间', 1.70, 11.30, F2],
  ['2F 主卫', 4.90, 11.30, F2], ['2F 次卧2', 1.00, 1.90, F2], ['2F 次卧3', 11.80, 1.90, F2],
  ['2F 家庭起居室', 7.40, 2.50, F2], ['2F 阳台', 7.40, -0.75, F2], ['2F 公卫', 13.00, 7.60, F2],
  ['2F Linen', 12.00, 9.90, F2], ['2F 上层休息厅', 12.00, 11.70, F2], ['2F 北走廊', 10.20, 5.80, F2],
];
pts.forEach(([n, x, z, h]) => ok(reachable(x, z, h), `${n} (${x}, ${z})${h !== undefined ? ' @Y=' + h : ''} 可达`));

// ---- 家具布置后：每个房间的可达净面积 ----
console.log('\n[家具布置后 · 房间可达净面积]');
const CELL_A = G * G;
const tight = [];
for (const r of ROOMS) {
  if (skip.has(r.id)) continue;
  const area = (r.x1 - r.x0) * (r.z1 - r.z0);
  const h = r.floor === 1 ? 0 : F2;
  let free = 0;
  for (let x = r.x0 + G / 2; x < r.x1; x += G)
    for (let z = r.z0 + G / 2; z < r.z1; z += G)
      if (reachable(x, z, (r.z1 <= 0 || r.id === 'stair_f1') ? undefined : h)) free += CELL_A;
  const pct = free / area * 100;
  const need = area > 8 ? 0.22 : 0.12;             // 大房间 ≥22%、小房间 ≥12% 可站立
  if (free / area < need || free < 0.8) tight.push(`${r.name} ${free.toFixed(1)}/${area.toFixed(1)}m² (${pct.toFixed(0)}%)`);
}
ok(tight.length === 0, `每个房间都留有足够可站立面积 ${tight.join('; ')}`);

// ---- 每扇门两侧都能站人（家具没堵门） ----
console.log('\n[门洞两侧通行性]');
const blocked = [];
const outside = (x, z) => z < -1.45 || z > 13.15 || x < 0.05 || x > 14.85;
for (const d of DOORS) {
  const off = 0.55;
  // 沿门洞宽度采样 3 处，只要有一处两侧都能站人即算通行
  // 楼梯口两侧高度不同，不限高；其余门按本层完成面判定，避免被另一层误判为可达
  const hh = /stair/.test(d.id) ? undefined : (d.floor === 1 ? 0 : F2);
  const passable = [-1, 0, 1].some(k => {
    const p = d.pos + k * d.w / 3;
    const sides = d.axis === 'x' ? [[p, d.line - off], [p, d.line + off]]
                                 : [[d.line - off, p], [d.line + off, p]];
    return sides.every(([x, z]) => outside(x, z) || reachable(x, z, hh));
  });
  if (!passable) blocked.push(`${d.id}(${d.note})`);
}
ok(blocked.length === 0, `${DOORS.length} 扇门两侧均可站立、无家具堵门 ${blocked.join(', ')}`);

console.log('\n[高度连续性 — 沿楼梯中线采样]');
let prev = null, maxJump = 0;
for (let z = 10.28; z >= 8.06; z -= 0.05) { const h = supports(7.12, z)[0]; if (prev !== null) maxJump = Math.max(maxJump, Math.abs(h - prev)); prev = h; }
for (let z = 8.06; z <= 10.28; z += 0.05) { const h = supports(8.47, z)[0]; if (prev !== null) maxJump = Math.max(maxJump, Math.abs(h - prev)); prev = h; }
ok(maxJump < 0.06, `第一跑→平台→第二跑 Y 连续，最大步进 ${maxJump.toFixed(4)}m（无瞬移）`);
ok(Math.abs(supports(8.47, 10.28)[0] - 3.10) < 0.02, `第二跑顶端 Y=${supports(8.47, 10.28)[0].toFixed(3)} ≈ 二层完成面 3.100`);
ok(Math.abs(supports(7.12, 10.28)[0]) < 0.02, `第一跑起步 Y=${supports(7.12, 10.28)[0].toFixed(3)} ≈ 一层完成面 0.000`);

console.log('\n[墙体生成合法性]');
const intrude = [];
for (const f of [1, 2]) {
  const rs = bodyRooms(f);
  for (const w of walls(f)) for (const r of rs) {
    const ox = Math.min(w.x1, r.x1) - Math.max(w.x0, r.x0), oz = Math.min(w.z1, r.z1) - Math.max(w.z0, r.z0);
    if (ox > 1e-4 && oz > 1e-4) intrude.push(`${f}F 墙[${w.x0},${w.z0}] 侵入 ${r.name}`);
  }
}
ok(intrude.length === 0, `墙体不侵入任何房间净空 ${intrude.slice(0, 3).join('; ')}`);
console.log(`  · 墙体盒：1F ${walls(1).length} / 2F ${walls(2).length}，碰撞体合计 ${COLS.length}，可达节点 ${seen.size}`);

console.log(`\n===== ${fail === 0 ? '全部通过' : fail + ' 项未通过'} =====`);
process.exit(fail ? 1 : 0);
