import type { Config } from '@netlify/functions';
import { and, between, desc, eq, sql } from 'drizzle-orm';
import { getDb, type Database } from '../../db/index.js';
import { movimentacoes, produtos, vwEstoque } from '../../db/schema.js';
import { dateRange, movementValue, productValue, RequestError } from '../../db/validation.js';

type Route = (request: Request, db: () => Database, url: URL) => Promise<Response>;

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
    return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

async function readJson(request: Request): Promise<unknown> {
    if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
        throw new RequestError('Envie os dados como application/json', 415);
    }
    try {
        return await request.json();
    } catch {
        throw new RequestError('JSON inválido');
    }
}

const sumByType = (tipo: string, value: ReturnType<typeof sql>) =>
    sql<string>`coalesce(sum(case when ${movimentacoes.tipo} = ${tipo} then ${value} else 0 end), 0)`;

function registerMovement(tipo: 'entrada' | 'saída'): Route {
    return async (request, db) => {
        const movement = movementValue(await readJson(request));
        const id = await db().transaction(async (tx) => {
            const [product] = await tx.select().from(produtos).where(eq(produtos.id, movement.produtos_id)).for('update');
            if (!product) throw new RequestError('Produto não encontrado', 404);
            const quantidade = tipo === 'entrada'
                ? product.quantidade + movement.quantidade
                : product.quantidade - movement.quantidade;
            if (quantidade < 0) throw new RequestError('Estoque insuficiente');
            if (quantidade > 2147483647) throw new RequestError('A quantidade excede o limite do estoque');
            await tx.update(produtos).set({ quantidade }).where(eq(produtos.id, product.id));
            const [inserted] = await tx.insert(movimentacoes).values({ ...movement, tipo }).returning({ id: movimentacoes.id });
            return inserted.id;
        });
        return json({ mensagem: tipo === 'entrada' ? 'Entrada registrada' : 'Saída registrada', id }, 201);
    };
}

const listProducts: Route = async (_request, db) =>
    json(await db().select().from(produtos).orderBy(produtos.id));

const createProduct: Route = async (request, db) => {
    const product = productValue(await readJson(request));
    const [inserted] = await db().insert(produtos).values(product).returning({ id: produtos.id });
    return json({ mensagem: 'Produto cadastrado', id: inserted.id }, 201);
};

