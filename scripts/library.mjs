/**
 * Biblioteca de artes de portas e janelas: configurações, leitura das pastas (PC ou Forge),
 * nomes da Forgotten Adventures, sons e atualização de caminhos.
 */
import { interiorSide, shouldReverse } from "./uvtt.mjs";

export const MODULE_ID = "dd2vtt-url-importer";

const IMAGE_EXT = [".png", ".webp", ".jpg", ".jpeg"];
const MAX_FILES = 4000;
const MAX_DEPTH = 5;

export const MATERIALS = {
  wood: { label: "Madeira", icon: "fa-tree" },
  stone: { label: "Pedra", icon: "fa-cubes-stacked" },
  metal: { label: "Metal", icon: "fa-shield-halved" },
  other: { label: "Outras", icon: "fa-shapes" }
};

const COLOR_LABELS = {
  ashen: "Cinzenta", dark: "Escura", light: "Clara", red: "Avermelhada", walnut: "Nogueira",
  earthy: "Terrosa", redrock: "Rocha vermelha", sandstone: "Arenito", slate: "Ardósia", volcanic: "Vulcânica",
  gray: "Cinza", rusty: "Ferrugem"
};

export const ANIMATION_FALLBACK = { swing: "Girar na dobradiça", slide: "Deslizar", ascend: "Subir", descend: "Descer", swivel: "Girar no centro" };

/* ------------------------------------------------------------------ */
/* Configurações                                                       */
/* ------------------------------------------------------------------ */

export const DEFAULT_DOOR_STYLE = { art: "", type: "swing", duration: 500, sound: "auto", vary: false, openSide: "out" };
export const DEFAULT_WINDOW_STYLE = { art: "", type: "swing", duration: 500, sound: "auto", vary: false, mode: "open", startOpen: false, openSide: "out", noGap: true, v: 2 };

export function registerSettings() {
  const reload = () => Library.clear();
  game.settings.register(MODULE_ID, "doorFolder", {
    name: "Pasta das artes de porta",
    hint: "Pasta com as folhas de porta (ex.: Door_Wood_Walnut_A_1x1.png). Pode ser no PC ou na Forge; dá para trocar quando quiser.",
    scope: "world", config: true, restricted: true, type: String, default: "", filePicker: "folder", onChange: reload
  });
  game.settings.register(MODULE_ID, "windowFolder", {
    name: "Pasta das artes de janela",
    hint: "Pasta com as folhas de janela (ex.: Window_Wood_Light_A_1x1.png).",
    scope: "world", config: true, restricted: true, type: String, default: "", filePicker: "folder", onChange: reload
  });
  game.settings.register(MODULE_ID, "windowOpenVariants", {
    name: "Variantes de janela que abrem",
    hint: "Letras das variantes que são folhas de abrir (separadas por vírgula). Nas janelas da FA: A e B. As outras são janelas fixas.",
    scope: "world", config: true, restricted: true, type: String, default: "A, B", onChange: reload
  });
  game.settings.register(MODULE_ID, "doubleThreshold", {
    name: "Porta dupla a partir de (quadrados)",
    hint: "Aberturas com esse comprimento ou mais viram porta/janela dupla, abrindo do centro.",
    scope: "world", config: true, restricted: true, type: Number, default: 1.6, range: { min: 1, max: 4, step: 0.1 }
  });
  game.settings.register(MODULE_ID, "doorStyle", { scope: "world", config: false, type: Object, default: DEFAULT_DOOR_STYLE });
  game.settings.register(MODULE_ID, "windowStyle", { scope: "world", config: false, type: Object, default: DEFAULT_WINDOW_STYLE });
}

export const getSetting = (key) => game.settings.get(MODULE_ID, key);
export const setSetting = (key, value) => game.settings.set(MODULE_ID, key, value);

export function getStyle(kind) {
  const base = kind === "window" ? DEFAULT_WINDOW_STYLE : DEFAULT_DOOR_STYLE;
  const saved = { ...(getSetting(kind === "window" ? "windowStyle" : "doorStyle") ?? {}) };
  // 1.5.2: janelas passaram a ter som por padrão; escolhas salvas antes disso com "sem som" viram "automático".
  if (kind === "window" && !(saved.v >= 2)) {
    if (!saved.sound || saved.sound === "none") saved.sound = "auto";
    saved.v = 2;
  }
  return { ...base, ...saved };
}
export function saveStyle(kind, style) {
  return setSetting(kind === "window" ? "windowStyle" : "doorStyle", style);
}

