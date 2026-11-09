// Andar e elevação andam juntos (1.9.7) — tokens, tiles, luzes, sons, desenhos e notas.
// - Mudou a elevação (HUD, ficha, configuração) → o objeto vai para o andar daquela altura
//   (andares de 3 m: 0 m = Térreo, 3 m = 2º andar, 6 m = 3º andar...).
// - Mudou o andar (escada, elevador, botão de andar) → a elevação vai para o chão do andar novo, se estava fora dele.
// - Criado num andar com elevação fora dele → vai para o chão do andar.
// Objetos em vários andares (ou em todos) não são mexidos.

import { levelSyncPatch } from "./levels.mjs";

const levelsOf = (scene) => { const lv = scene?.levels; return lv ? [...(lv.contents ?? lv)] : []; };
const TYPES = [
  ["Token", true], ["Tile", false], ["AmbientLight", false], ["AmbientSound", false], ["Drawing", false], ["Note", false]
];

export function installTokenLevelFix() {
  installAfterUpdate();
  for (const [type, single] of TYPES) {
    Hooks.on(`preCreate${type}`, (doc, data) => {
      const scene = doc.parent;
      const src = doc._source ?? data;
      const patch = levelSyncPatch(levelsOf(scene), { single, doc: { level: src.level, levels: src.levels, elevation: src.elevation } });
      if (Object.keys(patch).length) doc.updateSource(patch);
    });
    // Token: no V13/V14 mexer na elevação/andar dentro do preUpdateToken quebra o movimento (o token não sai do lugar).
    // Para tokens, o acerto é feito depois, por quem fez a mudança (installAfterUpdate).
    if (type === "Token") continue;
    Hooks.on(`preUpdate${type}`, (doc, changes) => {
      const src = doc._source ?? doc;
      const patch = levelSyncPatch(levelsOf(doc.parent), {
        single, doc: { level: src.level ?? doc.level, levels: src.levels ?? doc.levels, elevation: src.elevation ?? doc.elevation }, changes
      });
      Object.assign(changes, patch);
    });
  }
}

/**
 * Tokens: depois que o andar ou a elevação mudou, quem fez a mudança acerta o outro valor
 * com uma segunda atualização (o movimento do token não pode ser alterado no preUpdateToken).
 * - mudou o andar (botão de andar, escada, elevador) → elevação vai para o chão do andar novo;
 * - mudou só a elevação → o token vai para o andar daquela altura.
 */
function installAfterUpdate() {
  const busy = new Set();
  Hooks.on("updateToken", (doc, changes, options, userId) => {
    if (userId !== game.user?.id) return;
    const lvl = "level" in changes, elev = "elevation" in changes;
    if (!lvl && !elev) return;
    if (busy.has(doc.id)) return;
    const src = doc._source ?? doc;
    const cur = { level: src.level, elevation: src.elevation };
    const patch = lvl
      ? levelSyncPatch(levelsOf(doc.parent), { single: true, doc: cur })
      : levelSyncPatch(levelsOf(doc.parent), { single: true, doc: cur, changes: { elevation: src.elevation } });
    if (patch.elevation !== undefined && patch.elevation === src.elevation) delete patch.elevation;
    if (patch.level !== undefined && patch.level === src.level) delete patch.level;
    if (!Object.keys(patch).length) return;
    busy.add(doc.id);
    doc.update(patch, { dd2vttLevelSync: true })
      .catch((err) => console.warn("dd2vtt-url-importer | andar/elevação do token", err))
      .finally(() => busy.delete(doc.id));
  });
}

/** Arruma a cena inteira: quem está em 1 andar com elevação fora dele vai para o chão do andar. */
export async function fixSceneElevations(scene) {
  const levels = levelsOf(scene);
  let n = 0;
  for (const [type, single] of TYPES) {
    const coll = scene?.getEmbeddedCollection?.(type);
    const updates = [];
    for (const d of coll ?? []) {
      const src = d._source ?? d;
      const patch = levelSyncPatch(levels, { single, doc: { level: src.level, levels: src.levels, elevation: src.elevation } });
      if (Object.keys(patch).length) updates.push({ _id: d.id, ...patch });
    }
    if (updates.length) { await scene.updateEmbeddedDocuments(type, updates); n += updates.length; }
  }
  return n;
}
