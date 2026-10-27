import {
  MODULE_ID, MATERIALS, Library, pickVariant, animationChoices, doorSoundChoices,
  getStyle, saveStyle, wallKind, styleUpdate, updateScenePaths, needsReverse
} from "./library.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const KIND_LABEL = { door: "Portas", window: "Janelas" };

/* ================================================================== */
/* Galeria: componente reutilizado no seletor e na ferramenta          */
/* ================================================================== */

export class ArtGallery {
  /**
   * @param {object} o
   * @param {"door"|"window"} o.kind
   * @param {string} [o.selected]   nome do arquivo selecionado
   * @param {Function} [o.onSelect] (entry) => void
   * @param {Function} [o.onConfirm] (entry) => void  (duplo clique / Enter)
   * @param {boolean} [o.kindTabs]  mostrar abas Portas/Janelas
   * @param {Function} [o.onKind]   (kind) => void
   */
  constructor(o) {
    Object.assign(this, { kindTabs: false, onSelect: () => {}, onConfirm: () => {}, onKind: () => {} }, o);
    this.filters = { material: "all", color: "all", rusty: "all", search: "", openOnly: true };
    this.entries = [];
    this.error = null;
  }

  get selectedEntry() { return this.entries.find((e) => e.file === this.selected) ?? null; }

  async mount(root) {
    this.root = root;
    root.classList.add("ddg");
    root.innerHTML = `<div class="ddg-loading" role="status"><i class="fa-solid fa-spinner fa-spin"></i> Carregando artes…</div>`;
    await this.#load();
    this.#render();
  }

  async setKind(kind) {
    if (kind === this.kind) return;
    this.kind = kind;
    this.selected = getStyle(kind).art;
    this.filters = { material: "all", color: "all", rusty: "all", search: "", openOnly: true };
    await this.mount(this.root);
    this.onKind(kind);
  }

