import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function Login() {
  const navigate = useNavigate();
  const [matricula, setMatricula] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setCarregando(true);
    setErro("");

    try {
      const matLimpa = matricula.trim();
      const senhaLimpa = senha.trim();

      // Consulta direta na tabela "policiais"
      const { data: perfil, error } = await supabase
        .from("policiais")
        .select("*")
        .eq("matricula", matLimpa)
        .maybeSingle();

      if (error) {
        console.error("Erro na query do Supabase:", error);
        throw new Error("Erro de conexão com o banco de dados.");
      }

      if (!perfil) {
        throw new Error("Matrícula não encontrada no sistema.");
      }

      // Valida a senha: se já definiu senha própria, usa ela; senão, valida pelo numeral (primeiro acesso)
      const senhaCorreta = perfil.senha ? perfil.senha : perfil.numeral;

      if (String(senhaCorreta) !== String(senhaLimpa)) {
        throw new Error("Senha ou numeral incorreto.");
      }

      // Cria um objeto de sessão limpo e seguro (sem expor a senha no navegador)
      const sessaoSegura = {
        id: perfil.id,
        matricula: perfil.matricula,
        nome_completo: perfil.nome_completo,
        nome_guerra: perfil.nome_guerra,
        posto_graduacao: perfil.posto_graduacao,
        role: perfil.role,
        primeiro_acesso: perfil.primeiro_acesso,
      };

      // Salva apenas os dados seguros na sessão do navegador
      localStorage.setItem("log2cia_user", JSON.stringify(sessaoSegura));

      console.log("Login bem-sucedido. Redirecionando com segurança...");

      // Força a recarga para a rota adequada de acordo com o status de primeiro acesso
      window.location.href =
        perfil.primeiro_acesso === true ? "/alterar-senha" : "/dashboard";
    } catch (err) {
      console.error("Erro no login:", err.message);
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-6">
        <div className="text-center space-y-1">
          <div className="w-12 h-12 bg-blue-600 rounded-xl mx-auto flex items-center justify-center text-white text-xl font-bold shadow">
            🛡️
          </div>
          <h1 className="text-xl font-bold text-slate-800">Log2CIA</h1>
          <p className="text-xs text-slate-500">
            Controle de Armamento e Efetivo
          </p>
        </div>

        {erro && (
          <div className="p-3 bg-red-100 border border-red-200 text-red-700 text-xs font-bold rounded-xl text-center">
            {erro}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1">
              Matrícula
            </label>
            <input
              type="text"
              required
              placeholder="Digite sua matrícula"
              value={matricula}
              onChange={(e) => setMatricula(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1">
              Senha ou Numeral
            </label>
            <input
              type="password"
              required
              placeholder="Digite sua senha ou numeral"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={carregando}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow transition-all disabled:opacity-50"
          >
            {carregando ? "Autenticando..." : "Entrar no Sistema"}
          </button>
        </form>
      </div>
    </div>
  );
}
