/**
 * 纯 JS（不依赖 Three.js）几何生成器。
 * 输入：src/data/building.js 的房间矩形 → 输出：墙体盒 / 楼板 / 楼梯 / 碰撞体。
 * 视觉网格与碰撞体使用【同一份 boxes】，因此不可能错位。
 * 该模块同时被浏览器端和 node 端测试脚本 (tools/navcheck.mjs) 使用。
 */
import { C, ROOMS, DOORS, WINDOWS, STAIR, SOLIDS, GUARDRAILS } from '../data/building.js';
import { ITEMS, footprint } from '../data/furniture.js';

const EPS = 1e-6;
const uniq = a => [...new Set(a.map(v => +v.toFixed(4)))].sort((p, q) => p - q);
export const floorY = f => (f === 1 ? C.F1_Y : C.F2_Y);

export const bodyRooms = f =>
  ROOMS.filter(r => r.floor === f && r.z0 >= 0 && r.id !== 'understair_f1');

const SIDE = {
  N: { axis: 'x', line: C.LINE_N }, S: { axis: 'x', line: C.LINE_S },
  W: { axis: 'z', line: C.LINE_W }, E: { axis: 'z', line: C.LINE_E },
};

/** 该层所有洞口（门 + 窗），统一为 {axis,line,a,b,y0,y1} 绝对坐标 */
export function openings(f) {
  const fy = floorY(f);
  return [
    ...DOORS.filter(d => d.floor === f).map(d => ({
      id: d.id, axis: d.axis, line: d.line, a: d.pos - d.w / 2, b: d.pos + d.w / 2,
      y0: fy, y1: fy + d.h, kind: 'door',
    })),
    ...WINDOWS.filter(w => w.floor === f).map(w => ({
      id: w.id, axis: SIDE[w.side].axis, line: SIDE[w.side].line,
      a: w.pos - w.w / 2, b: w.pos + w.w / 2,
      y0: fy + w.sill, y1: fy + w.sill + w.h, kind: 'window',
    })),
  ];
}

/**
 * 墙体 = 主体矩形 ∖ 所有房间矩形。
 * 用所有房间边界做网格分解 → 单元格若不在任何房间内即为墙 → 先沿 X 合并再沿 Z 合并。
 * 这个做法保证「不漏墙、不重叠、不侵入房间」，从根上杜绝穿墙 / 房间进不去。
 */
export function rawWalls(f) {
  const rooms = bodyRooms(f);
  const xs = uniq([0, C.OUTER_W, ...rooms.flatMap(r => [r.x0, r.x1])]);
  const zs = uniq([0, C.BODY_D, ...rooms.flatMap(r => [r.z0, r.z1])]);
  const rows = [];
  for (let j = 0; j < zs.length - 1; j++) {
    const z0 = zs[j], z1 = zs[j + 1], zc = (z0 + z1) / 2;
    let run = null;
    for (let i = 0; i < xs.length - 1; i++) {
      const x0 = xs[i], x1 = xs[i + 1], xc = (x0 + x1) / 2;
      const open = rooms.some(r => xc > r.x0 && xc < r.x1 && zc > r.z0 && zc < r.z1);
      if (open) { run = null; continue; }
      if (run && Math.abs(run.x1 - x0) < EPS) run.x1 = x1;
      else { run = { x0, x1, z0, z1 }; rows.push(run); }
    }
  }
  // 沿 Z 合并同 X 跨度且相接的矩形
  const out = [];
  for (const r of rows) {
    const m = out.find(o => Math.abs(o.x0 - r.x0) < EPS && Math.abs(o.x1 - r.x1) < EPS && Math.abs(o.z1 - r.z0) < EPS);
    if (m) m.z1 = r.z1; else out.push({ ...r });
  }
  const fy = floorY(f);
  return out.map(w => ({ ...w, y0: fy, y1: fy + C.CLEAR_H }));
}

/** 在墙体盒上开洞：把被洞口穿过的盒切成 左/右(或前/后) + 洞下 + 洞上 */
function cut(boxes, op) {
  const out = [];
  for (const B of boxes) {
    const thin = op.axis === 'x' ? (B.z1 - B.z0) <= 0.35 : (B.x1 - B.x0) <= 0.35;
    const onLine = op.axis === 'x'
      ? (op.line > B.z0 - EPS && op.line < B.z1 + EPS)
      : (op.line > B.x0 - EPS && op.line < B.x1 + EPS);
    if (!thin || !onLine) { out.push(B); continue; }
    const lo = op.axis === 'x' ? B.x0 : B.z0, hi = op.axis === 'x' ? B.x1 : B.z1;
    const a = Math.max(lo, op.a), b = Math.min(hi, op.b);
    if (b - a <= EPS) { out.push(B); continue; }
    const set = (o, l, h) => (op.axis === 'x' ? { ...o, x0: l, x1: h } : { ...o, z0: l, z1: h });
    if (a - lo > EPS) out.push(set(B, lo, a));
    if (hi - b > EPS) out.push(set(B, b, hi));
    const mid = set(B, a, b);
    if (op.y0 - B.y0 > EPS) out.push({ ...mid, y1: op.y0 });
    if (B.y1 - op.y1 > EPS) out.push({ ...mid, y0: op.y1 });
  }
  return out;
}

