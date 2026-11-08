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
  for (const [type, single] of TYPES) {
    Hooks.on(`preCreate${type}`, (doc, data) => {
      const scene = doc.parent;
      const src = doc._source ?? data;
      const patch = levelSyncPatch(levelsOf(scene), { single, doc: { level: src.level, levels: src.levels, elevation: src.elevation } });
      if (Object.keys(patch).length) doc.updateSource(patch);
    });
    Hooks.on(`preUpdate${type}`, (doc, changes) => {
      const src = doc._source ?? doc;
      const patch = levelSyncPatch(levelsOf(doc.parent), {
        single, doc: { level: src.level ?? doc.level, levels: src.levels ?? doc.levels, elevation: src.elevation ?? doc.elevation }, changes
      });
      Object.assign(changes, patch);
    });
  }
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
