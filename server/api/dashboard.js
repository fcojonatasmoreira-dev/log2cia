import { calcularDashboardMetrics } from "../../src/utils/dashboardMetrics.js";
import { normalizarRole, respostaErro, supabaseAdmin, usuarioAutenticado } from "./_server.js";

const ROLES_DASHBOARD = ["master", "p4", "armeiro", "oficial", "p1", "p1_escalante_servico_ordinario", "policial", "permanente", "permanente da guarda", "user"];
const PERFIS_GESTAO_BANCO_HORAS = ["master", "p1", "oficial"];
const PERFIS_GESTAO_PERMUTAS = ["master", "oficial"];

function roleEfetivo(usuario) {
  return normalizarRole(usuario).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function contador(db, tabela, configurar = (query) => query) {
  let consulta = db.from(tabela).select("id", { count: "exact", head: true });
  consulta = configurar(consulta) || consulta;
  return consulta;
}

function assegurarSemErro(resultados) {
  for (const resultado of resultados) if (resultado?.error) throw resultado.error;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.setHeader("Allow", "GET").status(405).json({ error: "Método não permitido." });
  try {
    const usuario = await usuarioAutenticado(req, res);
    if (!usuario) return;
    const role = roleEfetivo(usuario);
    const modoPolicial = usuario.modo_acesso === "policial";
    if (modoPolicial && role !== "policial") return respostaErro(res, 403, "O Dashboard pessoal está disponível somente no modo Policial.");
    if (!modoPolicial && !ROLES_DASHBOARD.includes(role) && usuario.is_master !== true) return respostaErro(res, 403, "Sem permissão para consultar o painel.");

    const db = supabaseAdmin();
    const metrics = { modo: modoPolicial ? "policial" : "administrativo" };
    if (modoPolicial) {
      const [banco, permutas] = await Promise.all([
        contador(db, "banco_horas_solicitacoes", (query) => query.eq("policial_id", usuario.id).eq("status", "pendente")),
        contador(db, "permutas_servico", (query) => query.or(`solicitante_id.eq.${usuario.id},destinatario_id.eq.${usuario.id}`).in("status", ["AGUARDANDO_CONFIRMACAO", "AGUARDANDO_ANALISE"])),
      ]);
      assegurarSemErro([banco, permutas]);
      metrics.solicitacoesBancoHorasPessoais = banco.count || 0;
      metrics.permutasPessoaisPendentes = permutas.count || 0;
      return res.status(200).json({ metrics });
    }

    const master = role === "master" || usuario.is_master === true;
    const consultarEfetivo = master || ["p1", "p1_escalante_servico_ordinario", "p4", "oficial"].includes(role);
    const consultarFrota = master || ["p4", "oficial"].includes(role);
    const consultarBancoHoras = master || PERFIS_GESTAO_BANCO_HORAS.includes(role);
    const consultarAnalisePermutas = master || PERFIS_GESTAO_PERMUTAS.includes(role);
    const consultarEscala = master || ["p1", "p1_escalante_servico_ordinario"].includes(role);
    const consultarInventario = master || ["p4", "armeiro", "oficial"].includes(role);

    const tarefas = {};
    if (consultarEfetivo) tarefas.efetivo = contador(db, "policiais", (query) => query.eq("status", "EM ATIVIDADE"));
    if (consultarBancoHoras) tarefas.banco = contador(db, "banco_horas_solicitacoes", (query) => query.eq("status", "pendente"));
    if (consultarAnalisePermutas) tarefas.analise = contador(db, "permutas_servico", (query) => query.eq("status", "AGUARDANDO_ANALISE"));
    if (consultarEscala) {
      tarefas.escala = db.from("permutas_servico_escala")
        .select("id, permutas_servico!inner(status)", { count: "exact", head: true })
        .eq("situacao", "PENDENTE_NA_ESCALA")
        .is("encerrada_em", null)
        .eq("permutas_servico.status", "DEFERIDA");
      tarefas.revisao = contador(db, "permutas_servico_escala", (query) => query.eq("situacao", "REVISAO_NECESSARIA").is("revisao_concluida_em", null));
    }
    if (consultarFrota) {
      tarefas.frotaBaixadas = contador(db, "viaturas", (query) => query.eq("situacao", "baixada"));
      tarefas.frotaOperacionais = contador(db, "viaturas", (query) => query.eq("situacao", "operando").eq("ativo", true));
      tarefas.frotaManutencao = contador(db, "viaturas", (query) => query.eq("situacao", "manutencao"));
      tarefas.frotaTotal = contador(db, "viaturas");
    }
    if (consultarInventario) {
      tarefas.cautelas = db.from("cautelas").select("id, status, tipo_cautela, cautela_itens(equipamento_id)");
      tarefas.equipamentos = db.from("equipamentos").select("id, tipo, status, detalhes");
    }

    const chaves = Object.keys(tarefas);
    const resultados = await Promise.all(chaves.map((chave) => tarefas[chave]));
    const porChave = Object.fromEntries(chaves.map((chave, indice) => [chave, resultados[indice]]));
    assegurarSemErro(resultados);

    if (porChave.efetivo) metrics.efetivoAtivoCadastrado = porChave.efetivo.count || 0;
    if (porChave.banco) metrics.solicitacoesBancoHorasPendentes = porChave.banco.count || 0;
    if (porChave.analise) metrics.permutasAguardandoAnalise = porChave.analise.count || 0;
    if (porChave.escala) metrics.permutasAguardandoAplicacao = porChave.escala.count || 0;
    if (porChave.revisao) metrics.revisoesEscalaNecessarias = porChave.revisao.count || 0;
    if (porChave.frotaTotal) {
      metrics.situacaoViaturas = {
        baixadas: porChave.frotaBaixadas.count || 0,
        operacionais: porChave.frotaOperacionais.count || 0,
        manutencao: porChave.frotaManutencao.count || 0,
        total: porChave.frotaTotal.count || 0,
      };
    }
    if (porChave.cautelas && porChave.equipamentos) {
      metrics.inventario = calcularDashboardMetrics(porChave.cautelas.data || [], porChave.equipamentos.data || [], 0);
    }
    return res.status(200).json({ metrics });
  } catch (error) {
    console.error("Erro ao carregar resumo do Dashboard:", error.message);
    return respostaErro(res, 500, "Não foi possível carregar os dados do painel.");
  }
}
