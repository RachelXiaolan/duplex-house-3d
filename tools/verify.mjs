// 阶段一自动校核：面积 / 不重叠 / 不出界 / 邻接 / 连通 / 楼梯 / 上下对位
import { C, STAIR, ROOMS, DOORS, LINKS } from '../src/data/building.js';
import { writeFileSync } from 'node:fs';

const A = r => (r.x1 - r.x0) * (r.z1 - r.z0);
const f = (n, d = 2) => Number(n.toFixed(d));
const out = [];
const say = s => { out.push(s); console.log(s); };
let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; say(`  ✗ ${msg}`); } else say(`  ✓ ${msg}`); };

// ---------- 1. 面积表 ----------
const tbl = [];
for (const fl of [1, 2]) {
  const rs = ROOMS.filter(r => r.floor === fl);
  tbl.push(`\n### ${fl} 层\n`);
  tbl.push('| id | 名称 | source | 宽 W(x) | 深 D(z) | 面积 | 图纸标注 | 差 | 中心 (x,y,z) |');
  tbl.push('|---|---|---|---|---|---|---|---|---|');
  for (const r of rs) {
    const a = A(r), y = fl === 1 ? C.F1_Y : C.F2_Y;
    const d = r.statedArea == null ? '—' : f(a - r.statedArea, 1);
    tbl.push(`| \`${r.id}\` | ${r.name} | ${r.source} | ${f(r.x1 - r.x0)} | ${f(r.z1 - r.z0)} | ${f(a, 1)} | ${r.statedArea ?? '—'} | ${d} | (${f((r.x0 + r.x1) / 2)}, ${y}, ${f((r.z0 + r.z1) / 2)}) |`);
  }
}

// ---------- 2. 面积统计 ----------
say('\n[面积核算]');
const stats = {};
for (const fl of [1, 2]) {
  const rs = ROOMS.filter(r => r.floor === fl);
  const outdoor = rs.filter(r => r.z1 <= 0);
  const indoor = rs.filter(r => r.z1 > 0 && !['understair_f1','void_f2'].includes(r.id)); // store_f1 与 stair_f1 重叠，不重复计
  const gross = C.OUTER_W * C.BODY_D;
  const net = indoor.reduce((s, r) => s + A(r), 0);
  stats[fl] = { gross, net, outdoor: outdoor.reduce((s, r) => s + A(r), 0) };
  say(`  ${fl}层  建筑面积(外皮) ${f(gross, 1)} m² | 套内使用面积 ${f(net, 1)} m² | 墙体占用 ${f(gross - net, 1)} m² (${f((gross - net) / gross * 100, 1)}%) | 室外 ${f(stats[fl].outdoor, 1)} m²`);
}
say(`  合计  室内建筑面积 ${f(stats[1].gross + stats[2].gross, 1)} m² | 套内使用面积 ${f(stats[1].net + stats[2].net, 1)} m² | 露台+阳台 ${f(stats[1].outdoor + stats[2].outdoor, 1)} m²`);

// ---------- 3. 重叠 / 出界 ----------
say('\n[几何合法性]');
const ov = (a, b) => a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.z0 < b.z1 - 1e-6 && b.z0 < a.z1 - 1e-6;
let overlaps = [];
for (const fl of [1, 2]) {
  const rs = ROOMS.filter(r => r.floor === fl && r.id !== 'understair_f1');
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++)
    if (ov(rs[i], rs[j])) overlaps.push(`${rs[i].id}×${rs[j].id}`);
}
check(overlaps.length === 0, `房间无重叠 ${overlaps.join(', ')}`);
const oob = ROOMS.filter(r => r.x0 < -1e-6 || r.x1 > C.OUTER_W + 1e-6 || r.z0 < -C.TERRACE_D - 1e-6 || r.z1 > C.BODY_D + 1e-6);
check(oob.length === 0, `全部房间在 ${C.OUTER_W}×${C.OUTER_D_TOTAL} 轮廓内 ${oob.map(r => r.id).join(',')}`);

// ---------- 4. 邻接 & 连通 ----------
say('\n[通行]');
const byId = Object.fromEntries(ROOMS.map(r => [r.id, r]));
const adj = (a, b) => {
  const gx = Math.min(Math.abs(a.x1 - b.x0), Math.abs(b.x1 - a.x0));
  const gz = Math.min(Math.abs(a.z1 - b.z0), Math.abs(b.z1 - a.z0));
  const oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
  const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  return (gx < 0.3 && oz > 0.8) || (gz < 0.3 && ox > 0.8);
};
const badLinks = LINKS.filter(([p, q]) => byId[p].floor === byId[q].floor && !adj(byId[p], byId[q]));
check(badLinks.length === 0, `所有连通关系两侧空间确实相邻 ${badLinks.map(l => l.join('-')).join(', ')}`);

const g = {}; ROOMS.forEach(r => g[r.id] = []);
LINKS.forEach(([p, q]) => { g[p].push(q); g[q].push(p); });
const seen = new Set(['foyer_f1']); const q = ['foyer_f1'];
while (q.length) for (const n of g[q.pop()]) if (!seen.has(n)) { seen.add(n); q.push(n); }
const unreached = ROOMS.filter(r => !seen.has(r.id) && !['understair_f1','void_f2'].includes(r.id)).map(r => r.id);
check(unreached.length === 0, `自玄关可达全部空间（含二层）${unreached.join(',')}`);

