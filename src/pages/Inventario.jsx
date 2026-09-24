import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import ModalDetalhesArma from "../components/ModalDetalhesArma";
import { Filter, Search, FileSpreadsheet, FileText } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function formatarTipo(texto) {
  if (!texto) return "Armamento";
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export default function Inventario() {
  const [equipamentos, setEquipamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [armaSelecionada, setArmaSelecionada] = useState(null);
  const [modalNovo, setModalNovo] = useState(false);
  const [userRole, setUserRole] = useState("policial");

  // Estados de Filtros e Busca
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroDescricao, setFiltroDescricao] = useState("");
  const [filtroSerie, setFiltroSerie] = useState("");
  const [filtroLocalizacao, setFiltroLocalizacao] = useState("todas");

  // Campos gerais do formulário de cadastro
  const [novoTipo, setNovoTipo] = useState("armamento");
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
  const [coleteObs, setColeteObs] = useState("");

  // Campos específicos para Munição
  const [municaoLote, setMunicaoLote] = useState("");
  const [municaoQuantidade, setMunicaoQuantidade] = useState("");
  const [municaoObs, setMunicaoObs] = useState("");

  // Estados para arquivos e upload
  const [arquivoArma, setArquivoArma] = useState(null);
  const [arquivoNumeracao, setArquivoNumeracao] = useState(null);
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
    carregarInventario();
  }, []);

  const isP4OrMasterOrArmeiro =
    userRole === "master" || userRole === "p4" || userRole === "armeiro";

  async function carregarInventario() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("equipamentos")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (data) setEquipamentos(data);
    } catch (err) {
      console.error("Erro ao carregar equipamentos:", err.message);
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
      setNovoModelo("PROTECTA - COLETE - NÍVEL III-A");
    }
    if (val === "municao" && !novoModelo) {
      setNovoModelo("Munição 9mm / .40");
    }
  };

  const handleCadastrarArmamento = async (e) => {
    e.preventDefault();
    if (!isP4OrMasterOrArmeiro) {
      alert(
        "Acesso negado: Seu tipo de acesso não permite cadastrar novos equipamentos.",
      );
      return;
    }
    setSalvando(true);

    try {
      const fotoArmaUrl = await fazerUploadImagem(arquivoArma, "item");
      const fotoNumeracaoUrl = await fazerUploadImagem(arquivoNumeracao, "det");

      let detalhesObj = {
        localizacao_atual: novoLocalizacao,
        estado_conservacao: novoEstado,
        foto_arma_url: fotoArmaUrl,
        foto_numeracao_url: fotoNumeracaoUrl,
        obs: observacoes,
      };

      let serieFinal = novoSerie;
      let patrimonioFinal = novoPatrimonio;

      if (novoTipo === "colete") {
        detalhesObj = {
          ...detalhesObj,
          genero: coleteGenero,
          tamanho: coleteTamanho,
          data_fabricacao: coleteDataFabricacao,
          data_validade: coleteDataValidade,
          obs: coleteObs || observacoes,
        };
      } else if (novoTipo === "municao") {
        serieFinal = municaoLote
          ? `LOTE-${municaoLote}`
          : `LOTE-S/N-${Date.now()}`;
        detalhesObj = {
          ...detalhesObj,
          lote: municaoLote || "Não Identificado",
          quantidade: municaoQuantidade || 0,
          obs: municaoObs || observacoes,
        };
      } else {
        detalhesObj.calibre = novoCalibre;
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

      setNovoModelo("");
      setNovoSerie("");
      setNovoPatrimonio("");
      setNovoCalibre("");
      setColeteGenero("MASCULINO");
      setColeteTamanho("M");
      setColeteDataFabricacao("");
      setColeteDataValidade("");
      setColeteObs("");
      setMunicaoLote("");
      setMunicaoQuantidade("");
      setMunicaoObs("");
      setObservacoes("");
      setNovoLocalizacao("Estoque da Reserva");
      setNovoEstado("Bom");
      setArquivoArma(null);
      setArquivoNumeracao(null);
      setModalNovo(false);
      carregarInventario();
    } catch (err) {
      alert("Erro ao cadastrar equipamento: " + err.message);
    } finally {
      setSalvando(false);
    }
  };

  // Lógica de Filtragem
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

  // Funções de Exportação (Excel e PDF)
  const exportarExcel = () => {
    const dadosFormatados = equipamentosFiltrados.map((item) => ({
      Tipo: formatarTipo(item.tipo),
      "Modelo / Descrição": item.modelo_descricao || item.modelo || "N/I",
      "Série / Lote": item.num_serie || item.numero_serie || "N/I",
      Patrimônio: item.patrimonio || "—",
      Especificações:
        item.detalhes?.calibre ||
        (item.tipo === "colete"
          ? `Tam: ${item.detalhes?.tamanho}`
          : `Qtd: ${item.detalhes?.quantidade}`),
      Localização: item.detalhes?.localizacao_atual || "Estoque da Reserva",
      Status: item.status,
    }));

    const worksheet = XLSX.utils.json_to_sheet(dadosFormatados);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventario");
    XLSX.writeFile(
      workbook,
      `relatorio_inventario_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  };

  const exportarPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("LOG2CIA — RELATÓRIO DO ACERVO BÉLICO", 14, 15);
    doc.setFontSize(9);
    doc.text(`Emitido em: ${new Date().toLocaleString("pt-BR")}`, 14, 21);

    const colunas = [
      "Tipo",
      "Modelo",
      "Série / Lote",
      "Patrimônio",
      "Localização",
      "Status",
    ];
    const linhas = equipamentosFiltrados.map((item) => [
      formatarTipo(item.tipo),
      item.modelo_descricao || item.modelo || "N/I",
      item.num_serie || item.numero_serie || "N/I",
      item.patrimonio || "—",
      item.detalhes?.localizacao_atual || "Estoque",
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
      `relatorio_inventario_${new Date().toISOString().slice(0, 10)}.pdf`,
    );
  };

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto font-sans">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Acervo / Inventário
          </h1>
          <p className="text-xs text-slate-500">
            Gestão e controle de equipamentos bélicos
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportarExcel}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-2 rounded-xl shadow-xs text-xs flex items-center gap-1.5 transition-all"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Excel</span>
          </button>
          <button
            type="button"
            onClick={exportarPDF}
            className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-2 rounded-xl shadow-xs text-xs flex items-center gap-1.5 transition-all"
          >
            <FileText className="w-4 h-4" />
            <span>PDF</span>
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

      {/* BARRA DE FILTROS AVANÇADOS */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100 text-slate-800 font-bold text-xs uppercase tracking-wide">
          <Filter className="w-4 h-4 text-blue-600" />
          <span>Filtros de Localização e Busca no Acervo</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
                placeholder="Ex: Carabina, Fuzil..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-600 uppercase">
              Nº de Série / Lote
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
      ) : (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold text-[11px]">
                <th className="p-3.5">Tipo / Descrição</th>
                <th className="p-3.5">Série / Lote</th>
                <th className="p-3.5">Patrimônio</th>
                <th className="p-3.5">Especificações</th>
                <th className="p-3.5">Localização</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {equipamentosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-slate-400">
                    Nenhum equipamento encontrado com os filtros aplicados.
                  </td>
                </tr>
              ) : (
                equipamentosFiltrados.map((item) => {
                  const tipoFormatted = formatarTipo(item.tipo);
                  const modeloVal =
                    item.modelo_descricao || item.modelo || "N/I";
                  const serieVal = item.num_serie || item.numero_serie || "N/I";
                  const patrimonioVal = item.patrimonio || "—";
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
                      <td className="p-3.5 font-mono text-slate-600">
                        {patrimonioVal}
                      </td>
                      <td className="p-3.5 text-slate-600 font-medium">
                        {infoExtra || "—"}
                      </td>
                      <td className="p-3.5 text-slate-600">{localizacaoVal}</td>
                      <td className="p-3.5">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            item.status === "disponivel"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
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
              onSubmit={handleCadastrarArmamento}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Tipo de Equipamento
                </label>
                <select
                  value={novoTipo}
                  onChange={(e) => handleTipoChange(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="armamento">Armamento</option>
                  <option value="colete">Colete Balístico</option>
                  <option value="municao">Munição</option>
                </select>
              </div>

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
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

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
                        onChange={(e) => setColeteDataValidade(e.target.value)}
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
                  <option value="Estoque da Reserva">Estoque da Reserva</option>
                  <option value="Acautelada com Policial">
                    Acautelada com Policial
                  </option>
                  <option value="Apreendida">Apreendida</option>
                  <option value="Em Perícia">Em Perícia</option>
                  <option value="Manutenção">Manutenção</option>
                </select>
              </div>

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
            carregarInventario();
            setArmaSelecionada(null);
          }}
        />
      )}
    </div>
  );
}