export function walls(f) {
  let boxes = rawWalls(f);
  for (const op of openings(f)) boxes = cut(boxes, op);
  return boxes.filter(b => b.x1 - b.x0 > EPS && b.z1 - b.z0 > EPS && b.y1 - b.y0 > EPS);
}

/** 楼板（含二层按洞口挖空） */
export function slabs() {
  const B = { x0: 0, x1: C.OUTER_W, z0: 0, z1: C.BODY_D };
  const v = STAIR.well;
  const f2 = [ // 二层楼板 = 主体 ∖ 梯井洞口，拆成 4 块
    { ...B, z1: v.z0 }, { ...B, z0: v.z1 },
    { x0: 0, x1: v.x0, z0: v.z0, z1: v.z1 }, { x0: v.x1, x1: C.OUTER_W, z0: v.z0, z1: v.z1 },
  ].filter(r => r.x1 - r.x0 > EPS && r.z1 - r.z0 > EPS);
  return {
    ground: [{ ...B, y0: -0.2, y1: 0 }],
    terrace: [{ x0: 0, x1: C.OUTER_W, z0: -C.TERRACE_D, z1: 0, y0: -0.2, y1: 0 }],
    f2: f2.map(r => ({ ...r, y0: C.CLEAR_H, y1: C.FLOOR_TO_FLOOR })),
    balcony: [{ x0: 1.45, x1: 13.45, z0: -C.TERRACE_D, z1: 0, y0: C.CLEAR_H, y1: C.FLOOR_TO_FLOOR }],
    roof: [{ ...B, y0: C.F2_Y + C.CLEAR_H, y1: C.ROOF_Y }],
  };
}

/** 楼梯踏步（视觉） */
export function stairSteps() {
  const s = STAIR, out = [];
  for (let k = 0; k < 8; k++) {
    out.push({ x0: s.flightA.x0, x1: s.flightA.x1, z0: 10.29 - (k + 1) * s.treadD, z1: 10.29 - k * s.treadD, y0: 0, y1: (k + 1) * s.riserH });
    out.push({ x0: s.flightB.x0, x1: s.flightB.x1, z0: 8.05 + k * s.treadD, z1: 8.05 + (k + 1) * s.treadD, y0: 0, y1: 1.55 + (k + 1) * s.riserH });
  }
  out.push({ ...s.landing, y0: 0, y1: s.landing.y }); // 平台
  return out;
}

/** 楼梯坡道支撑高度（与踏步同坡度，供角色平滑上下） */
export function stairSupport(x, z) {
  const s = STAIR, w = s.well;
  if (x <= w.x0 || x >= w.x1 || z <= w.z0 || z >= w.z1) return null;
  if (z <= 8.05) return s.landing.y;
  const t = (z - 8.05) / 2.24;
  return x < (s.flightA.x1 + s.flightB.x0) / 2
    ? 1.55 * (1 - t)          // 第一跑（西）：北高南低
    : 1.55 + 1.55 * t;        // 第二跑（东）：北低南高
}

