const API = '/api/auth';

async function request(path, options = {}) {
  const response = await fetch(`${API}/${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Falha na autenticação.');
  return body;
}

export async function login(matricula, senha) {
  return request('login', { method: 'POST', body: JSON.stringify({ matricula, senha }) });
}

export async function obterSessao() {
  return request('me', { method: 'GET' });
}

export async function logout() {
  return request('logout', { method: 'POST', body: '{}' });
}
