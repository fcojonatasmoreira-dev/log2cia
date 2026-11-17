import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Shield,
  AlertCircle,
  Users,
  UserPlus,
  FileText,
  KeyRound,
  RefreshCw,
  Search,
  Copy,
  Check,
} from "lucide-react";
import { listarGestaoCredenciais, resetarCredencial } from "../services/credenciaisService";

export default function PainelMaster() {
  const navigate = useNavigate();
  const [modalOperador, setModalOperador] = useState(false);

  // Estados para o formulário de Cadastro de Operador
  const [nomeCompleto, setNomeCompleto] = useState("");
  const [nomeGuerra, setNomeGuerra] = useState("");
  const [matricula, setMatricula] = useState("");
  const [numeral, setNumeral] = useState("");
  const [postoGraduacao, setPostoGraduacao] = useState("Soldado");
  const [role, setRole] = useState("policial");
  const [unidade, setUnidade] = useState("2ª CIA");
  const [cadastrando, setCadastrando] = useState(false);
  const [usuarios, setUsuarios] = useState([]);
  const [resumoCredenciais, setResumoCredenciais] = useState(null);
  const [historicoDisponivel, setHistoricoDisponivel] = useState(false);
  const [carregandoUsuarios, setCarregandoUsuarios] = useState(true);
  const [erroUsuarios, setErroUsuarios] = useState("");
  const [buscaUsuarios, setBuscaUsuarios] = useState("");
  const [resetandoUsuario, setResetandoUsuario] = useState("");
  const [senhaTemporaria, setSenhaTemporaria] = useState("");
  const [feedbackCopiaSenha, setFeedbackCopiaSenha] = useState("");

  const fecharModalSenha = () => {
    setSenhaTemporaria("");
    setFeedbackCopiaSenha("");
  };

  const copiarSenhaTemporaria = async () => {
    try {
      await navigator.clipboard.writeText(senhaTemporaria);
      setFeedbackCopiaSenha("Senha copiada");
    } catch {
      setFeedbackCopiaSenha("Não foi possível copiar. Tente novamente.");
    }
  };

  const carregarUsuarios = async () => {
    setCarregandoUsuarios(true);
    setErroUsuarios("");
    try {
      const resultado = await listarGestaoCredenciais();
      setUsuarios(resultado.usuarios || []);
      setResumoCredenciais(resultado.resumo || null);
      setHistoricoDisponivel(resultado.historicoDisponivel === true);
    } catch (error) {
      setErroUsuarios(error.message);
    } finally {
      setCarregandoUsuarios(false);
    }
  };

  useEffect(() => { carregarUsuarios(); }, []);

  const usuariosFiltrados = useMemo(() => {
    const termo = buscaUsuarios.trim().toLocaleLowerCase("pt-BR");
    if (!termo) return usuarios;
    return usuarios.filter((usuario) =>
      `${usuario.nome_completo || ""} ${usuario.nome_guerra || ""} ${usuario.matricula || ""}`
        .toLocaleLowerCase("pt-BR").includes(termo),
    );
  }, [buscaUsuarios, usuarios]);

  const handleResetCredencial = async (usuario) => {
    const nome = usuario.nome_guerra || usuario.nome_completo || usuario.matricula;
    if (!window.confirm(`Gerar nova senha temporária para ${nome}? As sessões atuais serão invalidadas.`)) return;
    const chave = `${usuario.origem}:${usuario.id}`;
    setResetandoUsuario(chave);
    try {
      const resultado = await resetarCredencial(usuario);
      setSenhaTemporaria(resultado.senhaTemporaria || "");
      await carregarUsuarios();
    } catch (error) {
      window.alert(error.message);
    } finally {
      setResetandoUsuario("");
    }
  };

  // Lista de postos que NÃO possuem numeral (Subtenente pra cima)
  const postosSemNumeral = [
    "Subtenente",
    "Aspirante",
    "2º Tenente",
    "1º Tenente",
    "Capitão",
    "Major",
    "Tenente Coronel",
    "Coronel",
  ];

  const ehPostoSemNumeral = postosSemNumeral.includes(postoGraduacao);

  // Se mudar para um posto sem numeral, limpa o estado do numeral automaticamente
  const handlePostoChange = (novoPosto) => {
    setPostoGraduacao(novoPosto);
    if (postosSemNumeral.includes(novoPosto)) {
      setNumeral("");
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
        numeral:
          !ehPostoSemNumeral && numeral && numeral.trim() !== ""
            ? numeral.trim()
            : null,
        posto_graduacao: postoGraduacao,
        role: role.toLowerCase(),
        unidade: unidade.trim(),
        primeiro_acesso: true,
        status: "EM ATIVIDADE",
      };

      const response = await fetch("/api/policiais", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const resultado = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(resultado.error || "Não foi possível cadastrar o operador.");

      setSenhaTemporaria(resultado.senhaTemporaria || "");
      setNomeCompleto("");
      setNomeGuerra("");
      setMatricula("");
      setNumeral("");
      setPostoGraduacao("Soldado");
      setRole("policial");
      setUnidade("2ª CIA");
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
            Cadastros de operadores e gestão exclusiva de credenciais.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/gerenciamento-arquivo")}
            className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-4 py-2.5 rounded-xl shadow text-xs flex items-center gap-2 transition-all"
          >
            <FileText className="w-4 h-4" />
            <span>Gerenciar Arquivo</span>
          </button>
          <button
          type="button"
          onClick={() => setModalOperador(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl shadow text-xs flex items-center gap-2 transition-all"
        >
          <UserPlus className="w-4 h-4" />
          <span>Novo Operador</span>
        </button>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Gestão de usuários e credenciais</h2>
            <p className="text-xs text-slate-500">Acesso administrativo restrito ao Master. Senhas e hashes nunca são exibidos.</p>
          </div>
          <button type="button" onClick={carregarUsuarios} disabled={carregandoUsuarios} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${carregandoUsuarios ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>

        {resumoCredenciais && <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          {[
            ["Total", resumoCredenciais.total],
            ["Policiais", resumoCredenciais.porOrigem?.policiais],
            ["DRSO externo", resumoCredenciais.porOrigem?.drso_policiais_externos],
            ["Sem senha", resumoCredenciais.semSenha],
            ["Primeiro acesso pendente", resumoCredenciais.primeiroAcessoPendente],
          ].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3">
            <p className="text-[10px] font-semibold uppercase text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-bold text-slate-800">{value ?? "—"}</p>
          </div>)}
        </div>}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={buscaUsuarios} onChange={(event) => setBuscaUsuarios(event.target.value)} placeholder="Buscar por nome ou matrícula" className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm" />
          </label>
          <span className="text-xs text-slate-500">Credenciais cadastradas: {resumoCredenciais?.credenciaisCadastradas ?? "—"}</span>
        </div>

        {!carregandoUsuarios && !erroUsuarios && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{historicoDisponivel ? "O histórico é registrado a partir da ativação desta trilha. Ausência de registro não significa que o usuário nunca acessou ou alterou a senha." : "Histórico de acessos e alterações não está disponível. Ausência de registro não significa que o usuário nunca acessou ou alterou a senha."}</p>}
        {erroUsuarios && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{erroUsuarios}</p>}
        {carregandoUsuarios ? <p className="py-5 text-center text-sm text-slate-500">Carregando usuários...</p> : !erroUsuarios && <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full min-w-[1050px] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr>
              <th className="p-3">Usuário</th><th className="p-3">Origem</th><th className="p-3">Perfil</th><th className="p-3">Status cadastral</th><th className="p-3">Credencial</th><th className="p-3">Primeiro acesso</th><th className="p-3">Último login</th><th className="p-3">Última alteração de senha</th><th className="p-3">Ação</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">{usuariosFiltrados.map((usuario) => {
              const chave = `${usuario.origem}:${usuario.id}`;
              const data = (valor) => valor ? new Date(valor).toLocaleString("pt-BR") : "Sem registro disponível";
              return <tr key={chave}>
                <td className="p-3"><span className="font-semibold text-slate-800">{usuario.nome_guerra || usuario.nome_completo || "—"}</span><span className="block text-slate-500">{usuario.nome_completo || ""} · {usuario.matricula || "Sem matrícula"}</span></td>
                <td className="p-3">{usuario.origem === "policiais" ? "Efetivo" : "DRSO externo"}</td>
                <td className="p-3">{usuario.role}</td><td className="p-3">{usuario.status || "Não informado"}</td>
                <td className="p-3">{usuario.temSenha ? "Cadastrada" : "Sem senha"}</td>
                <td className="p-3">{usuario.primeiroAcesso ? "Pendente" : "Concluído"}</td>
                <td className="p-3">{historicoDisponivel ? data(usuario.ultimoLogin) : "Histórico indisponível"}</td>
                <td className="p-3">{historicoDisponivel ? data(usuario.ultimaAlteracaoSenha) : "Histórico indisponível"}</td>
                <td className="p-3"><button type="button" onClick={() => handleResetCredencial(usuario)} disabled={resetandoUsuario === chave} className="inline-flex items-center gap-1 rounded-lg border border-amber-200 px-2 py-1.5 font-semibold text-amber-800 disabled:opacity-50"><KeyRound className="h-3.5 w-3.5" />{resetandoUsuario === chave ? "Gerando..." : "Redefinir"}</button></td>
              </tr>;
            })}</tbody>
          </table>
          {!usuariosFiltrados.length && <p className="p-5 text-center text-sm text-slate-500">Nenhum usuário encontrado.</p>}
        </div>}
      </section>

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
                    Posto / Graduação
                  </label>
                  <select
                    value={postoGraduacao}
                    onChange={(e) => handlePostoChange(e.target.value)}
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
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Numeral {ehPostoSemNumeral ? "(Não Aplicável)" : "*"}
                  </label>
                  <input
                    type="text"
                    required={!ehPostoSemNumeral}
                    disabled={ehPostoSemNumeral}
                    placeholder={
                      ehPostoSemNumeral ? "Não se aplica" : "Ex: 31929"
                    }
                    value={numeral}
                    onChange={(e) => setNumeral(e.target.value)}
                    className={`w-full p-2.5 border rounded-xl font-mono ${
                      ehPostoSemNumeral
                        ? "bg-slate-200 text-slate-400 cursor-not-allowed border-slate-300"
                        : "bg-slate-50 border-slate-300"
                    }`}
                  />
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
                    <option value="permanente da guarda">
                      Permanente da Guarda
                    </option>
                    <option value="p1_escalante_servico_ordinario">P1 Escalante — Serviço Ordinário</option>
                    <option value="armeiro">Armeiro</option>
                    <option value="p4">P4</option>
                    <option value="oficial">Oficial</option>
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

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="primeiroAcessoCheck"
                  checked
                  disabled
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <label
                  htmlFor="primeiroAcessoCheck"
                  className="font-semibold text-slate-700 cursor-pointer"
                >
                  Exigir alteração de senha no primeiro acesso (senha temporária)
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

      {senhaTemporaria && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="senha-temporaria-titulo"
            className="w-full max-w-md space-y-5 rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-50 p-2.5 text-blue-700">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h2 id="senha-temporaria-titulo" className="text-lg font-bold text-slate-900">Senha temporária gerada</h2>
                <p className="text-sm text-slate-500">Entregue-a diretamente ao usuário.</p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="select-all break-all text-center font-mono text-lg font-semibold tracking-wide text-slate-900">{senhaTemporaria}</p>
            </div>

            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              Esta senha será exibida apenas uma vez. Entregue-a diretamente ao usuário.
            </p>

            <div className="space-y-3">
              <button
                type="button"
                onClick={copiarSenhaTemporaria}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-800 hover:bg-blue-100"
              >
                {feedbackCopiaSenha === "Senha copiada" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                Copiar senha
              </button>
              {feedbackCopiaSenha && (
                <p role="status" aria-live="polite" className={`text-center text-sm font-semibold ${feedbackCopiaSenha === "Senha copiada" ? "text-emerald-700" : "text-rose-700"}`}>
                  {feedbackCopiaSenha}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={fecharModalSenha}
              className="w-full rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-900"
            >
              Concluir
            </button>
          </section>
        </div>
      )}

    </div>
  );
}
