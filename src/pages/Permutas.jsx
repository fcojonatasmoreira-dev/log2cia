import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Filter, History, Plus, RefreshCw, Search, Send, X, XCircle } from "lucide-react";
import { cancelarPermuta, confirmarPermuta, criarPermuta, decidirPermuta, listarCalendariosMini, listarPermutas } from "../services/permutasService";
import { getPoliciaisPermutas, getPoliciaisPermutasCalendario } from "../services/policiaisService";
import { calcularIndicadoresCalendario, criarEventosCalendario, dataLocalHoje, deslocarData, deslocarReferenciaCalendario, filtrarServicosDeferidosPassados, obterDiasCalendario } from "../utils/permutasCalendar";
import { filtrarPoliciaisPorBusca, filtrarPoliciaisSubstitutos, formatarIdentificacaoPolicial } from "../utils/hierarquiaPolicial";
import { alternarEstadoLinhaPermuta, atualizarStatusPermuta, obterIdsMiniCalendariosAbertos, podeCancelarPermuta, podeConsultarCalendario, podeConsultarCalendarioProprio, podeDecidirPermuta } from "../utils/permutasUi";

const SERVICO_VAZIO = { data: "", turno: "", horario_inicio: "", horario_fim: "", descricao: "" };
const STATUS = {
  AGUARDANDO_CONFIRMACAO: { label: "Aguardando confirmação", style: "border-amber-200 bg-amber-50 text-amber-800" },
  AGUARDANDO_ANALISE: { label: "Aguardando análise", style: "border-blue-200 bg-blue-50 text-blue-800" },
  DEFERIDA: { label: "Deferida", style: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  INDEFERIDA: { label: "Indeferida", style: "border-rose-200 bg-rose-50 text-rose-800" },
  CANCELADA: { label: "Cancelada", style: "border-slate-200 bg-slate-100 text-slate-700" },
};
const EVENTO_HISTORICO = {
  CRIADA: "Solicitação criada",
  MANIFESTACAO: "Serviço informado",
  CONFIRMADA: "Confirmação de participação",
  DEFERIDA: "Deferimento",
  INDEFERIDA: "Indeferimento",
  CANCELADA: "Cancelamento",
};
const LIMITE_MOTIVO_PERMUTA = 500;

function dataBrasileira(valor) {
  if (!valor) return "—";
  const [ano, mes, dia] = String(valor).slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : "—";
}

function horarioBrasileiro(valor) {
  return valor ? String(valor).slice(0, 5) : "—";
}

function dataHoraBrasileira(valor) {
  if (!valor) return "—";
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? "—" : data.toLocaleString("pt-BR");
}

function nomePolicial(policial) {
  return policial?.nome_guerra || policial?.nome_completo || "Policial não localizado";
}

function identificacaoPolicial(policial) {
  if (!policial) return "Policial não localizado";
  return [policial.posto_graduacao, policial.numeral && `Nº ${policial.numeral}`, nomePolicial(policial)].filter(Boolean).join(" · ");
}

function formatarDataCalendario(chave, opcoes = { day: "2-digit", month: "2-digit", year: "numeric" }) {
  if (!chave) return "—";
  const [ano, mes, dia] = chave.split("-").map(Number);
  return new Date(ano, mes - 1, dia).toLocaleDateString("pt-BR", opcoes);
}

function validarServico(servico) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(servico.data)) return "Informe uma data válida.";
  const [ano, mes, dia] = servico.data.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return "Informe uma data válida.";
  if (!servico.turno.trim() || servico.turno.trim().length > 80) return "Informe o turno (até 80 caracteres).";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(servico.horario_inicio) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(servico.horario_fim)) return "Informe os horários inicial e final.";
  if (servico.horario_inicio === servico.horario_fim) return "O horário final deve ser diferente do inicial.";
  if (!servico.descricao.trim() || servico.descricao.trim().length > 500) return "Descreva o serviço (até 500 caracteres).";
  return "";
}

function CampoServico({ valor, atualizar, idPrefixo }) {
  const alterar = (campo) => (evento) => atualizar((atual) => ({ ...atual, [campo]: evento.target.value }));
  const classe = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label htmlFor={`${idPrefixo}-data`} className="grid gap-1 text-xs font-semibold text-slate-600">Data do serviço
        <input id={`${idPrefixo}-data`} className={classe} type="date" required value={valor.data} onChange={alterar("data")} />
      </label>
      <label htmlFor={`${idPrefixo}-turno`} className="grid gap-1 text-xs font-semibold text-slate-600">Turno
        <input id={`${idPrefixo}-turno`} className={classe} required maxLength={80} value={valor.turno} onChange={alterar("turno")} placeholder="Ex.: A, B ou serviço extraordinário" />
      </label>
      <label htmlFor={`${idPrefixo}-inicio`} className="grid gap-1 text-xs font-semibold text-slate-600">Horário inicial
        <input id={`${idPrefixo}-inicio`} className={classe} type="time" required value={valor.horario_inicio} onChange={alterar("horario_inicio")} />
      </label>
      <label htmlFor={`${idPrefixo}-fim`} className="grid gap-1 text-xs font-semibold text-slate-600">Horário final
        <input id={`${idPrefixo}-fim`} className={classe} type="time" required value={valor.horario_fim} onChange={alterar("horario_fim")} />
      </label>
      {valor.horario_inicio && valor.horario_fim && valor.horario_fim < valor.horario_inicio && (
        <p className="text-xs text-blue-700 sm:col-span-2">O horário final será considerado no dia seguinte.</p>
      )}
      <label htmlFor={`${idPrefixo}-descricao`} className="grid gap-1 text-xs font-semibold text-slate-600 sm:col-span-2">Descrição do serviço
        <textarea id={`${idPrefixo}-descricao`} className={`${classe} min-h-20 resize-y`} required maxLength={500} value={valor.descricao} onChange={alterar("descricao")} placeholder="Descreva o serviço informado" />
      </label>
    </div>
  );
}

function LinhaServico({ servico, titulo }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      {titulo && <p className="mb-2 text-xs font-bold text-slate-700">{titulo}</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
        <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-slate-400" />{dataBrasileira(servico.data_servico)}</span>
        <span>Turno {servico.turno}</span>
        <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4 text-slate-400" />{horarioBrasileiro(servico.horario_inicio)} às {horarioBrasileiro(servico.horario_fim)}{servico.horario_fim <= servico.horario_inicio ? " (dia seguinte)" : ""}</span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{servico.descricao}</p>
    </div>
  );
}

function chaveMiniCalendario(permutaId, policialId) {
  return `${permutaId}:${policialId}`;
}