  async #load(force = false) {
    this.error = null;
    try {
      this.entries = force ? await Library.reload(this.kind) : await Library.load(this.kind);
    } catch (err) {
      console.error(`${MODULE_ID} |`, err);
      this.entries = [];
      this.error = err.message || String(err);
    }
  }

  #visible() {
    const f = this.filters;
    const q = f.search.trim().toLowerCase();
    return this.entries.filter((e) =>
      (f.material === "all" || e.material === f.material)
      && (f.color === "all" || e.color === f.color)
      && (f.rusty === "all" || (f.rusty === "yes") === e.rusty)
      && (this.kind !== "window" || !f.openOnly || e.openable)
      && (!q || e.label.toLowerCase().includes(q) || e.file.toLowerCase().includes(q)));
  }

  #render() {
    const folder = Library.folder(this.kind);
    const tabs = this.kindTabs ? `
      <div class="ddg-tabs" role="tablist" aria-label="Tipo de arte">
        ${["door", "window"].map((k) => `
          <button type="button" role="tab" class="ddg-tab ${k === this.kind ? "is-active" : ""}" data-kind="${k}" aria-selected="${k === this.kind}">
            <i class="fa-solid ${k === "door" ? "fa-door-closed" : "fa-window-maximize"}"></i> ${KIND_LABEL[k]}
          </button>`).join("")}
      </div>` : "";

    const folderBar = `
      <div class="ddg-folder">
        <i class="fa-solid fa-folder-open" aria-hidden="true"></i>
        <span class="ddg-folder-path" title="${esc(folder)}">${folder ? esc(folder) : "Nenhuma pasta escolhida"}</span>
        <button type="button" class="ddg-ghost" data-ddg="folder"><i class="fa-solid fa-folder-tree"></i> ${folder ? "Trocar pasta" : "Escolher pasta"}</button>
        ${folder ? `<button type="button" class="ddg-ghost ddg-icon" data-ddg="reload" aria-label="Recarregar a pasta" data-tooltip="Recarregar"><i class="fa-solid fa-rotate"></i></button>` : ""}
      </div>`;

    if (!folder || this.error || !this.entries.length) {
      const msg = !folder
        ? `Escolha a pasta onde estão as artes de ${this.kind === "window" ? "janela" : "porta"}. Pode ser uma pasta do seu PC ou da Forge.`
        : this.error ? `Não consegui ler a pasta: ${esc(this.error)}` : "Nenhuma imagem encontrada nessa pasta.";
      this.root.innerHTML = `${tabs}${folderBar}
        <div class="ddg-empty">
          <i class="fa-solid ${folder ? "fa-image" : "fa-folder-plus"}" aria-hidden="true"></i>
          <p>${msg}</p>
          <button type="button" class="ddg-primary" data-ddg="folder"><i class="fa-solid fa-folder-tree"></i> Escolher pasta</button>
        </div>`;
      this.#bind();
      return;
    }

    const mats = [...new Set(this.entries.map((e) => e.material))];
    const matChips = ["all", ...Object.keys(MATERIALS).filter((m) => mats.includes(m))].map((m) => `
      <button type="button" class="ddg-chip ${this.filters.material === m ? "is-on" : ""}" data-material="${m}" aria-pressed="${this.filters.material === m}">
        ${m === "all" ? "Todas" : `<i class="fa-solid ${MATERIALS[m].icon}" aria-hidden="true"></i> ${MATERIALS[m].label}`}
      </button>`).join("");
    const colors = [...new Map(this.entries
      .filter((e) => e.color && (this.filters.material === "all" || e.material === this.filters.material))
      .map((e) => [e.color, e.colorLabel])).entries()];
    const hasRusty = this.entries.some((e) => e.rusty);

    this.root.innerHTML = `${tabs}${folderBar}
      <div class="ddg-filters">
        <div class="ddg-chips" role="group" aria-label="Material">${matChips}</div>
        <div class="ddg-filter-row">
          <label class="ddg-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
            <input type="search" data-ddg="search" placeholder="Buscar…" aria-label="Buscar arte" value="${esc(this.filters.search)}"></label>
          <select data-ddg="color" aria-label="Cor">
            <option value="all">Todas as cores</option>
            ${colors.map(([k, l]) => `<option value="${k}" ${this.filters.color === k ? "selected" : ""}>${esc(l)}</option>`).join("")}
          </select>
          ${hasRusty ? `<select data-ddg="rusty" aria-label="Enferrujadas">
            <option value="all" ${this.filters.rusty === "all" ? "selected" : ""}>Com e sem ferrugem</option>
            <option value="no" ${this.filters.rusty === "no" ? "selected" : ""}>Sem ferrugem</option>
            <option value="yes" ${this.filters.rusty === "yes" ? "selected" : ""}>Só enferrujadas</option>
          </select>` : ""}
        </div>
        ${this.kind === "window" ? `<label class="ddg-check"><input type="checkbox" data-ddg="openOnly" ${this.filters.openOnly ? "checked" : ""}> Só janelas que abrem</label>` : ""}
      </div>
      <div class="ddg-body">
        <div class="ddg-grid" role="listbox" aria-label="Artes de ${KIND_LABEL[this.kind].toLowerCase()}" tabindex="-1"></div>
        <aside class="ddg-preview" aria-live="polite"></aside>
      </div>`;
    this.#renderGrid();
    this.#renderPreview();
    this.#bind();
    // Mostra a arte já escolhida, mesmo que esteja lá embaixo na lista.
    requestAnimationFrame(() => this.root.querySelector(".ddg-item.is-selected")?.scrollIntoView({ block: "center" }));
  }

  #renderGrid() {
    const grid = this.root.querySelector(".ddg-grid");
    if (!grid) return;
    const list = this.#visible();
    if (!list.length) {
      grid.innerHTML = `<p class="ddg-none">Nada com esses filtros.</p>`;
      return;
    }
    grid.innerHTML = list.map((e) => {
      const sel = e.file === this.selected;
      return `<button type="button" role="option" class="ddg-item ${sel ? "is-selected" : ""}" data-file="${esc(e.file)}"
          aria-selected="${sel}" tabindex="${sel ? 0 : -1}" title="${esc(e.label)}">
        <span class="ddg-thumb"><img src="${esc(e.path)}" alt="" loading="lazy" decoding="async"></span>
        <span class="ddg-name">${esc(e.short ?? e.label)}</span>
        ${sel ? `<i class="fa-solid fa-circle-check ddg-check-badge" aria-hidden="true"></i>` : ""}
      </button>`;
    }).join("");
    if (!grid.querySelector('[tabindex="0"]')) grid.querySelector(".ddg-item")?.setAttribute("tabindex", "0");
  }

  #renderPreview() {
    const box = this.root.querySelector(".ddg-preview");
    if (!box) return;
    const e = this.selectedEntry;
    if (!e) {
      box.innerHTML = `<div class="ddg-preview-empty"><i class="fa-regular fa-hand-pointer" aria-hidden="true"></i><p>Clique numa arte para escolher.</p></div>`;
      return;
    }
    box.innerHTML = `
      <div class="ddg-preview-title">${esc(e.label)}</div>
      <div class="ddg-stage" aria-hidden="true">
        <span class="ddg-stage-label">Simples</span>
        <div class="ddg-stage-door"><img src="${esc(e.path)}" alt=""></div>
        <span class="ddg-stage-label">Dupla</span>
        <div class="ddg-stage-door ddg-stage-double"><img src="${esc(e.path)}" alt=""><img src="${esc(e.path)}" alt="" class="is-mirror"></div>
      </div>
      <code class="ddg-file">${esc(e.file)}</code>
      ${this.kind === "window" && !e.openable ? `<p class="ddg-warn"><i class="fa-solid fa-triangle-exclamation"></i> Janela fixa: não foi feita para abrir.</p>` : ""}`;
  }

  #select(file, confirm = false) {
    this.selected = file;
    const entry = this.selectedEntry;
    this.root.querySelectorAll(".ddg-item").forEach((b) => {
      const on = b.dataset.file === file;
      b.classList.toggle("is-selected", on);
      b.setAttribute("aria-selected", on);
      b.setAttribute("tabindex", on ? "0" : "-1");
      b.querySelector(".ddg-check-badge")?.remove();
      if (on) b.insertAdjacentHTML("beforeend", `<i class="fa-solid fa-circle-check ddg-check-badge" aria-hidden="true"></i>`);
    });
    this.#renderPreview();
    if (entry) {
      this.onSelect(entry);
      if (confirm) this.onConfirm(entry);
    }
  }

  #bind() {
    const root = this.root;
    root.onclick = async (ev) => {
      const t = ev.target.closest("button");
      if (!t || !root.contains(t)) return;
      if (t.dataset.kind) return this.setKind(t.dataset.kind);
      if (t.dataset.ddg === "folder") {
        await Library.chooseFolder(this.kind);
        return this.mount(root);
      }
      if (t.dataset.ddg === "reload") {
        await this.#load(true);
        return this.#render();
      }
      if (t.dataset.material) {
        this.filters.material = t.dataset.material;
        this.filters.color = "all";
        return this.#render();
      }
      if (t.dataset.file) this.#select(t.dataset.file);
    };
    root.ondblclick = (ev) => {
      const t = ev.target.closest(".ddg-item");
      if (t) this.#select(t.dataset.file, true);
    };
    root.oninput = (ev) => {
      const k = ev.target.dataset?.ddg;
      if (k === "search") { this.filters.search = ev.target.value; this.#renderGrid(); }
    };
    root.onchange = (ev) => {
      const k = ev.target.dataset?.ddg;
      if (k === "color" || k === "rusty") { this.filters[k] = ev.target.value; this.#renderGrid(); }
      if (k === "openOnly") { this.filters.openOnly = ev.target.checked; this.#renderGrid(); }
    };
    // Teclado na grade: setas andam, Enter/Espaço escolhem, Enter duas vezes confirma.
    root.onkeydown = (ev) => {
      const item = ev.target.closest?.(".ddg-item");
      if (!item) return;
      const items = [...root.querySelectorAll(".ddg-item")];
      const i = items.indexOf(item);
      const grid = root.querySelector(".ddg-grid");
      const cols = Math.max(1, Math.round(grid.clientWidth / (item.offsetWidth || 1)));
      const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols, Home: -i, End: items.length - 1 - i }[ev.key];
      if (move !== undefined) {
        ev.preventDefault();
        const next = items[Math.min(items.length - 1, Math.max(0, i + move))];
        items.forEach((b) => b.setAttribute("tabindex", "-1"));
        next.setAttribute("tabindex", "0");
        next.focus();
      } else if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        const already = item.dataset.file === this.selected;
        this.#select(item.dataset.file, ev.key === "Enter" && already);
      }
    };
  }
}

