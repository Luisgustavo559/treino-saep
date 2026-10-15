# Controle de estoque na Netlify

O frontend continua em `public`. A API publicada usa Netlify Functions e o banco gerenciado PostgreSQL da Netlify, com esquema Drizzle e migrações em `netlify/database/migrations`.

## Uso atual: somente testes

Este projeto foi configurado como uma demonstração com API pública e login visual, sem autenticação de servidor. Cadastre somente produtos e movimentações fictícios. Os registros de teste ficam no PostgreSQL da Netlify; não há conexão automática com o MySQL do seu computador.

Nenhum dado do MySQL local foi importado ou alterado. O banco novo começa com os dados iniciais do `sql/DDL.sql` (Caderno, Caneta e Arroz, com suas entradas), aplicados por migração, e com a view `vw_estoque`. Há um aviso de ambiente de testes tanto na tela de login quanto no painel. Antes de importar dados reais, implemente autenticação de servidor e proteja a API.

## Desenvolvimento

Instale as dependências com `npm install` e execute `npm run dev`. Abra `http://localhost:8889`: página e API usam a mesma origem, sem configurar um endereço externo. `npm start` mantém o servidor Express/MySQL antigo para uso local; não é o processo executado pela Netlify.

O deploy aplica as migrações automaticamente. Não execute o antigo `sql/DDL.sql` para migrar: ele contém instruções que apagam o banco MySQL. A segunda migração insere os três produtos e as três entradas iniciais. Como ela ocupa IDs, a importação do MySQL descrita abaixo só funciona depois de remover esses registros de exemplo.

## Migração futura do MySQL

Este procedimento foi preparado para uma futura transferência a partir do seu computador. Ele não é executado pelo deploy e não deve ser usado para enviar dados reais à demonstração pública atual. Configure primeiro a autenticação e a proteção das rotas.

A adaptação do código não copia automaticamente um banco existente. A transferência precisa ser feita de um ambiente privado com acesso ao MySQL e ao PostgreSQL da Netlify, depois do deploy que cria as tabelas.

1. Faça um backup do MySQL e interrompa alterações no sistema antigo durante a transferência e a troca de endereço. Use um usuário MySQL com permissão apenas de leitura. As duas tabelas de origem precisam usar InnoDB.
2. Configure de forma privada `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD` e `MYSQL_DATABASE`. Se necessário, configure `MYSQL_PORT` e `MYSQL_SSL=true`. O script também aceita as configurações antigas `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME` e `DB_PORT` de um arquivo `.env` privado. Não publique credenciais em mensagens, arquivos versionados ou no frontend.
3. Execute `npm run db:import:mysql` para validar a origem sem gravar nada. Registros inválidos, IDs duplicados e movimentações sem produto impedem a importação; nenhum dado é corrigido silenciosamente.
4. Obtenha a conexão privada do PostgreSQL no painel da Netlify e configure `NETLIFY_DB_URL` somente no ambiente confiável de execução. Confira que o destino é o banco correto de produção, e não uma prévia ou um banco local. O acesso às tabelas exige que as migrações já tenham sido aplicadas pelo deploy.
5. Com as tabelas de destino ainda vazias, execute `npm run db:import:mysql -- --confirmar`. O script lê um snapshot consistente do MySQL, mantém IDs, nomes, valores, saldos, datas e relações, e não recalcula o estoque a partir do histórico. A gravação no PostgreSQL ocorre em uma única transação, com bloqueio das tabelas, conferência dos registros e ajuste das sequências para novos cadastros.
6. Confira os produtos e relatórios no site antes de desativar o sistema antigo. Mantenha o backup e o MySQL original para recuperação.

Se o destino já contiver registros, a importação é recusada para evitar sobrescrever dados. Não cadastre produtos nem movimentações no site novo antes de concluir a transferência. O script não cria tabelas, não apaga registros, não altera o MySQL e não é exposto como endpoint público.

## Validação

`npm run test:unit` verifica validações da API e dos dados de importação, sem conectar a bancos. `npm run typecheck` verifica os tipos. O teste de cadastro existente pode ser executado com `API_URL=http://localhost:8889 npm test`; ele grava um produto de teste, então use apenas um ambiente de teste.

## Limitação de segurança existente

A tela de login atual é demonstrativa: ela verifica dados no navegador e não protege a API. Essa adaptação manteve o comportamento existente e não implementou autenticação. Antes de disponibilizar dados reais na internet, é necessário substituir esse login por autenticação de servidor e proteger as rotas.
