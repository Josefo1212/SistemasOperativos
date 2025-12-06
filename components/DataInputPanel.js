class DataInputPanel extends HTMLElement {
  constructor() {
    super();
    this.activities = [];
  }

  connectedCallback() {
    this.render();
    this.setupEvents();
  }

  render() {
    this.innerHTML = `
      <section class="panel">
        <h2>Datos de entrada</h2>
        <div class="inputs">
          <div class="card">
            <h3>Desde CSV</h3>
            <p class="hint">Cabecera requerida: <code>label,ti,t</code> (o x,y).</p>
            <label class="button file-button">
              <input id="file-input" type="file" accept=".csv" hidden>
              <span>Seleccionar CSV</span>
            </label>
            <button id="load-default" class="button ghost">Cargar data.csv</button>
          </div>
          <div class="card">
            <h3>Agregar actividad</h3>
            <form id="add-form" class="form">
              <label>Etiqueta <input name="label" type="text" required placeholder="A2"></label>
              <label>ti (inicio) <input name="ti" type="number" min="0" step="0.01" required></label>
              <label>t (duración) <input name="t" type="number" min="0" step="0.01" required></label>
              <button class="button" type="submit">Agregar</button>
            </form>
          </div>
        </div>
        <div class="table-wrap">
          <div class="table-head">
            <h3>Actividades cargadas</h3>
            <button id="clear" class="button ghost">Limpiar lista</button>
          </div>
          <table id="input-table">
            <thead>
              <tr><th>Etiqueta</th><th>ti</th><th>t</th></tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </section>
    `;
    this.updateTable();
  }

  setupEvents() {
    this.querySelector('#file-input').addEventListener('change', (e) => this.handleFile(e));
    this.querySelector('#load-default').addEventListener('click', () => this.loadDefault());
    this.querySelector('#add-form').addEventListener('submit', (e) => this.handleAdd(e));
    this.querySelector('#clear').addEventListener('click', () => this.clear());
  }

  updateTable() {
    const tbody = this.querySelector('#input-table tbody');
    if (!this.activities.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty">Sin datos. Carga un CSV o agrega actividades.</td></tr>';
      return;
    }
    tbody.innerHTML = this.activities
      .map(act => `<tr><td>${act.label}</td><td>${this.fmt(act.ti)}</td><td>${this.fmt(act.t)}</td></tr>`)
      .join('');
  }

  fmt(n) { return Number.isFinite(n) ? Number(n).toFixed(2) : '-'; }

  notifyChange() {
    this.dispatchEvent(new CustomEvent('activities-changed', { 
      detail: { activities: this.activities },
      bubbles: true 
    }));
  }

  parseCSV(text) {
    return text.trim().split(/\r?\n/).slice(1)
      .map(line => line.split(',').map(c => c.trim()))
      .filter(row => row.length >= 3)
      .map(([label, ti, t]) => ({ label, ti: Number(ti), t: Number(t) }))
      .filter(r => r.label && Number.isFinite(r.ti) && Number.isFinite(r.t));
  }

  addActivities(newOnes) {
    this.activities.push(...newOnes);
    this.updateTable();
    this.notifyChange();
  }

  handleFile(e) {
    const [file] = e.target.files;
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => this.addActivities(this.parseCSV(String(ev.target.result)));
    reader.readAsText(file);
    e.target.value = '';
  }

  async loadDefault() {
    try {
      const res = await fetch('data.csv');
      if (!res.ok) throw new Error('Error loading data.csv');
      const text = await res.text();
      const cleanText = text.replace(/label,x,y/i, 'label,ti,t');
      this.addActivities(this.parseCSV(cleanText));
    } catch (err) {
      alert('No se pudo cargar data.csv automáticamente.');
    }
  }

  handleAdd(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const label = fd.get('label').trim();
    const ti = Number(fd.get('ti'));
    const t = Number(fd.get('t'));
    if (label && Number.isFinite(ti) && Number.isFinite(t)) {
      this.addActivities([{ label, ti, t }]);
      e.target.reset();
    }
  }

  clear() {
    this.activities = [];
    this.updateTable();
    this.notifyChange();
  }
}

customElements.define('data-input-panel', DataInputPanel);