/* ------------------------------------------------------------------ */
/* Nomes de arquivo                                                    */
/* ------------------------------------------------------------------ */

const FA_RE = /^(Door|Window)_(Wood|Stone|Metal)_([A-Za-z]+)_([A-Z])(\d*)((?:_[A-Za-z]+)*)_(\d+)x(\d+)\.(png|webp|jpe?g)$/i;

export const fileName = (path) => decodeURIComponent(String(path ?? "").split("?")[0].split("/").pop() ?? "");
const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/** Interpreta um arquivo de arte. Molduras e batentes (Frame/Sill) não são folhas e ficam de fora. */
export function parseArt(path, folderKind) {
  const file = fileName(path);
  if (/_(frame|sill)_/i.test(file)) return null;
  const m = file.match(FA_RE);
  if (!m) {
    const label = file.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
    return { path, file, kind: folderKind, material: "other", color: "", letter: "", sub: "", rusty: false, label, fa: false };
  }
  const [, type, material, color, letter, sub, extra] = m;
  const rusty = /_rusty/i.test(extra);
  const mat = material.toLowerCase();
  const colorKey = color.toLowerCase();
  const colorLabel = COLOR_LABELS[colorKey] ?? titleCase(color);
  const variant = `${letter.toUpperCase()}${sub}`;
  return {
    path, file,
    kind: type.toLowerCase() === "window" ? "window" : "door",
    material: mat, color: colorKey, colorLabel, letter: letter.toUpperCase(), sub, rusty,
    label: `${MATERIALS[mat]?.label ?? titleCase(material)} ${colorLabel} · ${variant}${rusty ? " · enferrujada" : ""}`,
    short: `${colorLabel} ${variant}${rusty ? "*" : ""}`,
    fa: true
  };
}

/* ------------------------------------------------------------------ */
/* Leitura das pastas                                                  */
/* ------------------------------------------------------------------ */

function filePickerClass() {
  return foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
}

const isForge = () => typeof ForgeVTT !== "undefined" && !!ForgeVTT?.usingTheForge;

