import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { ArrowLeftRight, ChevronDown, Crown, Key, LogOut, Moon, Sun } from "lucide-react";
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
        <div className="mx-auto grid w-full max-w-[1800px] grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-2 px-3 py-2 lg:flex lg:min-h-[70px] lg:flex-wrap lg:items-center lg:justify-between lg:gap-x-5 lg:gap-y-3 lg:px-7 lg:py-3">
          <button onClick={() => navegar("/")} className="flex shrink-0 items-center gap-3" aria-label="Ir ao Dashboard">
            <img src="/images/escudo-2cia-pmce.png" alt="Escudo conceitual da 2ª CIA / PMCE" className="h-12 w-11 shrink-0 object-contain sm:h-14 sm:w-[51px]" />
          </button>

          <div className="flex min-w-0 items-center gap-2 lg:flex-1 lg:gap-3 xl:min-w-[330px]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="max-w-[420px] truncate text-sm font-extrabold uppercase leading-tight">{usuario?.nome_completo || usuario?.nome || "Policial / Efetivo"}</p>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-extrabold uppercase text-emerald-300">{usuario?.role || "efetivo"}</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-300">Posto: {usuario?.posto_graduacao || usuario?.posto || "—"}<span className="px-2 text-slate-500">|</span>Mat: {usuario?.matricula || "—"}</p>
            </div>
          </div>

          <div className="app-header-actions col-span-2 flex w-full flex-col gap-2 lg:w-auto lg:flex-row lg:flex-wrap lg:items-center lg:justify-end lg:gap-2">
            <div className="app-header-mode-notifications flex min-w-0 items-center justify-center gap-2 lg:contents">
              {usuario?.modo_acesso && (modosDisponiveis.length > 1 ? (
              <>
              <label className="app-mode-desktop flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-600 bg-slate-800/80 px-2.5 py-1.5 text-xs font-semibold text-slate-200 lg:flex-none lg:px-2.5 lg:py-2">
                <span className="hidden lg:inline">Modo</span>
                <select aria-label="Modo de acesso" value={usuario.modo_acesso} disabled={alterandoModo} onChange={handleAlterarModo} className="min-w-0 flex-1 bg-transparent text-white outline-none disabled:opacity-60 lg:flex-none lg:max-w-32">
                  {modosDisponiveis.map((modo) => <option key={modo} value={modo} className="text-slate-900">{modo === "administrativo" ? "Administrativo" : "Policial"}</option>)}
                </select>
              </label>
              <label className="app-mode-mobile relative hidden h-10 w-[52px] shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-600 bg-slate-800/80 text-slate-100 focus-within:ring-2 focus-within:ring-sky-400" title="Alterar modo de acesso">
                <span aria-hidden="true" className="pointer-events-none inline-flex items-center gap-1 text-[10px] font-bold"><ArrowLeftRight className="h-3 w-3" />{usuario.modo_acesso === "administrativo" ? "ADM" : "POL"}<ChevronDown className="h-2.5 w-2.5" /></span>
                <select aria-label="Modo de acesso" value={usuario.modo_acesso} disabled={alterandoModo} onChange={handleAlterarModo} className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-wait">
                  {modosDisponiveis.map((modo) => <option key={modo} value={modo}>Modo {modo === "administrativo" ? "Administrativo" : "Policial"}</option>)}
                </select>
              </label>
              </>
            ) : <><span className="app-mode-desktop rounded-xl border border-slate-600 bg-slate-800/80 px-2.5 py-2 text-xs font-semibold text-slate-300">Modo {usuario.modo_acesso === "administrativo" ? "Administrativo" : "Policial"}</span><span aria-label={`Modo ${usuario.modo_acesso === "administrativo" ? "Administrativo" : "Policial"}`} className="app-mode-mobile-static hidden h-10 shrink-0 items-center gap-1 rounded-xl border border-slate-600 bg-slate-800/80 px-2 text-[10px] font-bold text-slate-100"><ArrowLeftRight className="h-3 w-3" />{usuario.modo_acesso === "administrativo" ? "ADM" : "POL"}</span></>)}

            {podeNotificacoes && <NotificacoesMenu />}
            </div>
            <div className="app-header-buttons flex flex-wrap items-center justify-center gap-2 lg:contents">
            {masterVisivel && <button aria-label="Painel Master" title="Painel Master" onClick={() => navegar("/painel-master")} className="flex min-h-10 items-center gap-2 rounded-xl border border-amber-400/80 bg-amber-500/10 px-3.5 py-2.5 text-xs font-bold text-amber-300 transition hover:bg-amber-400/20"><Crown className="h-4 w-4" /><span>Painel Master</span></button>}
            <button aria-label="Alterar senha" title="Senha" onClick={() => navegar("/alterar-senha")} className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-600 bg-slate-800/80 px-3.5 py-2.5 text-xs font-bold text-slate-100 transition hover:bg-slate-700"><Key className="h-4 w-4 text-amber-300" /><span>Senha</span></button>
            <button aria-label="Sair" title="Sair" onClick={sair} className="flex min-h-10 items-center gap-2 rounded-xl border border-rose-500/60 bg-rose-500/10 px-3.5 py-2.5 text-xs font-bold text-rose-300 transition hover:bg-rose-500/20"><LogOut className="h-4 w-4" /><span>Sair</span></button>
            <div role="group" aria-label="Tema da interface" className="inline-flex items-center rounded-xl border border-sky-400/50 bg-slate-800/80 p-1">
              <button type="button" onClick={() => handleAlterarTema(TEMAS.CLARO)} aria-pressed={tema === TEMAS.CLARO} aria-label="Usar tema claro" title="Tema claro" className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 lg:px-2.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${tema === TEMAS.CLARO ? "bg-white text-blue-900 shadow" : "text-slate-300 hover:bg-slate-700"}`}><Sun className="h-3.5 w-3.5 text-amber-500" /><span className="hidden lg:inline">Claro</span></button>
              <button type="button" onClick={() => handleAlterarTema(TEMAS.ESCURO)} aria-pressed={tema === TEMAS.ESCURO} aria-label="Usar tema escuro" title="Tema escuro" className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 lg:px-2.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${tema === TEMAS.ESCURO ? "bg-slate-950 text-white shadow" : "text-slate-300 hover:bg-slate-700"}`}><Moon className="h-3.5 w-3.5 text-yellow-300" /><span className="hidden lg:inline">Escuro</span></button>
            </div>
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
