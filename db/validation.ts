export class RequestError extends Error {
    status: number;
    constructor(message: string, status = 400) {
        super(message);
        this.status = status;
    }
}

const MAX_INT = 2147483647;

function text(value: unknown, field: string, max: number): string {
    if (typeof value !== 'string' || !value.trim()) throw new RequestError(`Informe ${field}`);
    const trimmed = value.trim();
    if (trimmed.length > max) throw new RequestError(`${field} deve ter no máximo ${max} caracteres`);
    return trimmed;
}

export function integerValue(value: unknown, min = 0): number {
    if (typeof value !== 'number' && typeof value !== 'string') throw new RequestError('Informe uma quantidade inteira');
    if (typeof value === 'string' && !/^\s*-?\d+\s*$/.test(value)) throw new RequestError('Informe uma quantidade inteira');
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < min || number > MAX_INT) {
        throw new RequestError(`Informe um número inteiro entre ${min} e ${MAX_INT}`);
    }
    return number;
}

// DECIMAL(10,2): até 8 dígitos inteiros e 2 casas decimais, sem arredondar.
export function moneyValue(value: unknown): string {
    if (typeof value !== 'number' && typeof value !== 'string') throw new RequestError('Informe o valor');
    const normalized = String(value).trim();
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(normalized) || Number(normalized) <= 0) {
        throw new RequestError('O valor deve ser maior que zero, com até 2 casas decimais e menor que 100.000.000');
    }
    return normalized;
}

export function dateValue(value: unknown): string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RequestError('Informe uma data no formato AAAA-MM-DD');
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (year < 1 || parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
        throw new RequestError('Informe uma data válida');
    }
    return value;
}

export function dateRange(params: URLSearchParams) {
    const inicial = params.get('dataInicial');
    const final = params.get('dataFinal');
    if (!inicial || !final) throw new RequestError('Informe dataInicial e dataFinal');
    const dataInicial = dateValue(inicial);
    const dataFinal = dateValue(final);
    if (dataInicial > dataFinal) throw new RequestError('A data inicial deve ser anterior ou igual à data final');
    return { dataInicial, dataFinal };
}

function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RequestError('Envie um objeto JSON');
    return value as Record<string, unknown>;
}

export function productValue(input: unknown) {
    const row = record(input);
    return {
        nome: text(row.nome, 'nome', 255),
        valor: moneyValue(row.valor),
        quantidade: integerValue(row.quantidade),
        categoria: text(row.categoria, 'categoria', 255),
        unidade_medida: text(row.unidade_medida, 'unidade_medida', 30),
    };
}

export function movementValue(input: unknown) {
    const row = record(input);
    return {
        produtos_id: integerValue(row.produtos_id, 1),
        data: dateValue(row.data),
        quantidade: integerValue(row.quantidade, 1),
    };
}
