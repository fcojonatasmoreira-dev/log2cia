import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, MapPinned, Minus, Plus, RefreshCw, Save, X } from "lucide-react";
import {
  atualizarAreaOperacao,
  criarAreaOperacao,
  listarAreasOperacao,
} from "../services/areasOperacaoService";

const PERFIS_GESTAO = ["master", "oficial", "p1_escalante_servico_ordinario"];
const LARGURA_MAPA = 800;
const ALTURA_MAPA = 420;
const TAMANHO_TILE = 256;

function projetarCoordenada(latitude, longitude, zoom) {
  const limiteLatitude = 85.05112878;
  const latitudeLimitada = Math.max(-limiteLatitude, Math.min(limiteLatitude, latitude));
  const seno = Math.sin((latitudeLimitada * Math.PI) / 180);
  const tamanhoMundo = TAMANHO_TILE * (2 ** zoom);
  return {
    x: ((longitude + 180) / 360) * tamanhoMundo,
    y: (0.5 - Math.log((1 + seno) / (1 - seno)) / (4 * Math.PI)) * tamanhoMundo,
  };
}

function calcularContornoConvexo(pontos) {
  const ordenados = [...pontos].sort((a, b) => a.x - b.x || a.y - b.y);
  const unicos = ordenados.filter((ponto, indice) => (
    indice === 0 || ponto.x !== ordenados[indice - 1].x || ponto.y !== ordenados[indice - 1].y
  ));
  if (unicos.length < 3) return [];

  const cruzamento = (origem, anterior, atual) => (
    (anterior.x - origem.x) * (atual.y - origem.y)
      - (anterior.y - origem.y) * (atual.x - origem.x)
  );
  const inferior = [];
  for (const ponto of unicos) {
    while (inferior.length >= 2 && cruzamento(inferior[inferior.length - 2], inferior[inferior.length - 1], ponto) <= 0) inferior.pop();
    inferior.push(ponto);
  }
  const superior = [];
  for (const ponto of [...unicos].reverse()) {
    while (superior.length >= 2 && cruzamento(superior[superior.length - 2], superior[superior.length - 1], ponto) <= 0) superior.pop();
    superior.push(ponto);
  }
  return [...inferior.slice(0, -1), ...superior.slice(0, -1)];
}