export const inRect = (x, z, r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
const inBody = (x, z) => x > 0 && x < C.OUTER_W && z > 0 && z < C.BODY_D;

/** 某点所有可站立高度（由低到高） */
export function supports(x, z) {
  const s = [];
  const w = STAIR.well;
  if (inRect(x, z, w)) s.push(stairSupport(x, z));            // 梯井内只认楼梯面
  else if (inBody(x, z) || inRect(x, z, { x0: 0, x1: C.OUTER_W, z0: -C.TERRACE_D, z1: 0 })) s.push(0);
  if ((inBody(x, z) && !inRect(x, z, w)) ||
      inRect(x, z, { x0: 1.45, x1: 13.45, z0: -C.TERRACE_D, z1: 0 })) s.push(C.F2_Y);
  return s.sort((a, b) => a - b);
}

/* ─────────────────── 楼梯扶手 ───────────────────
 * 沿两跑与休息平台连续布置：外侧一根（A跑西墙 → 平台三面 → B跑东墙，全程连续），
 * 内侧两根（贴梯井分隔墙）。高出踏面 0.90m，距墙面 0.055m，Ø0.044 黄铜管。
 * 净宽影响：梯段 1.10m → 0.946m（仍远大于人体直径 0.58m）。 */
export const RAIL = { r: 0.022, h: 0.90, off: 0.055 };

export function handrails() {
  const w = STAIR.well, o = RAIL.off, H = RAIL.h;
  const z0 = 10.25, z1 = 8.05;                       // 梯段起止（底端略收进 0.04m）
  const rampA = z => 1.55 * (1 - (z - 8.05) / 2.24);
  const rampB = z => 1.55 + 1.55 * (z - 8.05) / 2.24;
  const xW = w.x0 + o, xE = w.x1 - o, zN = w.z0 + o;
  const xSpineW = 7.67 - o, xSpineE = 7.92 + o;
  const L = STAIR.landing.y + H;
  return [
    { a: [xW, rampA(z0) + H, z0], b: [xW, rampA(z1) + H, z1], n: [-1, 0, 0] },   // 外侧：A 跑
    { a: [xW, L, z1], b: [xW, L, zN], n: [-1, 0, 0] },                            // 平台西
    { a: [xW, L, zN], b: [xE, L, zN], n: [0, 0, -1] },                            // 平台北
    { a: [xE, L, zN], b: [xE, L, z1], n: [1, 0, 0] },                             // 平台东
    { a: [xE, rampB(z1) + H, z1], b: [xE, rampB(z0) + H, z0], n: [1, 0, 0] },     // 外侧：B 跑
    { a: [xSpineW, rampA(z0) + H, z0], b: [xSpineW, rampA(z1) + H, z1], n: [1, 0, 0] },  // 内侧：A 跑
    { a: [xSpineE, rampB(z1) + H, z1], b: [xSpineE, rampB(z0) + H, z0], n: [-1, 0, 0] }, // 内侧：B 跑
  ];
}

/** 扶手碰撞盒：XZ 精确（扶手是等 XZ 截面的直线段），Y 取整段跨度（保守） */
export function railColliders() {
  const r = RAIL.r;
  return handrails().map(({ a, b }) => ({
    x0: Math.min(a[0], b[0]) - r, x1: Math.max(a[0], b[0]) + r,
    z0: Math.min(a[2], b[2]) - r, z1: Math.max(a[2], b[2]) + r,
    y0: Math.min(a[1], b[1]) - r, y1: Math.max(a[1], b[1]) + r, item: 'handrail',
  }));
}

/* ─────────────────── 门扇 ───────────────────
 * 室内平开门一律【开启 90°】：门扇垂直于墙、贴合页侧立在洞口旁 —— 此时门扇轴对齐，
 * 碰撞 AABB 精确，且能真实反映"门扇占用的空间"，供 navcheck / furncheck 校核。
 * 入户门同样开启 90°。
 * 推拉门：一扇固定 + 一扇推开后叠在其上，停在门洞的 'lo' 半边，另一半通行。 */
export const LEAF_T = 0.045;

export function doorLeaf(d) {
  const fy = floorY(d.floor), a = d.pos - d.w / 2, b = d.pos + d.w / 2;
  if (d.type !== 'swing' && d.type !== 'entry') return null;   // 入户门同样开启 90°
  const hp = d.hinge === 'hi' ? b : a, s = d.side || 1, h = LEAF_T / 2;
  return d.axis === 'x'
    ? { x0: hp - h, x1: hp + h, z0: s > 0 ? d.line : d.line - d.w, z1: s > 0 ? d.line + d.w : d.line,
        y0: fy, y1: fy + d.h, id: d.id, kind: 'swing', hinge: [hp, d.line], side: s }
    : { z0: hp - h, z1: hp + h, x0: s > 0 ? d.line : d.line - d.w, x1: s > 0 ? d.line + d.w : d.line,
        y0: fy, y1: fy + d.h, id: d.id, kind: 'swing', hinge: [d.line, hp], side: s };
}

export function sliderPanels(d) {
  if (d.type !== 'slider') return null;
  const fy = floorY(d.floor), a = d.pos - d.w / 2, half = d.w / 2, t = 0.07;
  return d.axis === 'x'
    ? { x0: a, x1: a + half, z0: d.line - t, z1: d.line + t, y0: fy, y1: fy + d.h, id: d.id, kind: 'slider' }
    : { z0: a, z1: a + half, x0: d.line - t, x1: d.line + t, y0: fy, y1: fy + d.h, id: d.id, kind: 'slider' };
}

/** 门扇 / 推拉扇的碰撞盒（与渲染几何同源） */
export function doorColliders() {
  return DOORS.map(d => doorLeaf(d) || sliderPanels(d)).filter(Boolean);
}

/** 大件家具的碰撞盒（小摆件 solid:false，不参与） */
export function furnitureColliders() {
  return ITEMS.filter(i => i.solid !== false).map(i => {
    const y0 = floorY(i.floor);
    return { ...footprint(i), y0, y1: y0 + i.h, item: i.t };
  });
}

/** 全部碰撞体（墙 + 实体构件 + 阳台栏板 + 大件家具） */
export function colliders() {
  const out = [...walls(1), ...walls(2), ...SOLIDS.map(s => ({ ...s })),
               ...furnitureColliders(), ...doorColliders(), ...railColliders()];
  for (const g of GUARDRAILS) {
    const [ax, az] = g.a, [bx, bz] = g.b, t = 0.08, y = floorY(g.floor);
    out.push({
      x0: Math.min(ax, bx) - (ax === bx ? t : 0), x1: Math.max(ax, bx) + (ax === bx ? t : 0),
      z0: Math.min(az, bz) - (az === bz ? t : 0), z1: Math.max(az, bz) + (az === bz ? t : 0),
      y0: y, y1: y + g.h,
    });
  }
  return out;
}
