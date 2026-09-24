import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Plus,
  Search,
  AlertCircle,
  RefreshCw,
  Edit3,
  Trash2,
  Eye,
  Shield,
  Package,
  KeyRound,
  Filter,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import {
  getPoliciais,
  createPolicial,
  updatePolicial,
  deletePolicial,
} from "../services/policiaisService";
import { supabase } from "../lib/supabaseClient";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const postosOficiais = [
  "ASPIRANTE",
  "2º TENENTE",
  "1º TENENTE",
  "CAPITÃO",
  "MAJOR",
  "TENENTE CORONEL",
  "CORONEL",
  "Aspirante",
  "2º Tenente",
  "1º Tenente",
  "Capitão",
  "Major",
  "Tenente Coronel",
  "Coronel",
];

export default function Policiais() {
  const [searchParams] = useSearchParams();
  const initialSearch = searchParams.get("search") || "";

  const [policiais, setPoliciais] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Estados de Filtros Avançados
  const [filtroBusca, setFiltroBusca] = useState(initialSearch);
  const [filtroCategoria, setFiltroCategoria] = useState("todas");
  const [filtroPosto, setFiltroPosto] = useState("todos");
  const [filtroRole, setFiltroRole] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");

  // Estados de Download / Relatório
  const [baixandoExcel, setBaixandoExcel] = useState(false);
  const [baixandoPdf, setBaixandoPdf] = useState(false);
  const [sucessoExcel, setSucessoExcel] = useState(false);
  const [sucessoPdf, setSucessoPdf] = useState(false);

  // Modais e Permissões
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [userRole, setUserRole] = useState("policial");
  const [editingId, setEditingId] = useState(null);
  const [policialSelecionado, setPolicialSelecionado] = useState(null);
  const [cautelasAtivas, setCautelasAtivas] = useState([]);
  const [loadingCautelas, setLoadingCautelas] = useState(false);

  useEffect(() => {
    const query = searchParams.get("search");
    if (query !== null) {
      setFiltroBusca(query);
    }
  }, [searchParams]);

  const [formData, setFormData] = useState({
    nome_completo: "",
    nome_guerra: "",
    matricula: "",
    posto_graduacao: "SOLDADO",
    numeral: "",
    role: "policial",
    unidade: "2ª CIA / 15º BPM",
    status: "EM ATIVIDADE",
  });

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

  const loadPoliciais = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getPoliciais();
      setPoliciais(data);
    } catch (err) {
      setError("Falha ao carregar a lista de policiais. Verifique a conexão.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkUserRole();
    loadPoliciais();
  }, []);

  const handleOpenModalNew = () => {
    setEditingId(null);
    setFormData({
      nome_completo: "",
      nome_guerra: "",
      matricula: "",
      posto_graduacao: "SOLDADO",
      numeral: "",
      role: "policial",
      unidade: "2ª CIA / 15º BPM",
      status: "EM ATIVIDADE",
    });
    setIsModalOpen(true);
  };

  const handleOpenModalEdit = (p) => {
    if (
      userRole === "p4" &&
      (String(p.role).toLowerCase() === "master" ||
        String(p.role).toLowerCase() === "p4")
    ) {
      alert("Acesso negado: Usuários P4 não podem editar perfis Master ou P4.");
      return;
    }

    setEditingId(p.id);
    setFormData({
      nome_completo: p.nome_completo || "",
      nome_guerra: p.nome_guerra || "",
      matricula: p.matricula || "",
      posto_graduacao: p.posto_graduacao || "SOLDADO",
      numeral: p.numeral || "",
      role: p.role || "policial",
      unidade: p.unidade || "2ª CIA / 15º BPM",
      status: p.status || "EM ATIVIDADE",
    });
    setIsModalOpen(true);
  };

  const handleResetarSenha = async () => {
    if (!editingId) return;

    if (
      !confirm(
        "Confirma o reset da senha deste militar? A senha voltará a ser o padrão e ele precisará redefini-la no próximo acesso.",
      )
    ) {
      return;
    }

    try {
      const { error } = await supabase
        .from("policiais")
        .update({
          senha: null,
          primeiro_acesso: true,
        })
        .eq("id", editingId);

      if (error) throw error;

      alert("Senha resetada com sucesso!");
      setIsModalOpen(false);
      loadPoliciais();
    } catch (err) {
      alert("Erro ao resetar senha: " + err.message);
    }
  };

  const handleOpenModalView = async (p) => {
    setPolicialSelecionado(p);
    setIsViewModalOpen(true);
    setLoadingCautelas(true);
    try {
      const { data: cautelasData, error: cautelasError } = await supabase
        .from("cautelas")
        .select("*")
        .eq("policial_id", p.id);

      if (cautelasError) throw cautelasError;

      const ativas = (cautelasData || []).filter(
        (c) =>
          String(c.status).toLowerCase() === "ativa" ||
          String(c.status).toLowerCase() === "em_andamento",
      );

      const cautelasComEquipamentos = await Promise.all(
        ativas.map(async (cautela) => {
          const { data: itensData } = await supabase
            .from("cautela_itens")
            .select("*, equipamentos(*)")
            .eq("cautela_id", cautela.id);

          return {
            ...cautela,
            equipamentos: itensData?.[0]?.equipamentos || null,
          };
        }),
      );

      setCautelasAtivas(cautelasComEquipamentos);
    } catch (err) {
      setCautelasAtivas([]);
    } finally {
      setLoadingCautelas(false);
    }
  };

  const handleDelete = async (id, nomeGuerra) => {
    if (!confirm(`Confirma a exclusão do policial ${nomeGuerra}?`)) return;
    try {
      await deletePolicial(id);
      loadPoliciais();
    } catch (err) {
      alert(`Erro ao excluir policial: ${err.message}`);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (userRole === "p4") {
      if (editingId) {
        const policialAlvo = policiais.find((p) => p.id === editingId);
        if (
          policialAlvo &&
          ["master", "p4"].includes(String(policialAlvo.role).toLowerCase())
        ) {
          alert(
            "Acesso negado: Usuários P4 não podem alterar perfis Master ou P4.",
          );
          return;
        }
      }
      if (formData.role !== "policial") {
        alert("Acesso negado: Usuários P4 só podem definir perfil policial.");
        return;
      }
    }

    try {
      const isOficialOrSub =
        postosOficiais.includes(formData.posto_graduacao) ||
        formData.posto_graduacao === "SUBTENENTE" ||
        formData.posto_graduacao === "Subtenente";

      const dadosParaSalvar = {
        ...formData,
        numeral:
          !isOficialOrSub && formData.numeral && formData.numeral.trim() !== ""
            ? formData.numeral.trim()
            : null,
      };

      if (!isMaster && editingId) {
        delete dadosParaSalvar.role;
      }

      if (editingId) {
        await updatePolicial(editingId, dadosParaSalvar);
      } else {
        const dadosNovos =
          userRole === "p4"
            ? { ...dadosParaSalvar, role: "policial" }
            : dadosParaSalvar;
        await createPolicial(dadosNovos);
      }
      setIsModalOpen(false);
      loadPoliciais();
    } catch (err) {
      alert(`Erro ao salvar dados: ${err.message}`);
    }
  };

  const isMaster = userRole === "master";
  const isP4OrMaster = userRole === "master" || userRole === "p4";

  // Lógica de Filtragem Avançada
  const filteredPoliciais = policiais.filter((p) => {
    const nomeGuerra = String(p.nome_guerra || "").toLowerCase();
    const nomeCompleto = String(p.nome_completo || "").toLowerCase();
    const matricula = String(p.matricula || "").toLowerCase();
    const posto = String(p.posto_graduacao || "").trim();
    const roleItem = String(p.role || "policial").toLowerCase();
    const statusItem = String(p.status || "").toLowerCase();

    if (filtroBusca) {
      const termo = filtroBusca.toLowerCase();
      const matchBusca =
        nomeGuerra.includes(termo) ||
        nomeCompleto.includes(termo) ||
        matricula.includes(termo);
      if (!matchBusca) return false;
    }

    const ehOficial = postosOficiais.some(
      (op) => op.toLowerCase() === posto.toLowerCase(),
    );
    if (filtroCategoria === "oficial" && !ehOficial) return false;
    if (filtroCategoria === "praca" && ehOficial) return false;

    if (
      filtroPosto !== "todos" &&
      posto.toLowerCase() !== filtroPosto.toLowerCase()
    ) {
      return false;
    }

    if (
      isMaster &&
      filtroRole !== "todos" &&
      roleItem !== filtroRole.toLowerCase()
    ) {
      return false;
    }

    if (filtroStatus !== "todos" && statusItem !== filtroStatus.toLowerCase()) {
      return false;
    }

    return true;
  });

  // Funções de Exportação com Delay e Feedback Visual
  const exportarExcel = () => {
    setBaixandoExcel(true);
    setTimeout(() => {
      const dadosFormatados = filteredPoliciais.map((p) => ({
        "Posto / Graduação": p.posto_graduacao,
        "Nome de Guerra": p.nome_guerra,
        Matrícula: p.matricula || "N/I",
        "Nome Completo": p.nome_completo,
        Numeral: p.numeral || "—",
        Perfil: p.role || "policial",
        Situação: p.status,
      }));

      const worksheet = XLSX.utils.json_to_sheet(dadosFormatados);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Efetivo");
      XLSX.writeFile(
        workbook,
        `relatorio_efetivo_${new Date().toISOString().slice(0, 10)}.xlsx`,
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
      doc.text("LOG2CIA — RELATÓRIO DE EFETIVO MILITAR", 14, 15);
      doc.setFontSize(9);
      doc.text(`Emitido em: ${new Date().toLocaleString("pt-BR")}`, 14, 21);

      const colunas = [
        "Posto / Grad.",
        "Guerra",
        "Matrícula",
        "Nome Completo",
        "Numeral",
        "Situação",
      ];
      const linhas = filteredPoliciais.map((p) => [
        p.posto_graduacao,
        p.nome_guerra,
        p.matricula || "N/I",
        p.nome_completo,
        p.numeral || "—",
        p.status,
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
        `relatorio_efetivo_${new Date().toISOString().slice(0, 10)}.pdf`,
      );

      setBaixandoPdf(false);
      setSucessoPdf(true);
      setTimeout(() => setSucessoPdf(false), 3000);
    }, 3000);
  };

  const totalColunas = isMaster ? 8 : 7;

  return (
    <div className="space-y-4 max-w-6xl mx-auto font-sans p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Gestão de Efetivo
          </h1>
          <p className="text-xs text-slate-500">
            Cadastro e acompanhamento de policiais da unidade.
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

          {isP4OrMaster && (
            <button
              type="button"
              onClick={handleOpenModalNew}
              className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl transition-colors shadow-xs text-xs ml-1"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Policial</span>
            </button>
          )}
        </div>
      </div>

      {/* BARRA DE FILTROS AVANÇADOS */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100 text-slate-800 font-bold text-xs uppercase tracking-wide">
          <Filter className="w-4 h-4 text-blue-600" />
          <span>Filtros e Busca no Efetivo</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-600 uppercase">
              Busca (Nome / Matrícula)
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Ex: Silva, 135728..."
                value={filtroBusca}
                onChange={(e) => setFiltroBusca(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-mono"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-600 uppercase">
              Círculo Hierárquico
            </label>
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-medium"
            >
              <option value="todas">Todos (Oficiais e Praças)</option>
              <option value="oficial">Apenas Oficiais</option>
              <option value="praca">Apenas Praças</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-600 uppercase">
              Posto / Graduação
            </label>
            <select
              value={filtroPosto}
              onChange={(e) => setFiltroPosto(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-medium"
            >
              <option value="todos">Todos os Postos</option>
              <option value="SOLDADO">Soldado</option>
              <option value="CABO">Cabo</option>
              <option value="3º SARGENTO">3º Sargento</option>
              <option value="2º SARGENTO">2º Sargento</option>
              <option value="1º SARGENTO">1º Sargento</option>
              <option value="SUBTENENTE">Subtenente</option>
              <option value="ASPIRANTE">Aspirante</option>
              <option value="2º TENENTE">2º Tenente</option>
              <option value="1º TENENTE">1º Tenente</option>
              <option value="CAPITÃO">Capitão</option>
              <option value="MAJOR">Major</option>
              <option value="TENENTE CORONEL">Tenente Coronel</option>
              <option value="CORONEL">Coronel</option>
            </select>
          </div>

          {isMaster ? (
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-600 uppercase">
                Perfil de Acesso
              </label>
              <select
                value={filtroRole}
                onChange={(e) => setFiltroRole(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-medium"
              >
                <option value="todos">Todos os Perfis</option>
                <option value="policial">Policial</option>
                <option value="armeiro">Armeiro</option>
                <option value="p4">P4</option>
                <option value="master">Master</option>
              </select>
            </div>
          ) : (
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-600 uppercase">
                Situação
              </label>
              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-medium"
              >
                <option value="todos">Todas as Situações</option>
                <option value="em atividade">Em Atividade</option>
                <option value="férias">Férias</option>
                <option value="licença">Licença</option>
                <option value="agregado">Agregado</option>
              </select>
            </div>
          )}

          {isMaster ? (
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-600 uppercase">
                Situação
              </label>
              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-medium"
              >
                <option value="todos">Todas as Situações</option>
                <option value="em atividade">Em Atividade</option>
                <option value="férias">Férias</option>
                <option value="licença">Licença</option>
                <option value="agregado">Agregado</option>
              </select>
            </div>
          ) : (
            <div className="flex items-end">
              <button
                onClick={loadPoliciais}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 border border-slate-200"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
                />
                <span>Atualizar Efetivo</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {error ? (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-center space-x-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-500 uppercase tracking-wider text-[11px]">
                  <th className="p-3.5">Posto / Grad.</th>
                  <th className="p-3.5">Nome de Guerra</th>
                  <th className="p-3.5">Matrícula</th>
                  <th className="p-3.5">Nome Completo</th>
                  <th className="p-3.5">Numeral</th>
                  {isMaster && <th className="p-3.5">Perfil</th>}
                  <th className="p-3.5">Situação</th>
                  <th className="p-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {loading ? (
                  <tr>
                    <td
                      colSpan={totalColunas}
                      className="text-center py-8 text-slate-400"
                    >
                      Carregando efetivo...
                    </td>
                  </tr>
                ) : filteredPoliciais.length === 0 ? (
                  <tr>
                    <td
                      colSpan={totalColunas}
                      className="text-center py-8 text-slate-400"
                    >
                      Nenhum policial encontrado com os filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filteredPoliciais.map((p) => {
                    const roleAlvo = String(p.role || "policial").toLowerCase();
                    const p4PodeEditar = !(
                      userRole === "p4" &&
                      (roleAlvo === "master" || roleAlvo === "p4")
                    );

                    return (
                      <tr
                        key={p.id}
                        className="hover:bg-slate-50/80 transition-colors"
                      >
                        <td className="p-3.5">
                          <span className="font-semibold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-md text-[11px] border border-slate-200">
                            {p.posto_graduacao}
                          </span>
                        </td>
                        <td className="p-3.5 font-bold text-slate-900">
                          {p.nome_guerra}
                        </td>
                        <td className="p-3.5 font-mono text-slate-600">
                          {p.matricula || "N/I"}
                        </td>
                        <td className="p-3.5 text-slate-800">
                          {p.nome_completo}
                        </td>
                        <td className="p-3.5 font-mono text-slate-600">
                          {p.numeral || "—"}
                        </td>
                        {isMaster && (
                          <td className="p-3.5">
                            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase border border-blue-200">
                              {p.role || "policial"}
                            </span>
                          </td>
                        )}
                        <td className="p-3.5">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              p.status === "EM ATIVIDADE"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="p-3.5 text-right space-x-1">
                          <button
                            onClick={() => handleOpenModalView(p)}
                            className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors inline-flex"
                            title="Visualizar detalhes"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {isP4OrMaster && p4PodeEditar && (
                            <button
                              onClick={() => handleOpenModalEdit(p)}
                              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors inline-flex"
                              title="Editar cadastro"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}

                          {isMaster && (
                            <button
                              onClick={() => handleDelete(p.id, p.nome_guerra)}
                              className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors inline-flex"
                              title="Excluir policial"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL DE VISUALIZAR POLICIAL */}
      {isViewModalOpen && policialSelecionado && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 space-y-5">
            <div className="flex justify-between items-start border-b pb-3">
              <div>
                <span className="bg-slate-100 text-slate-800 text-[10px] font-bold px-2 py-0.5 rounded uppercase border">
                  {policialSelecionado.posto_graduacao}
                </span>
                <h2 className="text-xl font-bold text-slate-900 mt-1">
                  {policialSelecionado.nome_completo}
                </h2>
                <p className="text-xs text-slate-500 font-mono">
                  Guerra: {policialSelecionado.nome_guerra} | Matrícula:{" "}
                  {policialSelecionado.matricula || "N/I"}
                </p>
              </div>
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div
              className={`grid ${isMaster ? "grid-cols-3" : "grid-cols-2"} gap-3 bg-slate-50 p-3 rounded-xl border text-xs`}
            >
              <div>
                <p className="text-slate-400 uppercase font-semibold">
                  Numeral
                </p>
                <p className="font-bold text-slate-800 font-mono mt-0.5">
                  {policialSelecionado.numeral || "—"}
                </p>
              </div>
              {isMaster && (
                <div>
                  <p className="text-slate-400 uppercase font-semibold">
                    Perfil (Role)
                  </p>
                  <p className="font-bold text-blue-700 uppercase mt-0.5">
                    {policialSelecionado.role || "policial"}
                  </p>
                </div>
              )}
              <div>
                <p className="text-slate-400 uppercase font-semibold">
                  Situação
                </p>
                <p className="font-bold text-emerald-700 uppercase mt-0.5">
                  {policialSelecionado.status}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-700 uppercase flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-600" />
                <span>Equipamentos e Cautelas Ativas</span>
              </h3>

              {loadingCautelas ? (
                <p className="text-xs text-slate-400 text-center py-4">
                  Carregando...
                </p>
              ) : cautelasAtivas.length === 0 ? (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center text-slate-500 text-xs">
                  Nenhum armamento ou equipamento acautelado no momento.
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {cautelasAtivas.map((cautela) => (
                    <div
                      key={cautela.id}
                      className="bg-blue-50/50 border border-blue-200 p-3 rounded-xl flex justify-between items-center text-xs"
                    >
                      <div>
                        <p className="font-bold text-slate-900">
                          {cautela.equipamentos?.tipo || "Equipamento"} —{" "}
                          {cautela.equipamentos?.modelo_descricao || ""}
                        </p>
                        <p className="text-slate-500 font-mono mt-0.5">
                          Série/Tombo:{" "}
                          {cautela.equipamentos?.num_serie || "N/I"}
                        </p>
                      </div>
                      <span className="bg-emerald-600 text-white font-bold px-2.5 py-1 rounded-lg text-[10px]">
                        Cautela Ativa
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t">
              <button
                type="button"
                onClick={() => setIsViewModalOpen(false)}
                className="px-4 py-2 text-sm font-bold bg-slate-800 text-white rounded-xl"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Cadastro / Edição */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 my-8">
            <div className="flex justify-between items-center border-b pb-3">
              <h2 className="text-base font-bold text-slate-900">
                {editingId
                  ? "Editar Policial"
                  : "Cadastrar Policial / Servidor"}
              </h2>
              {editingId && isMaster && (
                <button
                  type="button"
                  onClick={handleResetarSenha}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg transition-colors shadow-sm"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>Resetar Senha</span>
                </button>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={formData.nome_completo}
                  onChange={(e) =>
                    setFormData({ ...formData, nome_completo: e.target.value })
                  }
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Nome de Guerra *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nome_guerra}
                    onChange={(e) =>
                      setFormData({ ...formData, nome_guerra: e.target.value })
                    }
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Matrícula / RE *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.matricula}
                    onChange={(e) =>
                      setFormData({ ...formData, matricula: e.target.value })
                    }
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-mono outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Posto / Graduação
                  </label>
                  <select
                    value={formData.posto_graduacao}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        posto_graduacao: e.target.value,
                      })
                    }
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs bg-white font-medium"
                  >
                    <option value="SOLDADO">SOLDADO</option>
                    <option value="CABO">CABO</option>
                    <option value="3º SARGENTO">3º SARGENTO</option>
                    <option value="2º SARGENTO">2º SARGENTO</option>
                    <option value="1º SARGENTO">1º SARGENTO</option>
                    <option value="SUBTENENTE">SUBTENENTE</option>
                    <option value="ASPIRANTE">ASPIRANTE</option>
                    <option value="2º TENENTE">2º TENENTE</option>
                    <option value="1º TENENTE">1º TENENTE</option>
                    <option value="CAPITÃO">CAPITÃO</option>
                    <option value="MAJOR">MAJOR</option>
                    <option value="TENENTE CORONEL">TENENTE CORONEL</option>
                    <option value="CORONEL">CORONEL</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Numeral de Identificação
                  </label>
                  <input
                    type="text"
                    disabled={
                      postosOficiais.includes(formData.posto_graduacao) ||
                      formData.posto_graduacao === "SUBTENENTE" ||
                      formData.posto_graduacao === "Subtenente"
                    }
                    placeholder={
                      postosOficiais.includes(formData.posto_graduacao) ||
                      formData.posto_graduacao === "SUBTENENTE"
                        ? "Não aplicável"
                        : "Ex: 31929"
                    }
                    value={formData.numeral}
                    onChange={(e) =>
                      setFormData({ ...formData, numeral: e.target.value })
                    }
                    className={`w-full p-2.5 border rounded-xl text-xs font-mono outline-none ${
                      postosOficiais.includes(formData.posto_graduacao) ||
                      formData.posto_graduacao === "SUBTENENTE" ||
                      formData.posto_graduacao === "Subtenente"
                        ? "bg-slate-200 text-slate-400 cursor-not-allowed border-slate-300"
                        : "bg-slate-50 border-slate-300"
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {isMaster && (
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">
                      Perfil de Acesso (Role)
                    </label>
                    <select
                      value={formData.role}
                      onChange={(e) =>
                        setFormData({ ...formData, role: e.target.value })
                      }
                      className="w-full p-2.5 border border-slate-300 rounded-xl text-xs bg-white font-bold"
                    >
                      <option value="policial">Policial</option>
                      <option value="armeiro">Armeiro</option>
                      <option value="p4">P4</option>
                      <option value="master">Master</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Situação
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value })
                    }
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs bg-white"
                  >
                    <option value="EM ATIVIDADE">EM ATIVIDADE</option>
                    <option value="FÉRIAS">FÉRIAS</option>
                    <option value="LICENÇA">LICENÇA</option>
                    <option value="AGREGADO">AGREGADO</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow"
                >
                  {editingId ? "Atualizar Dados" : "Salvar Cadastro"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
