# duplex-house-3d · 双层住宅 3D 样板间

按上传的双层户型图建立的**真实尺度、可连续步行上下楼**的 Three.js 交互样板间。
纯静态前端，无后端 / 无数据库 / 无本地绝对路径依赖，可直接复制为独立 Git 仓库并部署到 GitHub Pages。

当前进度：**阶段一 / 二 / 三 全部完成**（坐标模型 → 建筑结构 + 第一人称 → 精装 ArchViz）。

---

## 快速开始

```bash
npm install
```

```bash
npm run dev
```

开发服务监听 `0.0.0.0:5173`，Codespaces / 远程容器会自动转发端口。

```bash
npm run check
```

跑全部 4 套自动测试（尺寸链 / 可达性 / 家具几何 / 无头行走），当前 **193 项断言、0 失败**。

```bash
npm run build
```

产物在 `dist/`，`vite.config.js` 用 `base: './'`，任意子路径都能直接打开。

```bash
npm run preview
```

---

## 目录

```text
duplex-house-3d/
├── index.html               # 外壳 + 全部 UI 样式（加载页 / 按钮 / 户型图 Overlay）
├── vite.config.js           # base:'./'，dev/preview 监听 0.0.0.0
├── src/
│   ├── data/building.js     # ★ 唯一建筑数据源：房间矩形 / 门 / 窗 / 楼梯 / 实体构件
│   ├── geom/build.js        # ★ 纯 JS 几何生成器（墙 / 楼板 / 踏步 / 碰撞体 / 支撑面）
│   ├── scene/house.js       # 由 build.js 的盒体生成 Three.js 合并网格
│   ├── player.js            # 第一人称：Pointer Lock + WASD + 重力 + 圆柱碰撞
│   ├── data/furniture.js    # ★ 家具布置表 + 夜间灯位（纯数据）
│   ├── scene/materials.js   # 材质库（木/石/布/金属/玻璃，纹理全部程序化生成）
│   ├── scene/furniture.js   # 程序化家具builder + 按材质合批
│   ├── scene/openings.js    # 门套 / 门扇 / 推拉扇 / 窗框（与碰撞体同源）
│   ├── ui.js                # 加载页 / 提示 / 户型图 Overlay
│   ├── minimap.js           # 第一人称小地图（北向上，与 3D 同源）
│   └── main.js              # 场景、IBL、后期、双相机、过渡、昼夜、主循环
├── tools/
│   ├── verify.mjs           # 阶段一：尺寸链 / 面积 / 楼梯 / 上下对位校核
│   ├── navcheck.mjs         # 可达性洪水填充 + 房间可站立面积 + 门洞通行性
│   ├── furncheck.mjs        # 家具实际几何 vs 声明 footprint / 净高
│   └── walktest.mjs         # 无头行走测试：驱动真实 Player 走完双向全程
├── public/                  # 静态资源（可选放入 floorplan.png）
├── .github/workflows/deploy.yml
├── PHASE1.md / PHASE1_TABLES.md   # 阶段一：图纸分析与坐标模型
├── PHASE2.md                      # 阶段二：结构与第一人称
├── PHASE3.md                      # 阶段三：精装与 ArchViz
└── TESTS.md                       # 4 套自动测试的实时输出（证据）
```

### 为什么不会出现"厨房进不去 / 穿墙"

墙体**不是手写的**：`geom/build.js` 把主体矩形减去所有房间矩形，用房间边界做网格分解得到墙体，
再按 `DOORS` / `WINDOWS` 在墙上切洞。**同一批盒体既是渲染网格也是碰撞体**，两者物理上不可能错位。
在此之上有三层自动校核（见下）。

---

## 操作

| 界面 | 说明 |
|---|---|
| **第一人称** | 点击后进入 Pointer Lock。`WASD` 移动、`Shift` 快走、鼠标转视角、`ESC` 退出并回到轴测。右上角自动出现**小地图**：北向上固定，显示当前楼层平面、角色位置、视锥朝向与所在房间名 |
| **双层轴测** | 刷新后的默认视图。拖动旋转、滚轮缩放；二层仅沿 Y 抬升 2.2 m（X/Z 保持真实位置），屋面自动隐藏 |
| **户型图** | 全屏 Overlay，可滚轮缩放 / 拖动 / `⤢` 复位 / `Esc` 关闭 |
| **白天 / 夜晚** | 昼夜光照切换 |

右下角实时显示 `fps · draw calls · 三角形数 · 当前画质档位`。**画质会按实测帧率自动升降**（4 档，调整 DPR / Bloom / 阴影），从「中高」起步；帧率富余时自动回到「高」。

