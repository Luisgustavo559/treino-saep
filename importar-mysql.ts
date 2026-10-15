import { config } from 'dotenv';
import { getDatabase } from '@netlify/database';
import { createConnection, type RowDataPacket } from 'mysql2/promise';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/netlify-db';
import { movimentacoes, produtos } from '../db/schema.js';
import { integerValue, movementValue, productValue, RequestError } from '../db/validation.js';

class ImportError extends Error {}

export function importFailureMessage(error: unknown): string {
    if (error instanceof ImportError || error instanceof RequestError) return error.message;
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    const messages: Record<string, string> = {
        ECONNREFUSED: 'O MySQL de origem não está acessível neste ambiente. Nenhum dado foi transferido.',
        ENOTFOUND: 'O endereço do MySQL de origem não pôde ser localizado. Confira a configuração privada.',
        ETIMEDOUT: 'A conexão com o banco expirou. Confira o acesso de rede em um ambiente seguro.',
        ER_ACCESS_DENIED_ERROR: 'O acesso ao MySQL foi recusado. Confira as permissões e credenciais em um ambiente seguro.',
        ER_BAD_DB_ERROR: 'O banco MySQL configurado não foi encontrado.',
        '42P01': 'As tabelas de destino ainda não existem. Aguarde o deploy que aplica as migrações.',
    };
    return typeof code === 'string' && messages[code] ? messages[code]
        : 'Não foi possível concluir a importação. Confira a configuração privada, o esquema publicado e a integridade dos dados.';
}

function requiredEnvironment(name: string, fallback?: string) {
    const value = process.env[name] ?? (fallback ? process.env[fallback] : undefined);
    if (value === undefined || value === '') throw new ImportError(`Configure ${name} em um ambiente seguro`);
    return value;
}

export function validateSnapshot(productRows: Record<string, unknown>[], movementRows: Record<string, unknown>[]) {
    const importedProducts = productRows.map((row) => ({
        id: integerValue(row.id, 1),
        ...productValue(row),
    }));
    const productIds = new Set(importedProducts.map((row) => row.id));
    if (productIds.size !== importedProducts.length) throw new ImportError('Há produtos com identificadores duplicados');
    const importedMovements = movementRows.map((row) => {
        if (row.tipo !== 'entrada' && row.tipo !== 'saída') throw new ImportError('Há movimentações com tipo inválido');
        const movement = { id: integerValue(row.id, 1), ...movementValue(row), tipo: row.tipo };
        if (!productIds.has(movement.produtos_id)) throw new ImportError('Há movimentações sem produto correspondente');
        return movement;
    });
    if (new Set(importedMovements.map((row) => row.id)).size !== importedMovements.length) {
        throw new ImportError('Há movimentações com identificadores duplicados');
    }
    return { importedProducts, importedMovements };
}

