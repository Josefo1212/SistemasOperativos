const state = { activities: [] };

const fileInput = document.getElementById('file-input');
const loadDefaultBtn = document.getElementById('load-default');
const addForm = document.getElementById('add-form');
const runBtn = document.getElementById('run');
const clearBtn = document.getElementById('clear');
const quantumInput = document.getElementById('quantum');
const inputTableBody = document.querySelector('#input-table tbody');
const algoGrid = document.getElementById('algo-grid');
const bestSummary = document.getElementById('best-summary');

const formatNumber = (n) => Number.isFinite(n) ? Number(n).toFixed(2) : '-';

function renderInputTable() {
  // Respetamos el orden de carga (mismo que en el CSV o inserción manual)
  const rows = state.activities
    .map((act) => `<tr><td>${act.label}</td><td>${formatNumber(act.ti)}</td><td>${formatNumber(act.t)}</td></tr>`)
    .join('');
  inputTableBody.innerHTML = rows || '<tr><td colspan="3" class="empty">Sin datos. Carga un CSV o agrega actividades.</td></tr>';
}

function parseCSV(text) {
  return text
    .trim()
    .split(/\r?\n/)
    .slice(1) // skip header
    .map((line) => line.split(',').map((cell) => cell.trim()))
    .filter((row) => row.length >= 3)
    .map(([label, ti, t]) => ({ label, ti: Number(ti), t: Number(t) }))
    .filter((row) => row.label && Number.isFinite(row.ti) && Number.isFinite(row.t));
}

function addActivities(newOnes) {
  state.activities.push(...newOnes);
  renderInputTable();
}

function loadFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const rows = parseCSV(String(e.target.result));
    addActivities(rows);
  };
  reader.readAsText(file);
}

fileInput.addEventListener('change', (e) => {
  const [file] = e.target.files;
  if (file) loadFile(file);
  fileInput.value = '';
});

loadDefaultBtn.addEventListener('click', async () => {
  try {
    const res = await fetch('data.csv');
    if (!res.ok) throw new Error('No se pudo leer data.csv');
    const text = await res.text();
    const rows = parseCSV(text.replace(/label,x,y/i, 'label,ti,t'));
    addActivities(rows);
  } catch (err) {
    alert('Error al cargar data.csv. Si abres el HTML como archivo local, usa el selector CSV.');
    console.error(err);
  }
});

addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const formData = new FormData(addForm);
  const label = String(formData.get('label') || '').trim();
  const ti = Number(formData.get('ti'));
  const t = Number(formData.get('t'));
  if (!label || !Number.isFinite(ti) || !Number.isFinite(t)) return;
  addActivities([{ label, ti, t }]);
  addForm.reset();
});

clearBtn.addEventListener('click', () => {
  state.activities = [];
  renderInputTable();
  algoGrid.innerHTML = '';
  bestSummary.textContent = 'Lista vacia. Carga datos para calcular.';
});

function computeCommonMetrics(order) {
  let time = 0;
  return order.map((job) => {
    const start = Math.max(time, job.ti);
    const tf = start + job.t;
    const T = tf - job.ti;
    const E = T - job.t;
    const I = job.t / T;
    time = tf;
    return { ...job, tf, T, E, I };
  });
}

function fifo(jobs) {
  const started = performance.now();
  const ordered = jobs
    .slice()
    .sort((a, b) => a.ti - b.ti || a.label.localeCompare(b.label, 'es', { numeric: true }));
  const records = computeCommonMetrics(ordered);
  const duration = performance.now() - started;
  return { records, ...summaries(records), duration };
}

function lifo(jobs) {
  const started = performance.now();
  const pending = jobs
    .slice()
    .sort((a, b) => a.ti - b.ti || a.label.localeCompare(b.label, 'es', { numeric: true }));
  const ready = [];
  const records = [];
  let t = 0;
  while (pending.length || ready.length) {
    while (pending.length && pending[0].ti <= t) ready.push(pending.shift());
    if (!ready.length) {
      t = pending[0].ti;
      continue;
    }
    const job = ready.pop();
    const start = Math.max(t, job.ti);
    const tf = start + job.t;
    const T = tf - job.ti;
    const E = T - job.t;
    const I = job.t / T;
    t = tf;
    records.push({ ...job, tf, T, E, I });
  }
  const duration = performance.now() - started;
  return { records, ...summaries(records), duration };
}

