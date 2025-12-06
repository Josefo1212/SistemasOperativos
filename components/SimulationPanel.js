class SimulationPanel extends HTMLElement {
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
        <div class="results-head">
          <div class="card narrow" style="border:none; padding:0; background:transparent; box-shadow:none;">
            <h3>Configuración</h3>
            <div style="display:flex; gap:10px; align-items:flex-end;">
              <label>Quantum (RR)
                <input id="quantum" type="number" min="0.01" step="0.01" value="4" style="width:100px;">
              </label>
              <button id="run" class="button accent">Calcular</button>
            </div>
          </div>
          <div class="best" id="best-summary">Esperando cálculo...</div>
        </div>
        <div class="algo-grid" id="algo-grid"></div>
      </section>
    `;
  }

  setupEvents() {
    this.querySelector('#run').addEventListener('click', () => this.runSimulation());
  }

  setActivities(list) {
    this.activities = list;
    this.querySelector('#algo-grid').innerHTML = '';
    this.querySelector('#best-summary').textContent = 'Datos actualizados. Presiona Calcular.';
  }

  runSimulation() {
    if (!this.activities.length) {
      alert('No hay actividades cargadas.');
      return;
    }
    const q = Number(this.querySelector('#quantum').value);
    if (!Number.isFinite(q) || q <= 0) {
      alert('Quantum inválido.');
      return;
    }

    const fifoRes = this.fifo(this.activities);
    const lifoRes = this.lifo(this.activities);
    const rrRes = this.rr(this.activities, q);

    this.renderResults({ FIFO: fifoRes, LIFO: lifoRes, [`Round Robin (Q=${q})`]: rrRes });
  }

  renderResults(results) {
    const grid = this.querySelector('#algo-grid');
    const bestEl = this.querySelector('#best-summary');
    
    grid.innerHTML = Object.entries(results)
      .map(([name, data]) => this.cardTemplate(name, data))
      .join('');

    // Criterio: Mejor es el que tiene MAYOR índice de servicio promedio (I)
    const sorted = Object.entries(results).sort(([, a], [, b]) => b.avgI - a.avgI);
    const [bestName, bestData] = sorted[0];
    bestEl.textContent = `Mejor: ${bestName} (Prom I: ${this.fmt(bestData.avgI)})`;
  }

  cardTemplate(name, data) {
    const orderMap = new Map(this.activities.map((a, i) => [a.label, i]));
    const sortedRecords = data.records.slice().sort((a, b) => orderMap.get(a.label) - orderMap.get(b.label));

    const rows = sortedRecords.map(r => `
      <tr>
        <td>${r.label}</td>
        <td>${this.fmt(r.ti)}</td>
        <td>${this.fmt(r.t)}</td>
        <td>${this.fmt(r.tf)}</td>
        <td>${this.fmt(r.T)}</td>
        <td>${this.fmt(r.E)}</td>
        <td>${this.fmt(r.I)}</td>
      </tr>
    `).join('');

    return `
      <div class="algo-card">
        <header>
          <h3>${name}</h3>
          <span class="tag">Cálculo: ${this.fmt(data.duration)} ms</span>
        </header>
        <div class="metrics">
          <div class="metric">Prom. T: <strong>${this.fmt(data.avgT)}</strong></div>
          <div class="metric">Prom. E: <strong>${this.fmt(data.avgE)}</strong></div>
          <div class="metric">Prom. I: <strong>${this.fmt(data.avgI)}</strong></div>
          <div class="metric">tf Global: <strong>${this.fmt(data.makespan)}</strong></div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Etiqueta</th><th>ti</th><th>t</th><th>tf</th><th>T</th><th>E</th><th>I</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  fmt(n) { return Number.isFinite(n) ? Number(n).toFixed(4) : '-'; }

  computeMetrics(job, tf) {
    const T = tf - job.ti;
    const E = T - job.t;
    const I = T > 0 ? job.t / T : 0;
    return { ...job, tf, T, E, I };
  }

  summaries(records, duration) {
    const total = records.reduce((acc, r) => ({ T: acc.T + r.T, E: acc.E + r.E, I: acc.I + r.I }), { T: 0, E: 0, I: 0 });
    const n = records.length || 1;
    const makespan = records.reduce((max, r) => Math.max(max, r.tf), 0);
    return {
      records,
      duration,
      avgT: total.T / n,
      avgE: total.E / n,
      avgI: total.I / n,
      makespan
    };
  }

  fifo(jobs) {
    const start = performance.now();
    const procesos = jobs.map(j => ({ ...j })); 
    const completados = new Array(procesos.length).fill(false);
    const resultados = new Array(procesos.length);
    let clk = 0;
    let procesados = 0;

    while (procesados < procesos.length) {
      let idx = -1;
      for (let i = 0; i < procesos.length; i++) {
        if (!completados[i] && procesos[i].ti <= clk) {
          idx = i;
          break;
        }
      }

      if (idx === -1) {
        let siguiente_ti = Infinity;
        for (let i = 0; i < procesos.length; i++) {
          if (!completados[i] && procesos[i].ti > clk) {
            siguiente_ti = Math.min(siguiente_ti, procesos[i].ti);
          }
        }
        if (siguiente_ti === Infinity) break;
        clk = siguiente_ti;
        continue;
      }

      completados[idx] = true;
      const p = procesos[idx];
      const tf = clk + p.t;
      resultados[idx] = this.computeMetrics(p, tf);
      clk = tf;
      procesados++;
    }
    
    const finalRecords = resultados.filter(r => r);
    return this.summaries(finalRecords, performance.now() - start);
  }

  lifo(jobs) {
    const start = performance.now();
    const procesos = jobs.map(j => ({ ...j }));
    const completados = new Array(procesos.length).fill(false);
    const resultados = new Array(procesos.length);
    let clk = 0;
    let procesados = 0;

    while (procesados < procesos.length) {
      let idx = -1;
      for (let i = procesos.length - 1; i >= 0; i--) {
        if (!completados[i] && procesos[i].ti <= clk) {
          idx = i;
          break;
        }
      }

      if (idx === -1) {
        let siguiente_ti = Infinity;
        for (let i = 0; i < procesos.length; i++) {
          if (!completados[i] && procesos[i].ti > clk) {
            siguiente_ti = Math.min(siguiente_ti, procesos[i].ti);
          }
        }
        if (siguiente_ti === Infinity) break;
        clk = siguiente_ti;
        continue;
      }

      completados[idx] = true;
      const p = procesos[idx];
      const tf = clk + p.t;
      resultados[idx] = this.computeMetrics(p, tf);
      clk = tf;
      procesados++;
    }

    const finalRecords = resultados.filter(r => r);
    return this.summaries(finalRecords, performance.now() - start);
  }

  rr(jobs, quantum) {
    const start = performance.now();
    const procesos = jobs.map(j => ({ ...j, remaining: j.t }));
    let clk = 0;
    let procesosTerminados = 0;
    const n = procesos.length;
    const finalMetrics = new Array(n);

    while (procesosTerminados < n) {
      let procesoEjecutado = false;

      for (let i = 0; i < n; i++) {
        if (procesos[i].ti <= clk && procesos[i].remaining > 0) {
          const run = Math.min(quantum, procesos[i].remaining);
          procesos[i].remaining -= run;
          clk += run;
          procesoEjecutado = true;

          if (procesos[i].remaining === 0) {
             finalMetrics[i] = this.computeMetrics(jobs[i], clk);
             procesosTerminados++;
          }
        }
      }

      if (!procesoEjecutado) {
        let siguiente_ti = Infinity;
        for (let i = 0; i < n; i++) {
          if (procesos[i].remaining > 0) {
            siguiente_ti = Math.min(siguiente_ti, procesos[i].ti);
          }
        }
        if (siguiente_ti !== Infinity) {
           clk = Math.max(clk, siguiente_ti);
        }
      }
    }
    
    const finalRecords = finalMetrics.filter(r => r);
    return this.summaries(finalRecords, performance.now() - start);
  }
}

customElements.define('simulation-panel', SimulationPanel);