function MapaContornoMacroarea({ macroarea, podeGerenciar, aoAtualizarMicroarea }) {
  const [falhaTiles, setFalhaTiles] = useState(false);
  const [pontoSelecionadoId, setPontoSelecionadoId] = useState(null);
  const [comentario, setComentario] = useState("");
  const [salvandoComentario, setSalvandoComentario] = useState(false);
  const [salvandoCoordenada, setSalvandoCoordenada] = useState(false);
  const [feedbackPin, setFeedbackPin] = useState("");
  const [pontoArrastando, setPontoArrastando] = useState(null);
  const [ajusteZoom, setAjusteZoom] = useState(0);
  const [visualizacaoSatelite, setVisualizacaoSatelite] = useState(false);
  const [mapaArrastando, setMapaArrastando] = useState(false);
  const [deslocamentoMapa, setDeslocamentoMapa] = useState({ x: 0, y: 0 });
  const arrastoRef = useRef(null);
  const arrastoMapaRef = useRef(null);
  const svgMapaRef = useRef(null);
  const rodaZoomAtivaRef = useRef(false);
  const zoomBaseRef = useRef(4);
  const ignorarProximoCliqueRef = useRef(false);

  useEffect(() => {
    const desativarRodaForaDoMapa = (event) => {
      if (!svgMapaRef.current?.contains(event.target)) {
        rodaZoomAtivaRef.current = false;
      }
    };
    document.addEventListener("pointerdown", desativarRodaForaDoMapa, true);
    return () => document.removeEventListener("pointerdown", desativarRodaForaDoMapa, true);
  }, []);
  const microareas = macroarea.microareas_operacao || [];
  const localizacoes = microareas.filter((microarea) => (
    microarea.latitude !== null
      && microarea.latitude !== undefined
      && microarea.latitude !== ""
      && microarea.longitude !== null
      && microarea.longitude !== undefined
      && microarea.longitude !== ""
      && Number.isFinite(Number(microarea.latitude))
      && Number.isFinite(Number(microarea.longitude))
  ));

  useEffect(() => {
    const svg = svgMapaRef.current;
    if (!svg) return undefined;
    const controlarZoom = (event) => {
      if (!rodaZoomAtivaRef.current) return;
      event.preventDefault();
      if (event.deltaY === 0) return;
      const direcao = event.deltaY < 0 ? 1 : -1;
      const zoomBaseAtual = zoomBaseRef.current;
      setAjusteZoom((atual) => Math.max(2 - zoomBaseAtual, Math.min(19 - zoomBaseAtual, atual + direcao)));
    };
    svg.addEventListener("wheel", controlarZoom, { passive: false });
    return () => svg.removeEventListener("wheel", controlarZoom);
  }, [localizacoes.length > 0]);

  if (localizacoes.length === 0) {
    return <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">Cadastre latitude e longitude nas microáreas para visualizar o mapa.</p>;
  }

  let zoomBase = 4;
  for (let candidato = 5; candidato <= 18; candidato += 1) {
    const pontosCandidatos = localizacoes.map((microarea) => projetarCoordenada(Number(microarea.latitude), Number(microarea.longitude), candidato));
    const largura = Math.max(...pontosCandidatos.map((ponto) => ponto.x)) - Math.min(...pontosCandidatos.map((ponto) => ponto.x));
    const altura = Math.max(...pontosCandidatos.map((ponto) => ponto.y)) - Math.min(...pontosCandidatos.map((ponto) => ponto.y));
    if (largura > LARGURA_MAPA * 0.7 || altura > ALTURA_MAPA * 0.7) break;
    zoomBase = candidato;
  }
  zoomBaseRef.current = zoomBase;
  const zoom = Math.max(2, Math.min(19, zoomBase + ajusteZoom));

  const pontosProjetados = localizacoes.map((microarea) => ({
    ...microarea,
    ...projetarCoordenada(Number(microarea.latitude), Number(microarea.longitude), zoom),
  }));
  const menorX = Math.min(...pontosProjetados.map((ponto) => ponto.x));
  const maiorX = Math.max(...pontosProjetados.map((ponto) => ponto.x));
  const menorY = Math.min(...pontosProjetados.map((ponto) => ponto.y));
  const maiorY = Math.max(...pontosProjetados.map((ponto) => ponto.y));
  const centroX = (menorX + maiorX) / 2;
  const centroY = (menorY + maiorY) / 2;
  const esquerda = centroX - LARGURA_MAPA / 2 - deslocamentoMapa.x;
  const topo = centroY - ALTURA_MAPA / 2 - deslocamentoMapa.y;
  const pontos = pontosProjetados.map((ponto) => {
    const coordenadasArrastadas = pontoArrastando?.id === ponto.id
      ? { latitude: pontoArrastando.latitude, longitude: pontoArrastando.longitude }
      : { latitude: Number(ponto.latitude), longitude: Number(ponto.longitude) };
    const projetado = projetarCoordenada(coordenadasArrastadas.latitude, coordenadasArrastadas.longitude, zoom);
    return {
      ...ponto,
      ...coordenadasArrastadas,
      x: projetado.x - esquerda,
      y: projetado.y - topo,
    };
  });
  const primeiroTileX = Math.floor(esquerda / TAMANHO_TILE);
  const ultimoTileX = Math.floor((esquerda + LARGURA_MAPA) / TAMANHO_TILE);
  const primeiroTileY = Math.max(0, Math.floor(topo / TAMANHO_TILE));
  const ultimoTileY = Math.min((2 ** zoom) - 1, Math.floor((topo + ALTURA_MAPA) / TAMANHO_TILE));
  const tiles = [];
  for (let tileX = primeiroTileX; tileX <= ultimoTileX; tileX += 1) {
    for (let tileY = primeiroTileY; tileY <= ultimoTileY; tileY += 1) {
      const xUrl = ((tileX % (2 ** zoom)) + (2 ** zoom)) % (2 ** zoom);
      tiles.push({
        id: `${tileX}-${tileY}`,
        x: tileX * TAMANHO_TILE - esquerda,
        y: tileY * TAMANHO_TILE - topo,
        url: visualizacaoSatelite
          ? `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${tileY}/${xUrl}`
          : `https://tile.openstreetmap.org/${zoom}/${xUrl}/${tileY}.png`,
      });
    }
  }
  const contorno = calcularContornoConvexo(pontos);
  const pontoSelecionado = pontos.find((ponto) => ponto.id === pontoSelecionadoId);

  const coordenadasDoEvento = (event) => {
    const limites = event.currentTarget.getBoundingClientRect();
    const xNaTela = ((event.clientX - limites.left) / limites.width) * LARGURA_MAPA;
    const yNaTela = ((event.clientY - limites.top) / limites.height) * ALTURA_MAPA;
    const tamanhoMundo = TAMANHO_TILE * (2 ** zoom);
    const xMundo = esquerda + xNaTela;
    const yMundo = topo + yNaTela;
    const longitude = (xMundo / tamanhoMundo) * 360 - 180;
    const n = Math.PI - (2 * Math.PI * yMundo) / tamanhoMundo;
    const latitude = (180 / Math.PI) * Math.atan(Math.sinh(n));
    return {
      latitude: Number(latitude.toFixed(6)),
      longitude: Number(longitude.toFixed(6)),
    };
  };

  const iniciarArrasto = (event, ponto) => {
    rodaZoomAtivaRef.current = true;
    if (!podeGerenciar || salvandoCoordenada || event.button !== 0) return;
    event.stopPropagation();
    // Capturar no próprio pin mantém o click associado ao marcador após soltar o ponteiro.
    event.currentTarget.setPointerCapture(event.pointerId);
    ignorarProximoCliqueRef.current = false;
    const arrasto = {
      id: ponto.id,
      pointerId: event.pointerId,
      latitude: Number(ponto.latitude),
      longitude: Number(ponto.longitude),
      latitudeInicial: Number(ponto.latitude),
      longitudeInicial: Number(ponto.longitude),
    };
    arrastoRef.current = arrasto;
    setPontoArrastando(arrasto);
    setFeedbackPin("");
  };

  const moverArrasto = (event) => {
    if (arrastoMapaRef.current?.pointerId === event.pointerId) {
      const limites = event.currentTarget.getBoundingClientRect();
      const arrasto = arrastoMapaRef.current;
      setDeslocamentoMapa({
        x: arrasto.xInicial + ((event.clientX - arrasto.clientXInicial) / limites.width) * LARGURA_MAPA,
        y: arrasto.yInicial + ((event.clientY - arrasto.clientYInicial) / limites.height) * ALTURA_MAPA,
      });
      return;
    }
    if (!arrastoRef.current || arrastoRef.current.pointerId !== event.pointerId) return;
    const coordenadas = coordenadasDoEvento(event);
    if (coordenadas.latitude === arrastoRef.current.latitudeInicial
      && coordenadas.longitude === arrastoRef.current.longitudeInicial) return;
    ignorarProximoCliqueRef.current = true;
    const arrasto = { ...arrastoRef.current, ...coordenadas };
    arrastoRef.current = arrasto;
    setPontoArrastando(arrasto);
  };

  const concluirArrasto = async (event) => {
    if (arrastoMapaRef.current?.pointerId === event.pointerId) {
      arrastoMapaRef.current = null;
      setMapaArrastando(false);
      return;
    }
    const arrasto = arrastoRef.current;
    if (!arrasto || arrasto.pointerId !== event.pointerId) return;
    arrastoRef.current = null;
    if (arrasto.latitude === arrasto.latitudeInicial && arrasto.longitude === arrasto.longitudeInicial) {
      setPontoArrastando(null);
      return;
    }
    setSalvandoCoordenada(true);
    try {
      await aoAtualizarMicroarea(arrasto.id, { latitude: arrasto.latitude, longitude: arrasto.longitude });
      setFeedbackPin("Localização atualizada.");
    } catch (e) {
      setFeedbackPin(e.message || "Não foi possível atualizar a localização.");
    } finally {
      setPontoArrastando(null);
      setSalvandoCoordenada(false);
    }
  };

  const iniciarArrastoMapa = (event) => {
    rodaZoomAtivaRef.current = true;
    if (event.button !== 0 || event.target.closest?.('[data-pino-microarea="true"]')) return;
    arrastoMapaRef.current = {
      pointerId: event.pointerId,
      clientXInicial: event.clientX,
      clientYInicial: event.clientY,
      xInicial: deslocamentoMapa.x,
      yInicial: deslocamentoMapa.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setMapaArrastando(true);
  };

  const selecionarPonto = (ponto) => {
    setPontoSelecionadoId(ponto.id);
    setComentario(ponto.comentario || "");
    setFeedbackPin("");
  };

  const salvarComentario = async () => {
    if (!pontoSelecionado || !podeGerenciar) return;
    setSalvandoComentario(true);
    setFeedbackPin("");
    try {
      await aoAtualizarMicroarea(pontoSelecionado.id, { comentario });
      setFeedbackPin("Comentário salvo.");
    } catch (e) {
      setFeedbackPin(e.message || "Não foi possível salvar o comentário.");
    } finally {
      setSalvandoComentario(false);
    }
  };

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
      <svg
        ref={svgMapaRef}
        viewBox={`0 0 ${LARGURA_MAPA} ${ALTURA_MAPA}`}
        role="group"
        aria-label={`Mapa aproximado da macroárea ${macroarea.nome}. Clique no mapa para ativar o zoom pela roda do mouse; clique fora para voltar à rolagem normal.`}
        className="block aspect-[40/21] w-full"
        style={{ touchAction: "none", cursor: mapaArrastando ? "grabbing" : "grab" }}
        onPointerDown={iniciarArrastoMapa}
        onPointerMove={moverArrasto}
        onPointerUp={concluirArrasto}
        onPointerCancel={() => {
          arrastoRef.current = null;
          arrastoMapaRef.current = null;
          setMapaArrastando(false);
          ignorarProximoCliqueRef.current = false;
          setPontoArrastando(null);
        }}
      >
        {tiles.map((tile) => <image key={tile.id} href={tile.url} x={tile.x} y={tile.y} width={TAMANHO_TILE} height={TAMANHO_TILE} onError={() => setFalhaTiles(true)} />)}
        {contorno.length >= 3 && <polygon points={contorno.map((ponto) => `${ponto.x},${ponto.y}`).join(" ")} fill="rgba(37, 99, 235, 0.28)" stroke="#1d4ed8" strokeWidth={3} vectorEffect="non-scaling-stroke" />}
        {pontos.map((ponto) => (
          <g
            key={ponto.id}
            data-pino-microarea="true"
            role="button"
            tabIndex={0}
            aria-label={`${ponto.nome}${podeGerenciar ? ", arraste para alterar a localização" : ""}`}
            className={podeGerenciar ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}
            onPointerDown={(event) => iniciarArrasto(event, ponto)}
            onClick={() => {
              if (ignorarProximoCliqueRef.current) {
                ignorarProximoCliqueRef.current = false;
                return;
              }
              selecionarPonto(ponto);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selecionarPonto(ponto);
              }
            }}
          >
            <path
              d="M 0 0 C -2 -4 -11 -13 -11 -20 A 11 11 0 1 1 11 -20 C 11 -13 2 -4 0 0 Z"
              transform={`translate(${ponto.x} ${ponto.y})`}
              fill="#1d4ed8"
              stroke="white"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={ponto.x} cy={ponto.y - 20} r={4} fill="white" />
            <text
              x={ponto.x}
              y={ponto.y - 31}
              textAnchor="middle"
              fontSize={13}
              fontWeight={700}
              fill="#0f172a"
              stroke="white"
              strokeWidth={4}
              paintOrder="stroke"
              pointerEvents="none"
            >
              {ponto.nome}
            </text>
            <title>{ponto.nome}</title>
          </g>
        ))}
      </svg>
      {pontoSelecionado && <div className="border-t border-slate-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <strong className="text-sm text-slate-800">{pontoSelecionado.nome}</strong>
            <p className="text-xs text-slate-500">{Number(pontoSelecionado.latitude).toFixed(6)}, {Number(pontoSelecionado.longitude).toFixed(6)}</p>
          </div>
          <button type="button" onClick={() => setPontoSelecionadoId(null)} className="text-xs text-slate-500">Fechar</button>
        </div>
        <textarea
          value={comentario}
          onChange={(event) => setComentario(event.target.value)}
          maxLength={1000}
          readOnly={!podeGerenciar}
          placeholder={podeGerenciar ? "Adicionar comentário a este pin" : "Nenhum comentário neste pin"}
          className="min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm read-only:bg-slate-50"
        />
        {podeGerenciar && <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-slate-400">{comentario.length}/1000</span>
          <button type="button" disabled={salvandoComentario} onClick={salvarComentario} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{salvandoComentario ? "Salvando..." : "Salvar comentário"}</button>
        </div>}
      </div>}
      {feedbackPin && <p role="status" className="border-t border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">{feedbackPin}</p>}
      {falhaTiles && <p role="status" className="border-t border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">O fundo cartográfico não carregou. Confira a conexão; os pins e o contorno continuam sendo calculados pelas coordenadas.</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
        <span>{contorno.length >= 3 ? "Mancha estimada envolvendo os pontos cadastrados." : "São necessárias ao menos três localizações distintas para calcular a mancha."} Pins: {pontos.length}/{microareas.length} microáreas.</span>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1" aria-label="Controles de zoom">
            <button type="button" onClick={() => setAjusteZoom((valor) => Math.max(-8, valor - 1))} disabled={zoom <= 2} aria-label="Diminuir zoom" title="Diminuir zoom" className="rounded border border-slate-300 p-1 disabled:opacity-40"><Minus className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => setAjusteZoom((valor) => Math.min(8, valor + 1))} disabled={zoom >= 19} aria-label="Aumentar zoom" title="Aumentar zoom" className="rounded border border-slate-300 p-1 disabled:opacity-40"><Plus className="h-3.5 w-3.5" /></button>
          </div>
          <button type="button" onClick={() => { setVisualizacaoSatelite((valor) => !valor); setFalhaTiles(false); }} aria-pressed={visualizacaoSatelite} className="rounded border border-slate-300 px-2 py-1 font-medium">{visualizacaoSatelite ? "Mapa de ruas" : "Satélite"}</button>
          {visualizacaoSatelite
            ? <a href="https://support.esri.com/en-us/knowledge-base/what-is-the-correct-way-to-cite-an-arcgis-online-basema-000012040" target="_blank" rel="noreferrer" className="max-w-56 underline">Sources: Esri, DigitalGlobe, GeoEye, i-cubed, USDA FSA, USGS, AEX, Getmapping, Aerogrid, IGN, IGP, swisstopo, and the GIS User Community</a>
            : <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="shrink-0 underline">© OpenStreetMap contributors</a>}
        </div>
      </div>
    </div>
  );
}

