import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { C } from './data/building.js';
import { buildHouse } from './scene/house.js';
import { buildFurniture } from './scene/furniture.js';
import { buildOpenings } from './scene/openings.js';
import { setLampEmissive } from './scene/materials.js';
import { LAMPS } from './data/furniture.js';
import { Player } from './player.js';
import { loader, hint, hud, initPlan } from './ui.js';
import { Minimap } from './minimap.js';

const LIFT = 2.2;          // 轴测时二层仅沿 Y 抬升（X/Z 不变）
const TRANS = 1.0;         // 相机 / 抬升过渡时长 (s)
let mode = 'axo';          // 刷新后默认轴测
let lift = LIFT;           // 二层当前抬升量（模块级，便于调试钩子同步）
let night = false;

try { start(); } catch (e) { fatal(e); }

function fatal(e) {
  console.error(e);
  loader.fail(`${e.message || e}<br><br>请确认已执行 <code>npm install</code>；若为资源 404，检查 <code>vite.config.js</code> 的 <code>base</code> 设置。`);
}

function start() {
  loader.set(0.05, '创建渲染器…');
  const app = document.getElementById('app');
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.info.autoReset = false;   // 后期多 pass，需手动累计 draw call
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;   // 静态场景：只在需要时刷新 shadow map
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xb9c4c9);

  loader.set(0.2, '生成建筑几何…');
  const { g1, g2, roof } = buildHouse();
  loader.set(0.35, '生成门窗…');
  const op = buildOpenings();
  g1.add(op[1]); g2.add(op[2]);
  loader.set(0.45, '生成家具…');
  const furn = buildFurniture();
  g1.add(furn[1]); g2.add(furn[2]);
  scene.add(g1, g2, roof);

  // 地坪
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(140, 140),
    new THREE.MeshStandardMaterial({ color: 0x8e9184, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.2; ground.receiveShadow = true;
  scene.add(ground);

  loader.set(0.55, '烘焙环境光照…');
  // 程序化室内环境（RoomEnvironment）→ PMREM，作为 IBL；不依赖任何外部 HDR 文件
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.62;
  pmrem.dispose();

  loader.set(0.62, '布置光照…');
  const hemi = new THREE.HemisphereLight(0xdfe9ef, 0x6b6154, 0.32);
  const sun = new THREE.DirectionalLight(0xffe6c0, 1.9);
  sun.position.set(-16, 22, -12); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const d = 16; Object.assign(sun.shadow.camera, { left: -d, right: d, top: d, bottom: -d, near: 1, far: 70 });
  sun.shadow.bias = -0.0006;
  sun.target.position.set(7.5, 0, 6.5);
  const amb = new THREE.AmbientLight(0xffffff, 0.04);
  scene.add(hemi, sun, sun.target, amb);
  // 夜间关键灯：位置来自灯具数据，色温 2700–3500K
  const lamps = LAMPS.map(L => {
    const l = new THREE.PointLight(L.c, 0, 7.5, 2);
    l.position.set(L.x, (L.floor === 1 ? 0 : C.FLOOR_TO_FLOOR) + L.y, L.z);
    l.userData.power = L.p;
    l.userData.host = (L.floor === 1 ? g1 : g2); // 夜间才挂进场景，白天完全移出光照循环
    return l;
  });

  loader.set(0.7, '初始化相机与控制器…');
  const camAxo = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 400);
  const camFps = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 300);
  const CTR = new THREE.Vector3(C.OUTER_W / 2, 2.6, C.BODY_D / 2 - 0.6);
  camAxo.position.set(CTR.x + 20, 21, CTR.z + 22);   // 俯角约 40°
  const orbit = new OrbitControls(camAxo, renderer.domElement);
  orbit.target.copy(CTR); orbit.enableDamping = true; orbit.dampingFactor = 0.07;
  orbit.minDistance = 8; orbit.maxDistance = 70; orbit.maxPolarAngle = Math.PI / 2.05;
  orbit.update();

  const player = new Player(camFps, renderer.domElement);
  player.onExit = () => { if (mode === 'fps') setMode('axo'); };

  // 过渡用相机（两套控制器互斥期间由它接管画面）
  const camTrans = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 400);
  let trans = null, active = camAxo;

  loader.set(0.9, '装配界面…');
  const minimap = new Minimap(document.getElementById('minimap'));
  const plan = initPlan(() => setMode(lastMode));
  let lastMode = 'axo';
  const btns = [...document.querySelectorAll('#ui button')];
  document.getElementById('ui').addEventListener('click', e => {
    const v = e.target.dataset?.v; if (!v) return;
    if (v === 'night') { setNight(!night); return; }
    setMode(v);
  });
  addEventListener('keydown', e => {
    if (e.code === 'Escape') { if (mode === 'plan') setMode(lastMode); else if (mode === 'fps') setMode('axo'); }
  });

  function setNight(on) {
    night = on;
    hemi.intensity = on ? 0.05 : 0.32;
    sun.intensity = on ? 0.10 : 1.9;
    sun.color.set(on ? 0x9fb6d8 : 0xffe6c0);
    amb.intensity = on ? 0.015 : 0.04;
    lamps.forEach(l => {
      l.intensity = on ? l.userData.power : 0;
      if (on) l.userData.host.add(l); else l.removeFromParent();
    });
    setLampEmissive(on);
    touchShadow();
    scene.environmentIntensity = on ? 0.09 : 0.62;
    scene.background.set(on ? 0x0d1117 : 0xb9c4c9);
    renderer.toneMappingExposure = on ? 1.05 : 0.95;
    if (bloom) bloom.strength = on ? 0.34 : 0.14;
    btns.find(b => b.dataset.v === 'night').classList.toggle('on', on);
  }

  function setMode(v) {
    if (v === mode) return;
    if (mode === 'fps') { player.active = false; player.release(); }
    if (mode === 'plan') plan.close();
    if (v !== 'plan') lastMode = v;
    mode = v;
    btns.forEach(b => b.classList.toggle('on', b.dataset.v === v));
    btns.find(b => b.dataset.v === 'night').classList.toggle('on', night);
    orbit.enabled = false;                                  // 两套控制器严格互斥

    if (v === 'plan') { plan.open(); hint(''); return; }

    if (v === 'axo') {
      startTransition(camAxo, () => { orbit.enabled = true; });
      hint('拖动旋转 · 滚轮缩放 · 二层已沿 Y 抬升 <b>2.2 m</b>（X/Z 保持真实位置）');
    } else {
      // 进入第一人称：从当前位置继续，或首次落在玄关
      if (!player.started) { player.place(7.80, 11.70, Math.PI); player.started = true; }
      player.syncCamera();
      player.frozen = true;
      player.request();          // 必须在用户手势内请求指针锁定，不能等过渡结束
      startTransition(camFps, () => {
        player.frozen = false;
        if (!player.active) player.request();
        hint('<b>WASD</b> 移动 · <b>Shift</b> 快走 · 鼠标转视角 · <b>ESC</b> 退出', 6000);
      });
    }
  }

  function startTransition(to, done) {
    camTrans.position.copy(active.position);
    camTrans.quaternion.copy(active.quaternion);
    camTrans.fov = active.fov; camTrans.updateProjectionMatrix();
    active = camTrans;
    trans = { t: 0, to, from: { p: camTrans.position.clone(), q: camTrans.quaternion.clone(), fov: camTrans.fov }, done };
  }

  // ——— 后期：轻度 Bloom（禁止过度泛光）；构建失败时自动退回直接渲染 ———
  let composer = null, renderPass = null, bloom = null;
  try {
    composer = new EffectComposer(renderer);
    renderPass = new RenderPass(scene, camAxo);
    bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.14, 0.7, 0.92);
    composer.addPass(renderPass);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    composer.setSize(innerWidth, innerHeight);
    composer.setPixelRatio(Math.min(devicePixelRatio, 2));
  } catch (e) { console.warn('[post] 已停用后期处理：', e); composer = null; }

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    composer?.setSize(innerWidth, innerHeight);
    [camAxo, camFps, camTrans].forEach(c => { c.aspect = innerWidth / innerHeight; c.updateProjectionMatrix(); });
  });

  // ——— 自适应画质：按实测帧率逐级降档，回升时再逐级恢复 ———
  const DPR = Math.min(devicePixelRatio || 1, 2);
  const QUALITY = [
    { name: '高',   dpr: DPR,                 bloom: true,  shadow: true },
    { name: '中高', dpr: Math.min(DPR, 1.5),  bloom: true,  shadow: true },
    { name: '中',   dpr: Math.min(DPR, 1.25), bloom: false, shadow: true },
    { name: '低',   dpr: 1.0,                 bloom: false, shadow: false },
  ];
  // 从「中高」起步：先保证流畅，帧率富余时自动回升到「高」
  let q = 1, lowN = 0, highN = 0, shadowDirty = 3;
  const touchShadow = () => { shadowDirty = 2; };
  function applyQuality() {
    const Q = QUALITY[q];
    renderer.setPixelRatio(Q.dpr);
    renderer.setSize(innerWidth, innerHeight);
    composer?.setPixelRatio(Q.dpr);
    composer?.setSize(innerWidth, innerHeight);
    if (bloom) bloom.enabled = Q.bloom;
    renderer.shadowMap.enabled = Q.shadow;
    sun.castShadow = Q.shadow;
    scene.traverse(o => { const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => (x.needsUpdate = true)); });
    touchShadow();
  }

  applyQuality();

  // 主循环
  const clock = new THREE.Clock();
  let acc = 0, frames = 0, fps = 0;
  g2.position.y = LIFT; roof.visible = false;

  renderer.setAnimationLoop(() => {
    renderer.info.reset();
    const dt = Math.min(clock.getDelta(), 0.05);

    // 二层抬升 / 屋面显隐（0.8–1.5s 平滑）
    const target = mode === 'fps' ? 0 : LIFT;
    lift += (target - lift) * Math.min(1, dt / TRANS * 2.2);
    if (Math.abs(lift - target) < 0.002) lift = target;
    if (g2.position.y !== lift) touchShadow();      // 楼层抬升变化 → 阴影需重算
    g2.position.y = lift;
    roof.visible = lift < 0.02;
    if (shadowDirty > 0) { renderer.shadowMap.needsUpdate = true; shadowDirty--; }

    if (trans) {
      trans.t += dt / TRANS;
      const k = trans.t >= 1 ? 1 : (1 - Math.cos(Math.PI * trans.t)) / 2; // easeInOut
      camTrans.position.lerpVectors(trans.from.p, trans.to.position, k);
      camTrans.quaternion.slerpQuaternions(trans.from.q, trans.to.quaternion, k);
      camTrans.fov = trans.from.fov + (trans.to.fov - trans.from.fov) * k;
      camTrans.updateProjectionMatrix();
      if (trans.t >= 1) { active = trans.to; const d = trans.done; trans = null; d?.(); }
    }

    // 兜底：轴测模式下若过渡因标签页挂起未完成，恢复 Orbit 控制权
    if (mode === 'axo' && !trans && !orbit.enabled) { active = camAxo; orbit.enabled = true; }

    if (mode === 'fps') { player.update(dt); minimap.update(player); minimap.show(true); }
    else { minimap.show(false); if (orbit.enabled) orbit.update(); }

    if (composer) { renderPass.camera = active; composer.render(); }
    else renderer.render(scene, active);

    frames++; acc += dt;
    if (acc >= 0.5) {
      fps = Math.round(frames / acc); frames = 0; acc = 0;
      if (fps > 0) {
        if (fps < 40 && q < QUALITY.length - 1) { if (++lowN >= 2) { q++; applyQuality(); lowN = highN = 0; } } else lowN = 0;
        if (fps > 56 && q > 0) { if (++highN >= 6) { q--; applyQuality(); highN = 0; } } else highN = 0;
      }
    }
    hud(`${fps} fps · ${renderer.info.render.calls} draw calls · ${(renderer.info.render.triangles / 1000).toFixed(0)}k tris`
      + ` · 画质 ${QUALITY[q].name}`
      + (mode === 'fps' ? `<br>X ${player.pos.x.toFixed(2)} · Y ${player.pos.y.toFixed(2)} · Z ${player.pos.z.toFixed(2)}` : ''));
  });

  // 仅开发环境：供无 rAF 的自动化环境做视觉验证（生产构建会被摇树移除）
  if (import.meta.env.DEV) window.__app = {
    scene, renderer, camAxo, camFps, player,
    draw() { if (composer) { renderPass.camera = active; composer.render(); } else renderer.render(scene, active); },
    look(px, py, pz, tx, ty, tz) {
      mode = 'axo'; lift = LIFT;
      camAxo.position.set(px, py, pz); orbit.target.set(tx, ty, tz); orbit.update();
      active = camAxo; g2.position.y = LIFT; roof.visible = false; minimap.show(false); this.draw();
    },
    eye(x, z, yaw, pitch = 0, floor = 1) {
      mode = 'fps'; lift = 0;
      player.place(x, z, yaw, floor === 1 ? 0 : C.FLOOR_TO_FLOOR);
      player.pitch = pitch; player.syncCamera();
      active = camFps; g2.position.y = 0; roof.visible = true; minimap.update(player); minimap.show(true); this.draw();
    },
    night(on) { setNight(on); this.draw(); },
  };

  loader.set(1, '就绪');
  hint('拖动旋转 · 滚轮缩放 · 二层已沿 Y 抬升 <b>2.2 m</b>（X/Z 保持真实位置）');
  setTimeout(() => loader.hide(), 350);
  console.log('[scene] meshes:', g1.children.length + g2.children.length + roof.children.length);
}
