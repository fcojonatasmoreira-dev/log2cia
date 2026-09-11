import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Plus,
  Search,
  AlertCircle,
  RefreshCw,
  Edit3,
  Trash2,
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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMaster, setIsMaster] = useState(false);
  const [editingId, setEditingId] = useState(null);

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
    posto_graduacao: "1º SARGENTO",
    numeral: "",
    unidade: "2ª CIA / 15º BPM",
    status: "EM ATIVIDADE",
  });

  // Verificar se o usuário logado é Master
  const checkMasterRole = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (data?.role === "master") {
        setIsMaster(true);
      }
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
    checkMasterRole();
    loadPoliciais();
  }, []);

  const handleOpenModalNew = () => {
    setEditingId(null);
    setFormData({
      nome_completo: "",
      nome_guerra: "",
      matricula: "",
      posto_graduacao: "1º SARGENTO",
      numeral: "",
      unidade: "2ª CIA / 15º BPM",
      status: "EM ATIVIDADE",
    });
    setIsModalOpen(true);
  };

  const handleOpenModalEdit = (p) => {
    setEditingId(p.id);
    setFormData({
      nome_completo: p.nome_completo || "",
      nome_guerra: p.nome_guerra || "",
      matricula: p.matricula || "",
      posto_graduacao: p.posto_graduacao || "1º SARGENTO",
      numeral: p.numeral || "",
      unidade: p.unidade || "2ª CIA / 15º BPM",
      status: p.status || "EM ATIVIDADE",
    });
    setIsModalOpen(true);
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
    try {
      if (editingId) {
        await updatePolicial(editingId, formData);
      } else {
        await createPolicial(formData);
      }
      setIsModalOpen(false);
      loadPoliciais();
    } catch (err) {
      alert(`Erro ao salvar dados do policial: ${err.message}`);
    }
  };

  const filteredPoliciais = policiais.filter(
    (p) =>
      p.nome_guerra.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.nome_completo.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
        <button
          onClick={handleOpenModalNew}
          className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2.5 rounded-lg transition-colors shadow-xs"
        >
          <Plus className="w-5 h-5" />
          <span>Novo Policial</span>
        </button>
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
                  <th className="px-6 py-3.5">Situação</th>
                  <th className="px-6 py-3.5">Unidade</th>
                  {isMaster && (
                    <th className="px-6 py-3.5 text-right">Ações (Master)</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm font-medium text-slate-700">
                {loading ? (
                  <tr>
                    <td
                      colSpan={isMaster ? 7 : 6}
                      className="text-center py-8 text-slate-400"
                    >
                      Carregando efetivo...
                    </td>
                  </tr>
                ) : filteredPoliciais.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isMaster ? 7 : 6}
                      className="text-center py-8 text-slate-400"
                    >
                      Nenhum policial encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredPoliciais.map((p) => (
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
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {p.unidade}
                      </td>
                      {isMaster && (
                        <td className="px-6 py-4 text-right space-x-2">
                          <button
                            onClick={() => handleOpenModalEdit(p)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors inline-flex"
                            title="Editar cadastro"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(p.id, p.nome_guerra)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors inline-flex"
                            title="Excluir policial"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Cadastro / Edição */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <h2 className="text-xl font-bold text-slate-900">
              {editingId ? "Editar Policial" : "Cadastrar Policial / Servidor"}
            </h2>
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
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
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Matrícula / RE
                  </label>
                  <input
                    type="text"
                    value={formData.matricula}
                    onChange={(e) =>
                      setFormData({ ...formData, matricula: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 font-mono"
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
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
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
                    Situação
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="EM ATIVIDADE">EM ATIVIDADE</option>
                    <option value="FÉRIAS">FÉRIAS</option>
                    <option value="LICENÇA">LICENÇA</option>
                    <option value="AGREGADO">AGREGADO</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
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
