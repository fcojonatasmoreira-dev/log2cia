import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Key, LogOut, Moon, Shield, Sun } from "lucide-react";
import NotificacoesMenu from "./NotificacoesMenu";
import ModuleNavigation from "./ModuleNavigation";
import { novaInstanciaPresenca, registrarPresenca } from "../../services/presencaService";
import { alterarModo } from "../../services/sessionService";
import { podeVerAlertasDashboard, podeVerPainelMaster } from "../../utils/dashboardAccess";
import { aplicarTema, obterTemaSalvo, TEMAS } from "../../utils/theme";

function lerUsuarioSalvo() {
  try {
    const salvo = localStorage.getItem("log2cia_user");
    return salvo ? JSON.parse(salvo) : null;
  } catch {
    return null;
  }
}

export default function AppLayout({ onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [usuario, setUsuario] = useState(lerUsuarioSalvo);
  const [instanciaPresenca] = useState(() => novaInstanciaPresenca());
  const [alterandoModo, setAlterandoModo] = useState(false);
  const [tema, setTema] = useState(obterTemaSalvo);

  const carregarUsuario = () => {
    try {
      const usuarioSalvo = localStorage.getItem("log2cia_user");
      if (usuarioSalvo) setUsuario(JSON.parse(usuarioSalvo));
    } catch (error) {
      console.error("Erro ao ler dados do usuário:", error);
    }
  };

  useEffect(() => {
    window.addEventListener("storage", carregarUsuario);
    window.addEventListener("usuarioAtualizado", carregarUsuario);
    return () => {
      window.removeEventListener("storage", carregarUsuario);
      window.removeEventListener("usuarioAtualizado", carregarUsuario);
    };
  }, []);

  useEffect(() => {
    if (!usuario?.id) return undefined;
    let ativo = true;
    const heartbeat = () => { if (ativo) void registrarPresenca(instanciaPresenca).catch(() => {}); };
    heartbeat();
    const intervalo = window.setInterval(heartbeat, 60_000);
    const aoRetornar = () => { if (document.visibilityState === "visible") heartbeat(); };
    document.addEventListener("visibilitychange", aoRetornar);
    window.addEventListener("focus", heartbeat);
    return () => {
      ativo = false;
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoRetornar);
      window.removeEventListener("focus", heartbeat);
    };
  }, [usuario?.id, instanciaPresenca]);

  const sair = async () => {
    if (window.confirm("Deseja realmente encerrar a sessão?")) await onLogout();
  };

  const handleAlterarModo = async (evento) => {
    setAlterandoModo(true);
    try {
      await alterarModo(evento.target.value);
      localStorage.setItem("log2cia_mode_change", String(Date.now()));
      window.location.reload();
    } catch (error) {
      window.alert(error.message || "Não foi possível alternar o modo de acesso.");
      carregarUsuario();
    } finally {
      setAlterandoModo(false);
    }
  };

  const handleAlterarTema = (novoTema) => {
    const aplicado = aplicarTema(novoTema);
    setTema(aplicado);
  };

  const navegar = (caminho) => navigate(caminho);
  const modosDisponiveis = Array.isArray(usuario?.modos_disponiveis) ? usuario.modos_disponiveis : [];
  const masterVisivel = podeVerPainelMaster(usuario);
  const podeNotificacoes = podeVerAlertasDashboard(usuario);

  return (
    <div className="app-shell min-h-screen bg-[#edf3ff] text-slate-900">
      <header className="relative z-20 border-b border-sky-400/50 bg-[#06152f] text-white shadow-lg">
        <div className="mx-auto flex min-h-[70px] max-w-[1800px] flex-wrap items-center justify-between gap-x-5 gap-y-3 px-4 py-3 lg:px-7">
          <button onClick={() => navegar("/")} className="flex shrink-0 items-center gap-3" aria-label="Ir ao Dashboard">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-blue-700 text-white shadow-[0_0_20px_#1688ff66]"><Shield className="h-6 w-6 fill-blue-500/30" /></span>
            <span className="text-xl font-extrabold tracking-tight sm:text-2xl">Log2CIA</span>
          </button>

          <div className="hidden h-10 w-px bg-sky-200/50 xl:block" />
          <div className="flex min-w-0 flex-1 items-center gap-3 xl:min-w-[330px]">
            <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-400/30 bg-blue-600/25 text-sky-300 sm:flex"><Shield className="h-5 w-5" /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="max-w-[420px] truncate text-sm font-extrabold uppercase leading-tight">{usuario?.nome_completo || usuario?.nome || "Policial / Efetivo"}</p>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-extrabold uppercase text-emerald-300">{usuario?.role || "efetivo"}</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-300">Posto: {usuario?.posto_graduacao || usuario?.posto || "—"}<span className="px-2 text-slate-500">|</span>Mat: {usuario?.matricula || "—"}</p>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end">
            {usuario?.modo_acesso && (modosDisponiveis.length > 1 ? (
              <label className="flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800/80 px-2.5 py-2 text-xs font-semibold text-slate-200">
                <span className="hidden sm:inline">Modo</span>
                <select aria-label="Modo de acesso" value={usuario.modo_acesso} disabled={alterandoModo} onChange={handleAlterarModo} className="max-w-32 bg-transparent text-white outline-none disabled:opacity-60">
                  {modosDisponiveis.map((modo) => <option key={modo} value={modo} className="text-slate-900">{modo === "administrativo" ? "Administrativo" : "Policial"}</option>)}
                </select>
              </label>
            ) : <span className="rounded-xl border border-slate-600 bg-slate-800/80 px-2.5 py-2 text-xs font-semibold text-slate-300">Modo {usuario.modo_acesso === "administrativo" ? "Administrativo" : "Policial"}</span>)}

            {podeNotificacoes && <NotificacoesMenu />}
            {masterVisivel && <button onClick={() => navegar("/painel-master")} className="flex items-center gap-2 rounded-xl border border-amber-400/80 bg-amber-500/10 px-3.5 py-2.5 text-xs font-bold text-amber-300 transition hover:bg-amber-400/20"><Shield className="h-4 w-4" /><span>Painel Master</span></button>}
            <button onClick={() => navegar("/alterar-senha")} className="flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800/80 px-3.5 py-2.5 text-xs font-bold text-slate-100 transition hover:bg-slate-700"><Key className="h-4 w-4 text-amber-300" /><span>Senha</span></button>
            <button onClick={sair} className="flex items-center gap-2 rounded-xl border border-rose-500/60 bg-rose-500/10 px-3.5 py-2.5 text-xs font-bold text-rose-300 transition hover:bg-rose-500/20"><LogOut className="h-4 w-4" /><span>Sair</span></button>
            <div role="group" aria-label="Tema da interface" className="inline-flex items-center rounded-xl border border-sky-400/50 bg-slate-800/80 p-1">
              <button type="button" onClick={() => handleAlterarTema(TEMAS.CLARO)} aria-pressed={tema === TEMAS.CLARO} aria-label="Usar tema claro" title="Tema claro" className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${tema === TEMAS.CLARO ? "bg-white text-blue-900 shadow" : "text-slate-300 hover:bg-slate-700"}`}><Sun className="h-3.5 w-3.5 text-amber-500" /><span className="hidden sm:inline">Claro</span></button>
              <button type="button" onClick={() => handleAlterarTema(TEMAS.ESCURO)} aria-pressed={tema === TEMAS.ESCURO} aria-label="Usar tema escuro" title="Tema escuro" className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${tema === TEMAS.ESCURO ? "bg-slate-950 text-white shadow" : "text-slate-300 hover:bg-slate-700"}`}><Moon className="h-3.5 w-3.5 text-yellow-300" /><span className="hidden sm:inline">Escuro</span></button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1800px] space-y-5 px-3 py-4 sm:px-5 lg:px-7 lg:py-6">
        {location.pathname !== "/" && <ModuleNavigation usuario={usuario} />}
        <Outlet context={{ usuario }} />
      </main>
    </div>
  );
}
