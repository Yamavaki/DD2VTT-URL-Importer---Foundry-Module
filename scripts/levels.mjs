// Lógica pura dos andares (Scene Levels do V14): sem acesso ao Foundry, para dar para testar.

/** Andares em ordem de altura (de baixo para cima). Aceita a coleção do Foundry ou um array. */
export function levelsByHeight(levels) {
  const list = Array.isArray(levels) ? [...levels] : [...(levels?.contents ?? levels ?? [])];
  return list.sort((a, b) => (bottomOf(a) - bottomOf(b)) || ((a.sort ?? 0) - (b.sort ?? 0)));
}

export const bottomOf = (level) => Number(level?.elevation?.bottom ?? 0) || 0;
export function topOf(level, fallbackHeight = 3) {
  const raw = level?.elevation?.top;
  const t = raw === null || raw === undefined || raw === "" ? NaN : Number(raw);
  return Number.isFinite(t) && t > bottomOf(level) ? t : bottomOf(level) + fallbackHeight;
}

/** Ids dos andares de um objeto (vazio = aparece em todos). */
export function levelIdsOf(doc) {
  const v = doc?.levels ?? doc?._source?.levels ?? [];
  return v instanceof Set ? [...v] : Array.isArray(v) ? [...v] : [];
}

/**
 * Novo valor de `levels` ao clicar num andar do menu.
 *  - mode "move": vai só para esse andar;
 *  - mode "toggle": acrescenta/tira esse andar (sem deixar vazio por engano — vazio vira "todos");
 *  - levelId null: todos os andares.
 */
export function nextLevels(current, levelId, mode = "move", addAll = null) {
  if (!levelId) return [];
  if (mode !== "toggle") return [levelId];
  const set = new Set(current ?? []);
  // addAll: decisão tomada para o grupo todo (true = acrescentar, false = tirar).
  const add = addAll ?? !set.has(levelId);
  if (add) set.add(levelId);
  else if (set.size > 1) set.delete(levelId); // tirar o último andar deixaria o objeto em TODOS: não faz
  return [...set];
}

/** Faixa de altura de uma escada/elevador que liga estes andares (mesma regra de passageRegionData). */
export function passageElevation(levels) {
  const chosen = levelsByHeight(levels);
  if (chosen.length < 2) return null;
  return { bottom: bottomOf(chosen[0]), top: bottomOf(chosen[chosen.length - 1]), topInclusive: true };
}

/** Retângulo normalizado (aceita arrasto em qualquer direção) e encaixado na grade. */
export function snapRect(a, b, { size = 100, offsetX = 0, offsetY = 0, snap = true } = {}) {
  let x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y), x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  if (snap && size > 0) {
    const fl = (v, o) => Math.floor((v - o) / size) * size + o;
    const ce = (v, o) => Math.ceil((v - o) / size) * size + o;
    x0 = fl(x0, offsetX); y0 = fl(y0, offsetY); x1 = ce(x1, offsetX); y1 = ce(y1, offsetY);
    if (x1 === x0) x1 += size;
    if (y1 === y0) y1 += size;
  }
  return { x: Math.round(x0), y: Math.round(y0), width: Math.round(x1 - x0), height: Math.round(y1 - y0) };
}

/**
 * Dados de uma Região "Trocar de andar" ligando os andares escolhidos.
 * Como no V14: a região fica na faixa de altura do andar de baixo até o chão do mais alto,
 * com o topo incluído (assim o token do andar de cima também está "dentro" e consegue descer),
 * e marcada em todos os andares ligados (aparece em todos).
 */
export function passageRegionData({ rect, rects, levels, kind = "stairs", behaviorType = "changeLevel", name, color, visibility, hidden = false, moduleId = "dd2vtt-url-importer" }) {
  const chosen = levelsByHeight(levels);
  if (chosen.length < 2) throw new Error("Escolha pelo menos dois andares para ligar.");
  const bottom = bottomOf(chosen[0]);
  const top = bottomOf(chosen[chosen.length - 1]);
  const label = kind === "elevator" ? "Elevador" : "Escada";
  return {
    name: name || `${label}: ${chosen.map((l) => l.name || "Andar").join(" ↔ ")}`,
    color: color ?? (kind === "elevator" ? "#a17fc9" : "#cca162"),
    shapes: (rects ?? [rect]).map((r) => ({ type: "rectangle", x: r.x, y: r.y, width: r.width, height: r.height, rotation: 0, hole: false })),
    elevation: { bottom, top, topInclusive: true },
    levels: chosen.map((l) => l.id ?? l._id),
    ...(visibility !== undefined ? { visibility } : {}),
    hidden,
    behaviors: [{ name: label, type: behaviorType }],
    flags: { [moduleId]: { passage: kind } }
  };
}

/** Próximo andar acima (ou null). */
export function levelAbove(levels, levelId) {
  const sorted = levelsByHeight(levels);
  const i = sorted.findIndex((l) => (l.id ?? l._id) === levelId);
  return i >= 0 && i < sorted.length - 1 ? sorted[i + 1] : null;
}

