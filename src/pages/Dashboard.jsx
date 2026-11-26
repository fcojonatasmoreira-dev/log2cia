import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  ArrowLeftRight, ArrowRight, Bell, CalendarDays, Car, ChartNoAxesColumnIncreasing, CheckCircle2, Clock3,
  FileText, RefreshCw, ShieldAlert, UsersRound,
} from "lucide-react";
import { getDashboardMetrics } from "../services/dashboardService";
import { listarNotificacoes } from "../services/notificacoesService";
import { podeVerAlertasDashboard } from "../utils/dashboardAccess";
import { saudacaoOficial } from "../utils/dashboardGreeting";
import ModuleNavigation from "../components/layout/ModuleNavigation";

const formatarNumero = (valor) => new Intl.NumberFormat("pt-BR").format(valor);

function tempoRelativo(data) {
  const timestamp = new Date(data).getTime();
  if (!Number.isFinite(timestamp)) return "Data indisponível";
  const minutos = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutos < 1) return "Agora";
  if (minutos < 60) return `Há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `Há ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `Há ${dias} dia${dias === 1 ? "" : "s"}`;
}

function dataAtual() {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date());
}

function cartoesDoResumo(usuario, metrics = {}) {
  const policial = usuario?.modo_acesso === "policial";
  if (policial) return [
    { titulo: "Banco de Horas", valor: metrics.solicitacoesBancoHorasPessoais, legenda: "Solicitações aguardando análise", icone: Clock3, cor: "sky", rota: "/banco-horas" },
    { titulo: "Permutas", valor: metrics.permutasPessoaisPendentes, legenda: "Solicitações em andamento", icone: ArrowRight, cor: "violet", rota: "/permutas" },
  ].filter((item) => item.valor !== undefined);

  const itens = [];
  if (metrics.situacaoViaturas) itens.push({ titulo: "Viaturas baixadas", valor: metrics.situacaoViaturas.baixadas, legenda: "Veículos com situação baixada", icone: Car, cor: "sky", rota: "/viaturas" });
  if (metrics.efetivoAtivoCadastrado !== undefined) itens.push({ titulo: "Efetivo cadastrado ativo", valor: metrics.efetivoAtivoCadastrado, legenda: "Cadastro em situação EM ATIVIDADE", icone: UsersRound, cor: "emerald", rota: "/policiais" });
  if (metrics.solicitacoesBancoHorasPendentes !== undefined) itens.push({ titulo: "Banco de Horas", valor: metrics.solicitacoesBancoHorasPendentes, legenda: "Solicitações pendentes", icone: Clock3, cor: "amber", rota: "/banco-horas" });
  if (metrics.permutasAguardandoAnalise !== undefined) itens.push({ titulo: "Permutas", valor: metrics.permutasAguardandoAnalise, legenda: "Aguardando análise administrativa", icone: ArrowRight, cor: "violet", rota: "/permutas" });
  if (metrics.permutasAguardandoAplicacao !== undefined) itens.push({ titulo: "Controle de Escala", valor: metrics.permutasAguardandoAplicacao, legenda: "Serviços deferidos aguardando aplicação", icone: CalendarDays, cor: "blue", rota: "/permutas" });
  if (metrics.revisoesEscalaNecessarias !== undefined && metrics.revisoesEscalaNecessarias > 0) itens.push({ titulo: "Revisões de escala", valor: metrics.revisoesEscalaNecessarias, legenda: "Revisões que precisam de conferência", icone: ShieldAlert, cor: "rose", rota: "/permutas" });
  if (metrics.inventario) {
    const inventario = metrics.inventario;
    itens.push({ titulo: "Armamentos disponíveis", valor: inventario.armamentosDisponiveis, legenda: "Disponíveis na reserva", icone: FileText, cor: "blue", rota: "/inventario" });
    itens.push({ titulo: "Itens em manutenção", valor: inventario.emManutencao, legenda: "Inventário em manutenção", icone: FileText, cor: "amber", rota: "/inventario" });
    itens.push({ titulo: "Itens em perícia", valor: inventario.emPericia, legenda: "Inventário em perícia", icone: FileText, cor: "violet", rota: "/inventario" });
  }
  return itens;
}

