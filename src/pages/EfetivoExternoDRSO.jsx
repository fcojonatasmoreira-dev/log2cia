import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search, RefreshCw, Pencil, Power, History, X, Save, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

const vazio = { nome_completo:"", nome_guerra:"", matricula:"", numeral:"", posto_graduacao:"Soldado", unidade_origem:"", tipo:"policial" };
const dataBR = (v) => v ? String(v).slice(0,10).split("-").reverse().join("/") : "—";
const horaBR = (v) => String(v || "").slice(0,5);
async function requisitar(body) {
  const response = await fetch("/api/drso", { method:"POST", headers:{"Content-Type":"application/json"}, credentials:"include", body:JSON.stringify(body) });
  const json = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(json.error || json.message || "Não foi possível concluir a operação.");
  return json;
}
export default function EfetivoExternoDRSO() {
  const [policiais,setPoliciais]=useState([]);
  const [carregando,setCarregando]=useState(true);
  const [erro,setErro]=useState("");
  const [sucesso,setSucesso]=useState("");
  const [busca,setBusca]=useState("");
  const [selecionado,setSelecionado]=useState(null);
  const [form,setForm]=useState(vazio);
  const [salvando,setSalvando]=useState(false);
  const [historicoId,setHistoricoId]=useState("");
  const carregar=useCallback(async()=>{
    setCarregando(true);setErro("");
    try{const r=await requisitar({acao:"listar_policiais_externos"});setPoliciais(r.policiais_externos||[]);}
    catch(e){setErro(e.message);}
    finally{setCarregando(false);}
  },[]);
  useEffect(()=>{carregar();},[carregar]);
  const filtrados=useMemo(()=>{
    const termo=busca.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
    return policiais.filter(p=>!termo||[p.nome_completo,p.nome_guerra,p.matricula,p.numeral,p.unidade_origem,p.posto_graduacao].some(v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().includes(termo)));
  },[policiais,busca]);
  const editar=(p)=>{setSelecionado(p);setForm({nome_completo:p.nome_completo||"",nome_guerra:p.nome_guerra||"",matricula:p.matricula||"",numeral:p.numeral||"",posto_graduacao:p.posto_graduacao||"Soldado",unidade_origem:p.unidade_origem||"",tipo:p.tipo||"policial"});setErro("");setSucesso("");};
  const salvar=async(e)=>{e.preventDefault();if(!selecionado)return;setSalvando(true);setErro("");setSucesso("");try{await requisitar({acao:"editar_policial_externo",policial_id:selecionado.id,...form});setSucesso("Cadastro atualizado.");setSelecionado(null);await carregar();}catch(e){setErro(e.message);}finally{setSalvando(false);}};
  const alternar=async(p)=>{const acao=p.ativo?"desativar":"ativar";if(!confirm(`${p.ativo?"Desativar":"Ativar"} o acesso de ${p.nome_guerra}?${p.ativo?" O histórico será preservado e a conta não poderá mais entrar.":""}`))return;setErro("");setSucesso("");try{await requisitar({acao:"alternar_policial_externo",policial_id:p.id});setSucesso(`Acesso ${p.ativo?"desativado":"ativado"}. O histórico foi preservado.`);await carregar();}catch(e){setErro(e.message);}};
  const excluir=async(p)=>{if(!confirm(`Excluir definitivamente o cadastro de ${p.nome_guerra}? Essa opção só é permitida se não houver histórico de DRSO.`))return;setErro("");setSucesso("");try{await requisitar({acao:"excluir_policial_externo",policial_id:p.id});setSucesso("Cadastro excluído.");await carregar();}catch(e){setErro(e.message);}};
  const fmtHoras=(n)=>`${Number(n||0).toLocaleString("pt-BR",{maximumFractionDigits:1})} h`;
  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><div className="mb-2"><Link to="/drso" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:underline"><ArrowLeft className="h-4 w-4"/>Voltar para DRSO</Link></div><h1 className="text-2xl font-bold text-slate-800">Efetivo externo DRSO</h1><p className="text-sm text-slate-500">Gerencie cadastros, acessos, histórico de escalas e horas confirmadas.</p></div>
      <button onClick={carregar} disabled={carregando} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${carregando?"animate-spin":""}`}/>Atualizar</button>
    </div>
    {erro&&<div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{erro}</div>}
    {sucesso&&<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{sucesso}</div>}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">Cadastros</p><p className="mt-1 text-2xl font-bold">{policiais.length}</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">Acessos ativos</p><p className="mt-1 text-2xl font-bold">{policiais.filter(p=>p.ativo).length}</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">Horas oficiais somadas</p><p className="mt-1 text-2xl font-bold">{fmtHoras(policiais.reduce((s,p)=>s+Number(p.horas_confirmadas||0),0))}</p></div>
    </div>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-slate-800">Policiais externos cadastrados</h2><p className="text-xs text-slate-500">Desativar preserva o histórico e bloqueia novos acessos.</p></div><label className="relative block w-full sm:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar nome, matrícula, numeral ou unidade" className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500"/></label></div>
      {carregando?<p className="p-6 text-sm text-slate-500">Carregando efetivo externo...</p>:filtrados.length===0?<p className="p-6 text-sm text-slate-500">Nenhum policial externo encontrado.</p>:
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Policial</th><th className="p-3">Unidade de origem</th><th className="p-3">Tipo</th><th className="p-3">Horas oficiais</th><th className="p-3">Acesso</th><th className="p-3">Ações</th></tr></thead><tbody className="divide-y divide-slate-100">{filtrados.map(p=><tr key={p.id} className="align-top"><td className="p-3"><div className="font-semibold text-slate-800">{p.posto_graduacao} {p.numeral||""} {p.nome_guerra}</div><div className="text-xs text-slate-500">{p.nome_completo} · Mat. {p.matricula}</div></td><td className="p-3">{p.unidade_origem}</td><td className="p-3">{p.tipo==="oficial"?"Oficial":"Policial"}</td><td className="p-3 font-semibold">{fmtHoras(p.horas_confirmadas)}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${p.ativo?"bg-emerald-100 text-emerald-700":"bg-slate-100 text-slate-500"}`}>{p.ativo?"Ativo":"Inativo"}</span><div className="mt-1 text-xs text-slate-400">{p.primeiro_acesso?"Aguardando primeiro acesso":"Senha já alterada"}</div></td><td className="p-3"><div className="flex flex-wrap gap-2"><button onClick={()=>setHistoricoId(historicoId===p.id?"":p.id)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold"><History className="h-3.5 w-3.5"/>Histórico</button><button onClick={()=>editar(p)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold"><Pencil className="h-3.5 w-3.5"/>Editar</button><button onClick={()=>alternar(p)} className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold ${p.ativo?"border-rose-200 text-rose-700":"border-emerald-200 text-emerald-700"}`}><Power className="h-3.5 w-3.5"/>{p.ativo?"Desativar":"Ativar"}</button>{!p.historico?.length&&<button onClick={()=>excluir(p)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1.5 text-xs font-semibold text-rose-700"><Trash2 className="h-3.5 w-3.5"/>Excluir</button>}</div></td></tr>)}
      </tbody></table></div>}
      {filtrados.filter(p=>historicoId===p.id).map(p=><div key={p.id} className="border-t border-blue-100 bg-blue-50/50 p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-bold">Histórico de DRSO — {p.nome_guerra}</h3><button onClick={()=>setHistoricoId("")} className="text-xs font-semibold text-slate-500">Fechar</button></div><p className="mb-3 text-sm">Horas confirmadas: <strong>{fmtHoras(p.horas_confirmadas)}</strong></p>{!p.historico?.length?<p className="text-sm text-slate-500">Nenhuma participação registrada.</p>:<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="text-xs uppercase text-slate-500"><th className="p-2">Data</th><th className="p-2">Horário</th><th className="p-2">Local</th><th className="p-2">Função</th><th className="p-2">Situação</th><th className="p-2">Horas</th></tr></thead><tbody>{p.historico.map(v=>{const e=v.escala;let min=(Number(String(e.horario_fim).slice(0,2))*60+Number(String(e.horario_fim).slice(3,5)))-(Number(String(e.horario_inicio).slice(0,2))*60+Number(String(e.horario_inicio).slice(3,5)));if(min<=0)min+=1440;const conta=e.status==="fechada"&&v.status==="selecionado";return <tr key={v.id} className="border-t border-slate-200"><td className="p-2">{dataBR(e.data_servico)}</td><td className="p-2">{horaBR(e.horario_inicio)}–{horaBR(e.horario_fim)}</td><td className="p-2">{e.local||"—"}</td><td className="p-2">{v.funcao||"—"}</td><td className="p-2">{e.status==="fechada"?(v.status==="selecionado"?"Confirmada":v.status):e.status==="aberta"?"Pré-escala":"Cancelada"}</td><td className="p-2">{conta?fmtHoras(min/60):"—"}</td></tr>})}</tbody></table></div>}</div>)}
    </section>
    {selecionado&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={salvar} className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Editar policial externo</h2><button type="button" onClick={()=>setSelecionado(null)}><X className="h-5 w-5"/></button></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{[["nome_completo","Nome completo"],["nome_guerra","Nome de guerra"],["matricula","Matrícula"],["numeral","Numeral"],["posto_graduacao","Posto/graduação"],["unidade_origem","Unidade de origem"]].map(([k,label])=><label key={k} className="text-sm font-medium text-slate-700">{label}<input required={k!=="numeral"} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"/></label>)}<label className="text-sm font-medium text-slate-700">Tipo<select value={form.tipo} onChange={e=>setForm({...form,tipo:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"><option value="policial">Policial</option><option value="oficial">Oficial</option></select></label></div><div className="flex justify-end gap-2"><button type="button" onClick={()=>setSelecionado(null)} className="rounded-xl border px-4 py-2 text-sm">Cancelar</button><button disabled={salvando} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4"/>{salvando?"Salvando...":"Salvar alterações"}</button></div></form></div>}
  </div>;
}
