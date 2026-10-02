import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Clock3, PlusCircle, RefreshCw, Send, Wallet } from "lucide-react";

const dataBR = (valor) => {
  if (!valor) return "—";
  const [ano, mes, dia] = String(valor).slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
};
const horasBR = (valor) => `${Number(valor || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} h`;
const statusLabel = (status) => ({ pendente: "Pendente", deferida: "Deferida", indeferida: "Indeferida" }[status] || status || "—");

export default function MeuBancoHoras() {
  const [dados, setDados] = useState({ saldo: 0, movimentacoes: [], solicitacoes: [] });
  const [tipo, setTipo] = useState("inclusao_horas");
  const [horas, setHoras] = useState("");
  const [dataServico, setDataServico] = useState("");
  const [turno, setTurno] = useState("A");
  const [ocorrencia, setOcorrencia] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const response = await fetch("/api/banco-horas", { credentials: "include" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Não foi possível carregar seu Banco de Horas.");
      setDados({ saldo: json.saldo || 0, movimentacoes: json.movimentacoes || [], solicitacoes: json.solicitacoes || [] });
    } catch (e) { setErro(e.message); }
    finally { setCarregando(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);
  const pendentes = useMemo(() => dados.solicitacoes.filter((s) => s.status === "pendente").length, [dados.solicitacoes]);

  const enviar = async (e) => {
    e.preventDefault(); setErro(""); setSucesso("");
    if (!dataServico || !turno || !justificativa.trim() || (tipo === "inclusao_horas" && (!Number.isFinite(Number(horas)) || Number(horas) <= 0 || !ocorrencia.trim()))) {
      setErro("Preencha a data, o turno, a justificativa e os dados da inclusão de horas."); return;
    }
    setEnviando(true);
    try {
      const response = await fetch("/api/banco-horas", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, horas_solicitadas: tipo === "dispensa" ? 12 : Number(horas), data_servico: dataServico, turno, numero_ocorrencia: tipo === "inclusao_horas" ? ocorrencia.trim() : null, justificativa: justificativa.trim() }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Não foi possível enviar a solicitação.");
      setSucesso("Solicitação enviada com sucesso. Ela ficará disponível para análise do P1.");
      setHoras(""); setDataServico(""); setTurno("A"); setOcorrencia(""); setJustificativa("");
      await carregar();
    } catch (e2) { setErro(e2.message); }
    finally { setEnviando(false); }
  };

  return <div className="space-y-5">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-slate-800">Meu Banco de Horas</h1><p className="text-sm text-slate-500">Consulte seu saldo, solicite inclusão de horas ou dispensa de serviço.</p></div>
      <button onClick={carregar} disabled={carregando} className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${carregando ? "animate-spin" : ""}`} /> Atualizar</button>
    </div>
    {erro && <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{erro}</div>}
    {sucesso && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{sucesso}</div>}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <section className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2"><PlusCircle className="w-5 h-5 text-blue-600"/><h2 className="font-bold text-slate-800">Nova solicitação</h2></div>
        <form onSubmit={enviar} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2"><label className="block text-xs font-bold uppercase text-slate-500 mb-1">Tipo de solicitação</label><select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white"><option value="inclusao_horas">Inclusão de horas</option><option value="dispensa">Dispensa de serviço (12h)</option></select></div>
          {tipo === "inclusao_horas" && <div><label className="block text-xs font-bold uppercase text-slate-500 mb-1">Quantidade de horas</label><input type="number" min="0.01" max="9999" step="0.01" required value={horas} onChange={(e) => setHoras(e.target.value)} placeholder="Ex.: 12" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" /></div>}
          <div><label className="block text-xs font-bold uppercase text-slate-500 mb-1">Data do serviço</label><input type="date" required value={dataServico} onChange={(e) => setDataServico(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" /></div>
          <div><label className="block text-xs font-bold uppercase text-slate-500 mb-1">Turno</label><select required value={turno} onChange={(e) => setTurno(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white"><option value="A">A (06h às 18h)</option><option value="B">B (18h às 06h)</option></select></div>
          {tipo === "inclusao_horas" && <div><label className="block text-xs font-bold uppercase text-slate-500 mb-1">Referência da ocorrência no livro</label><input required value={ocorrencia} onChange={(e) => setOcorrencia(e.target.value)} maxLength={200} placeholder="Data, turno e número da ocorrência" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" /></div>}
          <div className="sm:col-span-2"><label className="block text-xs font-bold uppercase text-slate-500 mb-1">Justificativa</label><textarea required rows={3} maxLength={1000} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="Descreva o motivo da solicitação..." className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm resize-y" /></div>
          <div className="sm:col-span-2 flex justify-end"><button type="submit" disabled={enviando || carregando} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"><Send className="w-4 h-4"/>{enviando ? "Enviando..." : "Enviar solicitação"}</button></div>
        </form>
        <p className="text-xs text-slate-500">A solicitação não altera seu saldo até ser deferida pelo P1.</p>
      </section>
      <section className="bg-slate-900 rounded-2xl p-5 text-white shadow-sm h-fit"><div className="flex items-center gap-2 text-slate-300 text-sm"><Wallet className="w-5 h-5"/> Saldo atual</div><div className="mt-3 text-3xl font-extrabold">{horasBR(dados.saldo)}</div><p className="mt-2 text-xs text-slate-400">{pendentes} solicitação(ões) pendente(s)</p></section>
    </div>
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"><div className="p-4 border-b border-slate-100 flex items-center gap-2"><Clock3 className="w-5 h-5 text-slate-500"/><h2 className="font-bold text-slate-800">Minhas solicitações</h2></div>{carregando ? <p className="p-5 text-sm text-slate-500">Carregando...</p> : dados.solicitacoes.length === 0 ? <p className="p-5 text-sm text-slate-500">Nenhuma solicitação enviada.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="text-left p-3">Data</th><th className="text-left p-3">Tipo</th><th className="text-left p-3">Referência</th><th className="text-left p-3">Horas</th><th className="text-left p-3">Status / parecer</th></tr></thead><tbody>{dados.solicitacoes.map((s) => <tr key={s.id} className="border-t border-slate-100"><td className="p-3 whitespace-nowrap">{dataBR(s.data_servico)}<div className="text-xs text-slate-500">Turno {s.turno}</div></td><td className="p-3">{s.tipo === "dispensa" ? "Dispensa" : "Inclusão de horas"}</td><td className="p-3">{s.numero_ocorrencia || "—"}</td><td className="p-3 whitespace-nowrap">{horasBR(s.horas_solicitadas)}</td><td className="p-3"><span className={`inline-flex px-2 py-1 rounded-lg text-xs font-bold ${s.status === "pendente" ? "bg-amber-100 text-amber-800" : s.status === "deferida" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{statusLabel(s.status)}</span>{s.parecer && <p className="text-xs text-slate-500 mt-1 max-w-xs whitespace-pre-wrap">{s.parecer}</p>}</td></tr>)}</tbody></table></div>}</section>
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"><div className="p-4 border-b border-slate-100 flex items-center gap-2"><Clock3 className="w-5 h-5 text-slate-500"/><h2 className="font-bold text-slate-800">Meu histórico de movimentações</h2></div>{carregando ? <p className="p-5 text-sm text-slate-500">Carregando...</p> : dados.movimentacoes.length === 0 ? <p className="p-5 text-sm text-slate-500">Nenhuma movimentação registrada.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="text-left p-3">Data</th><th className="text-left p-3">Tipo</th><th className="text-left p-3">Descrição</th><th className="text-right p-3">Horas</th></tr></thead><tbody>{dados.movimentacoes.map((m) => <tr key={m.id} className="border-t border-slate-100"><td className="p-3 whitespace-nowrap">{dataBR(m.data_referencia || m.created_at)}</td><td className="p-3">{m.tipo === "credito" ? "Crédito" : m.descricao?.toLowerCase().includes("dispensa") ? "Dispensa" : m.tipo === "ajuste_zeragem" ? "Ajuste" : "Débito"}</td><td className="p-3">{m.descricao || "—"}{m.turno ? ` • Turno ${m.turno}` : ""}</td><td className={`p-3 text-right font-bold whitespace-nowrap ${m.tipo === "credito" ? "text-emerald-700" : "text-rose-700"}`}>{m.tipo === "credito" ? "+" : "−"}{horasBR(m.horas)}</td></tr>)}</tbody></table></div>}</section>
  </div>;
}
