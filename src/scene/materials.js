/**
 * 材质库：全部纹理由 canvas 程序化生成（木纹 / 织物 / 微水泥 / 石材 / 法线），
 * 因此项目不引入任何第三方贴图或 HDR，无许可风险，也没有加载失败的可能。
 */
import * as THREE from 'three';

const cv = (n) => { const c = document.createElement('canvas'); c.width = c.height = n; return c; };

/** 值噪声（多次盒滤波） */
function noiseCanvas(n = 256, blur = 2, lo = 0.42, hi = 1) {
  const c = cv(n), g = c.getContext('2d'), d = g.createImageData(n, n);
  for (let i = 0; i < n * n; i++) { const v = 255 * (lo + Math.random() * (hi - lo)); d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = v; d.data[i * 4 + 3] = 255; }
  g.putImageData(d, 0, 0);
  for (let k = 0; k < blur; k++) { g.filter = 'blur(1.2px)'; g.drawImage(c, 0, 0); g.filter = 'none'; }
  return c;
}

/** 由高度图算法线图（Sobel） */
function normalFrom(src, strength = 2.2) {
  const n = src.width, s = src.getContext('2d').getImageData(0, 0, n, n).data;
  const c = cv(n), g = c.getContext('2d'), o = g.createImageData(n, n);
  const H = (x, y) => s[(((y + n) % n) * n + ((x + n) % n)) * 4] / 255;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * n + x) * 4;
    o.data[i] = (-dx / l * 0.5 + 0.5) * 255; o.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255;
    o.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; o.data[i + 3] = 255;
  }
  g.putImageData(o, 0, 0); return c;
}

/** 木纹（横向年轮 + 噪声） */
function woodCanvas(n = 512, base = '#a9793f', dark = '#6d4a24') {
  const c = cv(n), g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, n, n);
  for (let y = 0; y < n; y++) {
    const t = Math.sin(y * 0.09 + Math.sin(y * 0.021) * 3.4) * 0.5 + 0.5;
    const a = 0.05 + 0.3 * Math.pow(t, 6) + (Math.random() * 0.05);
    g.globalAlpha = a; g.fillStyle = dark; g.fillRect(0, y, n, 1);
  }
  g.globalAlpha = 0.12;
  for (let i = 0; i < 900; i++) { g.fillStyle = Math.random() > .5 ? dark : '#e0c090'; g.fillRect(Math.random() * n, Math.random() * n, Math.random() * 40 + 6, 1); }
  g.globalAlpha = 1; return c;
}

