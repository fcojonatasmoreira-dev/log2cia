import { useState } from "react";
import { login } from "../services/sessionService";
import {
  Shield,
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
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-blue-600/10 border border-blue-500/20 rounded-2xl text-blue-500 mb-1">
            <Shield className="w-10 h-10" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Log2CIA
          </h1>
          <p className="text-xs text-slate-400">
            Sistema de Gestão de Armamento e Efetivo
          </p>
        </div>

        {erro && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-xl text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        {avisoSessao && (
          <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 p-3 rounded-xl text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{avisoSessao}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
              Matrícula
            </label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                required
                placeholder="Ex: 1357281X"
                value={matricula}
                onChange={(e) => setMatricula(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
              Senha
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type={mostrarSenha ? "text" : "password"}
                required
                placeholder="••••••••"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="w-full pl-9 pr-11 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setMostrarSenha((valor) => !valor)}
                aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                title={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {mostrarSenha ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={manterConectado}
              onChange={(e) => setManterConectado(e.target.checked)}
              className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-blue-500"
            />
            <span>Lembrar de mim</span>
          </label>

          <button
            type="submit"
            disabled={carregando}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors shadow-lg shadow-blue-600/20 text-sm disabled:opacity-50 flex items-center justify-center space-x-2"
          >
            <KeyRound className="w-4 h-4" />
            <span>{carregando ? "Autenticando..." : "Entrar no Sistema"}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
