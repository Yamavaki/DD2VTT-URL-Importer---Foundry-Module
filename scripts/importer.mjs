import { normalizeUrl, imageUrlCandidates, driveId, computeGrid, convertFloor, summarize, parseFrameName, floorOf } from "./uvtt.mjs";
import {
  MODULE_ID, registerSettings, Library, getStyle, saveStyle, getSetting, pickVariant,
  resolveSound, animationChoices, doorSoundChoices, installNoGapPatch
} from "./library.mjs";
import { ArtPicker, DoorStyleTool } from "./gallery.mjs";
import { SceneLightsTool } from "./lights.mjs";
import { FloorsManager, installLevelHUD, globalLightData } from "./floors.mjs";
import { installUpperFade, debugUpperFade } from "./upperfade.mjs";
import { sightLists } from "./levels.mjs";

const escHTML = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Padrão do Nauren: 1 quadrado = 1 metro. Altura padrão de um andar: 3 m. */
const DEFAULTS = {
  gridDistance: 1, gridUnits: "m", floorHeight: 3,
  lightsVisionOnly: true, lightAlpha: 0, lightExtra: 0,
  mergeDoors: true, frameInset: true, windowMode: "gm", lightWalls: "see",
  seeBelow: true, seeAbove: true, globalLight: false
};

/** Tenta abrir uma URL de imagem (não exige CORS). */
function tryImage(url, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => { img.src = ""; reject(new Error("tempo esgotado")); }, timeoutMs);
    img.onload = () => { clearTimeout(timer); resolve({ w: img.naturalWidth, h: img.naturalHeight, url }); };
    img.onerror = () => { clearTimeout(timer); reject(new Error("falhou")); };
    img.src = url;
  });
}

/**
 * Carrega a imagem para descobrir o tamanho real. Para links do Google Drive tenta os vários
 * endereços do Drive em sequência e devolve o que funcionou ({ w, h, url }).
 */
async function loadImageSize(raw) {
  for (const url of imageUrlCandidates(raw)) {
    try { return await tryImage(url); } catch { /* tenta o próximo */ }
  }
  if (driveId(raw)) {
    throw new Error("O Google Drive não entregou a imagem. Confira se o compartilhamento está em "
      + "\"Qualquer pessoa com o link\" (não \"Restrito\"). Imagens muito grandes o Drive às vezes não entrega: "
      + "nesse caso use o botão de pasta ao lado da URL para enviar a imagem para o próprio Foundry/Forge.");
  }
  throw new Error(`Não foi possível carregar a imagem: ${normalizeUrl(raw)}`);
}

const baseName = (name) => name.replace(/\.(dd2vtt|uvtt|json)$/i, "");

function toggleHTML(name, checked, label, hint = "") {
  return `
  <label class="ddi-toggle">
    <span class="ddi-toggle-text"><span class="ddi-toggle-label">${label}</span>${hint ? `<span class="ddi-hint">${hint}</span>` : ""}</span>
    <span class="ddi-switch"><input type="checkbox" name="${name}" ${checked ? "checked" : ""}><span class="ddi-switch-track"></span></span>
  </label>`;
}

function floorCardHTML(index, floorHeight = DEFAULTS.floorHeight) {
  return `
  <article class="ddi-floor">
    <header class="ddi-floor-head">
      <span class="ddi-floor-badge">${index + 1}</span>
      <input class="ddi-floor-name" type="text" name="floorName" placeholder="Andar ${index + 1}" aria-label="Nome do andar">
      <label class="ddi-pill" title="Andar que abre primeiro">
        <input type="radio" name="start" value="${index}" ${index === 0 ? "checked" : ""}><span>Inicial</span>
      </label>
      <button type="button" class="ddi-icon-btn" data-action="removeFloor" data-tooltip="Remover andar" aria-label="Remover andar">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </header>

    <label class="ddi-drop">
      <input type="file" name="file" accept=".dd2vtt,.uvtt,.json" multiple>
      <i class="fa-solid fa-file-import ddi-drop-icon"></i>
      <span class="ddi-drop-text">
        <span class="ddi-drop-title">Escolher arquivo .dd2vtt</span>
        <span class="ddi-drop-sub">ou arraste aqui (pode escolher todos os andares de uma vez)</span>
      </span>
    </label>
    <div class="ddi-chips" hidden></div>

    <div class="ddi-row">
      <label class="ddi-field ddi-grow">
        <span class="ddi-label">URL da imagem</span>
        <span class="ddi-url-line">
          <span class="ddi-input-icon"><i class="fa-solid fa-link"></i>
            <input type="text" name="url" placeholder="https://i.imgur.com/....png" autocomplete="off"></span>
          <button type="button" class="ddi-pick-image" data-action="pickImage" data-tooltip="Escolher ou enviar a imagem para o Foundry (Forge: Biblioteca de Assets)"><i class="fa-solid fa-folder-open"></i></button>
        </span>
      </label>
      <label class="ddi-field ddi-narrow">
        <span class="ddi-label">Elevação</span>
        <span class="ddi-suffix"><input type="number" name="bottom" value="${index * floorHeight}" step="any"><em data-unit>m</em></span>
      </label>
    </div>
    <div class="ddi-url-preview" hidden>
      <img alt="Prévia da imagem deste andar" loading="lazy">
      <span class="ddi-hint"></span>
    </div>
    <div class="ddi-floor-sight ddi-multi-only">
      <span class="ddi-label">Este andar vê</span>
      <label class="ddf-check" data-tooltip="Os andares de baixo aparecem embaixo, vistos daqui"><input type="checkbox" name="floorSeeBelow" checked><span><i class="fa-solid fa-arrow-down"></i> os de baixo</span></label>
      <label class="ddf-check" data-tooltip="Os andares de cima aparecem por cima, em fade (somem quando o token passa embaixo)"><input type="checkbox" name="floorSeeAbove" checked><span><i class="fa-solid fa-arrow-up"></i> os de cima (fade)</span></label>
    </div>
  </article>`;
}

function optionsHTML(choices, selected) {
  return choices.map((c) => `<option value="${c.key}" ${c.key === selected ? "selected" : ""}>${escHTML(c.label)}</option>`).join("");
}

function soundOptionsHTML(selected) {
  return `<option value="auto" ${selected === "auto" ? "selected" : ""}>Automático pelo material</option>
    <option value="none" ${selected === "none" ? "selected" : ""}>Sem som</option>
    ${optionsHTML(doorSoundChoices(), selected)}`;
}

