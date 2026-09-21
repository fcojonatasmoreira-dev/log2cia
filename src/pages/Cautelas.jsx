import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import {
  Search,
  Filter,
  Calendar,
  UserCheck,
  Plus,
  Eye,
  RefreshCw,
  FileText,
  Trash2,
  X,
} from "lucide-react";

export default function Cautelas() {
  const navigate = useNavigate();

  const [cautelas, setCautelas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);

  // Perfil unificado do usuário logado via localStorage ('log2cia_user')
  const [userRole, setUserRole] = useState("policial");
  const [userName, setUserName] = useState("Militar");
  const [userId, setUserId] = useState(null);

  // Estados dos Filtros de Busca
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroDataInicio, setFiltroDataInicio] = useState("");
  const [filtroDataFim, setFiltroDataFim] = useState("");
  const [somenteMinhas, setSomenteMinhas] = useState(false);

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
    carregarSessaoEData();
  }, []);

  async function carregarSessaoEData() {
    setLoading(true);
    try {
      let roleLida = "policial";
      let matriculaLogada = null;
      let nomeLido = "Militar";

      const usuarioSalvo = localStorage.getItem("log2cia_user");
      if (usuarioSalvo) {
        const dadosUser = JSON.parse(usuarioSalvo);
        roleLida = String(dadosUser?.role || "policial").toLowerCase();
        nomeLido =
          dadosUser?.nome_guerra || dadosUser?.nome_completo || "Militar";
        matriculaLogada = dadosUser?.matricula;

        setUserRole(roleLida);
        setUserName(nomeLido);
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setCurrentUser(user);
      }

      let policialIdEncontrado = null;
      if (matriculaLogada) {
        const { data: polData } = await supabase
          .from("policiais")
          .select("id")
          .eq("matricula", matriculaLogada)
          .maybeSingle();
        if (polData) policialIdEncontrado = polData.id;
      }

      if (!policialIdEncontrado && user) {
        const { data: polData } = await supabase
          .from("policiais")
          .select("id")
          .eq("id", user.id)
          .maybeSingle();
        if (polData) policialIdEncontrado = polData.id;
      }

      setUserId(policialIdEncontrado);

      const temAcessoTotal = ["master", "p4", "armeiro"].includes(roleLida);
      await carregarCautelas(temAcessoTotal, policialIdEncontrado);
    } catch (err) {
      console.error("Erro ao carregar dados:", err.message);
    } finally {
      setLoading(false);
    }
  }

  async function carregarCautelas(acessoTotal, policialId) {
    try {
      let query = supabase
        .from("cautelas")
        .select(
          `
          id,
          status,
          status_aceite,
          data_cautela,
          data_devolucao,
          alteracoes,
          armeiro_id,
          policial_id,
          policial:policiais!policial_id (
            id,
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

      if (!acessoTotal) {
        if (policialId) {
          query = query.eq("policial_id", policialId);
        } else {
          setCautelas([]);
          return;
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      if (data) {
        setCautelas(data);
      }
    } catch (err) {
      console.error("Erro crítico ao carregar cautelas:", err.message);
    }
  }

  const handleAceitarCautela = async (cautelaId) => {
    setProcessando(true);
    try {
      const { error } = await supabase
        .from("cautelas")
        .update({ status_aceite: "aceito" })
        .eq("id", cautelaId);

      if (error) throw error;

      alert("Cautela aceita com sucesso!");
      const temAcessoTotal = ["master", "p4", "armeiro"].includes(userRole);
      await carregarCautelas(temAcessoTotal, userId);

      if (cautelaVisualizando && cautelaVisualizando.id === cautelaId) {
        setCautelaVisualizando((prev) => ({
          ...prev,
          status_aceite: "aceito",
        }));
      }
    } catch (err) {
      alert("Erro ao aceitar cautela: " + err.message);
    } finally {
      setProcessando(false);
    }
  };

  const handleCancelarCautelaPendente = async (cautela) => {
    if (
      !window.confirm(
        "Deseja realmente cancelar esta cautela pendente? O armamento voltará a ficar disponível.",
      )
    ) {
      return;
    }

    setProcessando(true);
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

      if (numSerie) {
        await supabase
          .from("equipamentos")
          .update({ status: "disponivel" })
          .eq("num_serie", numSerie);
      }

      alert("Cautela cancelada com sucesso!");
      setCautelaVisualizando(null);
      const temAcessoTotal = ["master", "p4", "armeiro"].includes(userRole);
      await carregarCautelas(temAcessoTotal, userId);
    } catch (err) {
      alert("Erro ao cancelar cautela: " + err.message);
    } finally {
      setProcessando(false);
    }
  };

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
      const temAcessoTotal = ["master", "p4", "armeiro"].includes(userRole);
      carregarCautelas(temAcessoTotal, userId);
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

  const handleBaixarPDF = async (cautela, nomeArmeiro) => {
    const pol = cautela.policial || {};
    const item = cautela.cautela_itens?.[0] || {};
    const eq = item.equipamento || {};
    const infoRelatorio = parseRelatorio(cautela.alteracoes);
    const dataHoraEmissao = new Date().toLocaleString("pt-BR");

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

    const opt = {
      margin: 10,
      filename: `Termo_Devolucao_${pol.nome_guerra || "Militar"}_${eq.num_serie || "Serie"}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    };

    try {
      const html2pdf = (await import("html2pdf.js")).default;
      html2pdf().set(opt).from(element).save();
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
      alert("Falha ao gerar PDF automaticamente.");
    }
  };

  const isMaster = userRole === "master";
  const isArmeiro = isMaster || userRole === "armeiro" || userRole === "p4";

  // Lógica de Filtragem Local Instantânea
  const cautelasFiltradas = cautelas.filter((c) => {
    const pol = c.policial || {};
    const nomeGuerra = String(pol.nome_guerra || "").toLowerCase();
    const matricula = String(pol.matricula || "").toLowerCase();
    const termo = filtroTexto.toLowerCase();

    const matchTexto =
      !filtroTexto || nomeGuerra.includes(termo) || matricula.includes(termo);

    let matchStatus = true;
    if (filtroStatus === "ativa") matchStatus = c.status === "ativa";
    if (filtroStatus === "finalizada") matchStatus = c.status === "finalizada";
    if (filtroStatus === "pendente")
      matchStatus = c.status_aceite === "pendente";

    const matchMinhas = !somenteMinhas || (userId && pol.id === userId);

    let matchData = true;
    if (c.data_cautela) {
      const dataCautelaStr = c.data_cautela.split("T")[0];
      if (filtroDataInicio && dataCautelaStr < filtroDataInicio)
        matchData = false;
      if (filtroDataFim && dataCautelaStr > filtroDataFim) matchData = false;
    }

    return matchTexto && matchStatus && matchMinhas && matchData;
  });

  return (
    <div className="space-y-6 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isArmeiro
              ? "Controle de Cautelas e Devoluções"
              : "Minhas Cautelas"}
          </h1>
          <p className="text-sm text-slate-500">
            {isArmeiro
              ? "Registro de saída e devolução homologada de material bélico."
              : "Acompanhe seus armamentos acautelados e confirme o recebimento."}
          </p>
        </div>

        {isArmeiro && (
          <button
            type="button"
            onClick={() => navigate("/cautelas/nova")}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl shadow-md transition-all text-xs"
          >
            <Plus className="w-4 h-4" /> Nova Cautela
          </button>
        )}
      </div>

      {/* BARRA DE FILTROS REDESENHADA E MODERNA */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100 text-slate-800 font-bold text-xs uppercase tracking-wide">
          <Filter className="w-4 h-4 text-blue-600" />
          <span>Filtros e Localização de Cautelas</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          {/* Busca por Texto */}
          <div className="space-y-1.5 lg:col-span-1">
            <label className="block text-[11px] font-bold text-slate-600 uppercase">
              Policial / Matrícula
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={filtroTexto}
                onChange={(e) => setFiltroTexto(e.target.value)}
                placeholder="Nome ou Mat..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-800"
              />
            </div>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-slate-600 uppercase">
              Status
            </label>
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-800"
            >
              <option value="todos">Todos os Status</option>
              <option value="ativa">Em Cautela (Ativas)</option>
              <option value="finalizada">Devolvidas (Finalizadas)</option>
              <option value="pendente">Aguardando Aceite</option>
            </select>
          </div>

          {/* Data Início */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-slate-600 uppercase">
              Data Início
            </label>
            <div className="relative">
              <input
                type="date"
                value={filtroDataInicio}
                onChange={(e) => setFiltroDataInicio(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-800"
              />
            </div>
          </div>

          {/* Data Fim */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-slate-600 uppercase">
              Data Fim
            </label>
            <div className="relative">
              <input
                type="date"
                value={filtroDataFim}
                onChange={(e) => setFiltroDataFim(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-800"
              />
            </div>
          </div>

          {/* Checkbox / Botão Minhas Cautelas */}
          <div className="flex items-center h-9">
            {isArmeiro && (
              <label className="flex items-center gap-2.5 bg-blue-50/80 hover:bg-blue-100/60 border border-blue-200 px-3.5 py-2 rounded-xl cursor-pointer text-xs font-bold text-blue-900 transition-all w-full justify-center">
                <input
                  type="checkbox"
                  checked={somenteMinhas}
                  onChange={(e) => setSomenteMinhas(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <span className="truncate">Minhas Cautelas</span>
              </label>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500 text-center py-8">
          Carregando listagem de cautelas...
        </p>
      ) : (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[11px] font-semibold">
                <th className="p-3.5">Policial / Servidor</th>
                <th className="p-3.5">Itens Cautelados</th>
                <th className="p-3.5">Data Saída</th>
                <th className="p-3.5">Status / Aceite</th>
                <th className="p-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cautelasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-slate-400">
                    Nenhuma cautela encontrada com os filtros aplicados.
                  </td>
                </tr>
              ) : (
                cautelasFiltradas.map((c) => {
                  const pol = c.policial || {};
                  const isAtiva = c.status === "ativa";
                  const statusAceite = c.status_aceite || "pendente";
                  const isMeuRegistro = userId && pol.id === userId;

                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="p-3.5">
                        <span className="font-bold text-slate-800 block text-xs">
                          {pol.posto_graduacao} {pol.nome_guerra || "N/I"}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          Matrícula: {pol.matricula || "N/I"}
                        </span>
                      </td>

                      <td className="p-3.5 space-y-1">
                        {c.cautela_itens && c.cautela_itens.length > 0 ? (
                          c.cautela_itens.map((ci) => {
                            const eq = ci.equipamento || {};
                            return (
                              <div
                                key={ci.id}
                                className="bg-slate-50 p-2 rounded-xl border border-slate-100"
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

                      <td className="p-3.5 text-slate-600 text-xs font-medium">
                        {c.data_cautela
                          ? new Date(c.data_cautela).toLocaleString("pt-BR")
                          : "N/A"}
                      </td>

                      <td className="p-3.5 space-y-1.5">
                        <div>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              isAtiva
                                ? "bg-amber-100 text-amber-800"
                                : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {isAtiva ? "• Em Cautela" : "✓ Devolvido"}
                          </span>
                        </div>
                        <div>
                          <span
                            className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                              statusAceite === "aceito"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-orange-100 text-orange-800"
                            }`}
                          >
                            {statusAceite === "aceito"
                              ? "Aceito pelo Militar"
                              : "Aguardando Aceite"}
                          </span>
                        </div>
                      </td>

                      <td className="p-3.5 text-right space-x-1">
                        {isAtiva &&
                          statusAceite === "pendente" &&
                          isMeuRegistro && (
                            <button
                              onClick={() => handleAceitarCautela(c.id)}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-all shadow-xs"
                            >
                              ✓ Aceitar Cautela
                            </button>
                          )}
                        <button
                          onClick={() => setCautelaVisualizando(c)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all border border-slate-200 shadow-xs inline-flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" /> Visualizar
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
          const statusAceite = cautelaVisualizando.status_aceite || "pendente";
          const infoRelatorio = parseRelatorio(cautelaVisualizando.alteracoes);
          const nomeArmeiro = userName;
          const isOwnerPolicial =
            userId && cautelaVisualizando.policial?.id === userId;

          return (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans">
              <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
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
                  {isAtiva && statusAceite === "pendente" && (
                    <div className="p-3 bg-orange-50 border border-orange-200 text-orange-800 rounded-xl flex items-center justify-between">
                      <span>
                        ⚠️ Esta cautela aguarda o aceite do policial
                        responsável.
                      </span>
                      {isOwnerPolicial && (
                        <button
                          type="button"
                          onClick={() =>
                            handleAceitarCautela(cautelaVisualizando.id)
                          }
                          className="px-3 py-1 bg-blue-600 text-white font-bold rounded-lg text-xs hover:bg-blue-700 shrink-0 ml-2"
                        >
                          Aceitar Agora
                        </button>
                      )}
                    </div>
                  )}

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

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
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

                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
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

                  {!isAtiva && (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleBaixarPDF(cautelaVisualizando, nomeArmeiro)
                        }
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-all shadow-md text-xs"
                      >
                        <FileText className="w-4 h-4" />{" "}
                        <span>Baixar Comprovante em PDF</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-100 gap-2">
                  <div>
                    {isAtiva && statusAceite === "pendente" && isArmeiro && (
                      <button
                        type="button"
                        onClick={() =>
                          handleCancelarCautelaPendente(cautelaVisualizando)
                        }
                        className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl text-xs transition-all border border-rose-200 flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" /> Cancelar Cautela
                      </button>
                    )}

                    {isMaster && !isAtiva && (
                      <button
                        type="button"
                        onClick={() =>
                          handleExcluirCautela(cautelaVisualizando)
                        }
                        className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl text-xs flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Excluir
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

                    {isAtiva && isArmeiro && statusAceite === "aceito" && (
                      <button
                        type="button"
                        onClick={() =>
                          handleIniciarDevolucaoFromModal(cautelaVisualizando)
                        }
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md transition-all flex items-center gap-1"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />{" "}
                        <span>Dar Início à Devolução</span>
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
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans">
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

              <div className="space-y-2 border-t pt-3 border-slate-100">
                <span className="font-bold text-slate-700 uppercase block mb-1">
                  Checklist de Recebimento
                </span>

                <label className="flex items-center gap-2.5 p-2.5 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
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

                <label className="flex items-center gap-2.5 p-2.5 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
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

                <label className="flex items-center gap-2.5 p-2.5 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
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

              <div className="border-t pt-3 border-slate-100">
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Alterações / Ocorrências (Opcional)
                </label>
                <textarea
                  rows="3"
                  value={campoAlteracoes}
                  onChange={(e) => setCampoAlteracoes(e.target.value)}
                  placeholder="Ex: Disparos efetuados, avaria no carregador, perda de munição..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCautelaDevolvendo(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-600 font-bold rounded-xl"
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
