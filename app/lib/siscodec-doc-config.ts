export type SiscodecDocConfig = {
  signatario: string;
  email_destinatario: string;
  pag: string;
  ug_exec_an_cod: string;
  ug_exec_an_sigla: string;
  ug_exec_sup_cod: string;
  ug_exec_sup_sigla: string;
  ug_cred_an_cod: string;
  ug_cred_an_sigla: string;
  ug_cred_sup_cod: string;
  ug_cred_sup_sigla: string;
  fonte: string;
  esfera: string;
  plano_interno: string;
};

export const CONFIG_PADRAO: SiscodecDocConfig = {
  signatario:        'CMG (T) SERGIO HENRIQUE MOREIRA LOPES',
  email_destinatario: 'brunobff.fab@gmail.com',
  pag:               '67201.000782/2026-39',
  ug_exec_an_cod:    '120625',
  ug_exec_an_sigla:  'GAP-DF',
  ug_exec_sup_cod:   '120006',
  ug_exec_sup_sigla: 'GAP-BR',
  ug_cred_an_cod:    '120115',
  ug_cred_an_sigla:  'COMAE',
  ug_cred_sup_cod:   '120111',
  ug_cred_sup_sigla: 'EMAER',
  fonte:             '1000000000',
  esfera:            '1',
  plano_interno:     'OCS90001000',
};

const KEY = 'siscodec-doc-config-v1';

export function loadConfig(): SiscodecDocConfig {
  if (typeof window === 'undefined') return { ...CONFIG_PADRAO };
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...CONFIG_PADRAO, ...JSON.parse(raw) } : { ...CONFIG_PADRAO };
  } catch {
    return { ...CONFIG_PADRAO };
  }
}

export function saveConfig(cfg: SiscodecDocConfig) {
  if (typeof window !== 'undefined') localStorage.setItem(KEY, JSON.stringify(cfg));
}
