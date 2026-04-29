# TicketMind

Sistema web de service desk e operacao interna, com frontend React e backend Express, pensado para uso estilo GLPI/ITSM.

## Visao geral

O projeto entrega uma aplicacao unica com:

- frontend React servido pelo Vite no build
- backend Express servindo API e arquivos estaticos
- autenticacao simples por email e senha
- controle de acesso por permissoes
- persistencia de estado completa em SQLite local ou Postgres

Hoje a aplicacao funciona como um monolito simples:

- o backend expoe endpoints `/api/*`
- o frontend consome esses endpoints com `fetch`
- o estado completo da aplicacao e salvo como um documento unico em `app_state`

## Principais modulos funcionais

- `Login`: autenticacao inicial e restauracao de sessao no navegador
- `Dashboard`: indicadores operacionais, fila e visao resumida
- `Tickets`: abertura, edicao e acompanhamento de chamados
- `Assets`: cadastro e manutencao de ativos
- `Inventory`: visao de inventario e operacao relacionada
- `Brands / Models`: catalogo de marcas e modelos por tipo de ativo
- `Projects`: acompanhamento de projetos internos
- `API Config`: configuracao de integracoes REST
- `Users`: administracao de usuarios e permissoes
- `Profile`: atualizacao basica do perfil do usuario logado

## Arquitetura

### Frontend

- `React 18`
- `React Router`
- `Context API` para sessao e dados globais
- `Vite` para desenvolvimento e build

Arquivos centrais:

- [src/App.jsx](/C:/Users/Rodrigo%20Alves/OneDrive%20-%20WEGA%20MARINE/Documentos/TicketMind/src/App.jsx): define as rotas da aplicacao
- [src/auth/AuthContext.jsx](/C:/Users/Rodrigo%20Alves/OneDrive%20-%20WEGA%20MARINE/Documentos/TicketMind/src/auth/AuthContext.jsx): login, logout e restauracao de sessao
- [src/data/AppDataContext.jsx](/C:/Users/Rodrigo%20Alves/OneDrive%20-%20WEGA%20MARINE/Documentos/TicketMind/src/data/AppDataContext.jsx): carga de dados, regras de negocio no cliente e sincronizacao com a API

### Backend

- `Express`
- `SQL.js` para SQLite local
- `pg` para Postgres

Arquivos centrais:

- [server/index.js](/C:/Users/Rodrigo%20Alves/OneDrive%20-%20WEGA%20MARINE/Documentos/TicketMind/server/index.js): API HTTP e entrega do frontend compilado
- [server/db.js](/C:/Users/Rodrigo%20Alves/OneDrive%20-%20WEGA%20MARINE/Documentos/TicketMind/server/db.js): persistencia, bootstrap e fallback SQLite/Postgres

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

- `GET /api/health`: verificacao basica de disponibilidade
- `POST /api/auth/login`: autentica por email e senha
- `GET /api/auth/session/:userId`: reidrata sessao salva no navegador
- `GET /api/state`: retorna o estado completo da aplicacao
- `PUT /api/state`: persiste o estado completo atualizado

Observacao importante:

- o modelo atual salva o estado inteiro da plataforma em um unico registro
- ainda nao existe separacao por tabelas de negocio
- ainda nao existe token JWT, cookie de sessao HTTP-only ou hash de senha

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
- le o estado do Postgres
- se o Postgres estiver vazio, tenta inicializar a partir do SQLite local

Tabela usada hoje:

- `app_state(id, data, updated_at)`

O campo `data` guarda um `JSONB` com o estado inteiro da aplicacao.

## Dados iniciais

O seed atual fica em [src/data/seedData.js](/C:/Users/Rodrigo%20Alves/OneDrive%20-%20WEGA%20MARINE/Documentos/TicketMind/src/data/seedData.js).

Usuario administrador padrao:

- email: `admin@ticketmind.local`
- senha: `admin0123`

Esse seed e usado quando ainda nao existe estado persistido.

## Regras de acesso

O projeto possui uma camada de permissoes por recurso, aplicada em dois niveis:

- protecao de rota no frontend
- validacao de acoes no contexto de dados do frontend

