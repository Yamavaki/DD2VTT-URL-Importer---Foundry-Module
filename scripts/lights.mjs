import { MODULE_ID } from "./library.mjs";
import { adjustLight, groupLights } from "./uvtt.mjs";

const fmt = (n) => (Math.round(n * 10) / 10).toLocaleString("pt-BR");

/**
 * Ferramenta "Luzes da cena": aumenta ou diminui o raio (luz fraca e forte) de várias luzes de uma vez.
 */
export class SceneLightsTool extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-lights`,
    classes: [MODULE_ID, "ddl"],
    window: { title: "Luzes da cena", icon: "fa-solid fa-lightbulb", resizable: true },
    position: { width: 560, height: "auto" },
    actions: {
      quick: SceneLightsTool.#quick,
      apply: SceneLightsTool.#apply,
      undo: SceneLightsTool.#undo,
      groupsAll: SceneLightsTool.#groupsAll,
      groupsNone: SceneLightsTool.#groupsNone
    }
  };

  static #instance = null;
  static open() {
    if (!game.user.isGM) return ui.notifications.warn("Só o mestre pode mudar as luzes.");
    if (!canvas?.scene) return ui.notifications.warn("Abra uma cena primeiro.");
    this.#instance ??= new SceneLightsTool();
    this.#instance.render({ force: true });
    return this.#instance;
  }

  /** Pilha de desfazer: cada item é a lista de valores antigos de uma aplicação. */
  history = [];
  /** Grupos desmarcados (pela chave "fraca|forte"). */
  excluded = new Set();
  op = { mode: "add", dim: 2, bright: 1, keepRatio: true };

  constructor(options) {
    super(options);
    this._hooks = [
      ["controlAmbientLight", Hooks.on("controlAmbientLight", () => this.#refresh())],
      ["createAmbientLight", Hooks.on("createAmbientLight", () => this.#refresh())],
      ["updateAmbientLight", Hooks.on("updateAmbientLight", () => this.#refresh())],
      ["deleteAmbientLight", Hooks.on("deleteAmbientLight", () => this.#refresh())],
      ["canvasReady", Hooks.on("canvasReady", () => { this.history = []; this.excluded.clear(); this.#refresh(); })]
    ];
  }

  /* ---------------- dados ---------------- */

  #all() {
    return (canvas?.scene?.lights?.contents ?? []).map((d) => ({ id: d.id, dim: d.config?.dim ?? 0, bright: d.config?.bright ?? 0, doc: d }));
  }
  #selectedIds() {
    return new Set((canvas?.lighting?.controlled ?? []).map((l) => l.document?.id).filter(Boolean));
  }
  #scope() {
    return this.element?.querySelector('input[name="scope"]:checked')?.value ?? "all";
  }
  /** Luzes que vão mudar: escopo (selecionadas/todas) + grupos marcados. */
  #targets() {
    const sel = this.#selectedIds();
    const base = this.#scope() === "selected" ? this.#all().filter((l) => sel.has(l.id)) : this.#all();
    return base.filter((l) => !this.excluded.has(`${Math.round(l.dim * 10) / 10}|${Math.round(l.bright * 10) / 10}`));
  }

  /* ---------------- interface ---------------- */

  async _renderHTML() {
    return `
    <div class="ddi-body ddl-body">
      <section class="ddi-card">
        <h3 class="ddi-card-title"><i class="fa-solid fa-crosshairs"></i> Quais luzes</h3>
        <label class="ddst-radio"><input type="radio" name="scope" value="all" checked> <span>Todas da cena <b data-count="all">0</b></span></label>
        <label class="ddst-radio"><input type="radio" name="scope" value="selected"> <span>Só as selecionadas <b data-count="selected">0</b></span></label>
        <div class="ddl-groups-head">
          <span class="ddi-label">Tamanhos encontrados (fraca / forte)</span>
          <span class="ddl-links">
            <button type="button" class="ddl-link" data-action="groupsAll">marcar todos</button> ·
            <button type="button" class="ddl-link" data-action="groupsNone">nenhum</button>
          </span>
        </div>
        <div class="ddl-groups" role="group" aria-label="Grupos de luzes por tamanho"></div>
      </section>

      <section class="ddi-card">
        <h3 class="ddi-card-title"><i class="fa-solid fa-bolt"></i> Ajuste rápido</h3>
        <p class="ddi-hint">Soma na luz fraca na hora; a forte acompanha na mesma proporção. Dá para desfazer.</p>
        <div class="ddl-quick" role="group" aria-label="Ajuste rápido do raio">
          ${[-2, -1, 1, 2, 5].map((v) => `<button type="button" data-action="quick" data-value="${v}" class="${v > 0 ? "is-plus" : "is-minus"}">${v > 0 ? "+" : "−"}${Math.abs(v)} m</button>`).join("")}
        </div>
      </section>

      <section class="ddi-card">
        <h3 class="ddi-card-title"><i class="fa-solid fa-sliders"></i> Ajuste fino</h3>
        <div class="ddst-seg" role="radiogroup" aria-label="Tipo de ajuste">
          <label><input type="radio" name="mode" value="add" ${this.op.mode === "add" ? "checked" : ""}><span>Somar metros</span></label>
          <label><input type="radio" name="mode" value="mul" ${this.op.mode === "mul" ? "checked" : ""}><span>Multiplicar</span></label>
          <label><input type="radio" name="mode" value="set" ${this.op.mode === "set" ? "checked" : ""}><span>Definir valor</span></label>
        </div>
        <div class="ddi-row">
          <label class="ddi-field"><span class="ddi-label" data-label="dim">Luz fraca (dim)</span>
            <span class="ddi-suffix"><input type="number" name="dim" step="0.5" value="${this.op.dim}"><em data-unit="dim">m</em></span></label>
          <label class="ddi-field" data-bright-field><span class="ddi-label" data-label="bright">Luz forte (bright)</span>
            <span class="ddi-suffix"><input type="number" name="bright" step="0.5" value="${this.op.bright}"><em data-unit="bright">m</em></span></label>
        </div>
        <label class="ddi-toggle">
          <span class="ddi-toggle-text"><span class="ddi-toggle-label">Luz forte acompanha a fraca</span>
            <span class="ddi-hint">Mantém a proporção que cada luz já tinha (ex.: forte = metade da fraca).</span></span>
          <span class="ddi-switch"><input type="checkbox" name="keepRatio" ${this.op.keepRatio ? "checked" : ""}><span class="ddi-switch-track"></span></span>
        </label>
        <div class="ddl-preview" aria-live="polite"></div>
      </section>
    </div>
    <footer class="ddi-footer">
      <button type="button" class="ddg-ghost" data-action="undo"><i class="fa-solid fa-rotate-left"></i> Desfazer</button>
      <button type="button" class="ddi-primary" data-action="apply"><i class="fa-solid fa-lightbulb"></i> Aplicar</button>
    </footer>`;
  }

  _replaceHTML(result, content) { content.innerHTML = result; }

  async _onRender(context, options) {
    await super._onRender?.(context, options);
    const root = this.element;
    root.addEventListener("input", (ev) => this.#readOp(ev));
    root.addEventListener("change", (ev) => {
      const t = ev.target;
      if (t.name === "group") {
        if (t.checked) this.excluded.delete(t.value); else this.excluded.add(t.value);
      }
      if (t.name === "scope") return this.#refresh();
      this.#readOp(ev);
    });
    if (!this.#selectedIds().size) root.querySelector('input[name="scope"][value="all"]').checked = true;
    else root.querySelector('input[name="scope"][value="selected"]').checked = true;
    this.#refresh();
  }

  #readOp(ev) {
    const root = this.element;
    const prevMode = this.op.mode;
    const mode = root.querySelector('input[name="mode"]:checked')?.value ?? "add";
    this.op.mode = mode;
    this.op.keepRatio = root.querySelector('input[name="keepRatio"]').checked;
    const dimIn = root.querySelector('input[name="dim"]');
    const brightIn = root.querySelector('input[name="bright"]');
    if (mode !== prevMode && ev?.target?.name === "mode") {
      // Valores iniciais que fazem sentido para cada modo.
      const defaults = { add: [2, 1], mul: [1.5, 1.5], set: [10, 5] }[mode];
      dimIn.value = defaults[0];
      brightIn.value = defaults[1];
    }
    this.op.dim = Number(dimIn.value) || 0;
    this.op.bright = Number(brightIn.value) || 0;
    this.#refreshPreview();
  }

  #refresh() {
    const root = this.element;
    if (!root) return;
    const all = this.#all();
    const sel = this.#selectedIds();
    root.querySelector('[data-count="all"]').textContent = all.length;
    root.querySelector('[data-count="selected"]').textContent = sel.size;
    root.querySelector('input[name="scope"][value="selected"]').disabled = !sel.size;
    if (!sel.size && this.#scope() === "selected") root.querySelector('input[name="scope"][value="all"]').checked = true;

    const scoped = this.#scope() === "selected" ? all.filter((l) => sel.has(l.id)) : all;
    const groups = groupLights(scoped);
    const max = Math.max(1, ...groups.map((g) => g.dim));
    const box = root.querySelector(".ddl-groups");
    box.innerHTML = groups.length ? groups.map((g) => `
      <label class="ddl-group">
        <input type="checkbox" name="group" value="${g.key}" ${this.excluded.has(g.key) ? "" : "checked"}>
        <span class="ddl-group-size">${fmt(g.dim)} / ${fmt(g.bright)} m</span>
        <span class="ddl-bar" aria-hidden="true"><span class="ddl-bar-dim" style="width:${(g.dim / max) * 100}%"></span><span class="ddl-bar-bright" style="width:${(g.bright / max) * 100}%"></span></span>
        <span class="ddl-group-count">${g.ids.length} luz${g.ids.length === 1 ? "" : "es"}</span>
      </label>`).join("") : `<p class="ddi-hint">Nenhuma luz nesta cena.</p>`;
    this.#refreshPreview();
  }

  #refreshPreview() {
    const root = this.element;
    if (!root) return;
    const { mode, keepRatio } = this.op;
    root.querySelector('[data-label="dim"]').textContent = { add: "Somar na luz fraca", mul: "Multiplicar a luz fraca", set: "Luz fraca (dim)" }[mode];
    root.querySelector('[data-label="bright"]').textContent = { add: "Somar na luz forte", mul: "Multiplicar a luz forte", set: "Luz forte (bright)" }[mode];
    root.querySelectorAll("[data-unit]").forEach((e) => (e.textContent = mode === "mul" ? "×" : "m"));
    root.querySelector("[data-bright-field]").classList.toggle("is-disabled", keepRatio);
    root.querySelector('input[name="bright"]').disabled = keepRatio;

    const targets = this.#targets();
    const groups = groupLights(targets);
    const prev = root.querySelector(".ddl-preview");
    prev.innerHTML = groups.length ? `<span class="ddi-label">Prévia</span>` + groups.slice(0, 8).map((g) => {
      const n = adjustLight(g, this.op);
      return `<div class="ddl-prev-row"><span>${g.ids.length}×</span> <b>${fmt(g.dim)} / ${fmt(g.bright)}</b>
        <i class="fa-solid fa-arrow-right" aria-hidden="true"></i> <b class="ddl-new">${fmt(n.dim)} / ${fmt(n.bright)} m</b></div>`;
    }).join("") + (groups.length > 8 ? `<p class="ddi-hint">…e mais ${groups.length - 8} tamanho(s).</p>` : "")
      : `<p class="ddi-hint">Nenhuma luz marcada.</p>`;
    const apply = root.querySelector('[data-action="apply"]');
    apply.disabled = !targets.length;
    apply.innerHTML = `<i class="fa-solid fa-lightbulb"></i> Aplicar em ${targets.length} luz${targets.length === 1 ? "" : "es"}`;
    const undo = root.querySelector('[data-action="undo"]');
    undo.disabled = !this.history.length;
  }

  async #commit(op) {
    const targets = this.#targets();
    if (!targets.length) return ui.notifications.warn("Nenhuma luz marcada para mudar.");
    const before = targets.map((l) => ({ _id: l.id, "config.dim": l.dim, "config.bright": l.bright }));
    const updates = targets.map((l) => {
      const n = adjustLight(l, op);
      return { _id: l.id, "config.dim": n.dim, "config.bright": n.bright };
    });
    this.history.push(before);
    if (this.history.length > 20) this.history.shift();
    // Os grupos mudam de tamanho depois de aplicar: o filtro de grupos recomeça.
    this.excluded.clear();
    await canvas.scene.updateEmbeddedDocuments("AmbientLight", updates);
    this.#refresh();
  }

  static #quick(event, target) {
    return this.#commit({ mode: "add", dim: Number(target.dataset.value), bright: 0, keepRatio: true });
  }

  static #apply() {
    return this.#commit({ ...this.op });
  }

  static async #undo() {
    const last = this.history.pop();
    if (!last) return;
    await canvas.scene.updateEmbeddedDocuments("AmbientLight", last.filter((u) => canvas.scene.lights.get(u._id)));
    this.excluded.clear();
    this.#refresh();
  }

  static #groupsAll() { this.excluded.clear(); this.#refresh(); }
  static #groupsNone() {
    for (const cb of this.element.querySelectorAll('input[name="group"]')) this.excluded.add(cb.value);
    this.#refresh();
  }

  async close(options) {
    for (const [name, id] of this._hooks ?? []) Hooks.off(name, id);
    SceneLightsTool.#instance = null;
    return super.close(options);
  }
}
