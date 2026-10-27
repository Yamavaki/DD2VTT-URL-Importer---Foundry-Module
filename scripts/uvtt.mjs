/**
 * Lógica pura de conversão Universal VTT (.dd2vtt / .uvtt) -> dados do Foundry.
 * Não depende de nenhum global do Foundry, para poder ser testada fora dele.
 */

/** Id do arquivo num link do Google Drive (página, uc?id=, open?id=, lh3/d/, thumbnail?id=), ou null. */
export function driveId(url) {
  url = String(url ?? "").trim();
  const m = url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/)
    ?? url.match(/drive\.google\.com\/.*[?&]id=([^&#]+)/)
    ?? url.match(/googleusercontent\.com\/d\/([^/?#=]+)/);
  return m ? m[1] : null;
}

/**
 * Endereços a tentar, em ordem, para abrir a imagem. O Google Drive tem vários jeitos de entregar
 * um arquivo público e nenhum é garantido: tenta o tamanho original primeiro.
 */
export function imageUrlCandidates(url) {
  const id = driveId(url);
  if (id) {
    return [
      `https://lh3.googleusercontent.com/d/${id}=s0`,
      `https://lh3.googleusercontent.com/d/${id}`,
      `https://drive.google.com/thumbnail?id=${id}&sz=s16383`
    ];
  }
  return [normalizeUrl(url)];
}

/** Converte links comuns (Google Drive, Dropbox, página do Imgur) em link direto de imagem. */
export function normalizeUrl(url) {
  url = String(url ?? "").trim();
  const drive = driveId(url);
  if (drive) return `https://lh3.googleusercontent.com/d/${drive}=s0`;
  if (/dropbox\.com/.test(url)) {
    return url.replace("www.dropbox.com", "dl.dropboxusercontent.com").replace(/([?&])dl=0&?/, "$1").replace(/[?&]$/, "");
  }
  const imgur = url.match(/^https?:\/\/(?:www\.)?imgur\.com\/([A-Za-z0-9]+)$/);
  if (imgur) return `https://i.imgur.com/${imgur[1]}.png`;
  return url;
}

/** Cor do UVTT ("aarrggbb", "rrggbb" ou com #) -> "#rrggbb". */
export function parseColor(c) {
  if (!c) return "#ffffff";
  c = String(c).replace("#", "");
  if (c.length === 8) c = c.slice(2); // Dungeondraft exporta aarrggbb
  return /^[0-9a-f]{6}$/i.test(c) ? `#${c.toLowerCase()}` : "#ffffff";
}

/**
 * Calcula o tamanho de grade da cena a partir do tamanho REAL da imagem hospedada.
 * Isso é o que faz a reescala automática: se a imagem foi reduzida pelo site,
 * a grade fica menor e todas as coordenadas acompanham.
 */
export function computeGrid(uvtt, imageSize, minGrid = 50) {
  const gx = uvtt.resolution.map_size.x;
  const gy = uvtt.resolution.map_size.y;
  const raw = imageSize.w / gx;
  const gridSize = Math.max(minGrid, Math.round(raw));
  const ratioImage = imageSize.w / imageSize.h;
  const ratioMap = gx / gy;
  return {
    gridSize,
    width: gx * gridSize,
    height: gy * gridSize,
    originalPpg: uvtt.resolution.pixels_per_grid,
    scale: raw / uvtt.resolution.pixels_per_grid,
    aspectMismatch: Math.abs(ratioImage / ratioMap - 1) > 0.02
  };
}

/* Constantes do Foundry (CONST.*), repetidas aqui para o arquivo não depender do Foundry. */
const SENSE = { NONE: 0, LIMITED: 10, NORMAL: 20 };   // CONST.WALL_SENSE_TYPES

/** Como fica uma parede com "Allow Light": "see" = luz e visão passam (varanda, grade, parapeito),
 *  "light" = só a luz passa (a visão continua bloqueada), "wall" = parede comum. */
export const LIGHT_WALL_RULES = {
  see: { sight: 0, light: 0, sound: 0 },
  light: { light: 0 }
};

const segDist = (p, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/** O trecho a–b fica em cima de alguma parede com "Allow Light"? (coordenadas em quadrados) */
export function onLightWall(a, b, polys, tol = 0.05) {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  for (const poly of polys) {
    const pts = Array.isArray(poly) ? poly : (poly.points ?? []);
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i], pts[i + 1]]);
    if (!Array.isArray(poly) && poly.loop && pts.length > 2) segs.push([pts[pts.length - 1], pts[0]]);
    const near = (p) => segs.some(([s, e]) => segDist(p, s, e) <= tol);
    if (near(a) && near(b) && near(mid)) return true;
  }
  return false;
}
const MOVE = { NONE: 0, NORMAL: 20 };                  // CONST.WALL_MOVEMENT_TYPES
const DOOR = { NONE: 0, DOOR: 1, SECRET: 2 };          // CONST.WALL_DOOR_TYPES

/**
 * Comprimento da abertura de um portal, em quadrados.
 * As molduras da Forgotten Adventures são dois postes com abertura de 1 (simples) ou 2 (dupla)
 * quadrados; o Dungeondraft exporta o portal de ponta a ponta dos postes.
 * Regra: sobra de 0,02 a 0,5 quadrado depois da parte inteira = postes → usa a parte inteira.
 * Comprimento já inteiro (janelas com batente) ou menor que 1 → usa o portal inteiro.
 */
export function openingLength(length, tol = 0.02) {
  if (!(length >= 1)) return length;
  const n = Math.floor(length + tol);
  const extra = length - n;
  if (extra <= tol) return length;
  return extra <= 0.5 ? n : length;
}
const DOOR_STATE = { CLOSED: 0, OPEN: 1 };             // CONST.WALL_DOOR_STATES

/**
 * No .dd2vtt não existe "tipo" de portal. A convenção dos importadores:
 *   closed: true  -> porta
 *   closed: false -> janela (portal com "Allow Light" no Dungeondraft)
 */
export function portalKind(portal) {
  return portal.closed === false ? "window" : "door";
}

/** Distância de um ponto a uma reta (a,b), em quadrados. */
function distToLine(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

/**
 * Dois portais estão "no mesmo lugar" quando são colineares (tolerância em quadrados)
 * e se sobrepõem em pelo menos metade do menor. Pega o caso doorframe + door do Dungeondraft.
 */
export function samePlace(s1, s2, tol = 0.2) {
  const len = (s) => Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y);
  const [L, S] = len(s1) >= len(s2) ? [s1, s2] : [s2, s1];
  const lenL = len(L), lenS = len(S);
  if (lenL === 0) return false;
  if (distToLine(S[0], L[0], L[1]) > tol || distToLine(S[1], L[0], L[1]) > tol) return false;
  // Projeção do segmento menor sobre o maior.
  const ux = (L[1].x - L[0].x) / lenL, uy = (L[1].y - L[0].y) / lenL;
  const t = (p) => (p.x - L[0].x) * ux + (p.y - L[0].y) * uy;
  const [t0, t1] = [t(S[0]), t(S[1])].sort((a, b) => a - b);
  const overlap = Math.min(t1, lenL) - Math.max(t0, 0);
  return overlap >= Math.max(lenS, tol) * 0.5;
}

/**
 * Junta portais sobrepostos num só. Fica o segmento mais comprido;
 * se um deles for porta, o resultado é porta (porta vence janela).
 */
export function mergePortals(portals, tol = 0.2) {
  const out = [];
  let merged = 0;
  for (const p of portals) {
    const seg = p.bounds;
    if (!seg?.[0] || !seg?.[1]) continue;
    const hit = out.find((q) => samePlace(q.bounds, seg, tol));
    if (!hit) { out.push({ ...p }); continue; }
    merged++;
    const len = (s) => Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y);
    if (len(seg) > len(hit.bounds)) hit.bounds = seg;
    if (portalKind(p) === "door") hit.closed = true;
  }
  return { portals: out, merged };
}

/* ------------------------------------------------------------------ */
/* Lado de dentro / lado de fora                                       */
/* ------------------------------------------------------------------ */

/** Distância ao longo do raio (ox,oy)+t(dx,dy) até o segmento [p,q], ou Infinity. */
function rayHit(ox, oy, dx, dy, px, py, qx, qy) {
  const sx = qx - px, sy = qy - py;
  const den = dx * sy - dy * sx;
  if (Math.abs(den) < 1e-12) return Infinity;
  const t = ((px - ox) * sy - (py - oy) * sx) / den;
  const u = ((px - ox) * dy - (py - oy) * dx) / den;
  return t > 1e-9 && u >= 0 && u <= 1 ? t : Infinity;
}

/** Quantos de N raios saindo de (x,y) batem em alguma parede: lugar fechado = mais batidas. */
function enclosure(x, y, segments, maxDist, rays = 24) {
  let hits = 0;
  for (let i = 0; i < rays; i++) {
    const ang = (i + 0.5) * (2 * Math.PI / rays);
    const dx = Math.cos(ang), dy = Math.sin(ang);
    for (const s of segments) {
      if (rayHit(x, y, dx, dy, s[0], s[1], s[2], s[3]) <= maxDist) { hits++; break; }
    }
  }
  return hits;
}

/**
 * Descobre de que lado do segmento a→b fica o interior (o lado mais fechado por paredes).
 * "right"/"left" no sentido da tela (y para baixo). Devolve null se os dois lados forem parecidos
 * (porta entre dois cômodos).
 * @param {number[][]} segments  [x1,y1,x2,y2] das outras paredes, nas mesmas unidades de a/b
 */
export function interiorSide(a, b, segments, { probe = 0.5, maxDist = Infinity, rays = 24, margin = 2 } = {}) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (!len) return null;
  const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len; // normal para a direita
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const right = enclosure(mx + nx * probe, my + ny * probe, segments, maxDist, rays);
  const left = enclosure(mx - nx * probe, my - ny * probe, segments, maxDist, rays);
  if (right - left >= margin) return "right";
  if (left - right >= margin) return "left";
  return null;
}

/**
 * O Foundry gira a porta para o lado DIREITO de c (do 1º para o 2º ponto), com a dobradiça no 1º ponto.
 * Para abrir para fora, a porta precisa ter o interior à esquerda; senão, invertemos as pontas.
 * @param {"out"|"in"|"keep"} openSide
 * @returns {boolean} se as pontas devem ser invertidas
 */
export function shouldReverse(interior, openSide) {
  if (!interior || openSide === "keep") return false;
  return openSide === "out" ? interior === "right" : interior === "left";
}

/**
 * Converte um andar (.dd2vtt) em paredes e luzes, em pixels da cena.
 * @param {object} uvtt       JSON do arquivo
 * @param {number} gridSize   tamanho da grade da cena (px)
 * @param {object} opts
 * @param {number}  opts.gridDistance  metros por quadrado (Nauren: 1)
 * @param {number}  opts.elevation     elevação do andar (luzes)
 * @param {string}  opts.levelId       nível do V14 ao qual tudo fica preso
 * @param {boolean} opts.mergeDoors    juntar portais sobrepostos (doorframe + door)
 * @param {string}  opts.windows       "static" | "open" | "gm" | "door" | "ignore"
 * @param {boolean} opts.windowsOpen   janelas que abrem já começam abertas
 * @param {string}  opts.openSide      "out" (abrir para fora), "in" (para dentro) ou "keep" (como o Dungeondraft exportou)
 * @param {boolean} opts.frameInset    recuar a porta para dentro da moldura (padrão FA)
 * @param {number}  opts.doubleThreshold  abertura (em quadrados) a partir da qual vira porta dupla
 * @param {Function} opts.decorate     (wallData, info) => void, para pôr arte/animação/som
 * @param {boolean} opts.lightsVisionOnly  luz só revela/dá visão, não pinta nem clareia a imagem
 * @param {number}  opts.lightAlpha    intensidade da cor (0–1) quando não é só visão
 * @param {number}  opts.lightExtra    metros a mais na luz fraca (a forte acompanha na proporção)
 */
export function convertFloor(uvtt, gridSize, {
  gridDistance = 1, elevation = 0, levelId = null,
  mergeDoors = true, windows = "static", windowsOpen = false, openSide = "out", windowOpenSide = null, frameInset = true, doubleThreshold = 1.6, decorate = null,
  lightsVisionOnly = true, lightAlpha = 0, lightExtra = 0, lightWalls = "see"
} = {}) {
  const origin = uvtt.resolution.map_origin ?? { x: 0, y: 0 };
  const px = (p) => [Math.round((p.x - origin.x) * gridSize), Math.round((p.y - origin.y) * gridSize)];
  const levels = levelId ? [levelId] : [];

  const walls = [];
  // Paredes marcadas com "Allow Light" no Dungeondraft (Unofficial Patch), gravadas pelo mod Nauren.
  const lightPolys = lightWalls === "wall" ? [] : (uvtt.nauren?.light_walls ?? []);
  const lightRule = LIGHT_WALL_RULES[lightWalls] ?? null;
  let lightWallCount = 0;
  const addPolyline = (pts, checkLight = false) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const c = [...px(pts[i]), ...px(pts[i + 1])];
      if (c[0] === c[2] && c[1] === c[3]) continue; // segmento de comprimento zero
      const wall = { c, ...(levelId ? { levels } : {}) };
      if (checkLight && lightRule && lightPolys.length && onLightWall(pts[i], pts[i + 1], lightPolys)) {
        Object.assign(wall, lightRule);
        lightWallCount++;
      }
      walls.push(wall);
    }
  };
  for (const line of uvtt.line_of_sight ?? []) addPolyline(line, true);
  // Proteção: se TODAS as paredes vieram com "Allow Light", quase certamente é engano (botão
  // "Allow Light" ligado na ferramenta de parede, ou arquivo da 1.0.0–1.0.3 do mod, que marcava errado).
  let lightWallsIgnored = false;
  if (lightRule && lightWallCount > 0 && lightWallCount === walls.length) {
    for (const w of walls) for (const k of Object.keys(lightRule)) delete w[k];
    lightWallsIgnored = true;
    lightWallCount = 0;
  }
  for (const line of uvtt.objects_line_of_sight ?? []) addPolyline(line);

  const raw = (uvtt.portals ?? []).filter((p) => p.bounds?.[0] && p.bounds?.[1]);
  const { portals, merged } = mergeDoors ? mergePortals(raw) : { portals: raw, merged: 0 };
  const stats = { doors: 0, windows: 0, merged, lights: 0, inset: 0, doubles: 0, reversed: 0, lightWalls: lightWallCount, lightWallsIgnored };
  const windowMode = windows === "window" ? "static" : windows; // compatibilidade com a 1.3

  // Paredes do andar (em quadrados) para descobrir o lado de dentro de cada porta.
  const losSegs = [];
  for (const line of [...(uvtt.line_of_sight ?? []), ...(uvtt.objects_line_of_sight ?? [])]) {
    for (let i = 0; i < line.length - 1; i++) losSegs.push([line[i].x, line[i].y, line[i + 1].x, line[i + 1].y]);
  }
  const portalSegs = portals.map((p) => [p.bounds[0].x, p.bounds[0].y, p.bounds[1].x, p.bounds[1].y]);
  const maxDist = Math.hypot(uvtt.resolution.map_size.x, uvtt.resolution.map_size.y);

  portals.forEach((portal, index) => {
    const kind = portalKind(portal);
    if (kind === "window" && windowMode === "ignore") return;
    const lv = levelId ? { levels } : {};
    const [a, b] = portal.bounds;
    const length = Math.hypot(b.x - a.x, b.y - a.y);

    // Recuo da moldura: a porta ocupa só a abertura, centrada; os postes viram parede comum.
    // Abertura medida pelo mod do Dungeondraft (pela arte da moldura) quando existir; senão, a regra.
    const measured = Number(portal.nauren?.opening);
    const opening = !frameInset ? length
      : (kind === "door" && measured > 0.2 && measured <= length + 1e-6) ? measured
      : openingLength(length);
    let s = a, e = b;
    if (opening < length - 1e-6) {
      const ux = (b.x - a.x) / length, uy = (b.y - a.y) / length;
      const cut = (length - opening) / 2;
      s = { x: a.x + ux * cut, y: a.y + uy * cut };
      e = { x: b.x - ux * cut, y: b.y - uy * cut };
      for (const [p0, p1] of [[a, s], [e, b]]) {
        const c = [...px(p0), ...px(p1)];
        if (c[0] !== c[2] || c[1] !== c[3]) walls.push({ c, ...lv });
      }
      stats.inset++;
    }
    const side = kind === "window" && windowMode !== "door" ? (windowOpenSide ?? openSide) : openSide;
    const interior = side === "keep" ? null
      : interiorSide(a, b, [...losSegs, ...portalSegs.filter((_, j) => j !== index)], { probe: 0.5, maxDist });
    const reverse = shouldReverse(interior, side);
    if (reverse) stats.reversed++;
    const c = reverse ? [...px(e), ...px(s)] : [...px(s), ...px(e)];
    const isDouble = opening >= doubleThreshold;
    if (isDouble) stats.doubles++;
    const info = { kind, index, length, opening, double: isDouble, interior, reversed: reverse,
      frame: portal.nauren?.texture ?? null, measured: measured > 0 };

    let wall;
    if (kind === "window" && windowMode === "static") {
      // Janela estática: ninguém passa, mas dá para ver e a luz atravessa. Sem arte.
      wall = { c, move: MOVE.NORMAL, sight: SENSE.NONE, light: SENSE.NONE, sound: SENSE.LIMITED, door: DOOR.NONE, ...lv };
      info.animated = false;
    } else if (kind === "window" && (windowMode === "open" || windowMode === "gm")) {
      // Janela que abre: é uma porta com regras de janela (fechada deixa ver, mas não deixa passar).
      wall = {
        c, door: windowMode === "gm" ? DOOR.SECRET : DOOR.DOOR, ds: windowsOpen ? DOOR_STATE.OPEN : DOOR_STATE.CLOSED,
        move: MOVE.NORMAL, sight: SENSE.NONE, light: SENSE.NONE, sound: SENSE.LIMITED, ...lv
      };
      info.animated = true;
    } else {
      wall = { c, door: DOOR.DOOR, ds: DOOR_STATE.CLOSED, ...lv };
      info.kind = "door";
      info.animated = true;
    }
    if (info.kind === "window") stats.windows++; else stats.doors++;
    if (decorate && info.animated) decorate(wall, info);
    walls.push(wall);
  });

  const lights = (uvtt.lights ?? []).map((l) => {
    const [x, y] = px(l.position);
    const base = (l.range ?? 4) * gridDistance;   // alcance do UVTT está em quadrados (no Nauren, 1 quadrado = 1 m)
    const { dim, bright } = adjustLight({ dim: base, bright: base / 2 }, { mode: "add", dim: lightExtra, keepRatio: true });
    const config = { dim, bright };
    if (lightsVisionOnly) {
      // Só revela a área: sem cor, sem tingir e brilho neutro (0.5 = não clareia nem escurece).
      Object.assign(config, { color: null, alpha: 0, luminosity: 0.5 });
    } else {
      Object.assign(config, { color: parseColor(l.color), alpha: Math.min(Math.max(Number(lightAlpha) || 0, 0), 1) });
    }
    return {
      x, y, elevation,
      ...(levelId ? { levels } : {}),
      config,
      ...(l.shadows === false ? { walls: false } : {})
    };
  });
  stats.lights = lights.length;

  return { walls, lights, stats };
}

