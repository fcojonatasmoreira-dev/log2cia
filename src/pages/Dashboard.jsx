import React, { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { getDashboardMetrics } from "../services/dashboardService";

export default function Dashboard() {
  const [metrics, setMetrics] = useState(null);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [usuario, setUsuario] = useState(null);

  // 1. Carregar Métricas do Dashboard
  const loadMetrics = async () => {
    try {
      setLoadingMetrics(true);
      const data = await getDashboardMetrics();
      setMetrics(data);
    } catch (err) {
      console.error("Erro ao carregar métricas:", err);
    } finally {
      setLoadingMetrics(false);
    }
  };

  // 2. Ler Operador Ativo do LocalStorage
  const loadUserData = () => {
    try {
      const usuarioSalvo = localStorage.getItem("log2cia_user");
      if (usuarioSalvo) {
        setUsuario(JSON.parse(usuarioSalvo));
      }
    } catch (err) {
      console.error("Erro ao carregar operador do storage:", err);
    }
  };

  useEffect(() => {
    loadMetrics();
    loadUserData();
  }, []);

  const handleAtualizarTudo = () => {
    loadMetrics();
    loadUserData();
  };

  // Identifica se o usuário logado é armeiro
  const userRole = String(usuario?.role || "").toLowerCase();
  const isArmeiro = userRole === "armeiro";

  return (
    <div className="space-y-6">
      {/* TOP HEADER DO PAINEL GERAL */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Painel Geral — Log2CIA
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Status operacional e controle do efetivo em tempo real.{" "}
            {usuario?.nome_guerra || usuario?.nome_completo
              ? `Bem-vindo(a), ${usuario.nome_guerra || usuario.nome_completo}.`
              : ""}
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            Sistema Operacional
          </span>
          <button
            onClick={handleAtualizarTudo}
            className="p-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg shadow-xs transition-colors"
            title="Atualizar Dados"
          >
            <RefreshCw
              className={`w-4 h-4 ${loadingMetrics ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* GRID DE CARDS COM RESTRIÇÃO CONDICIONAL PARA ARMEIRO */}
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 ${
          isArmeiro ? "lg:grid-cols-2 max-w-2xl" : "lg:grid-cols-4"
        } gap-6`}
      >
        {/* Card 1: Cautelas Ativas (Visível para todos) */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-2">
          <p className="text-xs font-semibold text-slate-500">
            Cautelas Ativas
          </p>
          <p className="text-3xl font-bold text-slate-900">
            {loadingMetrics ? "-" : (metrics?.cautelasAtivas ?? 0)}
          </p>
        </div>

        {/* Card 2: Armas Disponíveis (Visível para todos) */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-2">
          <p className="text-xs font-semibold text-slate-500">
            Armas Disponíveis
          </p>
          <p className="text-3xl font-bold text-slate-900">
            {loadingMetrics ? "-" : (metrics?.armasDisponiveis ?? 0)}
          </p>
        </div>

        {/* Card 3: Coletes a Vencer (Oculto para Armeiro) */}
        {!isArmeiro && (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-2">
            <p className="text-xs font-semibold text-slate-500">
              Coletes a Vencer (30d)
            </p>
            <p className="text-3xl font-bold text-amber-600">
              {loadingMetrics ? "-" : (metrics?.coletesAVencer ?? 0)}
            </p>
          </div>
        )}

        {/* Card 4: Efetivo Ativo (Oculto para Armeiro) */}
        {!isArmeiro && (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-2">
            <p className="text-xs font-semibold text-slate-500">
              Efetivo Ativo
            </p>
            <p className="text-3xl font-bold text-slate-900">
              {loadingMetrics ? "-" : (metrics?.efetivoAtivo ?? 0)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