function rr(jobs, quantum) {
  const started = performance.now();
  const pending = jobs
    .slice()
    .sort((a, b) => a.ti - b.ti || a.label.localeCompare(b.label, 'es', { numeric: true }));
  const queue = [];
  const records = [];
  const remaining = new Map(pending.map((job) => [job.label, job.t]));
  let t = pending[0]?.ti ?? 0;
  while (pending.length || queue.length) {
    while (pending.length && pending[0].ti <= t) queue.push(pending.shift());
    if (!queue.length) {
      t = pending[0].ti;
      continue;
    }
    const job = queue.shift();
    const rem = remaining.get(job.label) ?? 0;
    const run = Math.min(rem, quantum);
    const start = t;
    t += run;
    const left = rem - run;
    remaining.set(job.label, left);
    while (pending.length && pending[0].ti <= t) queue.push(pending.shift());
    if (left > 0) {
      queue.push(job);
    } else {
      const tf = t;
      const T = tf - job.ti;
      const E = T - job.t;
      const I = job.t / T;
      records.push({ ...job, tf, T, E, I });
    }
  }
  const duration = performance.now() - started;
  return { records, ...summaries(records), duration };
}

function summaries(records) {
  const total = records.reduce((acc, r) => {
    acc.T += r.T;
    acc.E += r.E;
    acc.I += r.I;
    return acc;
  }, { T: 0, E: 0, I: 0 });
  const n = records.length || 1;
  const makespan = records.reduce((max, r) => Math.max(max, r.tf), 0);
  return {
    avgT: total.T / n,
    avgE: total.E / n,
    avgI: total.I / n,
    totalT: total.T,
    totalE: total.E,
    totalI: total.I,
    makespan
  };
}

function renderAlgo(name, data) {
  const rows = data.records.map((r) => `
    <tr>
      <td>${r.label}</td>
      <td>${formatNumber(r.ti)}</td>
      <td>${formatNumber(r.t)}</td>
      <td>${formatNumber(r.tf)}</td>
      <td>${formatNumber(r.T)}</td>
      <td>${formatNumber(r.E)}</td>
      <td>${formatNumber(r.I)}</td>
    </tr>`).join('');
  return `
    <div class="algo-card">
      <header>
        <h3>${name}</h3>
        <span class="tag">Cálculo: ${formatNumber(data.duration)} ms</span>
      </header>
      <div class="metrics">
        <div class="metric">Prom. T: <strong>${formatNumber(data.avgT)}</strong></div>
        <div class="metric">Prom. E: <strong>${formatNumber(data.avgE)}</strong></div>
        <div class="metric">Prom. I: <strong>${formatNumber(data.avgI)}</strong></div>
        <div class="metric">Final (tf): <strong>${formatNumber(data.makespan)}</strong></div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Etiqueta</th><th>ti</th><th>t</th><th>tf</th><th>T</th><th>E</th><th>I</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function selectBest(results) {
  const entries = Object.entries(results);
  entries.sort(([, a], [, b]) => a.avgT - b.avgT || a.avgE - b.avgE || a.duration - b.duration);
  const [winnerKey, winnerData] = entries[0];
  return { winnerKey, winnerData };
}

runBtn.addEventListener('click', () => {
  if (!state.activities.length) {
    alert('Primero carga actividades.');
    return;
  }
  const quantum = Number(quantumInput.value);
  if (!Number.isFinite(quantum) || quantum <= 0) {
    alert('Ingresa un quantum mayor a 0.');
    return;
  }
  const fifoRes = fifo(state.activities);
  const lifoRes = lifo(state.activities);
  const rrRes = rr(state.activities, quantum);
  const results = { FIFO: fifoRes, LIFO: lifoRes, 'Round Robin': rrRes };
  const best = selectBest(results);
  bestSummary.textContent = `Mejor: ${best.winnerKey} (prom. T ${formatNumber(best.winnerData.avgT)})`;
  algoGrid.innerHTML = [
    renderAlgo('FIFO', fifoRes),
    renderAlgo('LIFO', lifoRes),
    renderAlgo(`Round Robin (Q=${formatNumber(quantum)})`, rrRes),
  ].join('');
});

renderInputTable();