/**
 * Posição do andar de baixo para cima (0 = térreo) num arquivo do mod.
 * No Dungeondraft a lista de andares vem de cima para baixo (índice 0 = mais alto).
 */
export function floorOf(uvtt) {
  const lv = uvtt?.nauren?.level;
  if (!lv) return null;
  if (Number.isFinite(lv.floor)) return lv.floor;
  if (Number.isFinite(lv.index) && Number.isFinite(lv.count)) return lv.count - 1 - lv.index;
  return null;
}

/** Todas as paredes do arquivo estão marcadas com "Allow Light"? (o importador ignora nesse caso) */
export function allWallsLight(uvtt) {
  const polys = uvtt?.nauren?.light_walls ?? [];
  if (!polys.length) return false;
  let n = 0;
  for (const line of uvtt.line_of_sight ?? []) {
    for (let i = 0; i < line.length - 1; i++) {
      if (Math.hypot(line[i + 1].x - line[i].x, line[i + 1].y - line[i].y) < 0.01) continue; // o importador descarta esses
      if (!onLightWall(line[i], line[i + 1], polys)) return false;
      n++;
    }
  }
  return n > 0;
}

/** Resumo rápido de um arquivo para mostrar na janela antes de importar. */
export function summarize(uvtt) {
  const raw = (uvtt.portals ?? []).filter((p) => p.bounds?.[0] && p.bounds?.[1]);
  const { portals, merged } = mergePortals(raw);
  return {
    size: `${uvtt.resolution.map_size.x}×${uvtt.resolution.map_size.y}`,
    walls: (uvtt.line_of_sight ?? []).length + (uvtt.objects_line_of_sight ?? []).length,
    doors: portals.filter((p) => portalKind(p) === "door").length,
    windows: portals.filter((p) => portalKind(p) === "window").length,
    doubles: portals.filter((p) => openingLength(Math.hypot(p.bounds[1].x - p.bounds[0].x, p.bounds[1].y - p.bounds[0].y)) >= 1.6).length,
    merged,
    lights: (uvtt.lights ?? []).length,
    // Informações do mod "Exportar para Foundry (Nauren)", quando o arquivo veio dele.
    fromMod: !!uvtt.nauren,
    frames: portals.filter((p) => p.nauren?.texture).length,
    lightWalls: (uvtt.nauren?.light_walls ?? []).length,
    lightWallsAll: allWallsLight(uvtt),
    floor: floorOf(uvtt),
    level: uvtt.nauren?.level ?? null,
    imageFile: uvtt.nauren?.image_file ?? null
  };
}