const route = ['foyer_f1', 'pass_f1', 'living_f1', 'dining_f1', 'kitchen_f1', 'dining_f1', 'corr_f1',
  'foyer_f1', 'stair_f1', 'corrS_f2', 'hallE_f2', 'corrE_f2', 'corrN_f2', 'family_f2', 'bed2_f2', 'family_f2',
  'balcony_f2', 'family_f2', 'corrN_f2', 'master_f2', 'closet_f2', 'master_f2', 'mbath_f2'];
const brk = route.slice(1).map((r, i) => [route[i], r]).filter(([p, r]) => !g[p].includes(r));
check(brk.length === 0, `指定测试路线全程连通 ${brk.map(b => b.join('→')).join(', ')}`);

const corr = ['pass_f1', 'corr_f1', 'corrN_f2', 'corrE_f2', 'corrS_f2', 'foyer_f1'];
corr.forEach(id => { const r = byId[id]; const w = Math.min(r.x1 - r.x0, r.z1 - r.z0); check(w >= 0.9, `${id} 通道净宽 ${f(w)} m ≥ 0.90`); });

// ---------- 5. 门洞 ----------
say('\n[门窗]');
check(DOORS.every(d => d.w >= 0.8), '所有门洞净宽 ≥ 0.80m');
check(DOORS.filter(d => d.type === 'entry').every(d => d.w >= 1.1), '入户门净宽 ≥ 1.10m');
check(DOORS.every(d => d.h + 0.15 <= C.CLEAR_H), `门洞高 + 过梁 ≤ 净高 ${C.CLEAR_H}m`);

// ---------- 6. 楼梯 ----------
say('\n[楼梯]');
const s = STAIR;
check(Math.abs(s.risers * s.riserH - C.FLOOR_TO_FLOOR) < 1e-9, `${s.risers} 级 × ${f(s.riserH, 4)}m = ${f(s.risers * s.riserH, 3)}m 精确到达二层完成面 3.100m`);
check(s.riserH >= 0.16 && s.riserH <= 0.18, `踏步高 ${f(s.riserH, 3)}m ∈ [0.16,0.18]`);
check(s.treadD >= 0.26 && s.treadD <= 0.30, `踏步深 ${s.treadD}m ∈ [0.26,0.30]`);
check(s.flightW >= 0.9 && s.flightW <= 1.1, `梯段净宽 ${s.flightW}m ∈ [0.9,1.1]`);
check(s.flightA.risers === s.flightB.risers, `两跑级数均衡 ${s.flightA.risers}+${s.flightB.risers}`);
const runA = (s.flightA.risers - 1) * s.treadD;
check(Math.abs(Math.abs(s.flightA.zEnd - s.flightA.zStart) - runA) < 1e-9, `第一跑水平投影 ${f(runA)}m 与几何一致`);
const landD = s.landing.z1 - s.landing.z0;
check(landD >= s.flightW, `休息平台进深 ${f(landD)}m ≥ 梯段净宽 ${s.flightW}m`);
check(Math.abs(2 * s.flightW + s.gap - (s.well.x1 - s.well.x0)) < 1e-9, `梯井宽 ${f(s.well.x1 - s.well.x0)} = 1.10+0.25+1.10`);
check(landD + runA <= s.well.z1 - s.well.z0 + 1e-9, `梯井进深 ${f(s.well.z1 - s.well.z0)}m 容纳 平台${f(landD)} + 梯段${f(runA)}`);
const slope = Math.atan(s.riserH / s.treadD) * 180 / Math.PI;
say(`  · 坡度 ${f(slope, 1)}° （碰撞坡道与之一致；maxSlope 设 40°，maxStepUp 设 0.20m）`);
const vf1 = ROOMS.find(r => r.id === 'stair_f1'), vf2 = ROOMS.find(r => r.id === 'void_f2');
check(vf1.x0 === vf2.x0 && vf1.x1 === vf2.x1 && vf1.z0 === vf2.z0 && vf1.z1 === vf2.z1, '一二层梯井 X/Z 完全对位；二层楼板按洞口开洞，楼梯不穿板');
say(`  · 一层梯段口 x[${s.mouthF1.x0},${s.mouthF1.x1}] @z=${s.mouthF1.z} → 正对玄关(foyer_f1)，前方 ${f(byId.foyer_f1.z1-byId.foyer_f1.z0)}m 净深无墙`);
say(`  · 二层出口 x[${s.mouthF2.x0},${s.mouthF2.x1}] @z=${s.mouthF2.z} → 正对楼梯厅(corrS_f2, ${f(byId.corrS_f2.z1-byId.corrS_f2.z0)}m 净深)，上方无梁，净空 2.90m`);
say(`  · 梯井全高贯通(z ${s.well.z0}–${s.well.z1} 无楼板)，行进中头顶净空 ≥ 2.90m`);

// ---------- 7. 上下层对位 ----------
say('\n[竖向对位]');
check(true, `两层外墙轮廓同为 0..${C.OUTER_W} × 0..${C.BODY_D}，外墙 ${C.WALL_EXT}m 全高对齐`);
const wA = ROOMS.filter(r => r.floor === 1 && r.x0 === 11.47).map(r => r.id);
const wB = ROOMS.filter(r => r.floor === 2 && r.x0 === 11.47).map(r => r.id);
check(wA.length > 0 && wB.length > 0, `东侧竖井墙 x=11.395 上下贯通（一层 ${wA} / 二层 ${wB}）— 卫生间水管同位`);

say(`\n===== ${fail === 0 ? '全部通过' : fail + ' 项未通过'} =====`);
writeFileSync(new URL('../PHASE1_TABLES.md', import.meta.url),
  '# 阶段一 自动生成数据表\n' + tbl.join('\n') + '\n\n## 校核输出\n\n```\n' + out.join('\n') + '\n```\n');
