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
    loadUserData();
    // Só carrega métricas se não for policial comum
    const usuarioSalvo = localStorage.getItem("log2cia_user");
    if (usuarioSalvo) {
      const dados = JSON.parse(usuarioSalvo);
      if (String(dados?.role || "").toLowerCase() !== "policial") {
        loadMetrics();
      } else {
        setLoadingMetrics(false);
      }
    }
  }, []);

  const handleAtualizarTudo = () => {
    loadUserData();
    const userRole = String(usuario?.role || "").toLowerCase();
    if (userRole !== "policial") {
      loadMetrics();
    }
  };

  // Identifica o perfil do usuário logado
  const userRole = String(usuario?.role || "").toLowerCase();
  const isArmeiro = userRole === "armeiro";
  const isPolicialComum = userRole === "policial";

  return (
    <div className="space-y-6">
      {/* TOP HEADER DO PAINEL GERAL */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isPolicialComum
              ? "Painel de Avisos — Log2CIA"
              : "Painel Geral — Log2CIA"}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {isPolicialComum
              ? "Acompanhe abaixo as diretrizes e avisos emanados pelo comando."
              : "Status operacional e controle do efetivo em tempo real."}{" "}
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

      {/* SE FOR POLICIAL COMUM, O DASHBOARD FICA ZERADO DE CARDS DE MÉTRICAS */}
      {isPolicialComum ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mx-auto text-xl font-bold shadow-inner">
            📢
          </div>
          <h2 className="text-base font-bold text-slate-800">
            Nenhum aviso ou determinação no momento
          </h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Esta seção será atualizada em breve com as diretrizes, avisos e
            links úteis emanados pelo comando da unidade.
          </p>
        </div>
      ) : (
        /* GRID DE CARDS COM RESTRIÇÃO CONDICIONAL PARA ARMEIRO / ADMIN */
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              ["Armamentos Disponíveis", metrics?.armamentosDisponiveis],
              ["Estoque da Reserva", metrics?.estoqueDaReserva],
              ["Acauteladas — Temporárias", metrics?.acauteladasTemporarias],
              ["Acauteladas — Longo Prazo", metrics?.acauteladasLongoPrazo],
              ["Em Manutenção", metrics?.emManutencao],
              ["Em Perícia", metrics?.emPericia],
              ["Apreendidas", metrics?.apreendidas],
              ["Baixa Definitiva", metrics?.baixaDefinitiva],
            ].map(([titulo, valor]) => (
              <div key={titulo} className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-2">
                <p className="text-xs font-semibold text-slate-500">{titulo}</p>
                <p className="text-3xl font-bold text-slate-900">
                  {loadingMetrics ? "-" : (valor ?? 0)}
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-2">
              <p className="text-xs font-semibold text-slate-500">Cautelas Temporárias Ativas</p>
              <p className="text-3xl font-bold text-slate-900">{loadingMetrics ? "-" : (metrics?.cautelasTemporariasAtivas ?? 0)}</p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-2">
              <p className="text-xs font-semibold text-slate-500">Cautelas Longo Prazo Ativas</p>
              <p className="text-3xl font-bold text-slate-900">{loadingMetrics ? "-" : (metrics?.cautelasLongoPrazoAtivas ?? 0)}</p>
            </div>
            {!isArmeiro && (
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-2">
                <p className="text-xs font-semibold text-slate-500">Coletes a Vencer (30d)</p>
                <p className="text-3xl font-bold text-amber-600">{loadingMetrics ? "-" : (metrics?.coletesAVencer ?? 0)}</p>
              </div>
            )}
            {!isArmeiro && (
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-2">
                <p className="text-xs font-semibold text-slate-500">Efetivo Ativo</p>
                <p className="text-3xl font-bold text-slate-900">{loadingMetrics ? "-" : (metrics?.efetivoAtivo ?? 0)}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
