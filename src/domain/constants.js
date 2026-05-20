export const ORDER_STATUS = {
  WAITING: 'AGUARDANDO',
  PRODUCING: 'PRODUZINDO',
  LOW_EFFICIENCY: 'BAIXA_EFICIENCIA',
  STOPPED: 'PARADA',
  FINISHED: 'FINALIZADA',
};

export const ORDER_STATUSES = Object.values(ORDER_STATUS);
export const ACTIVE_ORDER_STATUSES = [
  ORDER_STATUS.WAITING,
  ORDER_STATUS.PRODUCING,
  ORDER_STATUS.LOW_EFFICIENCY,
  ORDER_STATUS.STOPPED,
];

export const MACHINE_IDS = ['P1', 'P2', 'P3'];

export const STOP_REASONS = [
  'SET UP',
  'MATERIAL FRIO',
  'TROCA DE COR',
  'FIM DE SEMANA',
  'INÍCIO DE MÁQUINA',
  'FALTA DE OPERADOR / PREPARADOR',
  'TRY-OUT / TESTE',
  'QUALIDADE',
  'REGULAGEM',
  'MANUTENÇÃO ELÉTRICA',
  'MANUTENÇÃO MECÂNICA',
  'FALTA DE PEDIDO',
  'FALTA DE ABASTECIMENTO',
  'FALTA DE INSUMOS',
  'FALTA DE ENERGIA ELÉTRICA',
  'FALTA DE PROGRAMAÇÃO',
  'PARADA PROGRAMADA',
];

export const SCRAP_REASONS = [
  'Troca de Cor',
  'Regulagem',
  'Rebarba',
  'Bolha',
  'Contaminação',
  'Caídas no Chão',
  'Ponto de Injeção Alto',
  'Ponto de Injeção Deslocado',
  'Sujas de Óleo',
  'Fora de Cor',
  'Parede Fraca',
  'Fundo Deformado',
  'Ombro Deformado',
  'Peças falhadas',
  'Peças Furadas',
  'Fiapo',
  'Queimadas',
  'Manchadas',
  'Marcadas',
];

export const SHIFT_KEYS = ['1', '2', '3'];

export const TABLE_NAMES = {
  ORDERS: 'orders',
  PRODUCTION_SCANS: 'production_scans',
  MACHINE_STOPS: 'machine_stops',
  SCRAP_LOGS: 'scrap_logs',
  LOW_EFFICIENCY_LOGS: 'low_efficiency_logs',
  INJECTION_PRODUCTION_ENTRIES: 'injection_production_entries',
  TABLET_STATUS: 'tablet_status',
  MACHINES: 'machines',
  MACHINE_PRIORITIES: 'machine_priorities',
};

export const ADMIN_EMAILS = [
  'gabrielalvesdesiqueira683@gmail.com',
  'hadjnovan@gmail.com',
  'demo@gmail.com',
];

export const PRODUCAO_EMAILS = [];

export const MAQUINAS = MACHINE_IDS;
export const STATUS = ACTIVE_ORDER_STATUSES;
export const MOTIVOS_PARADA = STOP_REASONS;
export const REFUGO_MOTIVOS = SCRAP_REASONS;
export const TURNOS = [
  { key: '3', label: 'Turno 3' },
  { key: '1', label: 'Turno 1' },
  { key: '2', label: 'Turno 2' },
];
