import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Clock3, RefreshCw, Search, X } from "lucide-react";
import { listarBancoHoras, analisarSolicitacaoBancoHoras } from "../services/bancoHorasService";
import { getPoliciais } from "../services/policiaisService";

const dataLegivel = (valor) => {
  if (!valor) return "—";
  const [ano, mes, dia] = String(valor).slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
};
const dataHora = (valor) => valor ? new Date(valor).toLocaleString("pt-BR") : "—";
const horasLegiveis = (valor) => `${Number(valor || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} h`;
const statusLabel = (status) => ({ pendente: "Pendente", deferida: "Deferida", indeferida: "Indeferida" }[status] || status || "—");

export default function BancoHorasGestao() {
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [policiais, setPoliciais] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("pendente");
  const [selecionada, setSelecionada] = useState(null);
  const [parecer, setParecer] = useState("");
  const [processando, setProcessando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const [banco, efetivo] = await Promise.all([listarBancoHoras(), getPoliciais()]);
      setSolicitacoes(banco.solicitacoes || []);
      setPoliciais(efetivo || []);
    } catch (e) {
      setErro(e.message || "Não foi possível carregar as solicitações.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const policiaisPorId = useMemo(() => new Map(policiais.map((p) => [p.id, p])), [policiais]);
  const filtradas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return solicitacoes.filter((s) => {
      if (filtro !== "todas" && s.status !== filtro) return false;
      const p = policiaisPorId.get(s.policial_id);
      const texto = [p?.nome_guerra, p?.nome_completo, p?.matricula, s.numero_ocorrencia, s.justificativa].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
      return !termo || texto.includes(termo);
    });
  }, [solicitacoes, filtro, busca, policiaisPorId]);

  const abrirAnalise = (solicitacao) => {
    setSelecionada(solicitacao);
    setParecer("");
  };

  const concluirAnalise = async (status) => {
    if (!selecionada || processando) return;
    if (status === "indeferida" && !parecer.trim()) {
      alert("Informe o motivo do indeferimento.");
      return;
    }
    const confirmacao = status === "deferida"
      ? `Confirma o deferimento? ${selecionada.tipo === "dispensa" ? "Serão debitadas 12 horas do saldo." : `Serão creditadas ${horasLegiveis(selecionada.horas_solicitadas)}.`}`
      : "Confirma o indeferimento desta solicitação?";
    if (!window.confirm(confirmacao)) return;
    setProcessando(true);
    try {
      await analisarSolicitacaoBancoHoras(selecionada.id, status, parecer.trim());
      setSelecionada(null);
      await carregar();
    } catch (e) {
      alert(e.message || "Não foi possível concluir a análise.");
    } finally {
      setProcessando(false);
    }
  };

  const pendentes = solicitacoes.filter((s) => s.status === "pendente").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gestão do Banco de Horas</h1>
          <p className="text-xs text-slate-500 mt-1">Análise das solicitações de inclusão de horas e dispensa de serviço.</p>
        </div>
        <button onClick={carregar} disabled={carregando} className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${carregando ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs font-semibold text-slate-500">Solicitações</p><p className="text-2xl font-bold text-slate-900 mt-1">{solicitacoes.length}</p></div>
        <div className="bg-white border border-amber-200 rounded-xl p-4"><p className="text-xs font-semibold text-amber-700">Pendentes de análise</p><p className="text-2xl font-bold text-amber-700 mt-1">{pendentes}</p></div>
        <div className="bg-white border border-emerald-200 rounded-xl p-4"><p className="text-xs font-semibold text-emerald-700">Deferidas</p><p className="text-2xl font-bold text-emerald-700 mt-1">{solicitacoes.filter((s) => s.status === "deferida").length}</p></div>
      </div>

      {erro && <div className="flex gap-2 items-start p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{erro}</div>}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="relative flex-1 max-w-lg"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por policial, matrícula ou ocorrência..." className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" /></div>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white"><option value="pendente">Pendentes</option><option value="deferida">Deferidas</option><option value="indeferida">Indeferidas</option><option value="todas">Todas</option></select>
        </div>
        {carregando ? <div className="p-10 text-center text-sm text-slate-500">Carregando solicitações...</div> : filtradas.length === 0 ? <div className="p-10 text-center text-sm text-slate-500"><Clock3 className="w-8 h-8 mx-auto mb-2 text-slate-300" />Nenhuma solicitação encontrada.</div> : (
          <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-3">Policial</th><th className="px-4 py-3">Solicitação</th><th className="px-4 py-3">Serviço</th><th className="px-4 py-3">Horas</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Ação</th></tr></thead><tbody className="divide-y divide-slate-100">{filtradas.map((s) => { const p = policiaisPorId.get(s.policial_id); return <tr key={s.id} className="hover:bg-slate-50/70"><td className="px-4 py-3"><div className="font-semibold text-slate-800">{p?.nome_guerra || p?.nome_completo || "Policial não localizado"}</div><div className="text-xs text-slate-500">Matrícula: {p?.matricula || "—"}</div></td><td className="px-4 py-3"><div className="font-medium text-slate-700">{s.tipo === "dispensa" ? "Dispensa de serviço" : "Inclusão de horas"}</div>{s.numero_ocorrencia && <div className="text-xs text-slate-500">Ocorrência: {s.numero_ocorrencia}</div>}</td><td className="px-4 py-3 text-slate-600">{dataLegivel(s.data_servico)}<div className="text-xs text-slate-500">Turno {s.turno || "—"}</div></td><td className="px-4 py-3 font-semibold text-slate-700">{horasLegiveis(s.horas_solicitadas)}</td><td className="px-4 py-3"><span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold ${s.status === "pendente" ? "bg-amber-100 text-amber-800" : s.status === "deferida" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{statusLabel(s.status)}</span></td><td className="px-4 py-3 text-right">{s.status === "pendente" ? <button onClick={() => abrirAnalise(s)} className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold">Analisar</button> : <button onClick={() => abrirAnalise(s)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold">Detalhes</button>}</td></tr>; })}</tbody></table></div>
        )}
      </div>

      {selecionada && <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !processando) setSelecionada(null); }}><div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto"><div className="flex items-center justify-between p-5 border-b border-slate-100"><div><h2 className="text-lg font-bold text-slate-900">{selecionada.status === "pendente" ? "Analisar solicitação" : "Detalhes da solicitação"}</h2><p className="text-xs text-slate-500">{statusLabel(selecionada.status)} • Enviada em {dataHora(selecionada.created_at)}</p></div><button onClick={() => setSelecionada(null)} disabled={processando} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button></div><div className="p-5 space-y-4"><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><p className="text-[11px] uppercase font-bold text-slate-400">Policial</p><p className="text-sm font-semibold text-slate-800">{policiaisPorId.get(selecionada.policial_id)?.nome_guerra || policiaisPorId.get(selecionada.policial_id)?.nome_completo || "Não localizado"}</p></div><div><p className="text-[11px] uppercase font-bold text-slate-400">Matrícula</p><p className="text-sm text-slate-700">{policiaisPorId.get(selecionada.policial_id)?.matricula || "—"}</p></div><div><p className="text-[11px] uppercase font-bold text-slate-400">Tipo</p><p className="text-sm text-slate-700">{selecionada.tipo === "dispensa" ? "Dispensa de serviço" : "Inclusão de horas"}</p></div><div><p className="text-[11px] uppercase font-bold text-slate-400">Quantidade</p><p className="text-sm font-semibold text-slate-700">{horasLegiveis(selecionada.horas_solicitadas)}</p></div><div><p className="text-[11px] uppercase font-bold text-slate-400">Data e turno</p><p className="text-sm text-slate-700">{dataLegivel(selecionada.data_servico)} • Turno {selecionada.turno}</p></div><div><p className="text-[11px] uppercase font-bold text-slate-400">Referência da ocorrência</p><p className="text-sm text-slate-700">{selecionada.numero_ocorrencia || "—"}</p></div></div><div><p className="text-[11px] uppercase font-bold text-slate-400 mb-1">Justificativa</p><p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-xl p-3">{selecionada.justificativa || "—"}</p></div>{selecionada.status !== "pendente" ? <div><p className="text-[11px] uppercase font-bold text-slate-400 mb-1">Parecer</p><p className="text-sm text-slate-700 whitespace-pre-wrap">{selecionada.parecer || "Sem parecer registrado."}</p><p className="text-xs text-slate-400 mt-2">Analisada em: {dataHora(selecionada.analisada_em)}</p></div> : <><div><label className="block text-[11px] uppercase font-bold text-slate-500 mb-1">Parecer / observação (obrigatório para indeferir)</label><textarea value={parecer} onChange={(e) => setParecer(e.target.value)} rows={3} maxLength={2000} placeholder="Registre o parecer da análise..." className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-y" /></div><div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-xs text-blue-800">{selecionada.tipo === "dispensa" ? "Ao deferir, serão debitadas 12 horas do banco do policial. O saldo poderá ficar negativo." : `Ao deferir, serão creditadas ${horasLegiveis(selecionada.horas_solicitadas)} no banco do policial.`} A movimentação será vinculada à solicitação.</div><div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-1"><button onClick={() => concluirAnalise("indeferida")} disabled={processando} className="px-4 py-2.5 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-sm font-bold disabled:opacity-50"><X className="w-4 h-4 inline mr-1" /> Indeferir</button><button onClick={() => concluirAnalise("deferida")} disabled={processando} className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50"><Check className="w-4 h-4 inline mr-1" />{processando ? "Processando..." : "Deferir"}</button></div></>}</div></div></div>}
    </div>
  );
}
