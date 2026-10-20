import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Minus, Plus, Search, Send, X } from "lucide-react";
import { obterConfiguracaoGeocodificacaoEvento, pesquisarEnderecoEvento, solicitarEvento } from "../services/eventosService";

const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
const LIMITE_ARQUIVO = 2_600_000;
const ZOOM = 15;
const TAMANHO_TILE = 256;
const CENTRO_INICIAL = { latitude: -4.133, longitude: -38.24 };

function projetar(latitude, longitude, zoom) {
  const limite = 85.05112878;
  const lat = Math.max(-limite, Math.min(limite, latitude));
  const seno = Math.sin((lat * Math.PI) / 180);
  const mundo = TAMANHO_TILE * (2 ** zoom);
  return { x: ((longitude + 180) / 360) * mundo, y: (0.5 - Math.log((1 + seno) / (1 - seno)) / (4 * Math.PI)) * mundo };
}

function desprojetar(x, y, zoom) {
  const mundo = TAMANHO_TILE * (2 ** zoom);
  const longitude = (x / mundo) * 360 - 180;
  const latitude = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / mundo))) * 180) / Math.PI;
  return { latitude, longitude };
}

function MapaLocalizacao({ aoSelecionar, endereco, setEndereco }) {
  const [centro, setCentro] = useState(CENTRO_INICIAL);
  const [marcador, setMarcador] = useState(null);
  const [zoom, setZoom] = useState(ZOOM);
  const [dimensoes, setDimensoes] = useState({ largura: 760, altura: 320 });
  const [erro, setErro] = useState("");
  const [falhaTiles, setFalhaTiles] = useState(false);
  const [pesquisando, setPesquisando] = useState(false);
  const [resultados, setResultados] = useState([]);
  const [mapaAmpliado, setMapaAmpliado] = useState(false);
  const [autocompleteDisponivel, setAutocompleteDisponivel] = useState(false);
  const [indiceResultado, setIndiceResultado] = useState(-1);
  const mapaRef = useRef(null);
  const arrastando = useRef(false);
  const arrastandoMapa = useRef(null);
  const ignorarClique = useRef(false);
  const pesquisaAtual = useRef(0);
  const controladorPesquisa = useRef(null);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entrada]) => setDimensoes({ largura: entrada.contentRect.width, altura: entrada.contentRect.height }));
    observer.observe(mapa);
    return () => observer.disconnect();
  }, [mapaAmpliado]);

  useEffect(() => {
    let ativo = true;
    obterConfiguracaoGeocodificacaoEvento()
      .then((configuracao) => { if (ativo) setAutocompleteDisponivel(configuracao.autocomplete_disponivel === true); })
      .catch(() => { if (ativo) setAutocompleteDisponivel(false); });
    return () => { ativo = false; };
  }, []);

  useEffect(() => {
    if (!mapaAmpliado || !autocompleteDisponivel || endereco.trim().length < 3) {
      return undefined;
    }
    const consulta = endereco.trim();
    const numeroPesquisa = pesquisaAtual.current + 1;
    pesquisaAtual.current = numeroPesquisa;
    controladorPesquisa.current?.abort();
    const controlador = new AbortController();
    controladorPesquisa.current = controlador;
    const temporizador = window.setTimeout(async () => {
      setResultados([]);
      setPesquisando(true);
      setErro("");
      try {
        const dados = await pesquisarEnderecoEvento(consulta, { signal: controlador.signal, autocomplete: true });
        if (pesquisaAtual.current !== numeroPesquisa) return;
        setResultados(Array.isArray(dados.resultados) ? dados.resultados : []);
        setIndiceResultado(-1);
        if (!dados.resultados?.length) setErro("Nenhuma sugestão encontrada. Continue digitando ou pesquise o endereço completo.");
      } catch (falha) {
        if (controlador.signal.aborted || pesquisaAtual.current !== numeroPesquisa) return;
        setResultados([]);
        setErro(falha.message || "Não foi possível carregar sugestões. Tente novamente ou pesquise o endereço completo.");
      } finally {
        if (pesquisaAtual.current === numeroPesquisa) setPesquisando(false);
      }
    }, 1200);
    return () => { window.clearTimeout(temporizador); controlador.abort(); };
  }, [endereco, mapaAmpliado, autocompleteDisponivel]);

  useEffect(() => {
    if (!mapaAmpliado) return undefined;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflowAnterior; };
  }, [mapaAmpliado]);

  const projecaoCentro = useMemo(() => projetar(centro.latitude, centro.longitude, zoom), [centro, zoom]);
  const tiles = useMemo(() => {
    const meioTileX = Math.floor(projecaoCentro.x / TAMANHO_TILE);
    const meioTileY = Math.floor(projecaoCentro.y / TAMANHO_TILE);
    const colunas = Math.ceil(dimensoes.largura / TAMANHO_TILE) + 2;
    const linhas = Math.ceil(dimensoes.altura / TAMANHO_TILE) + 2;
    const inicioX = meioTileX - Math.ceil(colunas / 2);
    const inicioY = meioTileY - Math.ceil(linhas / 2);
    const limite = 2 ** zoom;
    return Array.from({ length: colunas * linhas }, (_, indice) => {
      const xBruto = inicioX + (indice % colunas);
      const y = inicioY + Math.floor(indice / colunas);
      if (y < 0 || y >= limite) return null;
      const x = ((xBruto % limite) + limite) % limite;
      return { chave: `${xBruto}-${y}`, x, y, left: xBruto * TAMANHO_TILE - projecaoCentro.x + dimensoes.largura / 2, top: y * TAMANHO_TILE - projecaoCentro.y + dimensoes.altura / 2 };
    }).filter(Boolean);
  }, [projecaoCentro, dimensoes, zoom]);

  function selecionarPonto(evento) {
    const caixa = mapaRef.current?.getBoundingClientRect();
    if (!caixa) return;
    const ponto = desprojetar(projecaoCentro.x + evento.clientX - caixa.left - caixa.width / 2, projecaoCentro.y + evento.clientY - caixa.top - caixa.height / 2, zoom);
    setMarcador(ponto);
    aoSelecionar(ponto);
  }

  function iniciarArrastoMapa(evento) {
    if (evento.target.closest("button")) return;
    arrastandoMapa.current = { x: evento.clientX, y: evento.clientY, origem: projetar(centro.latitude, centro.longitude, zoom) };
    ignorarClique.current = false;
    evento.currentTarget.setPointerCapture(evento.pointerId);
  }

  function moverMapa(evento) {
    if (!arrastandoMapa.current) return;
    const dx = evento.clientX - arrastandoMapa.current.x;
    const dy = evento.clientY - arrastandoMapa.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) ignorarClique.current = true;
    setCentro(desprojetar(arrastandoMapa.current.origem.x - dx, arrastandoMapa.current.origem.y - dy, zoom));
  }

  async function pesquisarEndereco() {
    setErro("");
    setResultados([]);
    controladorPesquisa.current?.abort();
    if (endereco.trim().length < 3) { setErro("Digite pelo menos três caracteres do endereço do evento."); return; }
    setPesquisando(true);
    const numeroPesquisa = pesquisaAtual.current + 1;
    pesquisaAtual.current = numeroPesquisa;
    const controlador = new AbortController();
    controladorPesquisa.current = controlador;
    try {
      const dados = await pesquisarEnderecoEvento(endereco.trim(), { signal: controlador.signal });
      if (pesquisaAtual.current !== numeroPesquisa) return;
      if (!Array.isArray(dados.resultados) || !dados.resultados.length) { setErro("Nenhum resultado encontrado. Tente incluir número, bairro ou município, ou marque o local no mapa."); return; }
      setResultados(dados.resultados);
      setIndiceResultado(-1);
    } catch (falha) {
      if (controlador.signal.aborted || pesquisaAtual.current !== numeroPesquisa) return;
      setErro(falha.message || "Falha de conexão ao pesquisar o endereço. Tente novamente ou marque o local diretamente no mapa.");
    } finally { if (pesquisaAtual.current === numeroPesquisa) setPesquisando(false); }
  }

  function escolherResultado(resultado) {
    const ponto = { latitude: resultado.latitude, longitude: resultado.longitude };
    setCentro(ponto);
    setMarcador(ponto);
    aoSelecionar(ponto);
    setEndereco(resultado.display_name || endereco, true);
    setResultados([]);
    setIndiceResultado(-1);
    setErro("");
  }

  function renderCampoPesquisa(id) {
    return <div className="relative flex gap-2">
      <label className="sr-only" htmlFor={id}>Pesquisar endereço do evento</label>
      <input id={id} value={endereco} onChange={(evento) => { setMarcador(null); aoSelecionar(null); setResultados([]); setIndiceResultado(-1); setEndereco(evento.target.value); }} onKeyDown={(evento) => {
        if (evento.key === "Enter") {
          evento.preventDefault();
          if (indiceResultado >= 0 && resultados[indiceResultado]) escolherResultado(resultados[indiceResultado]);
          else pesquisarEndereco();
        }
        else if (!resultados.length) return;
        else if (evento.key === "ArrowDown") { evento.preventDefault(); setIndiceResultado((atual) => Math.min(resultados.length - 1, atual + 1)); }
        else if (evento.key === "ArrowUp") { evento.preventDefault(); setIndiceResultado((atual) => Math.max(0, atual - 1)); }
        else if (evento.key === "Escape") setResultados([]);
      }} role={mapaAmpliado && autocompleteDisponivel ? "combobox" : undefined} aria-autocomplete={mapaAmpliado && autocompleteDisponivel ? "list" : undefined} aria-expanded={Boolean(resultados.length)} aria-controls={`${id}-sugestoes`} aria-activedescendant={indiceResultado >= 0 ? `${id}-sugestao-${indiceResultado}` : undefined} placeholder="Pesquise o endereço do evento" maxLength="250" className={inputClass}/>
      <button type="button" onClick={pesquisarEndereco} disabled={pesquisando} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Search className="h-4 w-4"/>{pesquisando ? "Buscando…" : "Pesquisar"}</button>
    </div>;
  }

  function renderMapa(id, altura) {
    const projetarMarcador = marcador ? projetar(marcador.latitude, marcador.longitude, zoom) : null;
    return <div id={id} ref={mapaRef} role="application" aria-label="Mapa para ajustar a localização do evento" onClick={(evento) => { if (!arrastando.current && !ignorarClique.current) selecionarPonto(evento); ignorarClique.current = false; }} onPointerDown={iniciarArrastoMapa} onPointerMove={(evento) => { if (arrastando.current) selecionarPonto(evento); else moverMapa(evento); }} onPointerUp={() => { arrastando.current = false; arrastandoMapa.current = null; }} onPointerCancel={() => { arrastando.current = false; arrastandoMapa.current = null; }} className={`relative ${altura} touch-none overflow-hidden rounded-lg border border-slate-300 bg-slate-100`}>
      {tiles.map((tile) => <img key={tile.chave} src={`https://tile.openstreetmap.org/${zoom}/${tile.x}/${tile.y}.png`} alt="" draggable="false" onError={() => setFalhaTiles(true)} className="pointer-events-none absolute h-64 w-64 select-none" style={{ left: tile.left, top: tile.top }}/>) }
      {projetarMarcador && <button type="button" aria-label="Arraste ou clique no mapa para ajustar o marcador" onClick={(evento) => evento.stopPropagation()} onPointerDown={(evento) => { evento.preventDefault(); evento.stopPropagation(); arrastando.current = true; evento.currentTarget.setPointerCapture(evento.pointerId); }} onPointerUp={(evento) => { evento.stopPropagation(); arrastando.current = false; }} className="absolute z-10 -translate-x-1/2 -translate-y-full text-rose-700" style={{ left: projetarMarcador.x - projecaoCentro.x + dimensoes.largura / 2, top: projetarMarcador.y - projecaoCentro.y + dimensoes.altura / 2 }}><MapPin className="h-9 w-9 fill-rose-100 drop-shadow"/></button>}
      <span className="absolute bottom-1 right-1 rounded bg-white/90 px-1 text-[10px] text-slate-600">© OpenStreetMap</span>
    </div>;
  }

  const controles = <div className="flex items-center justify-end gap-2"><span className="mr-auto text-xs text-slate-500">A localização corresponde ao evento, não a quem preenche o formulário.</span><button type="button" aria-label="Diminuir zoom" disabled={zoom <= 4} onClick={() => setZoom((atual) => Math.max(4, atual - 1))} className="rounded border p-2 disabled:opacity-40"><Minus className="h-4 w-4"/></button><button type="button" aria-label="Aumentar zoom" disabled={zoom >= 19} onClick={() => setZoom((atual) => Math.min(19, atual + 1))} className="rounded border p-2 disabled:opacity-40"><Plus className="h-4 w-4"/></button></div>;
  const localSelecionado = marcador && <p role="status" className="text-xs font-medium text-emerald-800">Local selecionado: {endereco || "ponto marcado no mapa"} · {marcador.latitude.toFixed(5)}, {marcador.longitude.toFixed(5)}</p>;

  return <div className="space-y-2">
    {renderCampoPesquisa("pesquisa-local-evento")}
    {erro && !mapaAmpliado && <p role="status" className="text-xs text-amber-800">{erro}</p>}
    {resultados.length > 0 && !mapaAmpliado && <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-2" role="list" aria-label="Resultados de endereço">{resultados.map((resultado, indice) => <button type="button" key={resultado.place_id || indice} onClick={() => escolherResultado(resultado)} className="block w-full rounded p-2 text-left text-xs hover:bg-blue-50">{resultado.display_name}</button>)}</div>}
    {controles}
    {renderMapa("mapa-local-evento", "h-72")}
    <button type="button" onClick={() => setMapaAmpliado(true)} className="rounded-lg border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">Ampliar mapa</button>
    {falhaTiles && <p role="status" className="text-xs text-amber-800">Não foi possível carregar parte do mapa. Endereço e ponto de referência continuam disponíveis.</p>}
    <p className="text-xs text-slate-500">Arraste o mapa e clique no local do evento para posicionar ou ajustar o marcador. A pesquisa envia somente o endereço digitado ao serviço de geocodificação; mapa © OpenStreetMap.</p>
    {localSelecionado}
    {mapaAmpliado && <div role="dialog" aria-modal="true" aria-labelledby="titulo-mapa-ampliado" className="fixed inset-0 z-[100] flex flex-col bg-white p-3 sm:p-6"><div className="mx-auto flex h-full w-full max-w-7xl flex-col gap-3"><div className="flex items-center justify-between gap-3"><h2 id="titulo-mapa-ampliado" className="text-lg font-bold">Local do evento</h2><button type="button" onClick={() => setMapaAmpliado(false)} aria-label="Fechar mapa ampliado" className="rounded-lg border p-2"><X className="h-5 w-5"/></button></div>{renderCampoPesquisa("pesquisa-local-evento-ampliada")}<p className="text-xs text-slate-500">{autocompleteDisponivel ? "Sugestões aparecem enquanto você digita." : "Sugestões automáticas indisponíveis para o serviço configurado; use Pesquisar para consultar o endereço."}</p>{erro && <p role="status" className="text-sm text-amber-800">{erro}</p>}{resultados.length > 0 && <div id="pesquisa-local-evento-ampliada-sugestoes" className="max-h-32 overflow-auto rounded-lg border border-slate-200 bg-white p-1" role="listbox" aria-label="Sugestões de endereço">{resultados.map((resultado, indice) => <button id={`pesquisa-local-evento-ampliada-sugestao-${indice}`} type="button" role="option" aria-selected={indice === indiceResultado} key={resultado.place_id || indice} onMouseEnter={() => setIndiceResultado(indice)} onClick={() => escolherResultado(resultado)} className={`block w-full rounded p-2 text-left text-sm hover:bg-blue-50 ${indice === indiceResultado ? "bg-blue-50" : ""}`}>{resultado.display_name}</button>)}</div>}{controles}{renderMapa("mapa-local-evento-ampliado", "min-h-0 flex-1")}{localSelecionado}<div className="flex justify-end gap-2"><button type="button" onClick={() => setMapaAmpliado(false)} className="rounded-lg border px-4 py-2 text-sm font-semibold">Voltar ao formulário</button><button type="button" disabled={!marcador} onClick={() => setMapaAmpliado(false)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Confirmar localização</button></div></div></div>}
  </div>;
}
function arquivoComoDataUrl(file) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve({ nome: file.name, conteudo: leitor.result });
    leitor.onerror = () => reject(new Error("Não foi possível ler o arquivo selecionado."));
    leitor.readAsDataURL(file);
  });
}

