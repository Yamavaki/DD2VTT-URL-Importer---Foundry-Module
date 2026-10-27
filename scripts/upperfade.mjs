// Fade do andar de cima (1.9.2).
// No V14, quando um andar "vê" o andar de cima, o Foundry desenha a imagem (fundo) do andar de cima por cima,
// mas essa imagem não some com o token embaixo nem com o mouse. Aqui, a cada quadro, a imagem do andar de cima
// fica transparente (com fade) quando:
//   - um token seu (selecionado; para jogador, os dele) está embaixo de uma parte com chão do andar de cima, ou
//   - o mouse está em cima de uma parte com chão do andar de cima.
// "Parte com chão" = pixel não transparente da imagem do andar (a imagem precisa ter fundo transparente fora
// da construção). Nada é gravado na cena: é só como a tela desenha.

import { MODULE_ID } from "./library.mjs";
import { bottomOf, stepAlpha, opaqueTester, shouldFade, sameSrc } from "./levels.mjs";

const state = new WeakMap();      // mesh → { a, touched }
const owner = new WeakMap();      // mesh → Level (cache)
const masks = new Map();          // src → { w, h, data } | null (erro) | undefined (carregando)
let lastTime = 0;
let attached = false;
let gen = 0;                      // muda quando os andares mudam (refaz o cache)

export function installUpperFade() {
  game.settings.register(MODULE_ID, "upperFade", {
    name: "Andar de cima: quando ele some",
    hint: "Vendo um andar de baixo, a imagem do andar de cima fica transparente (fade) quando um token seu passa embaixo e/ou quando o mouse passa por cima dela. Vale só para você.",
    scope: "client", config: true, type: String, default: "both",
    choices: { both: "Token embaixo ou mouse por cima", token: "Só com token embaixo", mouse: "Só com o mouse por cima", off: "Nunca (desligado)" }
  });
  game.settings.register(MODULE_ID, "upperFadeAlpha", {
    name: "Andar de cima: quanto fica visível quando some",
    hint: "0 = some de vez. 0,3 = fica um vulto do andar de cima.",
    scope: "client", config: true, type: Number, default: 0, range: { min: 0, max: 0.8, step: 0.05 }
  });
  Hooks.on("canvasReady", () => { masks.clear(); gen++; attach(); });
  for (const h of ["updateLevel", "createLevel", "deleteLevel"]) Hooks.on(h, () => { masks.clear(); gen++; });
}

function attach() {
  const ticker = canvas?.app?.ticker;
  if (!ticker || attached) return;
  const low = globalThis.PIXI?.UPDATE_PRIORITY?.LOW ?? -25;
  ticker.add(tick, null, low + 1);   // depois das atualizações do Foundry, antes de desenhar
  attached = true;
}

const setting = (k, d) => { try { return game.settings.get(MODULE_ID, k); } catch { return d; } };

function sceneLevelList() {
  const lv = canvas?.scene?.levels;
  return lv ? [...(lv.contents ?? lv)] : [];
}

function texSrc(mesh) {
  const bt = mesh?.texture?.baseTexture;
  return bt?.resource?.src ?? bt?.resource?.url ?? bt?.resource?.source?.src ?? bt?.cacheId
    ?? bt?.textureCacheIds?.[0] ?? mesh?.texture?.textureCacheIds?.[0] ?? null;
}

function levelOf(mesh, levels) {
  const c = owner.get(mesh);
  if (c && c.g === gen) return c.level;
  let found = null;
  for (const k of ["level", "document", "object", "levelDocument", "levelId"]) {
    const v = mesh?.[k];
    const doc = v?.document ?? v;
    if (doc?.documentName === "Level") { found = levels.find((l) => l.id === doc.id) ?? doc; break; }
    if (typeof v === "string") { const l = levels.find((x) => x.id === v); if (l) { found = l; break; } }
  }
  if (!found) {
    const src = texSrc(mesh);
    if (src) found = levels.find((l) => sameSrc(l.background?.src, src)) ?? null;
  }
  owner.set(mesh, { g: gen, level: found });
  return found;
}

