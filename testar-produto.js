// Requer que a API esteja rodando. Execute com: npm test
const baseUrl = process.env.API_URL || 'http://localhost:3000';
const produto = {
    nome: `Produto teste ${Date.now()}`,
    valor: 12.5,
    quantidade: 3,
    categoria: 'Teste',
    unidade_medida: 'unidade'
};

async function testarCadastro() {
    try {
        const resposta = await fetch(`${baseUrl}/produtos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(produto)
        });
        const resultado = await resposta.json();

        if (resposta.status !== 201) {
            console.error(`Falhou: HTTP ${resposta.status}`, resultado);
            process.exitCode = 1;
            return;
        }

        console.log('Cadastro funcionou:', resultado);
    } catch (erro) {
        console.error('Não foi possível acessar a API. Verifique se ela está rodando em', baseUrl);
        console.error(erro.message);
        process.exitCode = 1;
    }
}

testarCadastro();
