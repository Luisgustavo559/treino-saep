import { sql } from 'drizzle-orm';
import { date, integer, numeric, pgTable, pgView, serial, varchar } from 'drizzle-orm/pg-core';

export const produtos = pgTable('produtos', {
    id: serial('id').primaryKey(),
    nome: varchar('nome', { length: 255 }).notNull(),
    valor: numeric('valor', { precision: 10, scale: 2 }).notNull(),
    quantidade: integer('quantidade').notNull(),
    categoria: varchar('categoria', { length: 255 }).notNull(),
    unidade_medida: varchar('unidade_medida', { length: 30 }).notNull(),
});

// Um produto pode ter várias movimentações (relação 1 para N)
export const movimentacoes = pgTable('movimentacoes', {
    id: serial('id').primaryKey(),
    data: date('data', { mode: 'string' }).notNull(),
    tipo: varchar('tipo', { length: 10 }).notNull(),
    quantidade: integer('quantidade').notNull(),
    produtos_id: integer('produtos_id').notNull().references(() => produtos.id),
});

export const vwEstoque = pgView('vw_estoque', {
    id: integer('id').notNull(),
    nome: varchar('nome', { length: 255 }).notNull(),
    quantidade: integer('quantidade').notNull(),
    valor: numeric('valor', { precision: 10, scale: 2 }).notNull(),
    valor_total: numeric('valor_total').notNull(),
    categoria: varchar('categoria', { length: 255 }).notNull(),
}).as(sql`select id, nome, quantidade, valor, quantidade * valor as valor_total, categoria from produtos`);
