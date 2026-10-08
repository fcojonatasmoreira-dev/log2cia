import { useEffect, useMemo, useState } from "react";
import {
  FileText, Plus, Search, RefreshCw, Pencil, Trash2, X, Archive,
} from "lucide-react";
import { createOficio, deleteOficio, getOficios, updateOficio } from "../services/oficiosService";
import { getEstruturaArquivo } from "../services/arquivoService";

function hoje() { return new Date().toISOString().slice(0, 10); }
function formatarData(data) { if (!data) return "—"; const [ano, mes, dia] = data.split("-"); return `${dia}/${mes}/${ano}`; }
function formularioInicial() {
  return { data_oficio: hoje(), remetente: "", destinatario: "", assunto: "", referencia: "", descricao: "", anexos_nominais: [], pasta_id: "" };
}

export default function Oficios() {
  const [oficios, setOficios] = useState([]);
  const [proximoNumero, setProximoNumero] = useState(null);
  const [anoNumero, setAnoNumero] = useState(new Date().getFullYear());
  const [estrutura, setEstrutura] = useState({ estantes: [], colunas: [], pastas: [] });
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [dataFiltro, setDataFiltro] = useState("");
  const [estanteFiltro, setEstanteFiltro] = useState("");
  const [colunaFiltro, setColunaFiltro] = useState("");
  const [pastaFiltro, setPastaFiltro] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [oficioEmEdicao, setOficioEmEdicao] = useState(null);
  const [form, setForm] = useState(formularioInicial());
  const [anexoAtual, setAnexoAtual] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(null);
  const [usuario, setUsuario] = useState(null);

  useEffect(() => {
    try { const salvo = localStorage.getItem("log2cia_user"); if (salvo) setUsuario(JSON.parse(salvo)); } catch (e) { console.error(e); }
    carregarEstrutura();
  }, []);

  const carregarEstrutura = async () => {
    try { setEstrutura(await getEstruturaArquivo()); } catch (e) { setErro(e.message); }
  };

  const carregar = async () => {
    try {
      setLoading(true); setErro("");
      const resultado = await getOficios({ busca, data: dataFiltro, estante_id: estanteFiltro, coluna_id: colunaFiltro, pasta_id: pastaFiltro });
      setOficios(resultado.oficios || []); setProximoNumero(resultado.proximo_numero || null); setAnoNumero(resultado.ano_numero || new Date().getFullYear());
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const colunasForm = useMemo(() => estrutura.colunas.filter((c) => c.ativo && (!form.estante_id || c.estante_id === form.estante_id)), [estrutura.colunas, form.estante_id]);
  const pastasForm = useMemo(() => estrutura.pastas.filter((p) => p.ativo && (!form.coluna_id || p.coluna_id === form.coluna_id)), [estrutura.pastas, form.coluna_id]);
  const colunasFiltro = useMemo(() => estrutura.colunas.filter((c) => c.ativo && (!estanteFiltro || c.estante_id === estanteFiltro)), [estrutura.colunas, estanteFiltro]);
  const pastasFiltro = useMemo(() => estrutura.pastas.filter((p) => p.ativo && (!colunaFiltro || p.coluna_id === colunaFiltro)), [estrutura.pastas, colunaFiltro]);

  const meusOficios = useMemo(() => new Set(oficios.filter((item) => item.criado_por === usuario?.id).map((item) => item.id)), [oficios, usuario]);

  const abrirNovo = () => { setOficioEmEdicao(null); setForm(formularioInicial()); setAnexoAtual(""); setModalAberto(true); };
  const abrirEdicao = (oficio) => {
    if (!meusOficios.has(oficio.id)) return;
    setOficioEmEdicao(oficio);
    setForm({ data_oficio: oficio.data_oficio || hoje(), remetente: oficio.remetente || "", destinatario: oficio.destinatario || "", assunto: oficio.assunto || "", referencia: oficio.referencia || "", descricao: oficio.descricao || "", anexos_nominais: Array.isArray(oficio.anexos_nominais) ? oficio.anexos_nominais : [], pasta_id: oficio.pasta_id || "", estante_id: oficio.arquivo?.estante_id || "", coluna_id: oficio.arquivo?.coluna_id || "" });
    setAnexoAtual(""); setModalAberto(true);
  };
  const atualizarCampo = (campo, valor) => setForm((atual) => ({ ...atual, [campo]: valor }));

  const selecionarEstanteForm = (valor) => setForm((atual) => ({ ...atual, estante_id: valor, coluna_id: "", pasta_id: "" }));
  const selecionarColunaForm = (valor) => setForm((atual) => ({ ...atual, coluna_id: valor, pasta_id: "" }));

  const adicionarAnexo = () => { const valor = anexoAtual.trim(); if (!valor || form.anexos_nominais.includes(valor)) return; setForm((a) => ({ ...a, anexos_nominais: [...a.anexos_nominais, valor] })); setAnexoAtual(""); };
  const removerAnexo = (indice) => setForm((a) => ({ ...a, anexos_nominais: a.anexos_nominais.filter((_, i) => i !== indice) }));

  const salvar = async (event) => {
    event.preventDefault();
    if (!form.pasta_id) { setErro("Selecione Estante, Coluna e Pasta para arquivar o Ofício."); return; }
    setSalvando(true); setErro("");
    try { if (oficioEmEdicao) await updateOficio(oficioEmEdicao.id, form); else await createOficio(form); setModalAberto(false); await carregar(); }
    catch (e) { setErro(e.message); } finally { setSalvando(false); }
  };
  const excluir = async (oficio) => {
    if (!meusOficios.has(oficio.id)) return;
    if (!window.confirm(`Confirma a exclusão do Ofício ${oficio.numero}? O número ficará disponível novamente.`)) return;
    setExcluindo(oficio.id); setErro("");
    try { await deleteOficio(oficio.id); await carregar(); } catch (e) { setErro(e.message); } finally { setExcluindo(null); }
  };
  const limparFiltros = () => { setBusca(""); setDataFiltro(""); setEstanteFiltro(""); setColunaFiltro(""); setPastaFiltro(""); setTimeout(() => carregar(), 0); };
  const executarBusca = (e) => { e?.preventDefault(); carregar(); };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><FileText className="w-6 h-6 text-blue-600" />Ofícios</h1><p className="text-sm text-slate-500">Controle e arquivamento da correspondência oficial.</p></div>
        <div className="flex flex-wrap justify-end gap-2">{["master", "p1"].includes(String(usuario?.role || "").trim().toLowerCase()) && <button type="button" onClick={() => { window.location.href = "/gerenciamento-arquivo"; }} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-bold shadow-sm"><Archive className="w-4 h-4" /> Gerenciar Arquivo</button>}<button onClick={abrirNovo} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-sm"><Plus className="w-4 h-4" /> Novo Ofício</button></div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <form onSubmit={executarBusca} className="space-y-3">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Número, remetente, destinatário, assunto ou referência..." className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm" /></div>
            <input type="date" value={dataFiltro} onChange={(e) => setDataFiltro(e.target.value)} className="px-3 py-2.5 border border-slate-300 rounded-lg text-sm" />
            <button type="submit" className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-bold"><Search className="w-4 h-4" /> Buscar</button>
            <button type="button" onClick={limparFiltros} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold"><RefreshCw className="w-4 h-4" /> Limpar</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select value={estanteFiltro} onChange={(e) => { setEstanteFiltro(e.target.value); setColunaFiltro(""); setPastaFiltro(""); }} className="px-3 py-2.5 border border-slate-300 rounded-lg text-sm"><option value="">Todas as estantes</option>{estrutura.estantes.filter((e) => e.ativo).map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select>
            <select value={colunaFiltro} onChange={(e) => { setColunaFiltro(e.target.value); setPastaFiltro(""); }} className="px-3 py-2.5 border border-slate-300 rounded-lg text-sm"><option value="">Todas as colunas</option>{colunasFiltro.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
            <select value={pastaFiltro} onChange={(e) => setPastaFiltro(e.target.value)} className="px-3 py-2.5 border border-slate-300 rounded-lg text-sm"><option value="">Todas as pastas</option>{pastasFiltro.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
          </div>
        </form>
      </div>

      {erro && <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-4 py-3 text-sm">{erro}</div>}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"><div><h2 className="font-bold text-slate-800">Correspondências registradas</h2><p className="text-xs text-slate-500 mt-0.5">Próximo número disponível: {proximoNumero ? `${String(proximoNumero).padStart(3, "0")}/${anoNumero}` : "—"}</p></div><button type="button" onClick={carregar} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600" title="Atualizar"><RefreshCw className="w-4 h-4" /></button></div>
        {loading ? <div className="p-8 text-center text-sm text-slate-500">Carregando Ofícios...</div> : oficios.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">Nenhum Ofício encontrado.</div> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="text-left px-4 py-3 font-bold">Número</th><th className="text-left px-4 py-3 font-bold">Data</th><th className="text-left px-4 py-3 font-bold">Remetente</th><th className="text-left px-4 py-3 font-bold">Destinatário</th><th className="text-left px-4 py-3 font-bold">Assunto</th><th className="text-left px-4 py-3 font-bold">Arquivo</th><th className="text-right px-4 py-3 font-bold">Ações</th></tr></thead><tbody className="divide-y divide-slate-100">
            {oficios.map((oficio) => { const meu = meusOficios.has(oficio.id); return <tr key={oficio.id} className="hover:bg-slate-50"><td className="px-4 py-3 font-bold whitespace-nowrap">{oficio.numero}</td><td className="px-4 py-3 whitespace-nowrap">{formatarData(oficio.data_oficio)}</td><td className="px-4 py-3">{oficio.remetente}</td><td className="px-4 py-3">{oficio.destinatario}</td><td className="px-4 py-3 min-w-[220px]">{oficio.assunto}</td><td className="px-4 py-3 min-w-[200px]"><div className="flex items-start gap-1.5 text-slate-600"><Archive className="w-4 h-4 mt-0.5 shrink-0" /><span>{oficio.localizacao_arquivo || "Não informado"}</span></div></td><td className="px-4 py-3"><div className="flex justify-end gap-1">{meu && <><button type="button" onClick={() => abrirEdicao(oficio)} title="Editar meu Ofício" className="p-2 rounded-lg text-blue-600 hover:bg-blue-50"><Pencil className="w-4 h-4" /></button><button type="button" onClick={() => excluir(oficio)} disabled={excluindo === oficio.id} title="Excluir meu Ofício" className="p-2 rounded-lg text-rose-600 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button></>}</div></td></tr>; })}
          </tbody></table></div>
        )}
      </div>

      {modalAberto && <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"><div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto"><div className="flex items-center justify-between px-5 py-4 border-b border-slate-200"><div><h2 className="text-lg font-bold text-slate-800">{oficioEmEdicao ? `Editar Ofício ${oficioEmEdicao.numero}` : "Novo Ofício"}</h2><p className="text-xs text-slate-500 mt-0.5">O número é definido automaticamente pelo sistema.</p></div><button type="button" onClick={() => setModalAberto(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button></div>
        <form onSubmit={salvar} className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4"><label className="space-y-1.5"><span className="text-xs font-bold text-slate-700">Data *</span><input required type="date" value={form.data_oficio} onChange={(e) => atualizarCampo("data_oficio", e.target.value)} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm" /></label><div className="md:col-span-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5"><p className="text-xs text-blue-700 font-semibold">Numeração</p><p className="text-sm font-bold text-blue-900 mt-0.5">{oficioEmEdicao ? oficioEmEdicao.numero : `${String(proximoNumero || 1).padStart(3, "0")}/${(form.data_oficio || hoje()).slice(0, 4)}`}</p></div></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><label className="space-y-1.5"><span className="text-xs font-bold text-slate-700">Remetente *</span><input required value={form.remetente} onChange={(e) => atualizarCampo("remetente", e.target.value)} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm" /></label><label className="space-y-1.5"><span className="text-xs font-bold text-slate-700">Destinatário *</span><input required value={form.destinatario} onChange={(e) => atualizarCampo("destinatario", e.target.value)} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm" /></label></div>
          <label className="space-y-1.5 block"><span className="text-xs font-bold text-slate-700">Assunto *</span><input required value={form.assunto} onChange={(e) => atualizarCampo("assunto", e.target.value)} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm" /></label>
          <label className="space-y-1.5 block"><span className="text-xs font-bold text-slate-700">Referência</span><input value={form.referencia} onChange={(e) => atualizarCampo("referencia", e.target.value)} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm" /></label>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3"><div><p className="text-sm font-bold text-slate-800 flex items-center gap-2"><Archive className="w-4 h-4 text-blue-600" /> Localização do arquivo *</p><p className="text-xs text-slate-500 mt-1">Selecione onde o documento físico ficará arquivado.</p></div><div className="grid grid-cols-1 md:grid-cols-3 gap-3"><select required value={form.estante_id || ""} onChange={(e) => selecionarEstanteForm(e.target.value)} className="px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white"><option value="">Estante *</option>{estrutura.estantes.filter((e) => e.ativo).map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select><select required value={form.coluna_id || ""} onChange={(e) => selecionarColunaForm(e.target.value)} disabled={!form.estante_id} className="px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white disabled:bg-slate-100"><option value="">Coluna *</option>{colunasForm.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select><select required value={form.pasta_id || ""} onChange={(e) => atualizarCampo("pasta_id", e.target.value)} disabled={!form.coluna_id} className="px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white disabled:bg-slate-100"><option value="">Pasta *</option>{pastasForm.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div></div>

          <label className="space-y-1.5 block"><span className="text-xs font-bold text-slate-700">Descrição / Observação</span><textarea rows="3" value={form.descricao} onChange={(e) => atualizarCampo("descricao", e.target.value)} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm resize-y" /></label>
          <div className="space-y-2"><span className="text-xs font-bold text-slate-700">Anexos nominais <span className="font-normal text-slate-400">(somente identificação, sem upload)</span></span><input value={anexoAtual} onChange={(e) => setAnexoAtual(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionarAnexo(); } }} placeholder="Digite o nome do anexo e pressione Enter" className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm" />{form.anexos_nominais.length > 0 && <div className="space-y-1.5">{form.anexos_nominais.map((anexo, indice) => <div key={`${anexo}-${indice}`} className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm"><span className="text-slate-700">{anexo}</span><button type="button" onClick={() => removerAnexo(indice)} className="text-rose-600" title="Remover anexo nominal"><X className="w-4 h-4" /></button></div>)}</div>}</div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100"><button type="button" onClick={() => setModalAberto(false)} className="px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button><button disabled={salvando} type="submit" className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold disabled:opacity-50">{salvando ? "Salvando..." : oficioEmEdicao ? "Salvar alterações" : "Salvar Ofício"}</button></div>
        </form>
      </div></div>}
    </div>
  );
}
