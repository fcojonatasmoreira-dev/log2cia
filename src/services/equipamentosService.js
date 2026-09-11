import { supabase } from "../lib/supabaseClient";

// Buscar todo o acervo
export async function getEquipamentos() {
  const { data, error } = await supabase
    .from("equipamentos")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

// Cadastrar um novo equipamento
export async function createEquipamento(equipamentoData) {
  const { data, error } = await supabase
    .from("equipamentos")
    .insert([equipamentoData])
    .select();

  if (error) throw new Error(error.message);
  return data[0];
}