function MiniCalendarioPolicial({ id, policial, permutas, carregando, erro }) {
  const hoje = dataLocalHoje();
  const [agora, setAgora] = useState(() => new Date());
  const dias = useMemo(() => obterDiasCalendario(hoje, "mes"), [hoje]);
  const dataInicio = deslocarData(dias[0], -1);
  const dataFim = dias.at(-1) || "";
  const [diaSelecionado, setDiaSelecionado] = useState(hoje);
  useEffect(() => {
    const intervalo = window.setInterval(() => setAgora(new Date()), 30_000);
    return () => window.clearInterval(intervalo);
  }, []);
  const servicosPassados = useMemo(() => filtrarServicosDeferidosPassados(permutas, agora), [permutas, agora]);
  const eventos = useMemo(() => criarEventosCalendario(servicosPassados, {
    policialId: policial.id,
    dataInicio,
    dataFim,
  }), [servicosPassados, policial.id, dataInicio, dataFim]);
  const eventosPorDia = useMemo(() => {
    const mapa = new Map();
    for (const evento of eventos) mapa.set(evento.dataMarcacao, [...(mapa.get(evento.dataMarcacao) || []), evento]);
    return mapa;
  }, [eventos]);
  const eventosSelecionados = eventosPorDia.get(diaSelecionado) || [];
  const mesAtual = hoje.slice(0, 7);

  return (
    <section id={id} aria-label={`Mini calendário mensal de ${formatarIdentificacaoPolicial(policial)}`} className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
        <h4 className="text-xs font-bold capitalize text-slate-700">{formatarDataCalendario(hoje, { month: "long", year: "numeric" })}</h4>
        {carregando && <span className="text-[10px] text-slate-500">Atualizando…</span>}
      </div>
      <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] font-medium text-slate-600">
        <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-400" />Laranja: foi substituído</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-blue-500" />Azul: substituiu alguém</span>
        <span className="text-slate-500">Somente serviços deferidos com horário final passado; isso não confirma a execução.</span>
      </div>
      <div className="grid grid-cols-7 text-center text-[9px] font-bold text-slate-500">
        {["S", "T", "Q", "Q", "S", "S", "D"].map((dia, indice) => <span key={`${dia}-${indice}`} className="py-1">{dia}</span>)}
      </div>
      <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {dias.map((dia) => {
          const doMes = dia.slice(0, 7) === mesAtual;
          const eventosDia = eventosPorDia.get(dia) || [];
          return <button
            key={dia}
            type="button"
            onClick={() => setDiaSelecionado(dia)}
            aria-pressed={diaSelecionado === dia}
            aria-label={`${formatarDataCalendario(dia, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}, ${eventosDia.length} movimentação(ões)`}
            className={`relative min-h-8 border-b border-r border-slate-100 text-[10px] font-semibold ${diaSelecionado === dia ? "bg-blue-50 ring-1 ring-inset ring-blue-500" : "hover:bg-slate-50"} ${doMes ? "text-slate-700" : "bg-slate-50 text-slate-400"}`}
          >
            {Number(dia.slice(-2))}
            {eventosDia.length > 0 && <span className="absolute inset-x-1 bottom-0.5 flex justify-center gap-0.5" aria-hidden="true">
              {eventosDia.slice(0, 3).map((evento) => <i key={`${evento.permuta.id}-${evento.manifestacao.id}-${evento.dataMarcacao}`} className={`h-1 w-1 rounded-full ${evento.chaveParticipacao === "foi_substituido" ? "bg-amber-500" : "bg-blue-500"}`} />)}
              {eventosDia.length > 3 && <i className="text-[7px] not-italic leading-none text-slate-500">+</i>}
            </span>}
          </button>;
        })}
      </div>
      <div className="mt-2 space-y-1 border-t border-slate-200 pt-2">
        {erro && <p role="alert" className="text-[10px] font-medium text-rose-700">{erro}</p>}
        <p className="text-[10px] font-bold text-slate-600">Serviços deferidos passados em {formatarDataCalendario(diaSelecionado, { day: "2-digit", month: "2-digit" })}</p>
        {!eventosSelecionados.length && <p className="text-[10px] text-slate-500">Nenhuma movimentação neste dia.</p>}
        {eventosSelecionados.map((evento) => {
          const permuta = evento.permuta;
          const manifestacao = evento.manifestacao;
          const coberto = permuta.solicitante_id === manifestacao.policial_id ? permuta.solicitante : permuta.destinatario;
          const substituto = permuta.solicitante_id === manifestacao.substituto_id ? permuta.solicitante : permuta.destinatario;
          const estado = STATUS[permuta.status] || { label: permuta.status || "Situação desconhecida", style: "border-slate-200 bg-slate-100 text-slate-700" };
          return <div key={`${permuta.id}-${manifestacao.id}-${evento.dataMarcacao}`} className={`rounded-md border-l-2 p-1.5 text-[10px] ${evento.chaveParticipacao === "foi_substituido" ? "border-amber-500 bg-amber-50" : "border-blue-500 bg-blue-50"}`}>
            <div className="flex flex-wrap items-center gap-1">
              <strong>{evento.classificacaoPolicial}</strong>
              <span>· {permuta.tipo === "TROCA_RECIPROCA" ? "Troca recíproca" : "Substituição simples"}</span>
              <span className={`rounded border px-1 py-0.5 text-[9px] font-semibold ${estado.style}`}>{estado.label}</span>
            </div>
            <p className="mt-0.5 text-slate-600">{nomePolicial(substituto)} substitui {nomePolicial(coberto)} · {manifestacao.horario_inicio?.slice(0, 5)}–{manifestacao.horario_fim?.slice(0, 5)}{manifestacao.horario_fim <= manifestacao.horario_inicio ? " (dia seguinte)" : ""}</p>
            <p className="mt-0.5 font-semibold text-slate-600">Horário final transcorrido; execução não confirmada.</p>
          </div>;
        })}
      </div>
    </section>
  );
}