/* ================================================================== */
/* Seletor de arte (usado na importação)                               */
/* ================================================================== */

export class ArtPicker extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: [MODULE_ID, "ddg-app"],
    window: { title: "Escolher arte", icon: "fa-solid fa-images", resizable: true },
    position: { width: 760, height: 620 },
    actions: { cancel: ArtPicker.#cancel, confirm: ArtPicker.#confirm }
  };

  /** Abre o seletor e devolve a arte escolhida (ou null). */
  static pick({ kind, selected } = {}) {
    return new Promise((resolve) => new ArtPicker({ kind, selected, resolve }).render({ force: true }));
  }

  constructor({ kind, selected, resolve, ...options }) {
    super(options);
    this.kind = kind;
    this.resolve = resolve;
    this.gallery = new ArtGallery({
      kind, selected,
      onSelect: () => this.#refreshFooter(),
      onConfirm: (e) => this.#finish(e)
    });
  }

  get title() { return `Escolher arte de ${this.kind === "window" ? "janela" : "porta"}`; }

  async _renderHTML() {
    return `<div class="ddg-mount"></div>
      <footer class="ddi-footer">
        <span class="ddi-hint ddg-footer-hint">Clique para escolher · duplo clique confirma</span>
        <button type="button" class="ddg-ghost" data-action="cancel">Cancelar</button>
        <button type="button" class="ddi-primary" data-action="confirm" disabled><i class="fa-solid fa-check"></i> Usar esta arte</button>
      </footer>`;
  }

  _replaceHTML(result, content) { content.innerHTML = result; }

  async _onRender(context, options) {
    await super._onRender?.(context, options);
    await this.gallery.mount(this.element.querySelector(".ddg-mount"));
    this.#refreshFooter();
    this.element.querySelector(".ddg-item.is-selected, .ddg-item")?.focus();
  }

  #refreshFooter() {
    const btn = this.element?.querySelector('[data-action="confirm"]');
    if (btn) btn.disabled = !this.gallery.selectedEntry;
  }

  #finish(entry) {
    this.resolve?.(entry ?? null);
    this.resolve = null;
    this.close();
  }

  static #cancel() { this.#finish(null); }
  static #confirm() { this.#finish(this.gallery.selectedEntry); }

  async close(options) {
    this.resolve?.(null);
    this.resolve = null;
    return super.close(options);
  }
}

