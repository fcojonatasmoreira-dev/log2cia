import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

import NovaCautela from "../pages/NovaCautela";
import MinhasCautelas from "../pages/MinhasCautelas";
import Devolucao from "../pages/Devolucao";

import AppLayout from "../components/layout/AppLayout";
import Dashboard from "../pages/Dashboard";
import Cautelas from "../pages/Cautelas";
import Inventario from "../pages/Inventario";
import Policiais from "../pages/Policiais";
import PainelMaster from "../pages/PainelMaster";
import Login from "../pages/Login";
import Onboarding from "../pages/Onboarding";

export default function AppRoutes() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("Erro ao buscar perfil:", error);
      }
      setProfile(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white font-sans">
        <div className="flex items-center space-x-3">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-medium">
            Carregando credenciais Log2CIA...
          </span>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<Login />} />
        </Routes>
      </BrowserRouter>
    );
  }

  const isMaster = profile?.role === "master";

  if (
    !isMaster &&
    (!profile || profile.status_aprovacao === "pendente_preenchimento")
  ) {
    return (
      <Onboarding
        user={session.user}
        onComplete={() => fetchProfile(session.user.id)}
      />
    );
  }

  if (!isMaster && profile?.status_aprovacao === "aguardando_analise") {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans">
        <div className="bg-white max-w-md w-full p-6 rounded-2xl shadow-xl text-center space-y-4">
          <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto">
            <span className="font-bold text-xl">⏳</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            Credenciamento em Análise
          </h2>
          <p className="text-sm text-slate-600">
            Seus dados funcionais e biometria foram enviados. O acesso
            operacional está aguardando homologação do Administrador (Master).
          </p>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-xs text-slate-500 hover:text-slate-800 underline font-medium"
          >
            Sair da Conta
          </button>
        </div>
      </div>
    );
  }

  const dataExpiracao = profile?.prazo_expiracao
    ? new Date(profile.prazo_expiracao)
    : null;
  const isExpirado = dataExpiracao && new Date() > dataExpiracao;

  if (isExpirado && profile?.status_aprovacao === "pendente_completar") {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full p-6 rounded-2xl shadow-xl text-center space-y-4">
          <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
            <span className="font-bold text-xl">⚠️</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">Acesso Expirado</h2>
          <p className="text-sm text-slate-600">
            O prazo de 7 dias para conclusão do seu credenciamento funcional
            expirou. Entre em contato com o Master/P4 da unidade para reativar
            seu convite.
          </p>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-xs text-slate-500 hover:text-slate-800 underline font-medium"
          >
            Sair do Sistema
          </button>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="cautelas" element={<Cautelas />} />
          <Route path="inventario" element={<Inventario />} />
          <Route path="policiais" element={<Policiais />} />

          {/* Rotas de Cautela */}
          <Route path="cautelas/nova" element={<NovaCautela />} />
          <Route path="minhas-cautelas" element={<MinhasCautelas />} />
          <Route path="devolucao" element={<Devolucao />} />

          {/* ROTA AJUSTADA PARA BATER COM O APPLAYOUT */}
          <Route
            path="painel-master"
            element={isMaster ? <PainelMaster /> : <Navigate to="/" replace />}
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
