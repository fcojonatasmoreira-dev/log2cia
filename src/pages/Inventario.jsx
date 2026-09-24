import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import ModalDetalhesArma from "../components/ModalDetalhesArma";
import {
  Filter,
  Search,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Upload,
  Radio,
  Shield,
  Target,
} from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function formatarTipo(texto) {
  if (!texto) return "Armamento";
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export default function Inventario() {
  const [equipamentos, setEquipamentos] = useState([]);
  const [radios, setRadios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [armaSelecionada, setArmaSelecionada] = useState(null);
  const [modalNovo, setModalNovo] = useState(false);
  const [userRole, setUserRole] = useState("policial");

  // Aba ativa: 'geral' (armamentos/coletes/munição) ou 'radios'
  const [abaAtiva, setAbaAtiva] = useState("geral");

  // Estados de Filtros e Busca
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroDescricao, setFiltroDescricao] = useState("");
  const [filtroSerie, setFiltroSerie] = useState("");
  const [filtroLocalizacao, setFiltroLocalizacao] = useState("todas");

  // Estados de Download / Relatório
  const [baixandoExcel, setBaixandoExcel] = useState(false);
  const [baixandoPdf, setBaixandoPdf] = useState(false);
  const [sucessoExcel, setSucessoExcel] = useState(false);
  const [sucessoPdf, setSucessoPdf] = useState(false);

  // Campos gerais do formulário de cadastro (Geral)
  const [novoTipo, setNovoTipo] = useState("armamento");
  const [subtipoArmamento, setSubtipoArmamento] = useState("Pistola");
  const [novoModelo, setNovoModelo] = useState("");
  const [novoSerie, setNovoSerie] = useState("");
  const [novoPatrimonio, setNovoPatrimonio] = useState("");
  const [novoCalibre, setNovoCalibre] = useState("");
  const [novoLocalizacao, setNovoLocalizacao] = useState("Estoque da Reserva");
  const [novoEstado, setNovoEstado] = useState("Bom");
  const [observacoes, setObservacoes] = useState("");

  // Campos específicos para Colete Balístico
  const [coleteGenero, setColeteGenero] = useState("MASCULINO");
  const [coleteTamanho, setColeteTamanho] = useState("M");
  const [coleteDataFabricacao, setColeteDataFabricacao] = useState("");
  const [coleteDataValidade, setColeteDataValidade] = useState("");

  // Campos específicos para Munição
  const [municaoLote, setMunicaoLote] = useState("");
  const [municaoQuantidade, setMunicaoQuantidade] = useState("");

  // Campos específicos para Novo Rádio Comunicador
  const [radioMarca, setRadioMarca] = useState("");
  const [radioModelo, setRadioModelo] = useState("");
  const [radioSerie, setRadioSerie] = useState("");
  const [radioIdentificacao, setRadioIdentificacao] = useState("");
  const [radioTombo, setRadioTombo] = useState("");
  const [radioLocalizacao, setRadioLocalizacao] =
    useState("Estoque da Reserva");
  const [radioObs, setRadioObs] = useState("");

  // Estados para arquivos e upload restaurados
  const [arquivoArma, setArquivoArma] = useState(null);
  const [arquivoNumeracao, setArquivoNumeracao] = useState(null);
  const [arquivoColeteFrente, setArquivoColeteFrente] = useState(null);
  const [arquivoColeteVerso, setArquivoColeteVerso] = useState(null);
  const [arquivoMunicaoGeral, setArquivoMunicaoGeral] = useState(null);
  const [arquivoMunicaoCaixa, setArquivoMunicaoCaixa] = useState(null);
  const [arquivoRadio, setArquivoRadio] = useState(null);

  const [salvando, setSalvando] = useState(false);

  const checkUserRole = () => {
    try {
      const usuarioSalvo = localStorage.getItem("log2cia_user");
      if (usuarioSalvo) {
        const usuario = JSON.parse(usuarioSalvo);
        setUserRole(String(usuario?.role || "policial").toLowerCase());
      }
    } catch (e) {
      console.error("Erro ao verificar cargo:", e);
    }
  };

  useEffect(() => {
    checkUserRole();
    carregarDados();
  }, []);

  const isP4OrMasterOrArmeiro =
    userRole === "master" || userRole === "p4" || userRole === "armeiro";

  async function carregarDados() {
    setLoading(true);
    try {
      const { data: equipData, error: equipError } = await supabase
        .from("equipamentos")
        .select("*")
        .order("created_at", { ascending: false });

      if (equipError) throw equipError;
      if (equipData) setEquipamentos(equipData);

      const { data: radioData, error: radioError } = await supabase
        .from("radios")
        .select("*")
        .order("created_at", { ascending: false });

      if (radioError && radioError.code !== "42P01") throw radioError;
      if (radioData) setRadios(radioData);
    } catch (err) {
      console.error("Erro ao carregar dados:", err.message);
    } finally {
      setLoading(false);
    }
  }

  async function fazerUploadImagem(file, prefixo) {
    if (!file) return null;
    const fileExt = file.name.split(".").pop();
    const fileName = `${prefixo}_${Date.now()}.${fileExt}`;
    const filePath = `equipamentos/${fileName}`;
    const nomeBucket = "documentos-seguranca";

    const { error: uploadError } = await supabase.storage
      .from(nomeBucket)
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage
      .from(nomeBucket)
      .getPublicUrl(filePath);

    return publicUrlData.publicUrl;
  }

  const handleTipoChange = (val) => {
    setNovoTipo(val);
    if (val === "colete" && !novoModelo) {
      setNovoModelo("PROTECTA - NÍVEL III-A");
    } else if (val === "municao" && !novoModelo) {
      setNovoModelo("Munição 9mm / .40");
    }
  };

  const handleCadastrarEquipamento = async (e) => {
    e.preventDefault();
    if (!isP4OrMasterOrArmeiro) {
      alert(
        "Acesso negado: Seu tipo de acesso não permite cadastrar novos equipamentos.",
      );
      return;
    }
    setSalvando(true);

    try {
      if (abaAtiva === "radios") {
        const fotoRadioUrl = await fazerUploadImagem(arquivoRadio, "radio");

        const { error: radioErr } = await supabase.from("radios").insert([
          {
            marca: radioMarca.trim().toUpperCase(),
            modelo_descricao: radioModelo.trim().toUpperCase(),
            numero_serie: radioSerie.trim().toUpperCase(),
            numero_identificacao: radioIdentificacao.trim().toUpperCase(),
            tombo: radioTombo.trim() ? radioTombo.trim().toUpperCase() : null,
            status: "disponivel",
            localizacao_atual: radioLocalizacao,
            foto_radio_url: fotoRadioUrl,
            observacoes: radioObs,
          },
        ]);

        if (radioErr) throw radioErr;
        alert("Rádio comunicador cadastrado com sucesso!");

        setRadioMarca("");
        setRadioModelo("");
        setRadioSerie("");
        setRadioIdentificacao("");
        setRadioTombo("");
        setRadioObs("");
        setArquivoRadio(null);
      } else {
        let foto1Url = null;
        let foto2Url = null;

        if (novoTipo === "armamento") {
          foto1Url = await fazerUploadImagem(arquivoArma, "frente_arma");
          foto2Url = await fazerUploadImagem(arquivoNumeracao, "num_serie");
        } else if (novoTipo === "colete") {
          foto1Url = await fazerUploadImagem(
            arquivoColeteFrente,
            "rotulo_frente",
          );
          foto2Url = await fazerUploadImagem(
            arquivoColeteVerso,
            "rotulo_verso",
          );
        } else if (novoTipo === "municao") {
          foto1Url = await fazerUploadImagem(arquivoMunicaoGeral, "municoes");
          foto2Url = await fazerUploadImagem(
            arquivoMunicaoCaixa,
            "caixa_municao",
          );
        }

        let detalhesObj = {
          localizacao_atual: novoLocalizacao,
          estado_conservacao: novoEstado,
          foto_arma_url: foto1Url,
          foto_numeracao_url: foto2Url,
          obs: observacoes,
        };

        let serieFinal = novoSerie;
        let patrimonioFinal = novoPatrimonio;

        if (novoTipo === "armamento") {
          detalhesObj.subtipo_armamento = subtipoArmamento;
          detalhesObj.calibre = novoCalibre;
        } else if (novoTipo === "colete") {
          detalhesObj = {
            ...detalhesObj,
            genero: coleteGenero,
            tamanho: coleteTamanho,
            data_fabricacao: coleteDataFabricacao,
            data_validade: coleteDataValidade,
          };
        } else if (novoTipo === "municao") {
          serieFinal = municaoLote
            ? `LOTE-${municaoLote}`
            : `LOTE-S/N-${Date.now()}`;
          detalhesObj = {
            ...detalhesObj,
            lote: municaoLote || "Não Identificado",
            quantidade: municaoQuantidade || 0,
          };
        }

        const patrimonioTratado =
          patrimonioFinal && patrimonioFinal.trim() !== ""
            ? patrimonioFinal.trim()
            : null;

        const { error } = await supabase.from("equipamentos").insert([
          {
            tipo: novoTipo.toLowerCase(),
            modelo_descricao: novoModelo,
            num_serie: serieFinal,
            patrimonio: patrimonioTratado,
            status: "disponivel",
            detalhes: detalhesObj,
          },
        ]);

        if (error) throw error;
        alert("Equipamento cadastrado com sucesso!");

        setNovoModelo("");
        setNovoSerie("");
        setNovoPatrimonio("");
        setNovoCalibre("");
        setSubtipoArmamento("Pistola");
        setColeteGenero("MASCULINO");
        setColeteTamanho("M");
        setColeteDataFabricacao("");
        setColeteDataValidade("");
        setMunicaoLote("");
        setMunicaoQuantidade("");
        setObservacoes("");
        setNovoLocalizacao("Estoque da Reserva");
        setNovoEstado("Bom");
        setArquivoArma(null);
        setArquivoNumeracao(null);
        setArquivoColeteFrente(null);
        setArquivoColeteVerso(null);
        setArquivoMunicaoGeral(null);
        setArquivoMunicaoCaixa(null);
      }

      setModalNovo(false);
      carregarDados();
    } catch (err) {
      alert("Erro ao cadastrar equipamento: " + err.message);
    } finally {
      setSalvando(false);
    }
  };

  // Lógica de Filtragem Geral
  const equipamentosFiltrados = equipamentos.filter((item) => {
    const tipoItem = String(item.tipo || "").toLowerCase();
    const modeloItem = String(
      item.modelo_descricao || item.modelo || "",
    ).toLowerCase();
    const serieItem = String(
      item.num_serie || item.numero_serie || "",
    ).toLowerCase();
    const localizacaoItem = String(
      item.detalhes?.localizacao_atual || "Estoque da Reserva",
    ).toLowerCase();

    if (filtroTipo !== "todos" && tipoItem !== filtroTipo.toLowerCase())
      return false;
    if (filtroDescricao && !modeloItem.includes(filtroDescricao.toLowerCase()))
      return false;
    if (filtroSerie && !serieItem.includes(filtroSerie.toLowerCase()))
      return false;
    if (
      filtroLocalizacao !== "todas" &&
      localizacaoItem !== filtroLocalizacao.toLowerCase()
    )
      return false;

    return true;
  });

  // Lógica de Filtragem Rádios
  const radiosFiltrados = radios.filter((item) => {
    const modeloItem = String(
      item.modelo_descricao || item.marca || "",
    ).toLowerCase();
    const serieItem = String(
      item.numero_serie || item.numero_identificacao || "",
    ).toLowerCase();
    const localizacaoItem = String(
      item.localizacao_atual || "Estoque da Reserva",
    ).toLowerCase();

    if (filtroDescricao && !modeloItem.includes(filtroDescricao.toLowerCase()))
      return false;
    if (filtroSerie && !serieItem.includes(serieItem.toLowerCase()))
      return false;
    if (
      filtroLocalizacao !== "todas" &&
      localizacaoItem !== filtroLocalizacao.toLowerCase()
    )
      return false;

    return true;
  });

  const exportarExcel = () => {
    setBaixandoExcel(true);
    setTimeout(() => {
      const dadosFormatados =
        abaAtiva === "geral"
          ? equipamentosFiltrados.map((item) => ({
              Tipo: formatarTipo(item.tipo),
              "Modelo / Descrição": item.modelo_descricao || "N/I",
              Série: item.num_serie || "N/I",
              Status: item.status,
            }))
          : radiosFiltrados.map((item) => ({
              Tipo: "Rádio Comunicador",
              "Marca / Modelo": `${item.marca} - ${item.modelo_descricao}`,
              Série: item.numero_serie,
              "Nº Identificação": item.numero_identificacao,
              Status: item.status,
            }));

      const worksheet = XLSX.utils.json_to_sheet(dadosFormatados);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        abaAtiva === "geral" ? "Inventario" : "Radios",
      );
      XLSX.writeFile(
        workbook,
        `relatorio_${abaAtiva}_${new Date().toISOString().slice(0, 10)}.xlsx`,
      );

      setBaixandoExcel(false);
      setSucessoExcel(true);
      setTimeout(() => setSucessoExcel(false), 3000);
    }, 3000);
  };

  const exportarPDF = () => {
    setBaixandoPdf(true);
    setTimeout(() => {
      const doc = new jsPDF();
      doc.setFontSize(14);
      doc.text("LOG2CIA — RELATÓRIO DO ACERVO", 14, 15);
      doc.setFontSize(9);
      doc.text(`Emitido em: ${new Date().toLocaleString("pt-BR")}`, 14, 21);

      const colunas =
        abaAtiva === "geral"
          ? ["Tipo", "Modelo", "Série", "Status"]
          : ["Marca / Modelo", "Série", "Nº ID", "Status"];
      const linhas =
        abaAtiva === "geral"
          ? equipamentosFiltrados.map((item) => [
              formatarTipo(item.tipo),
              item.modelo_descricao || "N/I",
              item.num_serie || "N/I",
              item.status,
            ])
          : radiosFiltrados.map((item) => [
              `${item.marca} - ${item.modelo_descricao}`,
              item.numero_serie,
              item.numero_identificacao,
              item.status,
            ]);

      autoTable(doc, {
        startY: 26,
        head: [colunas],
        body: linhas,
        theme: "grid",
        headStyles: { fillColor: [30, 41, 59] },
        styles: { fontSize: 7 },
      });

      doc.save(
        `relatorio_${abaAtiva}_${new Date().toISOString().slice(0, 10)}.pdf`,
      );

      setBaixandoPdf(false);
      setSucessoPdf(true);
      setTimeout(() => setSucessoPdf(false), 3000);
    }, 3000);
  };

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto font-sans">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Acervo / Inventário
          </h1>
          <p className="text-xs text-slate-500">
            Gestão e controle de equipamentos e materiais bélicos
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportarExcel}
            disabled={baixandoExcel || sucessoExcel}
            className={`font-bold px-3 py-2 rounded-xl shadow-xs text-xs flex items-center gap-1.5 transition-all disabled:opacity-80 ${
              sucessoExcel
                ? "bg-emerald-800 text-white"
                : "bg-emerald-600 hover:bg-emerald-700 text-white"
            }`}
          >
            {baixandoExcel ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Gerando...</span>
              </>
            ) : sucessoExcel ? (
              <span>✓ Relatório Baixado</span>
            ) : (
              <>
                <FileSpreadsheet className="w-4 h-4" />
                <span>Excel</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={exportarPDF}
            disabled={baixandoPdf || sucessoPdf}
            className={`font-bold px-3 py-2 rounded-xl shadow-xs text-xs flex items-center gap-1.5 transition-all disabled:opacity-80 ${
              sucessoPdf
                ? "bg-rose-900 text-white"
                : "bg-rose-600 hover:bg-rose-700 text-white"
            }`}
          >
            {baixandoPdf ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Gerando...</span>
              </>
            ) : sucessoPdf ? (
              <span>✓ Relatório Baixado</span>
            ) : (
              <>
                <FileText className="w-4 h-4" />
                <span>PDF</span>
              </>
            )}
          </button>

          {isP4OrMasterOrArmeiro && (
            <button
              type="button"
              onClick={() => setModalNovo(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl shadow-md text-xs flex items-center gap-1.5 transition-all ml-1"
            >
              <span>+</span> Novo Equipamento
            </button>
          )}
        </div>
      </div>

      {/* ABAS DE NAVEGAÇÃO (GERAL x RÁDIOS) */}
      <div className="flex bg-slate-200/70 p-1 rounded-2xl w-fit border border-slate-300/60">
        <button
          onClick={() => {
            setAbaAtiva("geral");
            setFiltroTipo("todos");
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${abaAtiva === "geral" ? "bg-white text-blue-600 shadow-xs" : "text-slate-600 hover:text-slate-900"}`}
        >
          <Shield className="w-4 h-4" /> Armamentos, Coletes e Munições (
          {equipamentos.length})
        </button>
        <button
          onClick={() => {
            setAbaAtiva("radios");
            setFiltroTipo("todos");
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${abaAtiva === "radios" ? "bg-white text-blue-600 shadow-xs" : "text-slate-600 hover:text-slate-900"}`}
        >
          <Radio className="w-4 h-4" /> Rádios Comunicadores ({radios.length})
        </button>
      </div>

      {/* BARRA DE FILTROS AVANÇADOS */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100 text-slate-800 font-bold text-xs uppercase tracking-wide">
          <Filter className="w-4 h-4 text-blue-600" />
          <span>Filtros de Localização e Busca no Acervo</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {abaAtiva === "geral" && (
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-600 uppercase">
                Tipo de Equipamento
              </label>
              <select
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-medium"
              >
                <option value="todos">Todos os Tipos</option>
                <option value="armamento">Armamento</option>
                <option value="colete">Colete Balístico</option>
                <option value="municao">Munição</option>
              </select>
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-600 uppercase">
              Modelo / Descrição
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={filtroDescricao}
                onChange={(e) => setFiltroDescricao(e.target.value)}
                placeholder="Ex: Fuzil, Motorola..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-600 uppercase">
              Nº de Série / ID
            </label>
            <input
              type="text"
              value={filtroSerie}
              onChange={(e) => setFiltroSerie(e.target.value)}
              placeholder="Ex: LX02876..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-600 uppercase">
              Localização Atual
            </label>
            <select
              value={filtroLocalizacao}
              onChange={(e) => setFiltroLocalizacao(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-medium"
            >
              <option value="todas">Todas as Localizações</option>
              <option value="Estoque da Reserva">Estoque da Reserva</option>
              <option value="Acautelada com Policial">
                Acautelada com Policial
              </option>
              <option value="Apreendida">Apreendida</option>
              <option value="Em Perícia">Em Perícia</option>
              <option value="Manutenção">Manutenção</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 text-slate-500 font-medium">
          Carregando acervo...
        </div>
      ) : abaAtiva === "geral" ? (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold text-[11px]">
                <th className="p-3.5">Tipo / Descrição</th>
                <th className="p-3.5">Série / Lote</th>
                <th className="p-3.5">Especificações</th>
                <th className="p-3.5">Localização</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {equipamentosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-400">
                    Nenhum equipamento encontrado com os filtros aplicados.
                  </td>
                </tr>
              ) : (
                equipamentosFiltrados.map((item) => {
                  const tipoFormatted = formatarTipo(item.tipo);
                  const modeloVal =
                    item.modelo_descricao || item.modelo || "N/I";
                  const serieVal = item.num_serie || item.numero_serie || "N/I";
                  const localizacaoVal =
                    item.detalhes?.localizacao_atual || "Estoque da Reserva";

                  let infoExtra = item.detalhes?.calibre || "";
                  if (item.tipo === "colete") {
                    infoExtra = `Gênero: ${item.detalhes?.genero || "N/I"} | Tam: ${item.detalhes?.tamanho || "N/I"} | Val: ${item.detalhes?.data_validade || "N/I"}`;
                  } else if (item.tipo === "municao") {
                    infoExtra = `Lote: ${item.detalhes?.lote || "Não Identificado"} | Qtd: ${item.detalhes?.quantidade || 0} un`;
                  }

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="p-3.5 font-bold text-slate-800">
                        {tipoFormatted} - {modeloVal}
                      </td>
                      <td className="p-3.5 font-mono font-bold text-slate-700">
                        {serieVal}
                      </td>
                      <td className="p-3.5 text-slate-600 font-medium">
                        {infoExtra || "—"}
                      </td>
                      <td className="p-3.5 text-slate-600">{localizacaoVal}</td>
                      <td className="p-3.5">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${item.status === "disponivel" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
                        >
                          {item.status === "disponivel"
                            ? "Disponível"
                            : item.status}
                        </span>
                      </td>
                      <td className="p-3.5 text-right">
                        <button
                          onClick={() => setArmaSelecionada(item)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all text-xs border border-slate-200 shadow-xs"
                        >
                          Ver Detalhes / Fotos
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold text-[11px]">
                <th className="p-3.5">Rádio / Marca / Modelo</th>
                <th className="p-3.5">Nº de Série</th>
                <th className="p-3.5">Nº Identificação</th>
                <th className="p-3.5">Tombo</th>
                <th className="p-3.5">Localização</th>
                <th className="p-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {radiosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-400">
                    Nenhum rádio comunicador cadastrado.
                  </td>
                </tr>
              ) : (
                radiosFiltrados.map((radio) => (
                  <tr
                    key={radio.id}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="p-3.5 font-bold text-slate-800">
                      {radio.marca} - {radio.modelo_descricao}
                    </td>
                    <td className="p-3.5 font-mono font-bold text-slate-700">
                      {radio.numero_serie}
                    </td>
                    <td className="p-3.5 font-mono text-blue-600 font-bold">
                      {radio.numero_identificacao}
                    </td>
                    <td className="p-3.5 text-slate-600">
                      {radio.tombo || "—"}
                    </td>
                    <td className="p-3.5 text-slate-600">
                      {radio.localizacao_atual}
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${radio.status === "disponivel" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
                      >
                        {radio.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {modalNovo && isP4OrMasterOrArmeiro && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-100 space-y-4 my-8">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-800">
                Cadastrar Novo Equipamento
              </h2>
              <button
                onClick={() => setModalNovo(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-base p-1"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleCadastrarEquipamento}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Gênero / Categoria
                </label>
                <select
                  value={abaAtiva === "radios" ? "radio" : novoTipo}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "radio") {
                      setAbaAtiva("radios");
                    } else {
                      setAbaAtiva("geral");
                      handleTipoChange(val);
                    }
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="armamento">Armamento</option>
                  <option value="colete">Colete Balístico</option>
                  <option value="municao">Munição</option>
                  <option value="radio">Rádio Comunicador</option>
                </select>
              </div>

              {/* FORMULÁRIO ESPECÍFICO DE RÁDIO COMUNICADOR COM FOTO */}
              {abaAtiva === "radios" ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-700 uppercase mb-1">
                        Marca *
                      </label>
                      <input
                        type="text"
                        required
                        value={radioMarca}
                        onChange={(e) => setRadioMarca(e.target.value)}
                        placeholder="Ex: Motorola"
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl uppercase"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 uppercase mb-1">
                        Modelo *
                      </label>
                      <input
                        type="text"
                        required
                        value={radioModelo}
                        onChange={(e) => setRadioModelo(e.target.value)}
                        placeholder="Ex: APX 2000"
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl uppercase"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-700 uppercase mb-1">
                        Nº de Série *
                      </label>
                      <input
                        type="text"
                        required
                        value={radioSerie}
                        onChange={(e) => setRadioSerie(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl uppercase font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 uppercase mb-1">
                        Nº de Identificação *
                      </label>
                      <input
                        type="text"
                        required
                        value={radioIdentificacao}
                        onChange={(e) => setRadioIdentificacao(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl uppercase font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-700 uppercase mb-1">
                        Tombo / Patrimônio
                      </label>
                      <input
                        type="text"
                        value={radioTombo}
                        onChange={(e) => setRadioTombo(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl uppercase"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 uppercase mb-1">
                        Localização
                      </label>
                      <select
                        value={radioLocalizacao}
                        onChange={(e) => setRadioLocalizacao(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                      >
                        <option value="Estoque da Reserva">
                          Estoque da Reserva
                        </option>
                        <option value="Acautelada com Policial">
                          Acautelada com Policial
                        </option>
                        <option value="Manutenção">Manutenção</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Foto do Rádio
                    </label>
                    <label className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 cursor-pointer hover:bg-slate-100 transition-all truncate">
                      <Upload className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span className="truncate">
                        {arquivoRadio ? arquivoRadio.name : "Escolher arquivo"}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => setArquivoRadio(e.target.files[0])}
                      />
                    </label>
                  </div>
                </>
              ) : (
                /* FORMULÁRIO GERAL (ARMAMENTO / COLETE / MUNIÇÃO) COM TODAS AS FOTOS RESTAURADAS */
                <>
                  {novoTipo === "armamento" && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-bold text-slate-700 uppercase mb-1">
                          Tipo de Arma *
                        </label>
                        <select
                          value={subtipoArmamento}
                          onChange={(e) => setSubtipoArmamento(e.target.value)}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none"
                        >
                          <option value="Pistola">Pistola</option>
                          <option value="Fuzil">Fuzil</option>
                          <option value="Espingarda">Espingarda</option>
                          <option value="Carabina Tática">
                            Carabina Tática
                          </option>
                          <option value="Carabina">Carabina</option>
                          <option value="Submetralhadora">
                            Submetralhadora
                          </option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 uppercase mb-1">
                          Modelo *
                        </label>
                        <input
                          type="text"
                          required
                          value={novoModelo}
                          onChange={(e) => setNovoModelo(e.target.value)}
                          placeholder="Ex: PT 840, T4..."
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {novoTipo !== "armamento" && (
                    <div>
                      <label className="block font-bold text-slate-700 uppercase mb-1">
                        {novoTipo === "municao"
                          ? "Tipo / Calibre da Munição *"
                          : "Marca / Modelo *"}
                      </label>
                      <input
                        type="text"
                        required
                        value={novoModelo}
                        onChange={(e) => setNovoModelo(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                      />
                    </div>
                  )}

                  {novoTipo === "municao" ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-bold text-slate-700 uppercase mb-1">
                          Identificação do Lote
                        </label>
                        <input
                          type="text"
                          value={municaoLote}
                          onChange={(e) => setMunicaoLote(e.target.value)}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 uppercase mb-1">
                          Quantidade *
                        </label>
                        <input
                          type="number"
                          required
                          min="1"
                          value={municaoQuantidade}
                          onChange={(e) => setMunicaoQuantidade(e.target.value)}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold outline-none"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-bold text-slate-700 uppercase mb-1">
                          Nº de Série *
                        </label>
                        <input
                          type="text"
                          required
                          value={novoSerie}
                          onChange={(e) => setNovoSerie(e.target.value)}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 uppercase mb-1">
                          Tombo / Patrimônio
                        </label>
                        <input
                          type="text"
                          value={novoPatrimonio}
                          onChange={(e) => setNovoPatrimonio(e.target.value)}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {novoTipo === "colete" && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block font-bold text-slate-700 uppercase mb-1">
                            Gênero
                          </label>
                          <select
                            value={coleteGenero}
                            onChange={(e) => setColeteGenero(e.target.value)}
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                          >
                            <option value="MASCULINO">MASCULINO</option>
                            <option value="FEMININO">FEMININO</option>
                            <option value="UNISEX">UNISEX</option>
                          </select>
                        </div>
                        <div>
                          <label className="block font-bold text-slate-700 uppercase mb-1">
                            Tamanho
                          </label>
                          <select
                            value={coleteTamanho}
                            onChange={(e) => setColeteTamanho(e.target.value)}
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                          >
                            <option value="PP">PP</option>
                            <option value="P">P</option>
                            <option value="M">M</option>
                            <option value="G">G</option>
                            <option value="GG">GG</option>
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block font-bold text-slate-700 uppercase mb-1">
                            Data Fabricação
                          </label>
                          <input
                            type="date"
                            value={coleteDataFabricacao}
                            onChange={(e) =>
                              setColeteDataFabricacao(e.target.value)
                            }
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-slate-700 uppercase mb-1">
                            Data Validade
                          </label>
                          <input
                            type="date"
                            value={coleteDataValidade}
                            onChange={(e) =>
                              setColeteDataValidade(e.target.value)
                            }
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {novoTipo === "armamento" && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-bold text-slate-700 uppercase mb-1">
                          Calibre
                        </label>
                        <input
                          type="text"
                          value={novoCalibre}
                          onChange={(e) => setNovoCalibre(e.target.value)}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 uppercase mb-1">
                          Estado
                        </label>
                        <select
                          value={novoEstado}
                          onChange={(e) => setNovoEstado(e.target.value)}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                        >
                          <option value="Novo">Novo</option>
                          <option value="Bom">Bom</option>
                          <option value="Regular">Regular</option>
                          <option value="Danificado">Danificado</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">
                      Localização Atual
                    </label>
                    <select
                      value={novoLocalizacao}
                      onChange={(e) => setNovoLocalizacao(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    >
                      <option value="Estoque da Reserva">
                        Estoque da Reserva
                      </option>
                      <option value="Acautelada com Policial">
                        Acautelada com Policial
                      </option>
                      <option value="Apreendida">Apreendida</option>
                      <option value="Em Perícia">Em Perícia</option>
                      <option value="Manutenção">Manutenção</option>
                    </select>
                  </div>

                  {/* SEÇÃO DE UPLOAD DE FOTOS CONDICIONAIS RESTAURADA */}
                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <span className="block font-bold text-slate-700 uppercase text-[10px]">
                      Anexos de Imagens / Fotos
                    </span>

                    {novoTipo === "armamento" && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Foto da Frente da Arma
                          </label>
                          <label className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 cursor-pointer hover:bg-slate-100 transition-all truncate">
                            <Upload className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span className="truncate">
                              {arquivoArma
                                ? arquivoArma.name
                                : "Escolher arquivo"}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) =>
                                setArquivoArma(e.target.files[0])
                              }
                            />
                          </label>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Foto do Nº de Série
                          </label>
                          <label className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 cursor-pointer hover:bg-slate-100 transition-all truncate">
                            <Upload className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span className="truncate">
                              {arquivoNumeracao
                                ? arquivoNumeracao.name
                                : "Escolher arquivo"}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) =>
                                setArquivoNumeracao(e.target.files[0])
                              }
                            />
                          </label>
                        </div>
                      </div>
                    )}

                    {novoTipo === "colete" && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Foto Rótulo da Frente
                          </label>
                          <label className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 cursor-pointer hover:bg-slate-100 transition-all truncate">
                            <Upload className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span className="truncate">
                              {arquivoColeteFrente
                                ? arquivoColeteFrente.name
                                : "Escolher arquivo"}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) =>
                                setArquivoColeteFrente(e.target.files[0])
                              }
                            />
                          </label>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Foto Rótulo do Verso
                          </label>
                          <label className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 cursor-pointer hover:bg-slate-100 transition-all truncate">
                            <Upload className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span className="truncate">
                              {arquivoColeteVerso
                                ? arquivoColeteVerso.name
                                : "Escolher arquivo"}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) =>
                                setArquivoColeteVerso(e.target.files[0])
                              }
                            />
                          </label>
                        </div>
                      </div>
                    )}

                    {novoTipo === "municao" && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Foto das Munições
                          </label>
                          <label className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 cursor-pointer hover:bg-slate-100 transition-all truncate">
                            <Upload className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span className="truncate">
                              {arquivoMunicaoGeral
                                ? arquivoMunicaoGeral.name
                                : "Escolher arquivo"}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) =>
                                setArquivoMunicaoGeral(e.target.files[0])
                              }
                            />
                          </label>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Foto da Caixa (se houver)
                          </label>
                          <label className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 cursor-pointer hover:bg-slate-100 transition-all truncate">
                            <Upload className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span className="truncate">
                              {arquivoMunicaoCaixa
                                ? arquivoMunicaoCaixa.name
                                : "Escolher arquivo"}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) =>
                                setArquivoMunicaoCaixa(e.target.files[0])
                              }
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Observações
                </label>
                <textarea
                  rows="2"
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl resize-none"
                />
              </div>

              <div className="flex gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setModalNovo(false)}
                  className="w-1/3 py-2.5 bg-slate-100 font-bold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="w-2/3 py-2.5 bg-blue-600 text-white font-bold rounded-xl shadow-md"
                >
                  {salvando ? "Salvando..." : "Salvar Equipamento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {armaSelecionada && (
        <ModalDetalhesArma
          arma={armaSelecionada}
          userRole={userRole}
          onClose={() => setArmaSelecionada(null)}
          onUpdateSuccess={() => {
            carregarDados();
            setArmaSelecionada(null);
          }}
        />
      )}
    </div>
  );
}
