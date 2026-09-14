import React, { useState, useEffect } from "react";
import { User, Shield, Mail, Key, RefreshCw } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { getDashboardMetrics } from "../services/dashboardService";

export default function Dashboard() {
  const [metrics, setMetrics] = useState(null);
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  // Estados do Usuário Logado
  const [usuarioLogado, setUsuarioLogado] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);

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

  // 2. Carregar Identificação do Operador Ativo
  const loadUserData = async () => {
    try {
      setLoadingUser(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setUsuarioLogado(user);

        // Identificação de ambiente de teste local (localhost)
        const isDev =
          import.meta.env.DEV &&
          (window.location.hostname === "localhost" ||
            window.location.hostname === "127.0.0.1");
        const userEmail = user.email?.toLowerCase();

        const { data: profileData } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        // Mapeamento dinâmico de papel com suporte a dev local
        let roleFinal = profileData?.role || "operador";
        if (userEmail === "jonatas.sillv@gmail.com") roleFinal = "master";
        if (isDev && userEmail === "fcojonatasmoreira@gmail.com")
          roleFinal = "armeiro";

        setPerfil({
          nome:
            profileData?.nome ||
            user.user_metadata?.full_name ||
            "Operador Log2CIA",
          role: roleFinal,
          matricula: profileData?.matricula || "N/I",
          posto: profileData?.posto_graduacao || "PM",
        });
      }
    } catch (err) {
      console.error("Erro ao carregar operador:", err.message);
    } finally {
      setLoadingUser(false);
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

  // Formatação visual da Badge de Nível de Acesso
  const getBadgeRole = (role) => {
    switch (role?.toLowerCase()) {
      case "master":
        return {
          label: "Master / Administrador",
          bg: "bg-red-500/20 text-red-300 border-red-500/30",
        };
      case "armeiro":
      case "p4":
        return {
          label: "Armeiro / P4 (Operacional)",
          bg: "bg-blue-500/20 text-blue-300 border-blue-500/30",
        };
      default:
        return {
          label: "Policial / Efetivo",
          bg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
        };
    }
  };

  const badgeInfo = getBadgeRole(perfil?.role);

  return (
    <div className="space-y-6">
      {/* 1. CARD DE IDENTIFICAÇÃO DO OPERADOR LOGADO */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl text-white">
        {loadingUser ? (
          <div className="animate-pulse flex space-x-4 items-center">
            <div className="rounded-xl bg-slate-800 h-12 w-12"></div>
            <div className="flex-1 space-y-2 py-1">
              <div className="h-4 bg-slate-800 rounded w-1/4"></div>
              <div className="h-3 bg-slate-800 rounded w-1/3"></div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-blue-600/20 border border-blue-500/40 rounded-xl flex items-center justify-center text-blue-400 shrink-0">
                <User className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-lg font-bold tracking-wide">
                    {perfil?.nome}
                  </h2>
                  <span
                    className={`text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full border ${badgeInfo.bg}`}
                  >
                    {badgeInfo.label}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 mt-1 font-mono">
                  <span className="flex items-center space-x-1">
                    <Mail className="w-3.5 h-3.5 text-slate-500" />
                    <span>{usuarioLogado?.email}</span>
                  </span>

                  <span className="flex items-center space-x-1">
                    <Key className="w-3.5 h-3.5 text-slate-500" />
                    <span>
                      Posto: {perfil?.posto} | Mat: {perfil?.matricula}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 text-xs text-slate-400 bg-slate-950/60 px-3 py-2 rounded-lg border border-slate-800 self-start md:self-auto">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>Sessão Autenticada e Auditada</span>
            </div>
          </div>
        )}
      </div>

      {/* 2. TOP HEADER DO PAINEL GERAL */}
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

      {/* 3. GRID COM OS 4 CARDS DE MÉTRICAS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1: Cautelas Ativas */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-2">
          <p className="text-xs font-semibold text-slate-500">
            Cautelas Ativas
          </p>
          <p className="text-3xl font-bold text-slate-900">
            {loadingMetrics ? "-" : metrics?.cautelasAtivas}
          </p>
        </div>

        {/* Card 2: Armas Disponíveis */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-2">
          <p className="text-xs font-semibold text-slate-500">
            Armas Disponíveis
          </p>
          <p className="text-3xl font-bold text-slate-900">
            {loadingMetrics ? "-" : metrics?.armasDisponiveis}
          </p>
        </div>

        {/* Card 3: Coletes a Vencer (30d) */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-2">
          <p className="text-xs font-semibold text-slate-500">
            Coletes a Vencer (30d)
          </p>
          <p className="text-3xl font-bold text-amber-600">
            {loadingMetrics ? "-" : metrics?.coletesAVencer}
          </p>
        </div>

        {/* Card 4: Efetivo Ativo */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-2">
          <p className="text-xs font-semibold text-slate-500">Efetivo Ativo</p>
          <p className="text-3xl font-bold text-slate-900">
            {loadingMetrics ? "-" : metrics?.efetivoAtivo}
          </p>
        </div>
      </div>
    </div>
  );
}
