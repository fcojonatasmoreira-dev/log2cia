import { supabase } from "../lib/supabaseClient";

// Buscar todas as cautelas com dados populados (Policiais + Itens + Equipamentos)
export async function getCautelas() {
  const { data, error } = await supabase
    .from("cautelas")
    .select(
      `
      *,
      policiais (id, nome_guerra, posto_graduacao, matricula),
      cautela_itens (
        id,
        quantidade,
        condicao_saida,
        condicao_retorno,
        equipamentos (id, tipo, num_serie, patrimonio, modelo_descricao)
      )
    `,
    )
    .order("data_cautela", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

// Abertura de Nova Cautela (Transação)
export async function createCautela({
  policial_id,
  operador_id,
  observacoes,
  itens,
}) {
  // 1. Criar o registro mestre da Cautela
  const { data: cautela, error: cautelaError } = await supabase
    .from("cautelas")
    .insert([
      {
        policial_id,
        operador_abertura_id: operador_id,
        observacoes,
        status: "ativa",
      },
    ])
    .select()
    .single();

  if (cautelaError) throw new Error(cautelaError.message);

  // 2. Vincular os itens à cautela
  const cautelaItensData = itens.map((item) => ({
    cautela_id: cautela.id,
    equipamento_id: item.equipamento_id,
    quantidade: item.quantidade || 1,
    condicao_saida: item.condicao_saida || "Sem avarias",
  }));

  const { error: itensError } = await supabase
    .from("cautela_itens")
    .insert(cautelaItensData);

  if (itensError) throw new Error(itensError.message);

  // 3. Atualizar o status dos equipamentos no acervo para 'cautelado'
  const equipamentoIds = itens.map((i) => i.equipamento_id);
  const { error: updateError } = await supabase
    .from("equipamentos")
    .update({ status: "cautelado" })
    .in("id", equipamentoIds);

  if (updateError) throw new Error(updateError.message);

  return cautela;
}

// Fechamento/Devolução de Cautela
export async function fecharCautela(
  cautelaId,
  operadorFechamentoId,
  itensDevolucao,
) {
  // 1. Atualizar o status da cautela para concluída
  const { error: cautelaError } = await supabase
    .from("cautelas")
    .update({
      status: "concluida",
      operador_fechamento_id: operadorFechamentoId,
      data_devolucao_real: new Date().toISOString(),
    })
    .eq("id", cautelaId);

  if (cautelaError) throw new Error(cautelaError.message);

  // 2. Liberar os equipamentos de volta para 'disponivel'
  const { data: itens } = await supabase
    .from("cautela_itens")
    .select("equipamento_id")
    .eq("cautela_id", cautelaId);

  if (itens && itens.length > 0) {
    const equipamentoIds = itens.map((i) => i.equipamento_id);
    const { error: updateError } = await supabase
      .from("equipamentos")
      .update({ status: "disponivel" })
      .in("id", equipamentoIds);

    if (updateError) throw new Error(updateError.message);
  }
}
