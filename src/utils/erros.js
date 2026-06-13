// Tradução central de mensagens de erro para português amigável.
// O usuário nunca deve ver texto técnico cru (inglês, AbortError, mensagens
// do Supabase/Postgres). Use em qualquer ponto que hoje exibe error.message.
//
// Ordem de prioridade: vazio -> rede/timeout -> auth -> postgres/rpc -> PT já
// pronto -> fallback genérico (sem vazar o texto cru em inglês).

export function translateError(message) {
  // 1) Entrada vazia/nula
  if (!message) return 'Algo deu errado. Tente novamente.';

  const original = String(message);
  const m = original.toLowerCase();

  // 2) REDE e TIMEOUT (o mais importante — hoje aparece cru em inglês).
  //    Cobre falha de fetch, abort do fetchWithTimeout (15s) e o prefixo
  //    interno __TIMEOUT__: do withTimeout (10s) do LancamentoScreen.
  if (
    m.includes('network request failed') ||
    m.includes('failed to fetch') ||
    m.includes('aborted') ||
    m.includes('aborterror') ||
    original.startsWith('__TIMEOUT__:')
  ) {
    return 'Sem conexão ou conexão lenta. Verifique sua internet e tente de novo.';
  }

  // 3) AUTH (migrado do translateError do LoginScreen)
  if (m.includes('invalid login credentials')) return 'E-mail ou senha inválidos.';
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (m.includes('user already registered')) return 'Este e-mail já está cadastrado.';
  if (m.includes('password should be at least'))
    return 'A senha precisa ter pelo menos 6 caracteres.';
  if (m.includes('unable to validate email')) return 'E-mail inválido.';

  // 4) POSTGRES / RPC comuns
  if (m.includes('row-level security') || m.includes('violates row-level security policy'))
    return 'Você não tem permissão para essa ação.';
  if (m.includes('duplicate key') || m.includes('unique constraint'))
    return 'Esse registro já existe.';
  if (m.includes('violates foreign key'))
    return 'Operação bloqueada: existem dados ligados a este item.';

  // Mensagens que JÁ vêm em português do banco (nossos RAISE EXCEPTION, ex.:
  // 'Você já faz parte de uma empresa...'). Detecta acento ou palavra-chave PT
  // e devolve a própria mensagem, sem alterar.
  if (/[áàâãéêíóôõúüç]/i.test(original) || /\b(voc[eê]|empresa|permiss[ãa]o)\b/i.test(m)) {
    return original;
  }

  // 5) FALLBACK: não vaza o texto cru em inglês, mas registra para debug.
  console.warn('[translateError] sem tradução:', message);
  return 'Não foi possível completar a ação. Tente novamente.';
}
