import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

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
import AlterarSenhaObrigatoria from "../pages/AlterarSenhaObrigatoria";

export default function AppRoutes() {
  const [usuario, setUsuario] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const usuarioSalvo = localStorage.getItem("log2cia_user");
      if (usuarioSalvo) {
        setUsuario(JSON.parse(usuarioSalvo));
      }
    } catch (e) {
      console.error("Erro ao ler sessão:", e);
      localStorage.removeItem("log2cia_user");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("log2cia_user");
    setUsuario(null);
    window.location.href = "/";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white font-sans">
        <span className="text-sm font-medium">Carregando Log2CIA...</span>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {!usuario ? (
          <Route path="*" element={<Login />} />
        ) : usuario.primeiro_acesso ? (
          <Route path="*" element={<AlterarSenhaObrigatoria />} />
        ) : (
          <Route
            path="/"
            element={
              <AppLayout
                role={usuario.role || "user"}
                user={usuario}
                onLogout={handleLogout}
              />
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="cautelas" element={<Cautelas />} />
            <Route path="inventario" element={<Inventario />} />
            <Route path="policiais" element={<Policiais />} />
            <Route path="cautelas/nova" element={<NovaCautela />} />
            <Route path="minhas-cautelas" element={<MinhasCautelas />} />
            <Route path="devolucao" element={<Devolucao />} />

            {/* Rota para alteração de senha acessível pelo menu lateral */}
            <Route path="alterar-senha" element={<AlterarSenhaObrigatoria />} />

            {usuario.role === "master" && (
              <Route path="painel-master" element={<PainelMaster />} />
            )}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        )}
      </Routes>
    </BrowserRouter>
  );
}