const CORES = {
  sky: "bg-sky-50 text-sky-600 border-sky-100",
  emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
  amber: "bg-amber-50 text-amber-600 border-amber-100",
  violet: "bg-violet-50 text-violet-600 border-violet-100",
  blue: "bg-blue-50 text-blue-600 border-blue-100",
  rose: "bg-rose-50 text-rose-600 border-rose-100",
};
const GRADIENTES = {
  sky: "dashboard-metric--sky",
  emerald: "dashboard-metric--emerald",
  amber: "dashboard-metric--amber",
  violet: "dashboard-metric--violet",
  blue: "dashboard-metric--blue",
  rose: "dashboard-metric--rose",
};

function categoriaAlerta(item) {
  const tipo = String(item.tipo || "").toLowerCase();
  if (tipo.includes("banco")) return "orange";
  if (tipo.includes("permuta")) return "pink";
  if (tipo.includes("viatura")) return "blue";
  return "amber";
}

export default function Dashboard() {
  const { usuario } = useOutletContext();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState(null);
  const [notificacoes, setNotificacoes] = useState([]);
  const [erro, setErro] = useState("");
  const [erroNotificacoes, setErroNotificacoes] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [atualizadoEm, setAtualizadoEm] = useState(null);
  const requisicao = useRef(0);
  const modoPolicial = usuario?.modo_acesso === "policial";
  const saudacao = saudacaoOficial(usuario);
  const podeAlertas = podeVerAlertasDashboard(usuario);

  const aplicarResultados = useCallback((resultados, idRequisicao) => {
    if (idRequisicao !== requisicao.current) return;
    setErro("");
    if (resultados[0].status === "fulfilled") {
      setMetrics(resultados[0].value);
      setAtualizadoEm(new Date());
    } else {
      setMetrics(null);
      setErro(resultados[0].reason?.message || "Não foi possível carregar o resumo.");
    }
    if (podeAlertas) {
      const resultadoAlertas = resultados[1];
      if (resultadoAlertas.status === "fulfilled") {
        setNotificacoes(resultadoAlertas.value.notificacoes || []);
        setErroNotificacoes("");
      } else {
        setNotificacoes([]);
        setErroNotificacoes(resultadoAlertas.reason?.message || "Não foi possível carregar os alertas.");
      }
    } else {
      setNotificacoes([]);
      setErroNotificacoes("");
    }
    setCarregando(false);
  }, [podeAlertas]);

  const atualizar = useCallback(() => {
    const idRequisicao = ++requisicao.current;
    const tarefas = [getDashboardMetrics()];
    if (podeAlertas) tarefas.push(listarNotificacoes());
    return Promise.allSettled(tarefas).then((resultados) => aplicarResultados(resultados, idRequisicao));
  }, [aplicarResultados, podeAlertas]);

  useEffect(() => {
    void atualizar();
    return () => { requisicao.current += 1; };
  }, [atualizar, usuario?.id, usuario?.modo_acesso]);

  const atualizarManualmente = () => {
    setCarregando(true);
    void atualizar();
  };

  const cards = cartoesDoResumo(usuario, metrics || {});
  const alertasRecentes = notificacoes.slice(0, 5);
  const dataReferencia = dataAtual();
  const abrirNotificacao = (item) => {
    if (item.abrir_controle_escala) navigate("/permutas");
    else if (item.banco_horas_solicitacao_id) navigate("/banco-horas");
    else if (item.permuta_id) navigate("/permutas");
  };

  return (
    <div className="space-y-5">
      <section className="dashboard-hero relative isolate flex min-h-[176px] items-center overflow-hidden rounded-2xl bg-[#071a3c] px-4 py-4 text-white shadow-lg sm:min-h-[180px] sm:px-8">
        <img src="/images/dashboard-jeep-commander-hero.webp" alt="" aria-hidden="true" className="dashboard-hero-image absolute object-contain object-right" />
        <div className="dashboard-hero-overlay absolute inset-0 bg-gradient-to-r from-[#06152f]/95 via-[#06152f]/70 to-[#06152f]/10" />
        <div className="dashboard-hero-content relative z-10 flex w-full items-center">
          <div className="dashboard-hero-copy min-w-0 border-l-[5px] border-cyan-400 pl-4">
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Painel Geral — Log2CIA</h1>
            <p className="mt-1 text-sm italic text-blue-50/95 sm:text-base">Raça de fortes, povo de bravos.</p>
          </div>
        </div>
      </section>

      <div className="dashboard-hero-toolbar -mt-3 flex w-full flex-wrap items-center justify-end gap-2">
        {atualizadoEm && <span className="mr-1 text-[11px] text-slate-600">Atualizado {new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" }).format(atualizadoEm)}</span>}
        <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-blue-700 bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-sm">Visão do perfil</span>
        <button onClick={atualizarManualmente} disabled={carregando} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-70"><RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />Atualizar</button>
      </div>

      {saudacao && <div className="flex justify-end"><p className="dashboard-official-greeting rounded-lg border px-3 py-1.5 text-sm font-semibold">{saudacao}</p></div>}

      <ModuleNavigation usuario={usuario} />

      <section className="rounded-2xl border border-blue-100 bg-white/80 p-4 shadow-[0_8px_25px_#163b7210] sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-blue-100 pb-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <div className="flex items-center gap-3"><ChartNoAxesColumnIncreasing className="h-7 w-7 text-blue-500" /><h2 className="text-xl font-extrabold tracking-tight text-[#111a40] sm:text-2xl">Resumo Operacional</h2></div>
            {!modoPolicial && <p className="max-w-3xl border-l border-blue-300 pl-4 text-xs leading-relaxed text-slate-600">Visão contextual do sistema. Os indicadores aparecem somente quando há fonte de dados disponível e autorização para o perfil.</p>}
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm"><CalendarDays className="h-4 w-4 text-slate-700" />Referência: <strong className="text-slate-900">{dataReferencia}</strong></div>
        </div>

        {erro && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{erro}</div>}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(310px,1fr)]">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2">
              {cards.map((item) => {
                const Icone = item.icone;
                return <button key={item.titulo} onClick={() => navigate(item.rota)} className={`dashboard-metric ${GRADIENTES[item.cor] || GRADIENTES.blue} group flex min-h-[118px] flex-col justify-between rounded-2xl border border-blue-100 bg-gradient-to-br from-white to-[#f4f7ff] p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md`}>
                  <div className="flex items-start justify-between gap-3"><span className={`grid h-10 w-10 place-items-center rounded-xl border ${CORES[item.cor]}`}><Icone className="h-6 w-6" /></span><span className="text-3xl font-extrabold tracking-tight text-[#0d1d48]">{carregando && !metrics ? "—" : formatarNumero(item.valor)}</span></div>
                  <div><h3 className="text-sm font-bold leading-tight text-[#101a43]">{item.titulo}</h3><p className="mt-1 text-[11px] leading-snug text-slate-500">{item.legenda}</p></div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600">Abrir módulo <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" /></span>
                </button>;
              })}
              {!cards.length && !erro && <div className="col-span-full rounded-2xl border border-dashed border-blue-200 bg-blue-50/50 p-6 text-sm text-slate-600">Não há indicadores disponíveis para este perfil. Os módulos autorizados continuam acessíveis acima.</div>}
            </div>

            {metrics?.efetivoAtivoCadastrado !== undefined && <section className="rounded-2xl border border-blue-100 bg-gradient-to-br from-white to-[#f5f8ff] p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-600"><UsersRound className="h-5 w-5" /></span><div><h3 className="font-extrabold text-[#101a43]">Efetivo da Unidade</h3><p className="text-[11px] text-slate-500">Cadastros ativos — não representa presença no serviço</p></div></div>
              <div className="flex items-center gap-4 rounded-xl bg-white/80 px-4 py-3"><span className="text-4xl font-extrabold text-[#10214d]">{formatarNumero(metrics.efetivoAtivoCadastrado)}</span><span className="max-w-md text-xs leading-relaxed text-slate-600">Policiais cujo cadastro está marcado como <strong>EM ATIVIDADE</strong>. O sistema não dispõe, neste resumo, de registro confirmado de presença ou ausência no turno.</span></div>
            </section>}

            {metrics?.situacaoViaturas && <section className="rounded-2xl border border-blue-100 bg-gradient-to-br from-white to-[#f5f8ff] p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-2"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-sky-50 text-sky-600"><Car className="h-5 w-5" /></span><h3 className="font-extrabold text-[#101a43]">Situação das Viaturas</h3></div><button onClick={() => navigate("/viaturas")} className="inline-flex items-center gap-1 text-xs font-bold text-blue-600">Ver detalhes <ArrowRight className="h-3.5 w-3.5" /></button></div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[["Operacionais", metrics.situacaoViaturas.operacionais, "bg-emerald-500"], ["Baixadas", metrics.situacaoViaturas.baixadas, "bg-rose-500"], ["Em manutenção", metrics.situacaoViaturas.manutencao, "bg-slate-500"], ["Total cadastrado", metrics.situacaoViaturas.total, "bg-blue-500"]].map(([label, value, cor]) => <div key={label} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-3 shadow-sm"><span className="flex items-center gap-2 text-xs text-slate-700"><i className={`h-2.5 w-2.5 rounded-full ${cor}`} />{label}</span><strong className="text-lg text-slate-900">{formatarNumero(value)}</strong></div>)}
              </div>
            </section>}
          </div>

          {podeAlertas && <aside className="dashboard-alerts rounded-2xl border border-blue-100 bg-gradient-to-br from-white to-[#f5f8ff] p-4 shadow-sm sm:p-5">
            <div className="mb-3 flex items-center justify-between border-b border-blue-100 pb-3"><div className="flex items-center gap-2.5"><Bell className="h-6 w-6 text-blue-500" /><h3 className="text-lg font-extrabold text-[#101a43]">Alertas Recentes</h3></div><span className="text-[11px] text-slate-500">Da Central</span></div>
            {erroNotificacoes ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{erroNotificacoes}</div> : alertasRecentes.length ? <ul className="space-y-2">{alertasRecentes.map((item) => {
              const categoria = categoriaAlerta(item);
              const Icone = categoria === "orange" ? Clock3 : categoria === "pink" ? ArrowLeftRight : categoria === "blue" ? Car : Bell;
              return <li key={item.id}><button onClick={() => abrirNotificacao(item)} data-lida={Boolean(item.lida_em)} className={`dashboard-alert-card dashboard-alert-card--${categoria} flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left shadow-sm transition hover:-translate-y-px hover:shadow-md ${item.lida_em ? "border-slate-200 bg-white" : "border-blue-200 bg-blue-50/70"}`}>
                <span className={`dashboard-alert-icon dashboard-alert-icon--${categoria} mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl`}><Icone className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className={`truncate text-xs ${item.lida_em ? "font-semibold text-slate-700" : "font-extrabold text-slate-900"}`}>{item.tipo}</strong><time className="shrink-0 text-[10px] font-medium text-slate-600">{tempoRelativo(item.criado_em)}</time></span><span className="mt-1 block text-xs leading-relaxed text-slate-600">{item.descricao}</span><span className={`mt-1 inline-flex items-center gap-1 text-[10px] font-bold ${item.lida_em ? "text-slate-500" : "text-blue-700"}`}>{item.lida_em ? "Lida" : "Não lida"}<ArrowRight className="h-3 w-3" /></span></span>
              </button></li>;
            })}</ul> : <div className="flex min-h-44 flex-col items-center justify-center px-3 text-center"><CheckCircle2 className="mb-2 h-8 w-8 text-emerald-500" /><p className="text-sm font-bold text-slate-700">Nenhum alerta recente</p><p className="mt-1 text-xs text-slate-500">A Central não retornou avisos para este modo.</p></div>}
            <p className="mt-3 border-t border-blue-100 pt-3 text-[10px] text-slate-500">Abrir um aviso leva ao módulo correspondente. A leitura não é alterada por esta prévia.</p>
          </aside>}
        </div>
      </section>

    </div>
  );
}
