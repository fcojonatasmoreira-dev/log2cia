import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function Cautelas() {
  const navigate = useNavigate();

  const [cautelas, setCautelas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);

  // Modais de Ação e Visualização
  const [cautelaVisualizando, setCautelaVisualizando] = useState(null);
  const [cautelaDevolvendo, setCautelaDevolvendo] = useState(null);
  const [processando, setProcessando] = useState(false);

  // Formulário do Checklist e Devolução
  const [checkArma, setCheckArma] = useState(true);
  const [checkCarregadores, setCheckCarregadores] = useState(true);
  const [checkMunicao, setCheckMunicao] = useState(true);
  const [campoAlteracoes, setCampoAlteracoes] = useState("");

  useEffect(() => {
    carregarPerfilEData();
  }, []);

  async function carregarPerfilEData() {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setCurrentUser(user);
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, nome, role")
          .eq("id", user.id)
          .maybeSingle();
        setUserProfile(profile);
      }
      await carregarCautelas();
    } catch (err) {
      console.error("Erro ao carregar dados:", err.message);
    } finally {
      setLoading(false);
    }
  }

  async function carregarCautelas() {
    try {
      // 1. Busca pura das cautelas e dos policiais vinculados
      const { data, error } = await supabase
        .from("cautelas")
        .select(
          `
          id,
          status,
          data_cautela,
          data_devolucao,
          alteracoes,
          armeiro_id,
          policial:policiais!policial_id (
            matricula,
            posto_graduacao,
            nome_guerra
          ),
          cautela_itens (
            id,
            quantidade_municao,
            tipo_municao,
            quantidade_carregadores,
            equipamento:equipamentos (
              tipo,
              modelo_descricao,
              num_serie
            )
          )
        `,
        )
        .order("data_cautela", { ascending: false });

      if (error) throw error;
      if (data) {
        setCautelas(data);
      }
    } catch (err) {
      console.error("Erro crítico ao carregar cautelas:", err.message);
    }
  }
  const handleIniciarDevolucaoFromModal = (cautela) => {
    setCautelaVisualizando(null);
    setCautelaDevolvendo(cautela);
    setCheckArma(true);
    setCheckCarregadores(true);
    setCheckMunicao(true);
    setCampoAlteracoes("");
  };

  const handleConfirmarDevolucao = async (e) => {
    e.preventDefault();
    if (!cautelaDevolvendo) return;
    setProcessando(true);

    try {
      const numSerie =
        cautelaDevolvendo.cautela_itens?.[0]?.equipamento?.num_serie;
      const dataHoraAtual = new Date().toISOString();

      const checklistStatus = `ARMA:${checkArma ? "OK" : "NOK"}|CARREGADORES:${checkCarregadores ? "OK" : "NOK"}|MUNICAO:${checkMunicao ? "OK" : "NOK"}`;
      const relatorioFormatado = `${checklistStatus} | OBS:${campoAlteracoes ? campoAlteracoes.trim() : "Sem alterações"}`;

      const { error: errCautela } = await supabase
        .from("cautelas")
        .update({
          status: "finalizada",
          data_devolucao: dataHoraAtual,
          armeiro_id: currentUser?.id || null,
          alteracoes: relatorioFormatado,
        })
        .eq("id", cautelaDevolvendo.id);

      if (errCautela) throw errCautela;

      if (numSerie) {
        await supabase
          .from("equipamentos")
          .update({ status: "disponivel" })
          .eq("num_serie", numSerie);
      }

      setCautelaDevolvendo(null);
      carregarCautelas();
    } catch (err) {
      alert("Erro ao homologar devolução: " + err.message);
    } finally {
      setProcessando(false);
    }
  };

  const handleExcluirCautela = async (cautela) => {
    if (
      !window.confirm(
        "Atenção (Master): Deseja realmente excluir este registro histórico?",
      )
    )
      return;

    try {
      const numSerie = cautela.cautela_itens?.[0]?.equipamento?.num_serie;

      await supabase
        .from("cautela_itens")
        .delete()
        .eq("cautela_id", cautela.id);
      const { error } = await supabase
        .from("cautelas")
        .delete()
        .eq("id", cautela.id);

      if (error) throw error;

      if (cautela.status === "ativa" && numSerie) {
        await supabase
          .from("equipamentos")
          .update({ status: "disponivel" })
          .eq("num_serie", numSerie);
      }

      setCautelaVisualizando(null);
      setCautelas((prev) => prev.filter((c) => c.id !== cautela.id));
    } catch (err) {
      alert("Erro ao excluir cautela: " + err.message);
    }
  };

  const parseRelatorio = (texto) => {
    if (!texto)
      return {
        arma: true,
        carregadores: true,
        municao: true,
        obs: "Sem alterações.",
      };

    const armaOk = !texto.includes("ARMA:NOK");
    const carregadoresOk = !texto.includes("CARREGADORES:NOK");
    const municaoOk = !texto.includes("MUNICAO:NOK");

    let obs = "Sem alterações.";
    if (texto.includes("| OBS:")) {
      obs = texto.split("| OBS:")[1].trim();
    } else if (texto.includes("| Obs:")) {
      obs = texto.split("| Obs:")[1].trim();
    } else if (!texto.includes("ARMA:")) {
      obs = texto;
    }

    return {
      arma: armaOk,
      carregadores: carregadoresOk,
      municao: municaoOk,
      obs,
    };
  };

  // BAIXAR COMPROVANTE BÉLICO DIRETO EM PDF (DOWNLOAD AUTOMÁTICO)
  const handleBaixarPDF = async (cautela, nomeArmeiro) => {
    const pol = cautela.policial || {};
    const item = cautela.cautela_itens?.[0] || {};
    const eq = item.equipamento || {};
    const infoRelatorio = parseRelatorio(cautela.alteracoes);
    const dataHoraEmissao = new Date().toLocaleString("pt-BR");

    // Elemento HTML temporário para renderização do PDF
    const element = document.createElement("div");
    element.innerHTML = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #0f172a; line-height: 1.5; background: #ffffff;">
        <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px;">
          <h1 style="margin: 0; font-size: 16px; text-transform: uppercase; letter-spacing: 1px;">POLÍCIA MILITAR DO ESTADO</h1>
          <h2 style="margin: 4px 0 0 0; font-size: 12px; color: #475569; font-weight: normal;">2ª COMPANHIA / 15º BATALHÃO — REGISTRO DE ARMAZENAMENTO BÉLICO</h2>
          <h3 style="margin-top: 8px; font-size: 13px; font-weight: bold; text-transform: uppercase; color: #1e293b;">TERMO DE HOMOLOGAÇÃO E DEVOLUÇÃO BÉLICA</h3>
        </div>

        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
          <div style="font-size: 10px; font-weight: bold; text-transform: uppercase; color: #334155; margin-bottom: 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px;">1. DADOS DO MILITAR RESPONSÁVEL</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px;">
            <div><strong>Posto/Graduação - Nome:</strong> ${pol.posto_graduacao || ""} ${pol.nome_guerra || "N/I"}</div>
            <div><strong>Matrícula/RE:</strong> ${pol.matricula || "N/I"}</div>
          </div>
        </div>

        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
          <div style="font-size: 10px; font-weight: bold; text-transform: uppercase; color: #334155; margin-bottom: 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px;">2. DADOS DA TRANSAÇÃO E DATAS</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px;">
            <div><strong>Data/Hora de Cautela:</strong> ${cautela.data_cautela ? new Date(cautela.data_cautela).toLocaleString("pt-BR") : "N/I"}</div>
            <div><strong>Data/Hora de Devolução:</strong> ${cautela.data_devolucao ? new Date(cautela.data_devolucao).toLocaleString("pt-BR") : "N/I"}</div>
          </div>
        </div>

        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
          <div style="font-size: 10px; font-weight: bold; text-transform: uppercase; color: #334155; margin-bottom: 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px;">3. ESPECIFICAÇÃO DO MATERIAL BÉLICO</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px;">
            <div><strong>Equipamento:</strong> ${eq.tipo?.toUpperCase() || ""} ${eq.modelo_descricao || ""}</div>
            <div><strong>Nº de Série:</strong> ${eq.num_serie || "N/I"}</div>
            <div><strong>Carregadores Devolvidos:</strong> ${item.quantidade_carregadores || 0} un</div>
            <div><strong>Munições Devolvidas:</strong> ${item.quantidade_municao || 0} un (${item.tipo_municao || "N/I"})</div>
          </div>
        </div>

        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
          <div style="font-size: 10px; font-weight: bold; text-transform: uppercase; color: #334155; margin-bottom: 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px;">4. CONFERÊNCIA FÍSICA (CHECKLIST DA RESERVA)</div>
          <div style="margin-bottom: 6px; font-size: 11px;">
            <strong>Armamento:</strong> ${infoRelatorio.arma ? "CONFORME" : "AVARIADO"} | 
            <strong>Carregadores:</strong> ${infoRelatorio.carregadores ? "CONFORME" : "DIVERGENTE"} | 
            <strong>Munições:</strong> ${infoRelatorio.municao ? "CONFORME" : "DIVERGENTE"}
          </div>
          <div style="font-size: 10px;"><strong>Observações/Avarias:</strong> ${infoRelatorio.obs}</div>
        </div>

        <div style="margin-top: 40px; border-top: 2px dashed #0f172a; padding-top: 12px; text-align: center;">
          <div style="font-size: 11px; font-weight: bold; text-transform: uppercase; color: #0f172a;">Assinado eletronicamente por ${nomeArmeiro}</div>
          <div style="font-size: 9px; color: #64748b; margin-top: 2px;">Homologado via Log2CIA em ${dataHoraEmissao} • Autenticidade Auditada no Sistema</div>
        </div>
      </div>
    `;

    // Opções de salvamento automático do PDF
    const opt = {
      margin: 10,
      filename: `Termo_Devolucao_${pol.nome_guerra || "Militar"}_${eq.num_serie || "Serie"}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    };

    try {
      // Importa dinamicamente e executa o download direto
      const html2pdf = (await import("html2pdf.js")).default;
      html2pdf().set(opt).from(element).save();
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
      alert(
        "Falha ao gerar PDF automaticamente. Certifique-se de ter executado 'npm install html2pdf.js'.",
      );
    }
  };

  // Permissões
  const isDevLocal =
    import.meta.env.DEV &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");
  const userEmail = currentUser?.email?.toLowerCase();

  const isMaster =
    userEmail === "jonatas.sillv@gmail.com" || userProfile?.role === "master";
  const isArmeiro =
    isMaster ||
    userProfile?.role === "armeiro" ||
    userProfile?.role === "p4" ||
    (isDevLocal && userEmail === "fcojonatasmoreira@gmail.com");

  return (
    <div className="space-y-6 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Controle de Cautelas e Devoluções
          </h1>
          <p className="text-sm text-slate-500">
            Registro de saída e devolução homologada de material bélico.
          </p>
        </div>

        {isArmeiro && (
          <button
            type="button"
            onClick={() => navigate("/cautelas/nova")}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg shadow transition-all text-xs"
          >
            + Nova Cautela
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-gray-500 text-center py-8">
          Carregando listagem de cautelas...
        </p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[11px] font-semibold">
                <th className="p-3">Policial / Servidor</th>
                <th className="p-3">Itens Cautelados</th>
                <th className="p-3">Data Saída</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cautelas.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-4 text-center text-slate-400">
                    Nenhuma cautela registrada.
                  </td>
                </tr>
              ) : (
                cautelas.map((c) => {
                  const pol = c.policial || {};
                  const isAtiva = c.status === "ativa";

                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="p-3">
                        <span className="font-bold text-slate-800 block">
                          {pol.posto_graduacao} {pol.nome_guerra || "N/I"}
                        </span>
                        <span className="text-xs text-slate-500 font-mono">
                          Matrícula: {pol.matricula || "N/I"}
                        </span>
                      </td>

                      <td className="p-3 space-y-1">
                        {c.cautela_itens && c.cautela_itens.length > 0 ? (
                          c.cautela_itens.map((ci) => {
                            const eq = ci.equipamento || {};
                            return (
                              <div
                                key={ci.id}
                                className="bg-slate-50 p-2 rounded-lg border border-slate-100"
                              >
                                <div className="font-bold text-slate-800 text-xs">
                                  {eq.tipo?.toUpperCase()} -{" "}
                                  {eq.modelo_descricao || "N/I"}
                                </div>
                                <div className="text-[11px] text-slate-500 font-mono">
                                  Série:{" "}
                                  <span className="font-bold text-slate-700">
                                    {eq.num_serie || "N/I"}
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <span className="text-slate-400 text-xs italic">
                            Sem itens
                          </span>
                        )}
                      </td>

                      <td className="p-3 text-slate-600 text-xs font-medium">
                        {c.data_cautela
                          ? new Date(c.data_cautela).toLocaleString("pt-BR")
                          : "N/A"}
                      </td>

                      <td className="p-3">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            isAtiva
                              ? "bg-amber-100 text-amber-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {isAtiva ? "• Em Cautela" : "✓ Devolvido / Histórico"}
                        </span>
                      </td>

                      <td className="p-3 text-right">
                        <button
                          onClick={() => setCautelaVisualizando(c)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded text-xs transition-all border border-slate-300 shadow-2xs"
                        >
                          👁️ Visualizar Cautela
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL 1: VISUALIZAÇÃO E BOTÃO BAIXAR PDF */}
      {cautelaVisualizando &&
        (() => {
          const isAtiva = cautelaVisualizando.status === "ativa";
          const infoRelatorio = parseRelatorio(cautelaVisualizando.alteracoes);

          const nomeArmeiro =
            cautelaVisualizando.armeiro?.nome ||
            userProfile?.nome ||
            (userEmail === "fcojonatasmoreira@gmail.com"
              ? "Soldado Jonatas (Armeiro)"
              : null) ||
            (userEmail === "jonatas.sillv@gmail.com"
              ? "Albert (Master)"
              : null) ||
            cautelaVisualizando.armeiro?.email ||
            "Armeiro de Plantão";

          return (
            <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 font-sans">
              <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4">
                <div className="flex justify-between items-center border-b pb-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-800">
                      Detalhes da Cautela Bélica
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      {isAtiva
                        ? "Registro de cautela em aberto"
                        : "Comprovante de devolução concluída"}
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      isAtiva
                        ? "bg-amber-100 text-amber-800"
                        : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {isAtiva ? "• Em Cautela" : "✓ Devolvido"}
                  </span>
                </div>

                <div className="space-y-3 text-xs">
                  {/* Datas */}
                  <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">
                        Data de Cautela
                      </span>
                      <span className="font-bold text-slate-800">
                        {cautelaVisualizando.data_cautela
                          ? new Date(
                              cautelaVisualizando.data_cautela,
                            ).toLocaleString("pt-BR")
                          : "N/I"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">
                        Data de Devolução
                      </span>
                      <span
                        className={`font-bold ${isAtiva ? "text-amber-700 italic" : "text-emerald-700"}`}
                      >
                        {isAtiva
                          ? "Pendente de Devolução"
                          : new Date(
                              cautelaVisualizando.data_devolucao,
                            ).toLocaleString("pt-BR")}
                      </span>
                    </div>
                  </div>

                  {/* Policial e Armeiro */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">
                        Policial que Cautelou
                      </span>
                      <span className="font-bold text-slate-800 block">
                        {cautelaVisualizando.policial?.posto_graduacao}{" "}
                        {cautelaVisualizando.policial?.nome_guerra}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        Mat: {cautelaVisualizando.policial?.matricula || "N/I"}
                      </span>
                    </div>

                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">
                        {isAtiva ? "Armeiro Responsável" : "Armeiro de Plantão"}
                      </span>
                      <span className="font-bold text-slate-800 block">
                        {nomeArmeiro}
                      </span>
                      <span
                        className={`text-[11px] font-medium ${isAtiva ? "text-amber-600" : "text-emerald-600"}`}
                      >
                        {isAtiva ? "• Em Cautela" : "✓ Homologado"}
                      </span>
                    </div>
                  </div>

                  {/* Checklist (se finalizado) */}
                  {!isAtiva && (
                    <div className="space-y-1.5">
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">
                        Conferência do Material (Checklist)
                      </span>
                      <div className="flex gap-2">
                        <span
                          className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${infoRelatorio.arma ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}
                        >
                          {infoRelatorio.arma
                            ? "✓ Armamento OK"
                            : "✕ Armamento Avariado"}
                        </span>
                        <span
                          className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${infoRelatorio.carregadores ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}
                        >
                          {infoRelatorio.carregadores
                            ? "✓ Carregadores OK"
                            : "✕ Carregadores Divergentes"}
                        </span>
                        <span
                          className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${infoRelatorio.municao ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}
                        >
                          {infoRelatorio.municao
                            ? "✓ Munições OK"
                            : "✕ Munições Divergentes"}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Equipamento */}
                  <div>
                    <span className="text-slate-500 block mb-1 font-bold uppercase text-[10px]">
                      Equipamento Cautelado
                    </span>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                      <div className="font-bold text-slate-800">
                        {cautelaVisualizando.cautela_itens?.[0]?.equipamento?.tipo?.toUpperCase()}{" "}
                        -{" "}
                        {
                          cautelaVisualizando.cautela_itens?.[0]?.equipamento
                            ?.modelo_descricao
                        }
                      </div>
                      <div className="text-slate-600 font-mono text-[11px]">
                        Nº de Série:{" "}
                        <strong>
                          {
                            cautelaVisualizando.cautela_itens?.[0]?.equipamento
                              ?.num_serie
                          }
                        </strong>
                      </div>
                      <div className="text-[11px] text-slate-500 pt-1">
                        Carregadores:{" "}
                        <strong>
                          {
                            cautelaVisualizando.cautela_itens?.[0]
                              ?.quantidade_carregadores
                          }
                        </strong>{" "}
                        | Munição:{" "}
                        <strong>
                          {
                            cautelaVisualizando.cautela_itens?.[0]
                              ?.quantidade_municao
                          }
                        </strong>{" "}
                        (
                        {cautelaVisualizando.cautela_itens?.[0]?.tipo_municao ||
                          "N/I"}
                        )
                      </div>
                    </div>
                  </div>

                  {/* Relatório de Alterações */}
                  {!isAtiva && (
                    <div>
                      <span className="text-slate-500 block mb-1 font-bold uppercase text-[10px]">
                        Observações / Ocorrências
                      </span>
                      <div className="bg-amber-50/70 border border-amber-200 p-3 rounded-xl text-slate-800 font-medium whitespace-pre-line text-xs">
                        {infoRelatorio.obs}
                      </div>
                    </div>
                  )}

                  {/* BOTÃO EXCLUSIVO DE BAIXAR EM PDF (SE FINALIZADA) */}
                  {!isAtiva && (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleBaixarPDF(cautelaVisualizando, nomeArmeiro)
                        }
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-all shadow-md text-xs"
                      >
                        <span>📥 Baixar Comprovante em PDF</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* RODAPÉ */}
                <div className="flex items-center justify-between pt-4 border-t gap-2">
                  <div>
                    {isMaster && (
                      <button
                        type="button"
                        onClick={() =>
                          handleExcluirCautela(cautelaVisualizando)
                        }
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-lg text-xs"
                      >
                        🗑️ Excluir
                      </button>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setCautelaVisualizando(null)}
                      className="px-4 py-2 bg-slate-100 text-slate-600 hover:bg-slate-200 font-bold rounded-xl text-xs transition-all"
                    >
                      Fechar
                    </button>

                    {isAtiva && isArmeiro && (
                      <button
                        type="button"
                        onClick={() =>
                          handleIniciarDevolucaoFromModal(cautelaVisualizando)
                        }
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md transition-all flex items-center space-x-1"
                      >
                        <span>🔄 Dar Início à Devolução</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      {/* MODAL 2: CHECKLIST DE DEVOLUÇÃO */}
      {cautelaDevolvendo && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 font-sans">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-800">
              Conferência de Devolução Bélica
            </h2>
            <p className="text-xs text-slate-500">
              Faça o checklist dos itens devolvidos pelo policial antes de
              liberar o armamento de volta ao estoque.
            </p>

            <form
              onSubmit={handleConfirmarDevolucao}
              className="space-y-4 text-xs"
            >
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                <div className="font-bold text-slate-800">
                  Militar: {cautelaDevolvendo.policial?.posto_graduacao}{" "}
                  {cautelaDevolvendo.policial?.nome_guerra}
                </div>
                <div className="text-slate-600 font-mono">
                  Matrícula: {cautelaDevolvendo.policial?.matricula}
                </div>
              </div>

              <div className="space-y-2 border-t pt-3">
                <span className="font-bold text-slate-700 uppercase block mb-1">
                  Checklist de Recebimento
                </span>

                <label className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checkArma}
                    onChange={(e) => setCheckArma(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded"
                  />
                  <span className="font-medium text-slate-800">
                    Armamento Principal:{" "}
                    <strong>
                      {
                        cautelaDevolvendo.cautela_itens?.[0]?.equipamento
                          ?.modelo_descricao
                      }{" "}
                      (
                      {
                        cautelaDevolvendo.cautela_itens?.[0]?.equipamento
                          ?.num_serie
                      }
                      )
                    </strong>
                  </span>
                </label>

                <label className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checkCarregadores}
                    onChange={(e) => setCheckCarregadores(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded"
                  />
                  <span className="font-medium text-slate-800">
                    Carregadores:{" "}
                    <strong>
                      {
                        cautelaDevolvendo.cautela_itens?.[0]
                          ?.quantidade_carregadores
                      }{" "}
                      unidade(s)
                    </strong>
                  </span>
                </label>

                <label className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checkMunicao}
                    onChange={(e) => setCheckMunicao(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded"
                  />
                  <span className="font-medium text-slate-800">
                    Munições:{" "}
                    <strong>
                      {cautelaDevolvendo.cautela_itens?.[0]?.quantidade_municao}{" "}
                      (
                      {cautelaDevolvendo.cautela_itens?.[0]?.tipo_municao ||
                        "N/I"}
                      )
                    </strong>
                  </span>
                </label>
              </div>

              <div className="border-t pt-3">
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Alterações / Ocorrências (Opcional)
                </label>
                <textarea
                  rows="3"
                  value={campoAlteracoes}
                  onChange={(e) => setCampoAlteracoes(e.target.value)}
                  placeholder="Ex: Disparos efetuados, avaria no carregador, perda de munição..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setCautelaDevolvendo(null)}
                  className="px-3 py-2 bg-slate-100 text-slate-600 font-bold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={processando}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow transition-all disabled:opacity-50"
                >
                  {processando ? "Devolvendo..." : "Homologar Devolução"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
