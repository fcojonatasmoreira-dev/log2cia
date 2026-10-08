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
import LivroPermanencia from "../pages/p1/LivroPermanencia";
import BancoHoras from "../pages/BancoHoras";
import BancoHorasPolicial from "../pages/BancoHorasPolicial";
import NovaInsercaoBancoHoras from "../pages/NovaInsercaoBancoHoras";
import Oficios from "../pages/Oficios";
import GerenciamentoArquivo from "../pages/GerenciamentoArquivo";
import Viaturas from "../pages/Viaturas";
import { obterSessao, logout } from "../services/sessionService";

export default function AppRoutes() {
  const [usuario, setUsuario] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ativo = true;
    let verificando = false;

    const validarSessao = async () => {
      if (verificando) return;
      verificando = true;
      try {
        const { user } = await obterSessao();
        if (!ativo) return;
        localStorage.setItem("log2cia_user", JSON.stringify(user));
        setUsuario(user);
      } catch (error) {
        if (!ativo) return;
        localStorage.removeItem("log2cia_user");
        setUsuario(null);
      } finally {
        verificando = false;
        if (ativo) setLoading(false);
      }
    };

    validarSessao();
    // A sessão é validada ao carregar o aplicativo. As operações protegidas
    // devem validar novamente no backend; não fazemos consultas periódicas.
    return () => {
      ativo = false;
    };
  }, []);

  const handleLogout = async () => {
    try { await logout(); } catch (e) { console.error("Erro ao encerrar sessão:", e); }
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
            {(usuario.is_master === true || ["master", "p4", "oficial"].includes(String(usuario.role || "").trim().toLowerCase())) && (
              <Route path="viaturas" element={<Viaturas />} />
            )}
            <Route path="policiais" element={<Policiais />} />
            {(usuario.is_master === true || ["master", "p4", "p1", "oficial"].includes(String(usuario.role || "").trim().toLowerCase())) && (
              <Route path="oficios" element={<Oficios />} />
            )}
            {(usuario.is_master === true || ["master", "p4", "armeiro"].includes(String(usuario.role || "").trim().toLowerCase())) && (
              <Route path="cautelas/nova" element={<NovaCautela />} />
            )}
            {String(usuario.role || "").trim().toLowerCase() !== "oficial" && (
              <Route path="minhas-cautelas" element={<MinhasCautelas />} />
            )}
            {(usuario.is_master === true || ["master", "p4", "armeiro"].includes(String(usuario.role || "").trim().toLowerCase())) && (
              <Route path="devolucao" element={<Devolucao />} />
            )}

            <Route
              path="banco-horas"
              element={
                usuario.is_master === true || ["master", "p1", "oficial"].includes(String(usuario.role || "").trim().toLowerCase())
                  ? <BancoHoras />
                  : <BancoHorasPolicial />
              }
            />

            {(usuario.is_master === true || ["master", "p1"].includes(String(usuario.role || "").trim().toLowerCase())) && (
              <Route path="banco-horas/nova" element={<NovaInsercaoBancoHoras />} />
            )}

            {/* Rota para o Módulo P1 - Livro da Permanência */}
            {(usuario.is_master === true ||
              String(usuario.role || "")
                .trim()
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "") === "master" ||
              ["p1", "permanente", "permanente da guarda", "armeiro", "oficial"].includes(
                String(usuario.role || "")
                  .trim()
                  .toLowerCase()
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, ""),
              )) && (
              <Route
                path="livro-permanencia"
                element={<LivroPermanencia userLogado={usuario} />}
              />
            )}

            {/* Rota para alteração de senha acessível pelo menu lateral */}
            <Route path="alterar-senha" element={<AlterarSenhaObrigatoria />} />

            {usuario.role === "master" && (
              <Route path="painel-master" element={<PainelMaster />} />
            )}
            {(usuario.is_master === true || ["master", "p1"].includes(String(usuario.role || "").trim().toLowerCase())) && (
              <Route path="gerenciamento-arquivo" element={<GerenciamentoArquivo />} />
            )}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        )}
      </Routes>
    </BrowserRouter>
  );
}
