# 架构与 API

INEvolution 是一个零构建的本地知识星图。客户端是原生 Canvas 2D 应用，服务端是仅依赖 Python 标准库的静态服务器 + JSON API。

从 0.4.0 起，节点由**显式树**定义，不再从 `.md` 文件反推。Markdown 是节点按需生成的内容，而不是节点本身。

## 目录职责

| 路径 | 职责 |
| --- | --- |
| `server.py` | HTTP 服务、静态文件、内容文件扫描、节点树读写、内容创建/保存/删除 |
| `web/index.html` | 页面结构、HUD、主题 CSS、Markdown 容器与右侧内容面板 |
| `web/app.js` | 节点树、视图状态、3D 相机、板块球体、国家/城市渲染、菜单、内容面板 |
| `notes/` | 节点内容存储；按 `galaxies/`、`planets/`、`sectors/`、`countries/`、`cities/` 分目录 |
| `data/graph.json` | 节点树、父子关系、颜色、坐标、星链、内容路径 |
| `docs/` | 项目文档与截图 |

运行时目录会按需创建。默认只监听 `127.0.0.1`，不对外网开放。

## 节点树

### Schema

```json
{
  "version": 2,
  "tree": [
    {
      "id": "g-default",
      "type": "galaxy",
      "name": "认知",
      "parent": null,
      "color": "#f07542",
      "x": -40.48, "y": 0, "z": -179.44,
      "md": "galaxies/g-default.md"
    },
    {
      "id": "语言",
      "type": "planet",
      "name": "语言",
      "parent": "g-default",
      "color": "#f04242",
      "x": 103.27, "y": -9.18, "z": 91.35,
      "md": "planets/语言.md"
    },
    {
      "id": "s-mwewb2ko-cvmpa",
      "type": "sector",
      "name": "语义板块",
      "parent": "语言",
      "color": "#8e9196",
      "x": 0, "y": 0, "z": 0,
      "md": "sectors/s-mwewb2ko-cvmpa.md"
    }
  ],
  "links": [
    { "source": "领域", "target": "语言" }
  ]
}
```

- `tree` 是扁平数组，父子关系由 `parent` 表示。
- `type` 只能是 `galaxy`、`planet`、`sector`、`country`、`city`。
- 子类型固定：星系 → 星球 → 板块 → 国家 → 城市。
- `links` 是全局星链；同一条链的两端必须是同一类型，渲染时只显示当前层级内两端都可见的链。
- 颜色为 `#8e9196` 表示「未自定义」，客户端按类型和 ID 哈希分配主题色；自定义颜色保存真实值。
- `x/y/z` 对星系/星球是 3D 坐标，对国家/城市是平面坐标（`z=0`），对板块不使用。
- 没有星系时，客户端会在内存中补一个默认星系「我的星系」；一旦保存就会写入树。

### 稳定 ID 与内容路径

节点 ID 稳定，重命名不改变 ID，也不移动内容文件。

```text
notes/{type-folder}/{safe-node-id}.md
```

| 类型 | 目录 |
| --- | --- |
| 星系 | `notes/galaxies/` |
| 星球 | `notes/planets/` |
| 板块 | `notes/sectors/` |
| 国家 | `notes/countries/` |
| 城市 | `notes/cities/` |

`safe-node-id` 会把 Windows 路径非法字符替换为 `-`，并限制长度。客户端把规范路径写进节点 `md` 字段；文件可以暂时不存在。

`nodeHasMd()` 通过 `/api/files` 返回的内容路径集合判断文件是否存在。存在时单击打开右侧面板；不存在时只聚焦，右键「编辑内容」会创建文件。

### 旧数据迁移

- 旧版的 `nodes` / `nodesExtras` / `galaxies` 仍可被客户端在内存中读取，首次保存时写成 v2 树。
- 旧笔记若位于 `notes/` 根目录，需要移动到 `notes/planets/` 才能与新的规范路径匹配；本仓库已完成迁移。
- `/api/files` 只用于内容列表与存在性判断，**不再用于创建节点**。

## 服务端

### 启动

```bash
python server.py
python server.py --host 0.0.0.0 --port 9000
KG_PORT=9000 python server.py
```

默认端口 `8080`，默认绑定 `127.0.0.1`。使用 `ThreadingHTTPServer` 处理并发请求，元数据保存使用进程内锁 + 临时文件原子替换。

### 路径安全

