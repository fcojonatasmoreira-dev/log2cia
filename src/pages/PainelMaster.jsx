import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  Shield,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Users,
  UserPlus,
  FileText,
} from "lucide-react";

export default function PainelMaster() {
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOperador, setModalOperador] = useState(false);

  // Estados para o formulário de Cadastro de Operador
  const [nomeCompleto, setNomeCompleto] = useState("");
  const [nomeGuerra, setNomeGuerra] = useState("");
  const [matricula, setMatricula] = useState("");
  const [numeral, setNumeral] = useState("");
  const [postoGraduacao, setPostoGraduacao] = useState("Soldado");
  const [role, setRole] = useState("policial");
  const [unidade, setUnidade] = useState("2ª CIA");
  const [primeiroAcesso, setPrimeiroAcesso] = useState(true);
  const [cadastrando, setCadastrando] = useState(false);

  useEffect(() => {
    carregarSolicitacoes();
  }, []);

  async function carregarSolicitacoes() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("solicitacoes_senha")
        .select("*")
        .eq("status", "pendente")
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (data) setSolicitacoes(data);
    } catch (err) {
      console.error("Erro ao carregar solicitações de senha:", err.message);
    } finally {
      setLoading(false);
    }
  }

  const handleAprovarReset = async (solicitacao) => {
    if (
      !confirm(
        `Confirma a aprovação de reset de senha para o militar ${solicitacao.nome_guerra} (Mat: ${solicitacao.matricula})? A senha voltará a ser o numeral e ele será obrigado a redefinir no próximo acesso.`,
      )
    ) {
      return;
    }

    try {
      const { error: errPolicial } = await supabase
        .from("policiais")
        .update({
          senha: null,
          primeiro_acesso: true,
        })
        .eq("id", solicitacao.policial_id);

      if (errPolicial) throw errPolicial;

      const { error: errSolicitacao } = await supabase
        .from("solicitacoes_senha")
        .update({ status: "aprovada" })
        .eq("id", solicitacao.id);

      if (errSolicitacao) throw errSolicitacao;

      alert(
        "Senha resetada com sucesso! O militar agora está em regime de primeiro acesso.",
      );
      carregarSolicitacoes();
    } catch (err) {
      alert("Erro ao aprovar reset: " + err.message);
    }
  };

  const handleCadastrarOperador = async (e) => {
    e.preventDefault();
    setCadastrando(true);

    try {
      const payload = {
        nome_completo: nomeCompleto.trim(),
        nome_guerra: nomeGuerra.trim(),
        matricula: matricula.trim(),
        numeral: numeral ? String(numeral).trim() : null, // numeral é do tipo text na base
        posto_graduacao: postoGraduacao,
        role: role.toLowerCase(),
        unidade: unidade.trim(),
        primeiro_acesso: primeiroAcesso,
        senha: null,
        status: "EM ATIVIDADE",
      };

      const { error } = await supabase.from("policiais").insert([payload]);

      if (error) throw error;

      alert("Operador cadastrado com sucesso!");
      setNomeCompleto("");
      setNomeGuerra("");
      setMatricula("");
      setNumeral("");
      setPostoGraduacao("Soldado");
      setRole("policial");
      setUnidade("2ª CIA");
      setPrimeiroAcesso(true);
      setModalOperador(false);
    } catch (err) {
      alert("Erro ao cadastrar operador: " + err.message);
    } finally {
      setCadastrando(false);
    }
  };

  return (
    <div className="space-y-6 p-4 max-w-6xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="w-7 h-7 text-blue-600" />
            <span>Painel Master — Governança e Segurança</span>
          </h1>
          <p className="text-sm text-slate-500">
            Gerenciamento absoluto do sistema, cadastros de operadores e
            aprovação de redefinições de senhas.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setModalOperador(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl shadow text-xs flex items-center gap-2 transition-all"
        >
          <UserPlus className="w-4 h-4" />
          <span>Novo Operador</span>
        </button>
      </div>

      {/* Modal de Cadastro de Operador */}
      {modalOperador && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-gray-100 space-y-4 my-8">
            <div className="flex justify-between items-center border-b pb-3">
              <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-600" />
                <span>Cadastrar Novo Operador / Efetivo</span>
              </h2>
              <button
                onClick={() => setModalOperador(false)}
                className="text-gray-400 hover:text-gray-600 font-bold text-lg p-1"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleCadastrarOperador}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: João da Silva"
                  value={nomeCompleto}
                  onChange={(e) => setNomeCompleto(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Nome de Guerra *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Sd Silva"
                    value={nomeGuerra}
                    onChange={(e) => setNomeGuerra(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Matrícula *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 1357281X"
                    value={matricula}
                    onChange={(e) => setMatricula(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Numeral *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 31929"
                    value={numeral}
                    onChange={(e) => setNumeral(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Posto / Graduação
                  </label>
                  <select
                    value={postoGraduacao}
                    onChange={(e) => setPostoGraduacao(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium"
                  >
                    <option value="Soldado">Soldado</option>
                    <option value="Cabo">Cabo</option>
                    <option value="3º Sgt">3º Sgt</option>
                    <option value="2º Sgt">2º Sgt</option>
                    <option value="1º Sgt">1º Sgt</option>
                    <option value="Subtenente">Subtenente</option>
                    <option value="Aspirante">Aspirante</option>
                    <option value="2º Tenente">2º Tenente</option>
                    <option value="1º Tenente">1º Tenente</option>
                    <option value="Capitão">Capitão</option>
                    <option value="Major">Major</option>
                    <option value="Tenente Coronel">Tenente Coronel</option>
                    <option value="Coronel">Coronel</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Perfil de Acesso (Role)
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium"
                  >
                    <option value="policial">Policial</option>
                    <option value="armeiro">Armeiro</option>
                    <option value="p4">P4</option>
                    <option value="master">Master</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Unidade / OPM
                  </label>
                  <input
                    type="text"
                    value={unidade}
                    onChange={(e) => setUnidade(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              {/* Checkbox de Primeiro Acesso */}
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="primeiroAcessoCheck"
                  checked={primeiroAcesso}
                  onChange={(e) => setPrimeiroAcesso(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <label
                  htmlFor="primeiroAcessoCheck"
                  className="font-semibold text-slate-700 cursor-pointer"
                >
                  Exigir alteração de senha no primeiro acesso (Senha inicial:
                  Numeral)
                </label>
              </div>

              <div className="flex gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setModalOperador(false)}
                  className="w-1/3 py-2.5 bg-gray-200 text-gray-700 font-bold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={cadastrando}
                  className="w-2/3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow disabled:opacity-50"
                >
                  {cadastrando ? "Cadastrando..." : "Salvar Operador"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Seção de Solicitações Pendentes de Senha */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-amber-600" />
            <h2 className="text-base font-bold text-slate-800">
              Solicitações Pendentes de Redefinição de Senha
            </h2>
          </div>
          <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-0.5 rounded-full">
            {solicitacoes.length} pendente(s)
          </span>
        </div>

        {loading ? (
          <p className="text-center py-6 text-slate-400 text-xs">
            Carregando solicitações...
          </p>
        ) : solicitacoes.length === 0 ? (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center text-slate-500 text-xs">
            Nenhuma solicitação de redefinição de senha pendente no momento.
          </div>
        ) : (
          <div className="space-y-3">
            {solicitacoes.map((sol) => (
              <div
                key={sol.id}
                className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-xs"
              >
                <div className="space-y-1">
                  <div className="font-bold text-slate-900 text-sm">
                    {sol.nome_guerra}{" "}
                    <span className="font-mono font-normal text-slate-500">
                      (Mat: {sol.matricula})
                    </span>
                  </div>
                  <p className="text-slate-600 font-medium">
                    <strong>Motivo:</strong> {sol.motivo}
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono">
                    Solicitado em:{" "}
                    {new Date(sol.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleAprovarReset(sol)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow transition-all shrink-0 flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Aprovar Reset de Senha</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