/** Ordem de tentativa de "fonte" para um caminho (Forge, dados locais, S3). */
function sourcesFor(path) {
  if (/^https?:\/\/assets\.forge-vtt\.com\//i.test(path)) return ["forgevtt"];
  if (/^https?:\/\//i.test(path)) return ["forgevtt", "s3", "data"];
  return isForge() ? ["forgevtt", "data"] : ["data", "public"];
}

async function browseRecursive(path) {
  const FP = filePickerClass();
  let lastError = null;
  for (const source of sourcesFor(path)) {
    try {
      const files = [];
      const queue = [{ target: path, depth: 0 }];
      while (queue.length && files.length < MAX_FILES) {
        const { target, depth } = queue.shift();
        const res = await FP.browse(source, target, { extensions: IMAGE_EXT });
        files.push(...(res.files ?? []));
        if (depth < MAX_DEPTH) for (const dir of res.dirs ?? []) queue.push({ target: dir, depth: depth + 1 });
      }
      return files;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error("Não foi possível ler a pasta.");
}

export class Library {
  static #cache = new Map(); // kind -> Promise<entries[]>

  static clear() { this.#cache.clear(); }

  static folder(kind) {
    return String(getSetting(kind === "window" ? "windowFolder" : "doorFolder") ?? "").trim();
  }

  static openVariants() {
    return String(getSetting("windowOpenVariants") ?? "A,B").split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
  }

  /** Lista de artes de um tipo ("door" | "window"). */
  static async load(kind) {
    if (!this.#cache.has(kind)) {
      this.#cache.set(kind, (async () => {
        const folder = this.folder(kind);
        if (!folder) return [];
        const files = await browseRecursive(folder);
        const open = this.openVariants();
        const seen = new Set();
        const entries = [];
        for (const path of files) {
          const e = parseArt(path, kind);
          if (!e || seen.has(e.file)) continue;
          seen.add(e.file);
          e.kind = kind; // a pasta manda: arte na pasta de janelas é janela
          e.openable = kind !== "window" || !e.fa || open.includes(e.letter);
          entries.push(e);
        }
        entries.sort((a, b) => (a.material + a.color + a.letter + a.sub + (a.rusty ? 1 : 0))
          .localeCompare(b.material + b.color + b.letter + b.sub + (b.rusty ? 1 : 0), undefined, { numeric: true }));
        return entries;
      })().catch((err) => { this.#cache.delete(kind); throw err; }));
    }
    return this.#cache.get(kind);
  }

  static async reload(kind) {
    this.#cache.delete(kind);
    return this.load(kind);
  }

  static async find(kind, file) {
    if (!file) return null;
    const entries = await this.load(kind);
    return entries.find((e) => e.file === file || e.path === file) ?? null;
  }

  /** Abre o seletor de pasta do Foundry e salva a escolha. */
  static async chooseFolder(kind) {
    const FP = filePickerClass();
    const current = this.folder(kind);
    return new Promise((resolve) => {
      const picker = new FP({
        type: "folder",
        current,
        callback: async (path) => {
          await setSetting(kind === "window" ? "windowFolder" : "doorFolder", path);
          this.#cache.delete(kind);
          resolve(path);
        }
      });
      picker.render?.({ force: true }) ?? picker.browse?.();
    });
  }
}

/** Sorteia outra variante do mesmo material e cor (e mesma ferrugem). */
export function pickVariant(entry, entries, random = Math.random) {
  if (!entry) return entry;
  const pool = entries.filter((e) => e.kind === entry.kind && e.material === entry.material && e.color === entry.color
    && e.rusty === entry.rusty && e.openable === entry.openable);
  return pool.length ? pool[Math.floor(random() * pool.length)] : entry;
}

/* ------------------------------------------------------------------ */
/* Sons e animações                                                    */
/* ------------------------------------------------------------------ */

export function doorSoundChoices() {
  const sounds = CONFIG.Wall?.doorSounds ?? {};
  return Object.entries(sounds).map(([key, cfg]) => ({ key, label: game.i18n.localize(cfg?.label ?? key) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function animationChoices() {
  const types = CONFIG.Wall?.animationTypes ?? {};
  const keys = Object.keys(types).length ? Object.keys(types) : Object.keys(ANIMATION_FALLBACK);
  return keys.map((key) => ({ key, label: types[key]?.label ? game.i18n.localize(types[key].label) : (ANIMATION_FALLBACK[key] ?? key) }));
}

/** Resolve a escolha de som ("auto" | "none" | chave) para a chave de CONFIG.Wall.doorSounds. */
export function resolveSound(choice, material) {
  if (!choice || choice === "none") return "";
  if (choice !== "auto") return choice;
  const keys = Object.keys(CONFIG.Wall?.doorSounds ?? {});
  const prefer = { wood: ["woodBasic", "wood"], stone: ["stoneBasic", "stone"], metal: ["metal", "industrial"] }[material] ?? ["woodBasic", "wood"];
  for (const p of prefer) {
    const exact = keys.find((k) => k === p);
    if (exact) return exact;
    const partial = keys.find((k) => k.toLowerCase().includes(p.toLowerCase()));
    if (partial) return partial;
  }
  return "";
}

/* ------------------------------------------------------------------ */
/* Portas e janelas na cena                                            */
/* ------------------------------------------------------------------ */

/** Diz se uma parede é porta ou janela (pelas marcas do módulo ou pelas regras da parede). */
export function wallKind(wall) {
  const flag = wall.getFlag?.(MODULE_ID, "kind") ?? wall.flags?.[MODULE_ID]?.kind;
  if (flag === "door" || flag === "window") return flag;
  if (!wall.door) return null;
  return wall.sight === 0 && wall.move > 0 ? "window" : "door";
}

/** Dados de atualização de uma parede para aplicar um estilo. */
export function styleUpdate(wall, { entry, type, duration, sound, double, flip, direction, windowMode, kind, state, noGap, reverse }) {
  const src = wall._source ?? wall;
  const anim = foundry.utils.deepClone(src.animation ?? {});
  const update = { _id: wall.id ?? src._id };
  if (entry) {
    anim.texture = entry.path;
    update[`flags.${MODULE_ID}.art`] = entry.file;
  }
  if (type) anim.type = type;
  if (duration) anim.duration = Number(duration);
  if (double === true || double === false) anim.double = double;
  if (flip === "toggle") anim.flip = !anim.flip;
  if (direction === "toggle") anim.direction = (anim.direction ?? 1) === -1 ? 1 : -1;
  update.animation = anim;
  if (sound !== undefined) {
    const material = entry?.material ?? parseArt(anim.texture ?? "", "door")?.material ?? "wood";
    update.doorSound = resolveSound(sound, material);
  }
  if (state === "open" || state === "closed") update.ds = state === "open" ? 1 : 0;
  if (noGap === true || noGap === false) update[`flags.${MODULE_ID}.noGap`] = noGap;
  if (reverse) {
    const c = src.c ?? wall.c;
    update.c = [c[2], c[3], c[0], c[1]];
  }
  if (kind) update[`flags.${MODULE_ID}.kind`] = kind;
  if (kind === "window" && windowMode) {
    Object.assign(update, { door: windowMode === "gm" ? 2 : 1, move: 20, sight: 0, light: 0, sound: 10 });
  }
  if (kind === "door" && windowMode === "toDoor") {
    Object.assign(update, { door: 1, move: 20, sight: 20, light: 20, sound: 20 });
  }
  return update;
}

/** Procura cada arte usada na cena pelo nome do arquivo nas pastas atuais e corrige o caminho. */
export async function updateScenePaths(scene = canvas?.scene) {
  if (!scene) return { updated: 0, missing: 0 };
  const [doors, windows] = await Promise.all([Library.load("door"), Library.load("window")]);
  const byName = new Map([...doors, ...windows].map((e) => [e.file, e]));
  const updates = [];
  let missing = 0;
  for (const wall of scene.walls) {
    const tex = wall.animation?.texture;
    if (!wall.door || !tex) continue;
    const name = wall.getFlag(MODULE_ID, "art") ?? fileName(tex);
    const entry = byName.get(name);
    if (!entry) { missing++; continue; }
    if (entry.path !== tex) updates.push({ _id: wall.id, "animation.texture": entry.path });
  }
  if (updates.length) await scene.updateEmbeddedDocuments("Wall", updates);
  return { updated: updates.length, missing };
}

/* ------------------------------------------------------------------ */
/* Lado de abrir na cena                                               */
/* ------------------------------------------------------------------ */

/** Diz se a porta precisa ter as pontas invertidas para abrir para "out"/"in" (usa as paredes da cena). */
export function needsReverse(wall, openSide, scene = canvas?.scene) {
  if (!scene || !openSide || openSide === "keep") return false;
  const c = wall._source?.c ?? wall.c;
  const segs = scene.walls.contents.filter((w) => w.id !== wall.id).map((w) => w.c);
  const grid = scene.grid?.size ?? 100;
  const interior = interiorSide({ x: c[0], y: c[1] }, { x: c[2], y: c[3] }, segs,
    { probe: grid * 0.5, maxDist: (scene.width ?? 4000) + (scene.height ?? 4000) });
  return shouldReverse(interior, openSide);
}

/* ------------------------------------------------------------------ */
/* Janela dupla sem vão no meio                                        */
/* ------------------------------------------------------------------ */

/**
 * As folhas de janela da FA têm ~7 px (3,5%) de margem nas pontas. Numa janela dupla isso deixa um vão
 * no meio. Com a marca "noGap", a folha é desenhada com esse recuo compensado (texturePadding do DoorMesh).
 */
export const NO_GAP_RATIO = 7 / 200;

export function installNoGapPatch() {
  const DM = foundry.canvas?.containers?.DoorMesh;
  if (!DM || DM.prototype.__ddiNoGap) return;
  const original = DM.prototype.initialize;
  DM.prototype.initialize = function (animation, ...rest) {
    try {
      const doc = this.object?.document;
      const flags = doc?.flags?.[MODULE_ID];
      if (flags?.noGap !== undefined || this.__ddiPadded) {
        const double = animation?.double ?? doc?.animation?.double;
        const width = this.texture?.width || this.texture?.baseTexture?.width || 200;
        this.texturePadding = flags?.noGap && double ? width * NO_GAP_RATIO : 0;
        this.__ddiPadded = this.texturePadding > 0;
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | noGap`, err);
    }
    return original.call(this, animation, ...rest);
  };
  DM.prototype.__ddiNoGap = true;
}
