const API = '/api/auth';
export const EVENTO_REVALIDAR_SESSAO = 'log2cia:revalidar-sessao';

export function solicitarRevalidacaoSessao() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(EVENTO_REVALIDAR_SESSAO));
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${API}/${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || 'Falha na autenticação.');
    error.status = response.status;
    throw error;
  }
  return body;
}

export async function login(matricula, senha, manterConectado = false) {
  return request('login', {
    method: 'POST',
    body: JSON.stringify({ matricula, senha, manterConectado }),
  });
}

export async function obterSessao() {
  return request('me', { method: 'GET' });
}

export async function logout() {
  return request('logout', { method: 'POST', body: '{}' });
}

export async function alterarModo(modo) {
  return request('change-mode', {
    method: 'POST',
    body: JSON.stringify({ modo }),
  });
}