- 内容操作只能落在 `notes/` 内，静态文件只能落在 `web/` 内。
- `safe_join()` 拒绝 `..`、空字节和越界绝对路径。
- 新建内容的名称会过滤 Windows 非法字符、保留名称和首尾点号。
- 静态路由将 `/`、`/index.html`、`/knowledge-graph.html` 都映射到 `web/index.html`，兼容旧书签。

### API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/files` | 扫描 `notes/`，返回内容文件列表和 `graph.json` |
| `GET` | `/api/meta` | 只返回节点树与星链 |
| `GET` | `/api/content?path=...` | 读取指定内容文件 |
| `POST` | `/api/meta` | 保存 `{version:2, tree, links}` |
| `POST` | `/api/save` | 保存内容（`{path, content}`） |
| `POST` | `/api/create` | 按路径创建内容（`{path, content?}`），兼容 `{name}` |
| `POST` | `/api/delete` | 删除内容文件（`{path}`），并清理空目录 |

响应统一为 JSON；错误使用对应 HTTP 状态码并返回 `{ok: false, error}`。

`/api/create` 路径形式：

```json
{
  "path": "sectors/s-mwewb2ko-cvmpa.md",
  "content": "# 语义板块\n\n"
}
```

若文件已存在返回 `409`；客户端会把它视为已存在并直接打开。

`/api/meta` 保存时只信任并清洗以下字段：

- `tree[]`：`id / type / name / parent / color / x / y / z / md`
- `links[]`：`source / target`

`type` 白名单、数字范围、字段长度、`..` 路径段都会校验。父级引用由客户端维护。

## 客户端视图

### 当前父节点

客户端只保存一个 `currentParentId`：

```text
currentParentId = null        → 根星域，显示星系
currentParentId = 星系 id     → 星系页面，显示星球
currentParentId = 星球 id     → 星球页面，显示板块
currentParentId = 板块 id     → 板块页面，显示国家
currentParentId = 国家 id     → 国家页面，显示城市
```

- 当前显示的子类型由父类型决定：`TYPE_INFO[parent.type].child`。
- 视图模式：`graph`（根星域/星系）、`sphere`（星球）、`flat`（板块/国家）。
- URL hash 写入当前父节点 ID，刷新后可回到同一层。
- 双击节点进入该节点的子视图；叶节点「城市」没有子视图，双击打开内容。

### 3D 相机

`web/app.js` 实现轻量透视相机：

- 球坐标 `theta / phi`、目标点 `target`、距离 `dist`、缩放 `zoom`。
- 每帧计算 `right / up / forward` 基向量。
- `focal = dist * zoom`，`screen = center + cameraSpace * focal / depth`。
- 近远裁剪、深度排序、按深度衰减透明度与字重。
- `unproject()` 用于拖动、平移和朝光标缩放。

图谱层允许环绕；平面层把 `theta/phi` 固定在正面，只允许平移和缩放。板块球体层固定相机，改为旋转球体本身。

### 板块球体

#### 面积分配

球体半径固定为 `SPLAT_RADIUS = 300`，球面面积固定为 `4πR²`。

每个板块的权重：

```text
weight = max(1, countryCount)
```

- 有国家时权重严格等于国家数量，因此 A=2、B=1 时 A 的面积正好是 B 的 2 倍。
- 空板块使用最小权重 `1`，否则新板块在添加第一个国家前会不可见；这是唯一的视觉兜底，图例会同时显示 `0 国`。

权重通过递归 slice-and-dice 树图铺满单位 UV 矩形：

```text
总权重 = Σ weight
每个板块的 UV 面积 = weight / 总权重
```

#### 等面积球面映射

使用 Lambert 等面积圆柱投影的逆映射：

```text
u = longitude / 2π
v = (1 - sin(latitude)) / 2

longitude = (u - 0.5) * 2π
latitude  = asin(1 - 2v)
```

UV 面积与球面面积严格成正比。每个 UV 矩形采样为曲面四边形网格并投影到 3D 球面：

```text
x = R cos(lat) cos(lon)
y = R sin(lat)
z = R cos(lat) sin(lon)
```

再应用球体自身的四元数旋转。这样得到的是「被挤压到球面上的长方形」，所有板块在球面上无缝铺满。

#### 自由旋转、命中与标签

球体姿态是一个单位四元数 `globe.q`，不再使用 yaw + pitch：

