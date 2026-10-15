const express = require('express');
const router = express.Router();
const db = require('../db');

// Lista todos os produtos
router.get(['/', '/get'], (req, res) => {
    db.query('SELECT * FROM produtos', (err, resultados) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.json(resultados);
    });
});

// Cadastra um produto
router.post(['/', '/post'], (req, res) => {
    const { nome, valor, quantidade, categoria, unidade_medida } = req.body;
    if (!nome || !categoria || !unidade_medida || valor === undefined || quantidade === undefined) {
        return res.status(400).json({ erro: 'Informe nome, valor, quantidade, categoria e unidade_medida' });
    }
    if (!Number.isFinite(Number(valor)) || Number(valor) <= 0) {
        return res.status(400).json({ erro: 'O valor deve ser maior que zero' });
    }
    if (!Number.isInteger(Number(quantidade)) || Number(quantidade) < 0) {
        return res.status(400).json({ erro: 'A quantidade deve ser um inteiro maior ou igual a zero' });
    }

    const sql = 'INSERT INTO produtos (nome, valor, quantidade, categoria, unidade_medida) VALUES (?, ?, ?, ?, ?)';
    db.query(sql, [nome, valor, quantidade, categoria, unidade_medida], (err, resultado) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.status(201).json({ mensagem: 'Produto cadastrado', id: resultado.insertId });
    });
});

// Valor total do estoque por categoria
router.get('/total-categoria', (req, res) => {
    const sql = 'SELECT categoria, SUM(quantidade * valor) AS valor_total FROM produtos GROUP BY categoria';
    db.query(sql, (err, resultados) => {
        if (err) return res.status(500).json({ erro: 'Erro ao consultar valores por categoria' });
        res.json(resultados);
    });
});

// Produtos com estoque mínimo ou máximo (limites de 0 e 100 unidades)
router.get('/limites-estoque', (req, res) => {
    const sql = `SELECT id, nome, quantidade,
        CASE WHEN quantidade = 0 THEN 'mínimo' ELSE 'máximo' END AS limite_atingido,
        (quantidade / 100) * 100 AS percentual_nivel
        FROM produtos WHERE quantidade = 0 OR quantidade = 100`;
    db.query(sql, (err, resultados) => {
        if (err) return res.status(500).json({ erro: 'Erro ao consultar limites do estoque' });
        res.json(resultados);
    });
});

module.exports = router;