export default function Permutas({ user }) {
  const usuarioId = user?.id;
  const role = String(user?.role || "").trim().toLowerCase();
  const isMaster = role === "master" || user?.is_master === true;
  const podeConsultarGeral = podeConsultarCalendario(user);
  const podeConsultarProprioCalendario = podeConsultarCalendarioProprio(user);
  const listagemOperacionalP1 = role === "p1" || role === "p1_escalante_servico_ordinario";
  const podeAdministrar = isMaster || role === "oficial";
  const statusInicial = podeAdministrar ? "AGUARDANDO_ANALISE" : "";
  const [permutas, setPermutas] = useState([]);
  const [policiais, setPoliciais] = useState([]);
  const [policiaisCalendario, setPoliciaisCalendario] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [carregandoPoliciais, setCarregandoPoliciais] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [erroPoliciais, setErroPoliciais] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [formAberto, setFormAberto] = useState(false);
  const [tipo, setTipo] = useState("SUBSTITUICAO_SIMPLES");
  const [destinatarioId, setDestinatarioId] = useState("");
  const [buscaSubstituto, setBuscaSubstituto] = useState("");
  const [listaSubstitutosAberta, setListaSubstitutosAberta] = useState(false);
  const [motivoPermuta, setMotivoPermuta] = useState("");
  const [servico, setServico] = useState(SERVICO_VAZIO);
  const [permutaConfirmando, setPermutaConfirmando] = useState(null);
  const [confirmacaoExplicita, setConfirmacaoExplicita] = useState(false);
  const [servicoConfirmacao, setServicoConfirmacao] = useState(SERVICO_VAZIO);
  const [filtroStatus, setFiltroStatus] = useState(statusInicial);
  const [filtroPolicialId, setFiltroPolicialId] = useState("");
  const [filtroTipoLista, setFiltroTipoLista] = useState("");
  const [filtroDataInicioLista, setFiltroDataInicioLista] = useState("");
  const [filtroDataFimLista, setFiltroDataFimLista] = useState("");
  const [filtrosAplicados, setFiltrosAplicados] = useState({ status: statusInicial, policial_id: "", tipo: "", data_inicio: "", data_fim: "" });
  const [linhasOperacionaisAbertas, setLinhasOperacionaisAbertas] = useState({});
  const [acaoAdministrativa, setAcaoAdministrativa] = useState(null);
  const [justificativaAdministrativa, setJustificativaAdministrativa] = useState("");
  const [servicosConferidos, setServicosConferidos] = useState(false);
  const [visaoGeral, setVisaoGeral] = useState("lista");
  const [modoCalendario, setModoCalendario] = useState("mes");
  const [referenciaCalendario, setReferenciaCalendario] = useState(dataLocalHoje());
  const [dataSelecionada, setDataSelecionada] = useState(dataLocalHoje());
  const [filtrosCalendario, setFiltrosCalendario] = useState({ policial_id: usuarioId || "", status: "DEFERIDA", tipo: "", participacao: "" });
  const [buscaPolicialCalendario, setBuscaPolicialCalendario] = useState("");
  const [listaPoliciaisCalendarioAberta, setListaPoliciaisCalendarioAberta] = useState(false);
  const [permutasCalendario, setPermutasCalendario] = useState([]);
  const [carregandoCalendario, setCarregandoCalendario] = useState(false);
  const [erroCalendario, setErroCalendario] = useState("");
  const [atualizacaoCalendario, setAtualizacaoCalendario] = useState(0);
  const [calendariosMini, setCalendariosMini] = useState({});
  const [calendariosMiniChaveCarregada, setCalendariosMiniChaveCarregada] = useState("");
  const [erroMiniCalendarios, setErroMiniCalendarios] = useState(null);
  const [atualizacaoMiniCalendarios, setAtualizacaoMiniCalendarios] = useState(0);
  const [miniCalendariosAbertos, setMiniCalendariosAbertos] = useState({});

  const parametrosConsulta = useMemo(() => {
    if (!podeConsultarGeral) return { policial_id: usuarioId };
    return {
      ...(filtrosAplicados.status ? { status: filtrosAplicados.status } : {}),
      ...(filtrosAplicados.policial_id ? { policial_id: filtrosAplicados.policial_id } : {}),
      ...(filtrosAplicados.tipo ? { tipo: filtrosAplicados.tipo } : {}),
      ...(filtrosAplicados.data_inicio ? { data_inicio: filtrosAplicados.data_inicio, data_fim: filtrosAplicados.data_fim } : {}),
    };
  }, [filtrosAplicados, podeConsultarGeral, usuarioId]);

  const carregar = useCallback(async () => {
    if (!usuarioId) return;
    try {
      const resultado = await listarPermutas(parametrosConsulta);
      setPermutas(resultado.permutas || []);
    } catch (error) {
      setErro(error.message || "Não foi possível carregar suas permutas.");
    } finally {
      setCarregando(false);
    }
  }, [parametrosConsulta, usuarioId]);

  useEffect(() => {
    if (!usuarioId) return undefined;
    let ativo = true;
    listarPermutas(parametrosConsulta)
      .then((resultado) => { if (ativo) setPermutas(resultado.permutas || []); })
      .catch((error) => { if (ativo) setErro(error.message || "Não foi possível carregar suas permutas."); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [parametrosConsulta, usuarioId]);
  useEffect(() => {
    let ativo = true;
    getPoliciaisPermutas()
      .then((lista) => { if (ativo) setPoliciais(lista || []); })
      .catch((error) => { if (ativo) setErroPoliciais(error.message || "Não foi possível carregar os policiais disponíveis."); })
      .finally(() => { if (ativo) setCarregandoPoliciais(false); });
    return () => { ativo = false; };
  }, []);

  useEffect(() => {
    if (!podeConsultarGeral) return undefined;
    let ativo = true;
    getPoliciaisPermutasCalendario()
      .then((lista) => { if (ativo) setPoliciaisCalendario(lista || []); })
      .catch((error) => { if (ativo) setErroPoliciais(error.message || "Não foi possível carregar os policiais do calendário."); });
    return () => { ativo = false; };
  }, [podeConsultarGeral]);

  const enviadas = useMemo(() => permutas.filter((item) => item.solicitante_id === usuarioId), [permutas, usuarioId]);
  const recebidas = useMemo(() => permutas.filter((item) => item.destinatario_id === usuarioId), [permutas, usuarioId]);
  const substitutosFiltrados = useMemo(() => filtrarPoliciaisSubstitutos(policiais, { usuarioId, busca: buscaSubstituto }), [policiais, usuarioId, buscaSubstituto]);
  const policiaisCalendarioFiltrados = useMemo(() => filtrarPoliciaisPorBusca(policiaisCalendario, { busca: buscaPolicialCalendario }), [policiaisCalendario, buscaPolicialCalendario]);
  const idsMiniCalendarios = useMemo(() => obterIdsMiniCalendariosAbertos(permutas, miniCalendariosAbertos, {
    usuarioId, podeConsultarGeral,
  }), [permutas, podeConsultarGeral, usuarioId, miniCalendariosAbertos]);
  const idsMiniCalendariosChave = idsMiniCalendarios.join(",");
  const diasCalendario = useMemo(() => obterDiasCalendario(referenciaCalendario, modoCalendario), [referenciaCalendario, modoCalendario]);
  const dataInicioConsultaCalendario = deslocarData(diasCalendario[0], -1);
  const dataFimConsultaCalendario = diasCalendario.at(-1) || "";
  const inicioIndicadoresCalendario = modoCalendario === "semana" ? diasCalendario[0] : `${referenciaCalendario.slice(0, 7)}-01`;
  const fimIndicadoresCalendario = modoCalendario === "semana" ? diasCalendario.at(-1) : (() => {
    const [ano, mes] = referenciaCalendario.split("-").map(Number);
    const diaFinal = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    return `${ano}-${String(mes).padStart(2, "0")}-${String(diaFinal).padStart(2, "0")}`;
  })();
  const referenciaMiniCalendario = dataLocalHoje();
  const diasMiniCalendario = useMemo(() => obterDiasCalendario(referenciaMiniCalendario, "mes"), [referenciaMiniCalendario]);
  const inicioMiniCalendario = deslocarData(diasMiniCalendario[0], -1);
  const fimMiniCalendario = diasMiniCalendario.at(-1) || "";
  const idPolicialCalendario = podeConsultarGeral ? filtrosCalendario.policial_id : usuarioId;
  const chaveConsultaMiniCalendarios = `${idsMiniCalendariosChave}|${inicioMiniCalendario}|${fimMiniCalendario}|${atualizacaoMiniCalendarios}`;
  const indicadoresCalendario = useMemo(() => calcularIndicadoresCalendario(permutasCalendario, {
    policialId: idPolicialCalendario,
    participacao: filtrosCalendario.participacao,
    status: filtrosCalendario.status,
    tipo: filtrosCalendario.tipo,
    dataInicio: inicioIndicadoresCalendario,
    dataFim: fimIndicadoresCalendario,
  }), [permutasCalendario, filtrosCalendario, idPolicialCalendario, inicioIndicadoresCalendario, fimIndicadoresCalendario]);
  const policialCalendarioSelecionado = podeConsultarGeral
    ? policiaisCalendario.find((policial) => policial.id === idPolicialCalendario) || (idPolicialCalendario === usuarioId ? user : null)
    : user;

  useEffect(() => {
    if (visaoGeral !== "lista" || !idsMiniCalendariosChave || !inicioMiniCalendario || !fimMiniCalendario
      || calendariosMiniChaveCarregada === chaveConsultaMiniCalendarios) return undefined;
    let ativo = true;
    listarCalendariosMini(idsMiniCalendariosChave.split(","), inicioMiniCalendario, fimMiniCalendario)
      .then((resultado) => {
        if (!ativo) return;
        setCalendariosMini(Object.fromEntries(resultado.map((item) => [item.policial_id, item.permutas || []])));
        setCalendariosMiniChaveCarregada(chaveConsultaMiniCalendarios);
        setErroMiniCalendarios(null);
      })
      .catch((error) => {
        if (ativo) setErroMiniCalendarios({ chave: chaveConsultaMiniCalendarios, mensagem: error.message || "Não foi possível carregar os mini calendários." });
      });
    return () => { ativo = false; };
  }, [visaoGeral, idsMiniCalendariosChave, inicioMiniCalendario, fimMiniCalendario, calendariosMiniChaveCarregada, chaveConsultaMiniCalendarios]);

  useEffect(() => {
    if (!podeConsultarProprioCalendario || visaoGeral !== "calendario" || !usuarioId || !dataFimConsultaCalendario || !idPolicialCalendario) return undefined;
    let ativo = true;
    const { policial_id: idSelecionado, ...filtros } = filtrosCalendario;
    listarPermutas({
      ...(podeConsultarGeral ? { policial_id: idSelecionado } : {}),
      ...filtros,
      data_inicio: dataInicioConsultaCalendario,
      data_fim: dataFimConsultaCalendario,
      calendario: "individual",
    })
      .then((resultado) => { if (ativo) setPermutasCalendario(resultado.permutas || []); })
      .catch((error) => { if (ativo) setErroCalendario(error.message || "Não foi possível carregar o calendário de Permutas."); })
      .finally(() => { if (ativo) setCarregandoCalendario(false); });
    return () => { ativo = false; };
  }, [podeConsultarProprioCalendario, podeConsultarGeral, visaoGeral, usuarioId, idPolicialCalendario, filtrosCalendario, dataInicioConsultaCalendario, dataFimConsultaCalendario, atualizacaoCalendario]);

  const eventosCalendario = useMemo(() => idPolicialCalendario ? criarEventosCalendario(permutasCalendario, {
    policialId: idPolicialCalendario,
    participacao: filtrosCalendario.participacao,
    status: filtrosCalendario.status,
    tipo: filtrosCalendario.tipo,
    dataInicio: dataInicioConsultaCalendario,
    dataFim: dataFimConsultaCalendario,
  }) : [], [permutasCalendario, idPolicialCalendario, filtrosCalendario, dataInicioConsultaCalendario, dataFimConsultaCalendario]);
  const eventosPorDia = useMemo(() => {
    const diasVisiveis = new Set(diasCalendario);
    const mapa = new Map();
    for (const evento of eventosCalendario) {
      if (!diasVisiveis.has(evento.dataMarcacao)) continue;
      mapa.set(evento.dataMarcacao, [...(mapa.get(evento.dataMarcacao) || []), evento]);
    }
    return mapa;
  }, [eventosCalendario, diasCalendario]);
  const eventosDiaSelecionado = eventosPorDia.get(dataSelecionada) || [];

  const limparMensagens = () => { setErro(""); setSucesso(""); };
  const atualizarLista = () => {
    setErro("");
    if (visaoGeral === "calendario") {
      setErroCalendario("");
      setCarregandoCalendario(Boolean(idPolicialCalendario));
      setAtualizacaoCalendario((atual) => atual + 1);
      return;
    }
    setCarregando(true);
    setAtualizacaoMiniCalendarios((atual) => atual + 1);
    void carregar();
  };

  function alterarFiltrosCalendario(atualizar) {
    setErroCalendario("");
    const novosFiltros = typeof atualizar === "function" ? atualizar(filtrosCalendario) : atualizar;
    setCarregandoCalendario(Boolean(novosFiltros.policial_id));
    setPermutasCalendario([]);
    setFiltrosCalendario(novosFiltros);
  }

  function buscarPolicialCalendario(valor) {
    setBuscaPolicialCalendario(valor);
    setListaPoliciaisCalendarioAberta(true);
    if (filtrosCalendario.policial_id) {
      alterarFiltrosCalendario((atual) => ({ ...atual, policial_id: "" }));
    }
  }

  function selecionarPolicialCalendario(policial) {
    setBuscaPolicialCalendario("");
    setListaPoliciaisCalendarioAberta(false);
    alterarFiltrosCalendario((atual) => ({ ...atual, policial_id: policial.id }));
  }

  function alternarMiniCalendario(chave) {
    setMiniCalendariosAbertos((abertos) => ({ ...abertos, [chave]: !abertos[chave] }));
  }

  function alternarLinhaOperacional(permutaId) {
    setLinhasOperacionaisAbertas((abertas) => alternarEstadoLinhaPermuta(abertas, permutaId));
  }

  async function enviarNovaPermuta(evento) {
    evento.preventDefault();
    limparMensagens();
    if (!destinatarioId || destinatarioId === usuarioId) {
      setErro("Selecione outro policial como substituto.");
      return;
    }
    const destinatarioElegivel = filtrarPoliciaisSubstitutos(policiais, { usuarioId }).some((policial) => policial.id === destinatarioId);
    if (!destinatarioElegivel) {
      setErro("Selecione um policial em atividade que não ocupe posto de oficial.");
      return;
    }
    const motivo = motivoPermuta.trim();
    if (!motivo || Array.from(motivo).length > LIMITE_MOTIVO_PERMUTA) {
      setErro("Informe o motivo da permuta com até 500 caracteres.");
      return;
    }
    const erroServico = validarServico(servico);
    if (erroServico) { setErro(erroServico); return; }
    setEnviando(true);
    try {
      await criarPermuta({ tipo, destinatario_id: destinatarioId, motivo, servico });
      setSucesso("Solicitação enviada. Sua concordância foi registrada; agora aguardamos a confirmação do destinatário.");
      setFormAberto(false);
      setTipo("SUBSTITUICAO_SIMPLES");
      setDestinatarioId("");
      setBuscaSubstituto("");
      setListaSubstitutosAberta(false);
      setMotivoPermuta("");
      setServico(SERVICO_VAZIO);
      setAtualizacaoMiniCalendarios((atual) => atual + 1);
      await carregar();
    } catch (error) {
      setErro(error.message || "Não foi possível enviar a permuta.");
    } finally {
      setEnviando(false);
    }
  }

  function abrirConfirmacao(permuta) {
    limparMensagens();
    setPermutaConfirmando(permuta);
    setConfirmacaoExplicita(false);
    setServicoConfirmacao(SERVICO_VAZIO);
  }

  async function confirmarParticipacao(evento) {
    evento.preventDefault();
    if (!permutaConfirmando || !confirmacaoExplicita) return;
    limparMensagens();
    const registraServico = permutaConfirmando.tipo === "TROCA_RECIPROCA" && usuarioId === permutaConfirmando.destinatario_id;
    if (registraServico) {
      const erroServico = validarServico(servicoConfirmacao);
      if (erroServico) { setErro(erroServico); return; }
    }
    setEnviando(true);
    try {
      const resultado = await confirmarPermuta(permutaConfirmando.id, registraServico ? servicoConfirmacao : undefined);
      setSucesso(resultado.status === "AGUARDANDO_ANALISE"
        ? "Confirmação registrada. A solicitação segue para análise do Oficial."
        : "Confirmação registrada. A solicitação aguarda a confirmação do outro policial.");
      setPermutaConfirmando(null);
      setAtualizacaoMiniCalendarios((atual) => atual + 1);
      await carregar();
    } catch (error) {
      setErro(error.message || "Não foi possível registrar sua confirmação.");
    } finally {
      setEnviando(false);
    }
  }

  function fecharConfirmacao() {
    if (enviando) return;
    setPermutaConfirmando(null);
    setConfirmacaoExplicita(false);
    setServicoConfirmacao(SERVICO_VAZIO);
  }

  function aplicarFiltros(evento) {
    evento.preventDefault();
    setErro("");
    if (Boolean(filtroDataInicioLista) !== Boolean(filtroDataFimLista)) {
      setErro("Informe as datas inicial e final do serviço.");
      return;
    }
    if (filtroDataInicioLista && filtroDataInicioLista > filtroDataFimLista) {
      setErro("A data inicial do serviço deve ser anterior ou igual à data final.");
      return;
    }
    if (filtroDataInicioLista) {
      const intervaloDias = (Date.parse(`${filtroDataFimLista}T00:00:00Z`) - Date.parse(`${filtroDataInicioLista}T00:00:00Z`)) / 86400000;
      if (intervaloDias > 44) {
        setErro("O período de serviço não pode exceder 45 dias.");
        return;
      }
    }
    setCarregando(true);
    setFiltrosAplicados({
      status: filtroStatus,
      policial_id: filtroPolicialId,
      tipo: filtroTipoLista,
      data_inicio: filtroDataInicioLista,
      data_fim: filtroDataFimLista,
    });
  }

  function limparFiltros() {
    setErro("");
    setFiltroStatus("");
    setFiltroPolicialId("");
    setFiltroTipoLista("");
    setFiltroDataInicioLista("");
    setFiltroDataFimLista("");
    setCarregando(true);
    setFiltrosAplicados({ status: "", policial_id: "", tipo: "", data_inicio: "", data_fim: "" });
  }

  function navegarCalendario(direcao) {
    const proximaReferencia = deslocarReferenciaCalendario(referenciaCalendario, modoCalendario, direcao);
    setErroCalendario("");
    setCarregandoCalendario(Boolean(filtrosCalendario.policial_id));
    setReferenciaCalendario(proximaReferencia);
    setDataSelecionada(proximaReferencia);
  }

  function trocarModoCalendario(modo) {
    if (modo === modoCalendario) return;
    setErroCalendario("");
    setCarregandoCalendario(Boolean(filtrosCalendario.policial_id));
    setModoCalendario(modo);
    const dias = obterDiasCalendario(referenciaCalendario, modo);
    if (!dias.includes(dataSelecionada)) setDataSelecionada(referenciaCalendario);
  }

  function irParaHoje() {
    const hoje = dataLocalHoje();
    if (hoje === referenciaCalendario) {
      setDataSelecionada(hoje);
      return;
    }
    setErroCalendario("");
    setCarregandoCalendario(Boolean(filtrosCalendario.policial_id));
    setReferenciaCalendario(hoje);
    setDataSelecionada(hoje);
  }

  function abrirDecisao(permuta, deferir) {
    if (!podeAdministrar || !podeDecidirPermuta(user, permuta.status)) return;
    limparMensagens();
    setAcaoAdministrativa({ permuta, tipo: "decidir", deferir });
    setJustificativaAdministrativa("");
    setServicosConferidos(false);
  }

  function abrirCancelamento(permuta) {
    if (!podeAdministrar || !podeCancelarPermuta(user, permuta.status)) return;
    limparMensagens();
    setAcaoAdministrativa({ permuta, tipo: "cancelar" });
    setJustificativaAdministrativa("");
    setServicosConferidos(false);
  }

  async function executarAcaoAdministrativa(evento) {
    evento.preventDefault();
    if (!acaoAdministrativa || !podeAdministrar) return;
    const { permuta, tipo: tipoAcao, deferir } = acaoAdministrativa;
    if (tipoAcao === "decidir" && !podeDecidirPermuta(user, permuta.status)) return;
    if (tipoAcao === "cancelar" && !podeCancelarPermuta(user, permuta.status)) return;
    const justificativa = justificativaAdministrativa.trim();
    if (!justificativa || justificativa.length > 3000) {
      setErro("Informe justificativa ou observação de até 3000 caracteres.");
      return;
    }
    if (tipoAcao === "decidir" && !servicosConferidos) {
      setErro("Confirme que conferiu os serviços informados antes de registrar a decisão.");
      return;
    }
    if (tipoAcao === "decidir" && deferir && !window.confirm("Confirma o deferimento desta permuta após conferir os serviços informados?")) return;
    if (tipoAcao === "cancelar" && !window.confirm("Confirma o cancelamento desta permuta deferida? O registro permanecerá no histórico.")) return;

    limparMensagens();
    setEnviando(true);
    try {
      const resultado = tipoAcao === "decidir"
        ? await decidirPermuta(permuta.id, deferir, justificativa, true)
        : await cancelarPermuta(permuta.id, justificativa);
      setPermutas((atuais) => atualizarStatusPermuta(atuais, permuta.id, resultado.status));
      setSucesso(tipoAcao === "cancelar"
        ? "Permuta cancelada. O deferimento e o cancelamento permanecem no histórico."
        : resultado.status === "DEFERIDA" ? "Permuta deferida." : "Permuta indeferida e mantida no histórico.");
      setAcaoAdministrativa(null);
      setAtualizacaoMiniCalendarios((atual) => atual + 1);
      setJustificativaAdministrativa("");
      setServicosConferidos(false);
      await carregar();
    } catch (error) {
      setErro(error.message || "Não foi possível registrar a decisão.");
    } finally {
      setEnviando(false);
    }
  }

  function renderCartaoPermuta({ item, direcao }) {
    const solicitante = nomePolicial(item.solicitante);
    const destinatario = nomePolicial(item.destinatario);
    const estado = STATUS[item.status] || { label: item.status || "Situação desconhecida", style: "border-slate-200 bg-slate-100 text-slate-700" };
    const participantes = [
      { id: item.solicitante_id, nome: solicitante, policial: item.solicitante, papel: "Solicitante" },
      { id: item.destinatario_id, nome: destinatario, policial: item.destinatario, papel: "Substituto indicado" },
    ];
    const confirmados = new Set((item.confirmacoes || []).map((confirmacao) => confirmacao.policial_id));
    const aguardaMinhaConfirmacao = item.status === "AGUARDANDO_CONFIRMACAO"
      && participantes.some((participante) => participante.id === usuarioId)
      && !confirmados.has(usuarioId);
    const nomesPorId = new Map([
      ...participantes.map((participante) => [participante.id, participante.nome]),
      ...policiais.map((policial) => [policial.id, nomePolicial(policial)]),
    ]);
    const linhaOperacionalAberta = Boolean(linhasOperacionaisAbertas[item.id]);
    const servicosResumo = [...(item.manifestacoes || [])].sort((a, b) => String(a.data_servico).localeCompare(String(b.data_servico))
      || String(a.horario_inicio).localeCompare(String(b.horario_inicio)));

    return (
      <article key={`${direcao}-${item.id}`} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        {listagemOperacionalP1 && <button
          type="button"
          aria-expanded={linhaOperacionalAberta}
          aria-label={`${linhaOperacionalAberta ? "Recolher" : "Expandir"} detalhes da permuta`}
          onClick={() => alternarLinhaOperacional(item.id)}
          className="grid w-full gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left hover:bg-slate-100 sm:p-3.5 md:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_auto_auto] md:items-center"
        >
          <div className="min-w-0 space-y-1">
            {servicosResumo.length ? servicosResumo.map((manifestacao) => <div key={manifestacao.id} className="flex flex-wrap items-baseline gap-x-2 text-xs text-slate-700">
              <strong>{dataBrasileira(manifestacao.data_servico)} · Turno {manifestacao.turno}</strong>
              <span>{horarioBrasileiro(manifestacao.horario_inicio)}–{horarioBrasileiro(manifestacao.horario_fim)}{manifestacao.horario_fim <= manifestacao.horario_inicio ? " (+1 dia)" : ""}</span>
              <span>Titular: {nomesPorId.get(manifestacao.policial_id) || "não localizado"} → Substituto: {nomesPorId.get(manifestacao.substituto_id) || "não localizado"}</span>
            </div>) : <span className="text-xs text-slate-500">Serviço não disponível</span>}
          </div>
          <span className="text-xs font-semibold text-slate-700">{item.tipo === "TROCA_RECIPROCA" ? "Troca recíproca" : "Substituição simples"}</span>
          <span className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-[11px] font-bold ${estado.style}`}>{estado.label}</span>
          <span className="text-xs font-semibold text-blue-700">{linhaOperacionalAberta ? "Recolher detalhes" : "Expandir detalhes"}</span>
        </button>}
        {(!listagemOperacionalP1 || linhaOperacionalAberta) && <>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-slate-900">{item.tipo === "TROCA_RECIPROCA" ? "Troca recíproca" : "Substituição simples"}</h3>
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${estado.style}`}>{estado.label}</span>
              {aguardaMinhaConfirmacao && <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-900">Aguardando sua confirmação</span>}
            </div>
            <p className="mt-1 text-xs text-slate-500">Solicitada em {dataHoraBrasileira(item.criada_em)}</p>
          </div>
          {direcao !== "administrativa" && <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{direcao === "enviada" ? "Enviada por você" : "Recebida"}</span>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {participantes.map((participante) => {
            const chave = chaveMiniCalendario(item.id, participante.id);
            const aberto = Boolean(miniCalendariosAbertos[chave]);
            const podeVerCalendario = podeConsultarGeral || participante.id === usuarioId;
            const idCalendario = `mini-calendario-${item.id}-${participante.id}`;
            return <div key={participante.id} className="min-w-0 rounded-xl border border-slate-100 p-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{participante.papel}</p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 break-words font-semibold text-slate-800">{participante.policial ? identificacaoPolicial(participante.policial) : participante.nome}</p>
                {podeVerCalendario && <button
                  type="button"
                  aria-expanded={aberto}
                  aria-controls={idCalendario}
                  onClick={() => alternarMiniCalendario(chave)}
                  className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                >{aberto ? "Ocultar calendário" : "Ver calendário"}</button>}
              </div>
              {podeVerCalendario && aberto && <MiniCalendarioPolicial
                id={idCalendario}
                policial={participante.policial || { id: participante.id, nome_guerra: participante.nome }}
                permutas={calendariosMiniChaveCarregada === chaveConsultaMiniCalendarios ? calendariosMini[participante.id] || [] : []}
                carregando={Boolean(idsMiniCalendariosChave) && calendariosMiniChaveCarregada !== chaveConsultaMiniCalendarios && erroMiniCalendarios?.chave !== chaveConsultaMiniCalendarios}
                erro={erroMiniCalendarios?.chave === chaveConsultaMiniCalendarios ? erroMiniCalendarios.mensagem : ""}
              />}
              {!podeVerCalendario && <p className="mt-2 text-[10px] text-slate-500">O calendário de outros policiais não está disponível para este perfil.</p>}
            </div>;
          })}
        </div>

        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-sm text-slate-700">
          <p className="text-xs font-bold uppercase tracking-wide text-blue-800">Motivo da permuta/substituição</p>
          <p className="mt-1 whitespace-pre-wrap">{item.motivo || "Motivo não registrado na versão anterior."}</p>
        </div>

        <div className="space-y-2">
          {(item.manifestacoes || []).map((manifestacao) => (
            <LinhaServico key={manifestacao.id} titulo={`Serviço original de ${nomesPorId.get(manifestacao.policial_id) || "participante"} · substituído por ${nomesPorId.get(manifestacao.substituto_id) || "participante"}`} servico={manifestacao} />
          ))}
          {!item.manifestacoes?.length && <p className="text-sm text-slate-500">Os detalhes do serviço ainda não estão disponíveis.</p>}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs">
          {participantes.map((participante) => (
            <span key={participante.id} className={confirmados.has(participante.id) ? "font-semibold text-emerald-700" : "text-slate-500"}>
              {confirmados.has(participante.id) ? <Check className="mr-1 inline h-3.5 w-3.5" /> : <Clock3 className="mr-1 inline h-3.5 w-3.5" />}
              {participante.nome}: {confirmados.has(participante.id) ? "confirmou" : "aguardando"}
            </span>
          ))}
        </div>

        {item.historico?.length > 0 && (
          <details className="rounded-xl border border-slate-200 bg-white">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-semibold text-slate-700"><History className="h-4 w-4 text-slate-400" /> Histórico de manifestações e decisões ({item.historico.length})</summary>
            <p className="border-t border-slate-100 bg-blue-50/50 px-3 py-2.5 text-sm text-slate-700"><span className="font-semibold">Motivo original:</span> {item.motivo || "Não registrado na versão anterior."}</p>
            <ol className="space-y-3 border-t border-slate-100 px-3 py-3">
              {item.historico.map((evento) => (
                <li key={evento.id} className="border-l-2 border-slate-200 pl-3">
                  <p className="text-sm font-semibold text-slate-800">{EVENTO_HISTORICO[evento.tipo_evento] || evento.tipo_evento}</p>
                  <p className="text-xs text-slate-500">{evento.ator ? identificacaoPolicial(evento.ator) : nomesPorId.get(evento.ator_id) || `Responsável registrado (${evento.ator_id})`} · {dataHoraBrasileira(evento.ocorrido_em)}</p>
                  {(evento.estado_anterior || evento.estado_novo) && <p className="mt-1 text-xs text-slate-600">{STATUS[evento.estado_anterior]?.label || evento.estado_anterior || "Início"} → {STATUS[evento.estado_novo]?.label || evento.estado_novo}</p>}
                  {evento.justificativa && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{evento.justificativa}</p>}
                  {evento.servicos_conferidos && <p className="mt-1 text-xs font-medium text-emerald-700">Serviços conferidos pelo responsável.</p>}
                </li>
              ))}
            </ol>
          </details>
        )}

        {item.status === "AGUARDANDO_CONFIRMACAO" && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs">
            <p className="font-semibold text-slate-700">Aguardando confirmações individuais.</p>
          </div>
        )}

        {aguardaMinhaConfirmacao && (
          <div className="border-t border-slate-100 pt-3">
            <button type="button" onClick={() => abrirConfirmacao(item)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              <Check className="h-4 w-4" /> Confirmar minha participação
            </button>
          </div>
        )}

        {podeDecidirPermuta(user, item.status) && (
          <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => abrirDecisao(item, false)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-200 px-3.5 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"><XCircle className="h-4 w-4" /> Indeferir</button>
            <button type="button" onClick={() => abrirDecisao(item, true)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"><Check className="h-4 w-4" /> Deferir</button>
          </div>
        )}
        {podeCancelarPermuta(user, item.status) && (
          <div className="flex justify-end border-t border-slate-100 pt-3">
            <button type="button" onClick={() => abrirCancelamento(item)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-300 px-3.5 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"><X className="h-4 w-4" /> Cancelar permuta deferida</button>
          </div>
        )}
        </>}
      </article>
    );
  }

  function renderSecaoPermutas({ titulo, itens, direcao }) {
    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900">{titulo}</h2>
          <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600">{itens.length}</span>
        </div>
        {itens.length ? <div className="space-y-3">{itens.map((item) => renderCartaoPermuta({ item, direcao }))}</div>
          : <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">Nenhuma permuta {direcao === "enviada" ? "enviada" : "recebida"}.</div>}
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{visaoGeral === "calendario" && !podeConsultarGeral ? "Meu calendário de Permutas" : podeAdministrar ? "Análise de Permutas" : podeConsultarGeral ? "Consulta geral de Permutas" : "Minhas Permutas"}</h1>
          <p className="mt-1 text-sm text-slate-500">{podeAdministrar ? "Confira os serviços e as confirmações antes de decidir. Os dados são informados pelos policiais; não há validação contra escala oficial." : "Crie uma solicitação, acompanhe o andamento e consulte os dados disponíveis."}</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:shrink-0">
          {podeConsultarProprioCalendario && (
            <div className="flex rounded-xl border border-slate-300 bg-white p-1">
              <button type="button" onClick={() => setVisaoGeral("lista")} aria-pressed={visaoGeral === "lista"} className={`rounded-lg px-3 py-2 text-sm font-semibold ${visaoGeral === "lista" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{podeConsultarGeral ? "Solicitações" : "Minhas Permutas"}</button>
              <button type="button" onClick={() => { if (visaoGeral !== "calendario") { setErroCalendario(""); setCarregandoCalendario(Boolean(idPolicialCalendario)); setVisaoGeral("calendario"); } }} aria-pressed={visaoGeral === "calendario"} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${visaoGeral === "calendario" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}><CalendarDays className="h-4 w-4" />{podeConsultarGeral ? "Calendário" : "Meu calendário"}</button>
            </div>
          )}
          <button type="button" onClick={() => { setFormAberto((aberto) => !aberto); limparMensagens(); }} disabled={carregandoPoliciais || Boolean(erroPoliciais)} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
            <Plus className="h-4 w-4" /> {formAberto ? "Fechar" : "Nova permuta"}
          </button>
              <button type="button" onClick={atualizarLista} disabled={carregando} aria-label="Atualizar permutas" className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {erro && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{erro}</div>}
      {erroPoliciais && <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{erroPoliciais}</div>}
      {sucesso && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{sucesso}</div>}

      {podeConsultarGeral && visaoGeral === "lista" && (
        <form onSubmit={aplicarFiltros} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-4 sm:items-end">
          <label className="grid gap-1 text-xs font-semibold text-slate-600">Serviço a partir de
            <input type="date" value={filtroDataInicioLista} onChange={(evento) => setFiltroDataInicioLista(evento.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal" />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">Serviço até
            <input type="date" value={filtroDataFimLista} onChange={(evento) => setFiltroDataFimLista(evento.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal" />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">Situação
            <select value={filtroStatus} onChange={(evento) => setFiltroStatus(evento.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal">
              <option value="">Todas as situações</option>
              {Object.entries(STATUS).map(([valor, estado]) => <option key={valor} value={valor}>{estado.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">Tipo
            <select value={filtroTipoLista} onChange={(evento) => setFiltroTipoLista(evento.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal">
              <option value="">Todos os tipos</option>
              <option value="SUBSTITUICAO_SIMPLES">Substituição simples</option>
              <option value="TROCA_RECIPROCA">Troca recíproca</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">Policial envolvido
            <select value={filtroPolicialId} onChange={(evento) => setFiltroPolicialId(evento.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal">
              <option value="">Todos os policiais</option>
              {policiais.map((policial) => <option key={policial.id} value={policial.id}>{policial.posto_graduacao ? `${policial.posto_graduacao} · ` : ""}{nomePolicial(policial)}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-3">
            <button type="submit" disabled={carregando} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"><Filter className="h-4 w-4" /> Filtrar</button>
            <button type="button" onClick={limparFiltros} disabled={carregando} className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Limpar</button>
          </div>
          <p className="text-[11px] text-slate-500 sm:col-span-2 xl:col-span-4">A data considera o serviço informado. Intervalos limitados a 45 dias; a lista segue o limite de até 1.000 solicitações por consulta.</p>
        </form>
      )}

      {formAberto && (
        <section className="space-y-4 rounded-2xl border border-blue-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div><h2 className="font-bold text-slate-900">Nova permuta</h2><p className="text-xs text-slate-500">Ao enviar, sua concordância será registrada. A confirmação pendente será apenas a do destinatário.</p></div>
            <button type="button" onClick={() => setFormAberto(false)} aria-label="Fechar formulário" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
          </div>
          <form onSubmit={enviarNovaPermuta} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-semibold text-slate-600">Tipo
                <select className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm" value={tipo} onChange={(evento) => setTipo(evento.target.value)}>
                  <option value="SUBSTITUICAO_SIMPLES">Substituição simples</option>
                  <option value="TROCA_RECIPROCA">Troca recíproca</option>
                </select>
              </label>
              <div className="relative grid gap-1 text-xs font-semibold text-slate-600">
                <label htmlFor="buscar-substituto-permuta">Policial substituto</label>
                <span className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <input
                    type="search"
                    id="buscar-substituto-permuta"
                    role="combobox"
                    aria-label="Buscar policial substituto por nome de guerra, numeral ou posto/graduação"
                    aria-autocomplete="list"
                    aria-expanded={listaSubstitutosAberta}
                    aria-controls="lista-substitutos-permuta"
                    autoComplete="off"
                    required={!destinatarioId}
                    value={buscaSubstituto}
                    onFocus={() => setListaSubstitutosAberta(true)}
                    onKeyDown={(evento) => { if (evento.key === "Escape") setListaSubstitutosAberta(false); }}
                    onChange={(evento) => { setDestinatarioId(""); setBuscaSubstituto(evento.target.value); setListaSubstitutosAberta(true); }}
                    placeholder="Buscar nome de guerra, numeral ou posto/graduação"
                    className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm font-normal text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </span>
                {listaSubstitutosAberta && <div id="lista-substitutos-permuta" role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
                  {substitutosFiltrados.length ? substitutosFiltrados.map((policial) => <button key={policial.id} type="button" role="option" aria-selected={destinatarioId === policial.id} onClick={() => { setDestinatarioId(policial.id); setBuscaSubstituto(formatarIdentificacaoPolicial(policial)); setListaSubstitutosAberta(false); }} className="block w-full border-b border-slate-100 px-3 py-2.5 text-left text-sm text-slate-800 last:border-0 hover:bg-blue-50 focus:bg-blue-50">
                    {formatarIdentificacaoPolicial(policial)}
                  </button>) : <p className="px-3 py-3 text-sm font-normal text-slate-500">Nenhum policial em atividade elegível encontrado.</p>}
                </div>}
                {destinatarioId && <span className="text-[11px] font-normal text-emerald-700">Substituto selecionado.</span>}
              </div>
            </div>
            <label htmlFor="motivo-permuta" className="grid gap-1 text-xs font-semibold text-slate-600">Motivo da permuta/substituição
              <textarea id="motivo-permuta" required minLength={1} value={motivoPermuta} onChange={(evento) => setMotivoPermuta(Array.from(evento.target.value).slice(0, LIMITE_MOTIVO_PERMUTA).join(""))} className="min-h-20 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="Explique por que a permuta ou substituição está sendo solicitada" />
              <span className="text-[11px] font-normal text-slate-500">{Array.from(motivoPermuta.trim()).length}/{LIMITE_MOTIVO_PERMUTA} caracteres</span>
            </label>
            <CampoServico valor={servico} atualizar={setServico} idPrefixo="nova-permuta" />
            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setFormAberto(false)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Voltar</button>
              <button type="submit" disabled={enviando || !destinatarioId} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"><Send className="h-4 w-4" />{enviando ? "Enviando..." : "Enviar solicitação"}</button>
            </div>
          </form>
        </section>
      )}

      {carregando ? <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">Carregando {podeConsultarGeral ? "solicitações" : "suas permutas"}...</div> : visaoGeral === "calendario" ? (
        <section className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between">
            <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {podeConsultarGeral ? (
              <div className="relative grid gap-1 text-xs font-semibold text-slate-600">
                <label htmlFor="buscar-policial-calendario-permutas">Policial</label>
                <span className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <input
                    type="search"
                    id="buscar-policial-calendario-permutas"
                    role="combobox"
                    aria-label="Buscar policial por nome de guerra, numeral ou posto/graduação"
                    aria-autocomplete="list"
                    aria-expanded={listaPoliciaisCalendarioAberta}
                    aria-controls="lista-policiais-calendario-permutas"
                    autoComplete="off"
                    value={buscaPolicialCalendario}
                    onFocus={() => setListaPoliciaisCalendarioAberta(true)}
                    onKeyDown={(evento) => { if (evento.key === "Escape") setListaPoliciaisCalendarioAberta(false); }}
                    onChange={(evento) => buscarPolicialCalendario(evento.target.value)}
                    placeholder="Buscar nome, numeral ou posto/graduação"
                    className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm font-normal text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </span>
                {listaPoliciaisCalendarioAberta && <div id="lista-policiais-calendario-permutas" role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
                  {policiaisCalendarioFiltrados.length ? policiaisCalendarioFiltrados.map((policial) => <button key={policial.id} type="button" role="option" aria-selected={filtrosCalendario.policial_id === policial.id} onClick={() => selecionarPolicialCalendario(policial)} className="block w-full border-b border-slate-100 px-3 py-2.5 text-left text-sm font-normal text-slate-800 last:border-0 hover:bg-blue-50 focus:bg-blue-50">
                    {formatarIdentificacaoPolicial(policial)}
                  </button>) : <p className="px-3 py-3 text-sm font-normal text-slate-500">Nenhum policial encontrado.</p>}
                </div>}
                {policialCalendarioSelecionado && <span className="text-[11px] font-normal text-emerald-700">Selecionado: {formatarIdentificacaoPolicial(policialCalendarioSelecionado)}</span>}
              </div>
              ) : (
                <div className="grid gap-1 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2.5 text-xs text-slate-600">
                  <span className="font-semibold">Meu calendário</span>
                  <span className="font-normal text-slate-800">{formatarIdentificacaoPolicial(policialCalendarioSelecionado)}</span>
                </div>
              )}
              <label className="grid gap-1 text-xs font-semibold text-slate-600">Participação
                <select value={filtrosCalendario.participacao} onChange={(evento) => alterarFiltrosCalendario((atual) => ({ ...atual, participacao: evento.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal">
                  <option value="">Todas as participações</option>
                  <option value="foi_substituido">Foi substituído</option>
                  <option value="substituiu">Substituiu alguém</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-600">Situação
                <select value={filtrosCalendario.status} onChange={(evento) => alterarFiltrosCalendario((atual) => ({ ...atual, status: evento.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal">
                  <option value="">Todas as situações</option>
                  {Object.entries(STATUS).map(([valor, estado]) => <option key={valor} value={valor}>{estado.label}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-600">Tipo
                <select value={filtrosCalendario.tipo} onChange={(evento) => alterarFiltrosCalendario((atual) => ({ ...atual, tipo: evento.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal">
                  <option value="">Todos os tipos</option>
                  <option value="SUBSTITUICAO_SIMPLES">Substituição simples</option>
                  <option value="TROCA_RECIPROCA">Troca recíproca</option>
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-slate-300 p-1">
                <button type="button" onClick={() => trocarModoCalendario("semana")} aria-pressed={modoCalendario === "semana"} className={`rounded-md px-3 py-2 text-sm font-semibold ${modoCalendario === "semana" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>Semana</button>
                <button type="button" onClick={() => trocarModoCalendario("mes")} aria-pressed={modoCalendario === "mes"} className={`rounded-md px-3 py-2 text-sm font-semibold ${modoCalendario === "mes" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>Mês</button>
              </div>
              <button type="button" onClick={irParaHoje} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Hoje</button>
              <button type="button" onClick={() => navegarCalendario(-1)} aria-label="Período anterior" className="rounded-lg border border-slate-300 p-2 text-slate-700 hover:bg-slate-50"><ChevronLeft className="h-5 w-5" /></button>
              <button type="button" onClick={() => navegarCalendario(1)} aria-label="Próximo período" className="rounded-lg border border-slate-300 p-2 text-slate-700 hover:bg-slate-50"><ChevronRight className="h-5 w-5" /></button>
            </div>
          </div>

          {!policialCalendarioSelecionado ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">Selecione um policial para consultar o histórico individual. Os indicadores consideram somente solicitações deferidas por padrão.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-slate-700">
                <span>Histórico de <strong>{identificacaoPolicial(policialCalendarioSelecionado)}</strong></span>
                <span>{formatarDataCalendario(inicioIndicadoresCalendario)} – {formatarDataCalendario(fimIndicadoresCalendario)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                {[
                  ["Foi substituído", indicadoresCalendario.foiSubstituido, "bg-amber-50 text-amber-950 border-amber-200"],
                  ["Substituiu alguém", indicadoresCalendario.substituiu, "bg-blue-50 text-blue-950 border-blue-200"],
                  ["Substituições simples", indicadoresCalendario.simples, "bg-slate-50 text-slate-800 border-slate-200"],
                  ["Trocas recíprocas", indicadoresCalendario.reciprocas, "bg-violet-50 text-violet-950 border-violet-200"],
                  ["Solicitações distintas", indicadoresCalendario.solicitacoes, "bg-emerald-50 text-emerald-950 border-emerald-200"],
                ].map(([rotulo, valor, estilo]) => <div key={rotulo} className={`rounded-xl border p-3 ${estilo}`}><p className="text-xl font-bold">{valor}</p><p className="text-[11px] font-semibold">{rotulo}</p></div>)}
              </div>
            </>
          )}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <h2 className="text-lg font-bold capitalize text-slate-900">{modoCalendario === "semana"
                ? `${formatarDataCalendario(diasCalendario[0])} – ${formatarDataCalendario(diasCalendario.at(-1))}`
                : formatarDataCalendario(referenciaCalendario, { month: "long", year: "numeric" })}</h2>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium text-slate-600">
                <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-amber-400" />Amarelo/laranja: foi substituído</span>
                <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-blue-500" />Azul: substituiu alguém</span>
                <span className="text-slate-500">A situação aparece no detalhe; somente deferidas são mostradas por padrão.</span>
              </div>
            </div>
            {erroCalendario && <div role="alert" className="m-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{erroCalendario}</div>}
            {carregandoCalendario && <div className="px-4 py-2 text-xs text-slate-500">Atualizando serviços do período…</div>}
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-xs">
              {[
                ["Seg", "Segunda-feira"], ["Ter", "Terça-feira"], ["Qua", "Quarta-feira"],
                ["Qui", "Quinta-feira"], ["Sex", "Sexta-feira"], ["Sáb", "Sábado"], ["Dom", "Domingo"],
              ].map(([curto, completo]) => <div key={curto} aria-label={completo} className="px-1 py-2">{curto}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {diasCalendario.map((dia) => {
                const eventos = eventosPorDia.get(dia) || [];
                const dentroDoMes = dia.slice(0, 7) === referenciaCalendario.slice(0, 7);
                const hoje = dia === dataLocalHoje();
                return (
                  <button key={dia} type="button" onClick={() => setDataSelecionada(dia)} aria-pressed={dataSelecionada === dia} aria-label={`${formatarDataCalendario(dia, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}, ${eventos.length} serviço(s)`} className={`min-h-20 overflow-hidden border-b border-r border-slate-100 p-1 text-left transition-colors sm:min-h-28 sm:p-2 ${dataSelecionada === dia ? "bg-blue-50 ring-2 ring-inset ring-blue-500" : "hover:bg-slate-50"} ${dentroDoMes ? "" : "bg-slate-50/70 text-slate-400"}`}>
                    <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full text-xs font-bold ${hoje ? "bg-blue-600 text-white" : dentroDoMes ? "text-slate-700" : "text-slate-400"}`}>{Number(dia.slice(-2))}</span>
                    <div className="mt-1 space-y-1">
                      {eventos.slice(0, modoCalendario === "semana" ? 3 : 2).map((evento) => {
                        const manifestacao = evento.manifestacao;
                        const permuta = evento.permuta;
                        const participacaoStyle = evento.chaveParticipacao === "foi_substituido" ? "bg-amber-100 text-amber-950" : "bg-blue-100 text-blue-950";
                        const statusStyle = permuta.status === "DEFERIDA" ? "border-emerald-600" : permuta.status === "CANCELADA" ? "border-slate-500 line-through" : permuta.status === "INDEFERIDA" ? "border-rose-600" : "border-sky-600";
                        const nomeCoberto = nomePolicial(permuta.solicitante_id === manifestacao.policial_id ? permuta.solicitante : permuta.destinatario);
                        const nomeSubstituto = nomePolicial(permuta.solicitante_id === manifestacao.substituto_id ? permuta.solicitante : permuta.destinatario);
                        const direcao = evento.classificacaoPolicial || `${nomeSubstituto} cobre ${nomeCoberto}`;
                        return <span key={`${permuta.id}-${manifestacao.id}-${evento.dataMarcacao}`} title={`${permuta.tipo === "TROCA_RECIPROCA" ? "Troca recíproca" : "Substituição simples"} · ${permuta.status}: ${direcao}, ${manifestacao.horario_inicio}–${manifestacao.horario_fim}${evento.continuidade ? ", continuação de serviço iniciado no dia anterior" : ""}`} className={`block truncate rounded border-l-[3px] px-1 py-0.5 text-[9px] leading-tight sm:text-[11px] ${participacaoStyle} ${statusStyle}`}>
                          <span className="font-bold">{permuta.tipo === "TROCA_RECIPROCA" ? "TR" : "SIM"} · {evento.continuidade ? "↪ " : `${manifestacao.horario_inicio} `}</span>{direcao}{evento.continuidade && " · continuação"}
                        </span>;
                      })}
                      {eventos.length > (modoCalendario === "semana" ? 3 : 2) && <span className="block px-1 text-[9px] font-semibold text-slate-500">+{eventos.length - (modoCalendario === "semana" ? 3 : 2)} serviços</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold text-slate-900">Serviços de {policialCalendarioSelecionado ? identificacaoPolicial(policialCalendarioSelecionado) : "policial não selecionado"} em {formatarDataCalendario(dataSelecionada, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h2>
              <span className="text-xs text-slate-500">{eventosDiaSelecionado.length} marcação(ões)</span>
            </div>
            {!eventosDiaSelecionado.length && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">Nenhum serviço corresponde aos filtros nesta data.</div>}
            {eventosDiaSelecionado.map((evento) => {
              const { permuta, manifestacao } = evento;
              const policialCoberto = permuta.solicitante_id === manifestacao.policial_id ? permuta.solicitante : permuta.destinatario;
              const policialSubstituto = permuta.solicitante_id === manifestacao.substituto_id ? permuta.solicitante : permuta.destinatario;
              const decisoes = (permuta.historico || []).filter((item) => ["DEFERIDA", "INDEFERIDA", "CANCELADA"].includes(item.tipo_evento));
              const atorExibicao = (item) => item.ator ? identificacaoPolicial(item.ator) : `Responsável registrado (${item.ator_id})`;
              const status = STATUS[permuta.status] || { label: permuta.status, style: "border-slate-200 bg-slate-100 text-slate-700" };
              return (
                <article key={`${permuta.id}-${manifestacao.id}-${evento.dataMarcacao}`} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div><h3 className={`inline-flex rounded-md px-2 py-1 text-sm font-bold ${permuta.tipo === "TROCA_RECIPROCA" ? "bg-violet-100 text-violet-900" : "bg-cyan-100 text-cyan-900"}`}>{permuta.tipo === "TROCA_RECIPROCA" ? "Troca recíproca" : "Substituição simples"}</h3><p className="mt-0.5 text-xs text-slate-500">{evento.continuidade ? `Continuação do serviço iniciado em ${formatarDataCalendario(evento.dataServico)}` : `Serviço original em ${formatarDataCalendario(evento.dataServico)}`}</p></div>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${status.style}`}>{status.label}</span>
                  </div>
                  <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-2">
                    <p><span className="font-semibold text-slate-500">Foi substituído:</span> <span className="font-semibold text-slate-800">{identificacaoPolicial(policialCoberto)}</span></p>
                    <p><span className="font-semibold text-slate-500">Substituiu:</span> <span className="font-semibold text-slate-800">{identificacaoPolicial(policialSubstituto)}</span></p>
                    {evento.classificacaoPolicial && <p className="font-semibold text-blue-800 sm:col-span-2">Policial filtrado: {evento.classificacaoPolicial}</p>}
                  </div>
                  <p className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-sm text-slate-700"><span className="font-semibold text-blue-900">Motivo da permuta/substituição:</span> {permuta.motivo || "Não registrado na versão anterior."}</p>
                  <div className="space-y-1 text-sm text-slate-700">
                    <p><span className="font-semibold">Serviço original:</span> {manifestacao.descricao}</p>
                    <p><span className="font-semibold">Turno:</span> {manifestacao.turno} · <span className="font-semibold">Horário:</span> {manifestacao.horario_inicio?.slice(0, 5)} às {manifestacao.horario_fim?.slice(0, 5)}{manifestacao.horario_fim <= manifestacao.horario_inicio ? " (termina no dia seguinte)" : ""}</p>
                  </div>
                  <p className={`rounded-lg p-2.5 text-sm font-semibold ${permuta.status === "DEFERIDA" ? "bg-emerald-50 text-emerald-800" : permuta.status === "CANCELADA" ? "bg-slate-100 text-slate-700" : "bg-amber-50 text-amber-900"}`}>
                    {permuta.status === "DEFERIDA" ? "Serviço autorizado por deferimento." : permuta.status === "CANCELADA" ? "Cancelada: o deferimento permanece no histórico, mas a autorização não está ativa." : permuta.status === "INDEFERIDA" ? "Indeferida: registro disponível somente para consulta histórica." : "Pendente: ainda não constitui serviço autorizado."}
                  </p>
                  <div className="space-y-2 border-t border-slate-100 pt-3">
                    <h4 className="text-sm font-bold text-slate-800">Dados da decisão administrativa</h4>
                    {decisoes.length ? decisoes.map((item) => <div key={item.id} className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-700"><p className="font-semibold">{EVENTO_HISTORICO[item.tipo_evento] || item.tipo_evento} · {atorExibicao(item)}</p><p className="mt-0.5">{dataHoraBrasileira(item.ocorrido_em)}{item.justificativa ? ` · ${item.justificativa}` : ""}</p>{item.servicos_conferidos && <p className="mt-0.5 text-emerald-700">Serviços conferidos.</p>}</div>) : <p className="text-xs text-slate-500">Ainda não há decisão administrativa registrada.</p>}
                  </div>
                  {permuta.historico?.length > 0 && <details className="rounded-xl border border-slate-200"><summary className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm font-semibold text-slate-700"><History className="h-4 w-4 text-slate-400" />Histórico completo ({permuta.historico.length})</summary><ol className="space-y-3 border-t border-slate-100 px-3 py-3">{permuta.historico.map((item) => <li key={item.id} className="border-l-2 border-slate-200 pl-3"><p className="text-sm font-semibold text-slate-800">{EVENTO_HISTORICO[item.tipo_evento] || item.tipo_evento}</p><p className="text-xs text-slate-500">{atorExibicao(item)} · {dataHoraBrasileira(item.ocorrido_em)}</p>{(item.estado_anterior || item.estado_novo) && <p className="mt-1 text-xs text-slate-600">{STATUS[item.estado_anterior]?.label || item.estado_anterior || "Início"} → {STATUS[item.estado_novo]?.label || item.estado_novo}</p>}{item.justificativa && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{item.justificativa}</p>}</li>)}</ol></details>}
                </article>
              );
            })}
          </section>
        </section>
      ) : podeConsultarGeral ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900">{listagemOperacionalP1 ? "Acompanhamento de Permutas" : "Solicitações encontradas"}</h2>
            <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600">{permutas.length}</span>
          </div>
          {permutas.length ? <div className="space-y-3">{permutas.map((item) => renderCartaoPermuta({ item, direcao: "administrativa" }))}</div>
            : <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">Nenhuma permuta encontrada para os filtros selecionados.</div>}
          {listagemOperacionalP1 && <p className="text-xs text-slate-500">Consulta operacional somente para acompanhamento. Decisões administrativas ficam disponíveis para Oficial e Master.</p>}
        </section>
      ) : (
        <div className="space-y-6">
          {renderSecaoPermutas({ titulo: "Solicitações recebidas", itens: recebidas, direcao: "recebida" })}
          {renderSecaoPermutas({ titulo: "Solicitações enviadas", itens: enviadas, direcao: "enviada" })}
        </div>
      )}

      {permutaConfirmando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 sm:p-5" onMouseDown={(evento) => { if (evento.target === evento.currentTarget) fecharConfirmacao(); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="titulo-confirmacao-permuta" className="my-auto max-h-[94vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div><h2 id="titulo-confirmacao-permuta" className="text-lg font-bold text-slate-900">Confirmar participação</h2><p className="mt-1 text-sm text-slate-600">Revise os dados antes de enviar sua confirmação.</p></div>
              <button type="button" onClick={fecharConfirmacao} disabled={enviando} aria-label="Fechar confirmação" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-2">
              {(permutaConfirmando.manifestacoes || []).map((manifestacao) => <LinhaServico key={manifestacao.id} titulo="Serviço apresentado pelo solicitante" servico={manifestacao} />)}
            </div>
            {permutaConfirmando.tipo === "TROCA_RECIPROCA" && usuarioId === permutaConfirmando.destinatario_id && (
              <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-3 sm:p-4">
                <div><h3 className="font-bold text-slate-800">Informe seu serviço</h3><p className="text-xs text-slate-600">Na troca recíproca, você informa seu serviço e confirma que o solicitante irá substituí-lo nele.</p></div>
                <CampoServico valor={servicoConfirmacao} atualizar={setServicoConfirmacao} idPrefixo="confirmacao-permuta" />
              </div>
            )}
            <form onSubmit={confirmarParticipacao} className="space-y-4 border-t border-slate-100 pt-4">
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" required checked={confirmacaoExplicita} onChange={(evento) => setConfirmacaoExplicita(evento.target.checked)} />
                <span>Confirmo individualmente minha participação e que revisei os dados apresentados.</span>
              </label>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={fecharConfirmacao} disabled={enviando} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Voltar</button>
                <button type="submit" disabled={enviando || !confirmacaoExplicita} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{enviando ? "Registrando..." : "Confirmar e enviar"}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {acaoAdministrativa && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 sm:p-5" onMouseDown={(evento) => { if (evento.target === evento.currentTarget && !enviando) setAcaoAdministrativa(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="titulo-acao-administrativa" className="my-auto max-h-[94vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="titulo-acao-administrativa" className="text-lg font-bold text-slate-900">
                  {acaoAdministrativa.tipo === "cancelar" ? "Cancelar permuta deferida" : acaoAdministrativa.deferir ? "Deferir permuta" : "Indeferir permuta"}
                </h2>
                <p className="mt-1 text-sm text-slate-600">{nomePolicial(acaoAdministrativa.permuta.solicitante)} · {nomePolicial(acaoAdministrativa.permuta.destinatario)}</p>
              </div>
              <button type="button" onClick={() => setAcaoAdministrativa(null)} disabled={enviando} aria-label="Fechar ação administrativa" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X className="h-4 w-4" /></button>
            </div>
            {acaoAdministrativa.tipo === "decidir" && (
              <div className={`space-y-1 rounded-xl border p-3 text-sm ${acaoAdministrativa.deferir ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
                <p>{acaoAdministrativa.deferir
                  ? "O deferimento só será enviado após a declaração de conferência e a confirmação final."
                  : "O indeferimento exige justificativa e será registrado no histórico da permuta."}</p>
                <p className="text-xs">O fluxo atual também registra um texto de observação e a declaração de conferência em qualquer decisão.</p>
              </div>
            )}
            {acaoAdministrativa.tipo === "cancelar" && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">O cancelamento não exclui a permuta nem o deferimento anterior. Ambos permanecem na trilha de auditoria.</p>}
            <form onSubmit={executarAcaoAdministrativa} className="space-y-4">
              {acaoAdministrativa.tipo === "decidir" && (
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" required checked={servicosConferidos} onChange={(evento) => setServicosConferidos(evento.target.checked)} />
                  <span>Declaro que conferi os serviços informados pelos policiais.</span>
                </label>
              )}
              <label htmlFor="justificativa-permuta" className="grid gap-1 text-xs font-semibold text-slate-600">
                {acaoAdministrativa.tipo === "cancelar" ? "Justificativa do cancelamento" : acaoAdministrativa.deferir ? "Observação da decisão" : "Justificativa do indeferimento"}
                <textarea id="justificativa-permuta" required minLength={1} maxLength={3000} value={justificativaAdministrativa} onChange={(evento) => setJustificativaAdministrativa(evento.target.value)} className="min-h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder={acaoAdministrativa.tipo === "cancelar" ? "Informe o motivo do cancelamento" : acaoAdministrativa.deferir ? "Registre observação sobre a decisão" : "Informe o motivo do indeferimento"} />
              </label>
              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setAcaoAdministrativa(null)} disabled={enviando} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Voltar</button>
                <button type="submit" disabled={enviando || !justificativaAdministrativa.trim() || (acaoAdministrativa.tipo === "decidir" && !servicosConferidos)} className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${acaoAdministrativa.tipo === "cancelar" || !acaoAdministrativa.deferir ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"}`}>
                  {enviando ? "Registrando..." : acaoAdministrativa.tipo === "cancelar" ? "Confirmar cancelamento" : acaoAdministrativa.deferir ? "Confirmar deferimento" : "Registrar indeferimento"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