/** Elevação sugerida para um andar novo: em cima do mais alto. */
export function nextFloorBottom(levels, floorHeight = 3) {
  const sorted = levelsByHeight(levels);
  if (!sorted.length) return 0;
  return topOf(sorted[sorted.length - 1], floorHeight);
}

/* ------------------------------------------------------------------ */
/* Áreas feitas de quadrados da grade (editor de escadas/elevadores)   */
/* ------------------------------------------------------------------ */

export const cellKey = (cx, cy) => `${cx},${cy}`;
export const parseCell = (k) => k.split(",").map(Number);

/** Quadrados cobertos por um pincel de n×n com o quadrado (cx, cy) no canto de cima/esquerda do centro. */
export function brushCells(cx, cy, n = 1) {
  const out = [];
  const o = Math.floor((n - 1) / 2);
  for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) out.push(cellKey(cx - o + dx, cy - o + dy));
  return out;
}

/** Quadrados de um retângulo entre dois quadrados (inclusive). */
export function rectCells(a, b) {
  const out = [];
  const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
  const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(cellKey(x, y));
  return out;
}

/**
 * Junta os quadrados em poucos retângulos (em quadrados): primeiro faixas em cada linha,
 * depois faixas iguais em linhas seguidas viram um retângulo só.
 */
