const mysql = require('mysql2');

function envValue(...names) {
    for (const name of names) {
        const value = process.env[name];
        if (value) return value.trim();
    }
}

function missingDbError() {
    return new Error('Banco de dados não configurado. Defina MYSQLHOST/MYSQLUSER/MYSQLPASSWORD/MYSQLDATABASE ou as variantes DB_* antes de usar as rotas de produtos e movimentações.');
}

function createUnavailableDb() {
    const state = {
        products: [
            { id: 1, nome: 'Caderno', valor: 18.5, quantidade: 40, categoria: 'Papelaria', unidade_medida: 'unidade' },
            { id: 2, nome: 'Caneta', valor: 3.25, quantidade: 100, categoria: 'Papelaria', unidade_medida: 'unidade' },
            { id: 3, nome: 'Arroz', valor: 28.9, quantidade: 25, categoria: 'Alimentos', unidade_medida: 'pacote' },
        ],
        movements: [
            { id: 1, data: '2026-10-01', tipo: 'entrada', quantidade: 40, produtos_id: 1 },
            { id: 2, data: '2026-10-02', tipo: 'entrada', quantidade: 100, produtos_id: 2 },
            { id: 3, data: '2026-10-03', tipo: 'entrada', quantidade: 25, produtos_id: 3 },
        ],
    };

    const toRows = (rows) => JSON.parse(JSON.stringify(rows));
    const getProduct = (id) => state.products.find((product) => Number(product.id) === Number(id));

    const db = {
        isConfigured: false,
        on() {
            return db;
        },
        query(sql, ...args) {
            const callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;
            const values = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
            const normalizedSql = String(sql).replace(/\s+/g, ' ').trim();

            if (!callback) return undefined;

            if (normalizedSql === 'SELECT * FROM produtos' || normalizedSql === 'SELECT * FROM produtos ORDER BY id') {
                callback(null, toRows(state.products));
                return undefined;
            }

            if (normalizedSql.startsWith('INSERT INTO produtos')) {
                const [nome, valor, quantidade, categoria, unidade_medida] = values;
                const nextId = state.products.reduce((max, product) => Math.max(max, Number(product.id)), 0) + 1;
                const product = {
                    id: nextId,
                    nome,
                    valor: Number(valor),
                    quantidade: Number(quantidade),
                    categoria,
                    unidade_medida,
                };
                state.products.push(product);
                callback(null, { insertId: nextId, affectedRows: 1 });
                return undefined;
            }

            if (normalizedSql.startsWith('SELECT categoria, SUM(quantidade * valor) AS valor_total')) {
                const grouped = state.products.reduce((acc, product) => {
                    const key = product.categoria;
                    if (!acc[key]) acc[key] = 0;
                    acc[key] += Number(product.quantidade) * Number(product.valor);
                    return acc;
                }, {});
                callback(null, Object.entries(grouped).map(([categoria, valor_total]) => ({ categoria, valor_total: Number(valor_total.toFixed(2)) })));
                return undefined;
            }

            if (normalizedSql.includes('CASE WHEN quantidade = 0 THEN') || normalizedSql.includes('quantidade = 0 OR quantidade = 100')) {
                const rows = state.products.map((product) => ({
                    id: product.id,
                    nome: product.nome,
                    quantidade: product.quantidade,
                    limite_atingido: Number(product.quantidade) === 0 ? 'mínimo' : 'máximo',
                    percentual_nivel: Number(product.quantidade) === 0 ? 0 : 100,
                })).filter((product) => Number(product.quantidade) === 0 || Number(product.quantidade) === 100);
                callback(null, rows);
                return undefined;
            }

            if (normalizedSql.startsWith('UPDATE produtos SET quantidade = quantidade + ? WHERE id = ?')) {
                const [quantidade, produtosId] = values;
                const product = getProduct(produtosId);
                if (!product) {
                    callback(null, { affectedRows: 0 });
                    return undefined;
                }
                product.quantidade = Number(product.quantidade) + Number(quantidade);
                callback(null, { affectedRows: 1 });
                return undefined;
            }

            if (normalizedSql.startsWith('UPDATE produtos SET quantidade = quantidade - ? WHERE id = ? AND quantidade >= ?')) {
                const [quantidade, produtosId, minimum] = values;
                const product = getProduct(produtosId);
                if (!product || Number(product.quantidade) < Number(minimum)) {
                    callback(null, { affectedRows: 0 });
                    return undefined;
                }
                product.quantidade = Number(product.quantidade) - Number(quantidade);
                callback(null, { affectedRows: 1 });
                return undefined;
            }

            if (normalizedSql.startsWith('INSERT INTO movimentacoes')) {
                const [produtosId, data, tipo, quantidade] = values;
                const nextId = state.movements.reduce((max, movement) => Math.max(max, Number(movement.id)), 0) + 1;
                const movement = { id: nextId, data, tipo, quantidade: Number(quantidade), produtos_id: Number(produtosId) };
                state.movements.push(movement);
                callback(null, { insertId: nextId, affectedRows: 1 });
                return undefined;
            }

            if (normalizedSql.startsWith('SELECT m.id, m.data, m.tipo, m.quantidade, p.nome AS produto')) {
                const rows = state.movements.filter((movement) => movement.tipo === 'saída').map((movement) => ({
                    id: movement.id,
                    data: movement.data,
                    tipo: movement.tipo,
                    quantidade: movement.quantidade,
                    produto: getProduct(movement.produtos_id)?.nome || 'Produto removido',
                })).sort((a, b) => new Date(b.data) - new Date(a.data));
                callback(null, rows);
                return undefined;
            }

            if (normalizedSql.startsWith('SELECT p.nome AS nome_produto')) {
                const rows = state.products.map((product) => {
                    const entradas = state.movements.filter((movement) => Number(movement.produtos_id) === Number(product.id) && movement.tipo === 'entrada').reduce((sum, movement) => sum + Number(movement.quantidade), 0);
                    const saidas = state.movements.filter((movement) => Number(movement.produtos_id) === Number(product.id) && movement.tipo === 'saída').reduce((sum, movement) => sum + Number(movement.quantidade), 0);
                    return {
                        nome_produto: product.nome,
                        unidade_medida: product.unidade_medida,
                        total_entradas: entradas,
                        total_saidas: saidas,
                        saldo_periodo: entradas - saidas,
                        valor_entradas: Number((entradas * Number(product.valor)).toFixed(2)),
                        valor_saidas: Number((saidas * Number(product.valor)).toFixed(2)),
                    };
                });
                callback(null, rows);
                return undefined;
            }

            if (normalizedSql.startsWith('SELECT p.nome AS produto, p.categoria, SUM(m.quantidade) AS total_saidas')) {
                const grouped = state.movements.filter((movement) => movement.tipo === 'saída').reduce((acc, movement) => {
                    const product = getProduct(movement.produtos_id);
                    const key = product ? product.id : movement.produtos_id;
                    if (!acc[key]) {
                        acc[key] = { produto: product?.nome || 'Produto removido', categoria: product?.categoria || 'N/A', total_saidas: 0 };
                    }
                    acc[key].total_saidas += Number(movement.quantidade);
                    return acc;
                }, {});
                callback(null, Object.values(grouped).sort((a, b) => b.total_saidas - a.total_saidas));
                return undefined;
            }

            callback(null, []);
            return undefined;
        },
        beginTransaction(callback) {
            if (typeof callback === 'function') callback(null);
        },
        rollback(callback) {
            if (typeof callback === 'function') callback();
        },
        commit(callback) {
            if (typeof callback === 'function') callback(null);
        },
        end(callback) {
            if (typeof callback === 'function') callback();
        },
    };

    return db;
}

// Railway variables are exposed as MYSQLHOST/MYSQLPORT/... when referencing a
// MySQL service. Keep the DB_* names for existing local .env files.
const host = envValue('MYSQLHOST', 'MYSQL_HOST', 'DB_HOST')?.replace(/^DB_HOST\s*=\s*/i, '').replace(/^['"]|['"]$/g, '');
const port = Number(envValue('MYSQLPORT', 'MYSQL_PORT', 'DB_PORT') || 3306);

if (!host) {
    module.exports = createUnavailableDb();
} else {
    const db = mysql.createConnection({
        host,
        user: envValue('MYSQLUSER', 'MYSQL_USER', 'DB_USER'),
        password: envValue('MYSQLPASSWORD', 'MYSQL_PASSWORD', 'DB_PASS'),
        database: envValue('MYSQLDATABASE', 'MYSQL_DATABASE', 'DB_NAME'),
        port,
    });

    db.isConfigured = true;

    // mysql2 connections emit network errors; handle them so an unreachable DB
    // does not crash the web process with an unhandled EventEmitter error.
    db.on('error', (err) => {
        console.error('Falha na conexão com MySQL:', err.code || err.message);
    });

    module.exports = db;
}
