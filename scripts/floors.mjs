import { MODULE_ID } from "./library.mjs";
import {
  levelsByHeight, bottomOf, topOf, levelIdsOf, nextLevels, passageRegionData, levelAbove, nextFloorBottom,
  cellKey, parseCell, brushCells, rectCells, cellsToRects, cellRectsToPixels, shapesToCells, passageElevation,
  seenBy, toggleSight, dropFromSight, restoreBackgroundsPlan, levelSrc
} from "./levels.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v, d) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : d; };

/** Tipos de objeto que podem ficar presos a andares (nome do documento → coleção da cena). */
const PLACEABLES = [
  ["Tile", "tiles", ["tile", "tiles"]], ["Wall", "walls", ["parede", "paredes"]], ["AmbientLight", "lights", ["luz", "luzes"]],
  ["AmbientSound", "sounds", ["som", "sons"]], ["Region", "regions", ["região", "regiões"]], ["Drawing", "drawings", ["desenho", "desenhos"]], ["Note", "notes", ["nota", "notas"]]
];

const sceneLevels = (scene = canvas?.scene) => levelsByHeight(scene?.levels ?? []);
const hasLevels = (scene = canvas?.scene) => (scene?.levels?.size ?? scene?.levels?.length ?? 0) > 0;
export const viewedLevelId = (scene = canvas?.scene) => canvas?.level?.id ?? scene?._view ?? null;

/** Nome do efeito de região "Trocar de andar" neste Foundry (ou null). */
export function changeLevelType() {
  const keys = Object.keys(CONFIG?.RegionBehavior?.dataModels ?? {});
  return keys.find((k) => k === "changeLevel") ?? keys.find((k) => /change.?level/i.test(k)) ?? null;
}

/* ===================================================================================
 * Andares de cima "em fade" e iluminação global
 * =================================================================================== */

/** Tile de andar (imagem de um andar de cima) criado pelo módulo? (inclui os antigos "fade" da 1.9.0) */
export const isFadeTile = (d) => {
  const f = d?.flags?.[MODULE_ID] ?? d?._source?.flags?.[MODULE_ID];
  return !!(f?.floor || f?.fade);
};
export const srcOf = (level) => level?.background?.src || levelSrc(level, MODULE_ID);

/**
 * Cenas da 1.9.0/1.9.1: volta a imagem de cada andar para o fundo do próprio andar e apaga os tiles
 * de andar que o módulo criou. (O fade do andar de cima agora é feito na tela, em upperfade.mjs.)
 */
export async function restoreLevelImages(scene) {
  if (!scene) return { levels: 0, tiles: 0 };
  const ups = restoreBackgroundsPlan(sceneLevels(scene), MODULE_ID);
  if (ups.length) await scene.updateEmbeddedDocuments("Level", ups);
  const tiles = (scene.tiles?.contents ?? []).filter(isFadeTile).map((t) => t.id);
  if (tiles.length) await scene.deleteEmbeddedDocuments("Tile", tiles);
  return { levels: ups.length, tiles: tiles.length };
}

export function needsRestore(scene) {
  if (!scene) return false;
  return restoreBackgroundsPlan(sceneLevels(scene), MODULE_ID).length > 0 || (scene.tiles?.contents ?? []).some(isFadeTile);
}

/** Iluminação global da cena (V12+: environment.globalLight.enabled). */
export function globalLightOf(scene) {
  const env = scene?.environment?.globalLight ?? scene?._source?.environment?.globalLight;
  return env ? !!env.enabled : !!scene?.globalLight;
}
export const globalLightData = (on) => (globalThis.Scene?.schema?.fields?.environment
  ? { environment: { globalLight: { enabled: !!on } } } : { globalLight: !!on });
export async function setGlobalLight(scene, on) {
  if (!scene) return;
  await scene.update(globalThis.Scene?.schema?.fields?.environment || scene.environment ? { "environment.globalLight.enabled": !!on } : { globalLight: !!on });
}

/** Atualiza os andares de vários documentos (agrupados por tipo). */
async function setLevels(docs, levelId, mode) {
  const scene = canvas.scene;
  const byType = new Map();
  // Shift+clique com vários selecionados: se nem todos têm o andar, acrescenta em todos; se todos têm, tira.
  const addAll = mode === "toggle" && levelId ? !docs.every((d) => levelIdsOf(d).includes(levelId)) : null;
  for (const doc of docs) {
    if (!doc || !("levels" in (doc._source ?? {}))) continue;
    const list = byType.get(doc.documentName) ?? [];
    list.push({ _id: doc.id, levels: nextLevels(levelIdsOf(doc), levelId, mode, addAll) });
    byType.set(doc.documentName, list);
  }
  let n = 0;
  for (const [type, updates] of byType) {
    await scene.updateEmbeddedDocuments(type, updates);
    n += updates.length;
  }
  return n;
}

/* ===================================================================================
 * Botão de andar no menu (HUD) de tiles, luzes, sons e desenhos
 * =================================================================================== */

function levelPaletteHTML(docs) {
  const levels = sceneLevels().slice().reverse(); // de cima para baixo, como num prédio
  const sets = docs.map((d) => new Set(levelIdsOf(d)));
  const allEverywhere = sets.every((s) => s.size === 0);
  const state = (id) => {
    const n = sets.filter((s) => s.has(id)).length;
    return n === 0 ? "" : n === sets.length ? "is-on" : "is-some";
  };
  return `
    <div class="ddf-palette-title">Andar ${docs.length > 1 ? `(${docs.length} selecionados)` : ""}</div>
    ${levels.map((l) => `
      <button type="button" class="ddf-pal-item ${state(l.id)}" data-level="${l.id}">
        <i class="fa-solid fa-check" aria-hidden="true"></i><span>${esc(l.name || "Andar")}</span>
        ${l.id === viewedLevelId() ? '<em>vendo</em>' : ""}
      </button>`).join("")}
    <button type="button" class="ddf-pal-item ddf-pal-all ${allEverywhere ? "is-on" : ""}" data-level="">
      <i class="fa-solid fa-check" aria-hidden="true"></i><span>Todos os andares</span>
    </button>
    <div class="ddf-palette-hint">Clique: só neste andar · Shift+clique: acrescentar/tirar</div>`;
}

function hudDocs(hud) {
  const obj = hud.object;
  const controlled = obj?.layer?.controlled ?? [];
  const list = controlled.length && controlled.includes(obj) ? controlled : [obj];
  return list.map((o) => o?.document).filter(Boolean);
}

function onRenderHUD(hud, html) {
  if (!game.user?.isGM || !hasLevels()) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root || root.querySelector(".ddf-hud-btn")) return;
  const col = root.querySelector(".col.right") ?? root.querySelector(".col.left") ?? root;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "control-icon ddf-hud-btn";
  btn.dataset.tooltip = "Andar";
  btn.setAttribute("aria-label", "Escolher o andar");
  btn.innerHTML = '<i class="fa-solid fa-layer-group"></i>';
  const palette = document.createElement("div");
  palette.className = `ddf-palette ${MODULE_ID}`;
  palette.hidden = true;
  const refresh = () => { palette.innerHTML = levelPaletteHTML(hudDocs(hud)); };
  btn.addEventListener("click", (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    if (palette.hidden) refresh();
    palette.hidden = !palette.hidden;
    btn.classList.toggle("active", !palette.hidden);
  });
  palette.addEventListener("click", async (ev) => {
    const item = ev.target.closest(".ddf-pal-item");
    if (!item) return;
    ev.preventDefault(); ev.stopPropagation();
    const docs = hudDocs(hud);
    const id = item.dataset.level || null;
    await setLevels(docs, id, ev.shiftKey || ev.ctrlKey || ev.metaKey ? "toggle" : "move");
    refresh();
  });
  palette.addEventListener("pointerdown", (ev) => ev.stopPropagation());
  col.append(btn, palette);
}

