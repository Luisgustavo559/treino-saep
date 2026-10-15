-- Banco de dados do controle de estoque
DROP DATABASE IF EXISTS mydb;
CREATE DATABASE mydb;
USE mydb;

CREATE TABLE produtos (
    id INT NOT NULL AUTO_INCREMENT,
    nome VARCHAR(255) NOT NULL,
    valor DECIMAL(10,2) NOT NULL,
    quantidade INT NOT NULL,
    categoria VARCHAR(255) NOT NULL,
    unidade_medida VARCHAR(30) NOT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE movimentacoes (
    id INT NOT NULL AUTO_INCREMENT,
    data DATE NOT NULL,
    tipo VARCHAR(10) NOT NULL,
    quantidade INT NOT NULL,
    produtos_id INT NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (produtos_id) REFERENCES produtos(id)
);

-- Um produto pode ter várias movimentações (relação 1 para N)
CREATE VIEW vw_estoque AS
SELECT id, nome, quantidade, valor, quantidade * valor AS valor_total, categoria
FROM produtos;

INSERT INTO produtos (nome, valor, quantidade, categoria, unidade_medida) VALUES
('Caderno', 18.50, 40, 'Papelaria', 'unidade'),
('Caneta', 3.25, 100, 'Papelaria', 'unidade'),
('Arroz', 28.90, 25, 'Alimentos', 'pacote');

INSERT INTO movimentacoes (data, tipo, quantidade, produtos_id) VALUES
('2026-10-01', 'entrada', 40, 1),
('2026-10-02', 'entrada', 100, 2),
('2026-10-03', 'entrada', 25, 3);
