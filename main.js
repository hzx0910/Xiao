const W = 960;
const H = 960;
const SLOT_CAP = 7;
const SLOT_GAP = 6;
const SLOT_X0 = 50;
const SLOT_Y0 = 800;
const CARD_SIZE = 120;

// --- NEW: Dynamic Kinds from icon/ folder ---
const ICON_COUNT = 16;
const KINDS = Array.from({ length: ICON_COUNT }, (_, i) => `icon${i + 1}`);
const KIND_BG_COLORS = [
  "#ffb3b3", "#ffd0a0", "#fff0a0", "#b3eac0",
  "#aad4f5", "#e0aaee", "#f9bdd0", "#a8eedc",
  "#bec8fa", "#ffc2c2", "#b3e8f5", "#d4eeaa",
  "#ffe9a0", "#ecc5f5", "#b8dcf9", "#a0e8d4"
];
const KIND_BORDER_COLORS = [
  "#e07070", "#e09050", "#c8b030", "#60b870",
  "#5090c8", "#a060c0", "#d070a0", "#40b090",
  "#6070d0", "#e07070", "#3090b0", "#80a030",
  "#c0a030", "#a050c0", "#5090c8", "#30a080"
];
// --- END NEW ---

const rand = (n) => Math.floor(Math.random() * n);
const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = rand(i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
function hashStr(s){ let h=0; for(let i=0;i<s.length;i++){ h=((h<<5)-h)+s.charCodeAt(i); h|=0;} return Math.abs(h); }
function pickBgColorByKind(kind){
  if (!kind) return "#cccccc";
  const index = parseInt(kind.replace('icon', ''), 10) - 1;
  return KIND_BG_COLORS[index % KIND_BG_COLORS.length];
}
function pickBorderColorByKind(kind){
  if (!kind) return "#999999";
  const index = parseInt(kind.replace('icon', ''), 10) - 1;
  return KIND_BORDER_COLORS[index % KIND_BORDER_COLORS.length];
}

const IMG_CACHE = {}; // { kind: {img, ok} }

function preloadImages(kinds, game) {
  kinds.forEach(k=> {
    const img = new Image();
    const url = `./icon/${k}.png`;
    img.src = url;
    IMG_CACHE[k] = { img, ok: false };
    img.onload = ()=> {
      IMG_CACHE[k].ok = true;
      if (game) game.render(); // Force a re-render when an image loads
    };
    img.onerror = () => {
      console.error(`Failed to load image: ${url}`);
      IMG_CACHE[k].ok = false;
    };
  });
}

class Card {
  constructor(id, kind, x, y, z, area) {
    this.id = id;
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = CARD_SIZE;
    this.h = CARD_SIZE;
    this.coveredBy = 0;
    this.area = area;
    this.faceUp = true;
    this.removed = false;
    this.bg = pickBgColorByKind(kind);
  }
  rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
}
class Game {
  constructor(ctx) {
    this.ctx = ctx;
    this.cards = [];
    this.blinds = [];
    this.hiddenDeck = [];
    this.slot = [];
    this.history = [];
    this.level = 1;
    this.used = { remove3: false, undo: false, shuffle: false, revive: false };
    this.shareGate = null;
    this.win = false;
    this.el = {};
    this.setsCleared = 0;
    this.fail = false;
    this.globalZ = 0; // 全局 z-index 计数器
    preloadImages(KINDS, this);
  }
  setupLevel(lv) {
    this.level = lv;
    this.cards = [];
    this.blinds = [];
    this.hiddenDeck = [];
    this.slot = [];
    this.history = [];
    this.used = { remove3: false, undo: false, shuffle: false, revive: false };
    this.setsCleared = 0;
    this.fail = false;
    this.win = false;
    this.globalZ = 0; // 重置计数器
    if (lv === 1) this.buildLevel1(); else this.buildLevel2();
    this.computeCoverage();
    this.updateStats();
    this.render();
  }
  buildLevel1() {
    const kinds = shuffle([...KINDS]).slice(0, 3); // Use 3 random kinds
    let idc = 0;
    const counts = [6, 6, 3];
    const grid = [];
    for (let i = 0; i < kinds.length; i++) for (let j = 0; j < counts[i]; j++) grid.push(kinds[i]);
    shuffle(grid);
    const cols = 5, rows = 3, sx = 160, sy = 120, gapx = CARD_SIZE + 18, gapy = CARD_SIZE + 22;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const kind = grid[r * cols + c];
        const x = sx + c * gapx;
        const y = sy + r * gapy;
        this.cards.push(new Card(`C${idc++}`, kind, x, y, this.globalZ++, "main"));
      }
    }
  }
  buildLevel2() {
    const total = 750;
    const kinds = shuffle([...KINDS]).slice(0, 8); // Use 12 random kinds
    const targetTriples = total / 3;
    const baseTriple = Math.floor(targetTriples / kinds.length); // 31
    let remainTriples = targetTriples - baseTriple * kinds.length; // 250 - 31*8 = -?
    // Correct computation:
    const triplesPerKind = new Array(kinds.length).fill(0);
    const avg = Math.floor(targetTriples / kinds.length); // 31
    for (let i = 0; i < kinds.length; i++) triplesPerKind[i] = avg;
    let rest = targetTriples - avg * kinds.length; // 250 - 31*8 = - - wait compute properly
    // Recompute safely:
    const totalTriples = Math.floor(total / 3); // 250
    const per = Math.floor(totalTriples / kinds.length); // 31
    for (let i = 0; i < kinds.length; i++) triplesPerKind[i] = per;
    let leftover = totalTriples - per * kinds.length; // 250 - 31*8 = 250 - 248 = 2
    // Distribute the remaining triples to random kinds
    const order = shuffle([...Array(kinds.length).keys()]);
    for (let i = 0; i < leftover; i++) triplesPerKind[order[i]] += 1;
    // Build deck so each kind count is multiple of 3
    const deck = [];
    for (let i = 0; i < kinds.length; i++) {
      const count = triplesPerKind[i] * 3;
      for (let j = 0; j < count; j++) deck.push(kinds[i]);
    }
    shuffle(deck);
    const layers = 220;
    const mainCount = 525;
    const blindCount = 225;
    const cell = CARD_SIZE + 8;
    const cols = 5;
    const rows = 5;
    const gridW = cols * cell;
    const gridH = rows * cell;
    const X_MIN = (W - gridW) / 2;
    const X_MAX = X_MIN + gridW;
    const Y_MIN = 50;
    const Y_MAX = Y_MIN + gridH;
    const perLayerBase = Math.floor(mainCount / layers);
    let remainMain = mainCount - perLayerBase * layers;
    const recentSets = []; // 滑动窗口，避免近邻层同格叠放
    const RECENT_WINDOW = 4;
    for (let z = 0; z < layers; z++) {
      const currSet = new Set();
      const extra = remainMain > 0 ? 1 : 0;
      if (extra) remainMain--;
      const need = perLayerBase + extra;
      const { ox, oy } = this.layerOffset(z, cell);
      const positions = this.gridPositions(X_MIN, Y_MIN, cols, rows, cell, ox, oy);
      
      // Sort positions by distance to center to favor center-out placement
      const centerX = X_MIN + gridW / 2 - CARD_SIZE / 2;
      const centerY = Y_MIN + gridH / 2 - CARD_SIZE / 2;
      positions.sort((a, b) => {
        const distA = Math.hypot(a.x - centerX, a.y - centerY);
        const distB = Math.hypot(b.x - centerX, b.y - centerY);
        return distA - distB + (Math.random() * 20 - 10);
      });

      const recentUnion = new Set();
      for (const s of recentSets) for (const k of s) recentUnion.add(k);
      let placedHere = 0;
      for (let i = 0; i < positions.length && deck.length > 0 && placedHere < need; i++) {
        const { x, y } = positions[i];
        const key = `${x},${y}`;
        if (recentUnion.has(key) || currSet.has(key)) continue;
        const kind = deck.pop();
        this.cards.push(new Card(`L2M${z}-${placedHere}`, kind, x, y, this.globalZ++, "main"));
        currSet.add(key);
        placedHere++;
      }
      // 更新滑窗
      recentSets.push(currSet);
      if (recentSets.length > RECENT_WINDOW) recentSets.shift();
    }
    for (let i = 0; i < blindCount && deck.length > 0; i++) {
      const ring = (i % 4);
      const cidx = Math.floor(i / 4) % cols;
      const ridx = Math.floor(i / (4 * cols)) % rows;
      const { ox, oy } = this.layerOffset(layers + i, cell);
      const xs = X_MIN + ox, ys = Y_MIN + oy;
      let x, y;
      if (ring === 0) { x = xs + cidx * cell; y = ys; }
      else if (ring === 1) { x = xs + (cols - 1) * cell; y = ys + ridx * cell; }
      else if (ring === 2) { x = xs + cidx * cell; y = ys + (rows - 1) * cell; }
      else { x = xs; y = ys + ridx * cell; }
      if (x + CARD_SIZE > X_MAX || y + CARD_SIZE > Y_MAX) continue;
      // 与已放置卡片避让
      let tries = 0;
      while (tries < 6 && this.cards.some(cc => (cc.area === "main" || cc.area === "blind") && cc.x === x && cc.y === y)) {
        if (tries % 2 === 0 && x + cell / 2 + CARD_SIZE <= X_MAX) x += cell / 2;
        else if (y + cell / 2 + CARD_SIZE <= Y_MAX) y += cell / 2;
        else break;
        tries++;
      }
      const kind = deck.pop();
      const c = new Card(`L2B${i}`, kind, x, y, this.globalZ++, "blind");
      c.faceUp = true;
      this.blinds.push(c);
    }
    this.hiddenDeck = deck.map((k, i) => new Card(`H${i}`, k, -1000, -1000, this.globalZ++, "hidden"));
  }
  layerOffset(z, cell) {
    // 轴向在相邻层之间交替，位移幅度在 1/2、1/3、2/3 之间循环
    const axis = z % 2; // 0: x轴偏移, 1: y轴偏移
    const mode = z % 3; // 0: 1/2格, 1: 1/3格, 2: 2/3格
    const amounts = [cell / 2, cell / 3, (2 * cell) / 3];
    const d = amounts[mode];
    if (axis === 0) return { ox: d, oy: 0 };
    return { ox: 0, oy: d };
  }
  gridPositions(x0, y0, cols, rows, cell, ox, oy) {
    const res = [];
    const X_MAX = x0 + cols * cell;
    const Y_MAX = y0 + rows * cell;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = x0 + ox + c * cell;
        const y = y0 + oy + r * cell;
        if (x + CARD_SIZE <= X_MAX && y + CARD_SIZE <= Y_MAX) res.push({ x, y });
      }
    }
    return res;
  }
  computeCoverage() {
    const all = [...this.cards, ...this.blinds].filter(c => !c.removed && (c.area === "main" || c.area === "blind"));
    all.sort((a, b) => a.z - b.z);
    for (const c of all) c.coveredBy = 0;
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 0 && oy > 0 && (ox * oy) / (a.w * a.h) >= 0.1) a.coveredBy++;
      }
    }
  }
  clickAt(x, y) {
    if (this.fail || this.win) return;
    const all = [...this.cards, ...this.blinds].filter(c => !c.removed && (c.area === "main" || c.area === "blind"));
    
    // 获取点击位置下的所有卡片
    let hits = all.filter(c => {
      const r = c.rect();
      return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    });
    
    if (hits.length === 0) return;
    
    // 过滤出未被遮挡的卡片 (coveredBy === 0)
    hits = hits.filter(c => c.coveredBy === 0);
    
    if (hits.length === 0) return;
    
    // 按 z-index 降序排列，取最上层
    hits.sort((a, b) => b.z - a.z);
    
    const cand = hits[0];
    
    if (cand.area === "blind") return this.takeBlind(cand);
    if (cand.area === "main") return this.takeMain(cand);
  }
  takeBlind(c) {
    if (!c.faceUp) c.faceUp = true;
    this.history.push({ t: "take", card: c, from: "blind" });
    this.slotPush(c);
  }
  takeMain(c) {
    this.history.push({ t: "take", card: c, from: "main", prev: { x: c.x, y: c.y, z: c.z } });
    this.slotPush(c);
  }
  slotPush(c) {
    c.area = "slot";

    // Find the last index of a card with the same kind
    let lastSameKindIndex = -1;
    for (let i = this.slot.length - 1; i >= 0; i--) {
      if (this.slot[i].kind === c.kind) {
        lastSameKindIndex = i;
        break;
      }
    }

    // Insert after the last same-kind card, or at the end
    if (lastSameKindIndex !== -1) {
      this.slot.splice(lastSameKindIndex + 1, 0, c);
    } else {
      this.slot.push(c);
    }

    this.layoutSlot();
    this.computeCoverage();
    if (this.slot.length > SLOT_CAP) {
      if (!this.used.revive) {
        this.fail = true;
        this.toast("槽位已满，点击复活可继续");
      } else {
        this.endFail();
      }
      this.render();
      return;
    }
    const triples = this.findTriplesInSlot();
    if (triples.length > 0) {
      for (const idxs of triples) {
        const group = idxs.map(i => this.slot[i]);
        for (const card of group) card.removed = true;
        const remain = [];
        for (let i = 0; i < this.slot.length; i++) if (!idxs.includes(i)) remain.push(this.slot[i]);
        this.slot = remain;
        this.layoutSlot();
        this.setsCleared++;
        this.updateStats();
        if (this.level === 2) this.refillAfterClear();
        this.checkWin();
      }
    }
    this.render();
  }
  findTriplesInSlot() {
    const res = [];
    const map = new Map();
    for (let i = 0; i < this.slot.length; i++) {
      const k = this.slot[i].kind;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(i);
    }
    for (const [k, arr] of map.entries()) {
      if (arr.length >= 3) res.push(arr.slice(0, 3));
    }
    return res;
  }
  refillAfterClear() {
    const n = 3;
    for (let i = 0; i < n; i++) {
      if (this.hiddenDeck.length === 0) break;
      const c = this.hiddenDeck.pop();
      c.area = "main";
      const topZ = this.cards.reduce((m, x) => Math.max(m, x.z), 0);
      c.z = topZ + 1 + i;
      const cell = CARD_SIZE + 8;
      const cols = 5;
      const rows = 5;
      const gridW = cols * cell;
      const gridH = rows * cell;
      const X_MIN = (W - gridW) / 2;
      const X_MAX = X_MIN + gridW;
      const Y_MIN = 50;
      const Y_MAX = Y_MIN + gridH;
      const { ox, oy } = this.layerOffset(c.z, cell);
      const positions = this.gridPositions(X_MIN, Y_MIN, cols, rows, cell, ox, oy);
      const occ = new Set(this.cards.filter(cc => !cc.removed && cc.area === "main").map(cc => `${cc.x},${cc.y}`));
      let placed = false;
      for (let k = 0; k < positions.length; k++) {
        const pos = positions[(rand(positions.length) + k) % positions.length];
        const key = `${pos.x},${pos.y}`;
        if (!occ.has(key)) { c.x = pos.x; c.y = pos.y; occ.add(key); placed = true; break; }
      }
      if (!placed) { const pos = positions[rand(positions.length)]; c.x = pos.x; c.y = pos.y; }
      c.z = this.globalZ++;
      c.faceUp = true;
      c.removed = false;
      this.cards.push(c);
    }
    this.computeCoverage();
    this.updateStats();
    this.checkWin();
  }
  useRemove3() {
    if (this.used.remove3) return false;
    if (!this.ensureShareGate("remove3")) return false;
    const take = this.slot.slice(0, 3);
    if (take.length < 3) { this.toast("槽位不足3张"); return false; }
    for (const c of take) c.removed = true;
    this.slot = this.slot.slice(3);
    this.layoutSlot();
    this.used.remove3 = true;
    this.render();
    return true;
  }
  useUndo() {
    if (this.used.undo) return false;
    if (!this.ensureShareGate("undo")) return false;
    for (let i = this.history.length - 1; i >= 0; i--) {
      const h = this.history[i];
      if (h.t === "take") {
        const idx = this.slot.lastIndexOf(h.card);
        if (idx >= 0) this.slot.splice(idx, 1);
        h.card.removed = false;
        if (h.from === "blind") {
          h.card.area = "blind";
          h.card.faceUp = false;
        } else {
          h.card.area = "main";
          h.card.x = h.prev.x; h.card.y = h.prev.y; h.card.z = h.prev.z;
        }
        this.history.splice(i, 1);
        break;
      }
    }
    this.computeCoverage();
    this.used.undo = true;
    this.layoutSlot();
    this.render();
    return true;
  }
  useShuffle() {
    if (this.used.shuffle) return false;
    if (!this.ensureShareGate("shuffle")) return false;

    const pool = this.cards.filter(c => !c.removed && c.area === "main");
    shuffle(pool);

    // --- Start: Grid-based shuffle layout (from buildLevel2) ---
    const layers = Math.max(1, Math.floor(pool.length / 4)); // Approximate layers
    const cell = CARD_SIZE + 8;
    const cols = 5;
    const rows = 5;
    const gridW = cols * cell;
    const gridH = rows * cell;
    const X_MIN = (W - gridW) / 2;
    const X_MAX = X_MIN + gridW;
    const Y_MIN = 50;
    const Y_MAX = Y_MIN + gridH;

    const perLayerBase = Math.floor(pool.length / layers);
    let remainMain = pool.length - perLayerBase * layers;
    const recentSets = [];
    const RECENT_WINDOW = 4;

    let cardIndex = 0;

    for (let z = 0; z < layers && cardIndex < pool.length; z++) {
      const currSet = new Set();
      const extra = remainMain > 0 ? 1 : 0;
      if (extra) remainMain--;
      const need = perLayerBase + extra;
      const { ox, oy } = this.layerOffset(z, cell);
      const positions = this.gridPositions(X_MIN, Y_MIN, cols, rows, cell, ox, oy);
      
      // Sort positions by distance to center to favor center-out placement
      const centerX = X_MIN + gridW / 2 - CARD_SIZE / 2;
      const centerY = Y_MIN + gridH / 2 - CARD_SIZE / 2;
      positions.sort((a, b) => {
        const distA = Math.hypot(a.x - centerX, a.y - centerY);
        const distB = Math.hypot(b.x - centerX, b.y - centerY);
        return distA - distB + (Math.random() * 20 - 10); // Add slight randomness
      });

      const recentUnion = new Set();
      for (const s of recentSets) for (const k of s) recentUnion.add(k);

      let placedHere = 0;
      for (let i = 0; i < positions.length && cardIndex < pool.length && placedHere < need; i++) {
        const { x, y } = positions[i];
        const key = `${x},${y}`;
        if (recentUnion.has(key) || currSet.has(key)) continue;

        const c = pool[cardIndex++];
        c.x = x;
        c.y = y;
        c.z = this.globalZ++;
        currSet.add(key);
        placedHere++;
      }
      recentSets.push(currSet);
      if (recentSets.length > RECENT_WINDOW) recentSets.shift();
    }
    // --- End: Grid-based shuffle layout ---

    this.computeCoverage();
    this.used.shuffle = true;
    this.render();
    return true;
  }
  useRevive() {
    if (this.used.revive) return false;
    if (!this.fail) { this.toast("复活仅在失败时可用"); return false; }
    if (!this.ensureShareGate("revive")) return false;
    this.slot = [];
    this.fail = false;
    this.used.revive = true;
    this.render();
    return true;
  }
  endFail() {
    this.toast("挑战失败");
  }
  updateStats() {
    // Stat elements removed from DOM
  }
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
    for (let i = 0; i < SLOT_CAP; i++) {
      ctx.beginPath();
      ctx.roundRect(SLOT_X0 + i * (CARD_SIZE + SLOT_GAP), SLOT_Y0, CARD_SIZE, CARD_SIZE, 8);
      ctx.fill();
    }
    const drawCard = (c) => {
      const face = c.faceUp || c.area !== "blind";
      // base with rounded corners
      const base = face ? c.bg : "#9ca3af";
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.roundRect(Math.floor(c.x)+0.5, Math.floor(c.y)+0.5, c.w, c.h, 8);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 6;
      ctx.stroke();
      // content: per-kind image
      if (face) {
        if (IMG_CACHE[c.kind] && IMG_CACHE[c.kind].ok) {
          const cache = IMG_CACHE[c.kind];
          ctx.save();
          ctx.imageSmoothingEnabled = true;
          const pad = 6;
          const iw = cache.img.naturalWidth || 100;
          const ih = cache.img.naturalHeight || 100;
          const scale = Math.min((c.w - pad*2)/iw, (c.h - pad*2)/ih);
          const dw = Math.floor(iw * scale);
          const dh = Math.floor(ih * scale);
          const dx = Math.floor(c.x) + Math.floor((c.w - dw)/2);
          const dy = Math.floor(c.y) + Math.floor((c.h - dh)/2);
          ctx.beginPath();
          ctx.roundRect(Math.floor(c.x)+1, Math.floor(c.y)+1, c.w-2, c.h-2, 8);
          ctx.clip();
          ctx.drawImage(cache.img, dx, dy, dw, dh);
          ctx.restore();
        } else {
          // Fallback: draw a simple dot if image is not loaded
          ctx.fillStyle = "#ff6a00";
          ctx.beginPath();
          ctx.arc(c.x + c.w/2, c.y + c.h/2, 5, 0, Math.PI*2);
          ctx.fill();
        }
      } else {
        drawBackPattern(ctx, c.x, c.y, c.w);
      }
      if (c.coveredBy > 0) {
        // 只有完全被遮挡时才显示蒙层（虽然此时不可见，但保留逻辑一致性）
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.beginPath();
        ctx.roundRect(Math.floor(c.x)+0.5, Math.floor(c.y)+0.5, c.w, c.h, 8);
        ctx.fill();
        ctx.restore();
      }
    };
    const all = [...this.cards, ...this.blinds].filter(c => !c.removed && c.area !== "slot");
    all.sort((a, b) => a.z - b.z);
    const visible = all.filter(c => c.coveredBy <= 9);
    for (const c of visible) drawCard(c);
    for (const c of this.slot) drawCard(c);
    
    if (this.fail) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, 0, W, H);
      
      ctx.fillStyle = "#fff";
      ctx.font = "bold 32px system-ui";
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 10;
      ctx.fillText("挑战失败", W / 2, H / 2 - 20);
      
      ctx.font = "18px system-ui";
      ctx.shadowBlur = 0;
      ctx.fillText("使用复活道具或重新开始", W / 2, H / 2 + 30);
      ctx.restore();
    }
    
    if (this.win) {
      ctx.fillStyle = "rgba(0,0,0,.45)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#fff";
      ctx.font = "26px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("通关 · 米粉极客", W / 2, H / 2);
    }
  }
  ensureShareGate(tool) {
    if (this.shareGate) return false;
    const used = this.used[tool];
    if (used) return false;
    const modal = document.getElementById("shareModal");
    modal.classList.remove("hidden");
    this.shareGate = { tool };
    return true;
  }
  confirmShare(ok) {
    if (!this.shareGate) return;
    const tool = this.shareGate.tool;
    const modal = document.getElementById("shareModal");
    modal.classList.add("hidden");
    this.shareGate = null;
    if (!ok) return;
    if (tool === "remove3") { this.used.remove3 = false; this.realUseRemove3(); }
    if (tool === "undo") { this.used.undo = false; this.realUseUndo(); }
    if (tool === "shuffle") { this.used.shuffle = false; this.realUseShuffle(); }
    if (tool === "revive") { this.used.revive = false; this.realUseRevive(); }
  }
  realUseRemove3() { this.used.remove3 = true; const take = this.slot.slice(0, 3); if (take.length < 3) { this.toast("槽位不足3张"); return; } for (const c of take) c.removed = true; this.slot = this.slot.slice(3); this.render(); }
  realUseUndo() { this.used.undo = true; for (let i = this.history.length - 1; i >= 0; i--) { const h = this.history[i]; if (h.t === "take") { const idx = this.slot.lastIndexOf(h.card); if (idx >= 0) this.slot.splice(idx, 1); h.card.removed = false; if (h.from === "blind") { h.card.area = "blind"; h.card.faceUp = false; } else { h.card.area = "main"; h.card.x = h.prev.x; h.card.y = h.prev.y; h.card.z = h.prev.z; } this.history.splice(i, 1); break; } } this.computeCoverage(); this.render(); }
  realUseShuffle() { this.used.shuffle = true; const pool = this.cards.filter(c => !c.removed && c.area === "main"); shuffle(pool); for (let i = 0; i < pool.length; i++) { const c = pool[i]; const ang = (i * 0.3) % (Math.PI * 2); const r = 70 + (i % 40) * 2; c.x = 260 + Math.cos(ang) * r; c.y = 210 + Math.sin(ang) * r; c.z = 100 + i; } this.computeCoverage(); this.render(); }
  realUseRevive() { this.used.revive = true; if (!this.fail) return; this.slot = []; this.fail = false; this.render(); }
  toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 1500);
  }
  onWin() {
    this.toast("通关成功！");
    // 如果是第一关，延迟后自动开始第二关
    if (this.level === 1) {
      setTimeout(() => {
        this.setupLevel(2);
        this.toast("第二关开始！");
      }, 1500);
    }
  }
  checkWin() {
    if (this.win) return;
    const left = [...this.cards, ...this.blinds, ...this.hiddenDeck].filter(c => !c.removed && c.area !== "slot");
    if (left.length === 0 && this.slot.length === 0) {
      this.win = true;
      this.onWin();
      this.toast("通关");
    }
  }
}
function setup() {
  const cvs = document.getElementById("game");
  const ctx = cvs.getContext("2d");
  const g = new Game(ctx);
  const handlePointer = (e) => {
    const r = cvs.getBoundingClientRect();
    const x = (e.clientX - r.left) * (cvs.width / r.width);
    const y = (e.clientY - r.top) * (cvs.height / r.height);
    g.clickAt(x, y);
  };
  cvs.addEventListener("pointerdown", handlePointer, { passive: true });
  document.getElementById("btnStart").addEventListener("click", () => {
    const lv = parseInt(document.getElementById("levelSelect").value, 10);
    g.setupLevel(lv);
  });
  document.getElementById("tool-remove3").addEventListener("click", () => {
    if (g.used.remove3) return;
    if (!g.ensureShareGate("remove3")) return;
  });
  document.getElementById("tool-undo").addEventListener("click", () => {
    if (g.used.undo) return;
    if (!g.ensureShareGate("undo")) return;
  });
  document.getElementById("tool-shuffle").addEventListener("click", () => {
    if (g.used.shuffle) return;
    if (!g.ensureShareGate("shuffle")) return;
  });
  document.getElementById("tool-revive").addEventListener("click", () => {
    if (g.used.revive) return;
    if (!g.ensureShareGate("revive")) return;
  });
  document.getElementById("btnShareConfirm").addEventListener("click", () => g.confirmShare(true));
  document.getElementById("btnShareCancel").addEventListener("click", () => g.confirmShare(false));

  g.setupLevel(1);
  function raf() { g.render(); requestAnimationFrame(raf); }
  requestAnimationFrame(raf);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup); else setup();

function drawBackPattern(ctx, x, y, s) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, s, s);
  ctx.clip();
  ctx.fillStyle = "#6b7280";
  ctx.imageSmoothingEnabled = false;
  const step = 6;
  for (let yy = 0; yy < s; yy += step) ctx.fillRect(x + ((yy/step)%2)*step, y + yy, step, 2);
  ctx.restore();
}


// Align all cards in slot to contiguous grid positions (left-compact)
Game.prototype.layoutSlot = function() {
  for (let i = 0; i < this.slot.length; i++) {
    const c = this.slot[i];
    c.x = SLOT_X0 + i * (CARD_SIZE + SLOT_GAP);
    c.y = SLOT_Y0;
    c.z = 999 + i;
  }
};
