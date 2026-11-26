import { useCallback, useEffect, useRef, useState } from "react";
import { login } from "../services/sessionService";
import { Skeleton, SkeletonPage, SkeletonText } from "../components/ui/Skeleton";
import { imagemDecodificada } from "../utils/decodeImage";
import { aplicarTema, obterTemaSalvo, TEMAS } from "../utils/theme";
import {
  KeyRound,
  User,
  Lock,
  AlertCircle,
  Eye,
  EyeOff,
  Moon,
  Sun,
} from "lucide-react";

function LoginPainelSkeleton() {
  return (
    <div aria-hidden="true" className="login-brand-skeleton">
      <Skeleton className="h-20 w-20 rounded-2xl border border-white/15 bg-white/10" />
      <div className="mt-5 w-full max-w-[78%] space-y-3">
        <Skeleton className="h-10 w-44 max-w-full bg-white/15" />
        <SkeletonText lines={1} lineHeight="0.8rem" />
      </div>
      <Skeleton className="login-brand-skeleton-vehicle h-28 w-[82%] rounded-[45%] bg-white/10" />
      <Skeleton className="mt-auto h-3 w-44 max-w-[70%] bg-white/15" />
    </div>
  );
}

function LoginFormSkeleton() {
  return (
    <SkeletonPage label="Carregando o acesso institucional" className="login-form-skeleton">
      <Skeleton className="mb-3 h-3 w-28" />
      <Skeleton className="mb-3 h-9 w-64 max-w-full" />
      <SkeletonText lines={1} className="mb-8" lineHeight="0.8rem" />
      <Skeleton className="mb-2 h-3 w-24" />
      <Skeleton className="mb-5 h-12 w-full rounded-xl" />
      <Skeleton className="mb-2 h-3 w-16" />
      <Skeleton className="mb-5 h-12 w-full rounded-xl" />
      <Skeleton className="mb-6 h-5 w-36" />
      <Skeleton className="h-12 w-full rounded-xl" />
    </SkeletonPage>
  );
}

