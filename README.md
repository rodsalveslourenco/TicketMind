# TicketMind

Sistema web de service desk e operacao interna inspirado em fluxos GLPI/ITSM, com frontend em React e backend em Express.

## Visao geral

O TicketMind foi pensado para centralizar operacao de atendimento, cadastro administrativo e acompanhamento interno em uma unica aplicacao.

Hoje o sistema entrega:

- autenticacao por email e senha
- controle de acesso por perfil e permissao
- central de chamados com fluxo operacional
- dashboard com indicadores e fila de atendimento
- cadastro de usuarios, departamentos, ativos, marcas, modelos e projetos
- base de conhecimento vinculada a chamados
- persistencia local em SQLite ou remota em Postgres
- deploy simples no Render com `render.yaml`

Arquiteturalmente, o projeto funciona como um monolito simples:

- o backend expoe endpoints `/api/*`
- o frontend consome a API com `fetch`
- o estado completo da plataforma e persistido em `app_state`

## Principais funcoes do sistema

### Autenticacao e acesso

- login por email e senha
- restauracao de sessao no navegador
- controle de acesso por permissao
- protecao de rotas no frontend
- validacao de acoes por permissao no contexto de dados

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

### Central de servicos

- departamentos com configuracao individual
- departamentos ativos ou inativos
- controle de quais departamentos aceitam chamados
- definicao de departamentos exibidos no portal de abertura
- lista de responsaveis por departamento
- atendimento por departamentos vinculados ao usuario

### Usuarios e permissoes

- cadastro de usuarios
- edicao e duplicacao de usuarios
- ativacao e inativacao
- perfis de permissao
- permissoes adicionais e restritas por usuario
- atualizacao do proprio perfil

### Ativos e inventario

- cadastro de ativos
- edicao e remocao de ativos
- vinculacao com localizacao
- catalogo de marcas e modelos
- suporte a diferentes tipos de ativo
- visao de inventario operacional

### Localizacoes e departamentos

- cadastro de departamentos
- configuracao visual por cor
- cadastro de localizacoes
- associacao entre localizacao e departamento

### Projetos internos

- cadastro de projetos
- fases e progresso
- resumo de patrocinador, gestor, prazo e status

### Base de conhecimento

- cadastro manual de artigos
- edicao e inativacao
- pesquisa por problema, solucao, palavras-chave e categoria
- vinculacao de artigo ao chamado
- geracao de artigo a partir do ticket resolvido

### Integracoes e notificacoes

- configuracao de integracoes REST
- layouts de email
- regras de notificacao
- configuracao SMTP
- configuracao de servico de email
- teste de notificacao

## Modulos da aplicacao

- `Login`: autenticacao inicial e restauracao de sessao
- `Dashboard`: indicadores operacionais e visao executiva
- `Tickets`: abertura, tratamento, acompanhamento e resolucao de chamados
- `Assets`: cadastro e manutencao de ativos
- `Inventory`: visao consolidada de inventario
- `Brands / Models`: catalogo tecnico de marcas e modelos
- `Projects`: acompanhamento de projetos internos
- `Central Services`: configuracao da central de servicos e departamentos
- `Users`: administracao de usuarios, perfis e permissoes
- `Knowledge`: base de conhecimento e reaproveitamento de solucoes
- `API Config`: configuracao de integracoes REST
- `Notifications`: layouts, regras e testes de envio
- `Profile`: manutencao do perfil do usuario logado

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
- [`src/pages/TicketsPage.jsx`](src/pages/TicketsPage.jsx): fluxo principal de abertura, atendimento e resolucao de chamados

### Backend

- `Express`
- `SQL.js` para SQLite local
- `pg` para Postgres

Arquivos centrais:

- [`server/index.js`](server/index.js): API HTTP e entrega do frontend compilado
- [`server/db.js`](server/db.js): persistencia, bootstrap e fallback SQLite/Postgres

## Rotas do frontend

Rotas publicas:

- `/login`

Rotas protegidas sob `/app`:

- `/app/profile`
- `/app/dashboard`
- `/app/tickets`
- `/app/assets`
- `/app/inventory`
- `/app/brands-models`
- `/app/projects`
- `/app/api-rest`
- `/app/users`

O acesso a cada rota depende das permissoes do usuario autenticado.

## API atual

Endpoints disponiveis hoje:

- `GET /api/health`
- `POST /api/auth/login`
- `GET /api/auth/session/:userId`
- `GET /api/state`
- `PUT /api/state`
- `POST /api/notifications/test`

Observacoes importantes:

- o modelo atual salva o estado inteiro da aplicacao em um unico registro
- ainda nao existe separacao completa por tabelas de negocio
- parte relevante das regras operacionais ainda esta no frontend

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
- cria a tabela `app_state` se ela nao existir
- carrega o estado do Postgres
- se o banco estiver vazio, tenta inicializar com o SQLite local

Tabela usada hoje:

- `app_state(id, data, updated_at)`

O campo `data` guarda um `JSONB` com o estado inteiro da aplicacao.

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

src/
  assets/
  auth/
  components/
  data/
  lib/
  pages/
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

Desenvolvimento:

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

Fluxo basico:

1. No Render, clique em `New +`
2. Escolha `Blueprint`
3. Selecione o repositorio
4. Confirme o `render.yaml`
5. Aprove a criacao dos recursos

No deploy:

- o Render executa `npm ci && npm run build`
- sobe o backend com `npm run start`
- serve o frontend compilado em `dist`
- injeta `DATABASE_URL` automaticamente a partir do banco criado

## Limitacoes atuais

- senha ainda armazenada em texto puro
- sem JWT ou cookie HTTP-only
- sem autorizacao forte no backend
- parte da regra de negocio ainda concentrada no frontend
- persistencia em documento unico
- sem suite formal de testes automatizados
- sem trilha de atendimento em modelo relacional separado

## Possiveis melhorias para proximos releases

### Release focado em seguranca

- aplicar hash de senha com `bcrypt` ou equivalente
- mover autenticacao e autorizacao efetiva para o backend
- usar sessao segura ou JWT com expiracao
- restringir melhor operacoes criticas por API
- adicionar trilha de auditoria administrativa no servidor

### Release focado em chamados

- comentarios privados e publicos no ticket
- transicoes de status parametrizaveis
- SLA por categoria, departamento e prioridade
- notificacao automatica por abertura, atribuicao, acompanhamento e encerramento
- aprovacao de requisicoes
- fila de triagem com regras de roteamento
- reabertura com motivo obrigatorio
- templates de resposta e solucao

### Release focado em experiencia operacional

- filtros salvos por usuario
- busca avancada por multiplos campos
- exportacao de chamados
- dashboard com periodos personalizaveis
- atalhos de atendimento rapido
- timeline visual do ticket
- indicadores por departamento e tecnico

### Release focado em arquitetura

- separar o estado unico em tabelas reais de dominio
- criar camadas de servico no backend
- reduzir logica de negocio no frontend
- preparar API para integracoes externas mais granulares
- adicionar versionamento de payload e migracoes de dados

### Release focado em qualidade

- testes unitarios para regras de negocio
- testes de integracao da API
- smoke tests para fluxos principais
- lint e validacao automatica em pipeline
- ambiente de homologacao isolado do ambiente principal

## Resumo executivo

O TicketMind ja cobre um escopo relevante de service desk interno, com abertura de chamados, tratamento operacional, ativos, usuarios, base de conhecimento e configuracoes administrativas. O proximo salto de maturidade esta em fortalecer seguranca, mover regras criticas para o backend, melhorar automacoes de atendimento e estruturar a persistencia por entidades de negocio.
