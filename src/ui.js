/** 加载页、提示条、户型图 Overlay（可缩放 / 可拖动） */
import { C, ROOMS, STAIR } from './data/building.js';

const $ = s => document.querySelector(s);

export const loader = {
  set(p, txt) { $('#bar i').style.right = (100 - Math.round(p * 100)) + '%'; if (txt) $('#ltxt').textContent = txt; },
  fail(msg) { $('#ltxt').textContent = '加载失败'; $('#lerr').innerHTML = msg; },
  hide() { const el = $('#loader'); el.classList.add('hide'); setTimeout(() => el.remove(), 700); },
};

let hintTimer;
export function hint(html, ms = 0) {
  const el = $('#hint');
  el.innerHTML = html; el.style.opacity = html ? '.9' : '0';
  clearTimeout(hintTimer);
  if (ms) hintTimer = setTimeout(() => (el.style.opacity = '0'), ms);
}
export const hud = t => ($('#hud').innerHTML = t);

/* ---------------------------------------------------------------- 户型图 */
const PAL = { 客厅: '#efe6d8', 餐厅: '#efe6d8', 厨房: '#e6e2da', 客卧: '#eae4d6', 主卧: '#eae4d6', 次卧: '#eae4d6', 卫: '#d9e6ea', 洗衣: '#d9e6ea', 储物: '#e2ddd4', Linen: '#e2ddd4', 阳台: '#e4e8e0', 露台: '#e4e8e0', 楼梯: '#e0d3bd', 走廊: '#f2efe9', 过道: '#f2efe9', 玄关: '#f2efe9', 家庭: '#efe6d8', 衣帽: '#eae4d6', 多功能: '#eae4d6', 休息厅: '#f2efe9' };
export const roomFill = n => Object.entries(PAL).find(([k]) => n.includes(k))?.[1] || '#f2efe9';

/** 用当前建筑数据绘制概念户型图（与 3D 模型 100% 同源） */
export function planSVG() {
  const S = 34, PAD = 30, GAPX = 60;
  const W = C.OUTER_W * S, H = (C.BODY_D + C.TERRACE_D) * S;
  const dx = f => PAD + (f - 1) * (W + GAPX), dy = PAD + 26;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * 2 + GAPX + PAD * 2}" height="${H + PAD * 2 + 58}" font-family="-apple-system,PingFang SC,sans-serif">
  <rect width="100%" height="100%" fill="#fbf9f6"/>`;
  for (const f of [1, 2]) {
    const ox = dx(f), oy = dy + C.TERRACE_D * S;
    s += `<text x="${ox + W / 2}" y="${dy - 8}" text-anchor="middle" font-size="15" font-weight="600" fill="#2b2620">${f === 1 ? '一层平面图 / FIRST FLOOR' : '二层平面图 / SECOND FLOOR'}</text>`;
    s += `<rect x="${ox}" y="${oy}" width="${W}" height="${C.BODY_D * S}" fill="#fff" stroke="#2b2620" stroke-width="3"/>`;
    for (const r of ROOMS.filter(r => r.floor === f)) {
      const x = ox + r.x0 * S, y = oy + r.z0 * S, w = (r.x1 - r.x0) * S, h = (r.z1 - r.z0) * S;
      const a = ((r.x1 - r.x0) * (r.z1 - r.z0)).toFixed(1);
      const isVoid = r.id === 'void_f2' || r.id === 'understair_f1';
      s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${isVoid ? '#fff' : roomFill(r.name)}" stroke="#8d857a" stroke-width="1" ${isVoid ? 'stroke-dasharray="4 3"' : ''}/>`;
      if (w > 44 && h > 26) s += `<text x="${x + w / 2}" y="${y + h / 2 - 2}" text-anchor="middle" font-size="10.5" fill="#2b2620">${r.name}</text>
        <text x="${x + w / 2}" y="${y + h / 2 + 11}" text-anchor="middle" font-size="9" fill="#7a7268">${a} m²</text>`;
    }
    // 楼梯踏步示意
    const st = STAIR;
    for (let k = 0; k < 8; k++) {
      s += `<line x1="${ox + st.flightA.x0 * S}" y1="${oy + (10.29 - k * st.treadD) * S}" x2="${ox + st.flightA.x1 * S}" y2="${oy + (10.29 - k * st.treadD) * S}" stroke="#9c7449" stroke-width="1"/>`;
      s += `<line x1="${ox + st.flightB.x0 * S}" y1="${oy + (8.05 + k * st.treadD) * S}" x2="${ox + st.flightB.x1 * S}" y2="${oy + (8.05 + k * st.treadD) * S}" stroke="#9c7449" stroke-width="1"/>`;
    }
    s += `<text x="${ox + 7.12 * S}" y="${oy + 9.6 * S}" text-anchor="middle" font-size="10" fill="#9c7449">${f === 1 ? '▲ UP' : ''}</text>`;
    s += `<text x="${ox + 8.47 * S}" y="${oy + 9.6 * S}" text-anchor="middle" font-size="10" fill="#9c7449">${f === 2 ? '▼ DOWN' : ''}</text>`;
    // 总尺寸
    s += `<text x="${ox + W / 2}" y="${oy + C.BODY_D * S + 20}" text-anchor="middle" font-size="10" fill="#7a7268">14 900</text>`;
    s += `<text x="${ox - 8}" y="${oy + C.BODY_D * S / 2}" text-anchor="middle" font-size="10" fill="#7a7268" transform="rotate(-90 ${ox - 8} ${oy + C.BODY_D * S / 2})">13 200</text>`;
  }
  return s + '</svg>';
}