async function comprimirImagem(file) {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    let escala = Math.min(1, 3000 / Math.max(bitmap.width, bitmap.height));
    for (let tentativa = 0; tentativa < 12; tentativa += 1) {
      canvas.width = Math.max(1, Math.round(bitmap.width * escala));
      canvas.height = Math.max(1, Math.round(bitmap.height * escala));
      const contexto = canvas.getContext("2d", { alpha: false });
      if (!contexto) throw new Error("Não foi possível preparar a imagem para compressão.");
      contexto.fillStyle = "#fff";
      contexto.fillRect(0, 0, canvas.width, canvas.height);
      contexto.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const qualidade = Math.max(0.58, 0.9 - (tentativa % 4) * 0.08);
      const comprimido = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", qualidade));
      if (comprimido && comprimido.size <= LIMITE_ARQUIVO) {
        if (comprimido.size >= file.size) return file;
        return new File([comprimido], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
      }
      if (tentativa % 4 === 3) escala *= 0.82;
    }
    throw new Error("A imagem permaneceu acima de 2,6 MB após a compressão. Envie uma imagem menor para manter a legibilidade.");
  } finally { bitmap.close?.(); }
}

function validarEmail(valor) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor) && valor.length <= 160; }
function validarTelefone(valor) { const digitos = valor.replace(/\D/g, ""); return [10, 11].includes(digitos.length) || ([12, 13].includes(digitos.length) && digitos.startsWith("55")); }
function formatarTamanho(bytes) { return `${(bytes / 1_000_000).toFixed(2)} MB`; }

