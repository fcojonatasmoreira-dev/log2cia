import { supabase } from "../lib/supabaseClient";

// Buscar todos os policiais cadastrados
export async function getPoliciais() {
  const { data, error } = await supabase
    .from("policiais")
    .select("*")
    .order("nome_guerra", { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}

// Cadastrar um novo policial
export async function createPolicial(policialData) {
  const { data, error } = await supabase
    .from("policiais")
    .insert([policialData])
    .select();

  if (error) throw new Error(error.message);
  return data[0];
}

// Editar dados de um policial (Apenas Master)
export async function updatePolicial(id, policialData) {
  const { data, error } = await supabase
    .from("policiais")
    .update(policialData)
    .eq("id", id)
    .select();

  if (error) throw new Error(error.message);
  return data[0];
}

// Excluir policial (Apenas Master)
export async function deletePolicial(id) {
  const { error } = await supabase.from("policiais").delete().eq("id", id);

  if (error) throw new Error(error.message);
}
