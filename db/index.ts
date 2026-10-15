import { drizzle } from 'drizzle-orm/netlify-db';
import * as schema from './schema.js';

function createDb() {
    return drizzle({ schema });
}

export type Database = ReturnType<typeof createDb>;

let cached: Database | undefined;

// A conexão é criada somente na primeira consulta, para que a validação das
// requisições não dependa do banco.
export function getDb(): Database {
    cached ??= createDb();
    return cached;
}