const routes: Record<string, Partial<Record<string, Route>>> = {
    '/produtos': { GET: listProducts, POST: createProduct },
    '/produtos/get': { GET: listProducts },
    '/produtos/post': { POST: createProduct },
    '/produtos/estoque': {
        GET: async (_request, db) => json(await db().select().from(vwEstoque).orderBy(vwEstoque.id)),
    },
    '/produtos/total-categoria': {
        GET: async (_request, db) => json(await db()
            .select({ categoria: produtos.categoria, valor_total: sql<string>`sum(${produtos.quantidade} * ${produtos.valor})` })
            .from(produtos).groupBy(produtos.categoria).orderBy(produtos.categoria)),
    },
    // Produtos com estoque mínimo ou máximo (limites de 0 e 100 unidades)
    '/produtos/limites-estoque': {
        GET: async (_request, db) => json(await db()
            .select({
                id: produtos.id,
                nome: produtos.nome,
                quantidade: produtos.quantidade,
                limite_atingido: sql<string>`case when ${produtos.quantidade} = 0 then 'mínimo' else 'máximo' end`,
                percentual_nivel: sql<number>`${produtos.quantidade}`,
            })
            .from(produtos).where(sql`${produtos.quantidade} = 0 or ${produtos.quantidade} = 100`).orderBy(produtos.id)),
    },
    '/movimentacoes': {
        GET: async (_request, db) => json(await db()
            .select({
                id: movimentacoes.id, data: movimentacoes.data, tipo: movimentacoes.tipo,
                quantidade: movimentacoes.quantidade, produtos_id: movimentacoes.produtos_id, produto: produtos.nome,
            })
            .from(movimentacoes).innerJoin(produtos, eq(produtos.id, movimentacoes.produtos_id))
            .orderBy(desc(movimentacoes.data), desc(movimentacoes.id))),
    },
    '/movimentacoes/entrada': { POST: registerMovement('entrada') },
    '/movimentacoes/saida': { POST: registerMovement('saída') },
    '/movimentacoes/saidas': {
        GET: async (_request, db) => json(await db()
            .select({
                id: movimentacoes.id, data: movimentacoes.data, tipo: movimentacoes.tipo,
                quantidade: movimentacoes.quantidade, produto: produtos.nome,
            })
            .from(movimentacoes).innerJoin(produtos, eq(produtos.id, movimentacoes.produtos_id))
            .where(eq(movimentacoes.tipo, 'saída')).orderBy(desc(movimentacoes.data), desc(movimentacoes.id))),
    },
    // Resumo de entradas e saídas entre duas datas
    '/movimentacoes/periodo': {
        GET: async (_request, db, url) => {
            const { dataInicial, dataFinal } = dateRange(url.searchParams);
            const valorMovimento = sql`${movimentacoes.quantidade} * ${produtos.valor}`;
            return json(await db()
                .select({
                    nome_produto: produtos.nome,
                    unidade_medida: produtos.unidade_medida,
                    total_entradas: sumByType('entrada', sql`${movimentacoes.quantidade}`),
                    total_saidas: sumByType('saída', sql`${movimentacoes.quantidade}`),
                    saldo_periodo: sql<string>`sum(case when ${movimentacoes.tipo} = 'entrada' then ${movimentacoes.quantidade} else -${movimentacoes.quantidade} end)`,
                    valor_entradas: sumByType('entrada', valorMovimento),
                    valor_saidas: sumByType('saída', valorMovimento),
                })
                .from(movimentacoes).innerJoin(produtos, eq(produtos.id, movimentacoes.produtos_id))
                .where(between(movimentacoes.data, dataInicial, dataFinal))
                .groupBy(produtos.id, produtos.nome, produtos.unidade_medida).orderBy(produtos.nome));
        },
    },
    // Produtos com maior quantidade de saídas no período
    '/movimentacoes/maiores-saidas': {
        GET: async (_request, db, url) => {
            const { dataInicial, dataFinal } = dateRange(url.searchParams);
            const total = sql<string>`sum(${movimentacoes.quantidade})`;
            return json(await db()
                .select({ produto: produtos.nome, categoria: produtos.categoria, total_saidas: total })
                .from(movimentacoes).innerJoin(produtos, eq(produtos.id, movimentacoes.produtos_id))
                .where(and(eq(movimentacoes.tipo, 'saída'), between(movimentacoes.data, dataInicial, dataFinal)))
                .groupBy(produtos.id, produtos.nome, produtos.categoria).orderBy(desc(total)));
        },
    },
};

export function createHandler(db: () => Database) {
    return async (request: Request): Promise<Response> => {
        const url = new URL(request.url);
        const path = url.pathname.replace(/\/+$/, '') || '/';
        if (path === '/api') return json({ status: 'ok', mensagem: 'API funcionando' });

        const methods = routes[path];
        if (!methods) return json({ erro: 'Rota não encontrada' }, 404);
        const route = methods[request.method];
        if (!route) {
            return json({ erro: 'Método não permitido' }, 405, { Allow: Object.keys(methods).join(', ') });
        }

        try {
            return await route(request, db, url);
        } catch (error) {
            if (error instanceof RequestError) return json({ erro: error.message }, error.status);
            console.error('Erro na API:', error instanceof Error ? error.message : error);
            return json({ erro: 'Não foi possível concluir a operação. Tente novamente.' }, 500);
        }
    };
}

export default createHandler(getDb);

export const config: Config = {
    path: ['/api', '/produtos', '/produtos/*', '/movimentacoes', '/movimentacoes/*'],
};