export function installLevelHUD() {
  for (const hook of ["renderTileHUD", "renderAmbientLightHUD", "renderAmbientSoundHUD", "renderDrawingHUD", "renderNoteHUD"]) {
    Hooks.on(hook, onRenderHUD);
  }
}

/* ===================================================================================
 * Editor de área por quadrados (escadas e elevadores)
 * - um quadrado segue o mouse mostrando onde vai pintar;
 * - clicar/arrastar pinta, Shift (ou a ferramenta Apagar) apaga, Retângulo preenche de canto a canto;
 * - roda do mouse dá zoom e o botão direito arrasta o mapa, como sempre no Foundry.
 * =================================================================================== */

export class CellPainter {
  static active = null;

  /** Abre o editor. Resolve com o Set de quadrados ("x,y") ao salvar, ou null ao cancelar. */
  static open({ cells = new Set(), title = "Área", color = "#cca162" } = {}) {
    CellPainter.active?.finish(null);
    return new Promise((resolve) => { CellPainter.active = new CellPainter({ cells, title, color, resolve }); });
  }

  constructor({ cells, title, color, resolve }) {
    this.cells = new Set(cells);
    this.color = color;
    this.resolve = resolve;
    this.tool = "paint";       // paint | erase | rect
    this.brush = 1;
    this.hover = null;         // [cx, cy]
    this.stroke = null;        // { erase, start:[cx,cy] }
    this.shift = false;
    this.history = [];
    this.future = [];
    this.board = canvas?.app?.view ?? document.getElementById("board");
    this.size = canvas?.grid?.size ?? canvas?.dimensions?.size ?? 100;
    this.ox = 0; this.oy = 0;  // a grade quadrada do Foundry começa no 0 do canvas

    this.layer = document.createElement("canvas");
    this.layer.className = `ddf-paint-layer ${MODULE_ID}`;
    this.bar = document.createElement("div");
    this.bar.className = `ddf-paint-bar ${MODULE_ID}`;
    this.bar.innerHTML = `
      <div class="ddf-paint-title"><i class="fa-solid fa-pen-ruler"></i> ${esc(title)} <b data-count></b></div>
      <div class="ddf-paint-row" role="group" aria-label="Ferramenta">
        <button type="button" data-tool="paint" title="Pintar quadrados (P)"><i class="fa-solid fa-paintbrush"></i> Pintar</button>
        <button type="button" data-tool="erase" title="Apagar quadrados (E) — ou segure Shift"><i class="fa-solid fa-eraser"></i> Apagar</button>
        <button type="button" data-tool="rect" title="Arraste de um canto ao outro (R); com Shift apaga o retângulo"><i class="fa-regular fa-square"></i> Retângulo</button>
        <span class="ddf-paint-sep"></span>
        ${[1, 2, 3].map((n) => `<button type="button" data-brush="${n}" title="Pincel ${n}×${n} (${n})">${n}×${n}</button>`).join("")}
      </div>
      <div class="ddf-paint-row">
        <button type="button" data-act="undo" title="Desfazer (Ctrl+Z)"><i class="fa-solid fa-rotate-left"></i> Desfazer</button>
        <button type="button" data-act="clear"><i class="fa-solid fa-trash-can"></i> Limpar</button>
        <span class="ddf-paint-sep"></span>
        <button type="button" data-act="cancel">Cancelar</button>
        <button type="button" data-act="save" class="is-primary"><i class="fa-solid fa-check"></i> Salvar</button>
      </div>
      <div class="ddf-paint-hint">Arraste para pintar · Shift apaga · Ctrl+Z desfaz · roda: zoom · botão direito: mover o mapa · Enter salva · Esc cancela</div>`;
    document.body.append(this.layer, this.bar);

    this.bar.addEventListener("click", (ev) => this.#onBar(ev));
    this.bar.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    this._down = (ev) => this.#onDown(ev);
    this._move = (ev) => this.#onMove(ev);
    this._up = (ev) => this.#onUp(ev);
    this._key = (ev) => this.#onKey(ev);
    this._keyup = (ev) => { if (ev.key === "Shift") { this.shift = false; this.#syncBar(); } };
    document.addEventListener("pointerdown", this._down, true);
    document.addEventListener("pointermove", this._move, true);
    document.addEventListener("pointerup", this._up, true);
    this._cancel = () => { this.stroke = null; };
    document.addEventListener("pointercancel", this._cancel, true);
    window.addEventListener("blur", this._cancel);
    window.addEventListener("keydown", this._key, true);
    window.addEventListener("keyup", this._keyup, true);
    this.#syncBar();
    this._raf = requestAnimationFrame(() => this.#draw());
  }

  #onBoard(ev) {
    if (!this.board) return false;
    const r = this.board.getBoundingClientRect();
    if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) return false;
    // Só quando o ponteiro está de fato no mapa (não em janelas por cima dele).
    const top = document.elementFromPoint(ev.clientX, ev.clientY);
    return top === this.board || top === this.layer || !top;
  }

  #cellAt(ev) {
    const p = canvas.canvasCoordinatesFromClient({ x: ev.clientX, y: ev.clientY });
    return [Math.floor((p.x - this.ox) / this.size), Math.floor((p.y - this.oy) / this.size)];
  }

  get #erasing() { return this.tool === "erase" || this.shift; }

  #snapshot() {
    this.future = [];
    this.history.push(new Set(this.cells));
    if (this.history.length > 50) this.history.shift();
  }

