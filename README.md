# TicketMind

Sistema web de service desk e operacao interna inspirado em fluxos GLPI/ITSM, com frontend em React e backend em Express.

## Visao geral

O TicketMind centraliza atendimento, operacao interna, cadastros administrativos, base de conhecimento e configuracoes de notificacao em uma unica aplicacao.

O sistema ja entrega:

- autenticacao com sessao persistida
- controle de acesso por perfil, permissao, override adicional e restricao por usuario
- central de chamados com abertura, atribuicao, acompanhamento, timeline, anexos e aprovacao de requisicoes
- dashboard operacional com indicadores, SLA, recortes por fila e tecnicos
- cadastros de usuarios, departamentos, localizacoes, ativos, marcas, modelos, projetos, artigos e integracoes
- exportacao CSV nas areas principais de cadastro e operacao
- notificacoes por email com layouts, regras e teste de envio
- log geral do sistema para TI
- persistencia local em SQLite ou remota em Postgres
- API versionada em `/api/v1`
- hot reload do backend no desenvolvimento com `node --watch`

Arquiteturalmente, o projeto segue como um monolito web simples:

- o backend expoe endpoints `/api/*` e `/api/v1/*`
- o frontend consome a API com `fetch`
- a persistencia mistura estado legado consolidado com estruturas de dominio ja separadas

## Principais funcoes do sistema

### Autenticacao e acesso

- login por email e senha
- restauracao de sessao no navegador
- controle de acesso por permissao
- protecao de rotas no frontend
- validacao de acoes criticas no backend
- invalidacao de sessao por alteracao de credenciais
- recuperacao de senha com notificacao operacional centralizada em `ti@wegamarine.com.br`

### Dashboard operacional

- visao resumida de fila
- indicadores por status
- indicadores por prioridade
- acompanhamento de alertas de SLA
- visao de tecnicos e carga operacional

### Gestao de chamados

- abertura de chamado
- edicao de chamado
- definicao de prioridade, urgencia e impacto
- atribuicao de tecnico responsavel
- mudanca de status
- anexos no chamado
- historico e auditoria de eventos
- vinculacao de artigos da base de conhecimento
- criacao de artigo a partir da solucao do chamado
- registro de acompanhamentos tecnicos
- finalizacao de chamado com solucao obrigatoria
- mudanca automatica para `Em andamento` quando um tecnico e indicado
- aprovacao de requisicoes com solicitacao, aprovacao e reprovacao

### Cadastros e operacao

- usuarios e perfis de permissao
- departamentos e localizacoes
- ativos, marcas e modelos
- projetos internos
- base de conhecimento
- integracoes REST
- layouts e regras de notificacao

## Stack tecnica

### Frontend

- `React 18`
- `React Router`
- `Context API`
- `Vite`

Arquivos centrais:

- [`src/App.jsx`](src/App.jsx): rotas principais da aplicacao
- [`src/auth/AuthContext.jsx`](src/auth/AuthContext.jsx): autenticacao, logout e restauracao de sessao
- [`src/data/AppDataContext.jsx`](src/data/AppDataContext.jsx): regras de negocio, sincronizacao com API e estado global
- [`src/pages/TicketsPage.jsx`](src/pages/TicketsPage.jsx): fluxo principal de abertura, atendimento, aprovacao e resolucao de chamados

### Backend

- `Express`
- `SQL.js` para SQLite local
- `pg` para Postgres

Arquivos centrais:

- [`server/index.js`](server/index.js): API HTTP e entrega do frontend compilado
- [`server/db.js`](server/db.js): persistencia, bootstrap e fallback SQLite/Postgres
- [`server/api/routes/v1.js`](server/api/routes/v1.js): API versionada por dominio
- [`server/state/schema.js`](server/state/schema.js): schema, payload version e domain versions

## API atual

Endpoints legados principais:

