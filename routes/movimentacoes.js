const express = require('express');
const router = express.Router();
const db = require('../db');

// Registra uma entrada e soma a quantidade ao estoque
router.post('/entrada', (req, res) => {
    const { produtos_id, data, quantidade } = req.body;
    if (!produtos_id || !data || !Number.isInteger(Number(quantidade)) || Number(quantidade) <= 0) {
        return res.status(400).json({ erro: 'Informe produtos_id, data e quantidade inteira maior que zero' });
    }

    db.beginTransaction(err => {
        if (err) return res.status(500).json({ erro: 'Erro ao iniciar operação' });
        db.query('UPDATE produtos SET quantidade = quantidade + ? WHERE id = ?', [quantidade, produtos_id], (erro, resultado) => {
            if (erro || resultado.affectedRows === 0) {
                return db.rollback(() => res.status(erro ? 500 : 404).json({ erro: 'Produto não encontrado ou erro ao atualizar estoque' }));
            }
            db.query('INSERT INTO movimentacoes (produtos_id, data, tipo, quantidade) VALUES (?, ?, ?, ?)',
                [produtos_id, data, 'entrada', quantidade], (erroInsert, resultadoInsert) => {
                    if (erroInsert) return db.rollback(() => res.status(500).json({ erro: 'Erro ao registrar entrada' }));
                    db.commit(erroCommit => {
                        if (erroCommit) return db.rollback(() => res.status(500).json({ erro: 'Erro ao salvar entrada' }));
                        res.status(201).json({ mensagem: 'Entrada registrada', id: resultadoInsert.insertId });
                    });
                });
        });
    });
});

// Registra uma saída e subtrai a quantidade do estoque
router.post('/saida', (req, res) => {
    const { produtos_id, data, quantidade } = req.body;
    if (!produtos_id || !data || !Number.isInteger(Number(quantidade)) || Number(quantidade) <= 0) {
        return res.status(400).json({ erro: 'Informe produtos_id, data e quantidade inteira maior que zero' });
    }

    db.beginTransaction(err => {
        if (err) return res.status(500).json({ erro: 'Erro ao iniciar operação' });
        db.query('UPDATE produtos SET quantidade = quantidade - ? WHERE id = ? AND quantidade >= ?',
            [quantidade, produtos_id, quantidade], (erro, resultado) => {
                if (erro || resultado.affectedRows === 0) {
                    return db.rollback(() => res.status(erro ? 500 : 400).json({ erro: 'Produto não encontrado ou estoque insuficiente' }));
                }
                db.query('INSERT INTO movimentacoes (produtos_id, data, tipo, quantidade) VALUES (?, ?, ?, ?)',
                    [produtos_id, data, 'saída', quantidade], (erroInsert, resultadoInsert) => {
                        if (erroInsert) return db.rollback(() => res.status(500).json({ erro: 'Erro ao registrar saída' }));
                        db.commit(erroCommit => {
                            if (erroCommit) return db.rollback(() => res.status(500).json({ erro: 'Erro ao salvar saída' }));
                            res.status(201).json({ mensagem: 'Saída registrada', id: resultadoInsert.insertId });
                        });
                    });
            });
    });
});

// Lista todas as saídas da mais recente para a mais antiga
router.get('/saidas', (req, res) => {
    const sql = `SELECT m.id, m.data, m.tipo, m.quantidade, p.nome AS produto
        FROM movimentacoes m JOIN produtos p ON p.id = m.produtos_id
        WHERE m.tipo = 'saída' ORDER BY m.data DESC`;
    db.query(sql, (err, resultados) => {
        if (err) return res.status(500).json({ erro: 'Erro ao listar saídas' });
        res.json(resultados);
    });
});

// Resumo de entradas e saídas entre duas datas
router.get('/periodo', (req, res) => {
    const { dataInicial, dataFinal } = req.query;
    if (!dataInicial || !dataFinal) return res.status(400).json({ erro: 'Informe dataInicial e dataFinal' });
    const sql = `SELECT p.nome AS nome_produto, p.unidade_medida,
        SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade ELSE 0 END) AS total_entradas,
        SUM(CASE WHEN m.tipo = 'saída' THEN m.quantidade ELSE 0 END) AS total_saidas,
        SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade ELSE -m.quantidade END) AS saldo_periodo,
        SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade * p.valor ELSE 0 END) AS valor_entradas,
        SUM(CASE WHEN m.tipo = 'saída' THEN m.quantidade * p.valor ELSE 0 END) AS valor_saidas
        FROM movimentacoes m JOIN produtos p ON p.id = m.produtos_id
        WHERE m.data BETWEEN ? AND ? GROUP BY p.id, p.nome, p.unidade_medida ORDER BY p.nome`;
    db.query(sql, [dataInicial, dataFinal], (err, resultados) => {
        if (err) return res.status(500).json({ erro: 'Erro ao consultar movimentações do período' });
        res.json(resultados);
    });
});

// Produtos com maior quantidade de saídas no período
router.get('/maiores-saidas', (req, res) => {
    const { dataInicial, dataFinal } = req.query;
    if (!dataInicial || !dataFinal) return res.status(400).json({ erro: 'Informe dataInicial e dataFinal' });
    const sql = `SELECT p.nome AS produto, p.categoria, SUM(m.quantidade) AS total_saidas
        FROM movimentacoes m JOIN produtos p ON p.id = m.produtos_id
        WHERE m.tipo = 'saída' AND m.data BETWEEN ? AND ?
        GROUP BY p.id, p.nome, p.categoria ORDER BY total_saidas DESC`;
    db.query(sql, [dataInicial, dataFinal], (err, resultados) => {
        if (err) return res.status(500).json({ erro: 'Erro ao consultar maiores saídas' });
        res.json(resultados);
    });
});

module.exports = router;