两套控制器**严格互斥**：进入第一人称时 OrbitControls 关闭，退出时才恢复；切换期间由过渡相机接管（约 1 s 缓动）。

### 叠加你自己的原始图纸

把原始图片命名为 `floorplan.png` 放进 `public/`，"户型图"会自动改用它做等比 Overlay（不重绘、不 OCR 替换）。
未放置时，Overlay 显示由 **3D 模型同一份建筑数据实时绘制**的概念图，并在界面上保留「概念参考方案 · 非施工图」说明。

---

## 部署到 GitHub Pages

1. 把 `duplex-house-3d/` 复制成独立仓库：
   ```bash
   cd duplex-house-3d && git init && git add -A && git commit -m "init"
   ```
2. 建远端并推送：
   ```bash
   gh repo create duplex-house-3d --public --source=. --push
   ```
3. 仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。
4. 之后每次 push 到 `main`，`.github/workflows/deploy.yml` 会自动 `npm ci` → 跑校核 → `npm run build` → 上传 `dist/` → 部署。
5. 访问 `https://<用户名>.github.io/duplex-house-3d/`。

`base: './'` 让所有资源用相对路径加载，因此**无需**按仓库名改配置；用自定义域名或部署到根路径同样可用。

---

## 已完成 / 已知限制

**已完成（阶段一 + 二 + 三）**
- 两层外墙 / 内墙 / 门窗洞 / 楼地面 / 二层楼板（按梯井开洞）/ 露台 / 阳台 / 栏板 / U 形双跑楼梯，全部由单一建筑数据程序化生成。
- 第一人称：Pointer Lock、WASD、眼高 1.60 m、半径 0.29 m、速度 1.5 m/s（Shift 2.6）、FOV 70°、重力、圆柱碰撞、楼梯同坡度隐形坡道支撑。
- 双层轴测（OrbitControls，俯角约 40°）、1 s 缓动过渡、控制器互斥、刷新默认轴测。
- 昼夜切换、户型图 Overlay、真实进度的加载页、失败时给出可读错误而非黑屏。
- 第一人称小地图：北向上固定，自动切换楼层图面，实时显示位置 / 视锥 / 所在房间名。
- **楼梯扶手**：Ø44mm 黄铜圆管，外侧一根沿「第一跑→平台三面→第二跑」全程连续、内侧两根贴梯井分隔墙；高出踏面 0.90m，带墙面托架与起步立柱；同时进入碰撞体（梯段净宽 1.10m → 0.946m）。
- **门窗**：28 处洞口全部带门套；**12 樘平开门扇（含入户门）全部开启 90°**（橡木 + 黄铜执手）、3 樘推拉玻璃门（半开）、20 樘黑框窗 + 石材窗台。门扇同时进入碰撞与校核。
- **精装**：119 件程序化家具（带倒角/板厚/腿脚/门缝/把手/软包）覆盖全部房间；程序化木纹/石纹/布纹/法线贴图；`RoomEnvironment` IBL + 方向日光 + 14 盏夜间关键灯；ACESFilmic + 轻度 Bloom（白天 0.14）。

**已知限制**
- **未测得 fps 数字**。开发机的无头预览浏览器不执行 `requestAnimationFrame`（实测 1.1 s 内 0 帧），因此本仓库**不对帧率作任何承诺**；界面右下角有实时 fps / draw call 读数，请在你的桌面浏览器上自行读取并告知设备与分辨率。当前场景约 40 万三角形。
- **GTAO / SSAO 未启用**：无法在本机实测其开销与在透射玻璃下的伪影，不做无证据的开启。
- 门扇姿态是静态的（全部固定为开启），不能交互开合；玻璃未做分格贴花。
- 玻璃为「反射 + 半透明」近似，未用 `transmission` 真实折射 —— 为帧率做的取舍，详见 `PHASE3.md` §4。
- 一层「梯下储物」净高 1.35 m，按不可行走的实心体处理。
- 面积口径与"约 198 ㎡"的冲突见 `PHASE1.md` §1.5，**未采信也未宣称**。

**第三方资源**：**零第三方模型 / 纹理 / HDR** —— 所有几何与贴图均在运行时程序化生成（木纹、石纹、噪声、法线图均由 canvas 绘制）。唯一运行时依赖是 [three.js](https://github.com/mrdoob/three.js)（MIT，含其 `examples/jsm` 中的 OrbitControls、RoomEnvironment、EffectComposer、UnrealBloomPass、OutputPass、BufferGeometryUtils）。构建依赖 [Vite](https://github.com/vitejs/vite)（MIT）。