- `GET /api/health`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/state`
- `PUT /api/state`
- `POST /api/notifications/test`
- `GET /api/system-logs`

Endpoints versionados principais:

- `GET /api/v1/meta`
- `GET /api/v1/state`
- `GET /api/v1/tickets`
- `GET /api/v1/tickets/:ticketId`
- `GET /api/v1/users`
- `GET /api/v1/departments`
- `GET /api/v1/locations`
- `GET /api/v1/assets`
- `GET /api/v1/brands`
- `GET /api/v1/models`
- `GET /api/v1/projects`
- `GET /api/v1/knowledgeArticles`
- `GET /api/v1/apiConfigs`
- `GET /api/v1/emailLayouts`
- `GET /api/v1/notificationRules`
- `GET /api/v1/notificationLogs`
- `GET /api/v1/reports`

Observacoes:

- o frontend atual ainda usa fortemente o fluxo legado `/api/state`
- as escritas protegidas reutilizam a mesma trilha de validacao, auditoria e notificacao
- a separacao por dominio ja comecou, mas ainda convive com o estado agregado legado

## Persistencia

### Modo local

Sem `DATABASE_URL`, a aplicacao usa SQLite local em:

- `data/ticketmind.sqlite`

Variaveis aceitas:

- `PORT`: porta do servidor Express. Padrao `3001`
- `DB_DIR`: diretorio base do SQLite
- `DB_PATH`: caminho completo do arquivo SQLite
- `DATABASE_URL`: ativa Postgres
- `OPERATIONS_FORWARD_EMAIL`: caixa operacional usada para recuperacao de senha e copia obrigatoria de abertura de chamado. Padrao `ti@wegamarine.com.br`

## Comportamento de notificacoes operacionais

Alguns fluxos foram fixados para uma caixa operacional unica com o objetivo de permitir encaminhamento externo por automacao:

- toda solicitacao de recuperacao de senha envia a notificacao para `ti@wegamarine.com.br` por padrao
- o e-mail digitado pelo usuario no formulario de recuperacao nao e usado como destinatario
- o e-mail digitado no formulario aparece apenas no corpo da mensagem como dado informado
- quando existe um usuario ativo correspondente, o link de redefinicao e incluido no corpo do e-mail enviado para a caixa operacional
- toda abertura de chamado gera uma copia operacional completa para `ti@wegamarine.com.br`
- essa copia operacional lista os dados relevantes do chamado: id, titulo, descricao, solicitante, email, prioridade, tipo, fila, departamento, categoria, localizacao, SLA, projeto, ativo, anexos, checklist e link
- as regras normais de notificacao do sistema continuam existindo; a copia operacional de abertura de chamado e adicional e nao substitui os demais destinatarios configurados

### Modo Render / Postgres

Quando `DATABASE_URL` existe:

- o backend inicializa um pool Postgres
- cria estruturas legadas e estruturas por dominio
- carrega o estado do Postgres
- se o banco estiver vazio, tenta inicializar com o SQLite local

Estruturas relevantes em uso:

- `app_state`
- `app_state_history`
- `app_singletons`
- `users`, `departments`, `locations`
- tabelas de dominio como `tickets_domain`, `assets_domain`, `projects_domain`, `knowledge_articles_domain` e correlatas

## Dados iniciais

O seed atual fica em [`src/data/seedData.js`](src/data/seedData.js).

Usuario administrador padrao:

- email: `admin@ticketmind.local`
- senha: `admin0123`

Esse seed e usado quando ainda nao existe estado persistido.

## Estrutura de pastas

```text
server/
  index.js
  db.js
  notifications.js
  security.js
  systemLogs.js
  api/
  repositories/
  services/
  state/

src/
  assets/
  auth/
  components/
  data/
  lib/
  pages/
  services/
  App.jsx
  main.jsx
  styles.css

data/
  ticketmind.sqlite