Exemplos de capacidade controlada por permissao:

- visualizar chamados proprios ou todos
- criar, editar, reabrir e encerrar tickets
- gerenciar usuarios e resetar senha
- administrar ativos, marcas, modelos e projetos
- configurar integracoes REST

Observacao:

- isso ainda nao substitui autorizacao forte no backend
- hoje boa parte da regra operacional ainda esta no frontend

## Estrutura de pastas

```text
server/
  index.js              servidor Express
  db.js                 persistencia SQLite/Postgres

src/
  assets/               imagens e recursos visuais
  auth/                 contexto de autenticacao
  components/           layout, protecao de rotas e componentes compartilhados
  data/                 seed, permissoes, catalogos e contexto global
  lib/                  cliente HTTP
  pages/                telas da aplicacao
  App.jsx               definicao de rotas
  main.jsx              bootstrap React
  styles.css            estilos globais

render.yaml             blueprint de deploy no Render
package.json            scripts e dependencias
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

O projeto foi preparado para deploy via `Blueprint` com o arquivo `render.yaml`.

O blueprint cria:

- um `Web Service` chamado `ticketmind`
- um banco `Render Postgres` chamado `ticketmind-db`

Fluxo:

1. No Render, clique em `New +`
2. Escolha `Blueprint`
3. Selecione o repositorio
4. Confirme o `render.yaml`
5. Aprove a criacao dos recursos

No deploy:

- o Render executa `npm ci && npm run build`
- depois sobe o backend com `npm run start`
- o frontend compilado em `dist` e servido pelo proprio Express
- a variavel `DATABASE_URL` e injetada automaticamente a partir do banco criado

## Privacidade do codigo e do acesso

### Repositorio GitHub

Se o objetivo e impedir que o codigo fique disponivel para qualquer pessoa baixar, o caminho correto e deixar o repositorio como `Private` no GitHub. O GitHub permite mudar a visibilidade do repositorio, e repositorios privados nao ficam abertos ao publico. Fonte: [GitHub Docs - Setting repository visibility](https://docs.github.com/en/github/administering-a-repository/setting-repository-visibility)

O Render pode continuar fazendo deploy de repositorios privados, desde que sua conta GitHub conectada ao Render tenha acesso a esse repositorio privado. Fonte: [Render Docs - Web Services](https://render.com/docs/web-services), [Render Docs - Connect GitHub](https://render.com/docs/github)

Em termos praticos:

1. deixe o repositorio como `Private` no GitHub
2. mantenha sua conta GitHub conectada ao Render
3. confirme que o Render ainda tem permissao sobre esse repositorio

### Acesso ao sistema publicado

Se voce quer que o sistema continue acessivel por navegador, ele precisa continuar como `Web Service`, o que significa URL publica. Fonte: [Render Docs - Web Services](https://render.com/docs/web-services)

Se voce quiser que ele nao seja acessivel pela internet publica, o Render orienta usar `Private Service`, mas nesse modo ele nao recebe URL publica e nao serve para acesso direto por navegador dos usuarios. Fonte: [Render Docs - Private Services](https://render.com/docs/private-services)

Resumo objetivo:

- para esconder o codigo-fonte: repositorio `Private` no GitHub
- para manter o sistema acessivel no navegador: continuar com `Web Service`
- para restringir uso do sistema: manter login e, idealmente, evoluir para autenticacao real
- para impedir acesso publico total ao app: migrar para `Private Service`, mas ai o sistema nao abre publicamente

## Limitacoes atuais

- senha ainda armazenada em texto puro
- sem JWT ou cookie seguro
- sem controle de sessao no backend
- sem autorizacao forte no servidor
- persistencia em documento unico
- sem suite formal de testes

## Proximos passos recomendados

1. Mover autenticacao e autorizacao de forma efetiva para o backend
2. Aplicar hash de senha com algoritmo apropriado
3. Trocar o estado unico por tabelas de dominio reais
4. Adicionar testes para API, autenticacao e persistencia
5. Definir estrategia de acesso externo: publico com login, VPN, proxy com auth ou private network