- 水平拖拽绕相机 `up` 轴旋转，垂直拖拽绕相机 `right` 轴旋转；组合后可以到达任意姿态。
- 没有 pitch clamp，也没有万向节锁，因此不会在某个角度卡住。
- 自动旋转绕世界 Y 轴左乘一个增量四元数。
- 单击板块只高亮、暂停自动旋转并轻微缩放（`1.06`），**不会**把球体强制转向该板块；因此聚焦一个板块后仍可点击其他板块。

点击命中不依赖板块中心：

- 每帧绘制板块时，把每个正面网格的四个屏幕点存入 `node._hitCells`。
- `pickSector()` 对所有可见网格做点在四边形内测试，取最近深度；即使板块中心在背面，只要可见部分露出正面就能点击。
- 板块标签锚定在该板块当前**可见面积最大的网格**上（`_labelX/_labelY`），转动时跟随可见区域，而不是跟随可能位于背面的 UV 中心。

板块边界的暗色粗描边已移除，改为细亮线 + 柔和同色辉光。表面填充按球面法线与方向光计算明暗，再叠加全局边缘暗化、镜面高光与边缘光，使球体保持体积感。

#### 高斯泼溅风格

Canvas 2D 没有 3DGS 运行时，因此使用风格化近似：

1. 预渲染 512×512 的球体 splat 纹理（暗色球体 + 900 多个软径向渐变光斑 + 边缘辉光），缓存。
2. 叠加约 150 个在球面上分布、随球体旋转而移动的高斯光斑粒子。
3. 叠加经纬网格和板块曲面网格，提供 3D 体积感。
4. 板块填充与高亮边界叠加在球体表面；大的板块会覆盖可见半球，转动球体可查看背面。

球体自动缓慢旋转，可自由拖拽旋转，滚轮缩放；聚焦板块时高亮并暂停自动旋转，但不会锁定或转向，方便继续选择其他板块。

#### 面积图例

`#sectorPanel` 在板块页面左侧显示每个板块的颜色、国家数和面积百分比。因为单个半球无法同时展示所有板块，图例是面积比例的第二重、精确读数。

### 国家与城市平面

- 相机固定在正面，`z=0`，不响应环绕拖拽。
- 2D 力导向布局：排斥、星链弹簧、中心力、碰撞。
- 国家节点：正八面体 / 正二十面体，固定倾斜范围内的缓慢摆动，避免转到完全正面而看起来像平面。
- 城市节点：正方体，同样保持立体倾斜；半透明面 + 线框便于看清深度。
- 星链使用同一套白绿数据流。

### 右侧内容面板

- `#graphView` 与 `#sideDoc` 分栏：面板打开时 `#graphView.split { right: var(--side-w); }`。
- `resizeCanvas()` 使用 `graphView.clientWidth/clientHeight`，相机焦点仍在左侧区域居中。
- 单击节点后延迟 240ms 执行聚焦/打开内容，以区分双击；双击时取消待执行单击，并用最近一次命中的节点兜底，避免面板展开改变画布宽度后第二次点击落空。
- 阅读模式使用 marked + DOMPurify + highlight.js；编辑模式使用 textarea，保存走 `/api/save`。
- 顶部「删除」通过 `/api/delete` **只删除当前 Markdown 内容文件**，节点与树保持不变；删除后关闭面板，节点回到无内容状态。
- 未保存修改在关闭、切换节点、进入下一层时都会确认。

### Ctrl 多选与关系页面

多选状态由三个运行时变量维护：

- `multiSelection: Set<nodeId>`：当前选中的节点 ID。
- `selectionOrder: string[]`：按点击顺序保存，用于虚线环序号。
- `groupTarget`：多选整组聚焦时相机的目标点。

约束与连接性：

- 只能选择当前视图内、同一层级的节点。
- 第一个节点必须至少存在一条当前视图内的星链。
- 后续节点必须与已选节点中的至少一个相连；否则拒绝并提示。
- 取消一个节点前，先用 BFS 检查剩余集合是否连通；会让关系断开的取消会被阻止。
- 星链被删除导致选择集断开时，`recomputeLinks()` 会自动取消多选。

选中 2 个及以上时：

- `focusSelectionGroup()` 计算选中节点中心与包围尺寸，设置相机目标与 `goalZoom`，使整组居中；板块球体层保持球体姿态、放大到 1.08 并高亮所有选中板块。
- 左侧绘制虚线环和序号徽标；选中节点之间的星链会增强亮度。
- 状态栏追加「已选 N」；节点信息面板显示组级摘要。

