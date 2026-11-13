(() => {
  'use strict';

  // ============================================================
  // Types, palettes & small utilities
  // ============================================================
  const TAU = Math.PI * 2;
  const DEFAULT_COLOR = '#8e9196';
  const DEFAULT_GALAXY_ID = 'g-default';
  const MONO_CANVAS = "'JetBrains Mono', 'Cascadia Code', Consolas, monospace";

  const GALAXY_PALETTE = ['#00ff9c', '#22d3ee', '#7cffb2', '#a3e635', '#fbbf24', '#39ff14', '#5eead4'];
  const PLANET_PALETTE = ['#00ff9c', '#7cffb2', '#5eead4', '#22d3ee', '#a3e635', '#39ff14', '#00e5ff', '#c8ffe8', '#2dd4bf', '#84cc16', '#fbbf24', '#34d399'];
  const SECTOR_PALETTE = ['#00ff9c', '#7cffb2', '#5eead4', '#22d3ee', '#a3e635', '#fbbf24', '#39ff14', '#00e5ff'];
  const SECTOR_COLORS = ['#00ff9c', '#22d3ee', '#fbbf24', '#a3e635', '#5eead4', '#34d399'];
  const COUNTRY_PALETTE = ['#00ff9c', '#22d3ee', '#7cffb2', '#a3e635', '#5eead4', '#fbbf24', '#34d399', '#39ff14'];
  const CITY_PALETTE = ['#7cffb2', '#00ff9c', '#22d3ee', '#5eead4', '#a3e635', '#c8ffe8', '#34d399', '#fbbf24'];

  const TYPE_INFO = {
    galaxy: { label: '星系', child: 'planet', folder: 'galaxies', palette: GALAXY_PALETTE, childLabel: '星球', plural: '星系' },
    planet: { label: '星球', child: 'sector', folder: 'planets', palette: PLANET_PALETTE, childLabel: '板块', plural: '星球' },
    sector: { label: '板块', child: 'country', folder: 'sectors', palette: SECTOR_PALETTE, childLabel: '国家', plural: '板块' },
    country: { label: '国家', child: 'city', folder: 'countries', palette: COUNTRY_PALETTE, childLabel: '城市', plural: '国家' },
    city: { label: '城市', child: null, folder: 'cities', palette: CITY_PALETTE, childLabel: '', plural: '城市' }
  };

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function hexToRgb(hex) {
    let h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const num = parseInt(h, 16);
    if (!Number.isFinite(num) || h.length !== 6) return { r: 142, g: 145, b: 150 };
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }
  function rgbStr(c, a) {
    return a === undefined ? `rgb(${c.r},${c.g},${c.b})` : `rgba(${c.r},${c.g},${c.b},${a})`;
  }
  function mixColor(c1, c2, t) {
    return {
      r: Math.round(lerp(c1.r, c2.r, t)),
      g: Math.round(lerp(c1.g, c2.g, t)),
      b: Math.round(lerp(c1.b, c2.b, t))
    };
  }
  function hslToHex(h, s, l) {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = n => {
      const k = (n + h / 30) % 12;
      const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * c).toString(16).padStart(2, '0');
    };
    return '#' + f(0) + f(8) + f(4);
  }
  function hexToHue(hex) {
    const c = hexToRgb(hex);
    const r = c.r / 255, g = c.g / 255, b = c.b / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max === min) return 200;
    const d = max - min;
    let h;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = ((b - r) / d + 2);
    else h = ((r - g) / d + 4);
    return h * 60;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  const escapeAttr = escapeHtml;

  function hashId(id) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  }
  function safeFileId(id) {
    const value = String(id || '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
    return value.slice(0, 80) || 'node';
  }
  function paletteFor(type, id) {
    const palette = (TYPE_INFO[type] || TYPE_INFO.planet).palette;
    return palette[hashId(id) % palette.length];
  }
  function genNodeId(type) {
    const prefix = { galaxy: 'g', planet: 'p', sector: 's', country: 'c', city: 'ct' }[type] || 'n';
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }
  function canonicalMd(node) {
    return (TYPE_INFO[node.type] || TYPE_INFO.planet).folder + '/' + safeFileId(node.id) + '.md';
  }
  function roundRect(c, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }
  function randomPos(minR, maxR, flattenY) {
    const a = Math.random() * TAU;
    const u = Math.random() * 2 - 1;
    const r = minR + Math.random() * (maxR - minR);
    const s = Math.sqrt(1 - u * u);
    return {
      x: Math.cos(a) * s * r,
      y: u * r * (flattenY == null ? 0.6 : flattenY),
      z: Math.sin(a) * s * r
    };
  }
  function randomFlatPos(minR, maxR) {
    const a = Math.random() * TAU;
    const r = minR + Math.random() * (maxR - minR);
    return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.8, z: 0 };
  }

  // ============================================================
  // DOM
  // ============================================================
  const $ = id => document.getElementById(id);
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d', { alpha: true });
  const graphView = $('graphView');
  const nodeInfoEl = $('nodeInfo');
  const menuEl = $('contextMenu');
  const pickerEl = $('colorPicker');
  const hintEl = $('hint');
  const helpPanel = $('helpPanel');
  const emptyState = $('emptyState');
  const flashEl = $('flash');
  const nameDialogEl = $('nameDialog');
  const ndTitle = $('ndTitle');
  const ndDesc = $('ndDesc');
  const ndInput = $('ndInput');
  const ndConfirm = $('ndConfirm');
  const sideDoc = $('sideDoc');
  const sideBody = $('sideBody');
  const sideTitle = $('sideTitle');
  const sideType = $('sideType');
  const sidePath = $('sidePath');
  const sideStatus = $('sideStatus');
  const sideEdit = $('sideEdit');

  // ============================================================
  // State
  // ============================================================
  let allNodes = [];
  let nodeById = new Map();
  let childrenMap = new Map();
  let allLinks = [];
  let mdSet = new Set();

  let nodes = [];
  let nodeMap = new Map();
  let links = [];
  let currentParentId = null;
  let pendingFocusId = null;

  let viewMode = 'graph';
  let dpr = 1, W = 0, H = 0;
  let glowEnabled = true;
  let autoPreference = !reduceMotion;

  const cam = {
    theta: 0.62, phi: 0.26, zoom: 1, goalZoom: 1, dist: 1000,
    target: { x: 0, y: 0, z: 0 }, goalTarget: { x: 0, y: 0, z: 0 },
    autoRotate: autoPreference
  };
  let camPosX = 0, camPosY = 0, camPosZ = 0;
  let rightX = 1, rightY = 0, rightZ = 0;
  let upX = 0, upY = 1, upZ = 0;
  let fwdX = 0, fwdY = 0, fwdZ = -1;
  let focal = 1000;

  const globe = { q: { x: 0, y: 0, z: 0, w: 1 }, auto: true, radius: 300, dragging: false };
  const SPLAT_RADIUS = 300;

  let mode = 'idle';
  let dragNode = null;
  let orbitStart = null;
  let panStart = null;
  let downPos = null;
  let movedSinceDown = false;
  let hoverNode = null;
  let focusNode = null;
  let contextNode = null;
  let linkSource = null;
  const multiSelection = new Set();
  let selectionOrder = [];
  let groupTarget = null;
  const mouse = { x: 0, y: 0, inside: false };

  let colorPickerNode = null;
  let colorPickerOriginalColor = DEFAULT_COLOR;
  let colorPickerOriginalCustom = false;
  let pendingColor = '#00ff9c';
  let currentHue = 160;

  let sideOpen = false;
  let sideNodeId = null;
  let sideNode = null;
  let sideKind = 'node';
  let relationIds = [];
  let lastBuiltParentId = undefined;
  const docState = { path: '', name: '', rawContent: '', mode: 'read', type: '' };

  let infoNodeId = null;
  let transition = null;
  let simAcc = 0;
  let lastFrame = performance.now();
  let fpsSmooth = 60;
  let fpsTimer = 0;
  let metaSaveTimer = null;
  let nameDialogResolve = null;
  let lastMenuX = 0, lastMenuY = 0;
  let graphRadius = 200;

  // ============================================================
  // Canvas & camera
  // ============================================================
  function resizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = graphView.clientWidth || window.innerWidth;
    H = graphView.clientHeight || window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
  }
  window.addEventListener('resize', resizeCanvas);

  function computeCameraFrame() {
    const cp = Math.cos(cam.phi), sp = Math.sin(cam.phi);
    const ct = Math.cos(cam.theta), st = Math.sin(cam.theta);
    camPosX = cam.dist * cp * st;
    camPosY = cam.dist * sp;
    camPosZ = cam.dist * cp * ct;
    rightX = ct; rightY = 0; rightZ = -st;
    upX = -st * sp; upY = cp; upZ = -ct * sp;
    fwdX = -cp * st; fwdY = -sp; fwdZ = -cp * ct;
    focal = cam.dist * cam.zoom;
  }

  const tmpPoint = { sx: 0, sy: 0, zc: 0, s: 1 };
  const tmpPoint2 = { sx: 0, sy: 0, zc: 0, s: 1 };

  function projectTo(x, y, z, out) {
    const rx = x - cam.target.x - camPosX;
    const ry = y - cam.target.y - camPosY;
    const rz = z - cam.target.z - camPosZ;
    const zc = rx * fwdX + ry * fwdY + rz * fwdZ;
    if (zc < 30) return false;
    const s = focal / zc;
    const xc = rx * rightX + rz * rightZ;
    const yc = rx * upX + ry * upY + rz * upZ;
    out.sx = W * 0.5 + xc * s;
    out.sy = H * 0.5 - yc * s;
    out.zc = zc;
    out.s = s;
    return true;
  }

  function unproject(sx, sy, zc) {
    const s = focal / zc;
    const xc = (sx - W * 0.5) / s;
    const yc = (H * 0.5 - sy) / s;
    return {
      x: cam.target.x + camPosX + xc * rightX + yc * upX + zc * fwdX,
      y: cam.target.y + camPosY + xc * rightY + yc * upY + zc * fwdY,
      z: cam.target.z + camPosZ + xc * rightZ + yc * upZ + zc * fwdZ
    };
  }

  function depthOf(x, y, z) {
    const rx = x - cam.target.x - camPosX;
    const ry = y - cam.target.y - camPosY;
    const rz = z - cam.target.z - camPosZ;
    return rx * fwdX + ry * fwdY + rz * fwdZ;
  }

  function depthAlpha(zc) {
    const R = Math.max(graphRadius, 140);
    const t = clamp((zc - (cam.dist - R)) / (2 * R), 0, 1);
    return lerp(1, 0.42, Math.pow(t, 1.7));
  }

  // Unit quaternions are used for the sector globe so it can rotate freely
  // around any screen-space axis without the gimbal lock / pitch clamp that
  // the old yaw+pitch pair introduced.
  function quatNormalize(q) {
    const len = Math.hypot(q.x, q.y, q.z, q.w) || 1;
    return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len };
  }
  function quatMul(a, b) {
    return {
      x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
      y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
      z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
      w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
    };
  }
  function quatAxis(ax, ay, az, angle) {
    const len = Math.hypot(ax, ay, az) || 1;
    const s = Math.sin(angle / 2);
    return { x: ax / len * s, y: ay / len * s, z: az / len * s, w: Math.cos(angle / 2) };
  }
  function quatRotate(q, v) {
    const x = q.x, y = q.y, z = q.z, w = q.w;
    const xx = x * x, yy = y * y, zz = z * z;
    const xy = x * y, xz = x * z, yz = y * z;
    const wx = w * x, wy = w * y, wz = w * z;
    return {
      x: (1 - 2 * (yy + zz)) * v.x + 2 * (xy - wz) * v.y + 2 * (xz + wy) * v.z,
      y: 2 * (xy + wz) * v.x + (1 - 2 * (xx + zz)) * v.y + 2 * (yz - wx) * v.z,
      z: 2 * (xz - wy) * v.x + 2 * (yz + wx) * v.y + (1 - 2 * (xx + yy)) * v.z
    };
  }
  function eulerQuat(yaw, pitch) {
    return quatNormalize(quatMul(
      quatAxis(0, 1, 0, yaw),
      quatAxis(1, 0, 0, pitch)
    ));
  }

  // ============================================================
  // Tree
  // ============================================================
  function makeNode(raw) {
    const type = TYPE_INFO[raw && raw.type] ? raw.type : 'planet';
    const id = raw && raw.id != null && String(raw.id) ? String(raw.id) : genNodeId(type);
    const x = Number(raw && raw.x);
    const y = Number(raw && raw.y);
    const z = Number(raw && raw.z);
    const now = performance.now();
    return {
      id, type,
      name: (raw && raw.name != null ? String(raw.name) : id).slice(0, 80),
      parent: raw && raw.parent ? String(raw.parent) : null,
      color: raw && raw.color ? String(raw.color) : DEFAULT_COLOR,
      custom: false,
      md: raw && raw.md ? String(raw.md) : '',
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
      z: Number.isFinite(z) ? z : 0,
      vx: 0, vy: 0, vz: 0,
      degree: 0,
      childrenCount: 0,
      radius: 20,
      appear: 0,
      birth: now + Math.random() * 120
    };
  }

  function legacyTree(meta) {
    const list = [];
    const galaxies = Array.isArray(meta.galaxies) ? meta.galaxies : [];
    const colors = meta.nodes || {};
    const extras = meta.nodesExtras || {};
    const seen = new Set();
    const add = node => {
      if (seen.has(node.id)) return;
      seen.add(node.id);
      list.push(makeNode(node));
    };
    const galaxyList = galaxies.length ? galaxies : [{
      id: DEFAULT_GALAXY_ID, name: '我的星系', color: DEFAULT_COLOR, x: 0, y: 0, z: 0, planets: []
    }];
    const planetRefs = [];
    for (const galaxy of galaxyList) {
      const gid = String(galaxy.id || DEFAULT_GALAXY_ID);
      add({
        id: gid, type: 'galaxy', name: galaxy.name || '星系', parent: null,
        color: galaxy.color || DEFAULT_COLOR, x: galaxy.x || 0, y: galaxy.y || 0, z: galaxy.z || 0,
        md: 'galaxies/' + safeFileId(gid) + '.md'
      });
      for (const planetId of galaxy.planets || []) {
        planetRefs.push({ galaxyId: gid, oldId: String(planetId) });
      }
    }
    for (const ref of planetRefs) {
      const base = ref.oldId.endsWith('.md') ? ref.oldId.slice(0, -3) : ref.oldId;
      const id = safeFileId(base);
      if (seen.has(id)) continue;
      const color = (colors[ref.oldId] || {}).color || DEFAULT_COLOR;
      const pos = extras[ref.oldId] || {};
      add({
        id, type: 'planet', name: base.split('/').pop() || id, parent: ref.galaxyId,
        color, x: pos.x || 0, y: pos.y || 0, z: pos.z || 0,
        md: 'planets/' + id + '.md'
      });
    }
    const links = [];
    for (const link of meta.links || []) {
      let s = String(link.source || '');
      let t = String(link.target || '');
      if (!s.startsWith('g-')) s = safeFileId(s.endsWith('.md') ? s.slice(0, -3) : s);
      if (!t.startsWith('g-')) t = safeFileId(t.endsWith('.md') ? t.slice(0, -3) : t);
      if (seen.has(s) && seen.has(t) && s !== t) links.push({ source: s, target: t });
    }
    return { list, links };
  }

  function buildIndex() {
    nodeById = new Map();
    childrenMap = new Map();
    for (const node of allNodes) {
      nodeById.set(node.id, node);
      node.md = node.md || canonicalMd(node);
    }
    for (const node of allNodes) {
      if (node.type === 'galaxy') node.parent = null;
      if (node.parent && !nodeById.has(node.parent)) node.parent = null;
      if (!childrenMap.has(node.parent)) childrenMap.set(node.parent, []);
      childrenMap.get(node.parent).push(node);
    }
    for (const node of allNodes) {
      node.childrenCount = (childrenMap.get(node.id) || []).length;
      node.md = node.md || canonicalMd(node);
    }
  }

  function childrenOf(parentId) {
    return childrenMap.get(parentId) || [];
  }

  function viewParent() {
    return currentParentId ? nodeById.get(currentParentId) || null : null;
  }
  function viewNodeType() {
    if (!currentParentId) return 'galaxy';
    const parent = viewParent();
    return parent && TYPE_INFO[parent.type] ? TYPE_INFO[parent.type].child : null;
  }
  function resolveViewMode() {
    if (!currentParentId) return 'graph';
    const parent = viewParent();
    if (!parent) return 'graph';
    if (parent.type === 'galaxy') return 'graph';
    if (parent.type === 'planet') return 'sphere';
    if (parent.type === 'sector' || parent.type === 'country') return 'flat';
    return 'graph';
  }

  function loadData(data, keepView) {
    const meta = (data && data.meta) || {};
    const files = (data && data.files) || [];
    mdSet = new Set(files.map(file => file.id));
    if (Array.isArray(meta.tree) && meta.tree.length) {
      allNodes = meta.tree.map(makeNode);
      allLinks = (meta.links || []).map(l => ({ source: String(l.source), target: String(l.target) }));
    } else {
      const legacy = legacyTree(meta);
      allNodes = legacy.list;
      allLinks = legacy.links;
    }

    if (!allNodes.some(node => node.type === 'galaxy')) {
      allNodes.push(makeNode({
        id: DEFAULT_GALAXY_ID, type: 'galaxy', name: '我的星系', parent: null,
        color: DEFAULT_COLOR, x: 0, y: 0, z: 0, md: 'galaxies/g-default.md'
      }));
    }

    // Repair parents so every non-galaxy node lives under the right kind of parent.
    const repairMap = new Map(allNodes.map(n => [n.id, n]));
    const firstGalaxy = allNodes.find(n => n.type === 'galaxy');
    const firstPlanet = allNodes.find(n => n.type === 'planet');
    const firstSector = allNodes.find(n => n.type === 'sector');
    const firstCountry = allNodes.find(n => n.type === 'country');
    const parentTypeFor = type => ({ planet: 'galaxy', sector: 'planet', country: 'sector', city: 'country' }[type]);
    for (const node of allNodes) {
      if (node.type === 'galaxy') {
        node.parent = null;
        continue;
      }
      const parent = node.parent ? repairMap.get(node.parent) : null;
      if (!parent || parent.type !== parentTypeFor(node.type)) {
        const fallback = { planet: firstGalaxy, sector: firstPlanet, country: firstSector, city: firstCountry }[node.type];
        node.parent = fallback ? fallback.id : null;
      }
    }

    buildIndex();
    // Keep only links whose endpoints exist and share a type.
    const seen = new Set();
    allLinks = allLinks.filter(link => {
      const a = nodeById.get(link.source);
      const b = nodeById.get(link.target);
      if (!a || !b || a.type !== b.type || a.id === b.id) return false;
      const key = a.id < b.id ? a.id + '\0' + b.id : b.id + '\0' + a.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (!keepView) currentParentId = null;
    if (currentParentId) {
      const parent = nodeById.get(currentParentId);
      if (!parent || !TYPE_INFO[parent.type].child) currentParentId = null;
    }
    if (!keepView) applyHash();
    buildView(true, true);
    if (pendingFocusId) {
      const target = nodeMap.get(pendingFocusId) || nodes.find(n => n.id === pendingFocusId);
      pendingFocusId = null;
      if (target) focusOnNode(target, true);
    }
  }

  function applyHash() {
    const raw = (location.hash || '').slice(1);
    if (!raw) return;
    let id = '';
    try { id = decodeURIComponent(raw); } catch (_) { id = ''; }
    const node = nodeById.get(id);
    if (!node) return;
    if (node.type === 'city') {
      currentParentId = node.parent;
      pendingFocusId = node.id;
    } else if (TYPE_INFO[node.type].child) {
      currentParentId = node.id;
    } else {
      currentParentId = node.parent;
    }
  }

  function buildView(animate, resetCamera) {
    const type = viewNodeType();
    if (!type) {
      currentParentId = null;
    }
    const parentChanged = lastBuiltParentId !== currentParentId;
    lastBuiltParentId = currentParentId;
    if (parentChanged) {
      if (sideOpen) closeSideDoc(true);
      multiSelection.clear();
      selectionOrder = [];
      groupTarget = null;
    }
    viewMode = resolveViewMode();
    const viewType = viewNodeType();
    nodes = childrenOf(currentParentId).filter(node => node.type === viewType);
    nodeMap = new Map(nodes.map(node => [node.id, node]));
    links = allLinks.filter(link => nodeMap.has(link.source) && nodeMap.has(link.target));
    for (const node of nodes) node.degree = 0;
    for (const link of links) {
      const a = nodeMap.get(link.source);
      const b = nodeMap.get(link.target);
      if (a) a.degree++;
      if (b) b.degree++;
    }
    for (const node of nodes) {
      if (node.type === 'galaxy') node.childrenCount = childrenOf(node.id).filter(n => n.type === 'planet').length;
      updateNodeRadius(node);
      refreshNodeColor(node);
      if (node.type === 'sector' && !node.custom) {
        const index = nodes.indexOf(node);
        node.displayColor = SECTOR_COLORS[index % SECTOR_COLORS.length];
        node._rgb = hexToRgb(node.displayColor);
        node._mid = rgbStr(node._rgb);
        node._light = rgbStr(mixColor(node._rgb, { r: 255, g: 255, b: 255 }, 0.55));
        node._glow = glowSprite(node.displayColor);
      } else if ((node.type === 'country' || node.type === 'city') && !node.custom) {
        const index = nodes.indexOf(node);
        const palette = node.type === 'country' ? COUNTRY_PALETTE : CITY_PALETTE;
        node.displayColor = palette[index % palette.length];
        node._rgb = hexToRgb(node.displayColor);
        node._mid = rgbStr(node._rgb);
        node._light = rgbStr(mixColor(node._rgb, { r: 255, g: 255, b: 255 }, 0.55));
        node._glow = glowSprite(node.displayColor);
      }
      if (viewMode === 'flat') { node.z = 0; }
      if (animate) {
        node.appear = reduceMotion ? 1 : 0;
        node.birth = performance.now() + 100 + Math.min(nodes.indexOf(node), 24) * 50;
      }
    }

    if (viewMode === 'sphere') {
      computeSectorPatches();
      globe.auto = true;
    }

    hoverNode = null;
    focusNode = null;
    contextNode = null;
    linkSource = null;
    dragNode = null;
    mode = 'idle';

    if (sideOpen && sideNodeId && !nodeMap.has(sideNodeId)) {
      closeSideDoc(true);
    }

    if (resetCamera) {
      cam.target.x = 0; cam.target.y = 0; cam.target.z = 0;
      cam.goalTarget.x = 0; cam.goalTarget.y = 0; cam.goalTarget.z = 0;
      cam.zoom = 1; cam.goalZoom = 1;
      if (viewMode === 'graph') {
        cam.theta = 0.62; cam.phi = 0.26;
        cam.autoRotate = autoPreference;
        cam.dist = 1000;
      } else if (viewMode === 'flat') {
        cam.theta = 0; cam.phi = 0.001;
        cam.autoRotate = false;
        cam.dist = 1100;
      } else {
        cam.theta = 0.55; cam.phi = 0.18;
        cam.autoRotate = false;
        cam.dist = 1000;
      }
    } else if (viewMode === 'graph') {
      cam.autoRotate = autoPreference;
    } else {
      cam.autoRotate = false;
      cam.theta = viewMode === 'flat' ? 0 : 0.55;
      cam.phi = viewMode === 'flat' ? 0.001 : 0.18;
    }
    if (viewMode === 'sphere' && resetCamera) {
      globe.q = initialGlobeQuat();
    }
    const autoBtn = $('autoBtn');
    if (autoBtn) {
      autoBtn.classList.toggle('active', viewMode === 'sphere' ? globe.auto : autoPreference);
      autoBtn.classList.toggle('disabled', viewMode === 'flat');
    }

    if (multiSelection.size) {
      const ids = multiIdsSorted();
      const stillValid = ids.every(id => nodeMap.has(id)) &&
        (ids.length < 2 || isSelectionConnected(ids));
      if (!stillValid) {
        multiSelection.clear();
        selectionOrder = [];
        groupTarget = null;
        if (sideOpen && sideKind === 'relation') closeSideDoc(true);
      } else {
        relationIds = ids;
        focusSelectionGroup();
        if (sideOpen && sideKind === 'relation' && docState.mode === 'read') renderRelationDoc();
      }
    }
    updateStatus();
    updateSectorPanel();
    updateEmptyState();
    updateBackBtn();
    updateHash();
    updateCursor();
    updateNodeInfo();
    computeCameraFrame();
  }

  function updateSectorPanel() {
    const panel = $('sectorPanel');
    if (!panel) return;
    if (viewMode !== 'sphere' || !nodes.length) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = 'block';
    const total = nodes.reduce((sum, node) => sum + Math.max(1, node.childrenCount), 0);
    $('sectorTotal').textContent = nodes.length + ' 板块';
    $('sectorRows').innerHTML = nodes.map(node => {
      const weight = Math.max(1, node.childrenCount);
      const pct = total ? weight / total * 100 : 0;
      return '<div class="sector-row">' +
        '<span class="sector-dot" style="background:' + node.displayColor + ';color:' + node.displayColor + '"></span>' +
        '<span class="sector-name">' + escapeHtml(node.name) + '</span>' +
        '<span class="sector-count">' + node.childrenCount + ' 国</span>' +
        '<span class="sector-pct">' + pct.toFixed(1) + '%</span>' +
        '</div>';
    }).join('');
  }

  function updateHash() {
    const base = location.pathname + location.search;
    if (currentParentId) {
      history.replaceState(null, '', base + '#' + encodeURIComponent(currentParentId));
    } else {
      history.replaceState(null, '', base);
    }
  }

  function updateStatus() {
    const linkCount = links.length;
    const parent = viewParent();
    let text = '';
    if (!parent) {
      text = '根星域 · ' + nodes.length + ' 个星系 · ' + linkCount + ' 条星链';
    } else {
      const childLabel = TYPE_INFO[parent.type].childLabel;
      text = parent.name + ' · ' + nodes.length + ' 个' + childLabel + ' · ' + linkCount + ' 条星链';
    }
    if (multiSelection.size) text += ' · 已选 ' + multiSelection.size;
    $('graphStatus').textContent = text;
    $('backLevelBtn').classList.toggle('hidden', !parent);
    if (parent) {
      const up = parent.parent ? nodeById.get(parent.parent) : null;
      $('backLevelBtn').innerHTML = '<span class="ico">↑</span><span class="lbl">' + escapeHtml(up ? up.name : '根星域') + '</span>';
    }
  }

  function updateBackBtn() {
    const parent = viewParent();
    $('backLevelBtn').classList.toggle('hidden', !parent);
  }

  function updateEmptyState() {
    const type = viewNodeType();
    emptyState.classList.toggle('show', nodes.length === 0);
    if (nodes.length) return;
    const parent = viewParent();
    let title = '还没有' + (TYPE_INFO[type] ? TYPE_INFO[type].plural : '节点');
    let sub = '右键空白处 → 新建' + (TYPE_INFO[type] ? TYPE_INFO[type].label : '节点');
    if (!parent) {
      title = '还没有星系';
      sub = '右键空白处 → 新建星系';
    } else if (type === 'planet') {
      title = '这个星系还没有星球';
      sub = '右键空白处 → 新建星球';
    } else if (type === 'sector') {
      title = '这个星球还没有板块';
      sub = '右键空白处 → 新建板块';
    } else if (type === 'country') {
      title = '这个板块还没有国家';
      sub = '右键空白处 → 新建国家';
    } else if (type === 'city') {
      title = '这个国家还没有城市';
      sub = '右键空白处 → 新建城市';
    }
    $('esTitle').textContent = title;
    $('esSub').textContent = sub;
    emptyState.querySelector('.es-icon').textContent = '[!]';
  }

  function updateNodeInfo() {
    if (!hoverNode && !focusNode && multiSelection.size >= 2) {
      const selected = multiNodesInOrder();
      const edgeCount = linksAmongIds(multiIdsSorted()).length;
      $('niName').textContent = '已选择 ' + selected.length + ' 个节点';
      $('niPath').textContent = '关系 · ' + edgeCount + ' 条星链';
      $('niDegree').textContent = 'Ctrl 单击增减';
      $('niTip').textContent = '左侧聚焦所选 · 右侧编辑关系笔记';
      const dot = $('niDot');
      dot.style.background = '#7cffd2';
      dot.style.boxShadow = '0 0 12px #7cffd2';
      nodeInfoEl.classList.add('show');
      return;
    }
    const node = hoverNode || focusNode;
    if (!node) {
      nodeInfoEl.classList.remove('show');
      infoNodeId = null;
      return;
    }
    const info = TYPE_INFO[node.type];
    const countLabel = info.child ? (node.childrenCount + ' 个' + info.childLabel) : (node.degree + ' 条星链');
    const content = nodeHasMd(node) ? ('notes/' + canonicalMd(node)) : '无内容 · 右键「编辑内容」';
    if (node.id !== infoNodeId) infoNodeId = node.id;
    $('niName').textContent = node.name;
    $('niPath').textContent = info.label + ' · ' + content;
    $('niDegree').textContent = countLabel;
    $('niTip').textContent = '单击聚焦 / 内容 · Ctrl 多选 · 双击进入 · Del 删除';
    const dot = $('niDot');
    dot.style.background = node.displayColor;
    dot.style.boxShadow = '0 0 12px ' + node.displayColor;
    nodeInfoEl.classList.add('show');
  }

  function nodeHasMd(node) {
    return !!node && mdSet.has(canonicalMd(node));
  }

  function updateNodeRadius(node) {
    const info = TYPE_INFO[node.type];
    if (node.type === 'galaxy') {
      node.radius = 44 + Math.min(20, node.childrenCount * 2.4) + Math.min(10, node.name.length * 0.6);
    } else if (node.type === 'planet') {
      node.radius = 22 + Math.min(12, node.childrenCount * 2.2) + Math.min(9, node.name.length * 0.55);
    } else if (node.type === 'sector') {
      node.radius = 20;
    } else if (node.type === 'country') {
      node.radius = 34 + Math.min(10, node.childrenCount * 2) + Math.min(8, node.name.length * 0.55);
    } else {
      node.radius = 32 + Math.min(8, node.degree * 1.8) + Math.min(7, node.name.length * 0.5);
    }
    node.radius = clamp(node.radius, 20, 110);
  }

  function refreshNodeColor(node) {
    const custom = node.color && String(node.color).toLowerCase() !== DEFAULT_COLOR;
    node.custom = custom;
    node.displayColor = custom ? node.color : paletteFor(node.type, node.id);
    const rgb = hexToRgb(node.displayColor);
    node._rgb = rgb;
    node._mid = rgbStr(rgb);
    node._light = rgbStr(mixColor(rgb, { r: 255, g: 255, b: 255 }, 0.6));
    node._glow = glowSprite(node.displayColor);
    if (node.type === 'galaxy') node._galaxy = galaxySprite(node.displayColor);
    else if (node.type === 'planet') node._sphere = sphereSprite(node.displayColor);
  }

  function refreshMetadata() {
    buildIndex();
  }

  function storedColor(node) {
    return node.color && String(node.color).toLowerCase() !== DEFAULT_COLOR ? node.color : DEFAULT_COLOR;
  }

  function saveMeta() {
    const tree = allNodes.map(node => ({
      id: node.id,
      type: node.type,
      name: node.name,
      parent: node.parent,
      color: storedColor(node),
      x: Math.round(node.x * 100) / 100,
      y: Math.round(node.y * 100) / 100,
      z: Math.round(node.z * 100) / 100,
      md: canonicalMd(node)
    }));
    const linksPayload = allLinks.map(link => ({ source: link.source, target: link.target }));
    return apiFetch('/api/meta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 2, tree, links: linksPayload })
    }).catch(error => { console.error('保存元数据失败:', error); });
  }

  function scheduleMetaSave(delay) {
    clearTimeout(metaSaveTimer);
    metaSaveTimer = setTimeout(saveMeta, delay || 600);
  }

  // ============================================================
  // Background / sprites
  // ============================================================
  const starColors = ['#d1ffe8', '#a7ffcf', '#eafff5', '#7cffb2', '#c8ffe8'];
  const bgStars = [];
  for (let i = 0; i < 340; i++) {
    bgStars.push({
      x: Math.random(), y: Math.random(), z: 0.15 + Math.random() * 0.85,
      size: 0.5 + Math.random() * 1.5, speed: 0.7 + Math.random() * 1.6,
      phase: Math.random() * TAU, color: starColors[(Math.random() * starColors.length) | 0]
    });
  }
  const dust = [];
  for (let i = 0; i < 130; i++) {
    const p = randomPos(220, 1220, 0.55);
    dust.push({
      x: p.x, y: p.y, z: p.z, size: 0.8 + Math.random() * 1.8,
      phase: Math.random() * TAU, speed: 0.4 + Math.random() * 1.1,
      color: starColors[(Math.random() * starColors.length) | 0]
    });
  }

  const RAIN_GLYPHS = '0101010101ABCDEF';
  const rainCols = [];
  function resetRainColumn(col, initial) {
    col.x = Math.random();
    col.y = initial ? (-0.15 + Math.random() * 1.25) : (-0.2 - Math.random() * 0.35);
    col.speed = 0.045 + Math.random() * 0.09;
    col.size = 10 + Math.random() * 7;
    col.alpha = 0.035 + Math.random() * 0.075;
    col.seed = (Math.random() * 997) | 0;
  }
  for (let i = 0; i < 28; i++) {
    const col = {};
    resetRainColumn(col, true);
    rainCols.push(col);
  }
  function drawMatrixRain(dt, t) {
    if (reduceMotion) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const col of rainCols) {
      col.y += col.speed * dt;
      if (col.y > 1.25) resetRainColumn(col, false);
      const x = col.x * W;
      const y = col.y * H;
      for (let k = 0; k < 3; k++) {
        const yy = y - k * col.size * 1.2;
        if (yy < -24 || yy > H + 24) continue;
        const charIndex = (col.seed + k + Math.floor(t * 3)) % RAIN_GLYPHS.length;
        ctx.globalAlpha = col.alpha * (k === 0 ? 1.7 : 1 - k * 0.3);
        ctx.fillStyle = k === 0 ? '#eafff5' : '#00ff9c';
        ctx.font = col.size.toFixed(1) + 'px ' + MONO_CANVAS;
        ctx.fillText(RAIN_GLYPHS[charIndex], x, yy);
      }
    }
    ctx.globalAlpha = 1;
  }

  const glowCache = new Map();
  function glowSprite(hex) {
    let sp = glowCache.get(hex);
    if (sp) return sp;
    const size = 128;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    const rgb = hexToRgb(hex);
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.14, rgbStr(rgb, 0.75));
    grd.addColorStop(0.38, rgbStr(rgb, 0.3));
    grd.addColorStop(0.68, rgbStr(rgb, 0.08));
    grd.addColorStop(1, rgbStr(rgb, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    glowCache.set(hex, cv);
    return cv;
  }

  const sphereCache = new Map();
  function sphereSprite(hex) {
    let sp = sphereCache.get(hex);
    if (sp) return sp;
    const size = 192;
    const half = size / 2;
    const sr = half - 6;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    const rgb = hexToRgb(hex);
    const lightRgb = mixColor(rgb, { r: 255, g: 255, b: 255 }, 0.6);
    const darkRgb = mixColor(rgb, { r: 4, g: 8, b: 20 }, 0.74);
    g.save();
    g.translate(half, half);
    const grad = g.createRadialGradient(-sr * 0.34, -sr * 0.38, sr * 0.06, 0, 0, sr * 1.06);
    grad.addColorStop(0, rgbStr(lightRgb));
    grad.addColorStop(0.42, rgbStr(rgb));
    grad.addColorStop(1, rgbStr(darkRgb));
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, sr, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.2)';
    g.lineWidth = Math.max(1, sr * 0.035);
    g.stroke();
    g.beginPath();
    g.arc(0, 0, sr, 0, TAU);
    g.clip();
    const hx = -sr * 0.3, hy = -sr * 0.34;
    const sg = g.createRadialGradient(hx, hy, 0, hx, hy, sr * 0.78);
    sg.addColorStop(0, 'rgba(255,255,255,0.9)');
    sg.addColorStop(0.3, 'rgba(255,255,255,0.2)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sg;
    g.fillRect(-sr, -sr, sr * 2, sr * 2);
    g.restore();
    sphereCache.set(hex, cv);
    return cv;
  }

  const galaxyCache = new Map();
  function galaxySprite(hex) {
    let sp = galaxyCache.get(hex);
    if (sp) return sp;
    const size = 256;
    const half = size / 2;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    const rgb = hexToRgb(hex);
    const light = mixColor(rgb, { r: 255, g: 255, b: 255 }, 0.58);
    g.translate(half, half);

    const haze = g.createRadialGradient(0, 0, 0, 0, 0, 126);
    haze.addColorStop(0, rgbStr(light, 0.2));
    haze.addColorStop(0.35, rgbStr(rgb, 0.11));
    haze.addColorStop(1, rgbStr(rgb, 0));
    g.fillStyle = haze;
    g.beginPath();
    g.arc(0, 0, 126, 0, TAU);
    g.fill();

    const arms = 3;
    for (let a = 0; a < arms; a++) {
      const base = a * TAU / arms;
      for (let i = 0; i < 180; i++) {
        const t = i / 180;
        const r = 6 + t * 113;
        const ang = base + t * 4.8 + (Math.random() - 0.5) * 0.16;
        const x = Math.cos(ang) * r;
        const y = Math.sin(ang) * r * 0.92;
        const sz = Math.max(0.6, (1 - t) * 2.4 + 0.5);
        const alpha = (1 - t) * 0.55 + 0.07;
        g.fillStyle = (i % 9 === 0)
          ? 'rgba(255,255,255,' + Math.min(1, alpha + 0.16).toFixed(3) + ')'
          : rgbStr(i % 3 === 0 ? light : rgb, alpha.toFixed(3));
        g.beginPath();
        g.arc(x, y, sz, 0, TAU);
        g.fill();
      }
    }

    for (let i = 0; i < 70; i++) {
      const ang = Math.random() * TAU;
      const r = 34 + Math.random() * 88;
      g.fillStyle = rgbStr(light, (0.04 + Math.random() * 0.14).toFixed(3));
      g.beginPath();
      g.arc(Math.cos(ang) * r, Math.sin(ang) * r * 0.9, Math.random() * 1.3 + 0.4, 0, TAU);
      g.fill();
    }

    const core = g.createRadialGradient(0, 0, 0, 0, 0, 44);
    core.addColorStop(0, 'rgba(255,255,255,1)');
    core.addColorStop(0.2, rgbStr(light, 0.95));
    core.addColorStop(0.58, rgbStr(rgb, 0.45));
    core.addColorStop(1, rgbStr(rgb, 0));
    g.fillStyle = core;
    g.beginPath();
    g.arc(0, 0, 44, 0, TAU);
    g.fill();

    g.strokeStyle = rgbStr(light, 0.22);
    g.lineWidth = 1.1;
    g.beginPath();
    g.ellipse(0, 0, 108, 72, 0.42, 0, TAU);
    g.stroke();

    galaxyCache.set(hex, cv);
    return cv;
  }


  // Gaussian-splatted sphere texture for the sector page.
  let splatSphereTexture = null;
  const sphereSplats = [];
  for (let i = 0; i < 150; i++) {
    const u = Math.random() * 2 - 1;
    const a = Math.random() * TAU;
    const rr = Math.sqrt(1 - u * u);
    sphereSplats.push({
      x: rr * Math.cos(a), y: u, z: rr * Math.sin(a),
      size: 0.6 + Math.random() * 2.1,
      color: Math.random() < 0.14 ? '#eafff5' : (Math.random() < 0.55 ? '#00ff9c' : '#22d3ee'),
      alpha: 0.05 + Math.random() * 0.17,
      phase: Math.random() * TAU,
      speed: 0.6 + Math.random() * 1.5,
      lift: 1.002 + Math.random() * 0.035
    });
  }
  function getSplatSphere() {
    if (splatSphereTexture) return splatSphereTexture;
    const size = 512;
    const c = size / 2;
    const R = 236;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');

    const base = g.createRadialGradient(c - 50, c - 60, 10, c, c, R);
    base.addColorStop(0, 'rgba(0, 12, 7, 0.99)');
    base.addColorStop(0.6, 'rgba(0, 16, 9, 0.98)');
    base.addColorStop(0.94, 'rgba(0, 38, 20, 0.96)');
    base.addColorStop(1, 'rgba(0, 60, 30, 0.42)');
    g.fillStyle = base;
    g.beginPath();
    g.arc(c, c, R, 0, TAU);
    g.fill();

    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 950; i++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * TAU;
      const rr = Math.sqrt(1 - u * u);
      const x = rr * Math.cos(a);
      const y = u;
      const z = rr * Math.sin(a);
      const depth = (z + 1) / 2;
      const px = c + x * R * 0.98;
      const py = c - y * R * 0.98;
      const rad = 3 + depth * 14 + Math.random() * 6;
      const bright = Math.random() < 0.12;
      const rgb = bright
        ? { r: 220, g: 255, b: 240 }
        : (Math.random() < 0.55 ? { r: 0, g: 255, b: 156 } : { r: 34, g: 211, b: 238 });
      const grd = g.createRadialGradient(px, py, 0, px, py, rad);
      const centerAlpha = (bright ? 0.04 : 0.006) + depth * (bright ? 0.04 : 0.018);
      grd.addColorStop(0, rgbStr(rgb, centerAlpha));
      grd.addColorStop(0.45, rgbStr(rgb, centerAlpha * 0.45));
      grd.addColorStop(1, rgbStr(rgb, 0));
      g.fillStyle = grd;
      g.beginPath();
      g.arc(px, py, rad, 0, TAU);
      g.fill();
    }

    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(0, 255, 156, 0.55)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(c, c, R - 1, 0, TAU);
    g.stroke();
    g.globalCompositeOperation = 'lighter';
    const rim = g.createRadialGradient(c, c, R * 0.7, c, c, R);
    rim.addColorStop(0, 'rgba(0,255,156,0)');
    rim.addColorStop(0.84, 'rgba(0,255,156,0.035)');
    rim.addColorStop(1, 'rgba(185,255,225,0.24)');
    g.fillStyle = rim;
    g.beginPath();
    g.arc(c, c, R, 0, TAU);
    g.fill();
    g.globalCompositeOperation = 'source-over';

    splatSphereTexture = cv;
    return cv;
  }

  // ============================================================
  // Sector sphere layout (area-proportional treemap on a sphere)
  // ============================================================
  function layoutTreemap(weights) {
    const items = weights.map((weight, index) => ({ index, weight: Math.max(1, weight) }));
    const rects = new Array(weights.length);
    function total(group) { return group.reduce((sum, item) => sum + item.weight, 0); }
    function rec(group, x, y, w, h, vertical) {
      if (group.length === 1) {
        rects[group[0].index] = { x, y, w, h };
        return;
      }
      const sum = total(group);
      let acc = 0;
      let split = 1;
      for (let i = 0; i < group.length - 1; i++) {
        acc += group[i].weight;
        if (acc >= sum / 2) { split = i + 1; break; }
      }
      const first = group.slice(0, split);
      const second = group.slice(split);
      const ratio = total(first) / sum;
      if (vertical) {
        rec(first, x, y, w * ratio, h, false);
        rec(second, x + w * ratio, y, w * (1 - ratio), h, false);
      } else {
        rec(first, x, y, w, h * ratio, true);
        rec(second, x, y + h * ratio, w, h * (1 - ratio), true);
      }
    }
    rec(items.slice().sort((a, b) => b.weight - a.weight), 0, 0, 1, 1, true);
    return rects;
  }

  function computeSectorPatches() {
    if (!nodes.length) return;
    const weights = nodes.map(node => Math.max(1, node.childrenCount));
    const rects = layoutTreemap(weights);
    nodes.forEach((node, index) => {
      const rect = rects[index] || { x: 0, y: 0, w: 1, h: 1 };
      node._patch = {
        u0: rect.x, v0: rect.y, u1: rect.x + rect.w, v1: rect.y + rect.h,
        w: rect.w, h: rect.h, centerU: rect.x + rect.w / 2, centerV: rect.y + rect.h / 2,
        poly: null, world: null, front: false
      };
    });
  }

  function sphereFrontLongitude() {
    return Math.PI / 2 - cam.theta;
  }

  function yawForSector(node) {
    if (!node || !node._patch) return 0;
    return (node._patch.centerU - 0.5) * TAU - sphereFrontLongitude();
  }

  function largestSectorYaw() {
    if (!nodes.length) return 0;
    let largest = nodes[0];
    let weight = -1;
    for (const node of nodes) {
      const w = Math.max(1, node.childrenCount);
      if (w > weight) { weight = w; largest = node; }
    }
    return yawForSector(largest) + Math.PI / 2;
  }

  function initialGlobeQuat() {
    return eulerQuat(largestSectorYaw(), 0.18);
  }

  function sectorPoint(u, v) {
    const lon = (u - 0.5) * TAU;
    const lat = Math.asin(clamp(1 - 2 * v, -1, 1));
    const base = {
      x: Math.cos(lat) * Math.cos(lon),
      y: Math.sin(lat),
      z: Math.cos(lat) * Math.sin(lon)
    };
    const p = quatRotate(globe.q, base);
    return { x: p.x * SPLAT_RADIUS, y: p.y * SPLAT_RADIUS, z: p.z * SPLAT_RADIUS };
  }

  function isFrontFacing(world) {
    const cx = camPosX - world.x;
    const cy = camPosY - world.y;
    const cz = camPosZ - world.z;
    return world.x * cx + world.y * cy + world.z * cz > 0;
  }

  function updateSphereGeometry() {
    for (const node of nodes) {
      const patch = node._patch;
      if (!patch) continue;
      const center = sectorPoint(patch.centerU, patch.centerV);
      patch.world = center;
      const visible = projectTo(center.x, center.y, center.z, node);
      node._visible = visible;
      if (!visible) continue;
      node._world = center;
      node._alpha = depthAlpha(node.zc) * node.appear;
      node._patchFront = isFrontFacing(center);
      const poly = [];
      const steps = 6;
      const push = (u, v) => {
        const point = sectorPoint(u, v);
        if (projectTo(point.x, point.y, point.z, tmpPoint)) {
          poly.push({ x: tmpPoint.sx, y: tmpPoint.sy, z: tmpPoint.zc, front: isFrontFacing(point) });
        }
      };
      for (let i = 0; i <= steps; i++) push(patch.u0 + (patch.u1 - patch.u0) * i / steps, patch.v0);
      for (let i = 1; i <= steps; i++) push(patch.u1, patch.v0 + (patch.v1 - patch.v0) * i / steps);
      for (let i = 1; i <= steps; i++) push(patch.u1 - (patch.u1 - patch.u0) * i / steps, patch.v1);
      for (let i = 1; i <= steps; i++) push(patch.u0, patch.v1 - (patch.v1 - patch.v0) * i / steps);
      patch.poly = poly;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const point of poly) {
        minX = Math.min(minX, point.x); minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y);
      }
      node._r = Math.max(8, Math.max(maxX - minX, maxY - minY) / 2);
    }
  }

  function pointInPolygon(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  function pickSector(sx, sy) {
    let best = null;
    let bestZ = Infinity;
    for (const node of nodes) {
      if (!node._visible || !node._hitCells || !node._hitCells.length) continue;
      for (const cell of node._hitCells) {
        if (!pointInPolygon(sx, sy, cell.poly)) continue;
        if (cell.zc < bestZ) {
          best = node;
          bestZ = cell.zc;
        }
        break;
      }
    }
    return best;
  }

  // ============================================================
  // Physics / camera metrics / globe
  // ============================================================
  const REPULSION = 78000;
  const SPRING_STRENGTH = 0.02;
  const CENTER_FORCE = 0.0016;
  const FLATTEN_FORCE = 0.002;
  const DAMPING = 0.87;
  const MAX_SPEED = 16;

  function integrateGraph() {
    const arr = nodes;
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      for (let j = i + 1; j < arr.length; j++) {
        const b = arr[j];
        let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        let d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 1) {
          dx = Math.random() - 0.5; dy = Math.random() - 0.5; dz = Math.random() - 0.5; d2 = 1;
        }
        const d = Math.sqrt(d2);
        const sizeFactor = (a.radius + b.radius) / 60;
        let f = REPULSION * Math.max(0.6, sizeFactor) / d2;
        const minD = (a.radius + b.radius) * 1.08;
        if (d < minD) f += (minD - d) * 0.09;
        const fx = dx / d * f, fy = dy / d * f, fz = dz / d * f;
        a.vx -= fx; a.vy -= fy; a.vz -= fz;
        b.vx += fx; b.vy += fy; b.vz += fz;
      }
    }
    for (const link of links) {
      const a = nodeMap.get(link.source), b = nodeMap.get(link.target);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const d = Math.max(1, Math.hypot(dx, dy, dz));
      const rest = 220 + (a.radius + b.radius) * 0.9;
      const f = (d - rest) * SPRING_STRENGTH;
      const fx = dx / d * f, fy = dy / d * f, fz = dz / d * f;
      a.vx += fx; a.vy += fy; a.vz += fz;
      b.vx -= fx; b.vy -= fy; b.vz -= fz;
    }
    for (const node of arr) {
      if (node === dragNode) { node.vx = node.vy = node.vz = 0; continue; }
      node.vx -= node.x * CENTER_FORCE;
      node.vy -= node.y * (CENTER_FORCE + FLATTEN_FORCE);
      node.vz -= node.z * CENTER_FORCE;
      node.vx *= DAMPING; node.vy *= DAMPING; node.vz *= DAMPING;
      const speed = Math.hypot(node.vx, node.vy, node.vz);
      if (speed > MAX_SPEED) {
        const k = MAX_SPEED / speed;
        node.vx *= k; node.vy *= k; node.vz *= k;
      }
      node.x += node.vx; node.y += node.vy; node.z += node.vz;
    }
  }

  function integrateFlat() {
    const arr = nodes;
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      for (let j = i + 1; j < arr.length; j++) {
        const b = arr[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
        const d = Math.sqrt(d2);
        let f = 92000 / d2;
        const minD = (a.radius + b.radius) * 1.12;
        if (d < minD) f += (minD - d) * 0.11;
        const fx = dx / d * f, fy = dy / d * f;
        a.vx -= fx; a.vy -= fy;
        b.vx += fx; b.vy += fy;
      }
    }
    for (const link of links) {
      const a = nodeMap.get(link.source), b = nodeMap.get(link.target);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const rest = 210 + (a.radius + b.radius) * 0.9;
      const f = (d - rest) * SPRING_STRENGTH;
      const fx = dx / d * f, fy = dy / d * f;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }
    for (const node of arr) {
      if (node === dragNode) { node.vx = node.vy = 0; node.z = 0; continue; }
      node.vx -= node.x * CENTER_FORCE;
      node.vy -= node.y * CENTER_FORCE;
      node.vx *= DAMPING; node.vy *= DAMPING;
      const speed = Math.hypot(node.vx, node.vy);
      if (speed > MAX_SPEED) {
        const k = MAX_SPEED / speed;
        node.vx *= k; node.vy *= k;
      }
      node.x += node.vx; node.y += node.vy;
      node.z = 0;
    }
  }

  function simulate(dt) {
    if (viewMode === 'sphere' || nodes.length === 0) return;
    simAcc = Math.min(simAcc + dt, 0.2);
    let steps = 0;
    while (simAcc >= 1 / 60 && steps < 3) {
      if (viewMode === 'flat') integrateFlat(); else integrateGraph();
      simAcc -= 1 / 60;
      steps++;
    }
  }

  function updateMetrics(dt) {
    if (viewMode === 'sphere') {
      graphRadius = SPLAT_RADIUS;
      cam.dist = lerp(cam.dist, 1000, 1 - Math.exp(-2 * dt));
      return;
    }
    let maxR = 120;
    for (const node of nodes) {
      const r = Math.hypot(node.x, node.y, node.z) + node.radius;
      if (r > maxR) maxR = r;
    }
    graphRadius = maxR;
    const desired = clamp(maxR * (viewMode === 'flat' ? 2.6 : 3.0), 780, 4200);
    cam.dist = lerp(cam.dist, desired, 1 - Math.exp(-1.6 * dt));
  }

  function updateAppearance(now) {
    for (const node of nodes) {
      if (node.appear >= 1) continue;
      if (now < node.birth) continue;
      node.appear = Math.min(1, node.appear + 0.016 * 2.6);
    }
  }

  function updateGlobe(dt) {
    if (viewMode !== 'sphere' || transition || globe.dragging) return;
    if (globe.auto && !reduceMotion) {
      globe.q = quatNormalize(quatMul(quatAxis(0, 1, 0, 0.055 * dt), globe.q));
    }
  }

  // ============================================================
  // Common drawing
  // ============================================================
  function drawStars(t) {
    const ox = cam.theta * 0.1;
    const oy = cam.phi * 0.2;
    for (const star of bgStars) {
      const parallax = 0.3 + star.z * 1.1;
      let u = star.x + ox * parallax + t * 0.0016 * parallax;
      u -= Math.floor(u);
      let v = star.y + oy * parallax;
      v -= Math.floor(v);
      const tw = 0.5 + 0.5 * Math.sin(t * star.speed + star.phase);
      ctx.globalAlpha = (0.14 + 0.55 * star.z) * (0.4 + 0.6 * tw);
      ctx.fillStyle = star.color;
      ctx.beginPath();
      ctx.arc(u * W, v * H, star.size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawCore(t) {
    if (!projectTo(0, 0, 0, tmpPoint)) return;
    const rad = Math.max(120, graphRadius * 2.4 * tmpPoint.s);
    const g = ctx.createRadialGradient(tmpPoint.sx, tmpPoint.sy, 0, tmpPoint.sx, tmpPoint.sy, rad);
    g.addColorStop(0, 'rgba(0,255,150,0.14)');
    g.addColorStop(0.38, 'rgba(0,200,255,0.05)');
    g.addColorStop(0.72, 'rgba(124,255,178,0.025)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(tmpPoint.sx, tmpPoint.sy, rad, 0, TAU);
    ctx.fill();
  }

  function drawRings(t) {
    const R = graphRadius * 1.35;
    const rings = [
      { r: R, tilt: 0, tiltZ: 0, speed: 0.13, phase: 0, color: '#00ff9c' },
      { r: R * 0.82, tilt: 0.62, tiltZ: 0.36, speed: -0.1, phase: 1.9, color: '#c8ffe8' },
      { r: R * 1.16, tilt: -0.4, tiltZ: -0.52, speed: 0.07, phase: 3.4, color: '#7cffb2' }
    ];
    for (const cfg of rings) {
      const ct = Math.cos(cfg.tilt), st = Math.sin(cfg.tilt);
      const cz = Math.cos(cfg.tiltZ), sz = Math.sin(cfg.tiltZ);
      for (let i = 0; i < 100; i++) {
        const a = i / 100 * TAU + t * cfg.speed + cfg.phase;
        const x = Math.cos(a) * cfg.r;
        const z = Math.sin(a) * cfg.r;
        const y1 = -z * st;
        const z1 = z * ct;
        const x1 = x * cz - y1 * sz;
        const y2 = x * sz + y1 * cz;
        if (!projectTo(x1, y2, z1, tmpPoint)) continue;
        const depth = clamp(1 - (tmpPoint.zc - (cam.dist - cfg.r)) / (cfg.r * 2), 0.15, 1);
        ctx.globalAlpha = 0.06 + depth * 0.22;
        ctx.fillStyle = i % 17 === 0 ? '#eafff5' : cfg.color;
        ctx.beginPath();
        ctx.arc(tmpPoint.sx, tmpPoint.sy, clamp(tmpPoint.s * 1.6, 0.5, 2.1), 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawDust(t) {
    for (const p of dust) {
      if (!projectTo(p.x, p.y, p.z, tmpPoint)) continue;
      ctx.globalAlpha = (0.08 + 0.22 * Math.abs(Math.sin(t * p.speed + p.phase))) * depthAlpha(tmpPoint.zc);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(tmpPoint.sx, tmpPoint.sy, clamp(p.size * tmpPoint.s, 0.4, 2.2), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawLinks(t) {
    const packetGlow = glowSprite('#9dffcc');
    for (const link of links) {
      const a = nodeMap.get(link.source), b = nodeMap.get(link.target);
      if (!a || !b || !a._visible || !b._visible) continue;
      const alpha = Math.min(a._alpha, b._alpha);
      if (alpha < 0.03) continue;
      const depth = depthAlpha((a.zc + b.zc) * 0.5);
      const bothSelected = multiSelection.has(link.source) && multiSelection.has(link.target);
      const hot = (focusNode && (link.source === focusNode.id || link.target === focusNode.id)) ||
                  (hoverNode && (link.source === hoverNode.id || link.target === hoverNode.id)) ||
                  bothSelected;
      const strength = clamp(0.8 * depth * alpha * (hot ? 1.9 : 1), 0, 1);
      if (strength < 0.02) continue;
      const ax = a.sx, ay = a.sy, bx = b.sx, by = b.sy;
      const w = clamp(1.35 * a.s, 0.7, 2.8);
      const grad = ctx.createLinearGradient(ax, ay, bx, by);
      grad.addColorStop(0, '#eafff5');
      grad.addColorStop(0.45, '#7cffb2');
      grad.addColorStop(1, '#00ff9c');
      ctx.globalAlpha = 1;
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.globalAlpha = strength * 0.18;
      ctx.lineWidth = w * 5.5;
      ctx.stroke();
      ctx.globalAlpha = strength * 0.62;
      ctx.lineWidth = w * 1.2;
      ctx.stroke();
      ctx.setLineDash([6, 12]);
      ctx.lineDashOffset = -(t * 70 + (link.seed || 0) * 90);
      ctx.globalAlpha = strength * 0.95;
      ctx.lineWidth = w * 1.9;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;

      const packets = hot ? 3 : 2;
      ctx.lineCap = 'round';
      for (let k = 0; k < packets; k++) {
        const phase = (t * 0.22 + (link.seed || 0) + k / packets) % 1;
        const px = lerp(a.x, b.x, phase);
        const py = lerp(a.y, b.y, phase);
        const pz = lerp(a.z, b.z, phase);
        if (!projectTo(px, py, pz, tmpPoint)) continue;
        const tail = Math.max(0, phase - 0.1);
        const tx = lerp(a.x, b.x, tail);
        const ty = lerp(a.y, b.y, tail);
        const tz = lerp(a.z, b.z, tail);
        if (projectTo(tx, ty, tz, tmpPoint2)) {
          const tailGrad = ctx.createLinearGradient(tmpPoint2.sx, tmpPoint2.sy, tmpPoint.sx, tmpPoint.sy);
          tailGrad.addColorStop(0, 'rgba(0,255,150,0)');
          tailGrad.addColorStop(1, 'rgba(235,255,245,0.95)');
          ctx.strokeStyle = tailGrad;
          ctx.globalAlpha = strength * 0.9;
          ctx.lineWidth = clamp(2.3 * tmpPoint.s, 1.2, 3.4);
          ctx.beginPath();
          ctx.moveTo(tmpPoint2.sx, tmpPoint2.sy);
          ctx.lineTo(tmpPoint.sx, tmpPoint.sy);
          ctx.stroke();
        }
        const size = clamp(20 * tmpPoint.s, 9, 26);
        ctx.globalAlpha = strength * 0.85;
        ctx.drawImage(packetGlow, tmpPoint.sx - size / 2, tmpPoint.sy - size / 2, size, size);
        ctx.globalAlpha = Math.min(1, strength * 1.15);
        ctx.fillStyle = '#f2fff8';
        ctx.beginPath();
        ctx.arc(tmpPoint.sx, tmpPoint.sy, clamp(w * 1.05, 1.2, 2.8), 0, TAU);
        ctx.fill();
        if (k === 0 && tmpPoint.s > 0.45 && (hot || links.length < 40)) {
          ctx.globalAlpha = strength * 0.5;
          ctx.fillStyle = '#b9ffe1';
          ctx.font = Math.max(7, 8 * tmpPoint.s).toFixed(1) + 'px ' + MONO_CANVAS;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(((hashId(link.source) + k) % 2) ? '0' : '1', tmpPoint.sx + 8, tmpPoint.sy - 9);
        }
      }
    }
    ctx.lineCap = 'butt';
    ctx.globalAlpha = 1;
  }

  function drawLinkPreview(t) {
    if (!linkSource) return;
    const point = sourceWorldPoint(linkSource);
    if (!point || !projectTo(point.x, point.y, point.z, tmpPoint)) return;
    const sx = tmpPoint.sx, sy = tmpPoint.sy;
    ctx.strokeStyle = '#b9ffe1';
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 8]);
    ctx.lineDashOffset = -t * 40;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(mouse.x, mouse.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    ctx.globalAlpha = 0.8;
    const size = 16;
    ctx.drawImage(glowSprite('#00ff9c'), mouse.x - size / 2, mouse.y - size / 2, size, size);
    ctx.globalAlpha = 1;
  }

  function sourceWorldPoint(node) {
    if (viewMode === 'sphere' && node._patch && node._patch.world) return node._patch.world;
    return { x: node.x, y: node.y, z: node.z };
  }

  function subText(node) {
    if (node.type === 'galaxy') return node.childrenCount + ' 颗星球';
    if (node.type === 'planet') return node.childrenCount + ' 个板块';
    if (node.type === 'sector') return node.childrenCount + ' 个国家';
    if (node.type === 'country') return node.childrenCount + ' 座城市';
    return '';
  }

  function fitLabel(text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let s = text;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
    return s + '…';
  }

  function drawLabel(node, t) {
    const alpha = node._alpha;
    if (alpha < 0.1 || node.s < 0.3) return;
    const hot = node === hoverNode || node === focusNode || multiSelection.has(node.id);
    const isGalaxy = node.type === 'galaxy';
    const fs = clamp((isGalaxy ? 13 : 12) * node.s, 9, 15.5);
    const text = fitLabel(node.name, 220);
    const sub = subText(node);
    const subFs = fs * 0.76;
    const ty = node.sy + node._r + fs * 1.2 + 9 * Math.min(1, node.s);
    const a = alpha * clamp(node.s, 0.45, 1) * (hot ? 1 : 0.84);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (hot) {
      ctx.font = '700 ' + fs.toFixed(2) + 'px ' + MONO_CANVAS;
      const nameW = ctx.measureText(text).width;
      let subW = 0;
      if (sub) {
        ctx.font = '500 ' + subFs.toFixed(2) + 'px ' + MONO_CANVAS;
        subW = ctx.measureText(sub).width;
      }
      const w = Math.max(nameW, subW) + 22;
      const h = fs + (sub ? subFs + 2 : 0) + 13;
      ctx.globalAlpha = a;
      roundRect(ctx, node.sx - w / 2, ty - h / 2, w, h, h / 2);
      ctx.fillStyle = 'rgba(1,12,7,0.86)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,255,150,0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.globalAlpha = a;
    ctx.fillStyle = hot ? '#ffffff' : 'rgba(200,255,225,0.94)';
    ctx.shadowColor = 'rgba(0,6,3,0.92)';
    ctx.shadowBlur = 5;
    ctx.font = (hot ? '700 ' : '600 ') + fs.toFixed(2) + 'px ' + MONO_CANVAS;
    ctx.fillText(text, node.sx, ty);
    if (sub) {
      ctx.globalAlpha = a * 0.75;
      ctx.fillStyle = hot ? 'rgba(185,255,225,0.9)' : 'rgba(140,210,175,0.78)';
      ctx.font = '500 ' + subFs.toFixed(2) + 'px ' + MONO_CANVAS;
      ctx.fillText(sub, node.sx, ty + fs * 0.9 + subFs * 0.55);
    }
    ctx.shadowBlur = 0;
  }

  function drawPlanetNode(node, t, hot, alpha, r, sx, sy) {
    if (glowEnabled) {
      const halo = Math.max(12, r * 5.4);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * (hot ? 0.68 : 0.4);
      ctx.drawImage(node._glow, sx - halo / 2, sy - halo / 2, halo, halo);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = alpha;
    if (node.degree >= 3 && r > 4) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * 0.46;
      ctx.strokeStyle = 'rgba(185,255,225,0.9)';
      ctx.lineWidth = Math.max(0.8, r * 0.05);
      ctx.setLineDash([5, 8]);
      ctx.lineDashOffset = -(t * 34 + node.name.length * 5);
      ctx.beginPath();
      ctx.ellipse(sx, sy, r * 1.8, r * 0.5, -0.42 + Math.sin(t * 0.4 + node.name.length) * 0.08, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = alpha;
    }
    const sphereSize = r * 2.1333;
    ctx.drawImage(node._sphere, sx - sphereSize / 2, sy - sphereSize / 2, sphereSize, sphereSize);
    if (hot) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * (node === focusNode ? 0.95 : 0.6);
      ctx.lineWidth = Math.max(1, r * 0.05);
      ctx.shadowColor = 'rgba(0,255,150,0.85)';
      ctx.shadowBlur = 10;
      const rot = t * 0.9;
      for (let i = 0; i < 2; i++) {
        ctx.strokeStyle = i === 0 ? '#b9ffe1' : '#00ff9c';
        ctx.beginPath();
        ctx.arc(sx, sy, r * 1.32, rot + i * Math.PI, rot + i * Math.PI + Math.PI * 0.6);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  function drawGalaxyNode(node, t, hot, alpha, r, sx, sy) {
    if (glowEnabled) {
      const halo = Math.max(70, r * 6.5);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * (hot ? 0.55 : 0.34);
      ctx.drawImage(node._glow, sx - halo / 2, sy - halo / 2, halo, halo);
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * 0.98;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(t * 0.11 + (hashId(node.id) % 360) * 0.01745);
    const size = r * 2.15;
    ctx.drawImage(node._galaxy, -size / 2, -size / 2, size, size);
    ctx.restore();
    const core = Math.max(10, r * 1.05);
    ctx.globalAlpha = alpha * 0.9;
    ctx.drawImage(node._glow, sx - core / 2, sy - core / 2, core, core);
    ctx.globalAlpha = alpha * 0.42;
    ctx.strokeStyle = 'rgba(185,255,225,0.85)';
    ctx.lineWidth = Math.max(0.8, r * 0.02);
    ctx.setLineDash([7, 10]);
    ctx.lineDashOffset = -(t * 26 + (hashId(node.id) % 60));
    ctx.beginPath();
    ctx.ellipse(sx, sy, r * 1.55, r * 0.55, -0.4 + Math.sin(t * 0.18 + node.name.length) * 0.12, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    if (hot) {
      ctx.globalAlpha = alpha * (node === focusNode ? 0.95 : 0.55);
      ctx.lineWidth = Math.max(1, r * 0.03);
      ctx.shadowColor = 'rgba(0,255,150,0.85)';
      ctx.shadowBlur = 12;
      const rot = t * 0.7;
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = i % 2 === 0 ? '#00ff9c' : '#eafff5';
        ctx.beginPath();
        ctx.arc(sx, sy, r * 1.28, rot + i * (TAU / 3), rot + i * (TAU / 3) + Math.PI * 0.36);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // Platonic solids (countries) and cubes (cities).
  const PHI = (1 + Math.sqrt(5)) / 2;
  const SOLIDS = {
    tetra: {
      v: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]],
      f: [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]]
    },
    octa: {
      v: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
      f: [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]]
    },
    icosa: {
      v: [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
          [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
          [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]],
      f: [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
          [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
          [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
          [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]]
    },
    cube: {
      v: [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
          [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
      f: [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
    }
  };

  const edgeCache = new Map();
  function solidEdges(kind) {
    if (edgeCache.has(kind)) return edgeCache.get(kind);
    const solid = SOLIDS[kind];
    const seen = new Set();
    const edges = [];
    for (const face of solid.f) {
      for (let i = 0; i < face.length; i++) {
        let a = face[i];
        let b = face[(i + 1) % face.length];
        if (a > b) { const tmp = a; a = b; b = tmp; }
        const key = a + '-' + b;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push([a, b]);
      }
    }
    edgeCache.set(kind, edges);
    return edges;
  }

  function drawSolidNode(node, t, hot, alpha, r, sx, sy) {
    if (glowEnabled) {
      const halo = Math.max(10, r * 4.2);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * (hot ? 0.55 : 0.3);
      ctx.drawImage(node._glow, sx - halo / 2, sy - halo / 2, halo, halo);
      ctx.globalCompositeOperation = 'source-over';
    }
    const kind = node.type === 'city'
      ? 'cube'
      : ['octa', 'icosa'][hashId(node.id) % 2];
    const solid = SOLIDS[kind];
    const phase = (hashId(node.id) % 360) * 0.01745;
    const rx = 0.62 + Math.sin(t * 0.42 + phase) * 0.16;
    const ry = 0.82 + Math.sin(t * 0.31 + phase * 1.7) * 0.2;
    const cosX = Math.cos(rx), sinX = Math.sin(rx);
    const cosY = Math.cos(ry), sinY = Math.sin(ry);
    const scale = r * (0.98 + (hot ? 0.06 : 0));
    const points = solid.v.map(v => {
      let x = v[0], y = v[1], z = v[2];
      const len = Math.hypot(x, y, z) || 1;
      x /= len; y /= len; z /= len;
      const y1 = y * cosX - z * sinX;
      const z1 = y * sinX + z * cosX;
      const x1 = x * cosY + z1 * sinY;
      const z2 = -x * sinY + z1 * cosY;
      return { x: sx + x1 * scale, y: sy - y1 * scale, z: z2 };
    });
    const faces = solid.f.map(face => {
      let z = 0;
      for (const index of face) z += points[index].z;
      return { face, z: z / face.length };
    }).sort((a, b) => a.z - b.z);
    ctx.globalAlpha = alpha;
    for (const item of faces) {
      const shade = 0.34 + clamp(item.z * 0.44, -0.2, 0.42);
      const fill = mixColor(node._rgb, item.z > 0 ? { r: 215, g: 255, b: 235 } : { r: 0, g: 24, b: 12 }, shade);
      ctx.fillStyle = rgbStr(fill, node.type === 'city' ? 0.6 : 0.74);
      ctx.strokeStyle = item.z > 0.15 ? 'rgba(225,255,242,0.78)' : 'rgba(0,255,150,0.34)';
      ctx.lineWidth = Math.max(0.9, r * 0.04);
      ctx.beginPath();
      item.face.forEach((index, i) => {
        const p = points[index];
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // Glassy wireframe: back edges remain faintly visible through the faces.
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = node.type === 'city' ? 'rgba(200,255,238,0.55)' : 'rgba(190,255,230,0.24)';
    ctx.lineWidth = node.type === 'city' ? 1.2 : 0.8;
    for (const [a, b] of solidEdges(kind)) {
      ctx.beginPath();
      ctx.moveTo(points[a].x, points[a].y);
      ctx.lineTo(points[b].x, points[b].y);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = alpha;
    if (hot) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * (node === focusNode ? 0.9 : 0.5);
      ctx.strokeStyle = '#b9ffe1';
      ctx.lineWidth = Math.max(1, r * 0.04);
      ctx.shadowColor = 'rgba(0,255,150,0.8)';
      ctx.shadowBlur = 10;
      const rot = t * 0.8;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(sx, sy, r * 1.3, rot + i * (TAU / 3), rot + i * (TAU / 3) + Math.PI * 0.32);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  function drawMultiBadge(x, y, index, scale) {
    if (!index) return;
    const r = 9 * (scale || 1);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = 'rgba(2, 20, 13, 0.95)';
    ctx.fill();
    ctx.strokeStyle = '#8dffdf';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = '#eafff5';
    ctx.font = '700 ' + (10 * (scale || 1)).toFixed(1) + 'px ' + MONO_CANVAS;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(index), x, y + 0.5);
  }

  function drawMultiRing(node, t) {
    const index = selectionBadgeIndex(node);
    if (!index) return;
    const r = Math.max(node._r + 7, 13);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(150,255,228,0.9)';
    ctx.lineWidth = 1.35;
    ctx.setLineDash([4, 6]);
    ctx.lineDashOffset = -(t * 26 + index * 7);
    ctx.beginPath();
    ctx.arc(node.sx, node.sy, r, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    ctx.globalCompositeOperation = 'source-over';
    drawMultiBadge(node.sx + r * 0.72, node.sy - r * 0.72, index, 1);
  }

  function drawNodes(t) {
    const sorted = nodes.slice().sort((a, b) => b.zc - a.zc);
    for (const node of sorted) {
      if (!node._visible) continue;
      const alpha = node._alpha;
      if (alpha <= 0.015) continue;
      const r = node._r;
      if (r <= 0.25) continue;
      const selected = multiSelection.has(node.id);
      const hot = node === hoverNode || node === focusNode || selected;
      if (node.type === 'galaxy') drawGalaxyNode(node, t, hot, alpha, r, node.sx, node.sy);
      else if (node.type === 'planet') drawPlanetNode(node, t, hot, alpha, r, node.sx, node.sy);
      else drawSolidNode(node, t, hot, alpha, r, node.sx, node.sy);
      if (selected) drawMultiRing(node, t);
      drawLabel(node, t);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ============================================================
  // Sector sphere rendering
  // ============================================================
  function drawSphereGrid() {
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(0,255,150,0.09)';
    ctx.lineWidth = 1;
    const lines = 8;
    for (let i = 0; i < lines; i++) {
      const u = i / lines;
      let started = false;
      ctx.beginPath();
      for (let s = 0; s <= 32; s++) {
        const point = sectorPoint(u, s / 32);
        if (!isFrontFacing(point)) { started = false; continue; }
        if (!projectTo(point.x, point.y, point.z, tmpPoint)) { started = false; continue; }
        if (!started) { ctx.moveTo(tmpPoint.sx, tmpPoint.sy); started = true; }
        else ctx.lineTo(tmpPoint.sx, tmpPoint.sy);
      }
      ctx.stroke();
    }
    for (let i = 1; i < 7; i++) {
      const v = i / 7;
      let started = false;
      ctx.beginPath();
      for (let s = 0; s <= 64; s++) {
        const point = sectorPoint(s / 64, v);
        if (!isFrontFacing(point)) { started = false; continue; }
        if (!projectTo(point.x, point.y, point.z, tmpPoint)) { started = false; continue; }
        if (!started) { ctx.moveTo(tmpPoint.sx, tmpPoint.sy); started = true; }
        else ctx.lineTo(tmpPoint.sx, tmpPoint.sy);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawSphereSplats(t) {
    ctx.globalCompositeOperation = 'lighter';
    for (const splat of sphereSplats) {
      const p = quatRotate(globe.q, { x: splat.x, y: splat.y, z: splat.z });
      const radius = SPLAT_RADIUS * splat.lift;
      const world = { x: p.x * radius, y: p.y * radius, z: p.z * radius };
      if (!isFrontFacing(world)) continue;
      if (!projectTo(world.x, world.y, world.z, tmpPoint)) continue;
      const size = clamp((4 + splat.size * 9) * tmpPoint.s, 1.6, 28);
      ctx.globalAlpha = splat.alpha * (0.62 + 0.38 * Math.sin(t * splat.speed + splat.phase));
      ctx.drawImage(glowSprite(splat.color), tmpPoint.sx - size / 2, tmpPoint.sy - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawSectorLinks(t) {
    if (!links.length) return;
    ctx.globalCompositeOperation = 'lighter';
    for (const link of links) {
      const a = nodeMap.get(link.source), b = nodeMap.get(link.target);
      if (!a || !b || !a._patch || !b._patch) continue;
      const pa = a._patch.world, pb = b._patch.world;
      if (!pa || !pb) continue;
      const mid = {
        x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2, z: (pa.z + pb.z) / 2
      };
      const len = Math.hypot(mid.x, mid.y, mid.z) || 1;
      const lift = SPLAT_RADIUS * 1.5;
      const ctrl = { x: mid.x / len * lift, y: mid.y / len * lift, z: mid.z / len * lift };
      ctx.beginPath();
      let started = false;
      for (let i = 0; i <= 24; i++) {
        const s = i / 24;
        const x = (1 - s) * (1 - s) * pa.x + 2 * (1 - s) * s * ctrl.x + s * s * pb.x;
        const y = (1 - s) * (1 - s) * pa.y + 2 * (1 - s) * s * ctrl.y + s * s * pb.y;
        const z = (1 - s) * (1 - s) * pa.z + 2 * (1 - s) * s * ctrl.z + s * s * pb.z;
        if (!projectTo(x, y, z, tmpPoint)) { started = false; continue; }
        if (!started) { ctx.moveTo(tmpPoint.sx, tmpPoint.sy); started = true; }
        else ctx.lineTo(tmpPoint.sx, tmpPoint.sy);
      }
      ctx.strokeStyle = 'rgba(185,255,225,0.55)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([5, 9]);
      ctx.lineDashOffset = -(t * 50 + (link.seed || 0) * 40);
      const bothSelected = multiSelection.has(link.source) && multiSelection.has(link.target);
      if (bothSelected) {
        ctx.strokeStyle = 'rgba(215,255,240,0.9)';
        ctx.lineWidth = 2;
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      ctx.strokeStyle = bothSelected ? 'rgba(0,255,150,0.5)' : 'rgba(0,255,150,0.24)';
      ctx.lineWidth = bothSelected ? 6 : 4;
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawPatchCells(node, t, hot) {
    const patch = node._patch;
    if (!patch) return;
    node._hitCells = [];
    node._labelVisible = false;
    const nu = clamp(Math.ceil(patch.w * 20), 3, 12);
    const nv = clamp(Math.ceil(patch.h * 20), 3, 12);
    const alpha = node.appear;
    if (alpha <= 0.02) return;
    const baseAlpha = (hot ? 0.66 : 0.48) * alpha;
    const cellPts = [];
    let bestLabelArea = 0;
    for (let i = 0; i < nu; i++) {
      cellPts[i] = [];
      for (let j = 0; j < nv; j++) {
        const u0 = lerp(patch.u0, patch.u1, i / nu);
        const u1 = lerp(patch.u0, patch.u1, (i + 1) / nu);
        const v0 = lerp(patch.v0, patch.v1, j / nv);
        const v1 = lerp(patch.v0, patch.v1, (j + 1) / nv);
        const corners = [
          sectorPoint(u0, v0), sectorPoint(u1, v0),
          sectorPoint(u1, v1), sectorPoint(u0, v1)
        ];
        const center = sectorPoint((u0 + u1) / 2, (v0 + v1) / 2);
        if (!isFrontFacing(center)) continue;
        const projected = [];
        let visible = true;
        for (const corner of corners) {
          const out = {};
          if (!projectTo(corner.x, corner.y, corner.z, out)) { visible = false; break; }
          projected.push(out);
        }
        if (!visible) continue;
        cellPts[i][j] = { pts: projected, center };
        const zc = (projected[0].zc + projected[1].zc + projected[2].zc + projected[3].zc) / 4;
        node._hitCells.push({
          poly: projected.map(p => ({ x: p.sx, y: p.sy })),
          zc
        });
        let area = 0;
        for (let k = 0; k < 4; k++) {
          const p = projected[k];
          const q = projected[(k + 1) % 4];
          area += p.sx * q.sy - q.sx * p.sy;
        }
        area = Math.abs(area) / 2;
        if (area > bestLabelArea) {
          bestLabelArea = area;
          node._labelVisible = true;
          node._labelX = (projected[0].sx + projected[1].sx + projected[2].sx + projected[3].sx) / 4;
          node._labelY = (projected[0].sy + projected[1].sy + projected[2].sy + projected[3].sy) / 4;
        }
      }
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const cell = cellPts[i] && cellPts[i][j];
        if (!cell) continue;
        const nx = cell.center.x / SPLAT_RADIUS;
        const ny = cell.center.y / SPLAT_RADIUS;
        const nz = cell.center.z / SPLAT_RADIUS;
        const ndl = Math.max(0, nx * -0.38 + ny * 0.62 + nz * 0.68);
        const shade = 0.58 + 0.42 * Math.pow(ndl, 0.75);
        ctx.fillStyle = rgbStr({
          r: Math.round(node._rgb.r * shade),
          g: Math.round(node._rgb.g * shade),
          b: Math.round(node._rgb.b * shade)
        }, baseAlpha);
        ctx.beginPath();
        ctx.moveTo(cell.pts[0].sx, cell.pts[0].sy);
        for (let k = 1; k < 4; k++) ctx.lineTo(cell.pts[k].sx, cell.pts[k].sy);
        ctx.closePath();
        ctx.fill();
      }
    }
    if (patch.poly && patch.poly.length > 2) {
      const drawFrontBoundary = () => {
        ctx.beginPath();
        for (let i = 0; i < patch.poly.length; i++) {
          const p = patch.poly[i];
          const q = patch.poly[(i + 1) % patch.poly.length];
          if (!p.front || !q.front) continue;
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
        }
        ctx.stroke();
      };
      ctx.strokeStyle = hot ? '#ffffff' : rgbStr(node._light, 0.82);
      ctx.lineWidth = hot ? 2.2 : 1.15;
      ctx.shadowColor = hot ? 'rgba(0,255,150,0.95)' : rgbStr(node._rgb, 0.55);
      ctx.shadowBlur = hot ? 16 : 4;
      drawFrontBoundary();
      ctx.shadowBlur = 0;
    }
  }

  function drawPatchLabel(node, t, hot) {
    if (!node._patch || !node._labelVisible || node._visible === false) return;
    if (node._r < 16 || node.appear < 0.4) return;
    const fs = clamp(node._r * 0.17, 10, 14);
    const text = fitLabel(node.name, Math.max(70, node._r * 1.35));
    const sub = node.childrenCount + ' 国';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const dir = node._labelY > H * 0.62 ? -1 : 1;
    const ty = node._labelY + dir * Math.min(node._r * 0.3, 26);
    ctx.globalAlpha = node._alpha * (hot ? 1 : 0.92);
    ctx.font = '700 ' + fs.toFixed(1) + 'px ' + MONO_CANVAS;
    const nameW = ctx.measureText(text).width;
    ctx.font = '500 ' + (fs * 0.8).toFixed(1) + 'px ' + MONO_CANVAS;
    const subW = ctx.measureText(sub).width;
    const w = Math.max(nameW, subW) + 22;
    const h = fs + fs * 0.8 + 14;
    roundRect(ctx, node._labelX - w / 2, ty - h / 2, w, h, h / 2);
    ctx.fillStyle = hot ? 'rgba(1,12,7,0.94)' : 'rgba(1,10,6,0.7)';
    ctx.fill();
    ctx.strokeStyle = hot ? 'rgba(0,255,150,0.75)' : 'rgba(0,255,150,0.3)';
    ctx.lineWidth = hot ? 1.3 : 1;
    ctx.stroke();
    ctx.font = '700 ' + fs.toFixed(1) + 'px ' + MONO_CANVAS;
    ctx.fillStyle = hot ? '#ffffff' : 'rgba(225,255,238,0.96)';
    ctx.fillText(text, node._labelX, ty - fs * 0.22);
    ctx.font = '500 ' + (fs * 0.8).toFixed(1) + 'px ' + MONO_CANVAS;
    ctx.fillStyle = hot ? 'rgba(185,255,225,0.95)' : 'rgba(140,220,180,0.86)';
    ctx.fillText(sub, node._labelX, ty + fs * 0.62);
  }

  function drawSphereShading(cx, cy, screenR) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, screenR, 0, TAU);
    ctx.clip();

    const limb = ctx.createRadialGradient(cx, cy, screenR * 0.42, cx, cy, screenR);
    limb.addColorStop(0, 'rgba(0,0,0,0)');
    limb.addColorStop(0.7, 'rgba(0,0,0,0.03)');
    limb.addColorStop(0.9, 'rgba(0,4,2,0.16)');
    limb.addColorStop(1, 'rgba(0,3,2,0.44)');
    ctx.fillStyle = limb;
    ctx.fillRect(cx - screenR, cy - screenR, screenR * 2, screenR * 2);

    ctx.globalCompositeOperation = 'lighter';
    const sx = cx - screenR * 0.32;
    const sy = cy - screenR * 0.38;
    const spec = ctx.createRadialGradient(sx, sy, 0, sx, sy, screenR * 0.62);
    spec.addColorStop(0, 'rgba(235,255,248,0.13)');
    spec.addColorStop(0.45, 'rgba(175,255,225,0.035)');
    spec.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = spec;
    ctx.fillRect(cx - screenR, cy - screenR, screenR * 2, screenR * 2);
    ctx.restore();

    ctx.globalCompositeOperation = 'lighter';
    const rim = ctx.createRadialGradient(cx, cy, screenR * 0.8, cx, cy, screenR);
    rim.addColorStop(0, 'rgba(0,255,150,0)');
    rim.addColorStop(0.86, 'rgba(140,255,205,0.04)');
    rim.addColorStop(0.97, 'rgba(220,255,240,0.2)');
    rim.addColorStop(1, 'rgba(0,255,150,0)');
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(cx, cy, screenR, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(160,255,215,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, screenR - 0.7, 0, TAU);
    ctx.stroke();
  }

  function drawSphereView(t, dt) {
    ctx.globalCompositeOperation = 'lighter';
    drawMatrixRain(dt, t);
    drawStars(t);
    ctx.globalCompositeOperation = 'source-over';
    const center = projectTo(0, 0, 0, tmpPoint);
    if (!center) return;
    const scale = tmpPoint.s;
    const screenR = SPLAT_RADIUS * scale;
    const cx = tmpPoint.sx, cy = tmpPoint.sy;

    // Soft outer glow
    const halo = screenR * 2.7;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.45;
    ctx.drawImage(glowSprite('#00ff9c'), cx - halo / 2, cy - halo / 2, halo, halo);
    ctx.globalCompositeOperation = 'source-over';

    updateSphereGeometry();
    const tex = getSplatSphere();
    const texSize = screenR * 2 * (256 / 236);
    ctx.globalAlpha = 1;
    ctx.drawImage(tex, cx - texSize / 2, cy - texSize / 2, texSize, texSize);
    drawSphereGrid();

    const sorted = nodes.slice().sort((a, b) => (b.zc || 0) - (a.zc || 0));
    for (const node of sorted) {
      if (!node._visible || !node._patch) continue;
      drawPatchCells(node, t, node === hoverNode || node === focusNode || multiSelection.has(node.id));
    }
    // Re-add the Gaussian splat sheen over the sector fills so the sphere keeps
    // its soft volumetric texture instead of looking like a flat segmented ball.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.34;
    ctx.drawImage(tex, cx - texSize / 2, cy - texSize / 2, texSize, texSize);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    drawSphereSplats(t);
    drawSphereShading(cx, cy, screenR);
    drawSectorLinks(t);
    for (const node of sorted) {
      drawPatchLabel(node, t, node === hoverNode || node === focusNode || multiSelection.has(node.id));
    }
    for (const node of sorted) {
      if (!multiSelection.has(node.id) || !node._labelVisible) continue;
      drawMultiBadge(node._labelX + 20, node._labelY - 25, selectionBadgeIndex(node), 0.9);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ============================================================
  // Scene / hover
  // ============================================================
  function render(now, dt) {
    const t = now * 0.001;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    if (viewMode === 'sphere') {
      drawSphereView(t, dt);
    } else {
      for (const node of nodes) {
        if (!projectTo(node.x, node.y, node.z, node)) {
          node._visible = false;
          continue;
        }
        node._visible = true;
        node._alpha = depthAlpha(node.zc) * node.appear;
        node._r = node.radius * node.s * (0.25 + 0.75 * easeOut(node.appear));
      }
      ctx.globalCompositeOperation = 'lighter';
      drawMatrixRain(dt, t);
      drawStars(t);
      if (viewMode === 'graph') {
        drawCore(t);
        drawRings(t);
        drawDust(t);
      }
      drawLinks(t);
      drawLinkPreview(t);
      ctx.globalCompositeOperation = 'source-over';
      drawNodes(t);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    if (!transition && mouse.inside && mode === 'idle') {
      const hit = viewMode === 'sphere' ? pickSector(mouse.x, mouse.y) : pickNode(mouse.x, mouse.y);
      if (hit !== hoverNode) {
        hoverNode = hit;
        updateCursor();
        updateNodeInfo();
      }
    }
  }

  function pickNode(sx, sy) {
    let best = null;
    let bestZ = Infinity;
    for (const node of nodes) {
      if (!node._visible || node.appear < 0.15) continue;
      const dx = sx - node.sx, dy = sy - node.sy;
      const rr = Math.max(node._r + 5, 11);
      if (dx * dx + dy * dy <= rr * rr && node.zc < bestZ) {
        best = node;
        bestZ = node.zc;
      }
    }
    return best;
  }

  // ============================================================
  // API / server
  // ============================================================
  async function apiFetch(url, options) {
    const response = await fetch(url, options);
    let body = null;
    try {
      const text = await response.text();
      if (text) body = JSON.parse(text);
    } catch (_) { /* ignore */ }
    if (!response.ok) {
      const error = new Error((body && body.error) || ('HTTP ' + response.status));
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  }
  const loadFiles = () => apiFetch('/api/files');
  const loadContent = path => apiFetch('/api/content?path=' + encodeURIComponent(path));
  const saveContent = (path, content) => apiFetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content })
  });
  const createContent = (path, content) => apiFetch('/api/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content })
  });
  const deleteContent = path => apiFetch('/api/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  });

  function updateCursor() {
    canvas.classList.toggle('hovering', !!hoverNode && !linkSource);
    canvas.classList.toggle('linking', !!linkSource);
    canvas.classList.toggle('grabbing', mode === 'orbit' || mode === 'pan' || mode === 'dragNode' || mode === 'globe');
  }

  // ============================================================
  // Ctrl multi-selection
  // ============================================================
  function multiIdsSorted() {
    return Array.from(multiSelection).sort();
  }

  function multiNodesInOrder() {
    const ordered = selectionOrder.filter(id => multiSelection.has(id));
    for (const id of multiSelection) if (!ordered.includes(id)) ordered.push(id);
    return ordered.map(id => nodeMap.get(id)).filter(Boolean);
  }

  function linksAmongIds(ids) {
    const set = new Set(ids);
    return links.filter(link => set.has(link.source) && set.has(link.target));
  }

  function isSelectionConnected(ids) {
    if (ids.length <= 1) return true;
    const set = new Set(ids);
    const adjacency = new Map(ids.map(id => [id, []]));
    for (const link of links) {
      if (!set.has(link.source) || !set.has(link.target)) continue;
      adjacency.get(link.source).push(link.target);
      adjacency.get(link.target).push(link.source);
    }
    const seen = new Set([ids[0]]);
    const queue = [ids[0]];
    while (queue.length) {
      const current = queue.shift();
      for (const next of adjacency.get(current) || []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    return seen.size === ids.length;
  }

  function nodeLinkedToSelection(node) {
    return links.some(link =>
      (link.source === node.id && multiSelection.has(link.target)) ||
      (link.target === node.id && multiSelection.has(link.source))
    );
  }

  function nodeHasAnyLink(node) {
    return links.some(link => link.source === node.id || link.target === node.id);
  }

  function selectionBadgeIndex(node) {
    const index = selectionOrder.indexOf(node.id);
    return index >= 0 ? index + 1 : 0;
  }

  function focusSelectionGroup() {
    const selected = multiNodesInOrder();
    if (!selected.length) {
      groupTarget = null;
      focusNode = null;
      cam.goalTarget.x = 0; cam.goalTarget.y = 0; cam.goalTarget.z = 0;
      cam.goalZoom = 1;
      updateNodeInfo();
      updateStatus();
      updateCursor();
      return;
    }
    if (selected.length === 1) {
      const node = selected[0];
      groupTarget = null;
      focusNode = node;
      if (viewMode === 'sphere') {
        globe.auto = false;
        $('autoBtn').classList.toggle('active', false);
        cam.goalTarget.x = 0; cam.goalTarget.y = 0; cam.goalTarget.z = 0;
        cam.goalZoom = Math.min(cam.zoom, 1.04);
      } else {
        cam.goalTarget.x = node.x; cam.goalTarget.y = node.y; cam.goalTarget.z = node.z;
        cam.goalZoom = Math.min(cam.zoom, viewMode === 'flat' ? 1.15 : 1.18);
      }
      updateNodeInfo();
      updateStatus();
      updateCursor();
      return;
    }

    focusNode = null;
    if (viewMode === 'sphere') {
      groupTarget = { x: 0, y: 0, z: 0 };
      cam.goalTarget.x = 0; cam.goalTarget.y = 0; cam.goalTarget.z = 0;
      cam.goalZoom = Math.max(cam.zoom, 1.08);
      globe.auto = false;
      $('autoBtn').classList.toggle('active', false);
    } else {
      let cx = 0, cy = 0, cz = 0;
      for (const node of selected) { cx += node.x; cy += node.y; cz += node.z; }
      cx /= selected.length; cy /= selected.length; cz /= selected.length;
      let maxDistance = 80;
      for (const node of selected) {
        maxDistance = Math.max(maxDistance, Math.hypot(node.x - cx, node.y - cy, node.z - cz) + node.radius);
      }
      groupTarget = { x: cx, y: cy, z: cz };
      cam.goalTarget.x = cx; cam.goalTarget.y = cy; cam.goalTarget.z = cz;
      const fit = Math.min(W, H) * 0.32;
      cam.goalZoom = clamp(fit / Math.max(90, maxDistance), 0.92, 1.75);
    }
    updateNodeInfo();
    updateStatus();
    updateCursor();
  }

  function clearMultiSelection(forceClose) {
    if (sideOpen && sideKind === 'relation') {
      if (!closeSideDoc(!!forceClose)) return false;
    }
    multiSelection.clear();
    selectionOrder = [];
    groupTarget = null;
    focusNode = null;
    cam.goalTarget.x = 0; cam.goalTarget.y = 0; cam.goalTarget.z = 0;
    cam.goalZoom = 1;
    if (viewMode === 'sphere') {
      globe.auto = true;
      $('autoBtn').classList.toggle('active', true);
    }
    updateNodeInfo();
    updateStatus();
    updateCursor();
    return true;
  }

  function handleCtrlSelect(node) {
    if (!node || !nodeMap.has(node.id) || transition) return;
    const already = multiSelection.has(node.id);

    // Validate before touching any open editor, so a blocked Ctrl-click never
    // closes a dirty relation or node note.
    if (already) {
      const next = Array.from(multiSelection).filter(id => id !== node.id);
      if (next.length >= 2 && !isSelectionConnected(next)) {
        showHint('取消该节点会让关系断开，请先取消其他节点');
        return;
      }
    } else if (!multiSelection.size) {
      if (!nodeHasAnyLink(node)) {
        showHint('该节点没有星链，无法加入关系选择');
        return;
      }
    } else if (!nodeLinkedToSelection(node)) {
      showHint('只能多选与已选节点存在星链连接的节点');
      return;
    }

    if (sideOpen) {
      if (sideDirty() && !confirm('当前内容有未保存的修改，切换关系选择将丢失，继续吗？')) return;
      if (!closeSideDoc(true)) return;
    }

    if (already) {
      multiSelection.delete(node.id);
      selectionOrder = selectionOrder.filter(id => id !== node.id);
    } else {
      multiSelection.add(node.id);
      if (!selectionOrder.includes(node.id)) selectionOrder.push(node.id);
    }

    if (multiSelection.size >= 2) {
      openRelationPanel();
      focusSelectionGroup();
      showHint('已选择 ' + multiSelection.size + ' 个节点 · 关系页面已更新');
    } else if (multiSelection.size === 1) {
      focusSelectionGroup();
      showHint('已选择 1 个节点，继续 Ctrl 单击有星链的节点');
    } else {
      clearMultiSelection(true);
      showHint('已取消关系选择');
    }
  }

  // ============================================================
  // Focus
  // ============================================================
  function focusOnNode(node, fromHash) {
    if (!node) return;
    if (multiSelection.size) {
      if (!clearMultiSelection(false)) return;
    }
    if (sideOpen && sideNodeId !== node.id) {
      if (!closeSideDoc(false)) return;
    }
    focusNode = node;
    if (viewMode === 'sphere') {
      globe.auto = false;
      $('autoBtn').classList.toggle('active', false);
      cam.goalTarget.x = 0; cam.goalTarget.y = 0; cam.goalTarget.z = 0;
      cam.goalZoom = Math.max(cam.zoom, 1.06);
    } else {
      cam.goalTarget.x = node.x;
      cam.goalTarget.y = node.y;
      cam.goalTarget.z = node.z;
      cam.goalZoom = Math.max(cam.zoom, viewMode === 'flat' ? 1.35 : 1.6);
    }
    updateNodeInfo();
    if (!fromHash) {
      if (nodeHasMd(node)) openSideDoc(node, false);
      else closeSideDoc(true);
    }
  }

  function unfocusNode(forceClose) {
    focusNode = null;
    multiSelection.clear();
    selectionOrder = [];
    groupTarget = null;
    globe.auto = true;
    if (viewMode === 'sphere') $('autoBtn').classList.toggle('active', true);
    cam.goalTarget.x = 0; cam.goalTarget.y = 0; cam.goalTarget.z = 0;
    cam.goalZoom = 1;
    updateNodeInfo();
    updateStatus();
    if (forceClose !== false) closeSideDoc(true);
  }

  function clearGraphFocus() {
    focusNode = null;
    hoverNode = null;
    multiSelection.clear();
    selectionOrder = [];
    groupTarget = null;
    globe.auto = true;
    cam.goalTarget.x = 0; cam.goalTarget.y = 0; cam.goalTarget.z = 0;
    cam.goalZoom = 1;
    updateNodeInfo();
    updateStatus();
    updateCursor();
  }

  // ============================================================
  // Level transitions
  // ============================================================
  function setFlashColor(color) {
    const rgb = mixColor(hexToRgb(color), { r: 0, g: 255, b: 150 }, 0.62);
    flashEl.style.background = 'radial-gradient(circle at 50% 50%, #ffffff, ' +
      rgbStr(rgb, 0.9) + ' 30%, rgba(0,0,0,0) 70%)';
  }
  function setFlash(alpha) {
    flashEl.style.opacity = String(clamp(alpha, 0, 1));
  }

  function enterNode(node) {
    if (!node || transition) return;
    cancelPendingClick();
    if (multiSelection.size && !clearMultiSelection(false)) return;
    const info = TYPE_INFO[node.type];
    if (!info.child) {
      if (nodeHasMd(node)) {
        focusOnNode(node);
        openSideDoc(node, false);
      } else {
        focusOnNode(node);
        showHint('「' + node.name + '」还没有内容，右键「编辑内容」创建');
      }
      return;
    }
    if (sideOpen && !closeSideDoc(false)) return;
    hideMenus();
    hideHint();
    clearGraphFocus();
    let target;
    if (viewMode === 'sphere' && node._patch && node._patch.world) {
      target = node._patch.world;
    } else {
      target = { x: node.x, y: node.y, z: node.z };
    }
    setFlashColor(node.displayColor || '#00ff9c');
    transition = {
      phase: 'in',
      start: performance.now(),
      inDur: reduceMotion ? 1 : 700,
      outDur: reduceMotion ? 1 : 620,
      fromTarget: { x: cam.target.x, y: cam.target.y, z: cam.target.z },
      fromZoom: cam.zoom,
      toTarget: target,
      toZoom: 7.5,
      midZoom: 2.2,
      color: node.displayColor || '#00ff9c',
      mid: () => {
        currentParentId = node.id;
        buildView(true, true);
      }
    };
  }

  function goUp() {
    if (!currentParentId || transition) return;
    cancelPendingClick();
    if (multiSelection.size && !clearMultiSelection(false)) return;
    if (sideOpen && !closeSideDoc(false)) return;
    const parent = viewParent();
    if (!parent) return;
    hideMenus();
    hideHint();
    clearGraphFocus();
    setFlashColor('#00ff9c');
    setFlash(0.65);
    currentParentId = parent.parent || null;
    buildView(true, true);
    setTimeout(() => setFlash(0), reduceMotion ? 1 : 350);
  }

  function updateTransition(now) {
    const T = transition;
    if (!T) return;
    const p = clamp((now - T.start) / (T.phase === 'in' ? T.inDur : T.outDur), 0, 1);
    if (T.phase === 'in') {
      const e = easeInOut(p);
      cam.target.x = lerp(T.fromTarget.x, T.toTarget.x, e);
      cam.target.y = lerp(T.fromTarget.y, T.toTarget.y, e);
      cam.target.z = lerp(T.fromTarget.z, T.toTarget.z, e);
      cam.zoom = lerp(T.fromZoom, T.toZoom, e * e);
      setFlash(Math.pow(e, 1.6) * 0.92);
      if (p >= 1) {
        T.mid();
        T.phase = 'out';
        T.start = now;
        T.outStartZoom = T.midZoom;
        cam.target.x = 0; cam.target.y = 0; cam.target.z = 0;
        cam.goalTarget.x = 0; cam.goalTarget.y = 0; cam.goalTarget.z = 0;
        cam.goalZoom = 1;
        cam.zoom = T.midZoom;
        setFlash(0.92);
      }
    } else {
      const e = easeOut(p);
      cam.zoom = lerp(T.outStartZoom, 1, e);
      cam.target.x = 0; cam.target.y = 0; cam.target.z = 0;
      setFlash(0.92 * (1 - e));
      if (p >= 1) {
        setFlash(0);
        cam.zoom = 1;
        cam.goalZoom = 1;
        transition = null;
      }
    }
    computeCameraFrame();
  }

  // ============================================================
  // Camera
  // ============================================================
  function updateCamera(dt, now) {
    if (transition) {
      updateTransition(now);
      return;
    }
    if (viewMode === 'graph' && autoPreference && mode === 'idle' && !linkSource) {
      cam.theta += 0.1 * dt;
    }
    if (viewMode === 'flat') {
      cam.theta = 0;
      cam.phi = 0.001;
    } else if (viewMode === 'sphere') {
      cam.theta = 0.55;
      cam.phi = 0.18;
    } else {
      cam.phi = clamp(cam.phi, -1.15, 1.15);
    }
    if (focusNode && viewMode !== 'sphere') {
      if (!nodeMap.has(focusNode.id)) {
        focusNode = null;
        updateNodeInfo();
      } else {
        cam.goalTarget.x = focusNode.x;
        cam.goalTarget.y = focusNode.y;
        cam.goalTarget.z = focusNode.z;
      }
    } else if (viewMode === 'sphere') {
      cam.goalTarget.x = 0; cam.goalTarget.y = 0; cam.goalTarget.z = 0;
    }
    const k = 1 - Math.exp(-6.5 * dt);
    cam.target.x = lerp(cam.target.x, cam.goalTarget.x, k);
    cam.target.y = lerp(cam.target.y, cam.goalTarget.y, k);
    cam.target.z = lerp(cam.target.z, cam.goalTarget.z, k);
    cam.zoom = lerp(cam.zoom, cam.goalZoom, 1 - Math.exp(-7 * dt));
    computeCameraFrame();
  }

  function zoomBy(factor) {
    cam.zoom = clamp(cam.zoom * factor, 0.35, 3.2);
    cam.goalZoom = cam.zoom;
  }

  function resetView() {
    if (multiSelection.size && !clearMultiSelection(false)) return;
    if (sideOpen && !closeSideDoc(false)) return;
    focusNode = null;
    hoverNode = null;
    globe.auto = true;
    cam.zoom = 1;
    cam.goalZoom = 1;
    cam.target.x = 0; cam.target.y = 0; cam.target.z = 0;
    cam.goalTarget.x = 0; cam.goalTarget.y = 0; cam.goalTarget.z = 0;
    if (viewMode === 'graph') {
      cam.theta = 0.62; cam.phi = 0.26;
      cam.autoRotate = autoPreference;
    } else if (viewMode === 'flat') {
      cam.theta = 0; cam.phi = 0.001;
      cam.autoRotate = false;
    } else {
      cam.theta = 0.55; cam.phi = 0.18;
      cam.autoRotate = false;
      globe.q = initialGlobeQuat();
      $('autoBtn').classList.toggle('active', true);
    }
    updateNodeInfo();
    showHint('视角已重置');
  }

  function resetLayout() {
    if (viewMode === 'sphere') {
      showHint('板块球体布局由国家数量决定，无需重排');
      return;
    }
    nodes.forEach((node, index) => {
      const pos = viewMode === 'flat' ? randomFlatPos(70, 260) : randomPos(80, 280, 0.6);
      node.x = pos.x; node.y = pos.y; node.z = pos.z;
      node.vx = node.vy = node.vz = 0;
    });
    focusNode = null;
    cam.goalTarget.x = 0; cam.goalTarget.y = 0; cam.goalTarget.z = 0;
    cam.goalZoom = 1;
    updateNodeInfo();
    scheduleMetaSave(1200);
    showHint('节点已重新排布');
  }

  function toggleAuto() {
    if (viewMode === 'sphere') {
      globe.auto = !globe.auto;
      $('autoBtn').classList.toggle('active', globe.auto);
      showHint(globe.auto ? '板块球体自动旋转' : '板块球体旋转暂停');
      return;
    }
    if (viewMode === 'flat') {
      showHint('平面视图不支持自动环绕');
      return;
    }
    autoPreference = !autoPreference;
    cam.autoRotate = autoPreference;
    $('autoBtn').classList.toggle('active', autoPreference);
    showHint(autoPreference ? '自动环绕已开启' : '自动环绕已暂停');
  }

  function toggleGlow() {
    glowEnabled = !glowEnabled;
    $('glowBtn').classList.toggle('active', glowEnabled);
    showHint(glowEnabled ? '光晕已开启' : '光晕已关闭');
  }

  // ============================================================
  // Pointer interaction
  // ============================================================
  let downNode = null;
  let globeLast = null;
  let pendingClickTimer = null;
  let pendingClickNode = null;
  let lastPointerNode = null;
  let lastPointerAt = 0;

  function cancelPendingClick() {
    if (pendingClickTimer) clearTimeout(pendingClickTimer);
    pendingClickTimer = null;
    pendingClickNode = null;
  }

  function queueNodeClick(node, ctrlKey) {
    lastPointerNode = node;
    lastPointerAt = performance.now();
    cancelPendingClick();
    if (ctrlKey) {
      handleCtrlSelect(node);
      return;
    }
    if (multiSelection.size && !clearMultiSelection(false)) return;
    pendingClickNode = node;
    pendingClickTimer = setTimeout(() => {
      pendingClickTimer = null;
      const target = pendingClickNode;
      pendingClickNode = null;
      if (target && !transition) focusOnNode(target);
    }, 240);
  }

  function nodeAt(sx, sy) {
    return viewMode === 'sphere' ? pickSector(sx, sy) : pickNode(sx, sy);
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (transition || e.button === 2) return;
    cancelPendingClick();
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.inside = true;
    hideMenus();
    const node = nodeAt(mouse.x, mouse.y);
    downNode = node;
    downPos = { x: e.clientX, y: e.clientY };
    movedSinceDown = false;

    if (linkSource) {
      if (node && node !== linkSource) addLink(linkSource, node);
      cancelLinking();
      return;
    }

    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }

    if (e.button === 1 || e.shiftKey) {
      mode = 'pan';
      panStart = { x: e.clientX, y: e.clientY };
      focusNode = null;
      updateNodeInfo();
    } else if (viewMode === 'sphere') {
      mode = 'globe';
      globeLast = { x: e.clientX, y: e.clientY };
      globe.dragging = true;
    } else if (node) {
      mode = 'dragNode';
      dragNode = node;
      dragNode.vx = dragNode.vy = dragNode.vz = 0;
    } else if (viewMode === 'flat') {
      mode = 'pan';
      panStart = { x: e.clientX, y: e.clientY };
    } else {
      mode = 'orbit';
      orbitStart = { x: e.clientX, y: e.clientY, theta: cam.theta, phi: cam.phi };
    }
    updateCursor();
  });

  canvas.addEventListener('pointermove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.inside = true;
    if (downPos && (Math.abs(e.clientX - downPos.x) + Math.abs(e.clientY - downPos.y) > 3)) {
      movedSinceDown = true;
    }
    if (mode === 'dragNode' && dragNode) {
      const zc = Math.max(120, depthOf(dragNode.x, dragNode.y, dragNode.z));
      const world = unproject(mouse.x, mouse.y, zc);
      dragNode.x = world.x;
      dragNode.y = world.y;
      dragNode.z = viewMode === 'flat' ? 0 : world.z;
      dragNode.vx = dragNode.vy = dragNode.vz = 0;
    } else if (mode === 'orbit' && orbitStart) {
      cam.theta = orbitStart.theta - (e.clientX - orbitStart.x) * 0.0052;
      cam.phi = clamp(orbitStart.phi + (e.clientY - orbitStart.y) * 0.0042, -1.15, 1.15);
    } else if (mode === 'globe' && globeLast) {
      const dx = e.clientX - globeLast.x;
      const dy = e.clientY - globeLast.y;
      if (dx || dy) {
        globe.q = quatNormalize(quatMul(quatAxis(upX, upY, upZ, dx * 0.005), globe.q));
        globe.q = quatNormalize(quatMul(quatAxis(rightX, rightY, rightZ, dy * 0.005), globe.q));
      }
      globe.auto = false;
      if (movedSinceDown && focusNode) {
        focusNode = null;
        updateNodeInfo();
      }
      globeLast = { x: e.clientX, y: e.clientY };
    } else if (mode === 'pan' && panStart) {
      const p1 = unproject(panStart.x, panStart.y, cam.dist);
      const p2 = unproject(e.clientX, e.clientY, cam.dist);
      cam.target.x += p1.x - p2.x;
      cam.target.y += p1.y - p2.y;
      cam.target.z += p1.z - p2.z;
      cam.goalTarget.x = cam.target.x;
      cam.goalTarget.y = cam.target.y;
      cam.goalTarget.z = cam.target.z;
      panStart = { x: e.clientX, y: e.clientY };
    }
    updateCursor();
  });

  function endPointer(e) {
    const ctrlKey = !!(e && (e.ctrlKey || e.metaKey));
    if (mode === 'dragNode' && dragNode) {
      if (!movedSinceDown) queueNodeClick(dragNode, ctrlKey);
      else {
        dragNode.z = viewMode === 'flat' ? 0 : dragNode.z;
        scheduleMetaSave(700);
      }
    } else if (mode === 'globe') {
      globe.dragging = false;
      if (!movedSinceDown) {
        if (downNode) queueNodeClick(downNode, ctrlKey);
        else {
          lastPointerNode = null;
          if (multiSelection.size) {
            if (clearMultiSelection(false)) unfocusNode(false);
          } else if (sideOpen && !closeSideDoc(false)) {
            // keep the current view when the user cancels closing
          } else {
            unfocusNode(false);
          }
        }
      }
    } else if ((mode === 'orbit' || mode === 'pan') && !movedSinceDown) {
      lastPointerNode = null;
      if (multiSelection.size) {
        if (clearMultiSelection(false)) unfocusNode(false);
      } else if (sideOpen && !closeSideDoc(false)) {
        // keep focus if the user cancelled
      } else {
        unfocusNode(false);
      }
    }
    mode = 'idle';
    dragNode = null;
    orbitStart = null;
    panStart = null;
    globeLast = null;
    downPos = null;
    downNode = null;
    updateCursor();
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', () => {
    mouse.inside = false;
    if (hoverNode) {
      hoverNode = null;
      updateNodeInfo();
      updateCursor();
    }
  });

  canvas.addEventListener('dblclick', (e) => {
    if (transition) return;
    if (e.ctrlKey || e.metaKey) return;
    cancelPendingClick();
    let node = nodeAt(e.clientX, e.clientY);
    if (!node && lastPointerNode && performance.now() - lastPointerAt < 700) {
      node = lastPointerNode;
    }
    if (!node) return;
    if (multiSelection.size && !clearMultiSelection(false)) return;
    if (node.type === 'city') {
      if (nodeHasMd(node)) {
        focusOnNode(node);
        openSideDoc(node, false);
      } else {
        focusOnNode(node);
        showHint('「' + node.name + '」还没有内容，右键「编辑内容」创建');
      }
      return;
    }
    enterNode(node);
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (transition) return;
    if (viewMode === 'sphere') {
      cam.zoom = clamp(cam.zoom * Math.exp(-e.deltaY * 0.0012), 0.45, 3);
      cam.goalZoom = cam.zoom;
      return;
    }
    const before = unproject(e.clientX, e.clientY, cam.dist);
    cam.zoom = clamp(cam.zoom * Math.exp(-e.deltaY * 0.0012), 0.35, 3.2);
    cam.goalZoom = cam.zoom;
    computeCameraFrame();
    const after = unproject(e.clientX, e.clientY, cam.dist);
    cam.target.x += before.x - after.x;
    cam.target.y += before.y - after.y;
    cam.target.z += before.z - after.z;
    cam.goalTarget.x = cam.target.x;
    cam.goalTarget.y = cam.target.y;
    cam.goalTarget.z = cam.target.z;
  }, { passive: false });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (transition) return;
    cancelPendingClick();
    const node = nodeAt(e.clientX, e.clientY);
    if (node) showNodeMenu(e.clientX, e.clientY, node);
    else showBlankMenu(e.clientX, e.clientY);
  });

  // ============================================================
  // Menus
  // ============================================================
  function menuItem(action, icon, label, danger) {
    return '<div class="menu-item" data-action="' + action + '"' +
      (danger ? ' style="color:#fb7185;"' : '') + '><span class="mi-ico">' +
      icon + '</span>' + label + '</div>';
  }
  const MENU_DIVIDER = '<div class="menu-divider"></div>';

  function placeMenu(x, y) {
    menuEl.style.display = 'block';
    menuEl.style.left = '0px';
    menuEl.style.top = '0px';
    const rect = menuEl.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
    x = Math.max(8, x);
    y = Math.max(8, y);
    menuEl.style.left = x + 'px';
    menuEl.style.top = y + 'px';
    lastMenuX = x;
    lastMenuY = y;
  }

  function bindMenu(handler) {
    menuEl.querySelectorAll('.menu-item').forEach(item => {
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        handler(item);
      });
    });
  }

  function nodeLinksOf(id) {
    return links.filter(link => link.source === id || link.target === id);
  }

  function showNodeMenu(x, y, node) {
    contextNode = node;
    const info = TYPE_INFO[node.type];
    const nodeLinks = nodeLinksOf(node.id);
    let html = '<div class="menu-header">' + info.label + ' · ' + escapeHtml(node.name) + '</div>';
    html += menuItem('editContent', '▤', '编辑内容');
    if (info.child) {
      html += menuItem('enter', '↳', '进入' + TYPE_INFO[info.child].label + '界面');
      html += menuItem('newChild', '＋', '新建' + TYPE_INFO[info.child].label);
    }
    html += MENU_DIVIDER;
    html += menuItem('rename', '✎', '重命名');
    html += menuItem('color', '◐', '更改配色');
    html += menuItem('link', '↔', '添加星链');
    if (nodeLinks.length) html += menuItem('unlink', '✕', '删除星链');
    if (node.type === 'planet' && allNodes.filter(n => n.type === 'galaxy').length > 1) {
      html += menuItem('move', '↗', '移入星系');
    }
    html += MENU_DIVIDER;
    html += menuItem('delete', '×', '删除节点', true);
    menuEl.innerHTML = html;
    bindMenu(item => handleNodeAction(item.dataset.action, node, nodeLinks));
    placeMenu(x, y);
  }

  function showBlankMenu(x, y) {
    contextNode = null;
    const type = viewNodeType();
    const info = TYPE_INFO[type];
    let html = '<div class="menu-header">' + (viewParent() ? viewParent().name : '星域操作') + '</div>';
    if (info) html += menuItem('newChild', '＋', '新建' + info.label);
    if (currentParentId) html += menuItem('up', '↑', '返回上一层');
    if (viewMode !== 'sphere') html += menuItem('relayout', '✦', '重新排布');
    html += menuItem('resetView', '⌖', '重置视角');
    html += menuItem('help', '?', '操作指南');
    menuEl.innerHTML = html;
    bindMenu(item => handleBlankAction(item.dataset.action));
    placeMenu(x, y);
  }

  function handleNodeAction(action, node, nodeLinks) {
    menuEl.style.display = 'none';
    switch (action) {
      case 'editContent':
        openNodeContent(node, true);
        break;
      case 'enter':
        enterNode(node);
        break;
      case 'newChild':
        createNodeFlow(node);
        break;
      case 'rename':
        renameNode(node);
        break;
      case 'color':
        showColorPicker(lastMenuX, lastMenuY, node);
        break;
      case 'link':
        startLinking(node);
        break;
      case 'unlink':
        if (nodeLinks.length === 1) removeLink(nodeLinks[0]);
        else showUnlinkSubmenu(node, nodeLinks);
        break;
      case 'move':
        showMoveSubmenu(node);
        break;
      case 'delete':
        deleteNode(node);
        break;
    }
  }

  function handleBlankAction(action) {
    menuEl.style.display = 'none';
    switch (action) {
      case 'newChild':
        createNodeFlow(viewParent());
        break;
      case 'up':
        goUp();
        break;
      case 'relayout':
        resetLayout();
        break;
      case 'resetView':
        resetView();
        break;
      case 'help':
        toggleHelp(true);
        break;
    }
  }

  function showUnlinkSubmenu(node, nodeLinks) {
    let html = '<div class="menu-header">选择要删除的星链</div>';
    for (const link of nodeLinks) {
      const otherId = link.source === node.id ? link.target : link.source;
      const other = nodeById.get(otherId);
      html += '<div class="menu-item" data-unlink="' + escapeAttr(otherId) + '">' +
        '<span class="mi-ico">✕</span>与「' + escapeHtml(other ? other.name : otherId) + '」断开</div>';
    }
    html += MENU_DIVIDER + '<div class="menu-item" data-action="cancel"><span class="mi-ico">↩</span>取消</div>';
    menuEl.innerHTML = html;
    menuEl.querySelectorAll('.menu-item').forEach(item => {
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (item.dataset.action === 'cancel') { menuEl.style.display = 'none'; return; }
        const otherId = item.dataset.unlink;
        if (otherId) {
          const index = allLinks.findIndex(link =>
            (link.source === node.id && link.target === otherId) ||
            (link.source === otherId && link.target === node.id)
          );
          if (index >= 0) removeLink(allLinks[index]);
          menuEl.style.display = 'none';
        }
      });
    });
    placeMenu(lastMenuX, lastMenuY);
  }

  function showMoveSubmenu(planet) {
    const galaxies = allNodes.filter(node => node.type === 'galaxy' && node.id !== planet.parent);
    if (!galaxies.length) return;
    let html = '<div class="menu-header">移入哪个星系</div>';
    for (const galaxy of galaxies) {
      html += '<div class="menu-item" data-move="' + escapeAttr(galaxy.id) + '">' +
        '<span class="mi-ico">◉</span>' + escapeHtml(galaxy.name) +
        ' <span style="margin-left:auto;color:#6f9a82;font-size:11px;">' +
        childrenOf(galaxy.id).filter(n => n.type === 'planet').length + '</span></div>';
    }
    html += MENU_DIVIDER + '<div class="menu-item" data-action="cancel"><span class="mi-ico">↩</span>取消</div>';
    menuEl.innerHTML = html;
    menuEl.querySelectorAll('.menu-item').forEach(item => {
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (item.dataset.action === 'cancel') { menuEl.style.display = 'none'; return; }
        movePlanet(planet, item.dataset.move);
        menuEl.style.display = 'none';
      });
    });
    placeMenu(lastMenuX, lastMenuY);
  }

  // ============================================================
  // Links
  // ============================================================
  function recomputeLinks() {
    links = allLinks.filter(link => nodeMap.has(link.source) && nodeMap.has(link.target));
    for (const node of nodes) node.degree = 0;
    for (const link of links) {
      const a = nodeMap.get(link.source);
      const b = nodeMap.get(link.target);
      if (a) a.degree++;
      if (b) b.degree++;
    }
    if (multiSelection.size >= 2) {
      const ids = multiIdsSorted();
      if (!ids.every(id => nodeMap.has(id)) || !isSelectionConnected(ids)) {
        clearMultiSelection(true);
        showHint('星链变化使关系断开，已取消多选');
      } else {
        relationIds = ids;
        focusSelectionGroup();
        if (sideOpen && sideKind === 'relation' && docState.mode === 'read') renderRelationDoc();
      }
    }
    updateStatus();
    updateNodeInfo();
  }

  function addLink(a, b) {
    if (!a || !b || a === b || a.type !== b.type) return;
    if (!nodeMap.has(a.id) || !nodeMap.has(b.id)) return;
    const exists = allLinks.some(link =>
      (link.source === a.id && link.target === b.id) ||
      (link.source === b.id && link.target === a.id)
    );
    if (exists) { showHint('这两个节点已经相连'); return; }
    allLinks.push({ source: a.id, target: b.id, seed: Math.random() });
    recomputeLinks();
    saveMeta();
    showHint('星链已建立 · ' + a.name + ' ⇄ ' + b.name);
  }

  function removeLink(link) {
    const index = allLinks.indexOf(link);
    if (index < 0) return;
    allLinks.splice(index, 1);
    recomputeLinks();
    saveMeta();
  }

  function startLinking(node) {
    linkSource = node;
    updateCursor();
    showHint('点击目标节点建立星链 · Esc 取消', 0);
  }

  function cancelLinking() {
    if (!linkSource) return;
    linkSource = null;
    hideHint();
    updateCursor();
  }

  // ============================================================
  // Create / rename / delete
  // ============================================================
  function addNode(type, parentId, name) {
    const info = TYPE_INFO[type];
    if (!info) return null;
    let id = genNodeId(type);
    while (nodeById.has(id)) id = genNodeId(type);
    let pos;
    if (type === 'galaxy') pos = randomPos(150, 380, 0.5);
    else if (type === 'planet') pos = randomPos(80, 260, 0.6);
    else if (type === 'sector') pos = { x: 0, y: 0, z: 0 };
    else pos = randomFlatPos(80, 280);
    const node = makeNode({
      id, type, name, parent: parentId, color: DEFAULT_COLOR,
      x: pos.x, y: pos.y, z: pos.z, md: info.folder + '/' + safeFileId(id) + '.md'
    });
    node.appear = 0;
    node.birth = performance.now();
    allNodes.push(node);
    buildIndex();
    buildView(false, false);
    saveMeta();
    showHint(info.label + '「' + name + '」已创建');
    return node;
  }

  function createNodeFlow(parentNode, forcedType) {
    const type = forcedType || (parentNode ? TYPE_INFO[parentNode.type].child : 'galaxy');
    if (!type) return;
    const info = TYPE_INFO[type];
    const parentLabel = parentNode ? parentNode.name : '根星域';
    showNameDialog({
      title: '新建' + info.label,
      desc: '将创建在「' + parentLabel + '」下。之后可右键「编辑内容」生成对应的 Markdown。',
      value: '',
      confirmText: '创建'
    }).then(name => {
      if (!name) return;
      addNode(type, parentNode ? parentNode.id : null, name);
    });
  }

  function renameNode(node) {
    showNameDialog({
      title: '重命名' + TYPE_INFO[node.type].label,
      desc: '内容路径由节点 ID 固定，重命名不会移动 Markdown 文件。',
      value: node.name,
      confirmText: '保存'
    }).then(name => {
      if (!name) return;
      node.name = name;
      updateNodeRadius(node);
      buildView(false, false);
      updateStatus();
      updateNodeInfo();
      if (sideOpen && sideNodeId === node.id) {
        sideTitle.textContent = name;
        docState.name = name;
      }
      saveMeta();
      showHint('已重命名为「' + name + '」');
    });
  }

  async function deleteNode(node) {
    if (!node) return;
    if (node.childrenCount > 0) {
      alert('「' + node.name + '」下还有 ' + node.childrenCount + ' 个子节点，请先删除或移走子节点。');
      return;
    }
    if (!confirm('确定删除' + TYPE_INFO[node.type].label + '「' + node.name + '」' +
      (nodeHasMd(node) ? '及其 Markdown 内容吗？' : '吗？'))) return;
    if (multiSelection.has(node.id)) clearMultiSelection(true);
    if (nodeHasMd(node)) {
      try {
        await deleteContent(canonicalMd(node));
        mdSet.delete(canonicalMd(node));
      } catch (error) {
        alert('删除内容失败: ' + error.message);
        return;
      }
    }
    if (sideNodeId === node.id) closeSideDoc(true);
    allNodes = allNodes.filter(item => item !== node);
    allLinks = allLinks.filter(link => link.source !== node.id && link.target !== node.id);
    nodeById.delete(node.id);
    if (focusNode === node) focusNode = null;
    if (hoverNode === node) hoverNode = null;
    if (contextNode === node) contextNode = null;
    if (currentParentId === node.id) currentParentId = node.parent;
    buildIndex();
    buildView(false, false);
    saveMeta();
    showHint('已删除' + TYPE_INFO[node.type].label + '「' + node.name + '」');
  }

  function movePlanet(planet, galaxyId) {
    const galaxy = nodeById.get(galaxyId);
    if (!galaxy || galaxy.type !== 'galaxy' || planet.type !== 'planet') return;
    if (multiSelection.has(planet.id)) clearMultiSelection(true);
    planet.parent = galaxyId;
    buildIndex();
    buildView(false, false);
    saveMeta();
    showHint('已移入「' + galaxy.name + '」');
  }

  // ============================================================
  // Color picker
  // ============================================================
  function buildSwatches() {
    const wrap = $('swatches');
    wrap.innerHTML = '';
    const colors = [...PLANET_PALETTE, ...SECTOR_PALETTE, ...COUNTRY_PALETTE];
    colors.forEach(color => {
      if (wrap.querySelector('[data-color="' + color + '"]')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'swatch';
      button.dataset.color = color;
      button.style.background = color;
      button.title = color;
      button.addEventListener('click', (ev) => {
        ev.stopPropagation();
        setPendingColor(color);
      });
      wrap.appendChild(button);
    });
  }

  function showColorPicker(x, y, node) {
    colorPickerNode = node;
    colorPickerOriginalColor = node.color;
    colorPickerOriginalCustom = node.custom;
    pendingColor = node.displayColor;
    currentHue = hexToHue(pendingColor);
    updateColorUI();
    pickerEl.style.display = 'block';
    const rect = pickerEl.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
    pickerEl.style.left = Math.max(8, x) + 'px';
    pickerEl.style.top = Math.max(8, y) + 'px';
  }

  function updateColorUI() {
    const preview = $('colorPreview');
    preview.style.background = pendingColor;
    preview.style.color = pendingColor;
    $('hueSlider').style.left = (currentHue / 360 * 100) + '%';
    $('colorHex').textContent = pendingColor.toUpperCase();
    if (colorPickerNode) {
      colorPickerNode.color = pendingColor;
      refreshNodeColor(colorPickerNode);
      updateNodeInfo();
    }
  }

  function setPendingColor(hex) {
    pendingColor = hex;
    currentHue = hexToHue(hex);
    updateColorUI();
  }

  function closeColorPicker(apply) {
    if (colorPickerNode) {
      if (apply) {
        saveMeta();
        showHint('配色已保存');
      } else {
        colorPickerNode.color = colorPickerOriginalColor;
        colorPickerNode.custom = colorPickerOriginalCustom;
        refreshNodeColor(colorPickerNode);
        updateNodeInfo();
      }
    }
    colorPickerNode = null;
    pickerEl.style.display = 'none';
  }

  const hueBar = $('hueBar');
  let hueDragging = false;
  hueBar.addEventListener('pointerdown', (e) => {
    hueDragging = true;
    try { hueBar.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    updateHueFromPointer(e);
    e.preventDefault();
  });
  hueBar.addEventListener('pointermove', (e) => {
    if (hueDragging) updateHueFromPointer(e);
  });
  hueBar.addEventListener('pointerup', () => { hueDragging = false; });
  hueBar.addEventListener('pointercancel', () => { hueDragging = false; });
  function updateHueFromPointer(e) {
    const rect = hueBar.getBoundingClientRect();
    currentHue = clamp((e.clientX - rect.left) / rect.width, 0, 1) * 360;
    pendingColor = hslToHex(currentHue, 85, 60);
    updateColorUI();
  }
  $('colorConfirm').addEventListener('click', (e) => {
    e.stopPropagation();
    closeColorPicker(true);
  });
  $('colorCancel').addEventListener('click', (e) => {
    e.stopPropagation();
    closeColorPicker(false);
  });

  // ============================================================
  // Dialogs & UI helpers
  // ============================================================
  function showNameDialog(opts) {
    if (nameDialogResolve) closeNameDialog(null);
    ndTitle.textContent = opts.title || '命名';
    ndDesc.textContent = opts.desc || '';
    ndInput.value = opts.value || '';
    ndConfirm.textContent = opts.confirmText || '确定';
    nameDialogEl.classList.add('show');
    setTimeout(() => { ndInput.focus(); ndInput.select(); }, 30);
    return new Promise(resolve => { nameDialogResolve = resolve; });
  }
  function closeNameDialog(result) {
    if (!nameDialogResolve) return;
    const resolve = nameDialogResolve;
    nameDialogResolve = null;
    nameDialogEl.classList.remove('show');
    resolve(result);
  }
  function submitNameDialog() {
    const value = ndInput.value.trim();
    if (!value) { ndInput.focus(); return; }
    closeNameDialog(value);
  }
  ndConfirm.addEventListener('click', submitNameDialog);
  $('ndCancel').addEventListener('click', () => closeNameDialog(null));
  ndInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submitNameDialog(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeNameDialog(null); }
  });
  nameDialogEl.addEventListener('pointerdown', (e) => {
    if (e.target === nameDialogEl) closeNameDialog(null);
  });

  function hideMenus() {
    if (menuEl.style.display === 'block') menuEl.style.display = 'none';
    if (pickerEl.style.display === 'block') closeColorPicker(false);
  }
  function showHint(text, ms) {
    hintEl.textContent = text;
    hintEl.classList.add('show');
    clearTimeout(showHint._timer);
    if (ms !== 0) showHint._timer = setTimeout(() => hintEl.classList.remove('show'), ms || 2200);
  }
  function hideHint() {
    hintEl.classList.remove('show');
    clearTimeout(showHint._timer);
  }
  function toggleHelp(show) {
    const next = show === undefined ? !helpPanel.classList.contains('show') : show;
    if (next) hideMenus();
    helpPanel.classList.toggle('show', next);
  }

  $('backLevelBtn').addEventListener('click', goUp);
  $('autoBtn').addEventListener('click', toggleAuto);
  $('glowBtn').addEventListener('click', toggleGlow);
  $('resetViewBtn').addEventListener('click', resetView);
  $('relayoutBtn').addEventListener('click', resetLayout);
  $('helpBtn').addEventListener('click', () => toggleHelp());
  $('helpClose').addEventListener('click', () => toggleHelp(false));
  helpPanel.addEventListener('click', (e) => {
    if (e.target === helpPanel) toggleHelp(false);
  });
  $('refreshBtn').addEventListener('click', () => refreshAll(true));

  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest) return;
    if (e.target.closest('.menu') || e.target.closest('#colorPicker') ||
        e.target.closest('.hud') || e.target.closest('.help-card') ||
        e.target.closest('#nameDialog') || e.target.closest('#nodeInfo') ||
        e.target.closest('#sideDoc')) return;
    hideMenus();
  });

  // ============================================================
  // Split Markdown side panel
  // ============================================================
  let sideLoadToken = 0;

  function sideDirty() {
    if (!sideOpen || docState.mode !== 'edit') return false;
    const editor = $('sideEditor');
    return !!editor && editor.value !== docState.rawContent;
  }

  function setSplit(open) {
    graphView.classList.toggle('split', open);
    sideDoc.classList.toggle('open', open);
    resizeCanvas();
    requestAnimationFrame(resizeCanvas);
  }

  // ============================================================
  // Relation page (multi-selected connected nodes)
  // ============================================================
  function relationHash(ids) {
    const source = ids.join('|');
    let h1 = 2166136261 >>> 0;
    let h2 = 0x9e3779b9 >>> 0;
    for (let i = 0; i < source.length; i++) {
      const code = source.charCodeAt(i);
      h1 = Math.imul(h1 ^ code, 16777619) >>> 0;
      h2 = Math.imul(h2 ^ (code + 0x9e3779b9), 2246822519) >>> 0;
    }
    return h1.toString(36).padStart(7, '0') + h2.toString(36).padStart(7, '0');
  }

  function relationPathFor(ids) {
    const sorted = ids.slice().sort();
    return 'relations/r-' + relationHash(sorted) + '-' + sorted.length + '.md';
  }

  function relationOrderedNodes(ids) {
    const ordered = selectionOrder.filter(id => ids.includes(id));
    for (const id of ids) if (!ordered.includes(id)) ordered.push(id);
    return ordered.map(id => nodeById.get(id)).filter(Boolean);
  }

  function relationTitle(ids) {
    return relationOrderedNodes(ids).map(node => node.name).join(' ⇄ ');
  }

  function relationEdges(ids) {
    const idSet = new Set(ids);
    return links.filter(link => idSet.has(link.source) && idSet.has(link.target));
  }

  function relationSummaryHTML(ids) {
    const selected = relationOrderedNodes(ids);
    const edges = relationEdges(ids);
    const chips = selected.map(node => {
      const color = node.displayColor || paletteFor(node.type, node.id);
      return '<span class="relation-chip">' +
        '<i class="rdot" style="background:' + color + ';color:' + color + '"></i>' +
        escapeHtml(node.name) + ' <small>' + (TYPE_INFO[node.type] ? TYPE_INFO[node.type].label : node.type) + '</small>' +
        '</span>';
    }).join('');
    const edgeRows = edges.map(link => {
      const a = nodeById.get(link.source);
      const b = nodeById.get(link.target);
      return '<div class="edge">' + escapeHtml(a ? a.name : link.source) +
        ' <span style="color:#00ff9c;">⇄</span> ' +
        escapeHtml(b ? b.name : link.target) + '</div>';
    }).join('');
    return '<div class="relation-summary">' +
      '<div class="relation-kicker"><span>RELATION // 关系</span><b>' +
      selected.length + ' 节点 · ' + edges.length + ' 星链</b></div>' +
      '<div class="relation-nodes">' + chips + '</div>' +
      '<div class="relation-edges">' + (edgeRows || '<span style="color:#6f9a82;">暂无星链</span>') + '</div>' +
      '</div>';
  }

  function relationTemplate(ids) {
    const selected = relationOrderedNodes(ids);
    const edges = relationEdges(ids);
    const title = selected.map(node => node.name).join(' ⇄ ');
    let text = '# 关系：' + title + '\n\n';
    text += '## 节点\n\n';
    for (const node of selected) {
      text += '- **' + node.name + '**（' + (TYPE_INFO[node.type] ? TYPE_INFO[node.type].label : node.type) + '）\n';
    }
    text += '\n## 星链\n\n';
    for (const link of edges) {
      const a = nodeById.get(link.source);
      const b = nodeById.get(link.target);
      text += '- ' + (a ? a.name : link.source) + ' ⇄ ' + (b ? b.name : link.target) + '\n';
    }
    text += '\n## 关系说明\n\n';
    return text;
  }

  function renderRelationDoc() {
    if (!sideOpen || sideKind !== 'relation') return;
    const ids = relationIds;
    const hasNote = mdSet.has(docState.path);
    const readMode = docState.mode === 'read';
    sideTitle.textContent = relationTitle(ids);
    sideType.textContent = '关系内容 · ' + ids.length + ' 个节点';
    sidePath.textContent = 'notes/' + docState.path;
    sideEdit.textContent = readMode ? '修改' : '保存';
    sideStatus.textContent = readMode ? (hasNote ? '只读模式' : '仅关系结构') : '编辑模式';
    sideDelete.disabled = !hasNote;
    sideDelete.title = hasNote ? '删除关系笔记（节点与星链保留）' : '暂无关系笔记';
    const summary = relationSummaryHTML(ids);
    const head = '<div class="relation-note-head"><span>关系笔记</span><span>' +
      (hasNote ? '已创建' : '未创建') + '</span></div>';
    if (readMode) {
      let note;
      if (docState.rawContent && docState.rawContent.trim()) {
        note = '<div class="markdown-body">' + renderMarkdown(docState.rawContent) + '</div>';
      } else {
        note = '<div class="relation-empty">暂无关系笔记。<b>点击「修改」</b> 创建，可记录这组节点之间的关系。<br>' +
          '删除按钮只删除关系笔记，节点与星链都会保留。</div>';
      }
      sideBody.innerHTML = '<div class="relation-view">' + summary +
        '<div class="relation-note">' + head + note + '</div></div>';
      sideBody.scrollTop = 0;
    } else {
      sideBody.innerHTML = '<div class="relation-view">' + summary +
        '<div class="relation-note">' + head +
        '<div class="editor"><textarea id="sideEditor" spellcheck="false"></textarea></div>' +
        '</div></div>';
      const editor = $('sideEditor');
      editor.value = docState.rawContent;
      editor.addEventListener('input', () => {
        editor.style.height = 'auto';
        editor.style.height = Math.max(window.innerHeight - 430, editor.scrollHeight) + 'px';
      });
      setTimeout(() => {
        editor.style.height = Math.max(window.innerHeight - 430, editor.scrollHeight) + 'px';
        editor.focus();
      }, 0);
      sideBody.scrollTop = 0;
    }
  }

  function openRelationPanel() {
    if (multiSelection.size < 2) return false;
    if (sideOpen && !closeSideDoc(false)) return false;
    const ids = multiIdsSorted();
    const path = relationPathFor(ids);
    const token = ++sideLoadToken;
    sideOpen = true;
    sideKind = 'relation';
    sideNodeId = null;
    sideNode = null;
    relationIds = ids;
    docState.path = path;
    docState.name = relationTitle(ids);
    docState.type = 'relation';
    docState.rawContent = '';
    docState.mode = 'read';
    sideTitle.textContent = relationTitle(ids);
    sideType.textContent = '关系内容 · ' + ids.length + ' 个节点';
    sidePath.textContent = 'notes/' + path;
    sideStatus.textContent = mdSet.has(path) ? '加载中…' : '仅关系结构';
    sideEdit.textContent = '修改';
    sideDelete.disabled = !mdSet.has(path);
    sideDelete.title = mdSet.has(path) ? '删除关系笔记（节点与星链保留）' : '暂无关系笔记';
    sideBody.innerHTML = '<div class="side-loading"><span class="spinner small"></span>正在构建关系页面…</div>';
    setSplit(true);
    if (!mdSet.has(path)) {
      renderRelationDoc();
      return true;
    }
    loadContent(path).then(res => {
      if (token !== sideLoadToken || !sideOpen || sideKind !== 'relation' || docState.path !== path) return;
      if (!res || res.ok === false) throw new Error((res && res.error) || '读取失败');
      docState.rawContent = res.content || '';
      renderRelationDoc();
    }).catch(error => {
      if (token !== sideLoadToken || !sideOpen || sideKind !== 'relation') return;
      sideStatus.textContent = '读取失败';
      sideBody.innerHTML = '<div class="side-error">无法读取关系笔记 <code>' + escapeHtml(path) + '</code><br>' +
        escapeHtml(error.message || '') + '</div>';
    });
    return true;
  }

  async function ensureRelationEdit() {
    if (!sideOpen || sideKind !== 'relation') return;
    if (mdSet.has(docState.path)) {
      docState.mode = 'edit';
      renderRelationDoc();
      return;
    }
    const path = docState.path;
    const ids = relationIds.slice();
    const template = relationTemplate(ids);
    try {
      await createContent(path, template);
      mdSet.add(path);
      if (!sideOpen || sideKind !== 'relation' || docState.path !== path) return;
      docState.rawContent = template;
      docState.mode = 'edit';
      renderRelationDoc();
      showHint('已创建关系笔记 notes/' + path);
    } catch (error) {
      if (error.status === 409) {
        mdSet.add(path);
        try {
          const res = await loadContent(path);
          if (!sideOpen || sideKind !== 'relation' || docState.path !== path) return;
          docState.rawContent = (res && res.content) || '';
          docState.mode = 'edit';
          renderRelationDoc();
        } catch (loadError) {
          alert('读取关系笔记失败：' + loadError.message);
        }
      } else {
        alert('创建关系笔记失败：' + error.message);
      }
    }
  }

  async function deleteRelationNote() {
    if (!sideOpen || sideKind !== 'relation') return;
    if (!mdSet.has(docState.path)) return;
    const path = docState.path;
    if (!confirm('删除关系笔记 notes/' + path + ' ？\n\n只会删除这份关系笔记，节点与星链都会保留。')) return;
    try {
      await deleteContent(path);
    } catch (error) {
      if (error.status !== 404) {
        alert('删除关系笔记失败：' + error.message);
        return;
      }
    }
    if (!sideOpen || sideKind !== 'relation' || docState.path !== path) return;
    mdSet.delete(path);
    docState.rawContent = '';
    docState.mode = 'read';
    renderRelationDoc();
    showHint('关系笔记已删除，节点与星链仍然保留');
  }

  function openSideDoc(node, editMode) {
    if (!node) return;
    if (sideOpen && sideNodeId === node.id) {
      if (editMode && docState.mode === 'read') {
        docState.mode = 'edit';
        renderSideDoc();
      }
      return;
    }
    if (sideOpen && sideNodeId !== node.id) {
      if (!closeSideDoc(false)) return;
    }
    const path = canonicalMd(node);
    sideOpen = true;
    sideKind = 'node';
    relationIds = [];
    sideNodeId = node.id;
    sideNode = node;
    docState.path = path;
    docState.name = node.name;
    docState.type = node.type;
    docState.rawContent = '';
    docState.mode = editMode ? 'edit' : 'read';
    const token = ++sideLoadToken;
    sideTitle.textContent = node.name;
    sideType.textContent = TYPE_INFO[node.type].label + '内容';
    sidePath.textContent = 'notes/' + path;
    sideStatus.textContent = '加载中…';
    sideEdit.textContent = docState.mode === 'edit' ? '保存' : '编辑';
    sideDelete.disabled = false;
    sideDelete.title = '删除对应的 Markdown 内容文件';
    sideBody.innerHTML = '<div class="side-loading"><span class="spinner small"></span>正在读取 ' + escapeHtml(path) + '…</div>';
    setSplit(true);
    loadContent(path).then(res => {
      if (token !== sideLoadToken || sideNodeId !== node.id) return;
      if (!res || res.ok === false) throw new Error((res && res.error) || '读取失败');
      docState.rawContent = res.content || '';
      mdSet.add(path);
      renderSideDoc();
      if (docState.mode === 'edit') {
        const editor = $('sideEditor');
        if (editor) editor.focus();
      }
    }).catch(error => {
      if (token !== sideLoadToken || sideNodeId !== node.id) return;
      sideStatus.textContent = '读取失败';
      sideBody.innerHTML = '<div class="side-error">无法读取 <code>' + escapeHtml(path) + '</code><br>' +
        escapeHtml(error.message || '') + '</div>';
    });
  }

  function closeSideDoc(force) {
    if (!sideOpen) return true;
    if (!force && sideDirty()) {
      if (!confirm('当前内容有未保存的修改，确定关闭吗？')) return false;
    }
    sideLoadToken++;
    sideOpen = false;
    sideKind = 'node';
    relationIds = [];
    sideNodeId = null;
    sideNode = null;
    docState.mode = 'read';
    docState.path = '';
    docState.rawContent = '';
    sideBody.innerHTML = '';
    sideStatus.textContent = '';
    sideEdit.textContent = '编辑';
    sideDelete.disabled = false;
    sideDelete.title = '删除对应的 Markdown 内容文件';
    setSplit(false);
    return true;
  }

  function renderSideDoc() {
    if (!sideOpen) return;
    if (sideKind === 'relation') {
      renderRelationDoc();
      return;
    }
    const readMode = docState.mode === 'read';
    sideEdit.textContent = readMode ? '编辑' : '保存';
    sideStatus.textContent = readMode ? '只读模式' : '编辑模式';
    sidePath.textContent = 'notes/' + docState.path;
    sideDelete.disabled = false;
    sideDelete.title = '删除对应的 Markdown 内容文件';
    if (readMode) {
      if (!docState.rawContent || !docState.rawContent.trim()) {
        sideBody.innerHTML = '<div class="markdown-body"><div class="doc-empty">此节点还没有内容，点击「编辑」开始写。</div></div>';
      } else {
        sideBody.innerHTML = '<div class="markdown-body">' + renderMarkdown(docState.rawContent) + '</div>';
      }
      sideBody.scrollTop = 0;
    } else {
      sideBody.innerHTML = '<div class="editor"><textarea id="sideEditor" spellcheck="false"></textarea></div>';
      const editor = $('sideEditor');
      editor.value = docState.rawContent;
      editor.addEventListener('input', () => {
        editor.style.height = 'auto';
        editor.style.height = Math.max(window.innerHeight - 190, editor.scrollHeight) + 'px';
      });
      setTimeout(() => {
        editor.style.height = Math.max(window.innerHeight - 190, editor.scrollHeight) + 'px';
        editor.focus();
      }, 0);
      sideBody.scrollTop = 0;
    }
  }

  async function saveSideDoc() {
    if (!sideOpen || docState.mode !== 'edit') return;
    const editor = $('sideEditor');
    if (!editor) return;
    const content = editor.value;
    try {
      const res = await saveContent(docState.path, content);
      if (res && res.ok === false) throw new Error(res.error || '保存失败');
      docState.rawContent = content;
      docState.mode = 'read';
      mdSet.add(docState.path);
      renderSideDoc();
      showHint('内容已保存');
    } catch (error) {
      alert('保存失败：' + error.message);
    }
  }

  async function deleteSideContent() {
    if (sideKind === 'relation') {
      await deleteRelationNote();
      return;
    }
    if (!sideOpen || !docState.path) return;
    const path = docState.path;
    const node = sideNode;
    const label = 'notes/' + path;
    if (!confirm('删除内容文件 ' + label + ' ？\n\n只会删除 Markdown 文件，节点仍然保留。')) return;
    try {
      await deleteContent(path);
    } catch (error) {
      if (error.status !== 404) {
        alert('删除内容失败：' + error.message);
        return;
      }
    }
    mdSet.delete(path);
    if (node) node.md = canonicalMd(node);
    closeSideDoc(true);
    updateNodeInfo();
    showHint('内容文件已删除，节点仍然保留');
  }

  async function openNodeContent(node, editMode) {
    if (!node) return;
    focusOnNode(node);
    if (focusNode !== node) return;
    if (nodeHasMd(node)) {
      openSideDoc(node, editMode);
      return;
    }
    const path = canonicalMd(node);
    try {
      await createContent(path, '# ' + node.name + '\n\n');
      mdSet.add(path);
      node.md = path;
      saveMeta();
      openSideDoc(node, true);
      showHint('已创建内容文件 notes/' + path);
    } catch (error) {
      if (error.status === 409) {
        mdSet.add(path);
        node.md = path;
        openSideDoc(node, true);
      } else {
        alert('创建内容失败：' + error.message);
      }
    }
  }

  $('sideEdit').addEventListener('click', () => {
    if (!sideOpen) return;
    if (sideKind === 'relation') {
      if (docState.mode === 'read') ensureRelationEdit();
      else saveSideDoc();
      return;
    }
    if (docState.mode === 'read') {
      docState.mode = 'edit';
      renderSideDoc();
    } else {
      saveSideDoc();
    }
  });
  $('sideDelete').addEventListener('click', deleteSideContent);
  $('sideClose').addEventListener('click', () => {
    const wasRelation = sideKind === 'relation';
    if (!closeSideDoc(false)) return;
    if (wasRelation) clearMultiSelection(true);
  });

  // ============================================================
  // Keyboard
  // ============================================================
  document.addEventListener('keydown', (e) => {
    if (nameDialogEl.classList.contains('show')) {
      if (e.key === 'Escape') closeNameDialog(null);
      return;
    }
    if (e.key === 'Escape') {
      if (transition) return;
      cancelPendingClick();
      if (helpPanel.classList.contains('show')) { toggleHelp(false); return; }
      if (pickerEl.style.display === 'block') { closeColorPicker(false); return; }
      if (menuEl.style.display === 'block') { menuEl.style.display = 'none'; return; }
      if (linkSource) { cancelLinking(); return; }
      if (sideOpen) {
        const wasRelation = sideKind === 'relation';
        if (closeSideDoc(false)) {
          if (wasRelation) clearMultiSelection(true);
          else unfocusNode(false);
        }
        return;
      }
      if (multiSelection.size) {
        if (clearMultiSelection(false)) unfocusNode(false);
        return;
      }
      if (focusNode) { unfocusNode(true); return; }
      if (currentParentId) { goUp(); return; }
      return;
    }
    const active = document.activeElement;
    const typing = active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT');
    if (typing) {
      if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        saveSideDoc();
      }
      return;
    }
    if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      saveSideDoc();
      return;
    }
    if (!typing && (e.key === 'Delete' || e.key === 'Backspace')) {
      if (transition || linkSource) return;
      if (menuEl.style.display === 'block' || pickerEl.style.display === 'block' ||
          helpPanel.classList.contains('show')) return;
      if (sideOpen && docState.mode === 'edit') return;
      if (!focusNode) return;
      e.preventDefault();
      deleteNode(focusNode);
      return;
    }
    if (e.code === 'Space') { e.preventDefault(); toggleAuto(); }
    else if (e.key === 'r' || e.key === 'R') { resetView(); }
    else if (e.key === '?' || e.key === '/') { e.preventDefault(); toggleHelp(); }
    else if (e.key === '+' || e.key === '=') { zoomBy(1.15); }
    else if (e.key === '-' || e.key === '_') { zoomBy(1 / 1.15); }
  });

  // ============================================================
  // Markdown renderer
  // ============================================================
  let markedReady = false;
    function initMarked() {
      if (markedReady) return;
      if (typeof marked !== 'undefined' && marked.parse) {
        try {
          marked.setOptions({
            gfm: true,
            breaks: true,
            pedantic: false,
            headerIds: true,
            headerPrefix: 'h-',
            mangle: false,
            sanitize: false
          });

          const renderer = new marked.Renderer();
          const orig = {};
          orig.codespan = renderer.codespan.bind(renderer);

          renderer.code = function (code, infostring) {
            const lang = (infostring || '').trim().match(/^\S+/);
            let highlighted = code;
            if (typeof hljs !== 'undefined') {
              try {
                if (lang && hljs.getLanguage(lang[0])) {
                  highlighted = hljs.highlight(code, { language: lang[0], ignoreIllegals: true }).value;
                } else {
                  highlighted = hljs.highlightAuto(code).value;
                }
              } catch (_) { highlighted = escapeHtml(code); }
            } else {
              highlighted = escapeHtml(code);
            }
            const cls = lang ? ` class="hljs language-${lang[0]}"` : ' class="hljs"';
            return `<pre><code${cls}>${highlighted.replace(/\n$/, '')}\n</code></pre>\n`;
          };

          renderer.codespan = function (text) {
            return `<code>${orig.codespan(text).replace(/^<code>|<\/code>$/g, '')}</code>`;
          };

          renderer.paragraph = function (text) {
            const trimmed = (text || '').trim();
            if (!trimmed) return '';
            return `<p>${text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()}</p>\n`;
          };

          renderer.link = function (href, title, text) {
            const safeUrl = /^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i.test(href || '') ? href : '#';
            const t = title ? ` title="${escapeHtml(title)}"` : '';
            return `<a href="${escapeHtml(safeUrl)}"${t} target="_blank" rel="noopener noreferrer nofollow">${text}</a>`;
          };

          renderer.list = function (body, ordered, start) {
            const type = ordered ? 'ol' : 'ul';
            const startAttr = (ordered && start !== 1) ? ` start="${start}"` : '';
            return `<${type}${startAttr}>\n${body}</${type}>\n`;
          };

          renderer.listitem = function (text, task, checked) {
            const inner = (text || '').replace(/^\s*<p>\s*([\s\S]*?)\s*<\/p>\s*$/i, '$1');
            if (task) {
              const c = checked ? ' checked' : '';
              return `<li class="task-list-item"><input type="checkbox" disabled${c}> ${inner}</li>\n`;
            }
            return `<li>${inner}</li>\n`;
          };

          renderer.tablecell = function (content, flags) {
            const tag = flags.header ? 'th' : 'td';
            const align = flags.align ? ` style="text-align:${flags.align}"` : '';
            return `<${tag}${align}>${content}</${tag}>\n`;
          };

          renderer.image = function (href, title, text) {
            const t = title ? ` title="${escapeHtml(title)}"` : '';
            const alt = text ? ` alt="${escapeHtml(text)}"` : '';
            return `<img src="${escapeHtml(href || '')}"${alt}${t} loading="lazy">`;
          };

          marked.use({ renderer });
          markedReady = true;
        } catch (e) {
          console.warn('marked 初始化失败，使用降级渲染：', e);
        }
      }
    }

    function renderMarkdown(src) {
      initMarked();
      const text = String(src == null ? '' : src).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      let html;
      if (markedReady && typeof marked.parse === 'function') {
        try {
          html = marked.parse(text);
        } catch (e) {
          console.warn('marked 解析失败，使用降级渲染：', e);
          html = '<pre style="white-space:pre-wrap;word-break:break-word;">' + escapeHtml(text) + '</pre>';
        }
      } else {
        html = '<pre style="white-space:pre-wrap;word-break:break-word;">' + escapeHtml(text) + '</pre>';
      }

      if (typeof DOMPurify !== 'undefined') {
        try {
          html = DOMPurify.sanitize(html, {
            ADD_ATTR: ['target', 'rel', 'class', 'loading'],
            ALLOWED_TAGS: [
              'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'blockquote', 'br', 'button',
              'canvas', 'caption', 'cite', 'code', 'col', 'colgroup', 'datalist', 'dd', 'del', 'details', 'dfn',
              'div', 'dl', 'dt', 'em', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3',
              'h4', 'h5', 'h6', 'header', 'hr', 'i', 'iframe', 'img', 'input', 'ins', 'kbd', 'label', 'legend',
              'li', 'main', 'map', 'mark', 'menu', 'meter', 'nav', 'noscript', 'ol', 'optgroup', 'option', 'p',
              'picture', 'pre', 'progress', 'q', 's', 'samp', 'section', 'select', 'small', 'source', 'span',
              'strong', 'sub', 'summary', 'sup', 'svg', 'table', 'tbody', 'td', 'template', 'textarea', 'tfoot',
              'th', 'thead', 'time', 'tr', 'track', 'u', 'ul', 'var', 'video', 'wbr'
            ],
            ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|xmpp|tel|sms|geo):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
          });
        } catch (e) {
          console.warn('DOMPurify 净化失败，使用原输出：', e);
        }
      }
      return html;
    }



  // ============================================================
  // Loading / error / refresh
  // ============================================================
  function showLoading(text) {
    $('loadingText').textContent = text || '加载中…';
    $('loading').classList.remove('hidden');
  }
  function hideLoading() {
    $('loading').classList.add('hidden');
  }
  function showError(title, message, retry) {
    hideLoading();
    $('errTitle').textContent = title;
    $('errMsg').textContent = message;
    $('errorBox').style.display = 'block';
    $('errRetry').onclick = () => {
      $('errorBox').style.display = 'none';
      if (retry) retry();
    };
  }

  async function refreshAll(fromUser) {
    if (transition) return;
    if (multiSelection.size && !clearMultiSelection(false)) return;
    if (sideOpen && !closeSideDoc(false)) return;
    hideMenus();
    cancelLinking();
    showLoading('正在扫描星域…');
    $('errorBox').style.display = 'none';
    try {
      if (fromUser) await saveMeta();
      const data = await loadFiles();
      loadData(data, !!fromUser);
      hideLoading();
      if (fromUser) {
        showHint('已同步 · ' + nodes.length + ' 个' + (TYPE_INFO[viewNodeType()] ? TYPE_INFO[viewNodeType()].label : '节点'));
      }
    } catch (error) {
      const message = (error.message || '未知错误') +
        '\n\n请确认已运行 server.py，并通过 http://localhost:8080/ 访问。';
      showError('无法加载星图数据', message, () => refreshAll(false));
    }
  }

  // ============================================================
  // FPS / main loop
  // ============================================================
  function updateFps(dt) {
    fpsSmooth = lerp(fpsSmooth, 1 / dt, 0.06);
    fpsTimer += dt;
    if (fpsTimer >= 0.5) {
      fpsTimer = 0;
      $('fps').textContent = Math.round(fpsSmooth) + ' FPS';
    }
  }

  function tick(now) {
    requestAnimationFrame(tick);
    const dt = clamp((now - lastFrame) / 1000, 0.001, 0.05);
    lastFrame = now;
    simulate(dt);
    updateMetrics(dt);
    updateGlobe(dt);
    updateCamera(dt, now);
    updateAppearance(now);
    render(now, dt);
    updateFps(dt);
  }

  // ============================================================
  // Boot
  // ============================================================
  window.addEventListener('beforeunload', () => {
    try {
      const tree = allNodes.map(node => ({
        id: node.id, type: node.type, name: node.name, parent: node.parent,
        color: storedColor(node),
        x: node.x, y: node.y, z: node.z, md: canonicalMd(node)
      }));
      const payload = {
        version: 2,
        tree,
        links: allLinks.map(link => ({ source: link.source, target: link.target }))
      };
      navigator.sendBeacon('/api/meta', new Blob([JSON.stringify(payload)], { type: 'application/json' }));
    } catch (_) { /* ignore */ }
  });

  resizeCanvas();
  buildSwatches();
  $('autoBtn').classList.toggle('active', autoPreference);
  computeCameraFrame();
  requestAnimationFrame(tick);
  refreshAll(false);
})();