  #apply(keys, erase) {
    for (const k of keys) { if (erase) this.cells.delete(k); else this.cells.add(k); }
    this.#syncBar();
  }

  #onDown(ev) {
    if (ev.button !== 0 || !this.#onBoard(ev)) return;
    ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
    this.shift = ev.shiftKey;
    const c = this.#cellAt(ev);
    this.#snapshot();
    this.stroke = { erase: this.#erasing, start: c, last: c };
    if (this.tool !== "rect") this.#apply(brushCells(c[0], c[1], this.brush), this.stroke.erase);
  }

  #onMove(ev) {
    if (this.shift !== ev.shiftKey) { this.shift = ev.shiftKey; this.#syncBar(); }
    this.hover = this.#onBoard(ev) ? this.#cellAt(ev) : null;
    // Botão solto fora da janela: encerra o traço em vez de continuar pintando.
    if (this.stroke && !(ev.buttons & 1)) { this.stroke = null; return; }
    if (!this.stroke || !this.hover) return;
    if (this.tool !== "rect") {
      // Preenche os quadrados entre o último ponto e o atual (arrasto rápido não pula quadrados).
      const [x0, y0] = this.stroke.last, [x1, y1] = this.hover;
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      const keys = [];
      for (let i = 1; i <= steps; i++) {
        const cx = Math.round(x0 + ((x1 - x0) * i) / steps), cy = Math.round(y0 + ((y1 - y0) * i) / steps);
        keys.push(...brushCells(cx, cy, this.brush));
      }
      this.#apply(keys, this.stroke.erase);
      this.stroke.last = this.hover;
    }
  }

  #onUp(ev) {
    if (!this.stroke) return;
    if (ev.button === 0) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation(); }
    if (this.tool === "rect") {
      const end = this.#onBoard(ev) ? this.#cellAt(ev) : (this.hover ?? this.stroke.start);
      this.#apply(rectCells(this.stroke.start, end), this.stroke.erase);
    }
    this.stroke = null;
  }

  #onKey(ev) {
    const tag = ev.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    let used = true;
    if (ev.key === "Escape") this.finish(null);
    else if (ev.key === "Enter") this.finish(this.cells);
    else if (ev.key === "Shift") { this.shift = true; this.#syncBar(); used = false; }
    else if ((ev.ctrlKey || ev.metaKey) && (ev.key.toLowerCase() === "y" || (ev.shiftKey && ev.key.toLowerCase() === "z"))) this.#redo();
    else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z") this.#undo();
    else if (["1", "2", "3"].includes(ev.key)) { this.brush = Number(ev.key); this.#syncBar(); }
    else if (ev.key.toLowerCase() === "p") { this.tool = "paint"; this.#syncBar(); }
    else if (ev.key.toLowerCase() === "e") { this.tool = "erase"; this.#syncBar(); }
    else if (ev.key.toLowerCase() === "r") { this.tool = "rect"; this.#syncBar(); }
    else used = false;
    if (used) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation(); }
  }

  #undo() {
    const prev = this.history.pop();
    if (prev) { this.future.push(this.cells); this.cells = prev; this.#syncBar(); }
  }

  #redo() {
    const next = this.future.pop();
    if (next) { this.history.push(this.cells); this.cells = next; this.#syncBar(); }
  }

  #onBar(ev) {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.dataset.tool) this.tool = b.dataset.tool;
    if (b.dataset.brush) this.brush = Number(b.dataset.brush);
    const act = b.dataset.act;
    if (act === "undo") this.#undo();
    if (act === "clear") { this.#snapshot(); this.cells.clear(); }
    if (act === "cancel") return this.finish(null);
    if (act === "save") return this.finish(this.cells);
    this.#syncBar();
  }

  #syncBar() {
    const n = this.cells.size;
    this.bar.querySelector("[data-count]").textContent = `${n} quadrado${n === 1 ? "" : "s"}`;
    for (const b of this.bar.querySelectorAll("[data-tool]")) b.classList.toggle("is-on", b.dataset.tool === this.tool);
    for (const b of this.bar.querySelectorAll("[data-brush]")) {
      b.classList.toggle("is-on", Number(b.dataset.brush) === this.brush);
      b.disabled = this.tool === "rect";
    }
    this.bar.querySelector('[data-act="save"]').disabled = n === 0;
    this.bar.classList.toggle("is-erasing", this.#erasing);
  }

  #draw() {
    if (!this.layer.isConnected) return;
    const r = this.board?.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (r) {
      Object.assign(this.layer.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
      const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
      if (this.layer.width !== w || this.layer.height !== h) { this.layer.width = w; this.layer.height = h; }
    }
    const ctx = this.layer.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.layer.width, this.layer.height);
    const t = canvas.stage.worldTransform;
    ctx.setTransform(t.a * dpr, t.b * dpr, t.c * dpr, t.d * dpr, t.tx * dpr, t.ty * dpr);
    const s = this.size, px = 1 / (t.a || 1);
    // Quadrados pintados
    ctx.fillStyle = this.color + "59";
    for (const k of this.cells) {
      const [cx, cy] = parseCell(k);
      ctx.fillRect(this.ox + cx * s, this.oy + cy * s, s, s);
    }
    // Contorno da área (só as bordas de fora)
    ctx.strokeStyle = this.color; ctx.lineWidth = 3 * px; ctx.beginPath();
    for (const k of this.cells) {
      const [cx, cy] = parseCell(k);
      const x = this.ox + cx * s, y = this.oy + cy * s;
      if (!this.cells.has(cellKey(cx, cy - 1))) { ctx.moveTo(x, y); ctx.lineTo(x + s, y); }
      if (!this.cells.has(cellKey(cx, cy + 1))) { ctx.moveTo(x, y + s); ctx.lineTo(x + s, y + s); }
      if (!this.cells.has(cellKey(cx - 1, cy))) { ctx.moveTo(x, y); ctx.lineTo(x, y + s); }
      if (!this.cells.has(cellKey(cx + 1, cy))) { ctx.moveTo(x + s, y); ctx.lineTo(x + s, y + s); }
    }
    ctx.stroke();
    // Prévia embaixo do mouse
    const preview = this.tool === "rect"
      ? (this.stroke ? rectCells(this.stroke.start, this.hover ?? this.stroke.start) : this.hover ? [cellKey(...this.hover)] : [])
      : this.hover ? brushCells(this.hover[0], this.hover[1], this.brush) : [];
    if (preview.length) {
      const erase = this.stroke ? this.stroke.erase : this.#erasing;
      ctx.fillStyle = erase ? "rgba(228,106,90,0.30)" : "rgba(225,183,96,0.30)";
      ctx.strokeStyle = erase ? "#e46a5a" : "#f4d58d";
      ctx.lineWidth = 2 * px;
      ctx.setLineDash([8 * px, 5 * px]);
      for (const k of preview) {
        const [cx, cy] = parseCell(k);
        ctx.fillRect(this.ox + cx * s, this.oy + cy * s, s, s);
        ctx.strokeRect(this.ox + cx * s + px, this.oy + cy * s + px, s - 2 * px, s - 2 * px);
      }
      ctx.setLineDash([]);
    }
    this._raf = requestAnimationFrame(() => this.#draw());
  }

  finish(value) {
    cancelAnimationFrame(this._raf);
    document.removeEventListener("pointerdown", this._down, true);
    document.removeEventListener("pointermove", this._move, true);
    document.removeEventListener("pointerup", this._up, true);
    document.removeEventListener("pointercancel", this._cancel, true);
    window.removeEventListener("blur", this._cancel);
    window.removeEventListener("keydown", this._key, true);
    window.removeEventListener("keyup", this._keyup, true);
    this.layer.remove();
    this.bar.remove();
    if (CellPainter.active === this) CellPainter.active = null;
    this.resolve(value ? new Set(value) : null);
  }
}

/** Quadrados atuais de uma região (para editar). */
export function regionCells(region) {
  const size = canvas?.grid?.size ?? 100;
  return shapesToCells(region?._source?.shapes ?? region?.shapes ?? [], size);
}

/** Quadrados → formas retangulares de região. */
export function cellsToShapes(cells) {
  const size = canvas?.grid?.size ?? 100;
  return cellRectsToPixels(cellsToRects(cells), size)
    .map((r) => ({ type: "rectangle", x: r.x, y: r.y, width: r.width, height: r.height, rotation: 0, hole: false }));
}

/** Cria a escada/elevador a partir dos quadrados pintados. `levels`: documentos Level ligados. */
export async function createPassage({ cells, levels, kind = "stairs", playersSee = false, scene = canvas.scene }) {
  const type = changeLevelType();
  if (!type) throw new Error("Este Foundry não tem o efeito de região “Trocar de andar” (precisa da versão 14).");
  const VIS = CONST.REGION_VISIBILITY ?? {};
  const data = passageRegionData({
    rects: cellsToShapes(cells), levels, kind, behaviorType: type, moduleId: MODULE_ID,
    visibility: playersSee ? (VIS.ALWAYS ?? 2) : undefined
  });
  const [region] = await scene.createEmbeddedDocuments("Region", [data]);
  return region;
}

/* ===================================================================================
 * Gerenciador de andares
 * =================================================================================== */

export class FloorsManager extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-floors`,
    classes: [MODULE_ID, "ddf"],
    window: { title: "Andares da cena", icon: "fa-solid fa-layer-group", resizable: true },
    position: { width: 600, height: "auto" },
    actions: {
      view: FloorsManager.#onView,
      bring: FloorsManager.#onBring,
      remove: FloorsManager.#onRemove,
      passage: FloorsManager.#onPassage,
      draw: FloorsManager.#onDraw,
      editShape: FloorsManager.#onEditShape,
      editPassage: FloorsManager.#onEditPassage,
      savePassage: FloorsManager.#onSavePassage,
      useSelected: FloorsManager.#onUseSelected,
      cancelPassage: FloorsManager.#onCancelPassage,
      goPassage: FloorsManager.#onGoPassage,
      deletePassage: FloorsManager.#onDeletePassage,
      addFloor: FloorsManager.#onAddFloor,
      sightAll: FloorsManager.#onSightAll
    }
  };

  static #instance = null;
  static open() {
    if (!game.user.isGM) return ui.notifications.warn("Só o mestre pode mexer nos andares.");
    if (!canvas?.scene) return ui.notifications.warn("Abra uma cena primeiro.");
    if (!("levels" in (canvas.scene._source ?? {}))) return ui.notifications.warn("Andares precisam do Foundry V14.");
    this.#instance ??= new FloorsManager();
    this.#instance.render({ force: true });
    return this.#instance;
  }

  /** Escada/elevador sendo montado: { kind, from, to, picks:Set, playersSee }. */
  pending = null;
  #busy = false;

  constructor(options) {
    super(options);
    const rerender = () => { if (this.rendered && !this.#busy && !this.#isTyping()) this.render(); };
    this._hooks = ["createLevel", "updateLevel", "deleteLevel", "createRegion", "updateRegion", "deleteRegion", "canvasReady", "updateScene", "deleteTile"]
      .map((h) => [h, Hooks.on(h, rerender)]);
  }

  get scene() { return canvas?.scene; }

  /** Não redesenha enquanto o usuário preenche "Novo andar" ou digita num campo (perderia o que digitou). */
  #isTyping() {
    const el = this.element;
    if (!el) return false;
    if (el.querySelector("details.ddf-new")?.open) return true;
    const a = document.activeElement;
    return !!(a && el.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && a.type !== "checkbox" && a.type !== "radio");
  }

  /** Recalcula a faixa de altura das escadas/elevadores que passam por estes andares. */
  async #refreshPassages(levelIds = null) {
    const scene = this.scene;
    const updates = [];
    for (const r of this.#passages()) {
      const ids = levelIdsOf(r);
      if (levelIds && !ids.some((id) => levelIds.includes(id))) continue;
      const el = passageElevation(ids.map((id) => scene.levels.get(id)).filter(Boolean));
      if (el && (el.bottom !== r.elevation?.bottom || el.top !== r.elevation?.top)) updates.push({ _id: r.id, elevation: el });
    }
    if (updates.length) await scene.updateEmbeddedDocuments("Region", updates);
  }

  #counts(levelId) {
    const s = this.scene;
    const out = [];
    for (const [, coll, label] of PLACEABLES) {
      const docs = s?.[coll]?.contents ?? [];
      const n = docs.filter((d) => !isFadeTile(d) && levelIdsOf(d).includes(levelId)).length;
      if (n) out.push(`${n} ${label[n === 1 ? 0 : 1]}`);
    }
    return out.join(" · ") || "vazio";
  }

  #passages() {
    return (this.scene?.regions?.contents ?? []).filter((r) => r.getFlag?.(MODULE_ID, "passage") ?? r.flags?.[MODULE_ID]?.passage);
  }

  #selectedDocs() {
    const layer = canvas?.activeLayer;
    return (layer?.controlled ?? []).map((o) => o.document)
      .filter((d) => d && "levels" in (d._source ?? {}) && !d.flags?.[MODULE_ID]?.passage && !isFadeTile(d)); // escadas: use a engrenagem
  }

  async _renderHTML() {
    const scene = this.scene;
    const levels = sceneLevels(scene).slice().reverse();
    const viewed = viewedLevelId(scene);
    const initial = scene?._source?.initialLevel ?? scene?.initialLevel?.id ?? null;
    const sel = this.#selectedDocs();
    const selLabel = sel.length ? `${sel.length} selecionado${sel.length === 1 ? "" : "s"}` : "";
    const all = sceneLevels(scene);
    const sightHTML = (l) => {
      if (all.length < 2) return "";
      const s = seenBy(all, l);
      const chip = (id, up) => {
        const o = scene.levels.get(id);
        const on = (up ? s.above : s.below).includes(id);
        return `<label class="ddf-check ddf-sight-chip" data-tooltip="${up ? "Andar de cima: aparece por cima, em fade (some quando o token passa embaixo)" : "Andar de baixo: aparece embaixo, visto de cima"}">
          <input type="checkbox" name="sight" value="${id}" ${on ? "checked" : ""}><span><i class="fa-solid ${up ? "fa-arrow-up" : "fa-arrow-down"}"></i> ${esc(o?.name ?? "Andar")}</span></label>`;
      };
      return `<div class="ddf-sight"><span class="ddi-label">Vê</span>${s.upper.slice().reverse().map((id) => chip(id, true)).join("")}${s.lower.slice().reverse().map((id) => chip(id, false)).join("")}</div>`;
    };

    const rows = levels.map((l, i) => `
      <article class="ddf-level ${l.id === viewed ? "is-viewed" : ""}" data-level="${l.id}">
        <header class="ddf-level-head">
          <span class="ddi-floor-badge">${levels.length - i}</span>
          <input class="ddi-floor-name" type="text" name="name" value="${esc(l.name)}" aria-label="Nome do andar">
          <label class="ddf-pill" title="Andar que abre primeiro"><input type="radio" name="initial" value="${l.id}" ${l.id === initial ? "checked" : ""}><span>Inicial</span></label>
          <button type="button" class="ddf-btn ${l.id === viewed ? "is-on" : ""}" data-action="view" data-tooltip="Ver este andar" aria-label="Ver este andar"><i class="fa-solid fa-eye"></i></button>
          <button type="button" class="ddf-btn" data-action="bring" ${sel.length ? "" : "disabled"} data-tooltip="${sel.length ? `Trazer para cá: ${selLabel} da camada atual` : "Selecione objetos no mapa para trazer para este andar"}" aria-label="Trazer selecionados para este andar"><i class="fa-solid fa-arrow-right-to-bracket"></i></button>
          <button type="button" class="ddi-icon-btn" data-action="remove" data-tooltip="Apagar andar" aria-label="Apagar andar" ${levels.length <= 1 ? "disabled" : ""}><i class="fa-solid fa-trash-can"></i></button>
        </header>
        <div class="ddi-row">
          <label class="ddi-field ddi-grow"><span class="ddi-label">URL da imagem</span>
            <span class="ddi-input-icon"><i class="fa-solid fa-link"></i><input type="text" name="src" value="${esc(srcOf(l))}" placeholder="https://i.imgur.com/....png" autocomplete="off"></span></label>
          <label class="ddi-field ddi-narrow"><span class="ddi-label">Chão</span>
            <span class="ddi-suffix"><input type="number" name="bottom" value="${bottomOf(l)}" step="any"><em>m</em></span></label>
          <label class="ddi-field ddi-narrow"><span class="ddi-label">Teto</span>
            <span class="ddi-suffix"><input type="number" name="top" value="${Math.round(topOf(l) * 100) / 100}" step="any"><em>m</em></span></label>
        </div>
        <div class="ddf-level-foot">
          <span class="ddi-hint">${esc(this.#counts(l.id))}</span>
        </div>
        ${sightHTML(l)}
      </article>`).join("");

    const passages = this.#passages();
    const name = (id) => scene.levels.get(id)?.name ?? "?";
    const passageRows = passages.map((r) => `
      <li class="ddf-passage" data-region="${r.id}">
        <i class="fa-solid ${(r.flags?.[MODULE_ID]?.passage === "elevator") ? "fa-elevator" : "fa-stairs"}" aria-hidden="true"></i>
        <span class="ddf-passage-name">${esc(r.name)}</span>
        ${(() => { const lv = levelIdsOf(r).map(name).join(" ↔ "); return r.name?.includes(lv) ? "" : `<span class="ddi-hint">${esc(lv)}</span>`; })()}
        <button type="button" class="ddf-btn" data-action="editShape" data-tooltip="Editar a área no mapa (pintar/apagar quadrados)" aria-label="Editar a área"><i class="fa-solid fa-pen-ruler"></i></button>
        <button type="button" class="ddf-btn" data-action="editPassage" data-tooltip="Trocar andares, tipo e quem vê" aria-label="Trocar andares e opções"><i class="fa-solid fa-gear"></i></button>
        <button type="button" class="ddf-btn" data-action="goPassage" data-tooltip="Mostrar no mapa" aria-label="Mostrar no mapa"><i class="fa-solid fa-location-crosshairs"></i></button>
        <button type="button" class="ddi-icon-btn" data-action="deletePassage" data-tooltip="Apagar" aria-label="Apagar"><i class="fa-solid fa-trash-can"></i></button>
      </li>`).join("");

    const p = this.pending;
    const sorted = sceneLevels(scene);
    const optionList = (selected) => sorted.slice().reverse().map((l) => `<option value="${l.id}" ${l.id === selected ? "selected" : ""}>${esc(l.name)}</option>`).join("");
    const regionsSel = (canvas?.regions?.controlled ?? []).length;
    const pendingHTML = !p ? "" : `
      <div class="ddf-pending">
        ${p.regionId ? `<div class="ddf-pending-title"><i class="fa-solid fa-gear"></i> Editando: <b>${esc(scene.regions.get(p.regionId)?.name ?? "")}</b></div>` : ""}
        <div class="ddst-seg" role="radiogroup" aria-label="Tipo de passagem">
          <label><input type="radio" name="pkind" value="stairs" ${p.kind === "stairs" ? "checked" : ""}><span><i class="fa-solid fa-stairs"></i> Escada</span></label>
          <label><input type="radio" name="pkind" value="elevator" ${p.kind === "elevator" ? "checked" : ""}><span><i class="fa-solid fa-elevator"></i> Elevador</span></label>
        </div>
        ${p.kind === "stairs" ? `
          <div class="ddi-row">
            <label class="ddi-field ddi-grow"><span class="ddi-label">Liga</span><select name="pfrom">${optionList(p.from)}</select></label>
            <label class="ddi-field ddi-grow"><span class="ddi-label">com</span><select name="pto">${optionList(p.to)}</select></label>
          </div>
          <p class="ddi-hint">O token que entrar na área troca de andar. Funciona nos dois sentidos.</p>` : `
          <div class="ddf-picks" role="group" aria-label="Andares do elevador">
            ${sorted.slice().reverse().map((l) => `<label class="ddf-check"><input type="checkbox" name="ppick" value="${l.id}" ${p.picks.has(l.id) ? "checked" : ""}><span>${esc(l.name)}</span></label>`).join("")}
          </div>
          <p class="ddi-hint">Ao entrar, o Foundry pergunta para qual andar ir.</p>`}
        <label class="ddf-check"><input type="checkbox" name="pplayers" ${p.playersSee ? "checked" : ""}><span>Jogadores veem a área marcada</span></label>
        <div class="ddf-pending-actions">
          <button type="button" class="ddg-ghost" data-action="cancelPassage">Cancelar</button>
          ${p.regionId ? `
          <button type="button" class="ddi-primary" data-action="savePassage"><i class="fa-solid fa-check"></i> Salvar</button>` : `
          ${regionsSel ? `<button type="button" class="ddg-ghost" data-action="useSelected"><i class="fa-solid fa-object-group"></i> Usar a região selecionada</button>` : ""}
          <button type="button" class="ddi-primary" data-action="draw"><i class="fa-solid fa-paintbrush"></i> Marcar no mapa</button>`}
        </div>
        ${p.regionId ? "" : `<p class="ddi-hint">No mapa: um quadrado segue o mouse; clique e arraste para pintar, Shift apaga. Dá para editar depois.</p>`}
      </div>`;

    const suggested = nextFloorBottom(sorted);
    return `
    <div class="ddi-body ddf-body">
      <section class="ddi-card">
        <h3 class="ddi-card-title"><i class="fa-solid fa-building"></i> Andares <span class="ddi-hint">(de cima para baixo)</span></h3>
        <div class="ddf-scene-opts">
          <label class="ddf-check" data-tooltip="Ilumina a cena inteira (todos os andares), sem precisar de luzes"><input type="checkbox" name="globalLight" ${globalLightOf(scene) ? "checked" : ""}><span><i class="fa-solid fa-sun"></i> Iluminação global</span></label>
          ${sorted.length > 1 ? `<span class="ddf-sight-all">
            <button type="button" class="ddg-ghost" data-action="sightAll" data-mode="all" data-tooltip="Todos os andares veem todos (os de cima em fade)"><i class="fa-solid fa-eye"></i> Todos veem todos</button>
            <button type="button" class="ddg-ghost" data-action="sightAll" data-mode="below" data-tooltip="Só os andares de cima veem os de baixo"><i class="fa-solid fa-arrow-down"></i> Só para baixo</button>
            <button type="button" class="ddg-ghost" data-action="sightAll" data-mode="none" data-tooltip="Cada andar vê só ele mesmo"><i class="fa-solid fa-eye-slash"></i> Nenhum</button>
          </span>` : ""}
        </div>
        ${rows || `<p class="ddi-hint">Esta cena ainda não tem andares.</p>`}
        ${sorted.length > 1 ? `<p class="ddi-hint"><i class="fa-solid fa-arrow-up"></i> andar de cima: aparece por cima em fade e some quando o token passa embaixo (a imagem precisa ter fundo transparente fora da construção). <i class="fa-solid fa-arrow-down"></i> andar de baixo: aparece embaixo. Ver o outro andar também deixa os tokens se enxergarem entre andares.</p>` : ""}
        <p class="ddi-hint">Objetos novos entram no andar que você está vendo. Para mudar depois: botão <i class="fa-solid fa-layer-group"></i> no menu do objeto (clique direito), ou selecione e use <i class="fa-solid fa-arrow-right-to-bracket"></i> aqui.</p>
      </section>

      <section class="ddi-card">
        <h3 class="ddi-card-title"><i class="fa-solid fa-stairs"></i> Escadas e elevadores</h3>
        ${p ? pendingHTML : `
        <div class="ddf-make">
          <button type="button" class="ddf-big" data-action="passage" data-kind="stairs" ${sorted.length < 2 ? "disabled" : ""}><i class="fa-solid fa-stairs"></i><span>Escada</span></button>
          <button type="button" class="ddf-big" data-action="passage" data-kind="elevator" ${sorted.length < 2 ? "disabled" : ""}><i class="fa-solid fa-elevator"></i><span>Elevador</span></button>
        </div>
        ${sorted.length < 2 ? `<p class="ddi-hint">Precisa de pelo menos dois andares.</p>` : ""}`}
        ${passageRows ? `<ul class="ddf-passages">${passageRows}</ul>` : ""}
      </section>

      <details class="ddi-card ddf-new">
        <summary class="ddi-card-title"><i class="fa-solid fa-plus"></i> Novo andar</summary>
        <div class="ddi-row">
          <label class="ddi-field ddi-grow"><span class="ddi-label">Nome</span><input type="text" name="newName" placeholder="Andar ${sorted.length + 1}"></label>
          <label class="ddi-field ddi-narrow"><span class="ddi-label">Chão</span><span class="ddi-suffix"><input type="number" name="newBottom" value="${suggested}" step="any"><em>m</em></span></label>
        </div>
        <label class="ddi-field"><span class="ddi-label">URL da imagem</span>
          <span class="ddi-input-icon"><i class="fa-solid fa-link"></i><input type="text" name="newSrc" placeholder="https://i.imgur.com/....png" autocomplete="off"></span></label>
        <label class="ddi-field"><span class="ddi-label">Paredes, portas e luzes (opcional)</span>
          <input type="file" name="newFile" accept=".dd2vtt,.uvtt,.json"></label>
        <label class="ddf-check"><input type="checkbox" name="newSeeBelow" checked><span>Vê os andares de baixo</span></label>
        <label class="ddf-check"><input type="checkbox" name="newSeeAbove" checked><span>Vê os andares de cima (em fade)</span></label>
        <label class="ddf-check"><input type="checkbox" name="newSeenByOthers" checked><span>Os outros andares veem este</span></label>
        <div class="ddf-pending-actions"><button type="button" class="ddi-primary" data-action="addFloor"><i class="fa-solid fa-plus"></i> Criar andar</button></div>
      </details>
    </div>`;
  }

  _replaceHTML(result, content) {
    const open = content.querySelector?.("details.ddf-new")?.open;
    content.innerHTML = result;
    if (open) content.querySelector("details.ddf-new").open = true;
  }

  async _onRender(context, options) {
    await super._onRender?.(context, options);
    if (this._listening) return;
    this._listening = true;
    // Cenas da 1.9.0/1.9.1 (tiles de andar): volta a imagem para o fundo de cada andar.
    if (game.user?.isGM && needsRestore(this.scene)) {
      this.#busy = true;
      restoreLevelImages(this.scene)
        .then(() => ui.notifications.info("Andares arrumados: cada andar voltou a usar a própria imagem (sem tiles extras)."))
        .catch((err) => { console.error(err); ui.notifications.error(`Não deu para atualizar os andares: ${err.message}`); })
        .finally(() => { this.#busy = false; this.render(); });
    }
    this.element.addEventListener("change", (ev) => this.#onChange(ev));
    this._ctrlHooks = ["controlTile", "controlWall", "controlAmbientLight", "controlAmbientSound", "controlRegion", "controlDrawing", "controlNote"]
      .map((h) => [h, Hooks.on(h, foundry.utils.debounce(() => this.rendered && !this.#busy && !this.pending && !this.#isTyping() && this.render(), 150))]);
    // Ao fechar "Novo andar", atualiza o que ficou para trás enquanto estava aberto.
    this.element.addEventListener("toggle", (ev) => { if (ev.target.matches?.("details.ddf-new") && !ev.target.open && !this.#busy) this.render(); }, true);
  }

  async #onChange(ev) {
    const t = ev.target;
    // Escada/elevador sendo montado: só guarda as escolhas.
    if (this.pending && ["pkind", "pfrom", "pto", "ppick", "pplayers"].includes(t.name)) {
      const p = this.pending;
      if (t.name === "pkind") { p.kind = t.value; return this.render(); }
      if (t.name === "pfrom") p.from = t.value;
      if (t.name === "pto") p.to = t.value;
      if (t.name === "ppick") { if (t.checked) p.picks.add(t.value); else p.picks.delete(t.value); }
      if (t.name === "pplayers") p.playersSee = t.checked;
      return;
    }
    const scene = this.scene;
    if (t.name === "globalLight" && scene) {
      this.#busy = true;
      try { await setGlobalLight(scene, t.checked); }
      catch (err) { console.error(err); ui.notifications.error(`Não deu para salvar: ${err.message}`); }
      finally { this.#busy = false; this.render(); }
      return;
    }
    const row = t.closest(".ddf-level");
    if (!row || !scene) return;
    const id = row.dataset.level;
    const level = scene.levels.get(id);
    if (!level) return;
    this.#busy = true;
    try {
      if (t.name === "initial") await scene.update({ initialLevel: id });
      else if (t.name === "name") await level.update({ name: t.value.trim() || level.name });
      else if (t.name === "src") await level.update({ "background.src": t.value.trim(), [`flags.${MODULE_ID}.src`]: t.value.trim() });
      else if (t.name === "bottom" || t.name === "top") {
        const bottom = num(row.querySelector('[name="bottom"]').value, bottomOf(level));
        let top = num(row.querySelector('[name="top"]').value, topOf(level));
        if (top <= bottom) top = bottom + 0.01;
        await level.update({ "elevation.bottom": bottom, "elevation.top": top });
        await this.#refreshPassages([id]);
      } else if (t.name === "sight") {
        await level.update({ "visibility.levels": toggleSight(level.visibility?.levels, t.value, t.checked) });
      }
    } catch (err) {
      console.error(err);
      ui.notifications.error(`Não deu para salvar: ${err.message}`);
    } finally {
      this.#busy = false;
      this.render();
    }
  }

  /* ---------------- ações dos andares ---------------- */

  static async #onSightAll(event, target) {
    const scene = this.scene;
    const mode = target.dataset.mode;
    const sorted = sceneLevels(scene);
    const updates = sorted.map((l, i) => ({
      _id: l.id,
      "visibility.levels": mode === "none" ? [] : mode === "below" ? sorted.slice(0, i).map((o) => o.id)
        : sorted.filter((o) => o.id !== l.id).map((o) => o.id)
    }));
    this.#busy = true;
    try {
      await scene.updateEmbeddedDocuments("Level", updates);
    } catch (err) { console.error(err); ui.notifications.error(`Não deu para salvar: ${err.message}`); }
    finally { this.#busy = false; this.render(); }
  }

  static async #onView(event, target) {
    const id = target.closest(".ddf-level")?.dataset.level;
    if (!id) return;
    await this.scene.view({ level: id });
  }

  static async #onBring(event, target) {
    const id = target.closest(".ddf-level")?.dataset.level;
    const docs = this.#selectedDocs();
    if (!id || !docs.length) return ui.notifications.warn("Selecione objetos no mapa (na camada atual) primeiro. Escadas e elevadores mudam pela engrenagem na lista.");
    const n = await setLevels(docs, id, event.shiftKey ? "toggle" : "move");
    ui.notifications.info(`${n} objeto(s) agora no andar “${this.scene.levels.get(id)?.name}”.`);
    this.render();
  }

  static async #onRemove(event, target) {
    const scene = this.scene;
    const id = target.closest(".ddf-level")?.dataset.level;
    const level = scene.levels.get(id);
    if (!level) return;
    const only = [];
    for (const [type, coll] of PLACEABLES) {
      const ids = (scene[coll]?.contents ?? []).filter((d) => { const l = levelIdsOf(d); return !isFadeTile(d) && l.length === 1 && l[0] === id; }).map((d) => d.id);
      if (ids.length) only.push([type, ids]);
    }
    const total = only.reduce((s, [, ids]) => s + ids.length, 0);
    const others = sceneLevels(scene).filter((l) => l.id !== id);
    const nearest = others.slice().sort((a, b) => Math.abs(bottomOf(a) - bottomOf(level)) - Math.abs(bottomOf(b) - bottomOf(level)))[0];
    const DialogV2 = foundry.applications.api.DialogV2;
    let alsoObjects = false;
    const ok = await DialogV2.wait({
      window: { title: "Apagar andar" },
      content: `<p>Apagar o andar <b>${esc(level.name)}</b>?</p>
        ${total ? `<label class="ddf-check"><input type="checkbox" name="alsoObjects" checked> <span>Apagar também os ${total} objeto(s) que estão só neste andar</span></label>
          <p class="ddi-hint">Desmarcando, eles vão para o andar “${esc(nearest?.name ?? "")}”.</p>` : ""}`,
      buttons: [
        { action: "yes", label: "Apagar", icon: "fa-solid fa-trash-can", callback: (ev, button) => { alsoObjects = !!button.form?.elements?.alsoObjects?.checked; return true; } },
        { action: "no", label: "Cancelar", default: true, callback: () => false }
      ],
      rejectClose: false
    });
    if (!ok) return;
    this.#busy = true;
    try {
      const fadeIds = (scene.tiles?.contents ?? []).filter((t) => { const f = t.flags?.[MODULE_ID]; return f?.floor === id || f?.fade?.of === id || f?.fade?.in === id; }).map((t) => t.id);
      if (fadeIds.length) await scene.deleteEmbeddedDocuments("Tile", fadeIds);
      const onlyNoFade = only.map(([type, ids]) => [type, ids.filter((x) => !fadeIds.includes(x))]).filter(([, ids]) => ids.length);
      if (alsoObjects) for (const [type, ids] of onlyNoFade) await scene.deleteEmbeddedDocuments(type, ids);
      // Tira o andar apagado de tudo que aponta para ele (objetos, escadas, visão dos outros andares).
      const deletePassages = [];
      for (const [type, coll] of PLACEABLES) {
        const updates = [];
        for (const d of scene[coll]?.contents ?? []) {
          const lv = levelIdsOf(d);
          if (!lv.includes(id) || isFadeTile(d)) continue;
          const rest = lv.filter((x) => x !== id);
          if (d.flags?.[MODULE_ID]?.passage) {
            if (rest.length < 2) { deletePassages.push(d.id); continue; }
            const restDocs = levelsByHeight(rest.map((x) => scene.levels.get(x)).filter(Boolean));
            const u = { _id: d.id, levels: rest, elevation: passageElevation(restDocs) };
            const m = /^(Escada|Elevador):/.exec(d.name ?? "");
            if (m) u.name = `${m[1]}: ${restDocs.map((l) => l.name).join(" ↔ ")}`;
            updates.push(u);
          } else {
            updates.push({ _id: d.id, levels: rest.length ? rest : (nearest ? [nearest.id] : []) });
          }
        }
        if (updates.length) await scene.updateEmbeddedDocuments(type, updates);
      }
      if (deletePassages.length) await scene.deleteEmbeddedDocuments("Region", deletePassages);
      const visUpdates = dropFromSight(sceneLevels(scene), id);
      if (visUpdates.length) await scene.updateEmbeddedDocuments("Level", visUpdates);
      if ((scene._source.initialLevel ?? scene.initialLevel?.id) === id) {
        const other = sceneLevels(scene).find((l) => l.id !== id);
        if (other) await scene.update({ initialLevel: other.id });
      }
      if (viewedLevelId(scene) === id) {
        const other = sceneLevels(scene).find((l) => l.id !== id);
        if (other) await scene.view({ level: other.id });
      }
      await scene.deleteEmbeddedDocuments("Level", [id]);
    } finally {
      this.#busy = false;
      this.render();
    }
  }

  static async #onAddFloor() {
    const scene = this.scene;
    const el = this.element;
    const name = el.querySelector('[name="newName"]').value.trim() || `Andar ${sceneLevels(scene).length + 1}`;
    const src = el.querySelector('[name="newSrc"]').value.trim();
    const bottom = num(el.querySelector('[name="newBottom"]').value, nextFloorBottom(sceneLevels(scene)));
    const file = el.querySelector('[name="newFile"]').files?.[0];
    const seeBelow = el.querySelector('[name="newSeeBelow"]').checked;
    const seeAbove = el.querySelector('[name="newSeeAbove"]').checked;
    const seenByOthers = el.querySelector('[name="newSeenByOthers"]').checked;
    const btn = el.querySelector('[data-action="addFloor"]');
    btn.classList.add("is-busy");
    this.#busy = true;
    try {
      const uvtt = file ? JSON.parse(await file.text()) : null;
      if (uvtt && !uvtt?.resolution?.map_size) throw new Error("o arquivo não parece ser .dd2vtt/.uvtt");
      const others = sceneLevels(scene);
      const height = others.length ? Math.max(0.5, topOf(others[others.length - 1]) - bottomOf(others[others.length - 1])) : 3;
      const above = others.filter((l) => bottomOf(l) > bottom);
      const data = {
        name,
        sort: others.length,
        elevation: { bottom, top: above.length ? bottomOf(above[0]) : bottom + height },
        ...(src ? { background: { src } } : {}),
        visibility: { levels: [
          ...(seeBelow ? others.filter((l) => bottomOf(l) < bottom).map((l) => l.id) : []),
          ...(seeAbove ? others.filter((l) => bottomOf(l) > bottom).map((l) => l.id) : [])
        ] }
      };
      const [level] = await scene.createEmbeddedDocuments("Level", [data]);
      if (level && seenByOthers && others.length) {
        await scene.updateEmbeddedDocuments("Level", others.map((l) => ({ _id: l.id, "visibility.levels": toggleSight(l.visibility?.levels, level.id, true) })));
      }
      let note = "";
      if (uvtt && level) {
        const api = game.modules.get(MODULE_ID)?.api;
        const stats = await api.addFloorContent(scene, level.id, uvtt, bottom);
        note = ` ${stats.walls} paredes, ${stats.doors} portas, ${stats.windows} janelas, ${stats.lights} luzes.`;
      }
      ui.notifications.info(`Andar “${name}” criado.${note}`);
      el.querySelector("details.ddf-new").open = false;
    } catch (err) {
      console.error(err);
      ui.notifications.error(`Não deu para criar o andar: ${err.message}`);
    } finally {
      this.#busy = false;
      this.render();
    }
  }

  /* ---------------- escadas e elevadores ---------------- */

  static #onPassage(event, target) {
    const sorted = sceneLevels(this.scene);
    const here = viewedLevelId(this.scene) ?? sorted[0]?.id;
    const up = levelAbove(sorted, here);
    const from = up ? here : (sorted[sorted.length - 2]?.id ?? here);
    const to = up ? up.id : (sorted[sorted.length - 1]?.id ?? here);
    this.pending = { kind: target.dataset.kind || "stairs", from, to, picks: new Set(sorted.map((l) => l.id)), playersSee: false };
    this.render();
  }

  static #onCancelPassage() { this.pending = null; this.render(); }

  #pendingLevels() {
    const p = this.pending;
    const scene = this.scene;
    const ids = p.kind === "stairs" ? [p.from, p.to] : [...p.picks];
    const unique = [...new Set(ids)].map((id) => scene.levels.get(id)).filter(Boolean);
    if (unique.length < 2) throw new Error(p.kind === "stairs" ? "Escolha dois andares diferentes." : "Marque pelo menos dois andares.");
    return unique;
  }

  /** Abre o editor de quadrados com a janela minimizada. */
  async #paint(cells, title, color) {
    await this.minimize?.();
    try { return await CellPainter.open({ cells, title, color }); }
    finally { await this.maximize?.(); }
  }

  static async #onDraw() {
    let levels;
    try { levels = this.#pendingLevels(); } catch (err) { return ui.notifications.warn(err.message); }
    if (!changeLevelType()) return ui.notifications.error("Este Foundry não tem o efeito de região “Trocar de andar” (precisa da versão 14).");
    const p = this.pending;
    const label = p.kind === "elevator" ? "Elevador" : "Escada";
    const cells = await this.#paint(new Set(), `${label}: ${levels.map((l) => l.name).join(" ↔ ")}`, p.kind === "elevator" ? "#a17fc9" : "#cca162");
    if (!cells?.size) return;
    this.#busy = true;
    try {
      await createPassage({ cells, levels, kind: p.kind, playersSee: p.playersSee, scene: this.scene });
      ui.notifications.info(`${label} criad${p.kind === "elevator" ? "o" : "a"}: ${levels.map((l) => l.name).join(" ↔ ")}.`);
      this.pending = null;
    } catch (err) { console.error(err); ui.notifications.error(`Não deu para criar: ${err.message}`); }
    finally { this.#busy = false; this.render(); }
  }

  /** Editar a área de uma escada/elevador que já existe. */
  static async #onEditShape(event, target) {
    const region = this.scene.regions.get(target.closest(".ddf-passage")?.dataset.region);
    if (!region) return;
    const kind = region.flags?.[MODULE_ID]?.passage;
    const cells = await this.#paint(regionCells(region), region.name, kind === "elevator" ? "#a17fc9" : "#cca162");
    if (!cells) return;
    if (!cells.size) return ui.notifications.warn("A área ficou vazia. Para tirar a escada, use a lixeira.");
    this.#busy = true;
    try {
      await region.update({ shapes: cellsToShapes(cells) });
      ui.notifications.info(`Área de “${region.name}” atualizada (${cells.size} quadrado${cells.size === 1 ? "" : "s"}).`);
    } catch (err) { console.error(err); ui.notifications.error(`Não deu para salvar a área: ${err.message}`); }
    finally { this.#busy = false; this.render(); }
  }

  /** Trocar andares, tipo e visibilidade de uma escada/elevador que já existe. */
  static #onEditPassage(event, target) {
    const region = this.scene.regions.get(target.closest(".ddf-passage")?.dataset.region);
    if (!region) return;
    const ids = levelIdsOf(region);
    const sorted = sceneLevels(this.scene).filter((l) => ids.includes(l.id));
    const kind = region.flags?.[MODULE_ID]?.passage === "elevator" ? "elevator" : "stairs";
    const ALWAYS = CONST.REGION_VISIBILITY?.ALWAYS ?? 2;
    this.pending = {
      regionId: region.id, kind,
      from: sorted[0]?.id ?? null, to: sorted[sorted.length - 1]?.id ?? null,
      picks: new Set(ids), playersSee: region.visibility === ALWAYS
    };
    this.render();
  }

  static async #onSavePassage() {
    const p = this.pending;
    const region = this.scene.regions.get(p?.regionId);
    if (!region) { this.pending = null; return this.render(); }
    let levels;
    try { levels = this.#pendingLevels(); } catch (err) { return ui.notifications.warn(err.message); }
    const type = changeLevelType() ?? "changeLevel";
    const data = passageRegionData({ rects: [], levels, kind: p.kind, behaviorType: type, moduleId: MODULE_ID });
    const VIS = CONST.REGION_VISIBILITY ?? {};
    const update = {
      elevation: data.elevation, levels: data.levels, color: data.color,
      visibility: p.playersSee ? (VIS.ALWAYS ?? 2) : (VIS.LAYER ?? 0),
      [`flags.${MODULE_ID}.passage`]: p.kind
    };
    // Nome automático acompanha os andares; nome escolhido pelo usuário fica.
    if (/^(Escada|Elevador):/.test(region.name ?? "")) update.name = data.name;
    this.#busy = true;
    try {
      await region.update(update);
      if (!region.behaviors?.some?.((b) => b.type === type)) await region.createEmbeddedDocuments("RegionBehavior", data.behaviors);
      ui.notifications.info(`“${update.name ?? region.name}” atualizado.`);
      this.pending = null;
    } catch (err) { console.error(err); ui.notifications.error(`Não deu para salvar: ${err.message}`); }
    finally { this.#busy = false; this.render(); }
  }

  /** Transforma regiões já desenhadas (selecionadas na camada de Regiões) em escada/elevador. */
  static async #onUseSelected() {
    const regions = (canvas?.regions?.controlled ?? []).map((r) => r.document).filter(Boolean);
    if (!regions.length) return ui.notifications.warn("Selecione uma região na camada de Regiões.");
    let levels;
    try { levels = this.#pendingLevels(); } catch (err) { return ui.notifications.warn(err.message); }
    const type = changeLevelType();
    if (!type) return ui.notifications.error("Este Foundry não tem o efeito de região “Trocar de andar”.");
    const p = this.pending;
    this.#busy = true;
    try {
      for (const region of regions) {
        const data = passageRegionData({ rect: { x: 0, y: 0, width: 1, height: 1 }, levels, kind: p.kind, behaviorType: type, moduleId: MODULE_ID });
        const update = { _id: region.id, elevation: data.elevation, levels: data.levels, [`flags.${MODULE_ID}.passage`]: p.kind };
        if (!region.name || /^Region|^Região/i.test(region.name)) update.name = data.name;
        if (p.playersSee) update.visibility = CONST.REGION_VISIBILITY?.ALWAYS ?? 2;
        await this.scene.updateEmbeddedDocuments("Region", [update]);
        if (!region.behaviors?.some((b) => b.type === type)) await region.createEmbeddedDocuments("RegionBehavior", data.behaviors);
      }
      ui.notifications.info(`${regions.length} região(ões) virou(aram) ${p.kind === "elevator" ? "elevador" : "escada"}.`);
      this.pending = null;
    } catch (err) {
      console.error(err);
      ui.notifications.error(`Não deu para converter: ${err.message}`);
    } finally { this.#busy = false; this.render(); }
  }

  static async #onGoPassage(event, target) {
    const region = this.scene.regions.get(target.closest(".ddf-passage")?.dataset.region);
    const cells = region ? regionCells(region) : new Set();
    if (!cells.size) return;
    const size = canvas?.grid?.size ?? 100;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const k of cells) { const [cx, cy] = parseCell(k); x0 = Math.min(x0, cx); y0 = Math.min(y0, cy); x1 = Math.max(x1, cx + 1); y1 = Math.max(y1, cy + 1); }
    canvas.animatePan?.({ x: ((x0 + x1) / 2) * size, y: ((y0 + y1) / 2) * size, duration: 400 });
  }

  static async #onDeletePassage(event, target) {
    const id = target.closest(".ddf-passage")?.dataset.region;
    const region = id && this.scene.regions.get(id);
    if (!region) return;
    const ok = await foundry.applications.api.DialogV2.wait({
      window: { title: "Apagar" },
      content: `<p>Apagar <b>${esc(region.name)}</b>?</p>`,
      buttons: [
        { action: "yes", label: "Apagar", icon: "fa-solid fa-trash-can", callback: () => true },
        { action: "no", label: "Cancelar", default: true, callback: () => false }
      ],
      rejectClose: false
    });
    if (!ok) return;
    if (this.pending?.regionId === id) this.pending = null;
    await this.scene.deleteEmbeddedDocuments("Region", [id]);
  }

  async close(options) {
    CellPainter.active?.finish(null);
    for (const [name, id] of [...(this._hooks ?? []), ...(this._ctrlHooks ?? [])]) Hooks.off(name, id);
    FloorsManager.#instance = null;
    return super.close(options);
  }
}
