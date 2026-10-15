const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const int = new Intl.NumberFormat('pt-BR');
const $ = (selector) => document.querySelector(selector);

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function formatDate(value) {
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.erro || `Erro ${response.status}`);
  return body;
}

function setMessage(target, text, ok) {
  target.textContent = text;
  target.className = `msg ${ok ? 'ok' : 'err'}`;
}

function emptyRow(tbody, cols, text) {
  tbody.replaceChildren(el('tr', {}, el('td', { colSpan: cols, className: 'empty', textContent: text })));
}

async function loadStock() {
  const tbody = $('#tabela-estoque');
  try {
    const rows = await api('/produtos/estoque');
    $('#kpi-produtos').textContent = int.format(rows.length);
    $('#kpi-unidades').textContent = int.format(rows.reduce((s, r) => s + Number(r.quantidade), 0));
    $('#kpi-valor').textContent = brl.format(rows.reduce((s, r) => s + Number(r.valor_total), 0));

    const select = $('#select-produto');
    const selected = select.value;
    select.replaceChildren(...rows.map((r) => el('option', { value: r.id, textContent: `${r.nome} (${int.format(r.quantidade)} em estoque)` })));
    if (selected) select.value = selected;
    $('#categorias').replaceChildren(...[...new Set(rows.map((r) => r.categoria))].map((c) => el('option', { value: c })));

    if (!rows.length) return emptyRow(tbody, 7, 'Nenhum produto cadastrado.');
    tbody.replaceChildren(...rows.map((r) => {
      const pct = Math.min(100, Number(r.quantidade));
      const level = el('div', { className: `level${pct >= 100 ? ' max' : ''}`, title: `${r.quantidade} de 100` }, el('i'));
      level.firstChild.style.width = `${pct}%`;
      return el('tr', {},
        el('td', { className: 'id', textContent: String(r.id).padStart(3, '0') }),
        el('td', { textContent: r.nome }),
        el('td', { className: 'muted', textContent: r.categoria }),
        el('td', { className: 'num', textContent: int.format(r.quantidade) }),
        el('td', { className: 'num', textContent: brl.format(r.valor) }),
        el('td', { className: 'num', textContent: brl.format(r.valor_total) }),
        el('td', {}, level));
    }));
  } catch (error) {
    emptyRow(tbody, 7, error.message);
  }
}

async function loadMovements() {
  const tbody = $('#tabela-mov');
  try {
    const rows = await api('/movimentacoes');
    if (!rows.length) return emptyRow(tbody, 4, 'Nenhuma movimentação registrada.');
    tbody.replaceChildren(...rows.map((r) => el('tr', {},
      el('td', { className: 'id', textContent: formatDate(r.data) }),
      el('td', {}, el('span', { className: `badge ${r.tipo}`, textContent: r.tipo })),
      el('td', { textContent: r.produto }),
      el('td', { className: 'num', textContent: int.format(r.quantidade) }))));
  } catch (error) {
    emptyRow(tbody, 4, error.message);
  }
}

async function loadCategories() {
  const list = $('#lista-categorias');
  try {
    const rows = (await api('/produtos/total-categoria')).sort((a, b) => b.valor_total - a.valor_total);
    const max = Math.max(...rows.map((r) => Number(r.valor_total)), 1);
    list.replaceChildren(...rows.map((r) => {
      const bar = el('div', { className: 'bar' }, el('i'));
      bar.firstChild.style.width = `${(Number(r.valor_total) / max) * 100}%`;
      return el('li', {}, el('span', { textContent: r.categoria }), el('strong', { textContent: brl.format(r.valor_total) }), bar);
    }));
    if (!rows.length) list.replaceChildren(el('li', { className: 'muted', textContent: 'Sem dados.' }));
  } catch (error) {
    list.replaceChildren(el('li', { className: 'muted', textContent: error.message }));
  }
}

async function loadLimits() {
  const list = $('#lista-limites');
  try {
    const rows = await api('/produtos/limites-estoque');
    list.replaceChildren(...rows.map((r) => el('li', { className: r.limite_atingido === 'mínimo' ? 'min' : 'max' },
      `${r.nome} · ${int.format(r.quantidade)}`, el('b', { textContent: r.limite_atingido }))));
    if (!rows.length) list.replaceChildren(el('li', { className: 'muted', textContent: 'Nenhum produto nos limites.' }));
  } catch (error) {
    list.replaceChildren(el('li', { className: 'muted', textContent: error.message }));
  }
}

const refresh = () => Promise.all([loadStock(), loadMovements(), loadCategories(), loadLimits()]);

async function submitForm(form, handler) {
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await handler(Object.fromEntries(new FormData(form)));
  } finally {
    button.disabled = false;
  }
}

$('#form-produto').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  submitForm(form, async (data) => {
    try {
      const result = await api('/produtos', { method: 'POST', body: JSON.stringify({ ...data, quantidade: Number(data.quantidade) }) });
      setMessage($('#msg-produto'), `${result.mensagem} (#${result.id})`, true);
      form.reset();
      await refresh();
    } catch (error) {
      setMessage($('#msg-produto'), error.message, false);
    }
  });
});

$('#form-mov').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  submitForm(form, async ({ tipo, ...data }) => {
    try {
      const result = await api(`/movimentacoes/${tipo}`, {
        method: 'POST',
        body: JSON.stringify({ ...data, produtos_id: Number(data.produtos_id), quantidade: Number(data.quantidade) }),
      });
      setMessage($('#msg-mov'), result.mensagem, true);
      form.elements.quantidade.value = '';
      await refresh();
    } catch (error) {
      setMessage($('#msg-mov'), error.message, false);
    }
  });
});

$('#form-periodo').addEventListener('submit', (event) => {
  event.preventDefault();
  submitForm(event.currentTarget, async ({ dataInicial, dataFinal }) => {
    const query = new URLSearchParams({ dataInicial, dataFinal });
    const tbody = $('#tabela-periodo');
    try {
      const [periodo, maiores] = await Promise.all([
        api(`/movimentacoes/periodo?${query}`),
        api(`/movimentacoes/maiores-saidas?${query}`),
      ]);
      $('#msg-periodo').textContent = '';
      if (!periodo.length) emptyRow(tbody, 6, 'Nenhuma movimentação no período.');
      else tbody.replaceChildren(...periodo.map((r) => el('tr', {},
        el('td', { textContent: `${r.nome_produto} ` }, el('small', { className: 'muted', textContent: r.unidade_medida })),
        el('td', { className: 'num', textContent: int.format(r.total_entradas) }),
        el('td', { className: 'num', textContent: int.format(r.total_saidas) }),
        el('td', { className: 'num', textContent: int.format(r.saldo_periodo) }),
        el('td', { className: 'num', textContent: brl.format(r.valor_entradas) }),
        el('td', { className: 'num', textContent: brl.format(r.valor_saidas) }))));
      $('#lista-maiores').replaceChildren(...(maiores.length ? maiores.map((r) => el('li', {},
        el('span', { textContent: `${r.produto} ` }, el('small', { textContent: r.categoria })),
        el('strong', { textContent: int.format(r.total_saidas) }))) : [el('li', { className: 'muted', textContent: 'Nenhuma saída no período.' })]));
    } catch (error) {
      setMessage($('#msg-periodo'), error.message, false);
    }
  });
});

$('#recarregar').addEventListener('click', refresh);

const today = new Date().toISOString().slice(0, 10);
$('#form-mov').elements.data.value = today;
$('#form-periodo').elements.dataInicial.value = `${today.slice(0, 8)}01`;
$('#form-periodo').elements.dataFinal.value = today;
refresh();
