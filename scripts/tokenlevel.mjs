// Andar e elevação do token andam juntos (1.9.6).
// - Escada/elevador muda o andar do token e a elevação fica para trás → a elevação vai para o chão do andar novo.
// - Você muda a elevação do token (HUD, ficha) → o andar do token passa a ser o andar daquela altura.
// Só mexe na mesma atualização (preUpdateToken); não corrige nada sozinho depois.

import { elevationForLevel, levelForElevation } from "./levels.mjs";

const levelIdOf = (v) => (typeof v === "string" ? v : v?.id ?? v?._id ?? null);
const levelsOf = (scene) => { const lv = scene?.levels; return lv ? [...(lv.contents ?? lv)] : []; };

export function installTokenLevelFix() {
  Hooks.on("preUpdateToken", (doc, changes) => {
    const levels = levelsOf(doc.parent);
    if (levels.length < 2) return;
    const hasLevel = "level" in changes, hasElev = "elevation" in changes;
    if (hasLevel && !hasElev) {
      const level = doc.parent.levels.get(levelIdOf(changes.level));
      const fixed = elevationForLevel(doc.elevation, level);
      if (fixed !== null) changes.elevation = fixed;
    } else if (hasElev && !hasLevel) {
      const target = levelForElevation(levels, changes.elevation);
      const current = levelIdOf(doc.level ?? doc._source?.level);
      if (target && current && target.id !== current) changes.level = target.id;
    }
  });
}
