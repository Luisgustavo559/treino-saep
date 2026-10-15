import assert from 'node:assert/strict';
import test from 'node:test';
import { drizzle, type ServerlessDrizzleClient } from 'drizzle-orm/netlify-db';
import * as schema from '../db/schema.js';
import { createHandler } from '../netlify/functions/api.mts';

function databaseHarness(stock = 10, failInsert = false) {
    const statements: { text: string; parameters: unknown[] }[] = [];
    let released = false;
    const query = async (statement: string | { text: string }, parameters: unknown[] = []) => {
        const text = typeof statement === 'string' ? statement : statement.text;
        statements.push({ text, parameters });
        if (failInsert && text.startsWith('insert into "movimentacoes"')) throw new Error('Falha simulada');
        if (text.startsWith('select') && text.includes('for update')) {
            return { rows: [[42, 'Caderno', '18.50', stock, 'Papelaria', 'unidade']] };
        }
        if (text.startsWith('insert')) return { rows: [[77]] };
        return { rows: [] };
    };
    const client = {
        driver: 'serverless',
        httpClient: { query },
        pool: { connect: async () => ({ query, release: () => { released = true; } }) },
    } as unknown as ServerlessDrizzleClient;
    const database = Object.assign(drizzle({ schema, client }), { close: async () => {} });
    return { handler: createHandler(() => database), statements, wasReleased: () => released };
}

function post(path: string, body: unknown) {
    return new Request(`https://example.test${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
}

test('cadastro usa INSERT PostgreSQL parametrizado e devolve o ID', async () => {
    const harness = databaseHarness();
    const response = await harness.handler(post('/produtos/post', {
        nome: "Caderno ' especial", valor: '18.50', quantidade: 10, categoria: 'Papelaria', unidade_medida: 'unidade',
    }));
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { mensagem: 'Produto cadastrado', id: 77 });
    assert.match(harness.statements[0].text, /insert into "produtos".*returning "id"/);
    assert.ok(harness.statements[0].parameters.includes("Caderno ' especial"));
    assert.ok(!harness.statements[0].text.includes("Caderno ' especial"));
});

test('entrada bloqueia o produto e salva saldo e movimento na mesma transação', async () => {
    const harness = databaseHarness();
    const response = await harness.handler(post('/movimentacoes/entrada', { produtos_id: 42, quantidade: 3, data: '2026-10-14' }));
    assert.equal(response.status, 201);
    assert.match(harness.statements[0].text, /^begin/);
    assert.match(harness.statements[1].text, /for update$/);
    assert.deepEqual(harness.statements[2].parameters, [13, 42]);
    assert.ok(harness.statements[3].parameters.includes('entrada'));
    assert.equal(harness.statements.at(-1)?.text, 'commit');
    assert.equal(harness.wasReleased(), true);
});

test('saída insuficiente desfaz a transação sem alterar o estoque', async () => {
    const harness = databaseHarness(2);
    const response = await harness.handler(post('/movimentacoes/saida', { produtos_id: 42, quantidade: 3, data: '2026-10-14' }));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { erro: 'Estoque insuficiente' });
    assert.equal(harness.statements.at(-1)?.text, 'rollback');
    assert.ok(!harness.statements.some((statement) => statement.text.startsWith('update')));
    assert.equal(harness.wasReleased(), true);
});

test('falha ao salvar movimentação desfaz também a alteração do saldo', async () => {
    const harness = databaseHarness(10, true);
    const response = await harness.handler(post('/movimentacoes/saida', { produtos_id: 42, quantidade: 3, data: '2026-10-14' }));
    assert.equal(response.status, 500);
    assert.ok(harness.statements.some((statement) => statement.text.startsWith('update')));
    assert.equal(harness.statements.at(-1)?.text, 'rollback');
    assert.ok(!harness.statements.some((statement) => statement.text === 'commit'));
    assert.equal(harness.wasReleased(), true);
});

test('consultas e relatórios compilam com o esquema PostgreSQL', async () => {
    for (const path of [
        '/produtos/get', '/produtos/total-categoria', '/produtos/limites-estoque', '/movimentacoes/saidas',
        '/movimentacoes/periodo?dataInicial=2026-10-01&dataFinal=2026-10-14',
        '/movimentacoes/maiores-saidas?dataInicial=2026-10-01&dataFinal=2026-10-14',
    ]) {
        const harness = databaseHarness();
        const response = await harness.handler(new Request(`https://example.test${path}`));
        assert.equal(response.status, 200, path);
        assert.deepEqual(await response.json(), []);
        assert.match(harness.statements[0].text, /^select/);
        if (path.includes('dataInicial')) {
            assert.ok(harness.statements[0].parameters.includes('2026-10-01'));
            assert.ok(harness.statements[0].parameters.includes('2026-10-14'));
        }
    }
});