function walk(obj, depth, fn) {
  if (!obj || depth < 0) return;
  for (const c of obj.children ?? []) { if (c?.texture) fn(c); walk(c, depth - 1, fn); }
}

/** Imagens de andar desenhadas na tela, com o andar de cada uma. */
function levelMeshes() {
  const levels = sceneLevelList();
  if (levels.length < 2 || !canvas?.primary) return [];
  const set = new Set(canvas.primary.levelTextures ?? []);
  if (!set.size) walk(canvas.primary, 3, (o) => set.add(o));
  const out = [];
  for (const mesh of set) {
    if (!mesh || mesh.destroyed) continue;
    const level = levelOf(mesh, levels);
    if (level) out.push({ mesh, level });
  }
  return out;
}

/** Máscara de transparência da imagem (reduzida para no máximo 512 px). */
function maskFor(mesh, src) {
  if (!src) return null;
  if (masks.has(src)) return masks.get(src);
  masks.set(src, undefined);
  const build = (img) => {
    try {
      const W = img.naturalWidth || img.videoWidth || img.width, H = img.naturalHeight || img.videoHeight || img.height;
      const k = Math.min(1, 512 / Math.max(W, H));
      const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0, w, h);
      const d = g.getImageData(0, 0, w, h).data;
      const a = new Uint8Array(w * h);
      for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
      masks.set(src, { w, h, data: a });
    } catch (err) {
      console.warn(`${MODULE_ID} | fade: não deu para ler a transparência de ${src} (o andar de cima vai sumir em qualquer ponto do mapa).`, err);
      masks.set(src, null);
    }
  };
  const source = mesh?.texture?.baseTexture?.resource?.source;
  const drawable = typeof HTMLImageElement !== "undefined" && (source instanceof HTMLImageElement
    || (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) || source instanceof HTMLCanvasElement);
  if (drawable && (source.complete !== false)) build(source);
  else {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => build(img);
    img.onerror = () => masks.set(src, null);
    img.src = src;
  }
  return masks.get(src);
}

function sceneRectNow() {
  const d = canvas?.dimensions ?? {};
  return { x: d.sceneX ?? 0, y: d.sceneY ?? 0, width: d.sceneWidth ?? d.width ?? 1, height: d.sceneHeight ?? d.height ?? 1 };
}

/** Tokens que contam: os selecionados; para jogador sem seleção, os dele. */
function myTokens() {
  const layer = canvas?.tokens;
  if (!layer) return [];
  const sel = layer.controlled ?? [];
  if (sel.length) return sel;
  if (game.user?.isGM) return [];
  return (layer.placeables ?? []).filter((t) => t.document?.isOwner);
}

function tick() {
  const now = performance.now();
  const dt = lastTime ? Math.min(0.1, (now - lastTime) / 1000) : 0;
  lastTime = now;
  if (!canvas?.ready || !canvas.scene) return;
  const items = levelMeshes();
  const mode = setting("upperFade", "both");
  const fadedAlpha = Number(setting("upperFadeAlpha", 0)) || 0;
  const viewed = canvas.level ?? canvas.scene.levels?.get?.(canvas.scene._view) ?? null;
  const vb = viewed ? bottomOf(viewed) : -Infinity;
  const rect = sceneRectNow();
  const tokens = myTokens();
  const mouse = canvas.mousePosition ?? null;
  const levelAlpha = new Map();     // andar acima do visto → transparência atual
  for (const { mesh, level } of items) {
    const st = state.get(mesh) ?? { a: 1, touched: false };
    state.set(mesh, st);
    let target = 1;
    const lb = bottomOf(level);
    if (mode !== "off" && lb > vb) {
      const mask = maskFor(mesh, texSrc(mesh) ?? level.background?.src);
      if (mask !== undefined) {
        const isOpaque = opaqueTester(mask, rect);
        const pts = tokens.filter((t) => (Number(t.document?.elevation) || 0) < lb).map((t) => t.center ?? { x: t.x, y: t.y });
        if (shouldFade({ mode, tokenPoints: pts, mouse, isOpaque })) target = fadedAlpha;
      }
    }
    st.a = stepAlpha(st.a, target, dt);
    if (st.a < 0.999 || st.touched) {
      mesh.alpha = st.a < 0.999 ? st.a : 1;
      st.touched = st.a < 0.999;
    }
    if (lb > vb) levelAlpha.set(level.id, Math.min(levelAlpha.get(level.id) ?? 1, st.a));
  }
  // Andar de cima sem imagem desenhada (não está na visão do andar visto): as coisas dele somem também.
  if (!viewed || sceneLevelList().length < 2) return;
  for (const l of sceneLevelList()) if (bottomOf(l) > vb && !levelAlpha.has(l.id)) levelAlpha.set(l.id, 0);
  applyToPlaceables(levelAlpha);
}

