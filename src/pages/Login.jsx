import { useState } from "react";
import { login } from "../services/sessionService";
import {
  KeyRound,
  User,
  Lock,
  AlertCircle,
  Eye,
  EyeOff,
} from "lucide-react";

export default function Login({ avisoSessao = "" }) {
  const [matricula, setMatricula] = useState(
    () => localStorage.getItem("log2cia_matricula") || "",
  );
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [manterConectado, setManterConectado] = useState(false);

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
          <img
            className="login-brand-image"
            src="/images/login-painel-institucional.png"
            alt="Brasão conceitual 2ª CIA PMCE, Log2CIA e Jeep Commander operacional verde e branca com luzes de emergência"
          />
        </aside>

        <section className="login-form-panel min-w-0 p-5 sm:p-8 md:flex md:flex-col md:justify-center md:px-8 lg:px-14 xl:px-16">
          <div className="login-form-content">
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
          </div>
        </section>
      </main>
    </div>
  );
}
