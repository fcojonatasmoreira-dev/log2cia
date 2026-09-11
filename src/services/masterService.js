import { supabase } from "../lib/supabaseClient";

// Buscar todos os cadastros pendentes de análise
export async function getPerfisPendentes() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("status_aprovacao", "aguardando_analise")
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}

// Gerar URL assinada/temporária para visualizar arquivos no Storage Privado
export async function getDocumentoUrl(filePath) {
  if (!filePath) return null;
  const { data, error } = await supabase.storage
    .from("documentos-seguranca")
    .createSignedUrl(filePath, 300); // URL válida por 5 minutos

  if (error) throw new Error(error.message);
  return data.signedUrl;
}

// Aprovar ou Rejeitar Credenciamento
export async function homologarUsuario(
  profileId,
  novoStatus,
  roleAtribuida = "armeiro",
) {
  const { data, error } = await supabase
    .from("profiles")
    .update({
      status_aprovacao: novoStatus,
      role: novoStatus === "aprovado" ? roleAtribuida : "pendente",
    })
    .eq("id", profileId)
    .select();

  if (error) throw new Error(error.message);
  return data[0];
}

export async function preCadastrarOperador({ email, nome, roleAtribuida }) {
  const prazoExpiracao = new Date();
  prazoExpiracao.setDate(prazoExpiracao.getDate() + 7);

  // Insere ou atualiza o perfil pré-aprovado pelo Master
  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      [
        {
          email,
          nome,
          role: roleAtribuida,
          status_aprovacao: "pendente_completar",
          prazo_expiracao: prazoExpiracao.toISOString(),
        },
      ],
      { onConflict: "email" },
    )
    .select();

  if (error) throw new Error(error.message);
  return data[0];
}
