# TicketMind

Sistema de chamados em React com foco em service desk e operação estilo GLPI/ITSM.

## O que já existe

- Login com fluxo de MFA no frontend
- Rotas protegidas
- Dashboard operacional
- Gestão de chamados
- Base de conhecimento
- Ativos e CMDB
- Relatórios
- SLAs e automações
- Administração da plataforma

## Stack

- React
- Vite
- React Router

## Executar localmente

```bash
npm install
npm run dev
```

Build de produção:

```bash
npm run build
```

Preview local:

```bash
npm run preview
```

## Credenciais de demonstração

- Email: `admin@ticketmind.local`
- Senha: `TicketMind@2026`
- MFA: `246810`

## Estrutura

```text
src/
  auth/         contexto de autenticação
  components/   layout e proteção de rotas
  data/         dados mockados
  pages/        módulos do sistema
```

## Deploy no Render

O projeto já possui `render.yaml` na raiz com configuração de static site.

Passos:

1. Acesse o Render.
2. Clique em `New +`.
3. Escolha `Blueprint` ou crie um `Static Site`.
4. Conecte o repositório `rodsalveslourenco/TicketMind`.
5. Confirme o deploy.

Configuração usada:

- Build command: `npm ci && npm run build`
- Publish path: `dist`
- Rewrite SPA para `/index.html`

## Observação de segurança

O login atual é de demonstração no frontend. Para segurança real em produção, o próximo passo é integrar:

- backend de autenticação
- hash de senha
- sessão/JWT com refresh token
- RBAC
- auditoria
- banco de dados
- SSO/MFA real

## Próximos passos recomendados

1. Backend real para autenticação e chamados
2. Banco de dados e API
3. Catálogo de serviços e formulários dinâmicos
4. Comentários, anexos e histórico por chamado
5. Integrações com email, Teams, webhook e ERP
