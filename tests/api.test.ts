import assert from 'node:assert/strict';
import test from 'node:test';
import { createHandler } from '../netlify/functions/api.mts';

function noDatabase(): never {
    throw new Error('A validação não deve acessar o banco');
}

const handler = createHandler(noDatabase);

test('consulta de saúde não depende da conexão com o banco', async () => {
    const response = await handler(new Request('https://example.test/api'));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', mensagem: 'API funcionando' });
    assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('rotas desconhecidas retornam 404 e métodos inválidos retornam 405', async () => {
    assert.equal((await handler(new Request('https://example.test/produtos/nao-existe'))).status, 404);
    const response = await handler(new Request('https://example.test/produtos', { method: 'DELETE' }));
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET, POST');
});

test('rejeita produtos inválidos e JSON malformado antes de consultar o banco', async () => {
    for (const body of ['{', 'null', '[]', '{}', '{"valor":0}']) {
        const response = await handler(new Request('https://example.test/produtos/post', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
        }));
        assert.equal(response.status, 400);
    }
    assert.equal((await handler(new Request('https://example.test/produtos', { method: 'POST', body: '{}' }))).status, 415);
});

test('rejeita movimentações inválidas e relatórios sem datas válidas', async () => {
    const movement = await handler(new Request('https://example.test/movimentacoes/entrada', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produtos_id: 1, quantidade: 0, data: '2026-10-01' }),
    }));
    assert.equal(movement.status, 400);
    for (const route of ['/movimentacoes/periodo', '/movimentacoes/maiores-saidas']) {
        assert.equal((await handler(new Request(`https://example.test${route}`))).status, 400);
    }
});

test('erros internos não expõem detalhes da conexão', async () => {
    const response = await handler(new Request('https://example.test/produtos/get'));
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { erro: 'Não foi possível concluir a operação. Tente novamente.' });
});