export default function SolicitacaoEventoPublica() {
  const estanteId = new URLSearchParams(window.location.search).get("estante") || "";
  const [form, setForm] = useState({ responsavel_nome: "", responsavel_telefone: "", responsavel_email: "", nome_evento: "", tipo_evento: "", tipo_evento_outro: "", data_hora_inicio: "", data_hora_fim: "", endereco: "", referencia: "", descricao: "", atracoes: "" });
  const [localizacao, setLocalizacao] = useState(null);
  const [arquivos, setArquivos] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [errosCampos, setErrosCampos] = useState({});
  const [protocolo, setProtocolo] = useState("");
  const [processandoArquivo, setProcessandoArquivo] = useState(false);

  const nomesCampos = {
    responsavel_nome: "Nome do responsável",
    responsavel_telefone: "Telefone/WhatsApp com DDD válido",
    responsavel_email: "E-mail válido",
    nome_evento: "Nome do evento",
    tipo_evento: "Tipo do evento",
    tipo_evento_outro: "Descrição do tipo de evento (Outro)",
    data_hora_inicio: "Data e hora de início",
    data_hora_fim: "Data e hora de término posterior ao início",
    endereco: "Endereço do evento ou localização selecionada",
    referencia: "Ponto de referência (máximo 300 caracteres)",
    localizacao: "Coordenadas válidas do local",
    descricao: "Descrição",
    atracoes: "Atrações (máximo 3.000 caracteres)",
    oficios: "Anexo PDF ou imagem (até 2,6 MB no total)",
    estante_id: "Acesso pelo QR Code de uma estante autorizada",
  };
  const classeCampo = (campo) => `${inputClass}${errosCampos[campo] ? " border-rose-600 bg-rose-50 ring-1 ring-rose-600" : ""}`;
  function atualizarCampo(campo, valor) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
    setErrosCampos((atual) => { const proximo = { ...atual }; delete proximo[campo]; return proximo; });
  }

  async function enviar(evento) {
    evento.preventDefault();
    setErro("");
    const campos = {};
    if (!form.responsavel_nome.trim() || form.responsavel_nome.trim().length > 160) campos.responsavel_nome = "Informe o nome (até 160 caracteres).";
    if (!validarTelefone(form.responsavel_telefone) || form.responsavel_telefone.length > 20) campos.responsavel_telefone = "Informe telefone/WhatsApp com DDD válido.";
    if (!validarEmail(form.responsavel_email)) campos.responsavel_email = "Informe um e-mail válido (até 160 caracteres).";
    if (!form.nome_evento.trim() || form.nome_evento.trim().length > 180) campos.nome_evento = "Informe o nome do evento (até 180 caracteres).";
    if (!form.tipo_evento) campos.tipo_evento = "Selecione o tipo do evento.";
    if (form.tipo_evento === "Outro" && !form.tipo_evento_outro.trim()) campos.tipo_evento_outro = "Descreva o tipo de evento.";
    const inicio = new Date(form.data_hora_inicio);
    const fim = new Date(form.data_hora_fim);
    if (!form.data_hora_inicio || !Number.isFinite(inicio.getTime())) campos.data_hora_inicio = "Informe uma data e hora válidas.";
    if (!form.data_hora_fim || !Number.isFinite(fim.getTime())) campos.data_hora_fim = "Informe uma data e hora válidas.";
    else if (Number.isFinite(inicio.getTime()) && fim <= inicio) campos.data_hora_fim = "O término deve ser posterior ao início.";
    if (form.endereco.length > 250) campos.endereco = "O endereço deve ter no máximo 250 caracteres.";
    if (!form.endereco.trim() && !localizacao) campos.endereco = "Informe o endereço ou selecione uma localização válida no mapa.";
    if (form.referencia.length > 300) campos.referencia = "O ponto de referência deve ter no máximo 300 caracteres.";
    if (localizacao && (!Number.isFinite(Number(localizacao.latitude)) || !Number.isFinite(Number(localizacao.longitude)) || Number(localizacao.latitude) < -90 || Number(localizacao.latitude) > 90 || Number(localizacao.longitude) < -180 || Number(localizacao.longitude) > 180)) campos.localizacao = "Selecione novamente um ponto válido no mapa.";
    if (!form.descricao.trim() || form.descricao.trim().length > 5000) campos.descricao = "Informe a descrição (até 5.000 caracteres).";
    if (form.atracoes.length > 3000) campos.atracoes = "Use até 3.000 caracteres.";
    if (!arquivos.length || arquivos.length > 5 || arquivos.reduce((total, item) => total + item.file.size, 0) > LIMITE_ARQUIVO) campos.oficios = "Anexe de 1 a 5 arquivos com até 2,6 MB no total.";
    if (!estanteId) campos.estante_id = "Acesse o formulário pelo QR Code de uma estante autorizada.";
    setErrosCampos(campos);
    if (Object.keys(campos).length) {
      setErro("Confira os campos destacados em vermelho:");
      return;
    }
    setEnviando(true);
    try {
      const oficios = await Promise.all(arquivos.map(({ file }) => arquivoComoDataUrl(file)));
      const tipoEvento = form.tipo_evento === "Outro" ? `Outro: ${form.tipo_evento_outro.trim()}` : form.tipo_evento;
      const resultado = await solicitarEvento({ ...form, responsavel_contato: form.responsavel_telefone, tipo_evento: tipoEvento, estante_id: estanteId, data_hora_inicio: new Date(form.data_hora_inicio).toISOString(), data_hora_fim: new Date(form.data_hora_fim).toISOString(), latitude: localizacao?.latitude ?? null, longitude: localizacao?.longitude ?? null, oficios });
      setProtocolo(resultado.protocolo || "");
    } catch (e) {
      const invalidos = {};
      (e.camposInvalidos || []).forEach((campo) => {
        invalidos[campo] = campo === "oficios" ? "Anexe de 1 a 5 arquivos válidos, até 2,6 MB no total." : campo === "estante_id" ? "Acesse o formulário pelo QR Code de uma estante autorizada." : "Confira este campo e tente novamente.";
      });
      setErrosCampos(invalidos);
      setErro(e.message || "Não foi possível enviar a solicitação.");
    }
    finally { setEnviando(false); }
  }

  async function selecionarArquivos(lista) {
    const novos = Array.from(lista || []);
    if (!novos.length) return;
    setErro(""); setProcessandoArquivo(true);
    try {
      if (arquivos.length + novos.length > 5) throw new Error("É possível anexar até cinco arquivos.");
      const processados = [];
      for (const file of novos) {
        let final = file;
        if (file.type === "application/pdf") {
          if (file.size > LIMITE_ARQUIVO) throw new Error(`O PDF “${file.name}” excede 2,6 MB. O sistema não converte PDFs em imagens; otimize-o no editor e tente novamente.`);
        } else if (["image/jpeg", "image/png", "image/webp"].includes(file.type)) final = await comprimirImagem(file);
        else throw new Error(`O arquivo “${file.name}” não é PDF, JPEG, PNG ou WebP.`);
        if (final.name.length > 255) throw new Error(`O nome do arquivo “${final.name}” excede 255 caracteres.`);
        processados.push({ id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, file: final, tamanhoOriginal: file.size });
      }
      const total = [...arquivos, ...processados].reduce((soma, item) => soma + item.file.size, 0);
      if (total > LIMITE_ARQUIVO) throw new Error("Os anexos selecionados excedem juntos 2,6 MB. Remova algum arquivo ou reduza os PDFs.");
      setArquivos((atuais) => [...atuais, ...processados]); setErrosCampos((atuais) => { const proximo = { ...atuais }; delete proximo.oficios; return proximo; });
    } catch (e) {
      setErrosCampos((atuais) => ({ ...atuais, oficios: "Selecione arquivos válidos e respeite o limite total de 2,6 MB." }));
      setErro(e.message || "Não foi possível processar os arquivos.");
    }
    finally { setProcessandoArquivo(false); }
  }

  function removerArquivo(id) { setArquivos((atuais) => atuais.filter((item) => item.id !== id)); }

  return <main className="min-h-screen bg-slate-100 px-4 py-8">
    <article className="mx-auto max-w-3xl space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <header><p className="text-sm font-semibold text-blue-700">Log2CIA · Solicitação de evento</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Solicitar apoio para evento</h1><p className="mt-1 text-sm text-slate-600">Preencha os dados e anexe o ofício para análise. O envio não representa aprovação.</p></header>
      {protocolo ? <section role="status" className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><h2 className="font-bold text-emerald-900">Solicitação recebida</h2><p className="text-sm text-emerald-800">Evento {protocolo} registrado! Estamos cientes do seu evento. Caso seja necessário esclarecer dúvidas ou obter mais informações, entraremos em contato.</p></section> : <form noValidate onSubmit={enviar} className="space-y-4">
        {!estanteId && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Este formulário precisa ser acessado pelo QR Code de uma estante que esteja autorizada a receber solicitações.</p>}
        <label className="absolute -left-[10000px] h-px w-px overflow-hidden" aria-hidden="true">Site<input tabIndex={-1} autoComplete="off" value={form.site_url || ""} onChange={(e) => setForm({ ...form, site_url: e.target.value })}/></label>
        <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4"><legend className="px-1 text-sm font-bold">Responsável</legend><label className="grid gap-1 text-sm">Nome do responsável<input required maxLength="160" value={form.responsavel_nome} onChange={(e) => atualizarCampo("responsavel_nome", e.target.value)} className={classeCampo("responsavel_nome")}/></label><label className="grid gap-1 text-sm">Telefone/WhatsApp<input required type="tel" maxLength="20" autoComplete="tel" value={form.responsavel_telefone} onChange={(e) => atualizarCampo("responsavel_telefone", e.target.value)} className={classeCampo("responsavel_telefone")}/></label><label className="grid gap-1 text-sm">E-mail<input required type="email" maxLength="160" autoComplete="email" value={form.responsavel_email} onChange={(e) => atualizarCampo("responsavel_email", e.target.value)} className={classeCampo("responsavel_email")}/></label></fieldset>
        <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4"><legend className="px-1 text-sm font-bold">Dados do evento</legend><label className="grid gap-1 text-sm">Nome do evento<input required maxLength="180" value={form.nome_evento} onChange={(e) => atualizarCampo("nome_evento", e.target.value)} className={classeCampo("nome_evento")}/></label><label className="grid gap-1 text-sm">Tipo do evento<select required value={form.tipo_evento} onChange={(e) => atualizarCampo("tipo_evento", e.target.value)} className={classeCampo("tipo_evento")}><option value="">Selecione</option><option>Esportivo</option><option>Religioso</option><option>Cívico ou institucional</option><option>Cultural ou artístico</option><option>Comunitário ou social</option><option>Outro</option></select><span className="text-xs text-slate-500">Categorias iniciais, não institucionais.</span></label>{form.tipo_evento === "Outro" && <label className="grid gap-1 text-sm">Descreva o tipo<input required maxLength="110" value={form.tipo_evento_outro} onChange={(e) => atualizarCampo("tipo_evento_outro", e.target.value)} className={classeCampo("tipo_evento_outro")}/></label>}<div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">Início<input required type="datetime-local" value={form.data_hora_inicio} onChange={(e) => atualizarCampo("data_hora_inicio", e.target.value)} className={classeCampo("data_hora_inicio")}/></label><label className="grid gap-1 text-sm">Término<input required type="datetime-local" value={form.data_hora_fim} onChange={(e) => atualizarCampo("data_hora_fim", e.target.value)} className={classeCampo("data_hora_fim")}/></label></div><label className="grid gap-1 text-sm">Ponto de referência<input maxLength="300" value={form.referencia} onChange={(e) => atualizarCampo("referencia", e.target.value)} className={classeCampo("referencia")}/></label><div className={errosCampos.endereco || errosCampos.localizacao ? "rounded-lg border border-rose-600 bg-rose-50 p-1 ring-1 ring-rose-600" : ""}><MapaLocalizacao aoSelecionar={(local) => { setLocalizacao(local); setErrosCampos((atuais) => { const proximo = { ...atuais }; delete proximo.localizacao; return proximo; }); }} endereco={form.endereco} setEndereco={(endereco, preservarCoordenada = false) => { setForm((atual) => ({ ...atual, endereco: endereco.slice(0, 250) })); setErrosCampos((atuais) => { const proximo = { ...atuais }; delete proximo.endereco; return proximo; }); if (!preservarCoordenada) setLocalizacao(null); }}/></div><label className="grid gap-1 text-sm">Descrição<textarea required maxLength="5000" rows="4" value={form.descricao} onChange={(e) => atualizarCampo("descricao", e.target.value)} className={classeCampo("descricao")}/></label><label className="grid gap-1 text-sm">Atrações (opcional)<textarea maxLength="3000" rows="3" value={form.atracoes} onChange={(e) => atualizarCampo("atracoes", e.target.value)} className={classeCampo("atracoes")}/></label><label className="grid gap-1 text-sm">Anexos do evento (até cinco arquivos; total máximo 2,6 MB)<input type="file" multiple disabled={processandoArquivo || enviando} accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => { selecionarArquivos(e.target.files); e.target.value = ""; }} className={classeCampo("oficios")}/></label>{processandoArquivo && <p role="status" className="text-xs text-blue-700">Validando e comprimindo imagens…</p>}<ul className="space-y-2">{arquivos.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-2 text-xs"><span className="min-w-0"><strong className="block truncate">{item.file.name}</strong><span className="text-slate-600">Original: {formatarTamanho(item.tamanhoOriginal)} · Final: {formatarTamanho(item.file.size)}</span></span><button type="button" onClick={() => removerArquivo(item.id)} aria-label={`Remover ${item.file.name}`} className="rounded p-1 text-rose-700 hover:bg-rose-50"><X className="h-4 w-4"/></button></li>)}</ul><p className="text-xs text-slate-500">PDFs não são convertidos em imagens; PDFs acima de 2,6 MB devem ser otimizados fora do sistema.</p></fieldset>
        {erro && <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800"><p className="font-semibold">{erro}</p>{Object.keys(errosCampos).length > 0 && <ul className="mt-1 list-inside list-disc">{Object.entries(errosCampos).map(([campo, mensagem]) => <li key={campo}><strong>{nomesCampos[campo] || campo}:</strong> {mensagem}</li>)}</ul>}</div>}
        <button disabled={enviando || processandoArquivo || !estanteId} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"><Send className="h-4 w-4"/>{enviando ? "Enviando…" : "Enviar solicitação"}</button>
      </form>}
    </article>
  </main>;
}
