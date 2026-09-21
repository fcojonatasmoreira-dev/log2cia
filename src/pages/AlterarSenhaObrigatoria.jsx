import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function AlterarSenhaObrigatoria() {
  const navigate = useNavigate();
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const usuarioLogado = JSON.parse(
    localStorage.getItem("log2cia_user") || "{}",
  );

  // Validador dos critérios de senha forte
  const validarSenhaForte = (senha) => {
    const minLength = senha.length >= 8;
    const hasUpperCase = /[A-Z]/.test(senha);
    const hasNumber = /[0-9]/.test(senha);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(senha);

    return {
      minLength,
      hasUpperCase,
      hasNumber,
      hasSpecialChar,
      isValid: minLength && hasUpperCase && hasNumber && hasSpecialChar,
    };
  };

  const requisitos = validarSenhaForte(novaSenha);

  const handleAlterarSenha = async (e) => {
    e.preventDefault();

    if (!requisitos.isValid) {
      setErro("A senha não atende a todos os critérios de segurança exigidos.");
      return;
    }

    if (novaSenha !== confirmarSenha) {
      setErro("As senhas não coincidem.");
      return;
    }

    setSalvando(true);
    setErro("");

    try {
      // Atualiza a senha no banco e define primeiro_acesso como false
      const { data, error } = await supabase
        .from("policiais")
        .update({
          senha: String(novaSenha).trim(),
          primeiro_acesso: false,
        })
        .eq("id", String(usuarioLogado.id).trim())
        .select();

      if (error) throw error;

      console.log("Senha atualizada com sucesso no banco:", data);

      // Atualiza a sessão no navegador de forma segura (sem salvar a senha no localStorage)
      const sessaoSegura = {
        ...usuarioLogado,
        primeiro_acesso: false,
      };

      localStorage.setItem("log2cia_user", JSON.stringify(sessaoSegura));

      // Redireciona limpo para o dashboard
      window.location.href = "/dashboard";
    } catch (err) {
      console.error("Erro no update da senha:", err);
      setErro("Erro ao atualizar senha: " + err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
        <div className="text-center space-y-1">
          <div className="w-12 h-12 bg-amber-500 rounded-xl mx-auto flex items-center justify-center text-slate-950 text-xl font-bold shadow">
            🔐
          </div>
          <h1 className="text-lg font-bold text-slate-800">
            {usuarioLogado.primeiro_acesso
              ? "Primeiro Acesso"
              : "Alterar Senha"}
          </h1>
          <p className="text-xs text-slate-500">
            {usuarioLogado.primeiro_acesso
              ? "Por segurança, cadastre uma senha forte para continuar."
              : "Atualize sua senha de acesso ao sistema."}
          </p>
        </div>

        {erro && (
          <div className="p-3 bg-red-100 border border-red-200 text-red-700 text-xs font-bold rounded-xl text-center">
            {erro}
          </div>
        )}

        <form onSubmit={handleAlterarSenha} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1">
              Nova Senha
            </label>
            <input
              type="password"
              required
              placeholder="Digite a nova senha forte"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Checklist visual de requisitos de senha */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5 text-[11px]">
            <p className="font-bold text-slate-700 mb-1">
              Critérios de segurança:
            </p>
            <p
              className={
                requisitos.minLength
                  ? "text-emerald-600 font-semibold"
                  : "text-slate-400"
              }
            >
              {requisitos.minLength ? "✓" : "•"} Mínimo de 8 caracteres
            </p>
            <p
              className={
                requisitos.hasUpperCase
                  ? "text-emerald-600 font-semibold"
                  : "text-slate-400"
              }
            >
              {requisitos.hasUpperCase ? "✓" : "•"} Pelo menos uma letra
              maiúscula
            </p>
            <p
              className={
                requisitos.hasNumber
                  ? "text-emerald-600 font-semibold"
                  : "text-slate-400"
              }
            >
              {requisitos.hasNumber ? "✓" : "•"} Pelo menos um número
            </p>
            <p
              className={
                requisitos.hasSpecialChar
                  ? "text-emerald-600 font-semibold"
                  : "text-slate-400"
              }
            >
              {requisitos.hasSpecialChar ? "✓" : "•"} Pelo menos um caractere
              especial (!@#$...)
            </p>
          </div>

          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1">
              Confirmar Nova Senha
            </label>
            <input
              type="password"
              required
              placeholder="Repita a nova senha"
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={salvando}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow transition-all disabled:opacity-50"
          >
            {salvando ? "A salvar..." : "Salvar e Acessar Sistema"}
          </button>
        </form>
      </div>
    </div>
  );
}