function lerRole() {
  try {
    return String(JSON.parse(localStorage.getItem("log2cia_user") || "{}")?.role || "")
      .trim()
      .toLowerCase();
  } catch {
    return "";
  }
}

export default function AreasOperacao() {
  const [macroareas, setMacroareas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [nomeMacroarea, setNomeMacroarea] = useState("");
  const [descricaoMacroarea, setDescricaoMacroarea] = useState("");
  const [macroareaEditando, setMacroareaEditando] = useState(null);
  const [novaMicroarea, setNovaMicroarea] = useState({});
  const [novoLinkMaps, setNovoLinkMaps] = useState({});
  const [novaLatitude, setNovaLatitude] = useState({});
  const [novaLongitude, setNovaLongitude] = useState({});
  const [microareaEditando, setMicroareaEditando] = useState(null);
  const [macroareasExpandidas, setMacroareasExpandidas] = useState({});
  const podeGerenciar = PERFIS_GESTAO.includes(lerRole());

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const resultado = await listarAreasOperacao();
      setMacroareas(resultado.macroareas || []);
    } catch (e) {
      setErro(e.message || "Não foi possível carregar as áreas de operação.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const limparFormularioMacroarea = () => {
    setNomeMacroarea("");
    setDescricaoMacroarea("");
    setMacroareaEditando(null);
  };

  const salvarMacroarea = async (e) => {
    e.preventDefault();
    setSalvando(true);
    setErro("");
    setSucesso("");
    try {
      const dados = {
        tipo: "macroarea",
        nome: nomeMacroarea.trim(),
        descricao: descricaoMacroarea.trim(),
      };
      if (macroareaEditando) {
        await atualizarAreaOperacao(macroareaEditando, dados);
        setSucesso("Macroárea atualizada.");
      } else {
        await criarAreaOperacao(dados);
        setSucesso("Macroárea cadastrada.");
      }
      limparFormularioMacroarea();
      await carregar();
    } catch (e2) {
      setErro(e2.message || "Não foi possível salvar a macroárea.");
    } finally {
      setSalvando(false);
    }
  };

  const salvarMicroarea = async (macroareaId) => {
    const emEdicao = microareaEditando?.macroareaId === macroareaId ? microareaEditando : null;
    const nome = emEdicao?.nome ?? novaMicroarea[macroareaId] ?? "";
    if (!nome.trim()) {
      setErro("Informe o nome da microárea.");
      return;
    }
    setSalvando(true);
    setErro("");
    setSucesso("");
    try {
      const linkMaps = emEdicao?.google_maps_url ?? novoLinkMaps[macroareaId] ?? "";
      const latitude = emEdicao?.latitude ?? novaLatitude[macroareaId] ?? "";
      const longitude = emEdicao?.longitude ?? novaLongitude[macroareaId] ?? "";
      const dados = {
        tipo: "microarea",
        nome: nome.trim(),
        google_maps_url: linkMaps.trim(),
        latitude,
        longitude,
      };
      if (emEdicao) {
        await atualizarAreaOperacao(emEdicao.id, dados);
        setMicroareaEditando(null);
        setSucesso("Microárea atualizada.");
      } else {
        const resultado = await criarAreaOperacao({ ...dados, macroarea_id: macroareaId });
        if (resultado.area) {
          setMacroareas((atuais) => atuais.map((macroarea) => (
            macroarea.id === macroareaId
              ? {
                  ...macroarea,
                  microareas_operacao: [...(macroarea.microareas_operacao || []), resultado.area],
                }
              : macroarea
          )));
        } else {
          await carregar();
        }
        setNovaMicroarea((atual) => ({ ...atual, [macroareaId]: "" }));
        setNovoLinkMaps((atual) => ({ ...atual, [macroareaId]: "" }));
        setNovaLatitude((atual) => ({ ...atual, [macroareaId]: "" }));
        setNovaLongitude((atual) => ({ ...atual, [macroareaId]: "" }));
        setSucesso("Microárea cadastrada.");
      }
      if (emEdicao) await carregar();
    } catch (e) {
      setErro(e.message || "Não foi possível salvar a microárea.");
    } finally {
      setSalvando(false);
    }
  };

  const alternarAtiva = async (tipo, area) => {
    if (
      tipo === "macroarea" &&
      area.ativa &&
      !window.confirm(`Desativar a macroárea ${area.nome}? As viaturas vinculadas ficarão sem área definida.`)
    ) return;
    setSalvando(true);
    setErro("");
    setSucesso("");
    try {
      await atualizarAreaOperacao(area.id, { tipo, ativa: !area.ativa });
      setSucesso(tipo === "macroarea" && area.ativa
        ? "Macroárea desativada; as viaturas vinculadas ficaram sem área definida."
        : `${tipo === "macroarea" ? "Macroárea" : "Microárea"} ${area.ativa ? "desativada" : "ativada"}.`);
      await carregar();
    } catch (e) {
      setErro(e.message || "Não foi possível alterar a situação da área.");
    } finally {
      setSalvando(false);
    }
  };

  const atualizarMicroareaNoEstado = async (id, alteracoes) => {
    const resultado = await atualizarAreaOperacao(id, { tipo: "microarea", ...alteracoes });
    if (!resultado.area) throw new Error("A API não retornou a microárea atualizada.");
    setMacroareas((atuais) => atuais.map((macroarea) => ({
      ...macroarea,
      microareas_operacao: (macroarea.microareas_operacao || []).map((microarea) => (
        microarea.id === id ? { ...microarea, ...resultado.area } : microarea
      )),
    })));
  };

  const iniciarEdicaoMacroarea = (area) => {
    setMacroareaEditando(area.id);
    setNomeMacroarea(area.nome || "");
    setDescricaoMacroarea(area.descricao || "");
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <MapPinned className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Áreas de Operação</h1>
            <p className="text-sm text-slate-500">Macroáreas e bairros correspondentes.</p>
          </div>
        </div>
      </section>

      {erro && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{erro}</div>}
      {sucesso && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{sucesso}</div>}

      {podeGerenciar && (
        <form onSubmit={salvarMacroarea} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-slate-800">{macroareaEditando ? "Editar macroárea" : "Cadastrar macroárea"}</h2>
          <div className="grid gap-3 md:grid-cols-[1fr_1.5fr_auto]">
            <input required value={nomeMacroarea} onChange={(e) => setNomeMacroarea(e.target.value)} placeholder="Nome da macroárea" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
            <input value={descricaoMacroarea} onChange={(e) => setDescricaoMacroarea(e.target.value)} placeholder="Descrição (opcional)" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
            <div className="flex gap-2">
              <button disabled={salvando} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                {macroareaEditando ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{macroareaEditando ? "Salvar" : "Cadastrar"}
              </button>
              {macroareaEditando && <button type="button" onClick={limparFormularioMacroarea} className="rounded-lg border border-slate-200 px-3 text-slate-600" title="Cancelar edição"><X className="h-4 w-4" /></button>}
            </div>
          </div>
        </form>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-bold text-slate-800">Macroáreas cadastradas</h2>
          <button type="button" onClick={carregar} disabled={carregando} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} /> Atualizar</button>
        </div>
        {carregando ? (
          <div className="p-8 text-center text-sm text-slate-500">Carregando áreas...</div>
        ) : macroareas.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">Nenhuma macroárea cadastrada.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {macroareas.map((macroarea) => (
              <article key={macroarea.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setMacroareasExpandidas((atuais) => ({ ...atuais, [macroarea.id]: !atuais[macroarea.id] }))}
                        className="rounded p-1 text-slate-500 hover:bg-slate-100"
                        aria-expanded={macroareasExpandidas[macroarea.id] === true}
                        aria-label={`${macroareasExpandidas[macroarea.id] === true ? "Recolher" : "Expandir"} microáreas de ${macroarea.nome}`}
                        title={macroareasExpandidas[macroarea.id] === true ? "Recolher microáreas" : "Expandir microáreas"}
                      >
                        {macroareasExpandidas[macroarea.id] === true ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      <h3 className="font-bold text-slate-800">{macroarea.nome}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${macroarea.ativa ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{macroarea.ativa ? "Ativa" : "Inativa"}</span>
                    </div>
                    {macroarea.descricao && <p className="mt-1 text-sm text-slate-500">{macroarea.descricao}</p>}
                  </div>
                  {podeGerenciar && <div className="flex gap-2">
                    <button type="button" onClick={() => iniciarEdicaoMacroarea(macroarea)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Editar</button>
                    <button type="button" disabled={salvando} onClick={() => alternarAtiva("macroarea", macroarea)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">{macroarea.ativa ? "Desativar" : "Ativar"}</button>
                  </div>}
                </div>

                {macroareasExpandidas[macroarea.id] === true && <div className="mt-4 rounded-xl bg-slate-50 p-4">
                  <MapaContornoMacroarea
                    macroarea={macroarea}
                    podeGerenciar={podeGerenciar}
                    aoAtualizarMicroarea={atualizarMicroareaNoEstado}
                  />
                  <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Microáreas / bairros</h4>
                  {(macroarea.microareas_operacao || []).length === 0 ? (
                    <p className="mt-2 text-sm text-slate-400">Nenhuma microárea cadastrada.</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-slate-200">
                      {[...(macroarea.microareas_operacao || [])].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).map((microarea) => (
                        <li key={microarea.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                          {microareaEditando?.id === microarea.id ? (
                            <div className="flex min-w-48 flex-1 flex-wrap gap-2">
                              <input autoFocus value={microareaEditando.nome} onChange={(e) => setMicroareaEditando({ ...microareaEditando, nome: e.target.value })} className="min-w-40 flex-1 rounded-md border border-slate-200 px-2 py-1" />
                              <input type="url" value={microareaEditando.google_maps_url || ""} onChange={(e) => setMicroareaEditando({ ...microareaEditando, google_maps_url: e.target.value })} placeholder="Link do Google Maps (opcional)" className="min-w-56 flex-1 rounded-md border border-slate-200 px-2 py-1" />
                              <input type="number" min="-90" max="90" step="any" value={microareaEditando.latitude ?? ""} onChange={(e) => setMicroareaEditando({ ...microareaEditando, latitude: e.target.value })} placeholder="Latitude" className="w-32 rounded-md border border-slate-200 px-2 py-1" />
                              <input type="number" min="-180" max="180" step="any" value={microareaEditando.longitude ?? ""} onChange={(e) => setMicroareaEditando({ ...microareaEditando, longitude: e.target.value })} placeholder="Longitude" className="w-32 rounded-md border border-slate-200 px-2 py-1" />
                            </div>
                          ) : <span className={microarea.ativa ? "text-slate-700" : "text-slate-400 line-through"}>{microarea.nome}{!microarea.ativa && <small className="ml-2 no-underline">Inativa</small>}{microarea.google_maps_url && <> <a href={microarea.google_maps_url} target="_blank" rel="noreferrer" className="ml-2 text-blue-700 underline" title="Abrir localização no Google Maps">Google Maps</a></>}</span>}
                          {podeGerenciar && <div className="flex gap-2">
                            {microareaEditando?.id === microarea.id ? <>
                              <button type="button" disabled={salvando} onClick={() => salvarMicroarea(macroarea.id)} className="text-xs font-semibold text-blue-700">Salvar</button>
                              <button type="button" onClick={() => setMicroareaEditando(null)} className="text-xs text-slate-500">Cancelar</button>
                            </> : <>
                              <button type="button" onClick={() => setMicroareaEditando({ id: microarea.id, macroareaId: macroarea.id, nome: microarea.nome, google_maps_url: microarea.google_maps_url || "", latitude: microarea.latitude ?? "", longitude: microarea.longitude ?? "" })} className="text-xs font-semibold text-slate-600">Editar</button>
                              <button type="button" disabled={salvando || !macroarea.ativa} onClick={() => alternarAtiva("microarea", microarea)} className="text-xs font-semibold text-slate-600 disabled:opacity-40">{microarea.ativa ? "Desativar" : "Ativar"}</button>
                            </>}
                          </div>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {podeGerenciar && macroarea.ativa && <form onSubmit={(e) => { e.preventDefault(); salvarMicroarea(macroarea.id); }} className="mt-3 flex flex-wrap gap-2">
                    <input value={novaMicroarea[macroarea.id] || ""} onChange={(e) => setNovaMicroarea((atual) => ({ ...atual, [macroarea.id]: e.target.value }))} placeholder="Novo bairro / microárea" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
                    <input type="url" value={novoLinkMaps[macroarea.id] || ""} onChange={(e) => setNovoLinkMaps((atual) => ({ ...atual, [macroarea.id]: e.target.value }))} placeholder="Link do Google Maps (opcional)" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
                    <input type="number" min="-90" max="90" step="any" value={novaLatitude[macroarea.id] || ""} onChange={(e) => setNovaLatitude((atual) => ({ ...atual, [macroarea.id]: e.target.value }))} placeholder="Latitude" className="w-32 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
                    <input type="number" min="-180" max="180" step="any" value={novaLongitude[macroarea.id] || ""} onChange={(e) => setNovaLongitude((atual) => ({ ...atual, [macroarea.id]: e.target.value }))} placeholder="Longitude" className="w-32 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
                    <button disabled={salvando} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 disabled:opacity-50">Adicionar</button>
                  </form>}
                </div>}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
