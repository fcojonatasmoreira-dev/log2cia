import { supabase } from "../lib/supabaseClient";

export async function getDashboardMetrics() {
  // 1. Cautelas Ativas
  const { count: cautelasAtivasCount } = await supabase
    .from("cautelas")
    .select("*", { count: "exact", head: true })
    .eq("status", "ativa");

  // 2. Equipamentos (Armas Disponíveis e Coletes a Vencer)
  const { data: equipamentos } = await supabase
    .from("equipamentos")
    .select("*");

  const armasDisponiveis = equipamentos
    ? equipamentos.filter(
        (e) => e.tipo === "armamento" && e.status === "disponivel",
      ).length
    : 0;

  // Lógica de Coletes a vencer (verifica detalhes em JSON ou data de validade)
  const hoje = new Date();
  const limite30Dias = new Date();
  limite30Dias.setDate(hoje.getDate() + 30);

  const coletesAVencer = equipamentos
    ? equipamentos.filter((e) => {
        if (e.tipo !== "colete" || !e.detalhes?.data_validade) return false;
        const validade = new Date(e.detalhes.data_validade);
        return validade <= limite30Dias;
      }).length
    : 0;

  // 3. Efetivo Ativo
  const { count: efetivoAtivoCount } = await supabase
    .from("policiais")
    .select("*", { count: "exact", head: true })
    .eq("status", "EM ATIVIDADE");

  const formatValue = (val) => (val && val > 0 ? val : "-");

  return {
    cautelasAtivas: formatValue(cautelasAtivasCount),
    armasDisponiveis: formatValue(armasDisponiveis),
    coletesAVencer: formatValue(coletesAVencer),
    efetivoAtivo: formatValue(efetivoAtivoCount),
  };
}
