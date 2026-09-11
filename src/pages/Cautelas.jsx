import React, { useState, useEffect } from "react";
import {
  Plus,
  Repeat,
  CheckCircle,
  RefreshCw,
  AlertCircle,
  Shield,
  User,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react";
import {
  getCautelas,
  createCautela,
  fecharCautela,
} from "../services/cautelasService";
import { getPoliciais } from "../services/policiaisService";
import { getEquipamentos } from "../services/equipamentosService";
import { supabase } from "../lib/supabaseClient";
import BadgeStatus from "../components/ui/BadgeStatus";

export default function Cautelas() {
  const [cautelas, setCautelas] = useState([]);
  const [policiais, setPoliciais] = useState([]);
  const [equipamentosDisponiveis, setEquipamentosDisponiveis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [selectedPolicial, setSelectedPolicial] = useState("");
  const [selectedEquipamentos, setSelectedEquipamentos] = useState([]);
  const [observacoes, setObservacoes] = useState("");

  const loadData = async () => {
    try {
      setLoading(true);
      const [cautelasData, policiaisData, equipamentosData] = await Promise.all(
        [getCautelas(), getPoliciais(), getEquipamentos()],
      );

      setCautelas(cautelasData);
      setPoliciais(policiaisData.filter((p) => p.status === "EM ATIVIDADE"));
      setEquipamentosDisponiveis(
        equipamentosData.filter((e) => e.status === "disponivel"),
      );
    } catch (err) {
      alert(`Erro ao carregar dados: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleEquipamento = (eqId) => {
    if (selectedEquipamentos.includes(eqId)) {
      setSelectedEquipamentos(selectedEquipamentos.filter((id) => id !== eqId));
    } else {
      setSelectedEquipamentos([...selectedEquipamentos, eqId]);
    }
  };

  const handleAbrirCautela = async (e) => {
    e.preventDefault();
    if (!selectedPolicial || selectedEquipamentos.length === 0) {
      alert("Selecione o policial e ao menos um equipamento disponível.");
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const itensFormatted = selectedEquipamentos.map((id) => ({
        equipamento_id: id,
        quantidade: 1,
        condicao_saida: "Sem avarias / Funcional",
      }));

      await createCautela({
        policial_id: selectedPolicial,
        operador_id: user.id,
        observacoes,
        itens: itensFormatted,
      });

      setIsModalOpen(false);
      setSelectedPolicial("");
      setSelectedEquipamentos([]);
      setObservacoes("");
      loadData();
    } catch (err) {
      alert(`Erro ao registrar cautela: ${err.message}`);
    }
  };

  const handleDevolucao = async (cautelaId) => {
    if (
      !confirm(
        "Confirmar a devolução de todos os itens desta cautela ao acervo?",
      )
    )
      return;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await fecharCautela(cautelaId, user.id);
      loadData();
    } catch (err) {
      alert(`Erro na devolução: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Controle de Cautelas
          </h1>
          <p className="text-sm text-slate-500">
            Registro de saída e devolução de material bélico do efetivo.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2.5 rounded-lg transition-colors shadow-xs"
        >
          <Plus className="w-5 h-5" />
          <span>Nova Cautela</span>
        </button>
      </div>

      {/* Tabela de Cautelas */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="px-6 py-3.5">Policial / Servidor</th>
                <th className="px-6 py-3.5">Itens Cautelados</th>
                <th className="px-6 py-3.5">Data / Hora Saída</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm font-medium text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan="5" className="text-center py-8 text-slate-400">
                    Carregando movimentações...
                  </td>
                </tr>
              ) : cautelas.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-8 text-slate-400">
                    Nenhuma cautela registrada até o momento.
                  </td>
                </tr>
              ) : (
                cautelas.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">
                        {c.policiais?.posto_graduacao}{" "}
                        {c.policiais?.nome_guerra}
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        RE: {c.policiais?.matricula}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        {c.cautela_itens?.map((ci) => (
                          <div
                            key={ci.id}
                            className="text-xs bg-slate-100 text-slate-800 px-2 py-1 rounded border border-slate-200 font-mono inline-block mr-1"
                          >
                            {ci.equipamentos?.modelo_descricao} (
                            {ci.equipamentos?.num_serie || "S/N"})
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-slate-600">
                      {new Date(c.data_cautela).toLocaleString("pt-BR")}
                    </td>
                    <td className="px-6 py-4">
                      <BadgeStatus status={c.status} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      {c.status === "ativa" && (
                        <button
                          onClick={() => handleDevolucao(c.id)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors inline-flex items-center space-x-1"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Receber Devolução</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Abertura de Cautela */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-xl w-full p-6 space-y-4">
            <h2 className="text-xl font-bold text-slate-900">
              Abertura de Cautela Bélica
            </h2>
            <form onSubmit={handleAbrirCautela} className="space-y-4">
              {/* Seleção do Policial */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Policial Requerente
                </label>
                <select
                  required
                  value={selectedPolicial}
                  onChange={(e) => setSelectedPolicial(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Selecione o Policial --</option>
                  {policiais.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.posto_graduacao} {p.nome_guerra} ({p.matricula})
                    </option>
                  ))}
                </select>
              </div>

              {/* Seleção de Equipamentos Disponíveis */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Selecione os Itens Disponíveis para Saída
                </label>
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg p-2 divide-y divide-slate-100">
                  {equipamentosDisponiveis.length === 0 ? (
                    <p className="text-xs text-slate-400 p-2 text-center">
                      Nenhum equipamento disponível no acervo.
                    </p>
                  ) : (
                    equipamentosDisponiveis.map((eq) => (
                      <label
                        key={eq.id}
                        className="flex items-center space-x-3 p-2 hover:bg-slate-50 cursor-pointer text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={selectedEquipamentos.includes(eq.id)}
                          onChange={() => handleToggleEquipamento(eq.id)}
                          className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                        />
                        <div>
                          <p className="font-bold text-slate-800">
                            {eq.modelo_descricao}
                          </p>
                          <p className="text-slate-500 font-mono">
                            Série: {eq.num_serie || "S/N"} | Patr:{" "}
                            {eq.patrimonio || "N/I"}
                          </p>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Observações do Armeiro
                </label>
                <textarea
                  rows="2"
                  placeholder="Ex: Cautela para serviço de patrulhamento rural."
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
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
                  className="px-5 py-2 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-md"
                >
                  Confirmar Saída
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