export function initPlan(onClose) {
  const wrap = $('#planwrap'), vp = $('#planvp');
  let scale = 1, tx = 0, ty = 0, w = 0, h = 0, drag = null;
  const apply = () => (wrap.style.transform =
    `translate(${tx - w * scale / 2}px,${ty - h * scale / 2}px) scale(${scale})`);
  const fit = () => {
    if (!w || !h || vp.clientWidth < 10) return;          // 面板尚未显示时不计算
    const k = Math.min((vp.clientWidth - 60) / w, (vp.clientHeight - 130) / h);
    scale = Math.max(0.05, Math.min(1, k)); tx = 0; ty = 0; apply();
  };

  // 优先使用用户放置的原始图纸 public/floorplan.png；缺失则用同源概念图
  const img = new Image();
  img.onload = () => {
    wrap.innerHTML = ''; wrap.appendChild(img);
    w = img.naturalWidth; h = img.naturalHeight;
    wrap.style.transformOrigin = '0 0'; fit();
    $('#plannote').innerHTML = '原始上传图纸（等比 Overlay，未重绘 / 未 OCR 替换）';
  };
  img.onerror = () => {
    wrap.innerHTML = planSVG();
    const svg = wrap.querySelector('svg');
    w = +svg.getAttribute('width'); h = +svg.getAttribute('height');
    fit();
    $('#plannote').innerHTML = '<b>概念参考方案 · 非施工图</b><br>本图由 3D 模型的同一份建筑数据实时绘制。'
      + '如需叠加你的原始图纸，把它命名为 <code>floorplan.png</code> 放到 <code>public/</code> 即可自动替换。';
  };
  img.src = import.meta.env.BASE_URL + 'floorplan.png';

  vp.addEventListener('wheel', e => {
    e.preventDefault();
    const k = Math.exp(-e.deltaY * 0.0015);
    scale = Math.max(0.15, Math.min(6, scale * k)); apply();
  }, { passive: false });
  vp.addEventListener('pointerdown', e => { drag = { x: e.clientX - tx, y: e.clientY - ty }; vp.classList.add('drag'); vp.setPointerCapture(e.pointerId); });
  vp.addEventListener('pointermove', e => { if (!drag) return; tx = e.clientX - drag.x; ty = e.clientY - drag.y; apply(); });
  vp.addEventListener('pointerup', () => { drag = null; vp.classList.remove('drag'); });
  $('#planbar').addEventListener('click', e => {
    const p = e.target.dataset.p; if (!p) return;
    if (p === 'fit') fit(); else { scale = Math.max(0.15, Math.min(6, scale * (p === 'in' ? 1.3 : 1 / 1.3))); apply(); }
  });
  $('#planclose').addEventListener('click', onClose);
  addEventListener('resize', fit);
  return {
    open: () => { $('#plan').classList.add('show'); fit(); requestAnimationFrame(fit); },
    close: () => $('#plan').classList.remove('show'),
  };
}
