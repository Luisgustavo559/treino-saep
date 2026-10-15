import assert from 'node:assert/strict';
import test from 'node:test';
import { dateRange, dateValue, integerValue, movementValue, productValue } from '../db/validation.js';
import { importFailureMessage, validateSnapshot } from '../scripts/importar-mysql.js';

const product = { id: 42, nome: 'Caderno', categoria: 'Papelaria', unidade_medida: 'unidade', valor: '18.50', quantidade: 40 };
const movement = { id: 91, produtos_id: 42, data: '2026-10-01', tipo: 'entrada', quantidade: 40 };

test('valida o produto preservando os valores monetários e textos', () => {
    assert.deepEqual(productValue(product), { nome: 'Caderno', categoria: 'Papelaria', unidade_medida: 'unidade', valor: '18.50', quantidade: 40 });
});

test('rejeita quantidades inválidas e acima do limite do PostgreSQL', () => {
    for (const value of [null, undefined, '', ' ', true, -1, 1.5, Infinity, 2147483648]) {
        assert.throws(() => integerValue(value));
    }
    assert.equal(integerValue('2147483647'), 2147483647);
});

test('rejeita valores monetários inválidos sem arredondar silenciosamente', () => {
    for (const valor of [null, '', 0, -1, '10.555', '100000000', 'Infinity']) {
        assert.throws(() => productValue({ ...product, valor }));
    }
});

test('valida datas reais, inclusive anos bissextos', () => {
    assert.equal(dateValue('2024-02-29'), '2024-02-29');
    for (const value of ['2026-02-29', '2026-02-30', '2026-13-01', '0000-01-01', '2026-1-01']) {
        assert.throws(() => dateValue(value));
    }
});

test('rejeita intervalos invertidos e movimentos sem quantidade positiva', () => {
    assert.throws(() => dateRange(new URLSearchParams({ dataInicial: '2026-10-02', dataFinal: '2026-10-01' })));
    assert.throws(() => movementValue({ ...movement, quantidade: 0 }));
});

test('importação preserva IDs, relação com produto, valor, saldo e histórico', () => {
    const snapshot = validateSnapshot([product], [movement]);
    assert.deepEqual(snapshot.importedProducts, [product]);
    assert.deepEqual(snapshot.importedMovements, [movement]);
});

test('importação rejeita IDs duplicados, referências quebradas e dados inválidos', () => {
    assert.throws(() => validateSnapshot([product, product], [movement]));
    assert.throws(() => validateSnapshot([product], [movement, movement]));
    assert.throws(() => validateSnapshot([product], [{ ...movement, produtos_id: 43 }]));
    assert.throws(() => validateSnapshot([product], [{ ...movement, tipo: 'outro' }]));
    assert.throws(() => validateSnapshot([{ ...product, quantidade: -1 }], [movement]));
});

test('erros externos de importação não expõem mensagens privadas', () => {
    const response = importFailureMessage({ code: 'UNKNOWN', message: 'Detalhes privados da conexão' });
    assert.ok(!response.includes('Detalhes privados'));
    assert.match(importFailureMessage({ code: 'ECONNREFUSED' }), /não está acessível/);
});
