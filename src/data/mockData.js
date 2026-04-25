export const summary = {
  openTickets: 148,
  criticalOpen: 9,
  slaCompliance: 96.4,
  backlogTrend: -12,
  firstResponseMinutes: 11,
  csat: 4.7,
};

export const queues = [
  { name: "Service Desk N1", open: 62, overdue: 5, assigned: 11 },
  { name: "Infraestrutura", open: 28, overdue: 2, assigned: 6 },
  { name: "Aplicações", open: 31, overdue: 1, assigned: 7 },
  { name: "Segurança", open: 17, overdue: 1, assigned: 4 },
  { name: "Mudanças e projetos", open: 10, overdue: 0, assigned: 3 },
];

export const tickets = [
  {
    id: "INC-2048",
    title: "ERP indisponível na matriz",
    type: "Incidente",
    priority: "Crítica",
    status: "Em atendimento",
    requester: "Financeiro",
    assignee: "NOC",
    queue: "Infraestrutura",
    sla: "12 min restantes",
    updatedAt: "Agora",
  },
  {
    id: "REQ-1832",
    title: "Novo acesso VPN para gestor regional",
    type: "Requisição",
    priority: "Alta",
    status: "Aguardando aprovação",
    requester: "RH",
    assignee: "IAM",
    queue: "Segurança",
    sla: "1h 08m",
    updatedAt: "há 9 min",
  },
  {
    id: "CHG-0914",
    title: "Janela para atualização do cluster Proxmox",
    type: "Mudança",
    priority: "Média",
    status: "Planejada",
    requester: "Infra",
    assignee: "Core Team",
    queue: "Mudanças e projetos",
    sla: "Planejada",
    updatedAt: "há 17 min",
  },
  {
    id: "PRB-0181",
    title: "Falhas recorrentes no coletor de inventário",
    type: "Problema",
    priority: "Alta",
    status: "Análise raiz",
    requester: "Operações",
    assignee: "Aplicações",
    queue: "Aplicações",
    sla: "38 min",
    updatedAt: "há 31 min",
  },
];

export const knowledgeArticles = [
  {
    title: "Procedimento padrão para reset de MFA",
    category: "Acesso",
    owner: "Segurança",
    lastUpdate: "24/04/2026",
  },
  {
    title: "Checklist de onboarding de colaborador",
    category: "Service desk",
    owner: "N1",
    lastUpdate: "22/04/2026",
  },
  {
    title: "Runbook para indisponibilidade do ERP",
    category: "Aplicações",
    owner: "Aplicações",
    lastUpdate: "18/04/2026",
  },
];

export const assets = [
  { name: "Firewall matriz", type: "FortiGate 200F", owner: "Segurança", health: "Saudável" },
  { name: "Cluster virtualização", type: "Proxmox 8", owner: "Infraestrutura", health: "Atenção" },
  { name: "ERP Produção", type: "Aplicação crítica", owner: "Aplicações", health: "Monitorado" },
  { name: "Switch core", type: "Cisco C9300", owner: "Rede", health: "Saudável" },
];

export const automations = [
  {
    name: "Escalonamento automático de P1",
    trigger: "Prioridade crítica sem aceite em 5 min",
    action: "Escala para coordenador + Teams + SMS",
  },
  {
    name: "Classificação de requisição de acesso",
    trigger: "Formulário catálogo / acesso",
    action: "Direciona para IAM + aprovação do gestor",
  },
  {
    name: "Encerramento com CSAT",
    trigger: "Chamado resolvido",
    action: "Envia pesquisa e fecha em 48h sem objeção",
  },
];

export const reports = [
  { label: "Tempo médio de primeira resposta", value: "11 min", trend: "-18%" },
  { label: "Tempo médio de resolução", value: "4h 22m", trend: "-9%" },
  { label: "Taxa de reabertura", value: "3.1%", trend: "-1.4pp" },
  { label: "Mudanças bem-sucedidas", value: "98.2%", trend: "+2.3pp" },
];

export const adminModules = [
  "Catálogo de serviços",
  "Grupos e filas",
  "SLAs e calendários",
  "Papéis e permissões",
  "CMDB e relacionamentos",
  "Aprovações e workflow",
  "Auditoria e trilha de eventos",
  "Integrações com email, webhook, Teams e ERP",
];