/** 石材（大理石纹） */
function stoneCanvas(n = 512) {
  const c = cv(n), g = c.getContext('2d');
  g.fillStyle = '#e6e4df'; g.fillRect(0, 0, n, n);
  g.lineWidth = 1;
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(120,116,110,${0.08 + Math.random() * 0.2})`;
    g.beginPath();
    let x = Math.random() * n, y = -10;
    g.moveTo(x, y);
    while (y < n + 10) { x += (Math.random() - 0.5) * 46; y += 14; g.lineTo(x, y); }
    g.stroke();
  }
  g.globalAlpha = 0.25; g.drawImage(noiseCanvas(n, 3, 0.75, 1), 0, 0, n, n); g.globalAlpha = 1;
  return c;
}

const tex = (canvas, rep = [1, 1], srgb = false) => {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep[0], rep[1]);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

// —— 共享贴图（各生成一次） ——
const NOISE = noiseCanvas(256, 2);
const NORM_FINE = normalFrom(noiseCanvas(256, 3), 1.1);   // 涂料 / 微水泥
const NORM_CLOTH = normalFrom(noiseCanvas(256, 1), 3.4);  // 织物
const WOOD_OAK = woodCanvas(512, '#b08650', '#7a5327');
const WOOD_WAL = woodCanvas(512, '#7d5734', '#412a15');
const STONE = stoneCanvas(512);

const std = (o) => new THREE.MeshStandardMaterial(o);

export const MAT = {
  // 建筑
  wall:      std({ color: 0xe9e4da, roughness: 0.96, normalMap: tex(NORM_FINE, [10, 10]), normalScale: new THREE.Vector2(0.25, 0.25) }),
  ceiling:   std({ color: 0xf2eee7, roughness: 0.98 }),
  floorOak:  std({ map: tex(WOOD_OAK, [7, 7], true), roughness: 0.55, normalMap: tex(NORM_FINE, [14, 14]), normalScale: new THREE.Vector2(0.35, 0.35) }),
  floorOak2: std({ map: tex(WOOD_OAK, [7, 7], true), color: 0xd8c6ac, roughness: 0.52, normalMap: tex(NORM_FINE, [14, 14]), normalScale: new THREE.Vector2(0.35, 0.35) }),
  microCem:  std({ color: 0xb9b4ac, roughness: 0.9, normalMap: tex(NORM_FINE, [8, 8]), normalScale: new THREE.Vector2(0.4, 0.4) }),
  stone:     std({ map: tex(STONE, [2, 2], true), roughness: 0.28, metalness: 0.02, normalMap: tex(NORM_FINE, [6, 6]), normalScale: new THREE.Vector2(0.12, 0.12) }),
  // 家具
  oak:       std({ map: tex(WOOD_OAK, [1.4, 1.4], true), roughness: 0.5 }),
  walnut:    std({ map: tex(WOOD_WAL, [1.4, 1.4], true), roughness: 0.42 }),
  lacquer:   std({ color: 0xece7de, roughness: 0.35, metalness: 0.02 }),
  fabric:    std({ color: 0xb9b3a3, roughness: 0.96, normalMap: tex(NORM_CLOTH, [5, 5]), normalScale: new THREE.Vector2(0.7, 0.7) }),
  fabricDk:  std({ color: 0x6f7264, roughness: 0.96, normalMap: tex(NORM_CLOTH, [5, 5]), normalScale: new THREE.Vector2(0.7, 0.7) }),
  linen:     std({ color: 0xe6e0d4, roughness: 0.98, normalMap: tex(NORM_CLOTH, [6, 6]), normalScale: new THREE.Vector2(0.6, 0.6) }),
  leather:   std({ color: 0x8a6244, roughness: 0.52, metalness: 0.03 }),
  rug:       std({ color: 0xc9bda8, roughness: 1, normalMap: tex(NORM_CLOTH, [3, 3]), normalScale: new THREE.Vector2(1.1, 1.1) }),
  brass:     std({ color: 0xb8944f, roughness: 0.28, metalness: 1 }),
  blackMtl:  std({ color: 0x2e2c29, roughness: 0.38, metalness: 0.85 }),
  ceramic:   std({ color: 0xfbfaf7, roughness: 0.12, metalness: 0.02 }),
  screen:    std({ color: 0x0b0d0f, roughness: 0.22, metalness: 0.3 }),
  plant:     std({ color: 0x5c7355, roughness: 0.85 }),
  soil:      std({ color: 0x4a423a, roughness: 1 }),
  // 玻璃：反射来自 scene.environment。
  // 注意：MeshPhysicalMaterial 的 transmission 会让 three 每帧【额外渲染一遍整个场景】
  // 到透射 RT —— 这是本项目最大的一笔逐帧开销，因此改用带 envMap 反射的半透明 Standard。
  glass: std({
    color: 0xdfeef2, roughness: 0.04, metalness: 0,
    transparent: true, opacity: 0.13, envMapIntensity: 0.95,
    side: THREE.DoubleSide, depthWrite: false,
  }),
  // 灯罩（夜间自发光）
  shade: new THREE.MeshStandardMaterial({ color: 0xf6ecd8, roughness: 0.7, emissive: 0xffc98a, emissiveIntensity: 0 }),
};

/** 夜间：灯罩自发光开关 */
export function setLampEmissive(on) { MAT.shade.emissiveIntensity = on ? 2.4 : 0; }
