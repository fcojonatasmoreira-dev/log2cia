import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, History, RefreshCw, X, Trash2 } from "lucide-react";
import ResumoChecklistViatura from "../components/viaturas/ResumoChecklistViatura";
import BotaoCompartilharChecklist from "../components/viaturas/BotaoCompartilharChecklist";
import {
  listarAcompanhamentosOcorrencia,
  excluirRegistroHistoricoViaturas,
  listarHistoricoOperacionalViaturas,
  listarViaturas,
  registrarAcompanhamentoOcorrencia,
} from "../services/viaturasService";

const FILTROS_INICIAIS = { de: "", ate: "", mes: "", turno: "", policial_id: "", viatura_id: "", acao: "todas", situacao: "" };
const dataHora = (valor) => valor ? new Date(valor).toLocaleString("pt-BR") : "—";
const rotuloTipoMovimentacao = (valor) => ({ inicio_servico: "Entrada de serviço", retirada_oficina: "Retirada da oficina", recebimento_opm: "Recebimento de outra OPM", viatura_nova: "Recebimento de viatura nova", fim_servico: "Fim de serviço", encaminhamento_oficina: "Encaminhamento à oficina", devolucao_opm: "Devolução à OPM de origem", baixa_definitiva: "Baixa definitiva", outras_situacoes: "Outras situações" }[valor] || valor || "—");
const turnoDoRegistro = (valor) => { const hora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Fortaleza", hour: "2-digit", hourCycle: "h23" }).format(new Date(valor))); return hora >= 6 && hora < 18 ? "A" : "B"; };
const nomePolicial = (policial) => policial ? [policial.posto_graduacao, policial.numeral, policial.nome_guerra || policial.nome_completo].filter(Boolean).join(" · ") : "Policial não localizado";

function Fotos({ urls = [] }) {
  return urls.length ? <div className="flex flex-wrap gap-2">{urls.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" aria-label="Abrir foto do registro"><img src={url} alt="Foto do registro" className="h-20 w-20 rounded-lg border object-cover" loading="lazy"/></a>)}</div> : <p className="text-sm text-slate-500">Sem fotos anexadas.</p>;
}

function OcorrenciaDetalhes({ evento, podeTratar, aoFechar }) {
  const [acompanhamentos, setAcompanhamentos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [erroSalvar, setErroSalvar] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [tipo, setTipo] = useState("comentario");
  const [oficina, setOficina] = useState("");
  const [comentario, setComentario] = useState("");
  const requisicao = useRef(0);
  const registro = evento.registro;

  const carregarAcompanhamentos = useCallback(async () => {
    const atual = ++requisicao.current;
    setCarregando(true);
    setErro("");
    try {
      const resultado = await listarAcompanhamentosOcorrencia(registro.id);
      if (atual === requisicao.current) setAcompanhamentos(resultado.acompanhamentos || []);
    } catch (e) {
      if (atual === requisicao.current) setErro(e.message || "Não foi possível carregar o acompanhamento da ocorrência.");
    } finally {
      if (atual === requisicao.current) setCarregando(false);
    }
  }, [registro.id]);

  useEffect(() => {
    let ativo = true;
    Promise.resolve().then(() => { if (ativo) carregarAcompanhamentos(); });
    return () => { ativo = false; requisicao.current += 1; };
  }, [carregarAcompanhamentos]);

  async function salvarAcompanhamento(e) {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    setErroSalvar("");
    try {
      await registrarAcompanhamentoOcorrencia(registro.id, { tipo, oficina, comentario });
      setComentario("");
      setOficina("");
      setTipo("comentario");
      await carregarAcompanhamentos();
    } catch (error) {
      setErroSalvar(error.message || "Não foi possível registrar o acompanhamento.");
    } finally {
      setSalvando(false);
    }
  }

  const encaminhada = acompanhamentos.some((item) => item.tipo === "encaminhamento_oficina");

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-5" role="dialog" aria-modal="true" aria-label="Detalhes da ocorrência" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
    <section className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
      <header className="sticky top-0 flex items-start justify-between border-b border-slate-100 bg-white p-4">
        <div><h2 className="font-bold text-slate-800">Ocorrência · {registro.tipo}</h2><p className="text-xs text-slate-500">{evento.viatura?.identificacao} · {evento.viatura?.placa} · {dataHora(evento.data_hora)}</p></div>
        <button type="button" onClick={aoFechar} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Fechar detalhes"><X className="h-5 w-5"/></button>
      </header>
      <div className="space-y-4 p-4 text-sm">
        <p><strong>Responsável pelo registro:</strong> {nomePolicial(evento.policial)} · <strong>Turno:</strong> {evento.turno} (derivado do horário) · <strong>Análise:</strong> {evento.situacao}</p>
        <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3">{registro.descricao}</p>
        <p>Quilometragem: {new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(registro.quilometragem)} km</p>
        <Fotos urls={registro.fotos_urls}/>
        {encaminhada && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900"><strong>Encaminhamento registrado.</strong> A ocorrência permanece {evento.situacao}; encaminhar à oficina não representa resolução.</p>}
        {evento.checkin_vinculado && <section className="space-y-2 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
          <h3 className="font-semibold text-slate-800">Check-in vinculado</h3>
          <p>Entrada: {dataHora(evento.checkin_vinculado.data_hora_inicio)} · KM inicial {evento.checkin_vinculado.km_inicial} · {rotuloTipoMovimentacao(evento.checkin_vinculado.tipo_entrada)}{evento.checkin_vinculado.tipo_entrada_detalhe ? ` · ${evento.checkin_vinculado.tipo_entrada_detalhe}` : ""}</p>
          <p>Responsável: {nomePolicial(evento.checkin_vinculado.responsavel)}</p>
          <p><strong>Observações:</strong> {evento.checkin_vinculado.observacoes_entrada || "Nenhuma"}</p>
          <Fotos urls={evento.checkin_vinculado.fotos_urls_entrada}/>
          <ResumoChecklistViatura titulo="Checklist de entrada" checklist={evento.checkin_vinculado.checklist_entrada}/>
        </section>}
        <section className="space-y-3 border-t border-slate-200 pt-4">
          <h3 className="font-bold text-slate-800">Acompanhamento da ocorrência</h3>
          {erro && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-700">{erro}</p>}
          {carregando ? <p className="text-slate-500">Carregando comentários e encaminhamentos…</p> : acompanhamentos.length ? <ol className="space-y-2">{acompanhamentos.map((item) => <li key={item.id} className="rounded-lg border border-slate-200 p-3">
            <p className="font-semibold text-slate-800">{item.tipo === "encaminhamento_oficina" ? "Encaminhamento para oficina" : "Comentário"}{item.oficina ? ` · ${item.oficina}` : ""}</p>
            <p className="my-1 whitespace-pre-wrap text-slate-700">{item.comentario}</p>
            <p className="text-xs text-slate-500">{nomePolicial(item.policial)} · {dataHora(item.created_at)}</p>
          </li>)}</ol> : <p className="text-slate-500">Nenhum comentário ou encaminhamento registrado.</p>}
          {podeTratar && <form onSubmit={salvarAcompanhamento} className="space-y-3 rounded-xl bg-slate-50 p-3">
            <label className="grid gap-1 text-xs font-semibold text-slate-600">Ação<select value={tipo} onChange={(e) => setTipo(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal"><option value="comentario">Adicionar comentário</option><option value="encaminhamento_oficina">Encaminhar para oficina</option></select></label>
            {tipo === "encaminhamento_oficina" && <label className="grid gap-1 text-xs font-semibold text-slate-600">Oficina responsável (quando aplicável)<input maxLength={160} value={oficina} onChange={(e) => setOficina(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal" placeholder="Nome da oficina"/></label>}
            <label className="grid gap-1 text-xs font-semibold text-slate-600">{tipo === "encaminhamento_oficina" ? "Observação do encaminhamento" : "Comentário"}<textarea required maxLength={3000} rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal"/></label>
            {erroSalvar && <p role="alert" className="text-sm text-rose-700">{erroSalvar}</p>}
            <button type="submit" disabled={salvando || carregando} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{salvando ? "Salvando…" : tipo === "encaminhamento_oficina" ? "Registrar encaminhamento" : "Adicionar comentário"}</button>
          </form>}
        </section>
      </div>
    </section>
  </div>;
}

export default function HistoricoOperacionalViaturas({ user, onVoltar }) {
  const [viaturas, setViaturas] = useState([]);
  const [filtros, setFiltros] = useState(FILTROS_INICIAIS);
  const [dados, setDados] = useState({ viaturas: [], policiais: [], pagina: 1, tem_mais: false });
  const [selecionado, setSelecionado] = useState(null);
  const [viaturaExpandida, setViaturaExpandida] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [erroViaturas, setErroViaturas] = useState("");
  const role = String(user?.role || "").trim().toLowerCase();
  const ehMaster = user?.is_master === true || role === "master";
  const podeTratar = ehMaster || role === "p4";
  const podeExcluir = ehMaster;

  const consultar = useCallback(async (pagina = 1, filtrosAtivos = FILTROS_INICIAIS) => {
    setCarregando(true);
    setErro("");
    setViaturaExpandida(null);
    try {
      const resultado = await listarHistoricoOperacionalViaturas({ ...filtrosAtivos, pagina });
      setDados(resultado);
    } catch (e) {
      setErro(e.message || "Não foi possível consultar o histórico operacional.");
      setDados((anterior) => ({ ...anterior, viaturas: [], tem_mais: false }));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    let ativo = true;
    Promise.resolve().then(() => {
      if (!ativo) return;
      listarViaturas()
        .then((resultado) => { if (ativo) setViaturas(resultado.viaturas || []); })
        .catch((error) => { if (ativo) setErroViaturas(error.message || "Não foi possível carregar as viaturas para o filtro."); });
      consultar(1, FILTROS_INICIAIS);
    });
    return () => { ativo = false; };
  }, [consultar]);

  function alterarFiltro(campo, valor) { setFiltros((anterior) => ({ ...anterior, [campo]: valor })); }
  function limparFiltros() {
    setFiltros(FILTROS_INICIAIS);
    consultar(1, FILTROS_INICIAIS);
  }
  function abrirOcorrencia(ocorrencia, grupo) {
    setSelecionado({
      tipo_acao: "ocorrencia",
      data_hora: ocorrencia.data_hora,
      turno: turnoDoRegistro(ocorrencia.data_hora),
      situacao: ocorrencia.analisada ? "analisada" : "pendente",
      resumo: ocorrencia.descricao,
      viatura: grupo.viatura,
      policial: ocorrencia.policial,
      registro: { ...ocorrencia, fotos_urls: ocorrencia.fotos_urls },
    });
  }

  async function excluir(tipo, id, etapa = null) {
    const descricao = tipo === "ocorrencia" ? "ocorrência" : tipo === "checklist" ? `checklist de ${etapa}` : "movimentação";
    const impacto = tipo === "ocorrencia" ? "Comentários e encaminhamentos vinculados serão excluídos na mesma transação; ocorrências com fotos não podem ser removidas por segurança." : tipo === "checklist" ? "Somente as respostas deste checklist serão apagadas; movimentação, fotos e quilometragem serão preservadas." : "As fotos vinculadas serão apagadas junto com a movimentação. Registros com ocorrências vinculadas não podem ser removidos. A quilometragem oficial será preservada.";
    if (!window.confirm(`Excluir esta ${descricao} do histórico? ${impacto} A quilometragem oficial da viatura não será alterada.`)) return;
    try {
      await excluirRegistroHistoricoViaturas(tipo, id, etapa);
      await consultar(dados.pagina || 1, filtros);
    } catch (error) {
      setErro(error.message || `Não foi possível excluir a ${descricao}.`);
    }
  }

  return <div className="space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><History className="h-5 w-5"/></div><div><h1 className="text-lg font-bold text-slate-800">Histórico operacional de viaturas</h1><p className="text-sm text-slate-500">Movimentações e ocorrências organizadas por viatura.</p></div></div>
      <button type="button" onClick={onVoltar} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><ArrowLeft className="h-4 w-4"/>Voltar às viaturas</button>
    </header>
    <section className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-blue-50/60 p-4"><div><h2 className="font-bold text-slate-800">Filtros e viaturas</h2><p className="text-xs text-slate-500">O turno é calculado pelo horário local de Fortaleza. A pesquisa reúne ações por viatura.</p></div><button type="button" onClick={() => consultar(dados.pagina || 1, filtros)} disabled={carregando} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"><RefreshCw className={`mr-1 inline h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`}/>Atualizar</button></div>
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-xs font-semibold text-slate-600">Data/período inicial<input type="date" value={filtros.de} onChange={(e) => alterarFiltro("de", e.target.value)} className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm font-normal"/></label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">Data/período final<input type="date" value={filtros.ate} onChange={(e) => alterarFiltro("ate", e.target.value)} className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm font-normal"/></label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">Mês e ano<input type="month" value={filtros.mes} onChange={(e) => alterarFiltro("mes", e.target.value)} className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm font-normal"/></label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">Turno<select value={filtros.turno} onChange={(e) => alterarFiltro("turno", e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-normal"><option value="">Todos</option><option value="A">A (06h–18h)</option><option value="B">B (18h–06h)</option></select></label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">Policial<select value={filtros.policial_id} onChange={(e) => alterarFiltro("policial_id", e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-normal"><option value="">Todos</option>{(dados.policiais || []).map((p) => <option key={p.id} value={p.id}>{nomePolicial(p)}</option>)}</select></label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">Viatura<select value={filtros.viatura_id} onChange={(e) => alterarFiltro("viatura_id", e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-normal"><option value="">Todas</option>{viaturas.map((v) => <option key={v.id} value={v.id}>{v.identificacao} · {v.placa}</option>)}</select></label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">Tipo de ação<select value={filtros.acao} onChange={(e) => alterarFiltro("acao", e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-normal"><option value="todas">Todas</option><option value="checkin">Check-in</option><option value="checkout">Check-out</option><option value="ocorrencia">Ocorrência</option><option value="abastecimento">Ocorrência de abastecimento</option></select></label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">Situação da ocorrência<select value={filtros.situacao} onChange={(e) => alterarFiltro("situacao", e.target.value)} className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm font-normal"><option value="">Todas</option><option value="pendente">Pendente</option><option value="analisada">Analisada</option></select></label>
        </div>
        <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={limparFiltros} disabled={carregando} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 disabled:opacity-50">Limpar filtros</button><button type="button" onClick={() => consultar(1, filtros)} disabled={carregando} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{carregando ? "Consultando…" : "Aplicar filtros"}</button></div>
        {erroViaturas && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{erroViaturas}</p>}
        {erro && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{erro}</p>}
        {carregando ? <p className="py-8 text-center text-sm text-slate-500">Carregando histórico…</p> : dados.viaturas?.length ? <div className="divide-y divide-slate-200">{dados.viaturas.map((grupo) => {
          const aberta = viaturaExpandida === grupo.viatura.id;
          return <article key={grupo.viatura.id} className="py-1">
            <button type="button" aria-expanded={aberta} onClick={() => setViaturaExpandida(aberta ? null : grupo.viatura.id)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left hover:bg-blue-50/50"><span className="font-semibold text-slate-800">{grupo.viatura.identificacao} · {grupo.viatura.placa}</span><ChevronRight className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${aberta ? "rotate-90" : ""}`}/></button>
            {aberta && <div className="space-y-4 px-3 pb-4 text-sm">
              <section className="rounded-lg border border-slate-200 bg-slate-50 p-3"><h3 className="mb-1 font-semibold">Situação atual</h3><p>{grupo.viatura.situacao_exibida || grupo.viatura.situacao || "Não informada"}{grupo.viatura.localizacao_atual ? ` · ${grupo.viatura.localizacao_atual}` : ""}</p>{grupo.checkin_ativo && <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 p-2"><h4 className="font-semibold text-emerald-900">Check-in ativo</h4><p>{nomePolicial(grupo.checkin_ativo.responsavel)} · {dataHora(grupo.checkin_ativo.data_hora_inicio)} · KM inicial {grupo.checkin_ativo.km_inicial} · {rotuloTipoMovimentacao(grupo.checkin_ativo.tipo_entrada)}{grupo.checkin_ativo.tipo_entrada_detalhe ? ` · ${grupo.checkin_ativo.tipo_entrada_detalhe}` : ""}</p>{grupo.checkin_ativo.observacoes_entrada && <p className="mt-1">{grupo.checkin_ativo.observacoes_entrada}</p>}<Fotos urls={grupo.checkin_ativo.fotos_entrada_urls}/><ResumoChecklistViatura titulo="Checklist de entrada" checklist={grupo.checkin_ativo.checklist_entrada}/>{podeExcluir && Object.keys(grupo.checkin_ativo.checklist_entrada || {}).length > 0 && <button type="button" onClick={() => excluir("checklist", grupo.checkin_ativo.id, "entrada")} className="mt-2 rounded border border-rose-200 bg-white px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50">Excluir checklist de entrada</button>}{podeTratar && <div className="mt-2"><BotaoCompartilharChecklist checkinId={grupo.checkin_ativo.id}/></div>}</div>}</section>
              <section><h3 className="mb-2 font-semibold">Histórico de movimentações</h3>{grupo.movimentacoes.length ? <div className="space-y-2">{grupo.movimentacoes.filter((movimento) => !movimento.ativo).map((movimento) => <article key={movimento.id} className="rounded-lg border border-slate-200 p-3"><p className="font-semibold">{nomePolicial(movimento.responsavel)} · {movimento.km_inicial} km iniciais{movimento.km_final != null ? ` → ${movimento.km_final} km finais` : ""}</p><p className="text-xs text-slate-600">Entrada {dataHora(movimento.data_hora_inicio)} · {rotuloTipoMovimentacao(movimento.tipo_entrada)}{movimento.tipo_entrada_detalhe ? ` · ${movimento.tipo_entrada_detalhe}` : ""}{movimento.data_hora_fim ? ` · Saída ${dataHora(movimento.data_hora_fim)} · ${rotuloTipoMovimentacao(movimento.tipo_saida)}${movimento.tipo_saida_detalhe ? ` · ${movimento.tipo_saida_detalhe}` : ""}` : ""}</p>{movimento.responsavel_saida && <p className="text-xs text-slate-600">Responsável pela saída: {nomePolicial(movimento.responsavel_saida)}</p>}{movimento.observacoes_entrada && <p className="mt-1">Entrada: {movimento.observacoes_entrada}</p>}{movimento.observacoes_saida && <p className="mt-1">Saída: {movimento.observacoes_saida}</p>}<Fotos urls={[...(movimento.fotos_entrada_urls || []), ...(movimento.fotos_saida_urls || [])]}/><section className="mt-2 space-y-2 rounded-lg border border-slate-200 p-3"><h4 className="font-semibold">Checklist da movimentação</h4><ResumoChecklistViatura titulo="Etapa de entrada" checklist={movimento.checklist_entrada}/>{podeExcluir && Object.keys(movimento.checklist_entrada || {}).length > 0 && <button type="button" onClick={() => excluir("checklist", movimento.id, "entrada")} className="mt-2 rounded border border-rose-200 bg-white px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50">Excluir checklist de entrada</button>}{movimento.data_hora_fim && <><ResumoChecklistViatura titulo="Etapa de saída" checklist={movimento.checklist_saida}/>{podeExcluir && Object.keys(movimento.checklist_saida || {}).length > 0 && <button type="button" onClick={() => excluir("checklist", movimento.id, "saida")} className="mt-2 rounded border border-rose-200 bg-white px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50">Excluir checklist de saída</button>}</>}</section><div className="mt-2 flex flex-wrap gap-2">{podeTratar && <BotaoCompartilharChecklist checkinId={movimento.id}/> }{podeExcluir && <button type="button" onClick={() => excluir("movimentacao", movimento.id)} className="inline-flex items-center gap-1 rounded border border-rose-200 bg-white px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"><Trash2 className="h-3 w-3"/>Excluir movimentação</button>}</div></article>)}</div> : <p className="text-slate-500">Nenhuma movimentação correspondente à pesquisa.</p>}</section>
              <section><h3 className="mb-2 font-semibold">Ocorrências registradas</h3>{grupo.ocorrencias.length ? <div className="space-y-2">{grupo.ocorrencias.map((ocorrencia) => <article key={ocorrencia.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{ocorrencia.tipo} · {dataHora(ocorrencia.data_hora)}</p><p className="text-xs text-slate-600">{nomePolicial(ocorrencia.policial)} · {ocorrencia.quilometragem} km · Turno {turnoDoRegistro(ocorrencia.data_hora)}</p></div><span className={ocorrencia.analisada ? "text-slate-500" : "font-semibold text-amber-800"}>{ocorrencia.analisada ? "Analisada" : "Pendente"}</span></div><p className="my-2 whitespace-pre-wrap">{ocorrencia.descricao}</p><Fotos urls={ocorrencia.fotos_urls}/>{ocorrencia.acompanhamentos.length > 0 && <div className="mt-3 space-y-2 border-t border-amber-200 pt-3"><h4 className="font-semibold">Comentários e encaminhamentos</h4>{ocorrencia.acompanhamentos.map((item) => <div key={item.id} className="rounded-lg bg-white p-2"><p className="font-medium">{item.tipo === "encaminhamento_oficina" ? `Encaminhamento para oficina${item.oficina ? ` · ${item.oficina}` : ""}` : "Comentário"}</p><p className="my-1 whitespace-pre-wrap">{item.comentario}</p><p className="text-xs text-slate-500">{nomePolicial(item.policial)} · {dataHora(item.created_at)}</p></div>)}</div>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => abrirOcorrencia(ocorrencia, grupo)} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100">{podeTratar ? "Gerenciar acompanhamento" : "Ver detalhes"}</button>{podeExcluir && <button type="button" onClick={() => excluir("ocorrencia", ocorrencia.id)} className="inline-flex items-center gap-1 rounded border border-rose-200 bg-white px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"><Trash2 className="h-3 w-3"/>Excluir ocorrência</button>}</div></article>)}</div> : <p className="text-slate-500">Nenhuma ocorrência correspondente à pesquisa.</p>}</section>
            </div>}
          </article>;
        })}</div> : <p className="py-8 text-center text-sm text-slate-500">Nenhuma viatura encontrada para os filtros escolhidos.</p>}
        <div className="flex items-center justify-between border-t border-slate-100 pt-3"><span className="text-xs text-slate-500">Página {dados.pagina || 1} · {dados.por_pagina || 25} viaturas por página</span><div className="flex gap-2"><button type="button" onClick={() => consultar(Math.max(1, (dados.pagina || 1) - 1), filtros)} disabled={carregando || dados.pagina <= 1} className="rounded-lg border border-slate-200 p-2 text-slate-600 disabled:opacity-40" aria-label="Página anterior"><ChevronLeft className="h-4 w-4"/></button><button type="button" onClick={() => consultar((dados.pagina || 1) + 1, filtros)} disabled={carregando || !dados.tem_mais} className="rounded-lg border border-slate-200 p-2 text-slate-600 disabled:opacity-40" aria-label="Próxima página"><ChevronRight className="h-4 w-4"/></button></div></div>
      </div>
    </section>
    {selecionado && <OcorrenciaDetalhes evento={selecionado} podeTratar={podeTratar} aoFechar={() => setSelecionado(null)}/>}
  </div>;
}
