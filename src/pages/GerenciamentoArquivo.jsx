import { useEffect, useMemo, useState } from "react";
import { Archive, Plus, Pencil, RefreshCw } from "lucide-react";
import { criarItemArquivo, atualizarItemArquivo, getEstruturaArquivo } from "../services/arquivoService";

export default function GerenciamentoArquivo() {
  const [estrutura, setEstrutura] = useState({ estantes: [], colunas: [], pastas: [] });
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [modal, setModal] = useState(null);
  const [nome, setNome] = useState("");
  const [pai, setPai] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    try { setCarregando(true); setErro(""); setEstrutura(await getEstruturaArquivo()); }
    catch (e) { setErro(e.message); }
    finally { setCarregando(false); }
  };
  useEffect(() => { carregar(); }, []);

  const colunasAtivas = useMemo(() => estrutura.colunas.filter((c) => c.ativo), [estrutura.colunas]);
  const pastasAtivas = useMemo(() => estrutura.pastas.filter((p) => p.ativo), [estrutura.pastas]);

  const abrirNovo = (tipo, parentId = "") => { setModal({ tipo }); setNome(""); setPai(parentId); };
  const abrirEdicao = (tipo, item) => { setModal({ tipo, id: item.id }); setNome(item.nome); setPai(tipo === "coluna" ? item.estante_id : tipo === "pasta" ? item.coluna_id : ""); };

  const salvar = async (e) => {
    e.preventDefault(); if (!nome.trim()) return;
    setSalvando(true); setErro("");
    try {
      if (modal.id) await atualizarItemArquivo(modal.tipo, modal.id, { nome: nome.trim() });
      else await criarItemArquivo(modal.tipo, nome.trim(), pai || null);
      setModal(null); await carregar();
    } catch (e2) { setErro(e2.message); } finally { setSalvando(false); }
  };

  const alternar = async (tipo, item) => {
    try { await atualizarItemArquivo(tipo, item.id, { ativo: !item.ativo }); await carregar(); }
    catch (e) { setErro(e.message); }
  };

  const nomeTipo = modal?.tipo === "estante" ? "Estante" : modal?.tipo === "coluna" ? "Coluna" : "Pasta";

  return <div className="space-y-5">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Archive className="w-6 h-6 text-blue-600" />Gerenciamento do Arquivo</h1><p className="text-sm text-slate-500">Estrutura física utilizada para arquivar e localizar os Ofícios.</p></div><button onClick={carregar} className="inline-flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg text-sm font-semibold"><RefreshCw className="w-4 h-4" /> Atualizar</button></div>
    {erro && <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-4 py-3 text-sm">{erro}</div>}
    {carregando ? <div className="bg-white rounded-xl border p-8 text-center text-sm text-slate-500">Carregando estrutura...</div> : <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4"><div className="flex items-center justify-between gap-3"><div><h2 className="font-bold text-slate-800">Estantes</h2><p className="text-xs text-slate-500">Crie e organize as estantes físicas.</p></div><button onClick={() => abrirNovo("estante")} className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold"><Plus className="w-4 h-4" /> Nova Estante</button></div></div>
      {estrutura.estantes.length === 0 ? <div className="bg-white rounded-xl border p-8 text-center text-sm text-slate-500">Nenhuma estante cadastrada.</div> : estrutura.estantes.map((estante) => {
        const colunas = estrutura.colunas.filter((c) => c.estante_id === estante.id);
        return <div key={estante.id} className={`bg-white rounded-xl border shadow-sm p-4 ${!estante.ativo ? "opacity-60" : ""}`}><div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"><div><h2 className="font-bold text-slate-800">{estante.nome}</h2><p className="text-xs text-slate-500">{colunas.length} coluna(s)</p></div><div className="flex gap-2"><button onClick={() => abrirNovo("coluna", estante.id)} disabled={!estante.ativo} className="inline-flex items-center gap-1 px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold disabled:opacity-40"><Plus className="w-3.5 h-3.5" /> Coluna</button><button onClick={() => abrirEdicao("estante", estante)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"><Pencil className="w-4 h-4" /></button><button onClick={() => alternar("estante", estante)} className="px-3 py-2 text-xs font-semibold border rounded-lg">{estante.ativo ? "Desativar" : "Ativar"}</button></div></div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">{colunas.map((coluna) => { const pastas = estrutura.pastas.filter((p) => p.coluna_id === coluna.id); return <div key={coluna.id} className={`border border-slate-200 rounded-lg p-3 bg-slate-50 ${!coluna.ativo ? "opacity-60" : ""}`}><div className="flex items-center justify-between gap-2"><div><p className="font-bold text-sm text-slate-800">{coluna.nome}</p><p className="text-[11px] text-slate-500">{pastas.length} pasta(s)</p></div><div className="flex gap-1"><button onClick={() => abrirNovo("pasta", coluna.id)} disabled={!coluna.ativo} className="p-1.5 text-blue-600 hover:bg-blue-100 rounded disabled:opacity-40"><Plus className="w-4 h-4" /></button><button onClick={() => abrirEdicao("coluna", coluna)} className="p-1.5 text-blue-600 hover:bg-blue-100 rounded"><Pencil className="w-4 h-4" /></button><button onClick={() => alternar("coluna", coluna)} className="px-2 py-1 text-[10px] border rounded">{coluna.ativo ? "Desativar" : "Ativar"}</button></div></div><div className="mt-2 flex flex-wrap gap-1.5">{pastas.map((pasta) => <div key={pasta.id} className={`inline-flex items-center gap-1 bg-white border border-slate-200 rounded px-2 py-1 text-xs ${!pasta.ativo ? "opacity-50" : ""}`}><span>{pasta.nome}</span><button onClick={() => abrirEdicao("pasta", pasta)} className="text-blue-600"><Pencil className="w-3 h-3" /></button></div>)}{pastas.length === 0 && <span className="text-xs text-slate-400">Nenhuma pasta.</span>}</div></div>; })}</div>
        </div>;
      })}
    </div>}

    {modal && <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"><form onSubmit={salvar} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4"><div className="flex items-center justify-between"><h2 className="font-bold text-slate-800">{modal.id ? `Editar ${nomeTipo}` : `Nova ${nomeTipo}`}</h2><button type="button" onClick={() => setModal(null)} className="text-slate-500">✕</button></div><label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700">Nome *</span><input autoFocus required value={nome} onChange={(e) => setNome(e.target.value)} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm" placeholder={`Ex.: ${nomeTipo} 1`} /></label>{!modal.id && modal.tipo === "coluna" && <p className="text-xs text-slate-500">A coluna será criada dentro da estante selecionada.</p>}{!modal.id && modal.tipo === "pasta" && <p className="text-xs text-slate-500">A pasta será criada dentro da coluna selecionada.</p>}<div className="flex justify-end gap-2 pt-2 border-t"><button type="button" onClick={() => setModal(null)} className="px-4 py-2.5 border rounded-lg text-sm font-semibold">Cancelar</button><button disabled={salvando} className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold">{salvando ? "Salvando..." : "Salvar"}</button></div></form></div>}
  </div>;
}
