// Token que troca de andar (escada/elevador do V14) leva a elevação junto (1.9.4).
// No teste real o token subia para o "Andar 1" mas continuava com 0 m (aparecia "-3 m" e ficava
// atrás da imagem do andar de cima). Aqui, quando o andar do token muda, a elevação vai para o chão
// do andar novo, se estiver fora da faixa dele.

import { elevationForLevel } from "./levels.mjs";

const levelIdOf = (v) => (typeof v === "string" ? v : v?.id ?? v?._id ?? null);

function levelDoc(scene, id) {
  return id ? (scene?.levels?.get?.(id) ?? null) : null;
}

/** O primeiro mestre ativo corrige (evita vários clientes atualizando o mesmo token). */
const isLeadGM = () => game.user?.isGM && (game.users?.activeGM ? game.users.activeGM.id === game.user.id : true);

export function installTokenLevelFix() {
  // Antes de gravar: se o andar muda e a elevação não acompanha, acerta na mesma atualização.
  Hooks.on("preUpdateToken", (doc, changes) => {
    if (!("level" in changes)) return;
    const level = levelDoc(doc.parent, levelIdOf(changes.level));
    const elev = "elevation" in changes ? changes.elevation : doc.elevation;
    const fixed = elevationForLevel(elev, level);
    if (fixed !== null) changes.elevation = fixed;
  });
  // Depois de gravar (caso o Foundry mude o andar por outro caminho): o mestre corrige.
  Hooks.on("updateToken", (doc, changes) => {
    if (!isLeadGM() || !("level" in changes || "elevation" in changes)) return;
    fixToken(doc);
  });
  // Tokens que já ficaram com a elevação errada (cenas antigas).
  Hooks.on("canvasReady", () => {
    if (!isLeadGM()) return;
    for (const t of canvas.scene?.tokens ?? []) fixToken(t);
  });
}

function fixToken(doc) {
  const level = levelDoc(doc.parent, levelIdOf(doc.level ?? doc._source?.level));
  const fixed = elevationForLevel(doc.elevation, level);
  if (fixed !== null && fixed !== doc.elevation) doc.update({ elevation: fixed }).catch((err) => console.warn("dd2vtt-url-importer | elevação do token", err));
}