/** Ids dos andares de um objeto (vazio = todos). */
function idsOf(doc) {
  const v = doc?.levels ?? doc?._source?.levels;
  return v instanceof Set ? [...v] : Array.isArray(v) ? v : [];
}

const placeState = new WeakMap();  // objeto de tela → { touched, ctl }

/**
 * Coisas que pertencem só a andares de cima (portas, tiles): acompanham o fade da imagem do andar.
 * O ícone de abrir/fechar porta de um andar de cima some enquanto você vê um andar de baixo
 * (para ninguém abrir a porta de cima estando embaixo).
 */
function applyToPlaceables(levelAlpha) {
  const alphaFor = (doc) => {
    const ids = idsOf(doc);
    if (!ids.length) return null;                       // em todos os andares: não mexe
    let a = null;
    for (const id of ids) {
      if (!levelAlpha.has(id)) return null;              // também está no andar visto (ou abaixo): não mexe
      a = Math.min(a ?? 1, levelAlpha.get(id));
    }
    return a;
  };
  const touch = (obj, a, extra) => {
    if (!obj) return;
    const st = placeState.get(obj) ?? { touched: false };
    if (a !== null && a < 0.999) { obj.alpha = a; st.touched = true; }
    else if (st.touched) { obj.alpha = 1; st.touched = false; }
    extra?.(st);
    placeState.set(obj, st);
  };
  for (const w of canvas.walls?.placeables ?? []) {
    if (!w.document?.door) continue;
    const a = alphaFor(w.document);
    touch(w.doorMesh, a);
    const ctl = w.doorControl;
    if (ctl) {
      const st = placeState.get(ctl) ?? { hidden: false };
      if (a !== null) { ctl.visible = false; st.hidden = true; }
      else if (a === null && st.hidden) { ctl.visible = true; st.hidden = false; }
      placeState.set(ctl, st);
    }
  }
  for (const t of canvas.tiles?.placeables ?? []) touch(t.mesh, alphaFor(t.document));
}

/** Diagnóstico no console: game.modules.get("dd2vtt-url-importer").api.fadeDebug() */
export function debugUpperFade() {
  const levels = sceneLevelList();
  const viewed = canvas?.level ?? null;
  const rows = levelMeshes().map(({ mesh, level }) => {
    const src = texSrc(mesh);
    const m = masks.get(src);
    return {
      andar: level.name, chao: bottomOf(level), acimaDoVisto: bottomOf(level) > (viewed ? bottomOf(viewed) : -Infinity),
      alpha: Math.round((mesh.alpha ?? 1) * 100) / 100, imagem: src,
      mascara: m === undefined ? "carregando/não lida" : m === null ? "sem transparência legível" : `${m.w}×${m.h}`,
      classe: mesh.constructor?.name
    };
  });
  console.table(rows);
  console.log(`${MODULE_ID} | fade: andar visto = ${viewed?.name ?? "?"}; andares na cena = ${levels.length}; `
    + `levelTextures = ${canvas?.primary?.levelTextures?.length ?? "não existe"}; modo = ${setting("upperFade", "both")}`);
  return rows;
}
