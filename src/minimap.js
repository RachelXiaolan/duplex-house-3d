/**
 * 第一人称小地图：北向上固定，显示当前楼层平面 + 角色位置 + 视锥方向 + 所在房间名。
 * 两层的静态底图各烘焙一次到离屏 canvas，每帧只 blit 一次 + 画一个箭头，开销可忽略。
 */
import { C, ROOMS, STAIR } from './data/building.js';
import { walls } from './geom/build.js';
import { roomFill } from './ui.js';

const SIZE = 188, PAD = 9;
const X0 = 0, X1 = C.OUTER_W, Z0 = -C.TERRACE_D, Z1 = C.BODY_D;
const FOV = 70 * Math.PI / 180;
const STAIR_MID = 1.55;   // 到达休息平台高度即视为进入二层图面

export class Minimap {
  constructor(el) {
    this.el = el;
    this.cv = el.querySelector('canvas');
    this.label = el.querySelector('.mm-label');
    this.dpr = Math.min(devicePixelRatio || 1, 2);

    const w = X1 - X0, h = Z1 - Z0;
    this.s = (SIZE - 2 * PAD) / Math.max(w, h);
    this.ox = PAD + ((SIZE - 2 * PAD) - w * this.s) / 2 - X0 * this.s;
    this.oy = PAD + ((SIZE - 2 * PAD) - h * this.s) / 2 - Z0 * this.s;

    this.cv.width = SIZE * this.dpr; this.cv.height = SIZE * this.dpr;
    this.cv.style.width = this.cv.style.height = SIZE + 'px';
    this.ctx = this.cv.getContext('2d');
    this.ctx.scale(this.dpr, this.dpr);

    this.layers = { 1: this.bake(1), 2: this.bake(2) };
    this.lastFloor = null; this.shown = false;
  }

  px(x) { return this.ox + x * this.s; }
  py(z) { return this.oy + z * this.s; }

  /** 烘焙某层静态底图 */
  bake(f) {
    const cv = document.createElement('canvas');
    cv.width = SIZE * this.dpr; cv.height = SIZE * this.dpr;
    const c = cv.getContext('2d');
    c.scale(this.dpr, this.dpr);

    // 房间填充
    for (const r of ROOMS.filter(r => r.floor === f && r.id !== 'understair_f1')) {
      const isVoid = r.id === 'void_f2';
      c.fillStyle = isVoid ? 'rgba(201,162,39,.12)' : roomFill(r.name);
      c.globalAlpha = 0.9;
      c.fillRect(this.px(r.x0), this.py(r.z0), (r.x1 - r.x0) * this.s, (r.z1 - r.z0) * this.s);
      c.globalAlpha = 1;
    }
    // 墙体（与 3D 同源）
    c.fillStyle = '#2a2622';
    for (const w of walls(f))
      c.fillRect(this.px(w.x0), this.py(w.z0), Math.max(1, (w.x1 - w.x0) * this.s), Math.max(1, (w.z1 - w.z0) * this.s));

    // 楼梯踏步
    const st = STAIR;
    c.strokeStyle = '#9c7449'; c.lineWidth = 0.8;
    for (let k = 0; k < 8; k++) {
      for (const [fl, z] of [[st.flightA, 10.29 - k * st.treadD], [st.flightB, 8.05 + k * st.treadD]]) {
        c.beginPath(); c.moveTo(this.px(fl.x0), this.py(z)); c.lineTo(this.px(fl.x1), this.py(z)); c.stroke();
      }
    }
    // 梯井分隔墙
    c.fillStyle = '#2a2622';
    c.fillRect(this.px(7.67), this.py(8.05), 0.25 * this.s, 2.24 * this.s);
    return cv;
  }

  /** 角色所在空间名 */
  where(x, z, f) {
    if (x > STAIR.well.x0 && x < STAIR.well.x1 && z > STAIR.well.z0 && z < STAIR.well.z1) return '楼梯';
    const r = ROOMS.find(r => r.floor === f && r.id !== 'understair_f1' &&
      x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
    return r ? r.name : '—';
  }

  show(on) {
    if (on === this.shown) return;
    this.shown = on;
    this.el.classList.toggle('show', on);
  }

  update(p) {
    const f = p.pos.y >= STAIR_MID ? 2 : 1;
    const c = this.ctx;
    c.clearRect(0, 0, SIZE, SIZE);
    c.drawImage(this.layers[f], 0, 0, SIZE, SIZE);

    const x = this.px(p.pos.x), y = this.py(p.pos.z);
    const dx = -Math.sin(p.yaw), dz = -Math.cos(p.yaw);   // 与 player.js 前进方向一致
    const a = Math.atan2(dz, dx);

    // 视锥
    c.beginPath();
    c.moveTo(x, y);
    c.arc(x, y, 26, a - FOV / 2, a + FOV / 2);
    c.closePath();
    const g = c.createRadialGradient(x, y, 0, x, y, 26);
    g.addColorStop(0, 'rgba(201,162,39,.55)'); g.addColorStop(1, 'rgba(201,162,39,0)');
    c.fillStyle = g; c.fill();

    // 角色
    c.beginPath(); c.arc(x, y, 3.4, 0, Math.PI * 2);
    c.fillStyle = '#c9a227'; c.fill();
    c.strokeStyle = '#12100e'; c.lineWidth = 1.2; c.stroke();

    // 指北
    const nx = SIZE - 17, ny = 15;
    c.fillStyle = 'rgba(12,10,9,.55)';
    c.beginPath(); c.arc(nx, ny + 3, 11, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(242,237,230,.85)';
    c.font = '600 9px -apple-system,PingFang SC,sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.fillText('N', nx, ny - 1);
    c.beginPath(); c.moveTo(nx, ny + 1); c.lineTo(nx - 3.5, ny + 9); c.lineTo(nx + 3.5, ny + 9);
    c.closePath(); c.fill();

    this.label.innerHTML = `<b>${f}F</b> ${this.where(p.pos.x, p.pos.z, f)}`;
  }
}
