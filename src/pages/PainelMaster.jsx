import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Shield,
  UserPlus,
  FileText,
  KeyRound,
  RefreshCw,
  Search,
  Copy,
  Check,
  LogOut,
  ShieldOff,
} from "lucide-react";
import { administrarConta, listarGestaoCredenciais, resetarCredencial } from "../services/credenciaisService";
import { listarPresencas } from "../services/presencaService";
import { filtrarPresencas } from "../utils/presenca";
import { filtrarUsuariosMaster, situacaoCredencialUsuario } from "../utils/painelMaster";
import { Skeleton, SkeletonCard, SkeletonPage } from "../components/ui/Skeleton";

const ROLES_GESTAO = ["master", "p4", "armeiro", "oficial", "p1", "p1_escalante_servico_ordinario", "policial", "permanente", "permanente da guarda"];

export default function PainelMaster({ user }) {
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
  const [usuariosCarregados, setUsuariosCarregados] = useState(false);
  const [erroUsuarios, setErroUsuarios] = useState("");
  const [buscaUsuarios, setBuscaUsuarios] = useState("");
  const [filtroPerfilUsuario, setFiltroPerfilUsuario] = useState("");
  const [filtroContaUsuario, setFiltroContaUsuario] = useState("");
  const [filtroCredencialUsuario, setFiltroCredencialUsuario] = useState("");
  const [usuarioGerenciado, setUsuarioGerenciado] = useState("");
  const [resetandoUsuario, setResetandoUsuario] = useState("");
  const [senhaTemporaria, setSenhaTemporaria] = useState("");
  const [feedbackCopiaSenha, setFeedbackCopiaSenha] = useState("");
  const [acaoConta, setAcaoConta] = useState("");
  const [presencas, setPresencas] = useState([]);
  const [presencasCarregadas, setPresencasCarregadas] = useState(false);
  const [totalOnline, setTotalOnline] = useState(0);
  const [carregandoPresencas, setCarregandoPresencas] = useState(true);
  const [erroPresencas, setErroPresencas] = useState("");
  const [buscaPresenca, setBuscaPresenca] = useState("");
  const [filtroSituacaoPresenca, setFiltroSituacaoPresenca] = useState("");
  const [filtroPerfilPresenca, setFiltroPerfilPresenca] = useState("");
  const [filtroUnidadePresenca, setFiltroUnidadePresenca] = useState("");

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
      setUsuariosCarregados(true);
    } catch (error) {
      setErroUsuarios(error.message);
    } finally {
      setCarregandoUsuarios(false);
    }
  };

  const carregarPresencas = useCallback(async (mostrarCarregamento = false) => {
    if (mostrarCarregamento) setCarregandoPresencas(true);
    try {
      const resultado = await listarPresencas();
      setPresencas(resultado.usuarios);
      setTotalOnline(resultado.total_online);
      setPresencasCarregadas(true);
      setErroPresencas("");
    } catch (error) {
      setErroPresencas(error.message || "Não foi possível carregar as presenças.");
    } finally {
      if (mostrarCarregamento) setCarregandoPresencas(false);
    }
  }, []);

  useEffect(() => {
    const agendamento = window.setTimeout(() => { void carregarUsuarios(); }, 0);
    return () => window.clearTimeout(agendamento);
  }, []);
  useEffect(() => {
    const agendamento = window.setTimeout(() => { void carregarPresencas(true); }, 0);
    return () => window.clearTimeout(agendamento);
  }, [carregarPresencas]);

  const usuariosFiltrados = useMemo(() => {
    return filtrarUsuariosMaster(usuarios, {
      busca: buscaUsuarios,
      perfil: filtroPerfilUsuario,
      conta: filtroContaUsuario,
      credencial: filtroCredencialUsuario,
    });
  }, [buscaUsuarios, filtroPerfilUsuario, filtroContaUsuario, filtroCredencialUsuario, usuarios]);

  const perfisUsuario = useMemo(() => [...new Set(usuarios.map((usuario) => usuario.role).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [usuarios]);
  const perfisPresenca = useMemo(() => [...new Set(presencas.map((item) => item.perfil).filter(Boolean))].sort(), [presencas]);
  const unidadesPresenca = useMemo(() => [...new Set(presencas.map((item) => item.unidade).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [presencas]);
  const presencasFiltradas = useMemo(() => {
    return filtrarPresencas(presencas, {
      busca: buscaPresenca, situacao: filtroSituacaoPresenca,
      perfil: filtroPerfilPresenca, unidade: filtroUnidadePresenca,
    });
  }, [presencas, buscaPresenca, filtroSituacaoPresenca, filtroPerfilPresenca, filtroUnidadePresenca]);

  const handleResetCredencial = async (usuario) => {
    const nome = usuario.nome_guerra || usuario.nome_completo || usuario.matricula;
    if (!window.confirm(`Gerar nova senha temporária para ${nome}? As sessões atuais serão invalidadas.`)) return;
    const chave = `${usuario.origem}:${usuario.id}`;
    setResetandoUsuario(chave);
    try {
      const resultado = await resetarCredencial(usuario);
      setSenhaTemporaria(resultado.senhaTemporaria || "");
      await Promise.all([carregarUsuarios(), carregarPresencas(true)]);
    } catch (error) {
      window.alert(error.message);
    } finally {
      setResetandoUsuario("");
    }
  };

  const handleAdministrarConta = async (usuario, tipo, role = null) => {
    const nome = usuario.nome_guerra || usuario.nome_completo || usuario.matricula;
    const textos = {
      encerrar_sessoes: `Encerrar todas as sessões de ${nome}? A pessoa precisará entrar novamente em cada dispositivo.`,
      suspender: `Suspender a conta de ${nome}? As sessões abertas perderão acesso e novos logins serão recusados.`,
      reativar: `Reativar a conta de ${nome}?`,
      alterar_perfil: `Alterar o perfil de ${nome} para ${role}? As sessões atuais serão revogadas.`,
    };
    if (tipo === "suspender" && usuario.origem === "policiais" && usuario.id === user?.id) {
      window.alert("O Master não pode suspender a própria conta.");
      return;
    }
    if (!window.confirm(textos[tipo])) return;
    const chave = `${usuario.origem}:${usuario.id}:${tipo}`;
    setAcaoConta(chave);
    try {
      await administrarConta(usuario, tipo, role);
      await Promise.all([carregarUsuarios(), carregarPresencas(true)]);
    } catch (error) {
      window.alert(error.message || "Não foi possível administrar a conta.");
    } finally {
      setAcaoConta("");
    }
  };

  const limparFiltrosUsuarios = () => {
    setBuscaUsuarios("");
    setFiltroPerfilUsuario("");
    setFiltroContaUsuario("");
    setFiltroCredencialUsuario("");
  };

  const rotuloCredencial = (usuario) => ({
    nao_provisionada: "Não provisionada",
    sem_senha: "Sem senha",
    primeiro_acesso: "Primeiro acesso pendente",
    ativa: "Ativa",
  })[situacaoCredencialUsuario(usuario)];

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
      await Promise.all([carregarUsuarios(), carregarPresencas(true)]);
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

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-lg font-bold text-slate-800">Presença de usuários</h2><p className="text-xs text-slate-500">Sinal autenticado por aba; online significa uma sessão com sinal recebido nos últimos dois minutos.</p></div>
          <div className="flex items-center gap-2"><span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800">{presencasCarregadas ? `${totalOnline} online` : carregandoPresencas ? <Skeleton className="h-4 w-12" /> : "— online"}</span><button type="button" onClick={() => void carregarPresencas(true)} disabled={carregandoPresencas} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${carregandoPresencas ? "animate-spin" : ""}`} />Atualizar</button></div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-1 text-xs font-semibold text-slate-600">Nome, numeral ou matrícula<input type="search" value={buscaPresenca} onChange={(evento) => setBuscaPresenca(evento.target.value)} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal" placeholder="Pesquisar usuário" /></label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">Presença<select value={filtroSituacaoPresenca} onChange={(evento) => setFiltroSituacaoPresenca(evento.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal"><option value="">Online e offline</option><option value="ONLINE">Online</option><option value="OFFLINE">Offline</option></select></label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">Perfil<select value={filtroPerfilPresenca} onChange={(evento) => setFiltroPerfilPresenca(evento.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal"><option value="">Todos os perfis</option>{perfisPresenca.map((perfil) => <option key={perfil} value={perfil}>{perfil}</option>)}</select></label>
          {unidadesPresenca.length > 0 && <label className="grid gap-1 text-xs font-semibold text-slate-600">Unidade<select value={filtroUnidadePresenca} onChange={(evento) => setFiltroUnidadePresenca(evento.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal"><option value="">Todas as unidades</option>{unidadesPresenca.map((unidade) => <option key={unidade} value={unidade}>{unidade}</option>)}</select></label>}
        </div>
        {erroPresencas && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{erroPresencas}</p>}
        {carregandoPresencas && !presencasCarregadas ? <SkeletonPage className="grid gap-2 p-2 md:grid-cols-2" label="Carregando presença">{Array.from({ length: 4 }, (_, indice) => <SkeletonCard key={indice} lines={2} />)}</SkeletonPage>
          : erroPresencas && !presencasCarregadas ? null : presencasFiltradas.length ? <div className="grid gap-2 md:grid-cols-2">{presencasFiltradas.map((item) => <article key={item.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-800">{item.posto_graduacao} · {item.numeral} · {item.nome}</p><p className="mt-0.5 text-xs text-slate-500">Perfil: {item.perfil}{item.unidade ? ` · Unidade: ${item.unidade}` : ""}</p><p className="mt-0.5 text-[11px] text-slate-500">Último sinal da sessão: {item.ultima_atividade ? new Date(item.ultima_atividade).toLocaleString("pt-BR") : "Sem sinal registrado"}</p></div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <span className={`w-fit rounded-full px-2.5 py-1 text-[10px] font-bold ${item.situacao === "ONLINE" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{item.situacao === "ONLINE" ? "ONLINE" : "OFFLINE"}</span>
              <button type="button" onClick={() => void handleAdministrarConta({ id: item.id, origem: "policiais", nome_guerra: item.nome }, "encerrar_sessoes")} disabled={Boolean(acaoConta)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"><LogOut className="h-3.5 w-3.5" />Encerrar sessões</button>
            </div>
          </article>)}</div> : <p className="p-4 text-center text-sm text-slate-500">Nenhum usuário corresponde aos filtros.</p>}
      </section>

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

        {resumoCredenciais ? <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
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
        </div> : carregandoUsuarios ? <SkeletonPage className="grid grid-cols-2 gap-2 lg:grid-cols-5" label="Carregando indicadores de credenciais">{Array.from({ length: 5 }, (_, indice) => <SkeletonCard key={indice} lines={1} />)}</SkeletonPage> : null}

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="search" value={buscaUsuarios} onChange={(event) => setBuscaUsuarios(event.target.value)} placeholder="Nome, numeral ou matrícula" className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm" />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">Perfil<select value={filtroPerfilUsuario} onChange={(event) => setFiltroPerfilUsuario(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal"><option value="">Todos os perfis</option>{perfisUsuario.map((perfil) => <option key={perfil} value={perfil}>{perfil}</option>)}</select></label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">Estado da conta<select value={filtroContaUsuario} onChange={(event) => setFiltroContaUsuario(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal"><option value="">Ativas e suspensas</option><option value="ativa">Ativa</option><option value="suspensa">Suspensa</option></select></label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">Situação da credencial<select value={filtroCredencialUsuario} onChange={(event) => setFiltroCredencialUsuario(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal"><option value="">Todas as credenciais</option><option value="nao_provisionada">Não provisionada</option><option value="sem_senha">Sem senha</option><option value="primeiro_acesso">Primeiro acesso pendente</option><option value="ativa">Ativa</option></select></label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2"><button type="button" onClick={limparFiltrosUsuarios} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">Limpar filtros</button><span className="text-xs text-slate-500">{usuariosCarregados ? `${usuariosFiltrados.length} de ${usuarios.length} usuários · Credenciais cadastradas: ${resumoCredenciais?.credenciaisCadastradas ?? "—"}` : carregandoUsuarios ? <Skeleton className="inline-block h-3 w-48 align-middle" /> : "Dados de usuários indisponíveis."}</span></div>

        {!carregandoUsuarios && !erroUsuarios && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{historicoDisponivel ? "O histórico é registrado a partir da ativação desta trilha. Ausência de registro não significa que o usuário nunca acessou ou alterou a senha." : "Histórico de acessos e alterações não está disponível. Ausência de registro não significa que o usuário nunca acessou ou alterou a senha."}</p>}
        {erroUsuarios && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{erroUsuarios}</p>}
        {carregandoUsuarios && !usuariosCarregados ? <SkeletonPage className="space-y-2" label="Carregando usuários">{Array.from({ length: 4 }, (_, indice) => <SkeletonCard key={indice} lines={2} />)}</SkeletonPage> : erroUsuarios && !usuariosCarregados ? null : !erroUsuarios && <div className="space-y-2">
          {usuariosFiltrados.map((usuario) => {
            const chave = `${usuario.origem}:${usuario.id}`;
            const aberto = usuarioGerenciado === chave;
            const data = (valor) => valor ? new Date(valor).toLocaleString("pt-BR") : "Sem registro disponível";
            return <article key={chave} className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-bold text-slate-800">{usuario.nome_guerra || usuario.nome_completo || "—"}</p>
                  <p className="text-xs text-slate-500">{usuario.posto_graduacao || "Posto não informado"}{usuario.numeral ? ` · ${usuario.numeral}` : ""} · {usuario.nome_completo || ""}{usuario.matricula ? ` · Matrícula ${usuario.matricula}` : ""}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-800">{usuario.role}</span>
                    <span className={`rounded-full px-2 py-1 ${usuario.contaSuspensa ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}`}>Conta {usuario.contaSuspensa ? "suspensa" : "ativa"}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{rotuloCredencial(usuario)}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">Cadastro {usuario.status || "não informado"}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">{usuario.origem === "policiais" ? "Efetivo" : "DRSO externo"}</span>
                  </div>
                </div>
                <button type="button" onClick={() => setUsuarioGerenciado(aberto ? "" : chave)} aria-expanded={aberto} className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-50">{aberto ? "Fechar detalhes" : "Gerenciar"}</button>
              </div>
              {aberto && <div className="mt-4 border-t border-slate-100 pt-4">
                <dl className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                  <div><dt className="font-semibold text-slate-500">Primeiro acesso</dt><dd className="mt-1 text-slate-800">{usuario.primeiroAcesso ? "Pendente" : "Concluído"}</dd></div>
                  <div><dt className="font-semibold text-slate-500">Último login</dt><dd className="mt-1 text-slate-800">{historicoDisponivel ? data(usuario.ultimoLogin) : "Histórico indisponível"}</dd></div>
                  <div><dt className="font-semibold text-slate-500">Última alteração de senha</dt><dd className="mt-1 text-slate-800">{historicoDisponivel ? data(usuario.ultimaAlteracaoSenha) : "Histórico indisponível"}</dd></div>
                  <div><dt className="font-semibold text-slate-500">Credencial</dt><dd className="mt-1 text-slate-800">{usuario.temSenha ? "Senha cadastrada; valor não exibido" : "Sem senha cadastrada"}</dd></div>
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  {usuario.origem === "policiais" && <label className="grid gap-1 text-xs font-semibold text-slate-600">Perfil<select aria-label={`Perfil de ${usuario.nome_guerra || usuario.nome_completo}`} value={usuario.role} disabled={Boolean(acaoConta)} onChange={(evento) => void handleAdministrarConta(usuario, "alterar_perfil", evento.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2"><option value={usuario.role}>{usuario.role}</option>{ROLES_GESTAO.filter((perfil) => perfil !== usuario.role).map((perfil) => <option key={perfil} value={perfil}>{perfil}</option>)}</select></label>}
                  <button type="button" onClick={() => void handleAdministrarConta(usuario, "encerrar_sessoes")} disabled={Boolean(acaoConta)} className="mt-auto inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"><LogOut className="h-3.5 w-3.5" />Encerrar sessões</button>
                  <button type="button" onClick={() => void handleAdministrarConta(usuario, usuario.contaSuspensa ? "reativar" : "suspender")} disabled={Boolean(acaoConta) || (usuario.origem === "policiais" && usuario.id === user?.id && !usuario.contaSuspensa)} className={`mt-auto inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${usuario.contaSuspensa ? "border-emerald-200 text-emerald-800" : "border-rose-200 text-rose-800"}`}><ShieldOff className="h-3.5 w-3.5" />{usuario.contaSuspensa ? "Reativar conta" : "Suspender conta"}</button>
                  <button type="button" onClick={() => void handleResetCredencial(usuario)} disabled={resetandoUsuario === chave || Boolean(acaoConta)} className="mt-auto inline-flex items-center gap-1 rounded-lg border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-50"><KeyRound className="h-3.5 w-3.5" />{resetandoUsuario === chave ? "Gerando..." : "Redefinir senha temporária"}</button>
                </div>
              </div>}
            </article>;
          })}
          {!usuariosFiltrados.length && <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">Nenhum usuário encontrado.</p>}
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