export function cellsToRects(cells) {
  const rows = new Map();
  for (const k of cells) {
    const [x, y] = parseCell(k);
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push(x);
  }
  const runs = [];
  for (const [y, xs] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    xs.sort((a, b) => a - b);
    let start = xs[0], prev = xs[0];
    for (let i = 1; i <= xs.length; i++) {
      if (i < xs.length && xs[i] === prev + 1) { prev = xs[i]; continue; }
      runs.push({ x: start, y, w: prev - start + 1 });
      if (i < xs.length) { start = prev = xs[i]; }
    }
  }
  const open = new Map(); // "x,w" -> retângulo em aberto
  const out = [];
  let lastY = null;
  for (const r of runs) {
    if (lastY !== null && r.y !== lastY) {
      for (const [k, rect] of open) if (rect.y + rect.h < r.y) { out.push(rect); open.delete(k); }
    }
    const k = `${r.x},${r.w}`;
    const cur = open.get(k);
    if (cur && cur.y + cur.h === r.y) cur.h++;
    else { if (cur) out.push(cur); open.set(k, { x: r.x, y: r.y, w: r.w, h: 1 }); }
    lastY = r.y;
  }
  out.push(...open.values());
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Retângulos em quadrados → retângulos em pixels da cena. */
export const cellRectsToPixels = (rects, size, ox = 0, oy = 0) =>
  rects.map((r) => ({ x: ox + r.x * size, y: oy + r.y * size, width: r.w * size, height: r.h * size }));

function pointInPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Quadrados (pelo centro) cobertos pelas formas de uma região. Furos tiram quadrados. */
export function shapesToCells(shapes, size, ox = 0, oy = 0) {
  const cells = new Set();
  const ordered = [...(shapes ?? [])].sort((a, b) => Number(!!a.hole) - Number(!!b.hole));
  for (const s of ordered) {
    let test, bx0, by0, bx1, by1;
    if (s.type === "rectangle") {
      bx0 = s.x; by0 = s.y; bx1 = s.x + s.width; by1 = s.y + s.height;
      test = (x, y) => x > bx0 && x < bx1 && y > by0 && y < by1;
    } else if (s.type === "ellipse") {
      bx0 = s.x - s.radiusX; by0 = s.y - s.radiusY; bx1 = s.x + s.radiusX; by1 = s.y + s.radiusY;
      test = (x, y) => ((x - s.x) / s.radiusX) ** 2 + ((y - s.y) / s.radiusY) ** 2 < 1;
    } else if (s.type === "polygon" && Array.isArray(s.points)) {
      const xs = s.points.filter((_, i) => i % 2 === 0), ys = s.points.filter((_, i) => i % 2 === 1);
      bx0 = Math.min(...xs); by0 = Math.min(...ys); bx1 = Math.max(...xs); by1 = Math.max(...ys);
      test = (x, y) => pointInPolygon(x, y, s.points);
    } else continue;
    for (let cy = Math.floor((by0 - oy) / size); cy * size + oy < by1; cy++) {
      for (let cx = Math.floor((bx0 - ox) / size); cx * size + ox < bx1; cx++) {
        if (!test(ox + (cx + 0.5) * size, oy + (cy + 0.5) * size)) continue;
        if (s.hole) cells.delete(cellKey(cx, cy)); else cells.add(cellKey(cx, cy));
      }
    }
  }
  return cells;
}

/* ------------------------------------------------------------------ */
/* Quem vê quem entre os andares + andares de cima "em fade"           */
/* ------------------------------------------------------------------ */

const idOf = (l) => l?.id ?? l?._id;
const setOf = (v) => new Set(v instanceof Set ? v : Array.isArray(v) ? v : []);

/**
 * Lista de visão de cada andar a partir de opções simples.
 *  perLevel: { [id]: { below: bool, above: bool } } (o que faltar usa os padrões)
 *  → Map id → [ids que ele vê]
 */
export function sightLists(levels, { seeBelow = true, seeAbove = true, perLevel = {} } = {}) {
  const sorted = levelsByHeight(levels);
  const out = new Map();
  sorted.forEach((l, i) => {
    const o = perLevel[idOf(l)] ?? {};
    const below = o.below ?? seeBelow, above = o.above ?? seeAbove;
    const ids = [];
    if (below) ids.push(...sorted.slice(0, i).map(idOf));
    if (above) ids.push(...sorted.slice(i + 1).map(idOf));
    out.set(idOf(l), ids);
  });
  return out;
}

/** Andares que este andar vê, separados em de baixo / de cima. */
export function seenBy(levels, level) {
  const sorted = levelsByHeight(levels);
  const vis = setOf(level?.visibility?.levels);
  const b = bottomOf(level);
  const others = sorted.filter((o) => idOf(o) !== idOf(level));
  return {
    below: others.filter((o) => bottomOf(o) < b && vis.has(idOf(o))).map(idOf),
    above: others.filter((o) => bottomOf(o) > b && vis.has(idOf(o))).map(idOf),
    lower: others.filter((o) => bottomOf(o) < b).map(idOf),
    upper: others.filter((o) => bottomOf(o) > b).map(idOf)
  };
}

/** Liga/desliga um andar na lista de visão (devolve a lista nova). */
export function toggleSight(current, id, on) {
  const s = setOf(current);
  if (on) s.add(id); else s.delete(id);
  return [...s];
}

/** Tira um andar de todas as listas de visão (ao apagar o andar). → [{ _id, "visibility.levels" }] */
export function dropFromSight(levels, goneId) {
  return levelsByHeight(levels)
    .filter((l) => idOf(l) !== goneId && setOf(l.visibility?.levels).has(goneId))
    .map((l) => ({ _id: idOf(l), "visibility.levels": [...setOf(l.visibility.levels)].filter((x) => x !== goneId) }));
}

/** URL da imagem de um andar (fica na flag do módulo; o fundo do andar só é usado no andar mais baixo). */
export const levelSrc = (level, moduleId = "dd2vtt-url-importer") =>
  level?.flags?.[moduleId]?.src || level?.background?.src || "";

/**
 * Volta as cenas da 1.9.1 (imagem do andar de cima num tile, fundo vazio) para o fundo do próprio andar.
 * → [{ _id, "background.src" }]
 */
export function restoreBackgroundsPlan(levels, moduleId = "dd2vtt-url-importer") {
  return levelsByHeight(levels)
    .filter((l) => !(l.background?.src) && l.flags?.[moduleId]?.src)
    .map((l) => ({ _id: idOf(l), "background.src": l.flags[moduleId].src }));
}

/* ------------------------------------------------------------------ */
/* Fade do andar de cima (desenhado pelo próprio Foundry como fundo)    */
/* ------------------------------------------------------------------ */

/** Transparência nova, andando suave até o alvo (dt em segundos). */
export function stepAlpha(current, target, dt, speed = 8) {
  const k = Math.min(1, Math.max(0, dt * speed));
  const v = current + (target - current) * k;
  return Math.abs(v - target) < 0.005 ? target : v;
}

/**
 * Máscara de transparência (alpha por pixel, reduzida) → função "tem chão aqui?" em coordenadas da cena.
 * mask: { w, h, data: Uint8ClampedArray|Uint8Array (1 byte por pixel = alpha) }; rect: retângulo do mapa na cena.
 */
export function opaqueTester(mask, rect, threshold = 40) {
  if (!mask) return (x, y) => x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height;
  return (x, y) => {
    const u = (x - rect.x) / rect.width, v = (y - rect.y) / rect.height;
    if (!(u >= 0 && v >= 0 && u < 1 && v < 1)) return false;
    const px = Math.min(mask.w - 1, Math.floor(u * mask.w)), py = Math.min(mask.h - 1, Math.floor(v * mask.h));
    return mask.data[py * mask.w + px] > threshold;
  };
}

/** Deve sumir? mode: "both" | "token" | "mouse" | "off". points: centros dos tokens que estão embaixo. */
export function shouldFade({ mode = "both", tokenPoints = [], mouse = null, isOpaque }) {
  if (mode === "off") return false;
  if ((mode === "both" || mode === "token") && tokenPoints.some((p) => isOpaque(p.x, p.y))) return true;
  if ((mode === "both" || mode === "mouse") && mouse && isOpaque(mouse.x, mouse.y)) return true;
  return false;
}

/** Normaliza um endereço de imagem para comparar (sem origem, decodificado, sem ?query). */
export function sameSrc(a, b) {
  const n = (s) => {
    if (!s) return "";
    let t = String(s);
    try { t = decodeURIComponent(t); } catch { /* deixa */ }
    t = t.replace(/^[a-z]+:\/\/[^/]+\//i, "").replace(/^\/+/, "").split("?")[0];
    return t;
  };
  const x = n(a), y = n(b);
  return !!x && !!y && (x === y || x.endsWith("/" + y) || y.endsWith("/" + x));
}