关系笔记：

- 选择集按排序后的节点 ID 计算规范键：`relations/r-<hash>-<count>.md`。
- 关系笔记不是节点，也不写入 `tree`；它由 `/api/files` 列出、由 `/api/create`/`/api/save`/`/api/delete` 操作。
- 关系页面顶部的关系结构（节点标签、连线）是实时生成的；关系笔记只保存用户正文。
- 「修改」在文件不存在时使用当前选择集生成模板并创建文件；「保存」写回；「删除」只删除笔记，节点与星链保留。
- 关系页面的面板复用 `#sideDoc`，通过 `sideKind='relation'` 与节点内容面板区分；按钮文案为「修改 / 保存 / 删除」。
- 改变选择、普通单击、点击空白、`Esc`、关闭面板都会退出关系页面；关系笔记有未保存修改时会先确认。
- `buildView()` 在同一父级内保留多选并刷新关系摘要；父级变化、刷新、节点删除或星链断开时清理多选。

### 交互状态机

- `idle` / `orbit` / `pan` / `dragNode` / `globe`。
- 单击节点：延迟后聚焦；有内容则打开右侧面板。
- `Ctrl` / `Cmd` + 单击节点：立即进入/退出多选，不受 240ms 双击延迟影响；校验星链连接性与连通性。2 个及以上打开关系页面。
- 点击空白：关闭内容或关系页面、取消多选并取消聚焦；拖拽空白则环绕/平移/旋转球体。
- 右键：节点菜单或空白菜单。
- 双击：进入下一层；城市打开内容；按住 Ctrl 的双击不进入层级，避免与多选冲突。
- `Esc` 优先级：关闭帮助/调色板/菜单/连线 → 关闭内容/关系 → 取消聚焦/多选 → 返回上一层。
- `Delete` / `Backspace`：删除当前 `focusNode`；有子节点时由 `deleteNode()` 阻止；输入框/textarea 聚焦时不触发；菜单、调色板、帮助或连线状态时不触发。
- 星链连接：进入 linking 状态，点击同层目标完成，`Esc` 取消。

### 层级过渡

进入节点时使用相机 `transition`：

1. 当前相机目标移动到节点坐标（板块使用曲面中心），`zoom` 放大，白绿闪光增强。
2. 峰值时把 `currentParentId` 设为该节点，重建新视图并重置相机模式。
3. 新层级从较高缩放缓出到正常缩放，闪光淡出。

`prefers-reduced-motion: reduce` 会把动画时长压缩到接近 0。返回上一层使用短闪光 + 立即重建。

## 持久化

`saveMeta()` 序列化整棵树与全部星链：

- ID、类型、名称、父级、颜色、坐标、规范 `md` 路径。
- 位置在拖拽结束后延迟保存；创建/删除/重命名/配色/星链立即保存。
- 页面关闭时使用 `sendBeacon('/api/meta')` 兜底。
- 自定义颜色使用「颜色值是否等于默认灰」判断，而不是依赖节点是否在当层视图中被刷新过；这避免了离开某层后保存导致自定义色被重置。

## 主题

黑客主题集中在 `web/index.html`：

- `:root` 变量（矩阵绿、背景、等宽字体）。
- `HACKER / MATRIX THEME OVERRIDES` CSS 区段。
- `#sideDoc` 分栏与右侧内容面板样式。
- `web/app.js` 的 `drawLinks()` 白绿数据流、`drawMatrixRain()` 数据雨、`drawSphereSplats()` 高斯泼溅粒子。
- `SECTOR_COLORS` / `COUNTRY_PALETTE` / `CITY_PALETTE` 节点配色。

## 扩展建议

- 增加新层级：在 `TYPE_INFO` 中增加类型与 `child`，并扩展 `resolveViewMode()`、`buildView()`、渲染分支和菜单文案。
- 替换板块布局：`layoutTreemap()` 只负责输出 UV 矩形；可以换成 squarified treemap 或 Voronoi，只要总面积之和为 1。
- 接入其他内容目录：修改 `server.py` 的 `NOTES_DIR`，或在部署层做符号链接（注意路径安全）。
- 部署到局域网：使用 `--host 0.0.0.0 --port ...`，并自行增加访问控制。