/** Material e cor de uma moldura/batente da FA pelo nome (ex.: Door_Frame_Double_Stone_Slate_A_3x1). */
export function parseFrameName(name) {
  const m = String(name ?? "").match(/^(?:Door_Frame|Window_Sill)_(?:Double_|Large_|Small_)?(Wood|Stone|Metal)_([A-Za-z]+)_/i);
  if (!m) return null;
  return { material: m[1].toLowerCase(), color: m[2].toLowerCase(), rusty: /_rusty/i.test(name) };
}

/* ------------------------------------------------------------------ */
/* Ajuste de raio das luzes                                            */
/* ------------------------------------------------------------------ */

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Calcula o novo raio de uma luz.
 * @param {{dim:number, bright:number}} light   raios atuais (em unidades da cena, ex.: metros)
 * @param {object} op
 * @param {"add"|"mul"|"set"} op.mode   somar metros, multiplicar ou definir um valor
 * @param {number} op.dim        quanto somar / fator / valor para a luz fraca
 * @param {number} op.bright     idem para a luz forte (ignorado se keepRatio)
 * @param {boolean} op.keepRatio a luz forte acompanha a fraca, mantendo a proporção atual
 */
export function adjustLight({ dim = 0, bright = 0 }, { mode = "add", dim: dv = 0, bright: bv = 0, keepRatio = true } = {}) {
  const ratio = dim > 0 ? bright / dim : 0.5;
  let newDim;
  let newBright;
  if (mode === "mul") {
    newDim = dim * dv;
    newBright = keepRatio ? newDim * ratio : bright * (bv || dv);
  } else if (mode === "set") {
    newDim = dv;
    newBright = keepRatio ? newDim * ratio : bv;
  } else {
    newDim = dim + dv;
    newBright = keepRatio ? newDim * ratio : bright + bv;
  }
  newDim = Math.max(0, round1(newDim));
  newBright = Math.min(newDim, Math.max(0, round1(newBright)));
  return { dim: newDim, bright: newBright };
}

/** Agrupa luzes pelo par (fraca, forte) para mostrar "4 luzes com 10/5 m". */
export function groupLights(lights) {
  const map = new Map();
  for (const l of lights) {
    const key = `${round1(l.dim)}|${round1(l.bright)}`;
    if (!map.has(key)) map.set(key, { key, dim: round1(l.dim), bright: round1(l.bright), ids: [] });
    map.get(key).ids.push(l.id);
  }
  return [...map.values()].sort((a, b) => b.ids.length - a.ids.length || b.dim - a.dim);
}
