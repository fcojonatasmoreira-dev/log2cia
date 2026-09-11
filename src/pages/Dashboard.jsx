import React, { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { getDashboardMetrics } from "../services/dashboardService";

export default function Dashboard() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMetrics = async () => {
    try {
      setLoading(true);
      const data = await getDashboardMetrics();
      setMetrics(data);
    } catch (err) {
      console.error("Erro ao carregar métricas:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Painel Geral — Log2CIA
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Status operacional e controle do efetivo em tempo real.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            Sistema Operacional
          </span>
          <button
            onClick={loadMetrics}
            className="p-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg shadow-xs transition-colors"
            title="Atualizar Dados"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Grid com os 4 Cards da Imagem */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1: Cautelas Ativas */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-2">
          <p className="text-xs font-semibold text-slate-500">
            Cautelas Ativas
          </p>
          <p className="text-3xl font-bold text-slate-900">
            {loading ? "-" : metrics?.cautelasAtivas}
          </p>
        </div>

        {/* Card 2: Armas Disponíveis */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-2">
          <p className="text-xs font-semibold text-slate-500">
            Armas Disponíveis
          </p>
          <p className="text-3xl font-bold text-slate-900">
            {loading ? "-" : metrics?.armasDisponiveis}
          </p>
        </div>

        {/* Card 3: Coletes a Vencer (30d) */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-2">
          <p className="text-xs font-semibold text-slate-500">
            Coletes a Vencer (30d)
          </p>
          <p className="text-3xl font-bold text-amber-600">
            {loading ? "-" : metrics?.coletesAVencer}
          </p>
        </div>

        {/* Card 4: Efetivo Ativo */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-2">
          <p className="text-xs font-semibold text-slate-500">Efetivo Ativo</p>
          <p className="text-3xl font-bold text-slate-900">
            {loading ? "-" : metrics?.efetivoAtivo}
          </p>
        </div>
      </div>
    </div>
  );
}