/* ================================================================== */
/* Ferramenta "Estilo de portas e janelas"                             */
/* ================================================================== */

export class DoorStyleTool extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-style`,
    classes: [MODULE_ID, "ddg-app", "ddst"],
    window: { title: "Estilo de portas e janelas", icon: "fa-solid fa-door-open", resizable: true },
    position: { width: 940, height: 640 },
    actions: {
      apply: DoorStyleTool.#apply,
      flip: DoorStyleTool.#flip,
      hinge: DoorStyleTool.#hinge,
      reverse: DoorStyleTool.#reverse,
      paths: DoorStyleTool.#paths,
      selectAll: DoorStyleTool.#selectAll
    }
  };

  static #instance = null;
  static open() {
    if (!game.user.isGM) return ui.notifications.warn("Só o mestre pode mudar portas e janelas.");
    this.#instance ??= new DoorStyleTool();
    this.#instance.render({ force: true });
    return this.#instance;
  }

  constructor(options) {
    super(options);
    const selKinds = this.#selected().map(wallKind);
    this.kind = selKinds.length && selKinds.every((k) => k === "window") ? "window" : "door";
    this.gallery = new ArtGallery({
      kind: this.kind,
      selected: getStyle(this.kind).art,
      kindTabs: true,
      onKind: (k) => { this.kind = k; this.#renderPanel(); },
      onSelect: () => this.#refreshTargets()
    });
    this._hook = Hooks.on("controlWall", () => this.#refreshTargets());
  }

  #selected() {
    return (canvas?.walls?.controlled ?? []).map((w) => w.document).filter((d) => d?.door);
  }

  #targets(scope) {
    if (scope === "all") return (canvas?.scene?.walls?.contents ?? []).filter((d) => d.door && wallKind(d) === this.kind);
    return this.#selected();
  }

  async _renderHTML() {
    return `<div class="ddst-layout">
        <div class="ddst-left ddg-mount"></div>
        <form class="ddst-panel" autocomplete="off"></form>
      </div>`;
  }

  _replaceHTML(result, content) { content.innerHTML = result; }

  async _onRender(context, options) {
    await super._onRender?.(context, options);
    this.#renderPanel();
    await this.gallery.mount(this.element.querySelector(".ddg-mount"));
  }

  #renderPanel() {
    const panel = this.element?.querySelector(".ddst-panel");
    if (!panel) return;
    const style = getStyle(this.kind);
    const anims = animationChoices();
    const sounds = doorSoundChoices();
    const isWin = this.kind === "window";
    panel.innerHTML = `
      <section class="ddst-block">
        <h3 class="ddi-card-title"><i class="fa-solid fa-crosshairs"></i> Aplicar em</h3>
        <label class="ddst-radio"><input type="radio" name="scope" value="selected"> <span>${isWin ? "Janelas" : "Portas"} selecionadas <b data-count="selected">0</b></span></label>
        <label class="ddst-radio"><input type="radio" name="scope" value="all"> <span>Todas as ${isWin ? "janelas" : "portas"} da cena <b data-count="all">0</b></span></label>
        <p class="ddi-hint">Selecione na camada de Paredes (Shift+clique ou arraste uma caixa).</p>
      </section>

      <section class="ddst-block">
        <h3 class="ddi-card-title"><i class="fa-solid fa-image"></i> Arte</h3>
        <label class="ddst-radio"><input type="radio" name="art" value="keep"> <span>Manter a arte atual</span></label>
        <label class="ddst-radio"><input type="radio" name="art" value="chosen" checked> <span>Usar a arte escolhida</span></label>
        <label class="ddg-check"><input type="checkbox" name="vary" ${style.vary ? "checked" : ""}> Variar entre arte da mesma cor</label>
      </section>

      <section class="ddst-block">
        <h3 class="ddi-card-title"><i class="fa-solid fa-film"></i> Animação</h3>
        <label class="ddi-field"><span class="ddi-label">Tipo</span>
          <select name="type">${anims.map((a) => `<option value="${a.key}" ${a.key === style.type ? "selected" : ""}>${esc(a.label)}</option>`).join("")}</select></label>
        <label class="ddi-field ddi-slider"><span class="ddi-label">Duração <output>${style.duration} ms</output></span>
          <input type="range" name="duration" min="200" max="2000" step="50" value="${style.duration}"></label>
        <div class="ddst-seg" role="group" aria-label="Simples ou dupla">
          <label><input type="radio" name="double" value="keep" checked><span>Manter</span></label>
          <label><input type="radio" name="double" value="single"><span>Simples</span></label>
          <label><input type="radio" name="double" value="double"><span>Dupla</span></label>
        </div>
      </section>

      <section class="ddst-block">
        <h3 class="ddi-card-title"><i class="fa-solid fa-volume-high"></i> Som</h3>
        <select name="sound" aria-label="Som">
          <option value="keep">Manter o som atual</option>
          <option value="auto">Automático pelo material</option>
          <option value="none">Sem som</option>
          ${sounds.map((s) => `<option value="${s.key}">${esc(s.label)}</option>`).join("")}
        </select>
      </section>

      <section class="ddst-block">
        <h3 class="ddi-card-title"><i class="fa-solid fa-arrows-turn-to-dots"></i> Abrir para</h3>
        <div class="ddst-seg" role="group" aria-label="Lado para onde abre">
          <label><input type="radio" name="openSide" value="keep" checked><span>Manter</span></label>
          <label><input type="radio" name="openSide" value="out"><span>Fora</span></label>
          <label><input type="radio" name="openSide" value="in"><span>Dentro</span></label>
        </div>
        <p class="ddi-hint">Descobre sozinho qual lado é a parte de dentro. Portas entre dois cômodos ficam como estão.</p>
      </section>

      <section class="ddst-block">
        <h3 class="ddi-card-title"><i class="fa-solid fa-door-open"></i> Estado</h3>
        <div class="ddst-seg" role="group" aria-label="Aberta ou fechada">
          <label><input type="radio" name="state" value="keep" checked><span>Manter</span></label>
          <label><input type="radio" name="state" value="closed"><span>Fechadas</span></label>
          <label><input type="radio" name="state" value="open"><span>Abertas</span></label>
        </div>
      </section>

      ${isWin ? `<section class="ddst-block">
        <h3 class="ddi-card-title"><i class="fa-solid fa-user-lock"></i> Quem abre</h3>
        <div class="ddst-seg" role="group" aria-label="Quem abre a janela">
          <label><input type="radio" name="mode" value="keep" checked><span>Manter</span></label>
          <label><input type="radio" name="mode" value="open"><span>Jogadores</span></label>
          <label><input type="radio" name="mode" value="gm"><span>Só o mestre</span></label>
        </div>
        <h3 class="ddi-card-title"><i class="fa-solid fa-grip-lines-vertical"></i> Vão no meio (dupla)</h3>
        <div class="ddst-seg" role="group" aria-label="Vão no meio da janela dupla">
          <label><input type="radio" name="gap" value="keep" checked><span>Manter</span></label>
          <label><input type="radio" name="gap" value="nogap"><span>Sem vão</span></label>
          <label><input type="radio" name="gap" value="gap"><span>Com vão</span></label>
        </div>
        <p class="ddi-hint">“Com vão” combina com batentes que têm um montante no meio.</p>
      </section>` : ""}

      <section class="ddst-block ddst-quick">
        <h3 class="ddi-card-title"><i class="fa-solid fa-wand-magic-sparkles"></i> Ajustes rápidos</h3>
        <div class="ddst-quick-row">
          <button type="button" class="ddg-ghost" data-action="reverse"><i class="fa-solid fa-right-left"></i> Abrir para o outro lado</button>
          <button type="button" class="ddg-ghost" data-action="hinge"><i class="fa-solid fa-arrow-right-arrow-left"></i> Trocar dobradiça</button>
          <button type="button" class="ddg-ghost" data-action="flip"><i class="fa-solid fa-arrows-up-down"></i> Espelhar arte</button>
        </div>
        <p class="ddi-hint">Valem para as selecionadas e já são salvos.</p>
      </section>

      <div class="ddst-actions">
        <button type="button" class="ddg-ghost" data-action="paths" data-tooltip="Corrige o caminho das artes na cena depois de trocar a pasta">
          <i class="fa-solid fa-route"></i> Atualizar caminhos</button>
        <button type="button" class="ddi-primary" data-action="apply"><i class="fa-solid fa-paintbrush"></i> Aplicar</button>
      </div>`;
    panel.oninput = (ev) => {
      if (ev.target.name === "duration") ev.target.closest(".ddi-slider").querySelector("output").textContent = `${ev.target.value} ms`;
    };
    panel.onchange = () => this.#refreshTargets();
    this.#refreshTargets(true);
  }

  #refreshTargets(initial = false) {
    const panel = this.element?.querySelector(".ddst-panel");
    if (!panel) return;
    const nSel = this.#targets("selected").length;
    const nAll = this.#targets("all").length;
    panel.querySelector('[data-count="selected"]').textContent = nSel;
    panel.querySelector('[data-count="all"]').textContent = nAll;
    if (initial) panel.querySelector(`input[name="scope"][value="${nSel ? "selected" : "all"}"]`).checked = true;
    const apply = this.element.querySelector('[data-action="apply"]');
    const scope = panel.querySelector('input[name="scope"]:checked')?.value;
    const n = scope === "all" ? nAll : nSel;
    apply.disabled = !n;
    apply.innerHTML = `<i class="fa-solid fa-paintbrush"></i> Aplicar${n ? ` em ${n}` : ""}`;
    this.element.querySelectorAll('[data-action="hinge"], [data-action="flip"], [data-action="reverse"]').forEach((b) => (b.disabled = !nSel));
  }

  #form() {
    const f = this.element.querySelector(".ddst-panel");
    const val = (n) => f.querySelector(`[name="${n}"]:checked`)?.value ?? f.querySelector(`[name="${n}"]`)?.value;
    return {
      scope: val("scope"), art: val("art"), vary: f.querySelector('[name="vary"]').checked,
      type: val("type"), duration: Number(val("duration")), double: val("double"), sound: val("sound"), mode: val("mode") ?? "keep",
      state: val("state") ?? "keep", openSide: val("openSide") ?? "keep", gap: val("gap") ?? "keep"
    };
  }

  static async #apply() {
    const o = this.#form();
    const targets = this.#targets(o.scope);
    if (!targets.length) return ui.notifications.warn("Nenhuma porta ou janela para aplicar.");
    const chosen = this.gallery.selectedEntry;
    if (o.art === "chosen" && !chosen) return ui.notifications.warn("Escolha uma arte na galeria (ou marque “Manter a arte atual”).");
    const entries = this.gallery.entries;
    const updates = targets.map((wall) => styleUpdate(wall, {
      entry: o.art === "chosen" ? (o.vary ? pickVariant(chosen, entries) : chosen) : null,
      type: o.type,
      duration: o.duration,
      sound: o.sound === "keep" ? undefined : o.sound,
      double: o.double === "keep" ? undefined : o.double === "double",
      kind: this.kind,
      state: o.state,
      reverse: needsReverse(wall, o.openSide),
      noGap: o.gap === "keep" ? undefined : o.gap === "nogap",
      windowMode: this.kind === "window" && o.mode !== "keep" ? o.mode : (this.kind === "door" && wallKind(wall) === "window" ? "toDoor" : undefined)
    }));
    await canvas.scene.updateEmbeddedDocuments("Wall", updates);
    await saveStyle(this.kind, {
      ...getStyle(this.kind),
      ...(chosen ? { art: chosen.file } : {}),
      type: o.type, duration: o.duration, vary: o.vary,
      ...(o.sound !== "keep" ? { sound: o.sound } : {})
    });
    ui.notifications.info(`${updates.length} ${this.kind === "window" ? "janela(s)" : "porta(s)"} atualizada(s).`);
  }

  static async #quick(kind) {
    const targets = this.#selected();
    if (!targets.length) return ui.notifications.warn("Selecione portas ou janelas no mapa primeiro.");
    const opts = { flip: { flip: "toggle" }, hinge: { direction: "toggle" }, reverse: { reverse: true } }[kind];
    const updates = targets.map((w) => styleUpdate(w, opts));
    await canvas.scene.updateEmbeddedDocuments("Wall", updates);
  }

  static #flip() { return DoorStyleTool.#quick.call(this, "flip"); }
  static #hinge() { return DoorStyleTool.#quick.call(this, "hinge"); }
  static #reverse() { return DoorStyleTool.#quick.call(this, "reverse"); }

  static #selectAll() {
    for (const w of canvas.walls.placeables) if (w.document.door && wallKind(w.document) === this.kind) w.control({ releaseOthers: false });
  }

  static async #paths() {
    const { updated, missing } = await updateScenePaths();
    ui.notifications.info(`Caminhos atualizados: ${updated}.${missing ? ` ${missing} arte(s) não encontradas nas pastas atuais.` : ""}`);
  }

  async close(options) {
    Hooks.off("controlWall", this._hook);
    DoorStyleTool.#instance = null;
    return super.close(options);
  }
}
