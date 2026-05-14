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

## Melhorias ja entregues

- hash de senha e invalidacao de sessao por mudanca de credencial
- autorizacao mais forte no backend para alteracoes criticas
- auditoria administrativa e log geral do sistema
- API versionada com metadados de schema e payload
- inicio da persistencia por dominio no backend
- exportacao operacional de chamados e cadastros principais
- aprovacao de requisicoes no fluxo de tickets
- notificacoes automatizadas por eventos do chamado

## Mapeamento de novas funcoes

### Melhorias funcionais

- aprovacao multi-etapa com aprovadores por departamento, alcada e valor
- comentarios publicos e privados com filtros dedicados
- SLA por combinacao de tipo, categoria, prioridade e departamento
- roteamento automatico de triagem por categoria, prioridade e localizacao
- modelos de formulario por tipo de solicitacao
- campos obrigatorios dinamicos por categoria
- observadores com notificacao seletiva por evento
- relatorios consolidados exportaveis em todos os modulos administrativos

### Melhorias de experiencia

- linhas mais densas e refinadas no estilo GLPI, com menos blocos e mais leitura tabular
- filtros salvos por usuario em mais modulos
- colunas configuraveis alem da tela de usuarios
- painel lateral persistente para detalhes em vez de modal em algumas areas
- atalhos de teclado para triagem, atribuicao e conclusao rapida
- estados vazios mais informativos e com acao direta
- indicadores contextuais no topo de cada cadastro

### Melhorias tecnicas

- ampliar o uso da API versionada no frontend
- mover mais regra critica de negocio para o backend
- completar a separacao por entidades reais em banco
- criar testes de integracao para autenticacao, chamados, aprovacao e notificacao
- adicionar smoke tests de deploy

## Resumo executivo

O TicketMind ja saiu do estado inicial descrito no README anterior. Hoje ele cobre autenticacao, autorizacao, chamados, aprovacao, notificacao, base de conhecimento, logs e cadastros administrativos com mais rigor de persistencia e API versionada. O proximo salto de maturidade esta em consolidar experiencia operacional estilo GLPI, exportacao ampla, automacoes de atendimento e backend ainda mais orientado por dominio.