function openSideHTML(name, value = "out") {
  const opt = (v, label, icon) => `<label><input type="radio" name="${name}" value="${v}" ${value === v ? "checked" : ""}><span><i class="fa-solid ${icon}" aria-hidden="true"></i> ${label}</span></label>`;
  return `<div class="ddi-field"><span class="ddi-label">Abrir para</span>
    <div class="ddst-seg" role="radiogroup" aria-label="Lado para onde abre">
      ${opt("out", "Fora", "fa-arrow-right-from-bracket")}${opt("in", "Dentro", "fa-arrow-right-to-bracket")}${opt("keep", "Como veio", "fa-equals")}
    </div></div>`;
}

function artCardHTML(kind) {
  return `
  <div class="ddi-art is-empty" data-kind="${kind}">
    <span class="ddi-art-thumb"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i></span>
    <span class="ddi-art-text">
      <span class="ddi-art-title">Carregando…</span>
      <span class="ddi-art-sub"></span>
    </span>
    <button type="button" class="ddg-ghost ddi-art-clear" data-action="clearArt" data-kind="${kind}" aria-label="Remover arte" data-tooltip="Sem arte" hidden>
      <i class="fa-solid fa-xmark"></i></button>
    <button type="button" class="ddi-art-pick" data-action="pickArt" data-kind="${kind}" aria-label="Escolher arte de ${kind === "window" ? "janela" : "porta"}">
      <i class="fa-solid fa-images"></i> Escolher</button>
  </div>`;
}

/** Monta a função que põe arte, animação e som em cada porta/janela importada. */
/** Escolhe a folha que combina com a moldura (mesmo material e cor; prefere a variante da arte padrão). */
function artForFrame(frameName, kind, list, base, vary) {
  const f = parseFrameName(frameName);
  if (!f) return null;
  let pool = list.filter((e) => e.openable && e.material === f.material && e.color === f.color);
  if (!pool.length) return null;
  const sameRust = pool.filter((e) => e.rusty === f.rusty);
  if (sameRust.length) pool = sameRust;
  if (vary) return pool[Math.floor(Math.random() * pool.length)];
  return pool.find((e) => base && e.letter === base.letter && e.sub === base.sub) ?? pool.find((e) => e.letter === "A") ?? pool[0];
}

async function makeDecorator(input) {
  const lists = {};
  for (const kind of ["door", "window"]) {
    try { lists[kind] = await Library.load(kind); } catch { lists[kind] = []; }
  }
  return (wall, info) => {
    const style = info.kind === "window" ? input.windowStyle : input.doorStyle;
    const base = style?.art;
    if (!base) return;
    let entry = style.vary ? pickVariant(base, lists[info.kind] ?? []) : base;
    // Arquivo do mod: a folha acompanha a moldura usada no Dungeondraft (mesmo material e cor).
    if (input.artByFrame && info.frame) {
      const byFrame = artForFrame(info.frame, info.kind, lists[info.kind] ?? [], base, style.vary);
      if (byFrame) { entry = byFrame; info.byFrame = true; }
    }
    wall.animation = { type: style.type || "swing", texture: entry.path, double: !!info.double, duration: 500 };
    const sound = resolveSound(style.sound, entry.material);
    if (sound) wall.doorSound = sound;
    wall.flags = { ...(wall.flags ?? {}), [MODULE_ID]: { kind: info.kind, art: entry.file,
      ...(info.kind === "window" ? { noGap: !!input.windowStyle?.noGap } : {}) } };
  };
}