export async function importMysql() {
    config({ quiet: true });
    const confirmed = process.argv.includes('--confirmar');
    if (confirmed) requiredEnvironment('NETLIFY_DB_URL');
    const source = await createConnection({
        host: requiredEnvironment('MYSQL_HOST', 'DB_HOST'),
        port: Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306),
        user: requiredEnvironment('MYSQL_USER', 'DB_USER'),
        password: process.env.MYSQL_PASSWORD ?? process.env.DB_PASS,
        database: requiredEnvironment('MYSQL_DATABASE', 'DB_NAME'),
        connectTimeout: 10000,
        dateStrings: true,
        decimalNumbers: false,
        ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
    });
    let snapshot: ReturnType<typeof validateSnapshot>;
    try {
        const [engines] = await source.query<RowDataPacket[]>(
            'SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?, ?)',
            ['produtos', 'movimentacoes'],
        );
        if (engines.length !== 2 || engines.some((row) => row.ENGINE !== 'InnoDB')) {
            throw new ImportError('A origem deve conter as duas tabelas InnoDB para permitir uma leitura consistente');
        }
        await source.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        await source.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
        const [productRows] = await source.query<RowDataPacket[]>(
            'SELECT id, nome, valor, quantidade, categoria, unidade_medida FROM produtos ORDER BY id',
        );
        const [movementRows] = await source.query<RowDataPacket[]>(
            'SELECT id, produtos_id, data, tipo, quantidade FROM movimentacoes ORDER BY id',
        );
        snapshot = validateSnapshot(productRows, movementRows);
        await source.commit();
    } catch (error) {
        await source.rollback();
        throw error;
    } finally {
        await source.end();
    }

    const { importedProducts, importedMovements } = snapshot;
    console.log(`Origem validada: ${importedProducts.length} produtos e ${importedMovements.length} movimentações.`);
    if (!confirmed) {
        console.log('Simulação concluída. Nenhum registro foi gravado. Use --confirmar somente após verificar o destino e fazer backup.');
        return;
    }

    const connection = getDatabase();
    const database = drizzle({ schema: { produtos, movimentacoes }, client: connection });
    try {
        await database.transaction(async (transaction) => {
            await transaction.execute(sql`lock table produtos, movimentacoes in access exclusive mode`);
            const existingProducts = await transaction.select({ id: produtos.id }).from(produtos).limit(1);
            const existingMovements = await transaction.select({ id: movimentacoes.id }).from(movimentacoes).limit(1);
            if (existingProducts.length || existingMovements.length) {
                throw new ImportError('O destino já contém registros. A importação foi cancelada para não sobrescrever dados');
            }
            for (let offset = 0; offset < importedProducts.length; offset += 500) {
                await transaction.insert(produtos).values(importedProducts.slice(offset, offset + 500));
            }
            for (let offset = 0; offset < importedMovements.length; offset += 500) {
                await transaction.insert(movimentacoes).values(importedMovements.slice(offset, offset + 500));
            }
            const [productCount] = await transaction.select({ total: sql<string>`count(*)` }).from(produtos);
            const [movementCount] = await transaction.select({ total: sql<string>`count(*)` }).from(movimentacoes);
            if (Number(productCount.total) !== importedProducts.length || Number(movementCount.total) !== importedMovements.length) {
                throw new ImportError('A conferência das quantidades falhou. A importação foi cancelada');
            }
            for (const product of importedProducts) {
                const [saved] = await transaction.select().from(produtos).where(eq(produtos.id, product.id));
                if (!saved || saved.nome !== product.nome || saved.categoria !== product.categoria ||
                    saved.unidade_medida !== product.unidade_medida || saved.quantidade !== product.quantidade ||
                    Number(saved.valor) !== Number(product.valor)) {
                    throw new ImportError('A conferência dos produtos falhou. A importação foi cancelada');
                }
            }
            for (const movement of importedMovements) {
                const [saved] = await transaction.select().from(movimentacoes).where(eq(movimentacoes.id, movement.id));
                if (!saved || saved.produtos_id !== movement.produtos_id || saved.quantidade !== movement.quantidade ||
                    saved.data !== movement.data || saved.tipo !== movement.tipo) {
                    throw new ImportError('A conferência das movimentações falhou. A importação foi cancelada');
                }
            }
            await transaction.execute(sql`select setval(pg_get_serial_sequence('produtos', 'id'), coalesce((select max(id) from produtos), 1), exists(select 1 from produtos))`);
            await transaction.execute(sql`select setval(pg_get_serial_sequence('movimentacoes', 'id'), coalesce((select max(id) from movimentacoes), 1), exists(select 1 from movimentacoes))`);
        });
        console.log('Importação concluída e conferida. IDs, saldos e histórico foram preservados. O MySQL original não foi alterado.');
    } finally {
        await connection.pool.end();
    }
}

if (process.argv[1]?.endsWith('importar-mysql.ts')) {
    importMysql().catch((error: unknown) => {
        console.error(importFailureMessage(error));
        console.error('Nenhum dado foi apagado ou sobrescrito na origem.');
        process.exitCode = 1;
    });
}
