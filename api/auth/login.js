import { createClient } from '@supabase/supabase-js';
import { criarSessao, definirCookie } from './_session.js';
import { hashSenha, pareceHashSenha, verificarSenha } from './_password.js';

const supabaseAdmin = () => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente do servidor.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  try {
    const matricula = String(req.body?.matricula || '').trim();
    const senha = String(req.body?.senha || '');
    if (!matricula || !senha || matricula.length > 80 || senha.length > 256) {
      return res.status(400).json({ error: 'Informe matrícula e senha válidas.' });
    }
    const db = supabaseAdmin();
    const { data: policial, error } = await db.from('policiais').select('*').eq('matricula', matricula).maybeSingle();
    if (error) throw error;
    if (!policial) return res.status(401).json({ error: 'Matrícula ou senha incorreta.' });

    const senhaArmazenada = typeof policial.senha === 'string' ? policial.senha : '';
    const usaSenhaPadrao = !senhaArmazenada.trim();
    const senhaLegada = usaSenhaPadrao ? obterSenhaPadrao(policial) : senhaArmazenada.trim();
    const senhaValida = pareceHashSenha(senhaArmazenada)
      ? await verificarSenha(senha, senhaArmazenada)
      : senha === senhaLegada;
    if (!senhaValida) return res.status(401).json({ error: 'Matrícula ou senha incorreta.' });

    // Migra a senha legada para hash após um login válido. Senhas padrão continuam
    // exigindo troca no primeiro acesso.
    if (!pareceHashSenha(senhaArmazenada)) {
      const { error: atualizacaoError } = await db.from('policiais').update({
        senha: await hashSenha(senhaLegada),
        ...(usaSenhaPadrao ? { primeiro_acesso: true } : {}),
      }).eq('id', policial.id);
      if (atualizacaoError) throw atualizacaoError;
      if (usaSenhaPadrao) policial.primeiro_acesso = true;
    }

    const usuario = { ...policial };
    delete usuario.senha;
    const token = criarSessao(usuario);
    definirCookie(res, token);
    return res.status(200).json({ user: usuario });
  } catch (error) {
    console.error('Falha no login:', error.message);
    return res.status(500).json({ error: 'Não foi possível autenticar. Verifique a configuração do servidor.' });
  }
}

function obterSenhaPadrao(policial) {
  const numeral = String(policial?.numeral || '').trim();
  const matricula = String(policial?.matricula || '').trim();
  if (numeral && numeral !== '—') return numeral;
  return matricula.length >= 4 ? matricula.slice(-4) : matricula;
}