export default function Login({ avisoSessao = "" }) {
  const [matricula, setMatricula] = useState(
    () => localStorage.getItem("log2cia_matricula") || "",
  );
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [manterConectado, setManterConectado] = useState(false);
  const [tema, setTema] = useState(obterTemaSalvo);
  const imagemPainelRef = useRef(null);
  const timeoutImagemRef = useRef(null);
  const [estadoImagem, setEstadoImagem] = useState("loading");

  const finalizarCarregamentoImagem = useCallback(async (imagem) => {
    const pronta = await imagemDecodificada(imagem);
    window.clearTimeout(timeoutImagemRef.current);
    setEstadoImagem(pronta ? "ready" : "fallback");
  }, []);

  const handleAlterarTema = (novoTema) => {
    setTema(aplicarTema(novoTema));
  };

  useEffect(() => {
    timeoutImagemRef.current = window.setTimeout(() => {
      setEstadoImagem((estado) => estado === "loading" ? "fallback" : estado);
    }, 3500);

    const imagem = imagemPainelRef.current;
    if (imagem?.complete) void finalizarCarregamentoImagem(imagem);

    return () => window.clearTimeout(timeoutImagemRef.current);
  }, [finalizarCarregamentoImagem]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setErro("");
    setCarregando(true);

    try {
      const { user: policial } = await login(
        matricula.trim(),
        senha,
        manterConectado,
      );

      if (manterConectado) {
        localStorage.setItem("log2cia_matricula", matricula.trim());
      } else {
        localStorage.removeItem("log2cia_matricula");
      }

      // Mantido temporariamente para compatibilidade com os módulos existentes.
      // A identidade válida passa a ser confirmada pelo cookie HttpOnly no backend.
      localStorage.setItem("log2cia_user", JSON.stringify(policial));

      // Verifica se é o primeiro acesso
      if (policial.primeiro_acesso) {
        window.location.href = "/alterar-senha-obrigatoria";
      } else {
        window.location.href = "/dashboard";
      }
    } catch (err) {
      setErro(err.message);
      setCarregando(false);
    }
  };

  return (
    <div className="login-page grid min-h-screen place-items-center p-3 sm:p-6">
      <main className="login-shell grid w-full max-w-[1456px] overflow-hidden rounded-[1.75rem] shadow-2xl md:items-center md:grid-cols-[0.82fr_1.18fr] lg:grid-cols-[0.92fr_1.08fr]">
        <aside className="login-brand-image-panel min-w-0" aria-label="Identidade institucional da 2ª CIA">
          <div className="login-brand-image-frame">
            <img
              ref={imagemPainelRef}
              className={`login-brand-image ${estadoImagem === "ready" ? "login-brand-image--ready" : ""}`}
              src="/images/login-painel-institucional.png"
              alt="Brasão conceitual 2ª CIA PMCE, Log2CIA e Jeep Commander operacional verde e branca com luzes de emergência"
              aria-hidden={estadoImagem !== "ready"}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              onLoad={(evento) => void finalizarCarregamentoImagem(evento.currentTarget)}
              onError={() => {
                window.clearTimeout(timeoutImagemRef.current);
                setEstadoImagem("fallback");
              }}
            />
            {estadoImagem === "loading" && <LoginPainelSkeleton />}
            {estadoImagem === "fallback" && (
              <div className="login-brand-fallback">
                <strong>Log2CIA</strong>
                <span>Sistema de Gestão de Armamento e Efetivo</span>
                <span className="login-brand-fallback-footer">Acesso institucional</span>
              </div>
            )}
          </div>
        </aside>

        <section aria-busy={estadoImagem === "loading"} className="login-form-panel min-w-0 p-5 sm:p-8 md:flex md:flex-col md:justify-center md:px-8 lg:px-14 xl:px-16">
          <div role="group" aria-label="Tema da interface" className="login-theme-controls">
            <button
              type="button"
              onClick={() => handleAlterarTema(TEMAS.CLARO)}
              aria-pressed={tema === TEMAS.CLARO}
              aria-label="Usar tema claro"
              title="Tema claro"
              className="login-theme-button"
            >
              <Sun aria-hidden="true" className="h-4 w-4" />
              <span>Claro</span>
            </button>
            <button
              type="button"
              onClick={() => handleAlterarTema(TEMAS.ESCURO)}
              aria-pressed={tema === TEMAS.ESCURO}
              aria-label="Usar tema escuro"
              title="Tema escuro"
              className="login-theme-button"
            >
              <Moon aria-hidden="true" className="h-4 w-4" />
              <span>Escuro</span>
            </button>
          </div>
          <div className="login-form-content">
          {estadoImagem === "loading" ? <LoginFormSkeleton /> : <>
          <header className="mb-6">
            <p className="login-eyebrow text-[11px] font-bold uppercase tracking-[0.18em]">Acesso seguro</p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Entrar no sistema</h2>
            <p className="login-description mt-2 text-sm leading-relaxed">Informe sua matrícula e senha para continuar.</p>
          </header>

        {erro && (
          <div className="login-error mb-4 flex items-start gap-2 rounded-xl border p-3 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        {avisoSessao && (
          <div className="login-session-notice mb-4 flex items-start gap-2 rounded-xl border p-3 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{avisoSessao}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="login-label mb-1.5 block text-xs font-bold uppercase tracking-wide">
              Matrícula
            </label>
            <div className="relative">
              <User className="login-input-icon absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" />
              <input
                type="text"
                required
                placeholder="Ex: 1357281X"
                value={matricula}
                onChange={(e) => setMatricula(e.target.value)}
                autoComplete="username"
                className="login-input min-h-12 w-full rounded-xl border py-3 pl-10 pr-4 font-mono text-base outline-none transition focus:ring-2 focus:ring-blue-500 sm:text-sm"
              />
            </div>
          </div>

          <div>
            <label className="login-label mb-1.5 block text-xs font-bold uppercase tracking-wide">
              Senha
            </label>
            <div className="relative">
              <Lock className="login-input-icon absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" />
              <input
                type={mostrarSenha ? "text" : "password"}
                required
                placeholder="••••••••"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="current-password"
                className="login-input min-h-12 w-full rounded-xl border py-3 pl-10 pr-12 text-base outline-none transition focus:ring-2 focus:ring-blue-500 sm:text-sm"
              />
              <button
                type="button"
                onClick={() => setMostrarSenha((valor) => !valor)}
                aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                title={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                className="login-password-toggle absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg transition-colors"
              >
                {mostrarSenha ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <label className="login-remember flex min-h-10 cursor-pointer select-none items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={manterConectado}
              onChange={(e) => setManterConectado(e.target.checked)}
              className="h-4 w-4 rounded border-slate-400 text-blue-600 focus:ring-blue-500"
            />
            <span>Lembrar de mim</span>
          </label>

          <button
            type="submit"
            disabled={carregando}
            className="login-submit flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
          >
            <KeyRound className="w-4 h-4" />
            <span>{carregando ? "Autenticando..." : "Entrar"}</span>
          </button>
        </form>
          </>}
          </div>
        </section>
      </main>
    </div>
  );
}
