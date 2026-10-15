-- Dados iniciais do controle de estoque
INSERT INTO "produtos" ("nome", "valor", "quantidade", "categoria", "unidade_medida") VALUES
('Caderno', 18.50, 40, 'Papelaria', 'unidade'),
('Caneta', 3.25, 100, 'Papelaria', 'unidade'),
('Arroz', 28.90, 25, 'Alimentos', 'pacote');
--> statement-breakpoint
INSERT INTO "movimentacoes" ("data", "tipo", "quantidade", "produtos_id")
SELECT v.data::date, v.tipo, v.quantidade, p.id
FROM (VALUES
    ('2026-10-01', 'entrada', 40, 'Caderno'),
    ('2026-10-02', 'entrada', 100, 'Caneta'),
    ('2026-10-03', 'entrada', 25, 'Arroz')
) AS v(data, tipo, quantidade, nome)
JOIN "produtos" p ON p.nome = v.nome;
