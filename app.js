const express = require('express');
const cors = require('cors');
const path = require('path');

const produtos = require('./routes/produtos');
const movimentacoes = require('./routes/movimentacoes');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api', (req, res) => res.json({ status: 'ok', mensagem: 'API funcionando' }));
app.use('/produtos', produtos);
app.use('/movimentacoes', movimentacoes);

module.exports = app;
