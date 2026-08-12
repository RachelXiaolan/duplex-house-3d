/**
 * 家具几何校核：实际生成的网格不得超出它在 furniture.js 里声明的 footprint 与高度，
 * 也不得穿出房间净空/楼层。用 node 跑（stub 掉 canvas），无需浏览器。
 */
const fakeCtx = new Proxy({}, { get: (_, k) => {
  if (k === 'createImageData' || k === 'getImageData')
    return (a, b, w, h) => { const W = w ?? a ?? 1, H = h ?? b ?? 1; return { data: new Uint8ClampedArray(W * H * 4), width: W, height: H }; };
  if (k === 'canvas') return { width: 1, height: 1 };
  return () => {};
} });
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => fakeCtx }) };
globalThis.devicePixelRatio = 1;

const THREE = await import('three');
const { ITEMS, footprint } = await import('../src/data/furniture.js');
const { collect } = await import('../src/scene/furniture.js');
const { C, DOORS } = await import('../src/data/building.js');
const { doorLeaf, sliderPanels, furnitureColliders } = await import('../src/geom/build.js');

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };
const TOL = 0.16;   // 平面容差：把手 / 台面出挑 / 床头板厚度
const TOLY = 0.90;  // 竖向容差：床头板、龙头、吊灯吊杆、靠背垫等允许高于碰撞盒
                    // （碰撞盒高度 h 描述的是"挡人的体量"，不是造型最高点）

console.log('[家具几何 vs 声明尺寸]');
const bad = [];
for (const it of ITEMS) {
  const box = new THREE.Box3();
  for (const { g } of collect(it)) { g.computeBoundingBox(); box.union(g.boundingBox); }
  if (box.isEmpty()) { bad.push(`${it.t}@(${it.x},${it.z}) 无几何`); continue; }
  const fp = footprint(it), fy = it.floor === 1 ? 0 : C.FLOOR_TO_FLOOR;
  let over = [
    ['x-', fp.x0 - box.min.x], ['x+', box.max.x - fp.x1],
    ['z-', fp.z0 - box.min.z], ['z+', box.max.z - fp.z1],
    ['y-', fy - box.min.y],
  ].filter(([, v]) => v > TOL);
  const yOver = box.max.y - (fy + (it.y || 0) + it.h);
  if (yOver > TOLY) over.push(['y+', yOver]);
  if (over.length) bad.push(`${it.t}@(${it.x},${it.z},${it.floor}F) 超出 ${over.map(([k, v]) => k + (v).toFixed(2)).join(' ')}`);
  if (box.max.y > fy + C.CLEAR_H + 0.01) bad.push(`${it.t}@(${it.x},${it.z},${it.floor}F) 顶面 ${box.max.y.toFixed(2)} 超净高`);
}
ok(bad.length === 0, `${ITEMS.length} 件家具几何均在声明范围内（平面 ±${TOL}m、竖向 +${TOLY}m、且不超净高）\n     ${bad.join('\n     ')}`);
// ── 门扇开启后不得碰到家具（规范：门扇开启不碰家具） ──
console.log('\n[门扇开启 vs 家具]');
const FURN = furnitureColliders();
const hit = [];
for (const d of DOORS) {
  const L = doorLeaf(d) || sliderPanels(d);
  if (!L) continue;
  for (const b of FURN) {
    if (b.y0 >= L.y1 || b.y1 <= L.y0) continue;
    const ox = Math.min(L.x1, b.x1) - Math.max(L.x0, b.x0);
    const oz = Math.min(L.z1, b.z1) - Math.max(L.z0, b.z0);
    if (ox > 1e-3 && oz > 1e-3) hit.push(`${d.id}(${d.note}) 撞到 ${b.item}`);
  }
}
ok(hit.length === 0, `${DOORS.filter(d => ['swing','entry','slider'].includes(d.type)).length} 扇门扇/推拉扇开启后均不碰家具 ${hit.join('; ')}`);

console.log(`\n===== ${fail === 0 ? '全部通过' : fail + ' 项未通过'} =====`);
process.exit(fail ? 1 : 0);
