import React, { useState } from "react";
import { Shield, Lock } from "lucide-react";
import { signInWithGoogle } from "../services/authService";

export default function Login() {
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      await signInWithGoogle();
    } catch (err) {
      alert(`Erro na autenticação: ${err.message}`);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans relative overflow-hidden">
      {/* Background Decorativo */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-900/20 rounded-full blur-3xl pointer-events-none" />

      <div className="bg-slate-900 border border-slate-800 max-w-md w-full rounded-2xl p-8 shadow-2xl relative z-10 space-y-8">
        {/* Header / Brand */}
        <div className="text-center space-y-3">
          <div className="w-14 h-14 bg-blue-600 rounded-xl flex items-center justify-center mx-auto shadow-lg shadow-blue-600/30">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-wider">
              Log2CIA
            </h1>
            <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-mono">
              2ª Cia / 15º BPM — Gestão de Acervo Bélico
            </p>
          </div>
        </div>

        {/* Informação Restrita */}
        <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl flex items-start space-x-3">
          <Lock className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-300 leading-relaxed">
            Acesso restrito ao efetivo credenciado da unidade. Todos os acessos
            são auditados e protegidos por RLS.
          </p>
        </div>

        {/* Botão de Login Google */}
        <div className="space-y-4">
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full bg-white hover:bg-slate-100 text-slate-900 font-semibold py-3 px-4 rounded-xl flex items-center justify-center space-x-3 transition-all shadow-lg hover:shadow-xl disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>
              {loading ? "Redirecionando..." : "Entrar com Conta Google"}
            </span>
          </button>
        </div>

        {/* Footer */}
        <div className="text-center text-[10px] text-slate-500 font-mono">
          Desenvolvido sob padrões de segurança e rastreabilidade • v1.0
        </div>
      </div>
    </div>
  );
}
