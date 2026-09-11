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

// Criar ou atualizar pré-cadastro diretamente pelo Master
export async function preCadastrarOperador({ email, nome, roleAtribuida }) {
  const prazoExpiracao = new Date();
  prazoExpiracao.setDate(prazoExpiracao.getDate() + 7);

  // 1. Tenta buscar um perfil existente com esse e-mail
  const { data: existingProfiles, error: fetchError } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email);

  if (fetchError) throw new Error(fetchError.message);

  if (existingProfiles && existingProfiles.length > 0) {
    // 2. Se já existir registro, atualiza as permissões e o prazo de 7 dias
    const { data, error } = await supabase
      .from("profiles")
      .update({
        nome,
        role: roleAtribuida,
        status_aprovacao: "pendente_completar",
        prazo_expiracao: prazoExpiracao.toISOString(),
      })
      .eq("id", existingProfiles[0].id)
      .select();

    if (error) throw new Error(error.message);
    return data[0];
  } else {
    // 3. Se não existir, insere o pré-cadastro
    const { data, error } = await supabase
      .from("profiles")
      .insert([
        {
          email,
          nome,
          role: roleAtribuida,
          status_aprovacao: "pendente_completar",
          prazo_expiracao: prazoExpiracao.toISOString(),
        },
      ])
      .select();

    if (error) throw new Error(error.message);
    return data[0];
  }
}
