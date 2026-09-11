import { supabase } from "../lib/supabaseClient";

export async function uploadDocumentoSeguranca(userId, file, tipo) {
  const fileExt = file.name ? file.name.split(".").pop() : "jpg";
  const filePath = `${userId}/${tipo}_${Date.now()}.${fileExt}`;

  const { data, error } = await supabase.storage
    .from("documentos-seguranca")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: true,
    });

  if (error) throw new Error(error.message);

  // Retorna o caminho interno para gerar URL assinada/privada depois
  return data.path;
}