class DD2VTTImporter extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-app`,
    tag: "form",
    classes: [MODULE_ID],
    window: { title: "Importar mapa do Dungeondraft", icon: "fa-solid fa-map-location-dot", resizable: true },
    position: { width: 600, height: "auto" },
    form: { handler: DD2VTTImporter.#onSubmit, closeOnSubmit: false },
    actions: {
      addFloor: DD2VTTImporter.#onAddFloor,
      removeFloor: DD2VTTImporter.#onRemoveFloor,
      reverseFloors: DD2VTTImporter.#onReverseFloors,
      pickArt: DD2VTTImporter.#onPickArt,
      pickImage: DD2VTTImporter.#onPickImage,
      clearArt: DD2VTTImporter.#onClearArt
    }
  };

  async _renderHTML() {
    const d = DEFAULTS;
    const doorStyle = getStyle("door");
    const windowStyle = getStyle("window");
    return `
    <div class="ddi-body">
      <section class="ddi-card">
        <h3 class="ddi-card-title"><i class="fa-solid fa-map"></i> Cena</h3>
        <label class="ddi-field">
          <span class="ddi-label">Nome</span>
          <input type="text" name="sceneName" placeholder="Usa o nome do primeiro arquivo">
        </label>
        <div class="ddi-row">
          <label class="ddi-field">
            <span class="ddi-label">Cada quadrado vale</span>
            <span class="ddi-pair">
              <input type="number" name="gridDistance" value="${d.gridDistance}" step="any" min="0">
              <input type="text" name="gridUnits" value="${d.gridUnits}" aria-label="Unidade">
            </span>
          </label>
          <label class="ddi-field">
            <span class="ddi-label">Altura de cada andar</span>
            <span class="ddi-suffix"><input type="number" name="floorHeight" value="${d.floorHeight}" step="any" min="0"><em data-unit>m</em></span>
          </label>
        </div>
      </section>

      <section class="ddi-card">
        <h3 class="ddi-card-title"><i class="fa-solid fa-lightbulb"></i> Luzes</h3>
        ${toggleHTML("globalLight", d.globalLight, "Iluminação global",
          "Ilumina a cena toda, em todos os andares. Dá para trocar depois em “Andares”.")}
        ${toggleHTML("lightsVisionOnly", d.lightsVisionOnly, "Só para visão",
          "Revela a área sem clarear a imagem. Use em mapas que já vêm com luz pintada.")}
        <label class="ddi-field ddi-slider" data-requires-color>
          <span class="ddi-label">Intensidade da cor <output>${d.lightAlpha.toFixed(2)}</output></span>
          <input type="range" name="lightAlpha" min="0" max="1" step="0.05" value="${d.lightAlpha}">
        </label>
        <label class="ddi-field">
          <span class="ddi-label">Alcance extra da luz fraca</span>
          <span class="ddi-suffix"><input type="number" name="lightExtra" value="${d.lightExtra}" step="0.5" min="-20" max="50"><em data-unit>m</em></span>
          <span class="ddi-hint">Soma em todas as luzes (a forte acompanha). Depois dá para ajustar em “Luzes da cena”.</span>
        </label>
        <label class="ddi-field">
          <span class="ddi-label">Paredes com “Allow Light”</span>
          <select name="lightWalls">${optionsHTML([
            { key: "see", label: "Luz e visão passam, ninguém atravessa" },
            { key: "light", label: "Só a luz passa" },
            { key: "wall", label: "Parede comum" }
          ], d.lightWalls)}</select>
          <span class="ddi-hint">Para varandas, grades e parapeitos. Só funciona com arquivos do mod “Exportar para Foundry (Nauren)”.</span>
        </label>
      </section>

      <section class="ddi-card">
        <h3 class="ddi-card-title"><i class="fa-solid fa-door-closed"></i> Portas e janelas</h3>
        ${toggleHTML("frameInset", d.frameInset, "Encaixar na moldura",
          "A porta fica só na abertura entre os postes da moldura; os postes viram parede.")}
        ${toggleHTML("mergeDoors", d.mergeDoors, "Juntar portas sobrepostas",
          "Duas portas exportadas no mesmo lugar viram uma só.")}

        <div class="ddi-sub">
          <h4 class="ddi-sub-title"><i class="fa-solid fa-door-open"></i> Portas</h4>
          ${artCardHTML("door")}
          <div class="ddi-row">
            <label class="ddi-field"><span class="ddi-label">Animação</span>
              <select name="doorType">${optionsHTML(animationChoices(), doorStyle.type)}</select></label>
            <label class="ddi-field"><span class="ddi-label">Som</span>
              <select name="doorSound">${soundOptionsHTML(doorStyle.sound)}</select></label>
          </div>
          ${toggleHTML("doorVary", doorStyle.vary, "Variar arte", "Sorteia variantes da mesma cor para as portas não ficarem iguais.")}
          ${toggleHTML("artByFrame", doorStyle.byFrame !== false, "Arte pela moldura",
            "Com arquivos do mod do Dungeondraft: cada porta e janela recebe a folha do mesmo material e cor da moldura usada.")}
          ${openSideHTML("doorOpenSide", doorStyle.openSide)}
        </div>

        <div class="ddi-sub">
          <h4 class="ddi-sub-title"><i class="fa-solid fa-window-maximize"></i> Janelas <span class="ddi-hint">(portais com “Allow Light”)</span></h4>
          <label class="ddi-field"><span class="ddi-label">Como importar</span>
            <select name="windowMode">
              <option value="open" ${windowStyle.mode === "open" ? "selected" : ""}>Com arte — jogadores podem abrir</option>
              <option value="gm" ${windowStyle.mode === "gm" ? "selected" : ""}>Com arte — só o mestre abre</option>
              <option value="static" ${windowStyle.mode === "static" ? "selected" : ""}>Estática — sem arte, não abre</option>
              <option value="door" ${windowStyle.mode === "door" ? "selected" : ""}>Como porta comum</option>
              <option value="ignore" ${windowStyle.mode === "ignore" ? "selected" : ""}>Não importar</option>
            </select></label>
          <div class="ddi-window-art">
            ${artCardHTML("window")}
            <div class="ddi-row">
              <label class="ddi-field"><span class="ddi-label">Animação</span>
                <select name="windowType">${optionsHTML(animationChoices(), windowStyle.type)}</select></label>
              <label class="ddi-field"><span class="ddi-label">Som</span>
                <select name="windowSound">${soundOptionsHTML(windowStyle.sound)}</select></label>
            </div>
            ${toggleHTML("windowStartOpen", windowStyle.startOpen === true, "Começar abertas", "Todas as janelas já entram na cena abertas.")}
            ${toggleHTML("windowNoGap", windowStyle.noGap !== false, "Sem vão no meio",
              "Janela dupla fecha certinho no centro. Desligue se o batente tiver um montante no meio.")}
            ${openSideHTML("windowOpenSide", windowStyle.openSide)}
          </div>
          <p class="ddi-hint">Fechada, a janela deixa ver e passar luz, mas não deixa passar. 2 quadrados ou mais viram janela dupla.</p>
        </div>
      </section>

      <section class="ddi-card">
        <div class="ddi-card-head">
          <h3 class="ddi-card-title"><i class="fa-solid fa-layer-group"></i> Andares</h3>
          <span class="ddi-hint">Um export do Dungeondraft por andar</span>
        </div>
        <div class="ddi-multi-only">
          ${toggleHTML("seeBelow", d.seeBelow, "Andares de cima veem os de baixo", "Para varandas, mezaninos, vãos e pátios abertos.")}
          ${toggleHTML("seeAbove", d.seeAbove, "Andares de baixo veem os de cima, em fade",
            "O andar de cima aparece por cima (telhado, sacada) e some quando o token passa embaixo. A imagem do andar de cima precisa ter fundo transparente fora da construção.")}
          <p class="ddi-hint">Dá para ajustar andar por andar no cartão de cada um, e depois em “Andares”. Ver o outro andar também deixa os tokens se enxergarem entre andares.</p>
        </div>
        <div class="ddi-floors">${floorCardHTML(0)}</div>
        <div class="ddi-floor-actions">
          <button type="button" class="ddi-add" data-action="addFloor"><i class="fa-solid fa-plus"></i> Adicionar andar</button>
          <button type="button" class="ddi-add ddi-multi-only" data-action="reverseFloors" data-tooltip="O 1º cartão vira o andar de baixo (térreo). Use se os andares vieram invertidos."><i class="fa-solid fa-arrow-down-up-across-line"></i> Inverter ordem</button>
        </div>
      </section>
    </div>
    <footer class="ddi-footer">
      <span class="ddi-hint">A imagem pode estar em qualquer resolução; a grade se ajusta sozinha.</span>
      <button type="submit" class="ddi-primary"><i class="fa-solid fa-file-import"></i> Importar cena</button>
    </footer>`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const form = this.element;
    form.addEventListener("input", (ev) => {
      const t = ev.target;
      if (t.name === "bottom") t.dataset.edited = "1";
      if (t.name === "lightAlpha") t.closest(".ddi-slider").querySelector("output").textContent = Number(t.value).toFixed(2);
      if (t.name === "gridUnits") form.querySelectorAll("[data-unit]").forEach((e) => (e.textContent = t.value || "m"));
    });
    form.addEventListener("change", (ev) => {
      const t = ev.target;
      if (t.name === "floorHeight") this.#refreshBottoms();
      if (t.name === "lightsVisionOnly") this.#refreshLights();
      if (t.name === "seeBelow" || t.name === "seeAbove") {
        const per = t.name === "seeBelow" ? "floorSeeBelow" : "floorSeeAbove";
        form.querySelectorAll(`.ddi-floor input[name="${per}"]`).forEach((c) => (c.checked = t.checked));
      }
      if (t.name === "file") this.#onFileChosen(t);
      if (t.name === "url") this.#refreshPreview(t.closest(".ddi-floor"));
    });
    // Arrastar o arquivo direto no cartão do andar.
    form.addEventListener("dragover", (ev) => {
      const drop = ev.target.closest?.(".ddi-drop");
      if (!drop) return;
      ev.preventDefault();
      drop.classList.add("is-over");
    });
    form.addEventListener("dragleave", (ev) => ev.target.closest?.(".ddi-drop")?.classList.remove("is-over"));
    form.addEventListener("drop", (ev) => {
      const drop = ev.target.closest?.(".ddi-drop");
      if (!drop || !ev.dataTransfer?.files?.length) return;
      ev.preventDefault();
      drop.classList.remove("is-over");
      const input = drop.querySelector('input[type="file"]');
      input.files = ev.dataTransfer.files;
      this.#onFileChosen(input);
    });
    this.#refreshLights();
    this.#refreshFloors();
    this.#refreshWindowMode();
    form.addEventListener("change", (ev) => { if (ev.target.name === "windowMode") this.#refreshWindowMode(); });
    for (const kind of ["door", "window"]) this.#loadArtCard(kind);
  }

  /** Arte escolhida para portas/janelas (entrada da biblioteca ou null). */
  art = { door: null, window: null };

  async #loadArtCard(kind) {
    const style = getStyle(kind);
    let entry = null;
    try { entry = await Library.find(kind, style.art); } catch (err) { console.warn(`${MODULE_ID} |`, err); }
    if (!entry && Library.folder(kind)) {
      try {
        const list = (await Library.load(kind)).filter((e) => e.openable);
        entry = list.find((e) => e.material === "wood" && e.color === "walnut") ?? list.find((e) => e.material === "wood") ?? list[0] ?? null;
      } catch { /* pasta ilegível: o cartão mostra o aviso */ }
    }
    this.#setArt(kind, entry);
  }

  #setArt(kind, entry) {
    this.art[kind] = entry;
    const card = this.element?.querySelector(`.ddi-art[data-kind="${kind}"]`);
    if (!card) return;
    const folder = Library.folder(kind);
    const thumb = card.querySelector(".ddi-art-thumb");
    const title = card.querySelector(".ddi-art-title");
    const sub = card.querySelector(".ddi-art-sub");
    const pick = card.querySelector('[data-action="pickArt"]');
    card.classList.toggle("is-empty", !entry);
    thumb.innerHTML = entry ? `<img src="${escHTML(entry.path)}" alt="">` : `<i class="fa-solid ${folder ? "fa-image" : "fa-folder-plus"}" aria-hidden="true"></i>`;
    title.textContent = entry ? entry.label : (folder ? "Sem arte" : "Pasta de artes não configurada");
    sub.textContent = entry ? entry.file : (folder ? (kind === "door" ? "Portas sem folha animada" : "Janelas sem folha animada") : "Clique em Escolher para apontar a pasta");
    pick.innerHTML = `<i class="fa-solid fa-images"></i> ${entry ? "Trocar" : "Escolher"}`;
    card.querySelector('[data-action="clearArt"]').hidden = !entry;
  }

  #refreshWindowMode() {
    const mode = this.element.elements.windowMode.value;
    const box = this.element.querySelector(".ddi-window-art");
    box.hidden = !(mode === "gm" || mode === "open");
    this.setPosition({ height: "auto" });
  }

  static async #onPickArt(event, target) {
    const kind = target.dataset.kind;
    const entry = await ArtPicker.pick({ kind, selected: this.art[kind]?.file ?? getStyle(kind).art });
    if (entry) this.#setArt(kind, entry);
  }

  /** Abre o seletor de arquivos do Foundry (na Forge, a Biblioteca de Assets) e põe o caminho na URL. */
  static #onPickImage(event, target) {
    const card = target.closest(".ddi-floor");
    const input = card?.querySelector('input[name="url"]');
    if (!input) return;
    const FP = [foundry.applications?.apps?.FilePicker?.implementation, foundry.applications?.apps?.FilePicker, globalThis.FilePicker]
      .find((c) => typeof c === "function");
    if (!FP) return ui.notifications.error("Seletor de arquivos do Foundry indisponível.");
    const picker = new FP({
      type: "image",
      current: input.value.trim(),
      callback: (path) => {
        input.value = path;
        this.#refreshPreview(card);
      }
    });
    picker.render(true);
  }

  static #onClearArt(event, target) {
    this.#setArt(target.dataset.kind, null);
  }

  get #floorHeight() {
    const v = Number(this.element.elements.floorHeight.value);
    return Number.isFinite(v) && v > 0 ? v : DEFAULTS.floorHeight;
  }

  /** Miniatura da imagem colada, para conferir que cada andar recebeu a imagem certa. */
  #refreshPreview(card) {
    const box = card?.querySelector(".ddi-url-preview");
    if (!box) return;
    const raw = card.querySelector('input[name="url"]').value.trim();
    const img = box.querySelector("img");
    const note = box.querySelector(".ddi-hint");
    if (!raw) { box.hidden = true; img.removeAttribute("src"); return; }
    box.hidden = false;
    note.textContent = "Carregando…";
    img.onload = null;
    img.onerror = null;
    const token = (this._previewToken = (this._previewToken ?? 0) + 1);
    loadImageSize(raw).then((r) => {
      if (token !== this._previewToken) return;
      img.src = r.url;
      note.textContent = `${r.w}×${r.h} px — confira se é a imagem deste andar.`;
    }).catch((err) => {
      if (token !== this._previewToken) return;
      img.removeAttribute("src");
      note.textContent = driveId(raw) ? err.message : "Não consegui abrir essa imagem (confira o link).";
    });
  }

  #refreshBottoms() {
    const h = this.#floorHeight;
    this.element.querySelectorAll(".ddi-floor").forEach((card, i) => {
      const input = card.querySelector('input[name="bottom"]');
      if (!input.dataset.edited) input.value = i * h;
    });
  }

  #refreshLights() {
    const on = this.element.elements.lightsVisionOnly.checked;
    const slider = this.element.querySelector("[data-requires-color]");
    slider.classList.toggle("is-disabled", on);
    slider.querySelector("input").disabled = on;
  }

  #refreshFloors() {
    const cards = [...this.element.querySelectorAll(".ddi-floor")];
    this.element.classList.toggle("ddi-multi", cards.length > 1);
    const unit = this.element.elements.gridUnits.value || "m";
    const el = this.element.elements;
    cards.forEach((card, i) => {
      if (!card.dataset.sightInit) {
        card.dataset.sightInit = "1";
        card.querySelector('input[name="floorSeeBelow"]').checked = el.seeBelow?.checked ?? DEFAULTS.seeBelow;
        card.querySelector('input[name="floorSeeAbove"]').checked = el.seeAbove?.checked ?? DEFAULTS.seeAbove;
      }
      card.querySelector(".ddi-floor-badge").textContent = i + 1;
      card.querySelector('input[name="start"]').value = i;
      card.querySelector('input[name="floorName"]').placeholder = card.dataset.fileName ?? `Andar ${i + 1}`;
      card.querySelector("[data-unit]").textContent = unit;
    });
    if (!this.element.querySelector('input[name="start"]:checked')) cards[0].querySelector('input[name="start"]').checked = true;
  }

  async #onFileChosen(input) {
    // Vários arquivos de uma vez (ex.: todos os andares exportados pelo mod): um cartão por andar.
    if ((input.files?.length ?? 0) > 1) return this.#distributeFiles([...input.files]);
    const card = input.closest(".ddi-floor");
    const file = input.files?.[0];
    const chips = card.querySelector(".ddi-chips");
    const title = card.querySelector(".ddi-drop-title");
    const sub = card.querySelector(".ddi-drop-sub");
    card.querySelector(".ddi-drop").classList.toggle("has-file", !!file);
    if (!file) return;
    title.textContent = file.name;
    card.dataset.fileName = baseName(file.name);
    this.#refreshFloors();
    const sceneName = this.element.elements.sceneName;
    try {
      const s = summarize(JSON.parse(await file.text()));
      // Arquivo do mod: o nome do andar vem do Dungeondraft e o da cena tira o sufixo do andar.
      if (s.level?.label) {
        card.dataset.fileName = s.level.label;
        this.#refreshFloors();
      }
      if (!sceneName.value && card === this.element.querySelector(".ddi-floor")) {
        let scene = baseName(file.name);
        if (s.level && s.level.count > 1) scene = scene.replace(/_\d+_[^_]+(?:_[^_]+)*$/, "");
        sceneName.placeholder = scene.replace(/[_-]?\d+$/, "") || sceneName.placeholder;
      }
      sub.textContent = "Clique para trocar";
      const chip = (icon, text, cls = "") => `<span class="ddi-chip ${cls}"><i class="fa-solid ${icon}"></i>${escHTML(text)}</span>`;
      chips.innerHTML = [
        s.fromMod ? chip("fa-wand-magic-sparkles", "do mod Nauren", "is-mod") : "",
        s.level ? chip("fa-layer-group", `andar ${(s.floor ?? s.level.index) + 1} de ${s.level.count}${s.floor === 0 ? " (térreo)" : ""}`) : "",
        chip("fa-border-all", `${s.size} quadrados`),
        chip("fa-door-closed", `${s.doors} porta${s.doors === 1 ? "" : "s"}`),
        chip("fa-window-maximize", `${s.windows} janela${s.windows === 1 ? "" : "s"}`),
        chip("fa-lightbulb", `${s.lights} luz${s.lights === 1 ? "" : "es"}`),
        s.lightWallsAll ? chip("fa-triangle-exclamation", "Allow Light em todas as paredes: vai como parede normal", "is-warn")
          : s.lightWalls ? chip("fa-sun", `${s.lightWalls} parede${s.lightWalls === 1 ? "" : "s"} com Allow Light`) : "",
        s.frames ? chip("fa-vector-square", `${s.frames} moldura${s.frames === 1 ? "" : "s"} identificada${s.frames === 1 ? "" : "s"}`) : "",
        s.merged ? chip("fa-object-group", `${s.merged} duplicada${s.merged === 1 ? "" : "s"} juntada${s.merged === 1 ? "" : "s"}`) : ""
      ].join("");
      chips.hidden = false;
      // Lembra qual imagem subir para este andar.
      const url = card.querySelector('input[name="url"]');
      if (s.imageFile && url && !url.value) url.placeholder = `URL de ${s.imageFile}`;
      card.dataset.levelIndex = s.level ? (s.floor ?? s.level.index) : "";
    } catch {
      sub.textContent = "Arquivo inválido: não parece ser .dd2vtt/.uvtt";
      chips.hidden = true;
    }
    this.setPosition({ height: "auto" });
  }

  /** Distribui vários .dd2vtt em cartões de andar, na ordem dos andares do Dungeondraft. */
  async #distributeFiles(files) {
    const parsed = await Promise.all(files.map(async (file) => {
      let index = Number.POSITIVE_INFINITY;
      try { index = floorOf(JSON.parse(await file.text())) ?? index; } catch { /* arquivo inválido: vai para o fim */ }
      return { file, index };
    }));
    parsed.sort((a, b) => a.index - b.index || a.file.name.localeCompare(b.file.name, undefined, { numeric: true }));
    const list = this.element.querySelector(".ddi-floors");
    if (parsed.length > 1 && (!game.release || game.release.generation < 14)) {
      ui.notifications.warn("Vários andares exigem Foundry V14 (Scene Levels). Usei só o primeiro arquivo.");
      parsed.length = 1;
    }
    while (list.children.length < parsed.length) {
      list.insertAdjacentHTML("beforeend", floorCardHTML(list.children.length, this.#floorHeight));
    }
    this.#refreshFloors();
    const cards = [...list.querySelectorAll(".ddi-floor")];
    for (const [i, { file }] of parsed.entries()) {
      const input = cards[i].querySelector('input[name="file"]');
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      await this.#onFileChosen(input);
    }
    this.#refreshBottoms();
    ui.notifications.info(`${parsed.length} andares carregados. Agora cole a URL da imagem de cada um.`);
  }

  static #onAddFloor() {
    if (!game.release || game.release.generation < 14) {
      return ui.notifications.warn("Múltiplos andares exigem Foundry V14 (Scene Levels).");
    }
    const list = this.element.querySelector(".ddi-floors");
    list.insertAdjacentHTML("beforeend", floorCardHTML(list.children.length, this.#floorHeight));
    this.#refreshFloors();
    list.lastElementChild.scrollIntoView({ block: "nearest", behavior: "smooth" });
    this.setPosition({ height: "auto" });
  }

  static #onReverseFloors() {
    const list = this.element.querySelector(".ddi-floors");
    const cards = [...list.children];
    if (cards.length < 2) return;
    for (const card of cards.reverse()) list.append(card);
    list.querySelectorAll('input[name="bottom"]').forEach((i) => delete i.dataset.edited);
    this.#refreshFloors();
    this.#refreshBottoms();
  }

  static #onRemoveFloor(event, target) {
    const list = this.element.querySelector(".ddi-floors");
    if (list.children.length <= 1) return;
    target.closest(".ddi-floor").remove();
    this.#refreshFloors();
    this.#refreshBottoms();
    this.setPosition({ height: "auto" });
  }

  static async #onSubmit(event, form) {
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.classList.add("is-busy");
    try {
      const scene = await importScene(readForm(form, this.art));
      if (scene) this.close();
    } catch (err) {
      console.error(`${MODULE_ID} |`, err);
      ui.notifications.error(`Falha ao importar: ${err.message}`);
    } finally {
      submit.disabled = false;
      submit.classList.remove("is-busy");
    }
  }
}

function readForm(form, art = { door: null, window: null }) {
  const num = (v, d) => (Number.isFinite(Number(v)) && v !== "" ? Number(v) : d);
  const el = form.elements;
  const floors = [...form.querySelectorAll(".ddi-floor")].map((card, i) => ({
    file: card.querySelector('input[name="file"]').files[0],
    url: card.querySelector('input[name="url"]').value,
    name: card.querySelector('input[name="floorName"]').value.trim(),
    bottom: num(card.querySelector('input[name="bottom"]').value, i * DEFAULTS.floorHeight),
    start: card.querySelector('input[name="start"]').checked,
    seeBelow: card.querySelector('input[name="floorSeeBelow"]')?.checked ?? true,
    seeAbove: card.querySelector('input[name="floorSeeAbove"]')?.checked ?? true
  }));
  return {
    sceneName: el.sceneName.value.trim(),
    gridDistance: num(el.gridDistance.value, DEFAULTS.gridDistance),
    gridUnits: el.gridUnits.value.trim() || DEFAULTS.gridUnits,
    floorHeight: Math.max(num(el.floorHeight.value, DEFAULTS.floorHeight), 0.01),
    seeBelow: el.seeBelow.checked,
    seeAbove: el.seeAbove?.checked ?? DEFAULTS.seeAbove,
    globalLight: !!el.globalLight?.checked,
    lightsVisionOnly: el.lightsVisionOnly.checked,
    lightAlpha: num(el.lightAlpha.value, DEFAULTS.lightAlpha),
    lightExtra: num(el.lightExtra.value, 0),
    lightWalls: el.lightWalls?.value ?? DEFAULTS.lightWalls,
    mergeDoors: el.mergeDoors.checked,
    frameInset: el.frameInset.checked,
    windows: el.windowMode.value,
    windowsOpen: el.windowStartOpen.checked,
    doorOpenSide: form.querySelector('input[name="doorOpenSide"]:checked')?.value ?? "out",
    windowOpenSide: form.querySelector('input[name="windowOpenSide"]:checked')?.value ?? "out",
    windowNoGap: el.windowNoGap.checked,
    artByFrame: el.artByFrame.checked,
    doorStyle: { art: art.door, type: el.doorType.value, sound: el.doorSound.value, vary: el.doorVary.checked, byFrame: el.artByFrame.checked,
      openSide: form.querySelector('input[name="doorOpenSide"]:checked')?.value ?? "out" },
    windowStyle: { art: art.window, type: el.windowType.value, sound: el.windowSound.value, mode: el.windowMode.value, startOpen: el.windowStartOpen.checked,
      noGap: el.windowNoGap.checked, openSide: form.querySelector('input[name="windowOpenSide"]:checked')?.value ?? "out" },
    floors
  };
}

async function importScene(input) {
  const { floors } = input;
  floors.forEach((f, i) => {
    if (!f.file) throw new Error(`Andar ${i + 1}: escolha o arquivo .dd2vtt.`);
    if (!f.url.trim()) throw new Error(`Andar ${i + 1}: informe a URL da imagem.`);
  });

  const supportsLevels = !!Scene.schema.fields.levels;
  if (floors.length > 1 && !supportsLevels) throw new Error("Múltiplos andares exigem Foundry V14.");

  // Lê os arquivos e mede as imagens em paralelo.
  await Promise.all(floors.map(async (f, i) => {
    f.uvtt = JSON.parse(await f.file.text());
    if (!f.uvtt?.resolution?.map_size) throw new Error(`Andar ${i + 1}: arquivo não parece ser .dd2vtt/.uvtt.`);
    const loaded = await loadImageSize(f.url);
    f.url = loaded.url;
    f.size = { w: loaded.w, h: loaded.h };
    // O Drive (e outros) às vezes entrega a imagem reduzida: avisa, porque o mapa fica borrado.
    const res = f.uvtt.resolution;
    const expected = Number(res.map_size?.x) * Number(res.pixels_per_grid);
    if (expected > 0 && loaded.w < expected * 0.8) {
      ui.notifications.warn(`Andar ${i + 1}: a imagem chegou com ${loaded.w} px de largura, mas o mapa foi exportado com ${Math.round(expected)} px. `
        + "O site pode ter reduzido a imagem; o mapa vai funcionar, mas pode ficar borrado.", { permanent: true });
    }
    if (!f.name) f.name = f.uvtt?.nauren?.level?.label || baseName(f.file.name) || `Andar ${i + 1}`;
  }));

  // A grade da cena vem do primeiro andar; todos os andares usam a mesma.
  const ref = floors[0];
  const grid = computeGrid(ref.uvtt, ref.size);
  for (const [i, f] of floors.entries()) {
    const g = computeGrid(f.uvtt, f.size);
    if (g.aspectMismatch) ui.notifications.warn(`Andar ${i + 1}: a proporção da imagem difere do mapa original. As paredes podem desalinhar.`);
    const ms = f.uvtt.resolution.map_size;
    if (i > 0 && (ms.x !== ref.uvtt.resolution.map_size.x || ms.y !== ref.uvtt.resolution.map_size.y)) {
      ui.notifications.warn(`Andar ${i + 1}: tamanho em quadrados (${ms.x}×${ms.y}) diferente do andar 1. Exporte todos com o mesmo tamanho de mapa.`);
    }
  }

  const sceneName = input.sceneName || ref.file.name.replace(/\.(dd2vtt|uvtt|json)$/i, "").replace(/[_-]?\d+$/, "") || "Mapa importado";
  const sceneData = {
    name: sceneName,
    width: grid.width,
    height: grid.height,
    padding: 0,
    grid: { type: CONST.GRID_TYPES.SQUARE, size: grid.gridSize, distance: input.gridDistance, units: input.gridUnits },
    tokenVision: true,
    fog: { exploration: true },
    ...globalLightData(input.globalLight)
  };

  // Planeja os níveis (V14) ordenados pela elevação.
  const order = floors.map((f, i) => i).sort((a, b) => floors[a].bottom - floors[b].bottom);
  if (supportsLevels) {
    for (const f of floors) f.levelId = f.planId = foundry.utils.randomID();
    const perLevel = Object.fromEntries(floors.map((f) => [f.levelId, { below: f.seeBelow ?? input.seeBelow, above: f.seeAbove ?? input.seeAbove }]));
    const sight = sightLists(floors.map((f) => ({ id: f.levelId, elevation: { bottom: f.bottom } })), { seeBelow: input.seeBelow, seeAbove: input.seeAbove, perLevel });
    sceneData.levels = order.map((i, sortIdx) => {
      const f = floors[i];
      const below = sight.get(f.levelId) ?? [];
      return {
        _id: f.levelId,
        name: f.name,
        sort: sortIdx,
        elevation: { bottom: f.bottom, top: f.bottom + input.floorHeight },
        background: { src: f.url },
        visibility: { levels: below }
      };
    });
    sceneData.initialLevel = (floors.find((f) => f.start) ?? floors[order[0]]).levelId;
  } else {
    sceneData.background = { src: ref.url };
  }

  const scene = await Scene.create(sceneData);

  // Confere os IDs dos níveis criados (por segurança, caso o Foundry gere outros).
  if (supportsLevels) {
    for (const f of floors) {
      if (!scene.levels.get(f.levelId)) {
        const match = scene.levels.find((l) => l.name === f.name);
        if (!match) throw new Error(`O nível "${f.name}" não foi criado.`);
        f.levelId = match.id;
      }
    }
    const wanted = new Set(floors.map((f) => f.levelId));
    const extras = scene.levels.filter((l) => !wanted.has(l.id)).map((l) => l.id);
    if (extras.length) await scene.deleteEmbeddedDocuments("Level", extras);
    const start = (floors.find((f) => f.start) ?? floors[order[0]]).levelId;
    if (scene.initialLevel?.id !== start && scene._source.initialLevel !== start) await scene.update({ initialLevel: start });
  }

  const decorate = await makeDecorator(input);
  const total = { walls: 0, doors: 0, windows: 0, merged: 0, lights: 0, inset: 0, doubles: 0, lightWalls: 0 };
  for (const f of floors) {
    const { walls, lights, stats } = convertFloor(f.uvtt, grid.gridSize, {
      gridDistance: input.gridDistance,
      elevation: f.bottom,
      levelId: supportsLevels ? f.levelId : null,
      mergeDoors: input.mergeDoors,
      windows: input.windows,
      windowsOpen: input.windowsOpen,
      openSide: input.doorOpenSide,
      windowOpenSide: input.windowOpenSide,
      frameInset: input.frameInset,
      doubleThreshold: Number(getSetting("doubleThreshold")) || 1.6,
      decorate,
      lightsVisionOnly: input.lightsVisionOnly,
      lightAlpha: input.lightAlpha,
      lightExtra: input.lightExtra,
      lightWalls: input.lightWalls
    });
    if (stats.lightWallsIgnored) {
      ui.notifications.warn(`${f.name || "Andar"}: todas as paredes vieram com “Allow Light”. Tratei como paredes normais — confira se o botão Allow Light da ferramenta de parede ficou ligado no Dungeondraft.`, { permanent: true });
    }
    if (walls.length) await scene.createEmbeddedDocuments("Wall", walls);
    if (lights.length) await scene.createEmbeddedDocuments("AmbientLight", lights);
    total.walls += walls.length - stats.doors - stats.windows;
    total.reversed = (total.reversed ?? 0) + stats.reversed;
    for (const k of ["doors", "windows", "merged", "lights", "inset", "doubles", "lightWalls"]) total[k] += stats[k];
  }

  // Os IDs podem ter mudado na criação: corrige a lista de visão com os IDs reais.
  if (supportsLevels && floors.length > 1 && floors.some((f) => f.planId !== f.levelId)) {
    const real = new Map(floors.map((f) => [f.planId, f.levelId]));
    await scene.updateEmbeddedDocuments("Level", sceneData.levels.map((l) => ({
      _id: real.get(l._id) ?? l._id, "visibility.levels": [...(l.visibility?.levels ?? [])].map((x) => real.get(x) ?? x)
    })));
  }

  // Lembra as escolhas para a próxima importação e para a ferramenta de estilo.
  const ds = input.doorStyle ?? {}, ws = input.windowStyle ?? {};
  await saveStyle("door", { ...getStyle("door"), art: ds.art?.file ?? "", type: ds.type, sound: ds.sound, vary: ds.vary, openSide: ds.openSide, byFrame: ds.byFrame });
  await saveStyle("window", { ...getStyle("window"), art: ws.art?.file ?? "", type: ws.type, sound: ws.sound, mode: ws.mode, startOpen: ws.startOpen, noGap: ws.noGap, openSide: ws.openSide });

  const scaleNote = Math.abs(grid.scale - 1) > 0.01 ? ` Imagem reescalada para ${Math.round(grid.scale * 100)}% (grade ${grid.gridSize}px).` : "";
  const mergedNote = (total.merged ? ` ${total.merged} porta(s) duplicada(s) juntada(s).` : "")
    + (total.inset ? ` ${total.inset} encaixada(s) na moldura, ${total.doubles} dupla(s).` : "")
    + (total.lightWalls ? ` ${total.lightWalls} trecho(s) de parede deixando a luz passar.` : "")
    + (total.reversed ? ` ${total.reversed} virada(s) para abrir para ${input.doorOpenSide === "in" ? "dentro" : "fora"}.` : "");
  ui.notifications.info(`Cena "${scene.name}" criada: ${floors.length} andar(es), ${total.walls} paredes, ${total.doors} portas, ${total.windows} janelas, ${total.lights} luzes.${mergedNote}${scaleNote}`);
  return scene;
}

/**
 * Põe paredes, portas, janelas e luzes de um .dd2vtt num andar que já existe (gerenciador de andares),
 * usando as últimas escolhas da importação (artes, sons, janelas, lado de abrir).
 */
async function addFloorContent(scene, levelId, uvtt, elevation = 0) {
  const ds = getStyle("door"), ws = getStyle("window");
  const [doorArt, windowArt] = await Promise.all([Library.find("door", ds.art).catch(() => null), Library.find("window", ws.art).catch(() => null)]);
  const input = {
    artByFrame: ds.byFrame !== false,
    doorStyle: { ...ds, art: doorArt },
    windowStyle: { ...ws, art: windowArt }
  };
  const gridSize = scene.grid?.size ?? 100;
  const ms = uvtt.resolution.map_size;
  const expected = { w: Math.round(ms.x * gridSize), h: Math.round(ms.y * gridSize) };
  const dims = scene.dimensions ?? {};
  if ((dims.sceneWidth ?? scene.width) && Math.abs((dims.sceneWidth ?? scene.width) - expected.w) > gridSize / 2) {
    ui.notifications.warn(`O mapa novo tem ${ms.x}×${ms.y} quadrados e não bate com o tamanho da cena. As paredes podem desalinhar.`);
  }
  const { walls, lights, stats } = convertFloor(uvtt, gridSize, {
    gridDistance: scene.grid?.distance ?? DEFAULTS.gridDistance,
    elevation,
    levelId,
    mergeDoors: DEFAULTS.mergeDoors,
    windows: ws.mode ?? DEFAULTS.windowMode,
    windowsOpen: !!ws.startOpen,
    openSide: ds.openSide ?? "out",
    windowOpenSide: ws.openSide ?? "out",
    frameInset: DEFAULTS.frameInset,
    doubleThreshold: Number(getSetting("doubleThreshold")) || 1.6,
    decorate: await makeDecorator(input),
    lightsVisionOnly: DEFAULTS.lightsVisionOnly,
    lightAlpha: DEFAULTS.lightAlpha,
    lightExtra: 0,
    lightWalls: DEFAULTS.lightWalls
  });
  // Mesma origem da cena (sem padding nas cenas criadas pelo importador).
  const ox = dims.sceneX ?? 0, oy = dims.sceneY ?? 0;
  if (ox || oy) {
    for (const w of walls) w.c = [w.c[0] + ox, w.c[1] + oy, w.c[2] + ox, w.c[3] + oy];
    for (const l of lights) { l.x += ox; l.y += oy; }
  }
  if (walls.length) await scene.createEmbeddedDocuments("Wall", walls);
  if (lights.length) await scene.createEmbeddedDocuments("AmbientLight", lights);
  return { walls: walls.length - stats.doors - stats.windows, doors: stats.doors, windows: stats.windows, lights: stats.lights };
}

Hooks.on("renderSceneDirectory", (app, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root || !game.user.isGM || root.querySelector(`.${MODULE_ID}-btn`)) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `${MODULE_ID}-btn`;
  btn.innerHTML = '<i class="fa-solid fa-map-location-dot"></i> Importar Dungeondraft';
  btn.addEventListener("click", () => new DD2VTTImporter().render({ force: true }));
  const style = document.createElement("button");
  style.type = "button";
  style.className = `${MODULE_ID}-btn ${MODULE_ID}-style-btn`;
  style.innerHTML = '<i class="fa-solid fa-door-open"></i> Estilo de portas';
  style.title = "Trocar arte, animação e som das portas e janelas da cena aberta";
  style.addEventListener("click", () => {
    if (!canvas?.scene) return ui.notifications.warn("Abra uma cena primeiro.");
    DoorStyleTool.open();
  });
  const target = root.querySelector(".directory-header .header-actions")
    ?? root.querySelector(".directory-header .action-buttons")
    ?? root.querySelector(".directory-header");
  const lights = document.createElement("button");
  lights.type = "button";
  lights.className = `${MODULE_ID}-btn ${MODULE_ID}-style-btn`;
  lights.innerHTML = '<i class="fa-solid fa-lightbulb"></i> Luzes da cena';
  lights.title = "Aumentar ou diminuir o raio das luzes da cena aberta";
  lights.addEventListener("click", () => SceneLightsTool.open());
  const floors = document.createElement("button");
  floors.type = "button";
  floors.className = `${MODULE_ID}-btn ${MODULE_ID}-style-btn`;
  floors.innerHTML = '<i class="fa-solid fa-layer-group"></i> Andares';
  floors.title = "Andares da cena aberta: nomes, alturas, imagens, escadas e elevadores";
  floors.addEventListener("click", () => FloorsManager.open());
  target?.append(btn, style, lights, floors);
});

// Botão "Estilo da porta" dentro da configuração de cada porta/janela (clique duplo na porta).
Hooks.on("renderWallConfig", (app, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0];
  const doc = app.document ?? app.object;
  if (!root || !game.user.isGM || !doc || root.querySelector(`.${MODULE_ID}-wallcfg`)) return;
  const box = document.createElement("div");
  box.className = `${MODULE_ID}-wallcfg`;
  box.innerHTML = `<button type="button"><i class="fa-solid fa-door-open"></i> Estilo da porta (galeria de artes)</button>`;
  box.querySelector("button").addEventListener("click", () => {
    const wall = canvas?.walls?.get?.(doc.id);
    if (wall) {
      if (!canvas.walls.active) canvas.walls.activate?.();
      wall.control({ releaseOthers: true });
    }
    app.close?.();
    DoorStyleTool.open();
  });
  const form = root.querySelector("form") ?? root.querySelector(".window-content") ?? root;
  form.prepend(box);
});

Hooks.once("init", () => { registerSettings(); installLevelHUD(); installUpperFade(); });
Hooks.once("setup", () => installNoGapPatch());

// Botão "Estilo de portas e janelas" na barra da camada de Paredes.
Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user?.isGM) return;
  const walls = Array.isArray(controls) ? controls.find((c) => c.name === "walls") : controls.walls;
  if (!walls) return;
  const tool = {
    name: "dd2vtt-door-style",
    title: "Estilo de portas e janelas",
    icon: "fa-solid fa-door-open",
    order: 100,
    button: true,
    visible: true,
    onChange: () => DoorStyleTool.open(),
    onClick: () => DoorStyleTool.open()
  };
  if (Array.isArray(walls.tools)) walls.tools.push(tool);
  else walls.tools[tool.name] = tool;

  // Botão "Andares" nas camadas de Tiles e de Regiões.
  for (const name of ["tiles", "regions"]) {
    const ctl = Array.isArray(controls) ? controls.find((c) => c.name === name) : controls[name];
    if (!ctl) continue;
    const ft = {
      name: "dd2vtt-floors", title: "Andares, escadas e elevadores", icon: "fa-solid fa-layer-group",
      order: 101, button: true, visible: true,
      onChange: () => FloorsManager.open(), onClick: () => FloorsManager.open()
    };
    if (Array.isArray(ctl.tools)) ctl.tools.push(ft);
    else ctl.tools[ft.name] = ft;
  }

  const lighting = Array.isArray(controls) ? controls.find((c) => c.name === "lighting") : controls.lighting;
  if (lighting) {
    const lt = {
      name: "dd2vtt-scene-lights", title: "Luzes da cena (ajustar raio)", icon: "fa-solid fa-arrows-left-right-to-line",
      order: 100, button: true, visible: true,
      onChange: () => SceneLightsTool.open(), onClick: () => SceneLightsTool.open()
    };
    if (Array.isArray(lighting.tools)) lighting.tools.push(lt);
    else lighting.tools[lt.name] = lt;
  }
});

// Também acessível por macro:
//   game.modules.get("dd2vtt-url-importer").api.open()        → importador
//   game.modules.get("dd2vtt-url-importer").api.doorStyle()   → estilo de portas e janelas
//   game.modules.get("dd2vtt-url-importer").api.lights()      → luzes da cena
//   game.modules.get("dd2vtt-url-importer").api.floors()      → andares, escadas e elevadores
Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = {
    open: () => new DD2VTTImporter().render({ force: true }),
    doorStyle: () => DoorStyleTool.open(),
    lights: () => SceneLightsTool.open(),
    floors: () => FloorsManager.open(),
    importScene,
    addFloorContent,
    fadeDebug: debugUpperFade
  };
});
