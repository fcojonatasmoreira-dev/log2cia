import React, { useState, useEffect } from "react";
import {
  Plus,
  Search,
  RefreshCw,
  AlertCircle,
  Shield,
  ShieldAlert,
  Disc,
  Box,
} from "lucide-react";
import {
  getEquipamentos,
  createEquipamento,
} from "../services/equipamentosService";
import BadgeStatus from "../components/ui/BadgeStatus";

export default function Inventario() {
  const [equipamentos, setEquipamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTipo, setFilterTipo] = useState("todos");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [formData, setFormData] = useState({
    tipo: "armamento",
    num_serie: "",
    patrimonio: "",
    modelo_descricao: "",
    status: "disponivel",
    detalhes: {},
  });

  const loadEquipamentos = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getEquipamentos();
      setEquipamentos(data);
    } catch (err) {
      setError("Falha ao carregar acervo. Verifique a conexão.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEquipamentos();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await createEquipamento(formData);
      setIsModalOpen(false);
      setFormData({
        tipo: "armamento",
        num_serie: "",
        patrimonio: "",
        modelo_descricao: "",
        status: "disponivel",
        detalhes: {},
      });
      loadEquipamentos();
    } catch (err) {
      alert(`Erro ao cadastrar equipamento: ${err.message}`);
    }
  };

  const filteredEquipamentos = equipamentos.filter((eq) => {
    const matchesSearch =
      eq.modelo_descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (eq.num_serie &&
        eq.num_serie.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (eq.patrimonio &&
        eq.patrimonio.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesTipo = filterTipo === "todos" || eq.tipo === filterTipo;

    return matchesSearch && matchesTipo;
  });

  const getItemIcon = (tipo) => {
    switch (tipo) {
      case "armamento":
        return Shield;
      case "colete":
        return ShieldAlert;
      case "municao":
        return Disc;
      default:
        return Box;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Gestão de Acervo
          </h1>
          <p className="text-sm text-slate-500">
            Controle de armamentos, coletes balísticos e munições da unidade.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2.5 rounded-lg transition-colors shadow-xs"
        >
          <Plus className="w-5 h-5" />
          <span>Novo Equipamento</span>
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por Nº de Série, Patrimônio ou Descrição..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center space-x-2">
          <select
            value={filterTipo}
            onChange={(e) => setFilterTipo(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          >
            <option value="todos">Todos os Tipos</option>
            <option value="armamento">Armamentos</option>
            <option value="colete">Coletes</option>
            <option value="municao">Munições</option>
            <option value="acessorio">Acessórios</option>
          </select>

          <button
            onClick={loadEquipamentos}
            className="p-2 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Tabela de Equipamentos */}
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
                  <th className="px-6 py-3.5">Tipo</th>
                  <th className="px-6 py-3.5">Nº de Série</th>
                  <th className="px-6 py-3.5">Patrimônio</th>
                  <th className="px-6 py-3.5">Modelo / Descrição</th>
                  <th className="px-6 py-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm font-medium text-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan="5" className="text-center py-8 text-slate-400">
                      Carregando acervo...
                    </td>
                  </tr>
                ) : filteredEquipamentos.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center py-8 text-slate-400">
                      Nenhum equipamento cadastrado.
                    </td>
                  </tr>
                ) : (
                  filteredEquipamentos.map((item) => {
                    const IconComp = getItemIcon(item.tipo);
                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50/80 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-2">
                            <IconComp className="w-4 h-4 text-slate-500" />
                            <span className="capitalize font-medium text-slate-800">
                              {item.tipo}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono font-bold text-slate-900">
                          {item.num_serie || "—"}
                        </td>
                        <td className="px-6 py-4 font-mono text-slate-600">
                          {item.patrimonio || "—"}
                        </td>
                        <td className="px-6 py-4 text-slate-800">
                          {item.modelo_descricao}
                        </td>
                        <td className="px-6 py-4">
                          <BadgeStatus status={item.status} />
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

      {/* Modal Cadastro de Equipamento */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <h2 className="text-xl font-bold text-slate-900">
              Cadastrar Item no Acervo
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Modelo / Descrição
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Pistola Glock G22 Gen5 .40"
                  value={formData.modelo_descricao}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      modelo_descricao: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Tipo
                  </label>
                  <select
                    value={formData.tipo}
                    onChange={(e) =>
                      setFormData({ ...formData, tipo: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="armamento">Armamento</option>
                    <option value="colete">Colete Balístico</option>
                    <option value="municao">Munição</option>
                    <option value="acessorio">Acessório</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Status Inicial
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="disponivel">Disponível</option>
                    <option value="manutencao">Manutenção</option>
                    <option value="baixado">Baixado</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Nº de Série
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: GKA12345"
                    value={formData.num_serie}
                    onChange={(e) =>
                      setFormData({ ...formData, num_serie: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Patrimônio
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: PAT-2024-001"
                    value={formData.patrimonio}
                    onChange={(e) =>
                      setFormData({ ...formData, patrimonio: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
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
                  Cadastrar Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
