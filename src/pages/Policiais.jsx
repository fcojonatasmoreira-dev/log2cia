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
} from "lucide-react";
import {
  getPoliciais,
  createPolicial,
  updatePolicial,
  deletePolicial,
} from "../services/policiaisService";
import { supabase } from "../lib/supabaseClient";

export default function Policiais() {
  const [searchParams] = useSearchParams();
  const initialSearch = searchParams.get("search") || "";

  const [policiais, setPoliciais] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState(initialSearch);

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
      setSearchTerm(query);
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

  // Verificar o cargo do usuário logado pelo localStorage
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
    // Trava de segurança extra no clique: P4 não pode editar Master ou P4
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

  // Função exclusiva Master para Resetar Senha do militar
  const handleResetarSenha = async () => {
    if (!editingId) return;

    if (
      !confirm(
        "Confirma o reset da senha deste militar? A senha voltará a ser o numeral e ele precisará redefini-la no próximo acesso.",
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

      alert(
        "Senha resetada com sucesso! O militar agora está em regime de primeiro acesso.",
      );
      setIsModalOpen(false);
      loadPoliciais();
    } catch (err) {
      console.error("Erro ao resetar senha:", err);
      alert("Erro ao resetar senha: " + err.message);
    }
  };

  // Abrir Modal de Visualização e buscar cautelas ativas do policial cruzando com cautela_itens
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
      console.error("Erro ao carregar cautelas do policial:", err);
      setCautelasAtivas([]);
    } finally {
      setLoadingCautelas(false);
    }
  };

  const handleDelete = async (id, nomeGuerra) => {
    if (
      !confirm(
        `Confirma a exclusão do policial ${nomeGuerra}? Esta ação não pode ser desfeita.`,
      )
    )
      return;
    try {
      await deletePolicial(id);
      loadPoliciais();
    } catch (err) {
      alert(`Erro ao excluir policial: ${err.message}`);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Trava de segurança estrita de RBAC para P4 ao submeter o formulário
    if (userRole === "p4") {
      if (editingId) {
        const policialAlvo = policiais.find((p) => p.id === editingId);
        if (
          policialAlvo &&
          ["master", "p4"].includes(String(policialAlvo.role).toLowerCase())
        ) {
          alert(
            "Acesso negado: Usuários P4 não possuem privilégios para alterar dados de perfis Master ou P4.",
          );
          return;
        }
      }
      if (formData.role !== "policial") {
        alert(
          "Acesso negado: Usuários P4 só podem definir o perfil como policial comum.",
        );
        return;
      }
    }

    try {
      if (editingId) {
        await updatePolicial(editingId, formData);

        // Se o usuário editou o próprio perfil logado, atualiza o localStorage em tempo real
        const usuarioSalvo = localStorage.getItem("log2cia_user");
        if (usuarioSalvo) {
          const usuarioAtual = JSON.parse(usuarioSalvo);
          if (
            usuarioAtual.id === editingId ||
            usuarioAtual.matricula === formData.matricula
          ) {
            const usuarioAtualizado = { ...usuarioAtual, ...formData };
            localStorage.setItem(
              "log2cia_user",
              JSON.stringify(usuarioAtualizado),
            );
            window.dispatchEvent(new Event("usuarioAtualizado"));
          }
        }
      } else {
        const dadosParaSalvar =
          userRole === "p4" ? { ...formData, role: "policial" } : formData;
        await createPolicial(dadosParaSalvar);
      }
      setIsModalOpen(false);
      loadPoliciais();
    } catch (err) {
      alert(`Erro ao salvar dados do policial: ${err.message}`);
    }
  };

  const isMaster = userRole === "master";
  const isP4OrMaster = userRole === "master" || userRole === "p4";

  const filteredPoliciais = policiais.filter(
    (p) =>
      (p.nome_guerra &&
        p.nome_guerra.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.nome_completo &&
        p.nome_completo.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.matricula && p.matricula.includes(searchTerm)),
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Gestão de Efetivo
          </h1>
          <p className="text-sm text-slate-500">
            Cadastro e acompanhamento de policiais da unidade.
          </p>
        </div>
        {isP4OrMaster && (
          <button
            onClick={handleOpenModalNew}
            className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2.5 rounded-lg transition-colors shadow-xs"
          >
            <Plus className="w-5 h-5" />
            <span>Novo Policial</span>
          </button>
        )}
      </div>

      {/* Barra de Filtros */}
      <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por Nome de Guerra, Completo ou Matrícula..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-mono"
          />
        </div>
        <button
          onClick={loadPoliciais}
          className="p-2 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
          title="Atualizar dados"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Tabela de Dados */}
      {error ? (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-center space-x-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="px-6 py-3.5">Posto / Grad.</th>
                  <th className="px-6 py-3.5">Nome de Guerra</th>
                  <th className="px-6 py-3.5">Matrícula</th>
                  <th className="px-6 py-3.5">Nome Completo</th>
                  <th className="px-6 py-3.5">Numeral</th>
                  <th className="px-6 py-3.5">Perfil</th>
                  <th className="px-6 py-3.5">Situação</th>
                  <th className="px-6 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm font-medium text-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-400">
                      Carregando efetivo...
                    </td>
                  </tr>
                ) : filteredPoliciais.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-400">
                      Nenhum policial encontrado.
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
                        <td className="px-6 py-4">
                          <span className="font-semibold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-md text-xs border border-slate-200">
                            {p.posto_graduacao}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-bold text-slate-900">
                          {p.nome_guerra}
                        </td>
                        <td className="px-6 py-4 font-mono text-slate-600">
                          {p.matricula || "N/I"}
                        </td>
                        <td className="px-6 py-4 text-slate-800">
                          {p.nome_completo}
                        </td>
                        <td className="px-6 py-4 font-mono text-slate-600">
                          {p.numeral || "—"}
                        </td>
                        <td className="px-6 py-4">
                          <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-bold uppercase border border-blue-200">
                            {p.role || "policial"}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              p.status === "EM ATIVIDADE"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right space-x-1">
                          {/* Botão Visualizar (Disponível para todos) */}
                          <button
                            onClick={() => handleOpenModalView(p)}
                            className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors inline-flex"
                            title="Visualizar detalhes e acautelamentos"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Botão Editar (Bloqueado para P4 editar perfis Master ou P4) */}
                          {isP4OrMaster && p4PodeEditar && (
                            <button
                              onClick={() => handleOpenModalEdit(p)}
                              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors inline-flex"
                              title="Editar cadastro"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}

                          {/* Botão Excluir (Aparece SOMENTE para Master) */}
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

      {/* MODAL DE VISUALIZAR POLICIAL E CAUTELAS */}
      {isViewModalOpen && policialSelecionado && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full p-6 space-y-5">
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

            <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3 rounded-xl border text-xs">
              <div>
                <p className="text-slate-400 uppercase font-semibold">
                  Numeral
                </p>
                <p className="font-bold text-slate-800 font-mono mt-0.5">
                  {policialSelecionado.numeral || "—"}
                </p>
              </div>
              <div>
                <p className="text-slate-400 uppercase font-semibold">
                  Perfil (Role)
                </p>
                <p className="font-bold text-blue-700 uppercase mt-0.5">
                  {policialSelecionado.role || "policial"}
                </p>
              </div>
              <div>
                <p className="text-slate-400 uppercase font-semibold">
                  Situação
                </p>
                <p className="font-bold text-emerald-700 uppercase mt-0.5">
                  {policialSelecionado.status}
                </p>
              </div>
            </div>

            {/* Seção de Armamentos e Equipamentos Acautelados */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-700 uppercase flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-600" />
                <span>Equipamentos e Cautelas Ativas</span>
              </h3>

              {loadingCautelas ? (
                <p className="text-xs text-slate-400 text-center py-4">
                  Carregando acautelamentos...
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
                          {cautela.equipamentos?.tipo ||
                            cautela.equipamentos?.nome ||
                            "Armamento / Equipamento"}{" "}
                          —{" "}
                          {cautela.equipamentos?.modelo ||
                            cautela.equipamentos?.modelo_descricao ||
                            ""}
                        </p>
                        <p className="text-slate-500 font-mono mt-0.5">
                          Série/Tombo:{" "}
                          {cautela.equipamentos?.numero_serie ||
                            cautela.equipamentos?.num_serie ||
                            cautela.equipamentos?.tombo ||
                            "N/I"}
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
                className="px-4 py-2 text-sm font-bold bg-slate-800 hover:bg-slate-900 text-white rounded-xl transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Cadastro / Edição */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-900">
                {editingId
                  ? "Editar Policial"
                  : "Cadastrar Policial / Servidor"}
              </h2>
              {/* Botão exclusivo Master para Resetar Senha */}
              {editingId && isMaster && (
                <button
                  type="button"
                  onClick={handleResetarSenha}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg transition-colors shadow-sm"
                  title="Reseta a senha para o numeral e força primeiro acesso"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>Resetar Senha</span>
                </button>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Nome Completo
                </label>
                <input
                  type="text"
                  required
                  value={formData.nome_completo}
                  onChange={(e) =>
                    setFormData({ ...formData, nome_completo: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Nome de Guerra
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nome_guerra}
                    onChange={(e) =>
                      setFormData({ ...formData, nome_guerra: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Matrícula / RE
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.matricula}
                    onChange={(e) =>
                      setFormData({ ...formData, matricula: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 font-mono outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
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
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  >
                    <option value="SOLDADO">SOLDADO</option>
                    <option value="CABO">CABO</option>
                    <option value="3º SARGENTO">3º SARGENTO</option>
                    <option value="2º SARGENTO">2º SARGENTO</option>
                    <option value="1º SARGENTO">1º SARGENTO</option>
                    <option value="SUBTENENTE">SUBTENENTE</option>
                    <option value="2º TENENTE">2º TENENTE</option>
                    <option value="1º TENENTE">1º TENENTE</option>
                    <option value="CAPITÃO">CAPITÃO</option>
                    <option value="MAJOR">MAJOR</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Numeral de Identificação
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 31929"
                    value={formData.numeral}
                    onChange={(e) =>
                      setFormData({ ...formData, numeral: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 font-mono outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {isMaster ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Perfil de Acesso (Role)
                    </label>
                    <select
                      value={formData.role}
                      onChange={(e) =>
                        setFormData({ ...formData, role: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white font-bold"
                    >
                      <option value="policial">Policial</option>
                      <option value="armeiro">Armeiro</option>
                      <option value="p4">P4</option>
                      <option value="master">Master</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Perfil de Acesso (Role)
                    </label>
                    <input
                      type="text"
                      disabled
                      value={formData.role.toUpperCase()}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-100 text-slate-500 font-bold uppercase cursor-not-allowed"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Situação
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  >
                    <option value="EM ATIVIDADE">EM ATIVIDADE</option>
                    <option value="FÉRIAS">FÉRIAS</option>
                    <option value="LICENÇA">LICENÇA</option>
                    <option value="AGREGADO">AGREGADO</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow"
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
