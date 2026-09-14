import { supabase } from "../lib/supabaseClient";

// 1. Buscar cadastros pendentes de análise no Painel Master
export async function getPerfisPendentes() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("status_aprovacao", "aguardando_analise")
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

// 2. Gerar URL temporária assinada para visualizar Selfie e Funcional
export async function getDocumentoUrl(filePath) {
  if (!filePath) return null;

  const { data, error } = await supabase.storage
    .from("documentos-seguranca")
    .createSignedUrl(filePath, 3600);

  if (error) {
    const resAlt = await supabase.storage
      .from("documentos_operadores")
      .createSignedUrl(filePath, 3600);
    if (resAlt.error) throw new Error(error.message);
    return resAlt.data?.signedUrl || null;
  }

  return data?.signedUrl || null;
}

// 3. Homologar usuário (Aprovar ou Rejeitar)
export async function homologarUsuario(userId, status, roleAtribuida) {
  const { error } = await supabase
    .from("profiles")
    .update({
      status_aprovacao: status,
      role: roleAtribuida,
      homologado_em: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) throw error;
}

// 4. Pré-cadastrar operador na tabela 'pre_cadastros' (sem violação da FK id)
export async function preCadastrarOperador({ email, nome, roleAtribuida }) {
  const emailLimpo = email.trim().toLowerCase();

  const { data, error } = await supabase
    .from("pre_cadastros")
    .insert([
      {
        email: emailLimpo,
        nome: nome,
        role: roleAtribuida,
      },
    ])
    .select();

  if (error) throw new Error(error.message);
  return data;
}
