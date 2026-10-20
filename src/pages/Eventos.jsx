import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, CalendarDays, RefreshCw, Send, Trash2 } from "lucide-react";
import { atualizarEvento, comentarEvento, excluirEvento, listarSolicitacoesEventos, registrarOficioExternoEvento } from "../services/eventosService";
import { getEstruturaArquivo } from "../services/arquivoService";

const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
const dataHora = (valor) => valor ? new Date(valor).toLocaleString("pt-BR") : "—";

function arquivoComoDataUrl(file) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve({ nome: file.name, conteudo: leitor.result });
    leitor.onerror = () => reject(new Error("Não foi possível ler o PDF selecionado."));
    leitor.readAsDataURL(file);
  });
}

export default function Eventos({ user }) {
  const role = String(user?.role || "").trim().toLowerCase();
  const podeP1 = role === "master" || role === "p1";
  const podeComentar = role === "master" || role === "oficial";
  const podeExcluir = role === "master";
  const [eventos, setEventos] = useState([]);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [equipes, setEquipes] = useState({});
  const [opoNumeros, setOpoNumeros] = useState({});
  const [opoArquivos, setOpoArquivos] = useState({});
  const [comentarios, setComentarios] = useState({});
  const [estrutura, setEstrutura] = useState({ estantes: [], colunas: [], pastas: [] });
  const [formulariosArquivo, setFormulariosArquivo] = useState({});
  const [mostrarArquivados, setMostrarArquivados] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const resultado = await listarSolicitacoesEventos();
      setEventos(resultado.eventos || []);
      setEquipes(Object.fromEntries((resultado.eventos || []).map((item) => [item.id, item.equipe_responsavel || ""])));
      setOpoNumeros(Object.fromEntries((resultado.eventos || []).map((item) => [item.id, item.opo_numero || ""])));
    } catch (e) { setErro(e.message); }
    finally { setCarregando(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    getEstruturaArquivo().then(setEstrutura).catch((e) => setErro(e.message));
  }, []);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return eventos.filter((item) => Boolean(item.arquivado_em) === mostrarArquivados
      && (!termo || [item.protocolo, item.nome_evento, item.tipo_evento, item.responsavel_nome, item.equipe_responsavel, item.endereco, item.referencia].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR").includes(termo)));
  }, [eventos, busca, mostrarArquivados]);

  async function executar(id, mensagem, operacao) {
    setErro(""); setSucesso(""); setSalvando(id);
    try { const retorno = await operacao(); await carregar(); setSucesso(typeof retorno === "string" ? retorno : mensagem); }
    catch (e) { setErro(e.message); }
    finally { setSalvando(""); }
  }

  function atualizar() {
    setErro("");
    carregar();
  }

  async function salvarOpo(evento) {
    const arquivo = opoArquivos[evento.id];
    if (arquivo && arquivo.size > 2_600_000) { setErro("O PDF da OPO deve ter até 2,6 MB."); return; }
    await executar(evento.id, "Dados da OPO atualizados.", async () => atualizarEvento("opo", {
      evento_id: evento.id,
      opo_numero: opoNumeros[evento.id] || "",
      opo_pdf: arquivo ? await arquivoComoDataUrl(arquivo) : null,
    }));
  }

  async function enviarComentario(evento, formEvent) {
    formEvent.preventDefault();
    const conteudo = comentarios[evento.id] || "";
    await executar(evento.id, "Comentário registrado para consulta do P1.", async () => {
      await comentarEvento({ evento_id: evento.id, conteudo });
      setComentarios((atual) => ({ ...atual, [evento.id]: "" }));
    });
  }

  async function arquivar(evento, arquivado) {
    const acao = arquivado ? "retirar da lista principal" : "restaurar para a lista principal";
    if (!window.confirm(`Deseja ${acao} a solicitação ${evento.protocolo || evento.nome_evento}?`)) return;
    await executar(evento.id, arquivado ? "Solicitação arquivada." : "Solicitação restaurada.", () => atualizarEvento("arquivar", { evento_id: evento.id, arquivado }));
  }

  async function excluir(evento) {
    if (!window.confirm(`Excluir definitivamente a solicitação ${evento.protocolo || evento.nome_evento} e seus anexos? Essa ação não pode ser desfeita. Solicitações ligadas a Ofício oficial serão preservadas.`)) return;
    await executar(evento.id, "Solicitação excluída.", async () => {
      const resultado = await excluirEvento({ evento_id: evento.id });
      return resultado.aviso || undefined;
    });
  }

  function pastasDaEstante(evento) {
    const colunasIds = new Set(estrutura.colunas.filter((item) => item.ativo && item.estante_id === evento.estante_id).map((item) => item.id));
    return estrutura.pastas.filter((item) => item.ativo && colunasIds.has(item.coluna_id));
  }

  function atualizarFormularioArquivo(evento, alteracoes) {
    setFormulariosArquivo((atual) => ({
      ...atual,
      [evento.id]: { data_oficio: new Date().toISOString().slice(0, 10), ...(atual[evento.id] || {}), ...alteracoes },
    }));
  }

  async function arquivarComoOficioExterno(evento, formEvent) {
    formEvent.preventDefault();
    const dados = formulariosArquivo[evento.id] || {};
    await executar(evento.id, "Solicitação registrada como Ofício externo.", () => registrarOficioExternoEvento({
      evento_id: evento.id,
      data_oficio: dados.data_oficio,
      remetente: dados.remetente,
      destinatario: dados.destinatario,
      assunto: dados.assunto,
      referencia: dados.referencia,
      descricao: dados.descricao,
      anexos_nominais: [],
      pasta_id: dados.pasta_id,
    }));
  }

  return <main className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">Solicitações de eventos</h1><p className="text-sm text-slate-600">Consulta e acompanhamento das solicitações recebidas.</p></div><button type="button" onClick={atualizar} disabled={carregando} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><RefreshCw className="h-4 w-4"/>Atualizar</button></header>
    {erro && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{erro}</p>}{sucesso && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{sucesso}</p>}
    <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-semibold text-slate-800">Recebimento externo</h2><p className="mt-1 text-sm text-slate-600">Os QR Codes são gerados e gerenciados em cada estante autorizada, no Gerenciamento do Arquivo.</p></section>
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-bold text-slate-900">{mostrarArquivados ? "Solicitações arquivadas" : "Fila de solicitações"}</h2><p className="text-xs text-slate-500">{filtrados.length} solicitação(ões)</p></div><div className="flex flex-wrap items-end gap-3"><label className="grid gap-1 text-xs font-medium text-slate-600">Pesquisar<input value={busca} onChange={(e) => setBusca(e.target.value)} className={inputClass} placeholder="Evento, responsável, equipe ou local"/></label><button type="button" onClick={() => setMostrarArquivados((atual) => !atual)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold">{mostrarArquivados ? "Ver ativas" : "Ver arquivadas"}</button></div></div>
      {carregando ? <p className="p-4 text-sm text-slate-500">Carregando solicitações…</p> : filtrados.length === 0 ? <p className="p-4 text-sm text-slate-500">Nenhuma solicitação encontrada.</p> : <div className="divide-y divide-slate-200">{filtrados.map((evento) => <details key={evento.id} className="py-3"><summary className="cursor-pointer list-inside"><span className="font-semibold text-slate-900">{evento.protocolo ? `Evento ${evento.protocolo}` : evento.nome_evento} · {evento.nome_evento}</span><span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{evento.arquivado_em ? "Arquivada" : "Pendente"}</span>{evento.numero_oficio_registrado && <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">Ofício externo {evento.numero_oficio_registrado}</span>}<span className="mt-1 block pl-5 text-xs text-slate-600">{evento.tipo_evento} · {dataHora(evento.data_hora_inicio)} · {evento.endereco || evento.referencia || "Localização no mapa"}</span></summary>
        <article className="mt-3 space-y-4 rounded-lg bg-slate-50 p-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2"><p><strong>Responsável:</strong> {evento.responsavel_nome}</p><p><strong>Telefone/WhatsApp:</strong> {evento.responsavel_telefone || evento.responsavel_contato}</p><p><strong>E-mail:</strong> {evento.responsavel_email || "Não informado"}</p><p><strong>Início:</strong> {dataHora(evento.data_hora_inicio)}</p><p><strong>Término:</strong> {dataHora(evento.data_hora_fim)}</p><p><strong>Endereço:</strong> {evento.endereco || "Não informado"}</p><p><strong>Referência:</strong> {evento.referencia || "Não informada"}</p></div>
          {evento.latitude != null && evento.longitude != null && <a className="text-blue-700 underline" href={`https://www.openstreetmap.org/?mlat=${evento.latitude}&mlon=${evento.longitude}#map=16/${evento.latitude}/${evento.longitude}`} target="_blank" rel="noreferrer">Ver localização no mapa</a>}
          <p className="whitespace-pre-wrap"><strong>Descrição:</strong> {evento.descricao}</p>{evento.atracoes && <p className="whitespace-pre-wrap"><strong>Atrações:</strong> {evento.atracoes}</p>}
          <div className="flex flex-wrap gap-3">{(evento.anexos || []).length ? evento.anexos.map((anexo) => <a key={anexo.id} href={anexo.url} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 underline">{anexo.nome || "Abrir anexo"}</a>) : evento.oficio_url && <a href={evento.oficio_url} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 underline">Abrir ofício anexado</a>}{evento.opo_pdf_url && <a href={evento.opo_pdf_url} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 underline">Abrir PDF da OPO</a>}</div>
          <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">{podeP1 && <button type="button" disabled={salvando === evento.id} onClick={() => arquivar(evento, !evento.arquivado_em)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold"><Archive className="h-4 w-4"/>{evento.arquivado_em ? "Restaurar solicitação" : "Arquivar solicitação"}</button>}{podeExcluir && <button type="button" disabled={salvando === evento.id} onClick={() => excluir(evento)} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800"><Trash2 className="h-4 w-4"/>Excluir solicitação</button>}</div>
          <p><strong>Equipe indicada:</strong> {evento.equipe_responsavel || "Ainda não indicada"}</p>
          {podeP1 && <div className="grid gap-2 sm:grid-cols-[1fr_auto]"><label className="grid gap-1 text-xs font-medium">Indicar equipe responsável<input maxLength="160" value={equipes[evento.id] || ""} onChange={(e) => setEquipes((atual) => ({ ...atual, [evento.id]: e.target.value }))} className={inputClass} placeholder="Informe a designação definida pelo P1"/></label><button type="button" disabled={salvando === evento.id || !(equipes[evento.id] || "").trim()} onClick={() => executar(evento.id, "Equipe indicada.", () => atualizarEvento("equipe", { evento_id: evento.id, equipe_responsavel: equipes[evento.id] }))} className="self-end rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Registrar equipe</button><p className="text-xs text-slate-500 sm:col-span-2">O direcionamento fica registrado; acesso de integrantes não está habilitado nesta etapa.</p></div>}
          {podeP1 && <div className="grid gap-2 sm:grid-cols-[minmax(150px,0.6fr)_1fr_auto]"><label className="grid gap-1 text-xs font-medium">Número da OPO (opcional)<input maxLength="100" value={opoNumeros[evento.id] || ""} onChange={(e) => setOpoNumeros((atual) => ({ ...atual, [evento.id]: e.target.value }))} className={inputClass}/></label><label className="grid gap-1 text-xs font-medium">PDF da OPO (opcional)<input type="file" accept="application/pdf,.pdf" onChange={(e) => setOpoArquivos((atual) => ({ ...atual, [evento.id]: e.target.files?.[0] || null }))} className={inputClass}/></label><button type="button" disabled={salvando === evento.id || (!(opoNumeros[evento.id] || "").trim() && !opoArquivos[evento.id])} onClick={() => salvarOpo(evento)} className="self-end rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50">Salvar OPO</button></div>}
          {evento.estante_nome && <p><strong>Estante de recebimento:</strong> {evento.estante_nome}</p>}
          {evento.numero_oficio_registrado ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Registrada manualmente como Ofício externo {evento.numero_oficio_registrado}. O documento original permanece vinculado à solicitação e é acessado no Arquivo por URL assinada.</p> : podeP1 && evento.estante_id ? <details className="rounded-lg border border-blue-200 bg-blue-50 p-3"><summary className="cursor-pointer text-sm font-semibold text-blue-900">Registrar como Ofício externo</summary><form onSubmit={(e) => arquivarComoOficioExterno(evento, e)} className="mt-3 grid gap-3 sm:grid-cols-2"><p className="text-xs text-blue-800 sm:col-span-2">Esta ação cria um único registro no Arquivo, usa a numeração automática existente e mantém o PDF já anexado à solicitação, sem duplicar o arquivo. Selecione a pasta da estante de recebimento e transcreva os dados oficiais do documento.</p><label className="grid gap-1 text-xs font-medium">Data do Ofício *<input required type="date" value={(formulariosArquivo[evento.id] || {}).data_oficio || new Date().toISOString().slice(0, 10)} onChange={(e) => atualizarFormularioArquivo(evento, { data_oficio: e.target.value })} className={inputClass}/></label><label className="grid gap-1 text-xs font-medium">Pasta na estante {evento.estante_nome || "de recebimento"} *<select required value={(formulariosArquivo[evento.id] || {}).pasta_id || ""} onChange={(e) => atualizarFormularioArquivo(evento, { pasta_id: e.target.value })} className={inputClass}><option value="">Selecione a pasta</option>{pastasDaEstante(evento).map((pasta) => { const coluna = estrutura.colunas.find((item) => item.id === pasta.coluna_id); return <option key={pasta.id} value={pasta.id}>{coluna?.nome} / {pasta.nome}</option>; })}</select></label><label className="grid gap-1 text-xs font-medium">Remetente *<input required maxLength="300" value={(formulariosArquivo[evento.id] || {}).remetente || ""} onChange={(e) => atualizarFormularioArquivo(evento, { remetente: e.target.value })} className={inputClass}/></label><label className="grid gap-1 text-xs font-medium">Destinatário *<input required maxLength="300" value={(formulariosArquivo[evento.id] || {}).destinatario || ""} onChange={(e) => atualizarFormularioArquivo(evento, { destinatario: e.target.value })} className={inputClass}/></label><label className="grid gap-1 text-xs font-medium sm:col-span-2">Assunto *<input required maxLength="500" value={(formulariosArquivo[evento.id] || {}).assunto || ""} onChange={(e) => atualizarFormularioArquivo(evento, { assunto: e.target.value })} className={inputClass}/></label><label className="grid gap-1 text-xs font-medium">Referência<input maxLength="300" value={(formulariosArquivo[evento.id] || {}).referencia || ""} onChange={(e) => atualizarFormularioArquivo(evento, { referencia: e.target.value })} className={inputClass}/></label><label className="grid gap-1 text-xs font-medium">Descrição / observação<input maxLength="3000" value={(formulariosArquivo[evento.id] || {}).descricao || ""} onChange={(e) => atualizarFormularioArquivo(evento, { descricao: e.target.value })} className={inputClass}/></label><button type="submit" disabled={salvando === evento.id || !pastasDaEstante(evento).length} className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2">Confirmar e registrar como Ofício externo</button>{!pastasDaEstante(evento).length && <p className="text-xs text-amber-800 sm:col-span-2">Não há pastas ativas na estante de recebimento.</p>}</form></details> : <p className="rounded-lg bg-slate-100 p-3 text-xs text-slate-600">Solicitação antiga sem vínculo de estante: o registro ao Arquivo não fica disponível neste fluxo.</p>}
          <section className="space-y-2 border-t border-slate-200 pt-3"><h3 className="font-semibold">Comentários e atualizações para o P1</h3>{evento.interacoes.filter((item) => item.tipo === "comentario" || item.tipo === "equipe_indicada" || item.tipo === "opo_atualizada").map((item) => <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-3"><p className="font-medium">{item.tipo === "comentario" ? item.conteudo : item.tipo === "equipe_indicada" ? `Equipe indicada: ${item.conteudo || "—"}` : `OPO atualizada${item.conteudo ? ` · ${item.conteudo}` : ""}`}</p><p className="mt-1 text-xs text-slate-500">{item.policial ? [item.policial.posto_graduacao, item.policial.numeral, item.policial.nome_guerra || item.policial.nome_completo].filter(Boolean).join(" · ") : "Solicitação pública"} · {dataHora(item.created_at)}{item.tipo === "comentario" ? " · Destinatário: P1" : ""}</p>{item.opo_pdf_url && <a href={item.opo_pdf_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-semibold text-blue-700 underline">Abrir PDF da OPO anexado nesta atualização</a>}</div>)}
            {podeComentar && <form onSubmit={(formEvent) => enviarComentario(evento, formEvent)} className="space-y-2"><label className="grid gap-1 text-xs font-medium">Novo comentário — destinatário P1<textarea required maxLength="3000" rows="3" value={comentarios[evento.id] || ""} onChange={(e) => setComentarios((atual) => ({ ...atual, [evento.id]: e.target.value }))} className={inputClass}/></label><button disabled={salvando === evento.id} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800"><Send className="h-3 w-3"/>Registrar comentário</button></form>}
          </section>
          <p className="border-t border-slate-200 pt-3 text-xs text-slate-500"><CalendarDays className="mr-1 inline h-3 w-3"/>A decisão formal do Oficial ainda não está habilitada enquanto as regras institucionais não forem definidas.</p>
        </article>
      </details>)}</div>}
    </section>
  </main>;
}
