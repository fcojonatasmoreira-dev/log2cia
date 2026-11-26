import React, { useState, useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import AppLayout from "../components/layout/AppLayout";
import Dashboard from "../pages/Dashboard";
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
import CheckinsViaturas from "../pages/CheckinsViaturas";
import ChecklistPublico from "../pages/ChecklistPublico";
import SolicitacaoEventoPublica from "../pages/SolicitacaoEventoPublica";
import Eventos from "../pages/Eventos";
import AreasOperacao from "../pages/AreasOperacao";
import DRSO from "../pages/DRSO";
import EfetivoExternoDRSO from "../pages/EfetivoExternoDRSO";
import Permutas from "../pages/Permutas";
import { EVENTO_REVALIDAR_SESSAO, obterSessao, logout } from "../services/sessionService";
import { podeAcessarNovaInsercaoBancoHoras, telaBancoHoras } from "../utils/bancoHorasAccess";
import { chaveContextoSessao } from "../utils/sessionContext";
import { Skeleton, SkeletonPage, SkeletonText } from "../components/ui/Skeleton";

export default function AppRoutes() {
  const [usuario, setUsuario] = useState(null);
  const [loading, setLoading] = useState(true);
  const [avisoSessao, setAvisoSessao] = useState("");
  const usuarioRef = useRef(null);
  const validacaoRef = useRef(0);

  const definirUsuario = (novoUsuario) => {
    usuarioRef.current = novoUsuario;
    setUsuario(novoUsuario);
  };

  useEffect(() => {
    let ativo = true;
    let sessaoJaConfirmada = false;

    const validarSessao = async () => {
      const idValidacao = ++validacaoRef.current;
      try {
        const { user } = await obterSessao();
        if (!ativo || idValidacao !== validacaoRef.current) return;
        const usuarioSerializado = JSON.stringify(user);
        if (localStorage.getItem("log2cia_user") !== usuarioSerializado) {
          localStorage.setItem("log2cia_user", usuarioSerializado);
          window.dispatchEvent(new Event("usuarioAtualizado"));
        }
        sessaoJaConfirmada = true;
        setAvisoSessao("");
        if (JSON.stringify(usuarioRef.current) !== usuarioSerializado) {
          definirUsuario(user);
        }
      } catch (error) {
        if (!ativo || idValidacao !== validacaoRef.current) return;
        if (error.message?.includes("Seu perfil foi alterado e não permite o modo de acesso atual")) {
          setAvisoSessao("Seu perfil foi alterado e o modo desta sessão não está mais autorizado. Entre novamente para carregar as permissões atualizadas.");
        } else if (error.status === 401 || error.status === 403) {
          if (sessaoJaConfirmada) setAvisoSessao("Sua sessão expirou, foi revogada ou não está mais autorizada. Entre novamente.");
        }
        if (error.status === 401 || error.status === 403) {
          localStorage.removeItem("log2cia_user");
          definirUsuario(null);
        } else if (!usuarioRef.current) {
          // Sem uma sessão previamente confirmada, não confie no cache local.
          localStorage.removeItem("log2cia_user");
          definirUsuario(null);
        }
      } finally {
        if (ativo && idValidacao === validacaoRef.current) setLoading(false);
      }
    };

    const aoAtualizarOutraAba = (evento) => {
      if (evento.key === "log2cia_mode_change" || evento.key === "log2cia_user") {
        // Remova imediatamente a árvore anterior antes de reconstruir a sessão.
        definirUsuario(null);
        if (evento.key === "log2cia_user" && evento.newValue === null) {
          setAvisoSessao("");
          setLoading(false);
          return;
        }
        setLoading(true);
        void validarSessao();
      }
    };

    const aoSolicitarRevalidacao = () => { void validarSessao(); };
    const aoRetornar = () => {
      if (document.visibilityState === "visible") void validarSessao();
    };

    void validarSessao();
    window.addEventListener("storage", aoAtualizarOutraAba);
    window.addEventListener(EVENTO_REVALIDAR_SESSAO, aoSolicitarRevalidacao);
    window.addEventListener("focus", aoSolicitarRevalidacao);
    document.addEventListener("visibilitychange", aoRetornar);
    const intervaloSessao = window.setInterval(() => {
      if (document.visibilityState === "visible") void validarSessao();
    }, 60_000);
    return () => {
      ativo = false;
      validacaoRef.current += 1;
      window.clearInterval(intervaloSessao);
      window.removeEventListener("storage", aoAtualizarOutraAba);
      window.removeEventListener(EVENTO_REVALIDAR_SESSAO, aoSolicitarRevalidacao);
      window.removeEventListener("focus", aoSolicitarRevalidacao);
      document.removeEventListener("visibilitychange", aoRetornar);
    };
  }, []);

  const handleLogout = async () => {
    localStorage.removeItem("log2cia_user");
    definirUsuario(null);
    try { await logout(); } catch (e) { console.error("Erro ao encerrar sessão:", e); }
    window.location.href = "/";
  };

  const destinoBancoHoras = telaBancoHoras(usuario);

  if (loading) {
    return (
      <SkeletonPage className="flex min-h-screen items-center justify-center bg-slate-900 px-4" label="Validando sessão autenticada">
        <div className="w-full max-w-sm space-y-5 rounded-2xl border border-slate-700 bg-slate-800/70 p-6 shadow-xl">
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 shrink-0 rounded-xl bg-slate-700" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-2/3 bg-slate-700" />
              <Skeleton className="h-3 w-1/2 bg-slate-700" />
            </div>
          </div>
          <SkeletonText lines={3} className="gap-3" lineHeight="0.9rem" />
        </div>
      </SkeletonPage>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/checklist-publico/:token" element={<ChecklistPublico />} />
        <Route path="/solicitar-evento" element={<SolicitacaoEventoPublica />} />
        {!usuario ? (
          <Route path="*" element={<Login avisoSessao={avisoSessao} />} />
        ) : usuario.primeiro_acesso ? (
          <Route path="*" element={<AlterarSenhaObrigatoria />} />
        ) : usuario.tipo_acesso === "drso_externo" ? (
          <Route path="*" element={<div className="min-h-screen bg-slate-100"><header className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white"><div><strong>Log2CIA · DRSO</strong><p className="text-xs text-slate-300">Acesso externo restrito ao voluntariado</p></div><button className="rounded-lg border border-slate-600 px-3 py-2 text-sm" onClick={handleLogout}>Sair</button></header><main className="mx-auto max-w-7xl p-4"><DRSO /></main></div>} />
        ) : (
          <Route
            path="/"
            element={
              <AppLayout
                key={chaveContextoSessao(usuario)}
                role={usuario.role || "user"}
                user={usuario}
                onLogout={handleLogout}
              />
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="drso" element={<DRSO />} />
            {(usuario.is_master === true || ["master", "policial", "p1", "p1_escalante_servico_ordinario", "oficial"].includes(String(usuario.role || "").trim().toLowerCase())) && (
              <Route path="permutas" element={<Permutas user={usuario} />} />
            )}
            {(usuario.is_master === true || ["master", "p1"].includes(String(usuario.role || "").trim().toLowerCase()) || usuario.permissoes?.gerenciar_drso === true || usuario.drso_escalante === true) && (
              <Route path="drso/efetivo-externo" element={<EfetivoExternoDRSO />} />
            )}
            {(usuario.is_master === true || ["master", "p4", "armeiro", "oficial"].includes(String(usuario.role || "").trim().toLowerCase())) && (
              <Route path="inventario" element={<Inventario />} />
            )}
            {(usuario.is_master === true || ["master", "p4", "oficial"].includes(String(usuario.role || "").trim().toLowerCase())) && (
              <Route path="viaturas" element={<Viaturas />} />
            )}
            {(usuario.is_master === true || ["master", "p4", "oficial", "policial"].includes(String(usuario.role || "").trim().toLowerCase())) && (
              <Route path="checkin-viaturas" element={<CheckinsViaturas user={usuario} />} />
            )}
            {["policial", "armeiro"].includes(String(usuario.role || "").trim().toLowerCase()) ? null : (
              <Route path="areas-operacao" element={<AreasOperacao />} />
            )}
            {(usuario.is_master === true || ["master", "p4", "armeiro", "oficial"].includes(String(usuario.role || "").trim().toLowerCase())) && (
              <Route path="policiais" element={<Policiais />} />
            )}
            {(usuario.is_master === true || ["master", "p1", "oficial"].includes(String(usuario.role || "").trim().toLowerCase())) && (
              <Route path="eventos" element={<Eventos user={usuario} />} />
            )}
            {(usuario.is_master === true || ["master", "p4", "p1", "oficial"].includes(String(usuario.role || "").trim().toLowerCase())) && (
              <Route path="oficios" element={<Oficios />} />
            )}

            <Route path="banco-horas" element={
              destinoBancoHoras === "gestao"
                ? <BancoHoras />
                : destinoBancoHoras === "pessoal"
                  ? <BancoHorasPolicial user={usuario} />
                  : <Navigate to="/" replace />
            } />

            {podeAcessarNovaInsercaoBancoHoras(usuario) && (
              <Route path="banco-horas/nova" element={<NovaInsercaoBancoHoras />} />
            )}

            {/* Rota para o Módulo P1 - Livro da Permanência */}
            {(usuario.is_master === true ||
              String(usuario.role || "")
                .trim()
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "") === "master" ||
              ["p1", "permanente", "permanente da guarda", "armeiro", "oficial", "p1_escalante_servico_ordinario"].includes(
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

            {(usuario.role === "master" || usuario.is_master === true) && (
              <Route path="painel-master" element={<PainelMaster user={usuario} />} />
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
