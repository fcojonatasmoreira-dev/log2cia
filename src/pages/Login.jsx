import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  Shield,
  KeyRound,
  User,
  Lock,
  AlertCircle,
  HelpCircle,
} from "lucide-react";

// Função utilitária inteligente para senha padrão
function obterSenhaPadrao(policial) {
  const numeral = String(policial?.numeral || "").trim();
  const matricula = String(policial?.matricula || "").trim();

  if (numeral && numeral !== "" && numeral !== "—") {
    return numeral;
  }
  return matricula.length >= 4 ? matricula.slice(-4) : matricula;
}

export default function Login() {
  const [matricula, setMatricula] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  // Estados para a Modal de "Esqueci minha senha"
  const [isEsqueciModalOpen, setIsEsqueciModalOpen] = useState(false);
  const [matriculaRecuperacao, setMatriculaRecuperacao] = useState("");
  const [motivoRecuperacao, setMotivoRecuperacao] = useState("");
  const [enviandoSolicitacao, setEnviandoSolicitacao] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setErro("");
    setCarregando(true);

    try {
      const matriculaLimpa = matricula.trim();

      // Busca o policial estritamente pela matrícula
      const { data: policiais, error } = await supabase
        .from("policiais")
        .select("*")
        .eq("matricula", matriculaLimpa);

      if (error) throw error;

      if (!policiais || policiais.length === 0) {
        throw new Error("Policial não encontrado com esta Matrícula.");
      }

      const policial = policiais[0];

      // Se a senha estiver vazia ou for primeiro acesso, usa a senha padrão inteligente
      const senhaInformada = senha.trim();
      const senhaCorreta =
        policial.senha && policial.senha.trim() !== ""
          ? policial.senha.trim()
          : obterSenhaPadrao(policial);

      if (senhaInformada !== senhaCorreta) {
        throw new Error("Senha incorreta. Tente novamente.");
      }

      // Salva os dados do usuário no localStorage
      localStorage.setItem("log2cia_user", JSON.stringify(policial));

      // Verifica se é o primeiro acesso
      if (policial.primeiro_acesso || !policial.senha) {
        window.location.href = "/alterar-senha-obrigatoria";
      } else {
        window.location.href = "/dashboard";
      }
    } catch (err) {
      setErro(err.message);
      setCarregando(false);
    }
  };

  const handleSolicitarReset = async (e) => {
    e.preventDefault();
    if (!matriculaRecuperacao || !motivoRecuperacao) {
      alert("Preencha sua Matrícula e o motivo da solicitação.");
      return;
    }

    setEnviandoSolicitacao(true);
    try {
      const matriculaLimpa = matriculaRecuperacao.trim();

      const { data: policiais, error: errBusca } = await supabase
        .from("policiais")
        .select("id, nome_guerra, matricula")
        .eq("matricula", matriculaLimpa);

      if (errBusca || !policiais || policiais.length === 0) {
        throw new Error("Militar não encontrado com esta Matrícula.");
      }

      const policial = policiais[0];

      const { error: errInsert } = await supabase
        .from("solicitacoes_senha")
        .insert([
          {
            policial_id: policial.id,
            matricula: policial.matricula,
            nome_guerra: policial.nome_guerra,
            motivo: motivoRecuperacao,
            status: "pendente",
          },
        ]);

      if (errInsert) throw errInsert;

      alert("Solicitação enviada com sucesso para o painel do Master!");
      setIsEsqueciModalOpen(false);
      setMatriculaRecuperacao("");
      setMotivoRecuperacao("");
    } catch (err) {
      alert("Erro ao enviar solicitação: " + err.message);
    } finally {
      setEnviandoSolicitacao(false);
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
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-semibold text-slate-300 uppercase">
                Senha
              </label>
              <button
                type="button"
                onClick={() => setIsEsqueciModalOpen(true)}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                Esqueci minha senha
              </button>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

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

      {isEsqueciModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-blue-500" />
                <span>Solicitar Redefinição de Senha</span>
              </h2>
              <button
                onClick={() => setIsEsqueciModalOpen(false)}
                className="text-slate-400 hover:text-white font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSolicitarReset} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 uppercase mb-1">
                  Sua Matrícula
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 1357281X"
                  value={matriculaRecuperacao}
                  onChange={(e) => setMatriculaRecuperacao(e.target.value)}
                  className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 uppercase mb-1">
                  Motivo da Solicitação
                </label>
                <textarea
                  required
                  rows="3"
                  placeholder="Descreva o motivo..."
                  value={motivoRecuperacao}
                  onChange={(e) => setMotivoRecuperacao(e.target.value)}
                  className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white resize-none"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEsqueciModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={enviandoSolicitacao}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow disabled:opacity-50"
                >
                  {enviandoSolicitacao ? "Enviando..." : "Enviar Solicitação"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