render.yaml
package.json
README.md
```

## Execucao local

Instalacao:

```bash
npm install
```

Desenvolvimento com hot reload:

```bash
npm run dev
```

Servidor em modo app:

```bash
npm run start
```

Build:

```bash
npm run build
```

Validacao minima de release:

```bash
npm run validate
```

Esse fluxo executa:

- `npm run build`
- smoke local com SQLite temporario
- healthcheck da API
- login admin
- sessao autenticada
- listagem de chamados
- criacao, leitura, atualizacao e remocao de um chamado temporario

Deploy manual validado para o Render:

```bash
npm run deploy:render
```

Variaveis exigidas para o deploy manual:

- `RENDER_API_KEY`
- `RENDER_SERVICE_ID`

## Deploy no Render

O projeto esta preparado para deploy via `Blueprint` com o arquivo `render.yaml`.

O blueprint cria:

- um `Web Service` chamado `ticketmind`
- um banco `Render Postgres` chamado `ticketmind-db`

No deploy:

- o Render executa `npm ci && npm run build`
- sobe o backend com `npm run start`
- serve o frontend compilado em `dist`
- injeta `DATABASE_URL` automaticamente a partir do banco criado

## Validacao continua e deploy controlado

O repositorio inclui o workflow [`.github/workflows/validate-and-deploy.yml`](.github/workflows/validate-and-deploy.yml).

Fluxo configurado:

- em `pull_request`: instala dependencias e roda `npm run validate`
- em `push` para `main`: valida primeiro
- so depois da validacao bem-sucedida dispara deploy no Render via API

Secrets esperados no GitHub Actions:

- `RENDER_API_KEY`
- `RENDER_SERVICE_ID`

Observacao operacional:

- o servico atual no Render estava com `autoDeploy: no`
- por isso o push isolado para `main` nao publica sozinho
- o caminho seguro passa a ser validacao obrigatoria seguida de deploy via API

## Melhorias ja entregues

- hash de senha e invalidacao de sessao por mudanca de credencial
- autorizacao mais forte no backend para alteracoes criticas
- auditoria administrativa e log geral do sistema
- API versionada com metadados de schema e payload
- inicio da persistencia por dominio no backend
- exportacao operacional de chamados e cadastros principais
- aprovacao de requisicoes no fluxo de tickets
- notificacoes automatizadas por eventos do chamado
- filtros dedicados para comentarios e timeline do ticket
- subtarefas tecnicas vinculadas ao chamado principal
- vinculos operacionais do ticket com projeto, ativo, usuario e departamento
- sugestoes automaticas da base de conhecimento durante abertura e atendimento
- checklist operacional por tipo de chamado
- macro de atendimento para atribuir, responder e mudar status em um clique
- reabertura com motivo padronizado e classificacao de reincidencia
- modelos de formulario por tipo de solicitacao
- campos obrigatorios dinamicos por categoria
- templates de resposta, encerramento e reabertura
- pesquisa global unificada por chamado, usuario, ativo e artigo
- fila de triagem com acoes rapidas em linha
- sugestao de tecnico por departamento, carga e especialidade
- opcao de ocultar ou mostrar a fila de triagem
- aprovacao multi-etapa por departamento e faixa de valor, com historico e aprovador atual
- delegacao de aprovador para substituto com trilha de auditoria na etapa
- lembretes automaticos recorrentes de aprovacao sem depender de atividade no sistema
- SLA por combinacao de tipo, categoria, prioridade e departamento
- SLA de primeira resposta separado do SLA de resolucao
- comentarios internos por equipe com filtro de visualizacao para times internos
- observadores com notificacao seletiva por evento
- roteamento avancado por categoria, prioridade, localizacao, palavra-chave, origem e horario
- intake operacional de chamado por e-mail com parsing basico de remetente, assunto e corpo
- exportacao CSV adicional para operacoes, tecnicos, central de servicos e notificacoes
- relatorios consolidados exportaveis em todos os modulos administrativos com cobertura uniforme
- exportacao Excel/XLS ou PDF seguindo um padrao unico do sistema
- modo analista com preview lateral do chamado sem trocar de pagina
- escalonamento automatico de chamados vencidos ou sem responsavel
- relacao entre chamado pai e filhos para incidentes maiores
- status configuraveis por tipo de processo
- motivo de pausa e motivo de espera obrigatorios em status especificos
- aprovacoes visiveis na timeline do chamado com decisor, data e justificativa
- historico de decisao de aprovacao separado do historico tecnico
- relatorio por tecnico, departamento, categoria, prioridade e origem
- relatorio de produtividade com tempo medio de resposta e resolucao
- relatorio de aprovacoes pendentes, aprovadas e reprovadas
- relatorio de reincidencia por solicitante, ativo ou categoria
- relatorio de backlog por faixa de SLA
- dashboard com comparativo por periodo
- exportacao CSV e Excel com layout operacional
- agenda executiva com projetos, chamados criticos e acoes pendentes

## Mapeamento de novas funcoes

### Melhorias funcionais ainda pendentes ou parciais

### Melhorias para chamados

### Melhorias para inventario e cadastros

- importacao em lote de ativos via CSV
- importacao em lote de usuarios, departamentos e localizacoes
- movimentacao de ativo com historico de posse e localizacao
- termo de entrega e aceite por ativo
- garantia, fornecedor e nota fiscal por equipamento
- componentes vinculados ao ativo: disco, memoria, monitor e perifericos
- calendario de manutencao preventiva
- campos customizados por tipo de ativo
- exportacao configuravel por colunas nos cadastros
- filtros persistidos por modulo administrativo

### Melhorias para relatorios e gestao

### Melhorias de experiencia

- painel lateral persistente para detalhes em vez de modal em algumas areas
- indicadores contextuais no topo de cada cadastro

### Melhorias de automacao

- notificacao automatica por vencimento de SLA
- resumo diario para tecnicos e aprovadores
- alertas de fila sem responsavel
- criacao automatica de follow-up de sistema para eventos importantes
- regras de atribuicao por departamento e categoria
- sincronizacao futura com AD, Google Workspace ou ERP
- webhook de saida para eventos de chamado e aprovacao

### Melhorias tecnicas

- ampliar o uso da API versionada no frontend
- mover mais regra critica de negocio para o backend
- completar a separacao por entidades reais em banco
- criar testes de integracao para autenticacao, chamados, aprovacao e notificacao
- adicionar smoke tests de deploy
- criar testes de regressao para exportacoes
- validar permissao por rota e por acao de forma centralizada
- implementar migracoes formais de dados por versao
- adicionar observabilidade de backend com logs estruturados

## Resumo executivo

O TicketMind ja saiu do estado inicial descrito no README anterior. Hoje ele cobre autenticacao, autorizacao, chamados, aprovacao, notificacao, base de conhecimento, logs e cadastros administrativos com mais rigor de persistencia e API versionada. O proximo salto de maturidade esta em consolidar experiencia operacional estilo GLPI, exportacao ampla, automacoes de atendimento e backend ainda mais orientado por dominio.

## Validado nesta rodada

- build de producao com `npm run build`
- restauracao do carregamento da pagina de chamados apos o commit `ed85553`
- login admin e operacoes basicas de API em ambiente local apos a correcao de estado SQLite
- deploy manual via API do Render para o commit `314f869`
