import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import {
  Search,
  Filter,
  Plus,
  Eye,
  RefreshCw,
  FileText,
  Trash2,
  Edit3,
  X,
  Loader2,
} from "lucide-react";

export default function Cautelas() {
  const navigate = useNavigate();

  const [cautelas, setCautelas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);

  const [userRole, setUserRole] = useState("policial");
  const [userName, setUserName] = useState("Militar");
  const [userId, setUserId] = useState(null);

  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroDataInicio, setFiltroDataInicio] = useState("");
  const [filtroDataFim, setFiltroDataFim] = useState("");
  const [somenteMinhas, setSomenteMinhas] = useState(false);

  const [cautelaVisualizando, setCautelaVisualizando] = useState(null);
  const [cautelaDevolvendo, setCautelaDevolvendo] = useState(null);
  const [cautelaEditando, setCautelaEditando] = useState(null);
  const [equipamentosDisponiveis, setEquipamentosDisponiveis] = useState([]);
  const [processando, setProcessando] = useState(false);
  const [baixandoPdfId, setBaixandoPdfId] = useState(null); // Estado para controlar o spinner do PDF

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
        roleLida = String(dadosUser?.role || "policial")
          .trim()
          .toLowerCase();
        nomeLido =
          dadosUser?.nome_guerra || dadosUser?.nome_completo || "Militar";
        matriculaLogada = dadosUser?.matricula;

        setUserRole(roleLida);
        setUserName(nomeLido);
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) setCurrentUser(user);

      let policialIdEncontrado = null;
      if (matriculaLogada) {
        const { data: polData } = await supabase
          .from("policiais")
          .select("id")
          .eq("matricula", matriculaLogada)
          .maybeSingle();
        if (polData) policialIdEncontrado = polData.id;
      }

      setUserId(policialIdEncontrado);

      const temAcessoTotal = ["master", "p4", "armeiro"].includes(roleLida);
      await carregarCautelas(temAcessoTotal, policialIdEncontrado);
      await carregarEquipamentosDisponiveis();
    } catch (err) {
      console.error("Erro ao carregar dados:", err.message);
    } finally {
      setLoading(false);
    }
  }

  async function carregarEquipamentosDisponiveis() {
    try {
      const { data, error } = await supabase
        .from("equipamentos")
        .select("id, tipo, modelo_descricao, num_serie, status")
        .eq("status", "disponivel");
      if (error) throw error;
      if (data) setEquipamentosDisponiveis(data);
    } catch (err) {
      console.error("Erro ao carregar equipamentos disponíveis:", err.message);
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
          hash_emissao,
          hash_aceite,
          hash_devolucao,
          armeiro_id,
          armeiro_baixa_id,
          policial_id,
          cautela_itens (
            id,
            quantidade_municao,
            tipo_municao,
            quantidade_carregadores,
            equipamento_id,
            equipamento:equipamentos (
              id,
              tipo,
              modelo_descricao,
              num_serie,
              status
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
          setLoading(false);
          return;
        }
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data) {
        const { data: policiaisData } = await supabase
          .from("policiais")
          .select("id, posto_graduacao, nome_guerra, matricula");
        const mapPoliciais = {};
        if (policiaisData) {
          policiaisData.forEach((p) => {
            mapPoliciais[p.id] = p;
          });
        }

        const dadosEnriquecidos = data.map((c) => ({
          ...c,
          policial: mapPoliciais[c.policial_id] || null,
          armeiro: mapPoliciais[c.armeiro_id] || null,
          armeiro_baixa: mapPoliciais[c.armeiro_baixa_id] || null,
        }));

        setCautelas(dadosEnriquecidos);
      }
    } catch (err) {
      console.error("Erro crítico ao carregar cautelas:", err.message);
    } finally {
      setLoading(false);
    }
  }

  const gerarHashEtapa = async (
    cautelaId,
    identificadorAtor,
    etapa,
    dataStr,
  ) => {
    try {
      const msg = `LOG2CIA-AUDIT-${etapa}-${cautelaId}-${identificadorAtor}-${dataStr}`;
      const msgBuffer = new TextEncoder().encode(msg);
      const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
      return hashHex;
    } catch (e) {
      return `HASH-FALLBACK-${etapa}-${Date.now().toString(16).toUpperCase()}`;
    }
  };

  const handleAceitarCautela = async (cautelaObj) => {
    setProcessando(true);
    try {
      const dataHoraAtual = new Date().toISOString();
      const matriculaPolicial = cautelaObj.policial?.matricula || "MILITAR";
      const hashAceiteGerado = await gerarHashEtapa(
        cautelaObj.id,
        matriculaPolicial,
        "ACEITE",
        dataHoraAtual,
      );

      const { error } = await supabase
        .from("cautelas")
        .update({
          status_aceite: "aceito",
          hash_aceite: hashAceiteGerado,
        })
        .eq("id", cautelaObj.id);

      if (error) throw error;
      alert("Cautela aceita e validada eletronicamente com sucesso!");
      const temAcessoTotal = ["master", "p4", "armeiro"].includes(userRole);
      await carregarCautelas(temAcessoTotal, userId);

      if (cautelaVisualizando && cautelaVisualizando.id === cautelaObj.id) {
        setCautelaVisualizando((prev) => ({
          ...prev,
          status_aceite: "aceito",
          hash_aceite: hashAceiteGerado,
        }));
      }
    } catch (err) {
      alert("Erro ao aceitar cautela: " + err.message);
    } finally {
      setProcessando(false);
    }
  };

  const handleCancelarCautelaPendente = async (cautela) => {
    const isMaster = userRole === "master";
    const isArmeiroOrP4 = ["armeiro", "p4"].includes(userRole);
    const ehCautelaParaMim = userId && cautela.policial?.id === userId;

    if (!isMaster && (!isArmeiroOrP4 || ehCautelaParaMim)) {
      alert(
        "Acesso negado: Você não tem permissão para cancelar esta cautela.",
      );
      return;
    }

    if (
      !window.confirm(
        "Deseja realmente cancelar esta cautela pendente? O armamento voltará a ficar disponível.",
      )
    )
      return;

    setProcessando(true);
    try {
      const equipamentoIdAntigo = cautela.cautela_itens?.[0]?.equipamento?.id;
      await supabase
        .from("cautela_itens")
        .delete()
        .eq("cautela_id", cautela.id);
      const { error } = await supabase
        .from("cautelas")
        .delete()
        .eq("id", cautela.id);
      if (error) throw error;

      if (equipamentoIdAntigo) {
        await supabase
          .from("equipamentos")
          .update({ status: "disponivel" })
          .eq("id", equipamentoIdAntigo);
      }

      alert("Cautela cancelada com sucesso!");
      setCautelaVisualizando(null);
      const temAcessoTotal = ["master", "p4", "armeiro"].includes(userRole);
      await carregarCautelas(temAcessoTotal, userId);
      await carregarEquipamentosDisponiveis();
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
      let armeiroBaixaIdFinal = userId;
      let matriculaArmeiroBaixa = "ARMEIRO";

      const usuarioSalvo = localStorage.getItem("log2cia_user");
      if (usuarioSalvo) {
        const dadosUser = JSON.parse(usuarioSalvo);
        if (dadosUser?.matricula) matriculaArmeiroBaixa = dadosUser.matricula;
      }

      if (!armeiroBaixaIdFinal && usuarioSalvo) {
        const dadosUser = JSON.parse(usuarioSalvo);
        if (dadosUser?.matricula) {
          const { data: polData } = await supabase
            .from("policiais")
            .select("id")
            .eq("matricula", dadosUser.matricula)
            .maybeSingle();
          if (polData) armeiroBaixaIdFinal = polData.id;
        }
      }

      const equipamentoId =
        cautelaDevolvendo.cautela_itens?.[0]?.equipamento?.id;
      const dataHoraAtual = new Date().toISOString();
      const checklistStatus = `ARMA:${checkArma ? "OK" : "NOK"}|CARREGADORES:${checkCarregadores ? "OK" : "NOK"}|MUNICAO:${checkMunicao ? "OK" : "NOK"}`;
      const relatorioFormatado = `${checklistStatus} | OBS:${campoAlteracoes ? campoAlteracoes.trim() : "Sem alterações"}`;

      const hashDevolucaoGerado = await gerarHashEtapa(
        cautelaDevolvendo.id,
        matriculaArmeiroBaixa,
        "DEVOLUCAO",
        dataHoraAtual,
      );

      const dadosUpdate = {
        status: "finalizada",
        data_devolucao: dataHoraAtual,
        alteracoes: relatorioFormatado,
        hash_devolucao: hashDevolucaoGerado,
      };

      if (armeiroBaixaIdFinal) {
        dadosUpdate.armeiro_baixa_id = armeiroBaixaIdFinal;
      }

      const { error: errCautela } = await supabase
        .from("cautelas")
        .update(dadosUpdate)
        .eq("id", cautelaDevolvendo.id);

      if (errCautela) throw errCautela;

      if (equipamentoId) {
        await supabase
          .from("equipamentos")
          .update({ status: "disponivel" })
          .eq("id", equipamentoId);
      }

      setCautelaDevolvendo(null);
      alert(
        "Ok, devolução homologada com sucesso! O armamento voltou a ficar disponível.",
      );
      const temAcessoTotal = ["master", "p4", "armeiro"].includes(userRole);
      await carregarCautelas(temAcessoTotal, userId);
      await carregarEquipamentosDisponiveis();
    } catch (err) {
      alert("Erro ao homologar devolução: " + err.message);
    } finally {
      setProcessando(false);
    }
  };

  const handleExcluirCautela = async (cautela) => {
    if (userRole !== "master") {
      alert("Acesso restrito ao perfil Master.");
      return;
    }

    if (
      !window.confirm(
        "Atenção: Deseja realmente excluir este registro de cautela? O armamento voltará a ficar disponível.",
      )
    )
      return;

    try {
      const equipamentoId = cautela.cautela_itens?.[0]?.equipamento?.id;
      await supabase
        .from("cautela_itens")
        .delete()
        .eq("cautela_id", cautela.id);
      const { error } = await supabase
        .from("cautelas")
        .delete()
        .eq("id", cautela.id);
      if (error) throw error;

      if (equipamentoId && cautela.status === "ativa") {
        await supabase
          .from("equipamentos")
          .update({ status: "disponivel" })
          .eq("id", equipamentoId);
      }

      setCautelaVisualizando(null);
      alert("Cautela excluída com sucesso!");
      const temAcessoTotal = ["master", "p4", "armeiro"].includes(userRole);
      await carregarCautelas(temAcessoTotal, userId);
      await carregarEquipamentosDisponiveis();
    } catch (err) {
      alert("Erro ao excluir cautela: " + err.message);
    }
  };

  const handleSalvarEdicao = async (e) => {
    e.preventDefault();
    if (!cautelaEditando) return;
    setProcessando(true);

    try {
      const itemAtual = cautelaEditando.cautela_itens[0] || {};
      const novoEquipamentoId = itemAtual.equipamento_id;
      const equipamentoAntigoId = cautelaEditando.equipamentoAntigoId;

      const { error: errItem } = await supabase
        .from("cautela_itens")
        .update({
          equipamento_id: novoEquipamentoId || null,
          quantidade_carregadores:
            Number(itemAtual.quantidade_carregadores) || 0,
          quantidade_municao: Number(itemAtual.quantidade_municao) || 0,
          tipo_municao: itemAtual.tipo_municao || "",
        })
        .eq("id", itemAtual.id);

      if (errItem) throw errItem;

      if (
        equipamentoAntigoId &&
        novoEquipamentoId &&
        equipamentoAntigoId !== novoEquipamentoId
      ) {
        await supabase
          .from("equipamentos")
          .update({ status: "disponivel" })
          .eq("id", equipamentoAntigoId);
        await supabase
          .from("equipamentos")
          .update({ status: "cautelado" })
          .eq("id", novoEquipamentoId);
      }

      alert("Cautela atualizada com sucesso!");
      setCautelaEditando(null);
      const temAcessoTotal = ["master", "p4", "armeiro"].includes(userRole);
      await carregarCautelas(temAcessoTotal, userId);
      await carregarEquipamentosDisponiveis();
    } catch (err) {
      alert("Erro ao atualizar cautela: " + err.message);
    } finally {
      setProcessando(false);
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

  // FUNÇÃO DE GERAR PDF COM SPINNER E TEMPO DE ESPERA VISUAL
  const handleBaixarPDF = async (
    cautela,
    nomeArmeiroSaida,
    nomeArmeiroBaixa,
  ) => {
    setBaixandoPdfId(cautela.id);

    try {
      const pol = cautela.policial || {};
      const item = cautela.cautela_itens?.[0] || {};
      const eq = item.equipamento || {};
      const isAtiva = cautela.status === "ativa";
      const dataCautelaFormatada = cautela.data_cautela
        ? new Date(cautela.data_cautela).toLocaleString("pt-BR")
        : "N/I";
      const dataDevolucaoFormatada = cautela.data_devolucao
        ? new Date(cautela.data_devolucao).toLocaleString("pt-BR")
        : "Pendente (Em Cautela)";
      const dataHoraEmissao = new Date().toLocaleString("pt-BR");
      const infoRelatorio = parseRelatorio(cautela.alteracoes);

      let hashEmissaoShow = cautela.hash_emissao || "Aguardando selo";
      let hashAceiteShow = cautela.hash_aceite || "Aguardando aceite";
      let hashDevolucaoShow = cautela.hash_devolucao || "Aguardando baixa";

      const element = document.createElement("div");
      element.innerHTML = `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #0f172a; line-height: 1.4; background: #ffffff; font-size: 10.5px;">
          <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px;">
            <h1 style="margin: 0; font-size: 13px; text-transform: uppercase; font-weight: bold;">POLÍCIA MILITAR DO CEARÁ</h1>
            <h2 style="margin: 2px 0; font-size: 10px; color: #334155; font-weight: normal;">6º CRPM • 15º BATALHÃO • 2ª COMPANHIA</h2>
            <h3 style="margin-top: 5px; font-size: 11px; font-weight: bold; text-transform: uppercase; background: #f1f5f9; padding: 3px; border: 1px solid #cbd5e1;">TERMO DE CAUTELA</h3>
          </div>

          <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 5px; padding: 8px; margin-bottom: 8px;">
            <div style="font-weight: bold; text-transform: uppercase; margin-bottom: 3px; color: #1e293b; font-size: 9.5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px;">1. Dados do Policial / Servidor</div>
            <div><strong>Militar:</strong> ${pol.posto_graduacao || ""} ${pol.nome_guerra || "N/I"} (${pol.nome_completo || ""})</div>
            <div><strong>Matrícula:</strong> ${pol.matricula || "N/I"}</div>
          </div>

          <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 5px; padding: 8px; margin-bottom: 8px;">
            <div style="font-weight: bold; text-transform: uppercase; margin-bottom: 3px; color: #1e293b; font-size: 9.5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px;">2. Período e Responsáveis (Operação)</div>
            <div><strong>Data/Hora Cautela (Saída):</strong> ${dataCautelaFormatada} | <strong>Armeiro Saída:</strong> ${nomeArmeiroSaida}</div>
            <div><strong>Data/Hora Devolução:</strong> ${dataDevolucaoFormatada} | <strong>Armeiro Baixa:</strong> ${isAtiva ? "Pendente" : nomeArmeiroBaixa}</div>
            <div><strong>Status Atual:</strong> ${isAtiva ? "EM CAUTELA (Ativa)" : "DEVOLVIDO (Finalizada)"}</div>
          </div>

          <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 5px; padding: 8px; margin-bottom: 8px;">
            <div style="font-weight: bold; text-transform: uppercase; margin-bottom: 3px; color: #1e293b; font-size: 9.5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px;">3. Material Bélico Acautelado</div>
            <div><strong>Tipo / Modelo:</strong> ${eq.tipo?.toUpperCase() || "ARMAMENTO"} - ${eq.modelo_descricao || "N/I"}</div>
            <div><strong>Número de Série:</strong> ${eq.num_serie || "N/I"}</div>
            <div><strong>Acessórios:</strong> ${item.quantidade_carregadores || 0} carregador(es) | ${item.quantidade_municao || 0} munição(ões) calibre ${item.tipo_municao || "N/I"}</div>
          </div>

          <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 5px; padding: 8px; margin-bottom: 10px;">
            <div style="font-weight: bold; text-transform: uppercase; margin-bottom: 3px; color: #1e293b; font-size: 9.5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px;">4. Conferência / Avarias</div>
            <div>${infoRelatorio.obs}</div>
          </div>

          <!-- Trilha de Auditoria Completa apenas no PDF -->
          <div style="border: 1px solid #94a3b8; background: #f1f5f9; border-radius: 5px; padding: 8px; font-size: 9px; color: #1e293b; margin-top: 10px;">
            <p style="margin: 0 0 4px 0; font-weight: bold; text-transform: uppercase;">Trilha de Auditoria (Lei 14.063/2020):</p>
            <div style="margin-bottom: 3px; font-family: monospace;">• <strong>Emissão (Saída):</strong> ${hashEmissaoShow}</div>
            <div style="margin-bottom: 3px; font-family: monospace;">• <strong>Aceite (Policial):</strong> ${hashAceiteShow}</div>
            <div style="font-family: monospace;">• <strong>Devolução (Baixa):</strong> ${hashDevolucaoShow}</div>
          </div>

          <div style="margin-top: 15px; text-align: center; font-size: 9px; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 6px;">
            <p style="margin: 2px 0;">Documento gerado eletronicamente em ${dataHoraEmissao} • Sistema Log2CIA</p>
          </div>
        </div>
      `;

      const opt = {
        margin: 8,
        filename: `Comprovante_Cautela_${pol.nome_guerra || "Militar"}_${eq.num_serie || "Serie"}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      };

      const html2pdf = (await import("html2pdf.js")).default;

      // Pequeno tempo de espera fluido para exibição elegante do spinner
      await new Promise((resolve) => setTimeout(resolve, 800));
      await html2pdf().set(opt).from(element).save();
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
      alert("Falha ao gerar PDF.");
    } finally {
      setBaixandoPdfId(null);
    }
  };

  const isMaster = userRole === "master";
  const isArmeiroOrP4 = ["master", "armeiro", "p4"].includes(userRole);

  const cautelasFiltradas = cautelas.filter((c) => {
    const pol = c.policial || {};
    let matchTexto = true;
    let matchStatus = true;

    if (isArmeiroOrP4) {
      const nomeGuerra = String(pol.nome_guerra || "").toLowerCase();
      const matricula = String(pol.matricula || "").toLowerCase();
      const termo = filtroTexto.toLowerCase();

      matchTexto =
        !filtroTexto || nomeGuerra.includes(termo) || matricula.includes(termo);

      if (filtroStatus === "ativa") matchStatus = c.status === "ativa";
      if (filtroStatus === "finalizada")
        matchStatus = c.status === "finalizada";
      if (filtroStatus === "pendente")
        matchStatus = c.status_aceite === "pendente";
    }

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
            {isArmeiroOrP4
              ? "Controle de Cautelas e Devoluções"
              : "Minhas Cautelas"}
          </h1>
          <p className="text-sm text-slate-500">
            {isArmeiroOrP4
              ? "Registro de saída e devolução homologada de material bélico."
              : "Acompanhe seus armamentos acautelados."}
          </p>
        </div>

        {isArmeiroOrP4 && (
          <button
            type="button"
            onClick={() => navigate("/cautelas/nova")}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl shadow-md transition-all text-xs"
          >
            <Plus className="w-4 h-4" /> Nova Cautela
          </button>
        )}
      </div>

      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100 text-slate-800 font-bold text-xs uppercase tracking-wide">
          <Filter className="w-4 h-4 text-blue-600" />
          <span>
            {isArmeiroOrP4
              ? "Filtros e Localização de Cautelas"
              : "Filtrar por Período"}
          </span>
        </div>

        <div
          className={`grid grid-cols-1 sm:grid-cols-2 ${isArmeiroOrP4 ? "lg:grid-cols-5" : "lg:grid-cols-2"} gap-4 items-end`}
        >
          {isArmeiroOrP4 && (
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
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                />
              </div>
            </div>
          )}

          {isArmeiroOrP4 && (
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-600 uppercase">
                Status
              </label>
              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
              >
                <option value="todos">Todos os Status</option>
                <option value="ativa">Em Cautela (Ativas)</option>
                <option value="finalizada">Devolvidas (Finalizadas)</option>
                <option value="pendente">Aguardando Aceite</option>
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-slate-600 uppercase">
              Data Início
            </label>
            <input
              type="date"
              value={filtroDataInicio}
              onChange={(e) => setFiltroDataInicio(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-slate-600 uppercase">
              Data Fim
            </label>
            <input
              type="date"
              value={filtroDataFim}
              onChange={(e) => setFiltroDataFim(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
            />
          </div>

          {isArmeiroOrP4 && (
            <div className="flex items-center h-9">
              <label className="flex items-center gap-2.5 bg-blue-50/80 hover:bg-blue-100/60 border border-blue-200 px-3.5 py-2 rounded-xl cursor-pointer text-xs font-bold text-blue-900 transition-all w-full justify-center">
                <input
                  type="checkbox"
                  checked={somenteMinhas}
                  onChange={(e) => setSomenteMinhas(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <span className="truncate">Minhas Cautelas</span>
              </label>
            </div>
          )}
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
                <th className="p-3.5">Armeiro Saída</th>
                <th className="p-3.5">Armeiro Baixa</th>
                <th className="p-3.5">Status / Aceite</th>
                <th className="p-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cautelasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-400">
                    Nenhuma cautela encontrada com os filtros aplicados.
                  </td>
                </tr>
              ) : (
                cautelasFiltradas.map((c) => {
                  const pol = c.policial || {};
                  const armeiroSaida = c.armeiro || {};
                  const armeiroBaixa = c.armeiro_baixa || {};
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
                          Mat: {pol.matricula || "N/I"}
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

                      <td className="p-3.5 text-xs text-slate-700">
                        <span className="font-bold block">
                          {armeiroSaida.nome_guerra
                            ? `${armeiroSaida.posto_graduacao || ""} ${armeiroSaida.nome_guerra}`
                            : "N/I"}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {c.data_cautela
                            ? new Date(c.data_cautela).toLocaleDateString(
                                "pt-BR",
                              )
                            : ""}
                        </span>
                      </td>

                      <td className="p-3.5 text-xs text-slate-700">
                        {isAtiva ? (
                          <span className="text-amber-600 font-medium italic">
                            Pendente (Em aberto)
                          </span>
                        ) : (
                          <>
                            <span className="font-bold block">
                              {armeiroBaixa.nome_guerra
                                ? `${armeiroBaixa.posto_graduacao || ""} ${armeiroBaixa.nome_guerra}`
                                : "Não registrado"}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {c.data_devolucao
                                ? new Date(c.data_devolucao).toLocaleDateString(
                                    "pt-BR",
                                  )
                                : ""}
                            </span>
                          </>
                        )}
                      </td>

                      <td className="p-3.5 space-y-1.5">
                        <div>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${isAtiva ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}
                          >
                            {isAtiva ? "• Em Cautela" : "✓ Devolvido"}
                          </span>
                        </div>
                        <div>
                          <span
                            className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${statusAceite === "aceito" ? "bg-blue-100 text-blue-800" : "bg-orange-100 text-orange-800"}`}
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
                              onClick={() => handleAceitarCautela(c)}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-all shadow-xs"
                            >
                              ✓ Aceitar
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

      {/* MODAL DE VISUALIZAÇÃO COM SPINNER NO BOTÃO DE BAIXAR PDF */}
      {cautelaVisualizando &&
        (() => {
          const isAtiva = cautelaVisualizando.status === "ativa";
          const statusAceite = cautelaVisualizando.status_aceite || "pendente";

          const armeiroSaidaObj = cautelaVisualizando.armeiro;
          const nomeArmeiroSaida = armeiroSaidaObj
            ? `${armeiroSaidaObj.posto_graduacao || ""} ${armeiroSaidaObj.nome_guerra || ""}`.trim()
            : "Não registrado";

          const armeiroBaixaObj = cautelaVisualizando.armeiro_baixa;
          const nomeArmeiroBaixa = armeiroBaixaObj
            ? `${armeiroBaixaObj.posto_graduacao || ""} ${armeiroBaixaObj.nome_guerra || ""}`.trim()
            : isAtiva
              ? "Pendente"
              : "Não registrado";

          const isOwnerPolicial =
            userId && cautelaVisualizando.policial?.id === userId;
          const eq = cautelaVisualizando.cautela_itens?.[0]?.equipamento || {};
          const item = cautelaVisualizando.cautela_itens?.[0] || {};

          const isLogadoArmeiroOrP4 = ["armeiro", "p4"].includes(userRole);
          const ehCautelaParaMim =
            userId && cautelaVisualizando.policial?.id === userId;

          const podeCancelarOuGerenciar =
            isMaster || (isLogadoArmeiroOrP4 && !ehCautelaParaMim);
          const podeFazerDevolucao =
            isAtiva &&
            isArmeiroOrP4 &&
            statusAceite === "aceito" &&
            (isMaster || !ehCautelaParaMim);

          const estaBaixandoEste = baixandoPdfId === cautelaVisualizando.id;

          return (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans">
              <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-800">
                      Detalhes da Cautela
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Trilha de custódia e controle bélico
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold ${isAtiva ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}
                  >
                    {isAtiva ? "• Em Cautela" : "✓ Devolvido"}
                  </span>
                </div>

                <div className="space-y-3 text-xs">
                  {isAtiva && statusAceite === "pendente" && (
                    <div className="p-3 bg-orange-50 border border-orange-200 text-orange-800 rounded-xl flex items-center justify-between">
                      <span>⚠️ Esta cautela aguarda aceite digital.</span>
                      {isOwnerPolicial && (
                        <button
                          type="button"
                          onClick={() =>
                            handleAceitarCautela(cautelaVisualizando)
                          }
                          className="px-3 py-1 bg-blue-600 text-white font-bold rounded-lg text-xs hover:bg-blue-700 shrink-0 ml-2"
                        >
                          Aceitar Agora
                        </button>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">
                        Data de Cautela (Saída)
                      </span>
                      <span className="font-bold text-slate-800">
                        {cautelaVisualizando.data_cautela
                          ? new Date(
                              cautelaVisualizando.data_cautela,
                            ).toLocaleString("pt-BR")
                          : "N/I"}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">
                        Data de Devolução (Baixa)
                      </span>
                      <span
                        className={`font-bold ${isAtiva ? "text-amber-700 italic" : "text-emerald-700"}`}
                      >
                        {isAtiva
                          ? "Pendente"
                          : new Date(
                              cautelaVisualizando.data_devolucao,
                            ).toLocaleString("pt-BR")}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">
                        Armeiro (Saída)
                      </span>
                      <span className="font-bold text-slate-800 block">
                        {nomeArmeiroSaida}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">
                        Armeiro (Baixa)
                      </span>
                      <span className="font-bold text-slate-800 block">
                        {nomeArmeiroBaixa}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">
                      Policial responsável pela Cautela
                    </span>
                    <span className="font-bold text-slate-800 block text-sm">
                      {cautelaVisualizando.policial?.posto_graduacao}{" "}
                      {cautelaVisualizando.policial?.nome_guerra}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Matrícula:{" "}
                      {cautelaVisualizando.policial?.matricula || "N/I"}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">
                      Equipamento Cautelado
                    </span>
                    <div className="font-bold text-slate-800 pt-1">
                      {eq.tipo?.toUpperCase() || "ARMAMENTO"} -{" "}
                      {eq.modelo_descricao || "N/I"}
                    </div>
                    <div className="text-slate-600 font-mono text-[11px]">
                      Nº de Série: <strong>{eq.num_serie || "N/I"}</strong>
                    </div>
                    <div className="text-[11px] text-slate-500 pt-1">
                      Carregadores:{" "}
                      <strong>{item.quantidade_carregadores || 0}</strong> |
                      Munição: <strong>{item.quantidade_municao || 0}</strong> (
                      {item.tipo_municao || "N/I"})
                    </div>
                  </div>

                  {/* BOTÃO COM SPINNER E ESTADO DE CARREGAMENTO */}
                  <button
                    type="button"
                    disabled={estaBaixandoEste}
                    onClick={() =>
                      handleBaixarPDF(
                        cautelaVisualizando,
                        nomeArmeiroSaida,
                        nomeArmeiroBaixa,
                      )
                    }
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-700 text-white font-bold rounded-xl transition-all shadow-md text-xs cursor-pointer disabled:cursor-wait"
                  >
                    {estaBaixandoEste ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                        <span>Gerando Comprovante</span>
                      </>
                    ) : (
                      <>
                        <FileText className="w-4 h-4" />
                        <span>Baixar Comprovante</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-100 gap-2">
                  <div className="flex gap-2">
                    {podeCancelarOuGerenciar && (
                      <>
                        {isMaster && (
                          <button
                            type="button"
                            onClick={() => {
                              const copia = JSON.parse(
                                JSON.stringify(cautelaVisualizando),
                              );
                              copia.equipamentoAntigoId =
                                cautelaVisualizando.cautela_itens?.[0]?.equipamento?.id;
                              setCautelaVisualizando(null);
                              setCautelaEditando(copia);
                            }}
                            className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-xl text-xs border border-blue-200 flex items-center gap-1 shadow-xs"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> Editar
                          </button>
                        )}

                        {isMaster && (
                          <button
                            type="button"
                            onClick={() =>
                              handleExcluirCautela(cautelaVisualizando)
                            }
                            className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl text-xs border border-rose-200 flex items-center gap-1 shadow-xs"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Excluir
                          </button>
                        )}

                        {isAtiva && statusAceite === "pendente" && (
                          <button
                            type="button"
                            onClick={() =>
                              handleCancelarCautelaPendente(cautelaVisualizando)
                            }
                            className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl text-xs border border-rose-200 flex items-center gap-1"
                          >
                            <X className="w-3.5 h-3.5" /> Cancelar
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setCautelaVisualizando(null)}
                      className="px-4 py-2 bg-slate-100 text-slate-600 hover:bg-slate-200 font-bold rounded-xl text-xs"
                    >
                      Fechar
                    </button>
                    {podeFazerDevolucao && (
                      <button
                        type="button"
                        onClick={() =>
                          handleIniciarDevolucaoFromModal(cautelaVisualizando)
                        }
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md flex items-center gap-1"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />{" "}
                        <span>Devolução</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      {/* MODAL DE EDIÇÃO MASTER */}
      {cautelaEditando && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-base font-bold text-slate-800">
              Editar Cautela e Armamento (Master)
            </h2>
            <form onSubmit={handleSalvarEdicao} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Alterar Armamento Acautelado
                </label>
                <select
                  value={cautelaEditando.cautela_itens[0]?.equipamento_id || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCautelaEditando((prev) => ({
                      ...prev,
                      cautela_itens: [
                        {
                          ...prev.cautela_itens[0],
                          equipamento_id: val,
                        },
                      ],
                    }));
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">
                    -- Mantenha ou Selecione Novo Armamento --
                  </option>
                  {cautelaEditando.cautela_itens[0]?.equipamento && (
                    <option
                      value={cautelaEditando.cautela_itens[0].equipamento.id}
                    >
                      [Atual]{" "}
                      {cautelaEditando.cautela_itens[0].equipamento.tipo?.toUpperCase()}{" "}
                      -{" "}
                      {
                        cautelaEditando.cautela_itens[0].equipamento
                          .modelo_descricao
                      }{" "}
                      (Série:{" "}
                      {cautelaEditando.cautela_itens[0].equipamento.num_serie})
                    </option>
                  )}
                  {equipamentosDisponiveis.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.tipo?.toUpperCase()} - {eq.modelo_descricao} (Série:{" "}
                      {eq.num_serie})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Carregadores
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={
                      cautelaEditando.cautela_itens[0]
                        ?.quantidade_carregadores || 0
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      setCautelaEditando((prev) => ({
                        ...prev,
                        cautela_itens: [
                          {
                            ...prev.cautela_itens[0],
                            quantidade_carregadores: val,
                          },
                        ],
                      }));
                    }}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Qtd. Munições
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={
                      cautelaEditando.cautela_itens[0]?.quantidade_municao || 0
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      setCautelaEditando((prev) => ({
                        ...prev,
                        cautela_itens: [
                          {
                            ...prev.cautela_itens[0],
                            quantidade_municao: val,
                          },
                        ],
                      }));
                    }}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Tipo da Munição / Calibre
                </label>
                <input
                  type="text"
                  value={cautelaEditando.cautela_itens[0]?.tipo_municao || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCautelaEditando((prev) => ({
                      ...prev,
                      cautela_itens: [
                        {
                          ...prev.cautela_itens[0],
                          tipo_municao: val,
                        },
                      ],
                    }));
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCautelaEditando(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-600 font-bold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={processando}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE DEVOLUÇÃO */}
      {cautelaDevolvendo &&
        (() => {
          const itemDev = cautelaDevolvendo.cautela_itens?.[0] || {};
          const eqDev = itemDev.equipamento || {};
          const qtdCarregadores = itemDev.quantidade_carregadores || 0;
          const qtdMunicao = itemDev.quantidade_municao || 0;
          const tipoMunicao = itemDev.tipo_municao || "N/I";
          const numSerieArma = eqDev.num_serie || "N/I";
          const modeloArma =
            eqDev.modelo_descricao || eqDev.tipo || "Armamento";

          return (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans">
              <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4">
                <h2 className="text-lg font-bold text-slate-800">
                  Conferência de Devolução Bélica
                </h2>
                <form
                  onSubmit={handleConfirmarDevolucao}
                  className="space-y-4 text-xs"
                >
                  <div className="space-y-2 border-t pt-3 border-slate-100">
                    <label className="flex items-center gap-2.5 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-100/70 transition-all">
                      <input
                        type="checkbox"
                        checked={checkArma}
                        onChange={(e) => setCheckArma(e.target.checked)}
                        className="w-4 h-4 text-emerald-600 rounded shrink-0"
                      />
                      <span className="font-medium text-slate-800">
                        Armamento Conferido:{" "}
                        <strong className="text-blue-700">{modeloArma}</strong>{" "}
                        (Série:{" "}
                        <strong className="font-mono">{numSerieArma}</strong>)
                      </span>
                    </label>

                    <label className="flex items-center gap-2.5 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-100/70 transition-all">
                      <input
                        type="checkbox"
                        checked={checkCarregadores}
                        onChange={(e) => setCheckCarregadores(e.target.checked)}
                        className="w-4 h-4 text-emerald-600 rounded shrink-0"
                      />
                      <span className="font-medium text-slate-800">
                        Carregadores Conferidos:{" "}
                        <strong className="text-blue-700">
                          {qtdCarregadores} unidade(s)
                        </strong>{" "}
                        vinculada(s)
                      </span>
                    </label>

                    <label className="flex items-center gap-2.5 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-100/70 transition-all">
                      <input
                        type="checkbox"
                        checked={checkMunicao}
                        onChange={(e) => setCheckMunicao(e.target.checked)}
                        className="w-4 h-4 text-emerald-600 rounded shrink-0"
                      />
                      <span className="font-medium text-slate-800">
                        Munições Conferidas:{" "}
                        <strong className="text-blue-700">
                          {qtdMunicao} unidade(s)
                        </strong>{" "}
                        do tipo{" "}
                        <strong className="text-slate-700">
                          {tipoMunicao}
                        </strong>
                      </span>
                    </label>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">
                      Observações / Avarias
                    </label>
                    <textarea
                      rows="3"
                      value={campoAlteracoes}
                      onChange={(e) => setCampoAlteracoes(e.target.value)}
                      placeholder="Ex: Sem alterações..."
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
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow"
                    >
                      Homologar Devolução
                    </button>
                  </div>
                </form>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
