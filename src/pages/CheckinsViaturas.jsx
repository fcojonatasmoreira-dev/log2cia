import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, LogIn, LogOut, RefreshCw, X } from "lucide-react";
import { carregarControleViaturas, carregarHistoricoOcorrenciasViatura, registrarMovimentacao } from "../services/checkinsViaturasService";
import ResumoChecklistViatura from "../components/viaturas/ResumoChecklistViatura";
import BotaoCompartilharChecklist from "../components/viaturas/BotaoCompartilharChecklist";

const ENTRADAS = [["inicio_servico", "Entrada de serviço"], ["retirada_oficina", "Retirada da oficina"], ["recebimento_opm", "Recebimento de outra OPM"], ["viatura_nova", "Recebimento de viatura nova"], ["outras_situacoes", "Outras situações"]];
const SAIDAS = [["fim_servico", "Fim de serviço"], ["encaminhamento_oficina", "Encaminhamento à oficina"], ["devolucao_opm", "Devolução à OPM de origem"], ["baixa_definitiva", "Baixa definitiva"], ["outras_situacoes", "Outras situações"]];
const OCORRENCIAS = [["avaria", "Avaria"], ["acidente", "Acidente"], ["pane", "Pane"], ["abastecimento", "Abastecimento"], ["outro", "Outro"]];
const AR_CONDICIONADO = [["funcionando", "Funcionando"], ["ventilador_sem_gas", "Ventilador funciona, mas não tem gás"], ["ventilador_nao_funciona", "Ventilador não funciona"], ["sem_alteracoes", "Sem alterações"], ["outro", "Outro"]];
const FERRAMENTAS = ["Macaco", "Chave de rodas", "Triângulo de sinalização", "Pneu de estepe", "Tapetes", "Sem alterações", "Outro"];
const EQUIPAMENTOS = ["Rádio / HT", "Smartphone", "Intermitente", "Sinal sonoro", "Buzina", "Faróis", "Luz de direção (piscas)", "Luz de ré", "Sem alterações", "Outro"];
const CHECKLIST_VAZIO = {
  limpeza: "", limpeza_motivo_antecessor: "", combustivel: "",
  ar_condicionado: [], ar_condicionado_outro: "", kit_ferramentas: [], ferramentas_outro: "",
  alteracoes_equipamentos: [], alteracoes_equipamentos_outro: "", nivel_oleo: "", nivel_oleo_outro: "", pneus: "", pneus_detalhe: "",
  arrefecimento: "", arrefecimento_outro: "", freios: "", observacoes_gerais: "",
};
const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
const nomePolicial = (p) => p ? [p.posto_graduacao, p.numeral, p.nome_guerra || p.nome_completo, p.matricula].filter(Boolean).join(" · ") : "—";
const dataHora = (v) => v ? new Date(v).toLocaleString("pt-BR") : "—";
const rotuloTipoMovimentacao = (valor) => ({ inicio_servico: "Entrada de serviço", retirada_oficina: "Retirada da oficina", recebimento_opm: "Recebimento de outra OPM", viatura_nova: "Recebimento de viatura nova", fim_servico: "Fim de serviço", encaminhamento_oficina: "Encaminhamento à oficina", devolucao_opm: "Devolução à OPM de origem", baixa_definitiva: "Baixa definitiva", outras_situacoes: "Outras situações" }[valor] || valor || "—");

function Campo({ label, children }) { return <label className="grid gap-1 text-sm font-medium text-slate-700">{label}{children}</label>; }
function Secao({ titulo, children }) { return <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3"><legend className="px-1 text-sm font-bold text-slate-800">{titulo}</legend>{children}</fieldset>; }
function GaleriaFotos({ fotos = [] }) { return fotos.length ? <div className="mt-2 flex flex-wrap gap-2">{fotos.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" aria-label="Abrir foto anexada"><img src={url} alt="Foto anexada ao registro" className="h-16 w-16 rounded border object-cover" loading="lazy"/></a>)}</div> : null; }
function ListaOpcoes({ label, opcoes, escolhidos = [], aoAlterar, campoOutro, outro = "" }) {
  const alternar = (opcao) => {
    if (opcao === "Sem alterações") return aoAlterar(escolhidos.includes(opcao) ? [] : [opcao]);
    const proximas = escolhidos.filter((x) => x !== "Sem alterações");
    aoAlterar(proximas.includes(opcao) ? proximas.filter((x) => x !== opcao) : [...proximas, opcao]);
  };
  return <fieldset className="space-y-2"><legend className="text-sm font-medium text-slate-700">{label}</legend><div className="grid gap-2 sm:grid-cols-2">{opcoes.map((opcao) => <label key={opcao} className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={escolhidos.includes(opcao)} onChange={() => alternar(opcao)}/><span>{opcao}</span></label>)}</div>{escolhidos.includes("Outro") && <Campo label="Especifique"><input className={inputClass} value={outro} onChange={(e) => campoOutro(e.target.value)}/></Campo>}</fieldset>;
}

function ChecklistForm({ valor, atualizar, abrirOcorrencia, motoristaAnterior }) {
  const set = (campo, dado) => atualizar((anterior) => ({ ...anterior, [campo]: dado }));
  return <div className="space-y-3">
    <Secao titulo="Condições e equipamentos">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Recebeu a viatura limpa?"><select className={inputClass} value={valor.limpeza} onChange={(e) => set("limpeza", e.target.value)} required><option value="">Selecione</option><option value="sim">Sim</option><option value="nao">Não</option></select>{valor.limpeza === "nao" && <><input className={`${inputClass} mt-1`} placeholder="Motivo de não ter recebido limpa" value={valor.limpeza_motivo_antecessor} onChange={(e) => set("limpeza_motivo_antecessor", e.target.value)} required/><span className="text-xs text-slate-600">Motorista antecessor no histórico: {motoristaAnterior || "Não registrado"}</span></>}</Campo>
        <Campo label="Nível de combustível"><select className={inputClass} value={valor.combustivel} onChange={(e) => set("combustivel", e.target.value)} required><option value="">Selecione</option>{[["tanque_cheio", "Tanque cheio"], ["meio_tanque", "Meio tanque"], ["um_quarto", "Tanque em 1/4"], ["reserva", "Reserva"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Campo>
      </div>
      <ListaOpcoes label="Ar-condicionado (marque todas que se aplicam)" opcoes={AR_CONDICIONADO.map(([, label]) => label)} escolhidos={valor.ar_condicionado.map((v) => AR_CONDICIONADO.find(([key]) => key === v)?.[1]).filter(Boolean)} aoAlterar={(selecionadas) => set("ar_condicionado", selecionadas.map((label) => AR_CONDICIONADO.find(([, nome]) => nome === label)?.[0]).filter(Boolean))} outro={valor.ar_condicionado_outro} campoOutro={(v) => set("ar_condicionado_outro", v)}/>
      <ListaOpcoes label="Kit de ferramentas (marque itens ausentes)" opcoes={FERRAMENTAS} escolhidos={valor.kit_ferramentas} aoAlterar={(v) => set("kit_ferramentas", v)} outro={valor.ferramentas_outro} campoOutro={(v) => set("ferramentas_outro", v)}/>
      <ListaOpcoes label="Verificar possíveis alterações nos itens (marque todas que se aplicam)" opcoes={EQUIPAMENTOS} escolhidos={valor.alteracoes_equipamentos} aoAlterar={(v) => set("alteracoes_equipamentos", v)} outro={valor.alteracoes_equipamentos_outro} campoOutro={(v) => set("alteracoes_equipamentos_outro", v)}/>
      {valor.alteracoes_equipamentos.some((item) => !["Sem alterações", "Outro"].includes(item)) && <p className="rounded bg-amber-50 p-2 text-xs text-amber-900">Para relatar avaria, defeito ou fato operacional nesses itens, registre uma ocorrência separada.</p>}
      <div className="grid gap-3 sm:grid-cols-2"><Campo label="Nível de óleo do motor"><select className={inputClass} value={valor.nivel_oleo} onChange={(e) => set("nivel_oleo", e.target.value)} required><option value="">Selecione</option>{[["alto", "Alto"], ["medio", "Médio"], ["baixo", "Baixo"], ["outro", "Outro"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>{valor.nivel_oleo === "outro" && <input className={`${inputClass} mt-1`} placeholder="Especifique" value={valor.nivel_oleo_outro} onChange={(e) => set("nivel_oleo_outro", e.target.value)} required/>}</Campo><Campo label="Nível do líquido de arrefecimento"><select className={inputClass} value={valor.arrefecimento} onChange={(e) => set("arrefecimento", e.target.value)} required><option value="">Selecione</option>{[["alto", "Alto"], ["medio", "Médio"], ["baixo", "Baixo"], ["outro", "Outro"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>{valor.arrefecimento === "outro" && <input className={`${inputClass} mt-1`} placeholder="Especifique" value={valor.arrefecimento_outro} onChange={(e) => set("arrefecimento_outro", e.target.value)} required/>}</Campo></div>
      <div className="grid gap-3 sm:grid-cols-2"><Campo label="Situação dos pneus"><select className={inputClass} value={valor.pneus} onChange={(e) => set("pneus", e.target.value)} required><option value="">Selecione</option><option value="bom">Em boas condições</option><option value="desgaste">Com desgaste</option><option value="inadequado">Inadequado</option><option value="outro">Outro</option></select><input className={`${inputClass} mt-1`} placeholder="Detalhe a situação dos pneus" value={valor.pneus_detalhe} onChange={(e) => set("pneus_detalhe", e.target.value)} required/></Campo><Campo label="Situação dos freios"><select className={inputClass} value={valor.freios} onChange={(e) => set("freios", e.target.value)} required><option value="">Selecione</option><option value="otimo">Ótimo</option><option value="bom">Bom</option><option value="ruim">Ruim</option></select></Campo></div>
      <Campo label="Observações gerais de inspeção"><textarea className={inputClass} rows="3" maxLength="3000" value={valor.observacoes_gerais} onChange={(e) => set("observacoes_gerais", e.target.value)}/></Campo>
    </Secao>
    {abrirOcorrencia && <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><button type="button" onClick={abrirOcorrencia} className="font-bold underline">Registrar ocorrência</button></div>}
  </div>;
}

export default function CheckinsViaturas({ user }) {
  const [dados, setDados] = useState({ viaturas: [], checkins: [], ocorrencias: [], usuario: null });
  const [erro, setErro] = useState(""); const [sucesso, setSucesso] = useState("");
  const [carregando, setCarregando] = useState(true); const [salvando, setSalvando] = useState(false);
  const [acao, setAcao] = useState("checkin"); const [alvo, setAlvo] = useState("");
  const [tipoEntrada, setTipoEntrada] = useState(""); const [tipoSaida, setTipoSaida] = useState("");
  const [tipoEntradaDetalhe, setTipoEntradaDetalhe] = useState(""); const [tipoSaidaDetalhe, setTipoSaidaDetalhe] = useState(""); const [km, setKm] = useState("");
  const [descricao, setDescricao] = useState(""); const [observacoesSaida, setObservacoesSaida] = useState(""); const [tipoOcorrencia, setTipoOcorrencia] = useState(OCORRENCIAS[0][0]);
  const [checklistEntrada, setChecklistEntrada] = useState(CHECKLIST_VAZIO);
  const [historicoViatura, setHistoricoViatura] = useState({ ocorrencias: [], pagina: 0, tem_mais: false, ultimo_checkin: null });
  const [carregandoHistorico, setCarregandoHistorico] = useState(false); const [erroHistorico, setErroHistorico] = useState("");
  const [fotos, setFotos] = useState([]); const [acoesAbertas, setAcoesAbertas] = useState(false);
  const [viaturaExpandida, setViaturaExpandida] = useState(null);
  const [viaturaOcorrenciasModal, setViaturaOcorrenciasModal] = useState(null);
  const [historicosPainel, setHistoricosPainel] = useState({}); const [carregandoPainel, setCarregandoPainel] = useState({});
  const formRef = useRef(null); const requisicaoHistorico = useRef(0);
  const role = String(dados.usuario?.role || user?.role || "").trim().toLowerCase();
  const ehPolicial = role === "policial";
  const podeBaixarViatura = ["master", "p4"].includes(role);
  const carregar = useCallback(async () => {
    try { setDados(await carregarControleViaturas()); } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const ativos = dados.checkins.filter((item) => item.ativo);
  const usuarioId = dados.usuario?.id || user?.id;
  const checkinsOperacionais = ehPolicial ? ativos.filter((item) => item.responsavel_id === usuarioId) : ativos;
  const idsAtivos = new Set(ativos.map((item) => item.viatura_id));
  const viaturasLivres = dados.viaturas.filter((item) => item.ativo && !idsAtivos.has(item.id) && !["baixada", "inativa"].includes(item.situacao));
  const ultimoCheckinDaViatura = historicoViatura.ultimo_checkin || dados.checkins.filter((item) => item.viatura_id === alvo && !item.ativo).sort((a, b) => new Date(b.data_hora_fim || b.data_hora_inicio) - new Date(a.data_hora_fim || a.data_hora_inicio))[0];
  const checkinSelecionado = ativos.find((item) => item.id === alvo);
  const minhasMovimentacoes = ehPolicial ? dados.checkins.filter((item) => item.iniciado_por === usuarioId) : [];
  const motoristaAnterior = nomePolicial(ultimoCheckinDaViatura?.responsavel_saida || ultimoCheckinDaViatura?.responsavel);
  const identidadeMotorista = nomePolicial(dados.usuario || user);
  const dataHoraAgora = new Date().toLocaleString("pt-BR");

  function limparMovimentacao() {
    setAlvo(""); setKm(""); setTipoEntrada(""); setTipoSaida(""); setTipoEntradaDetalhe(""); setTipoSaidaDetalhe(""); setChecklistEntrada(CHECKLIST_VAZIO); setFotos([]); setObservacoesSaida("");
  }
  function selecionarViatura(id) {
    requisicaoHistorico.current += 1;
    setAlvo(id);
    const viatura = dados.viaturas.find((item) => item.id === id);
    setKm(viatura?.quilometragem_atual ?? "");
    setHistoricoViatura({ ocorrencias: [], pagina: 0, tem_mais: false, ultimo_checkin: null });
    setErroHistorico("");
  }
  async function alternarViatura(id) {
    if (viaturaExpandida === id) { setViaturaExpandida(null); return; }
    setViaturaExpandida(id);
    if (!ehPolicial || historicosPainel[id]) return;
    setCarregandoPainel((anterior) => ({ ...anterior, [id]: true }));
    try {
      const resultado = await carregarHistoricoOcorrenciasViatura(id, 1);
      setHistoricosPainel((anterior) => ({ ...anterior, [id]: resultado }));
    } catch (e) {
      setHistoricosPainel((anterior) => ({ ...anterior, [id]: { erro: e.message, ocorrencias: [] } }));
    } finally {
      setCarregandoPainel((anterior) => ({ ...anterior, [id]: false }));
    }
  }
  async function carregarHistoricoViatura(viaturaId, pagina, acumular) {
    const requisicao = ++requisicaoHistorico.current;
    setCarregandoHistorico(true); setErroHistorico("");
    try {
      const resultado = await carregarHistoricoOcorrenciasViatura(viaturaId, pagina);
      if (requisicao !== requisicaoHistorico.current) return;
      setHistoricoViatura((anterior) => ({
        ocorrencias: acumular ? [...anterior.ocorrencias, ...(resultado.ocorrencias || [])] : (resultado.ocorrencias || []),
        pagina: resultado.pagina || pagina,
        tem_mais: Boolean(resultado.tem_mais),
        ultimo_checkin: resultado.ultimo_checkin || null,
      }));
    } catch (e) {
      if (requisicao === requisicaoHistorico.current) setErroHistorico(e.message || "Não foi possível consultar as ocorrências.");
    } finally {
      if (requisicao === requisicaoHistorico.current) setCarregandoHistorico(false);
    }
  }
  async function visualizarOcorrencias(viatura) {
    setViaturaOcorrenciasModal(viatura);
    setHistoricoViatura({ ocorrencias: [], pagina: 0, tem_mais: false, ultimo_checkin: null });
    await carregarHistoricoViatura(viatura.id, 1, false);
  }
  function abrirAcao(valor) {
    if (valor !== "checkin" && !checkinsOperacionais.length) {
      setErro("Não há check-in ativo para registrar ocorrência ou realizar check-out.");
      return;
    }
    const ativoInicial = ehPolicial ? checkinsOperacionais[0] : checkinsOperacionais.length === 1 ? checkinsOperacionais[0] : null;
    setAcao(valor); setTipoEntrada(""); setTipoSaida(""); setTipoEntradaDetalhe(""); setTipoSaidaDetalhe("");
    setAlvo(valor === "checkin" ? "" : ativoInicial?.id || "");
    setKm(valor === "ocorrencia" ? (ativoInicial?.viatura?.quilometragem_atual ?? "") : "");
    setDescricao(""); setObservacoesSaida(""); setFotos([]); setErro("");
  }

  async function enviar(event) {
    event.preventDefault(); setSalvando(true); setErro(""); setSucesso("");
    try {
      if (fotos.some((foto) => foto.size > 2 * 1024 * 1024) || fotos.reduce((total, foto) => total + foto.size, 0) > 2_700_000) {
        throw new Error("Cada foto pode ter até 2 MB, com limite combinado de 2,7 MB por envio.");
      }
      const selecionados = acao === "checkout" ? [] : await Promise.all([...fotos].map((file) => new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file);
      })));
      const checklist = acao === "checkin" ? { ...checklistEntrada } : {};
      const payload = { acao, tipo: acao === "ocorrencia" ? tipoOcorrencia : acao === "checkin" ? tipoEntrada : tipoSaida, tipo_detalhe: acao === "checkin" ? tipoEntradaDetalhe : tipoSaidaDetalhe, quilometragem: Number(km), checklist, observacoes: acao === "checkout" ? observacoesSaida : null, fotos: selecionados };
      if (acao === "checkin") Object.assign(payload, { viatura_id: alvo });
      else { Object.assign(payload, { checkin_id: alvo }); if (acao === "ocorrencia") Object.assign(payload, { descricao }); }
      await registrarMovimentacao(payload);
      if (acao === "ocorrencia") {
        setDescricao(""); setFotos([]);
        setSucesso("Ocorrência registrada. O check-in permanece ativo e o checklist continua preservado.");
        setAcoesAbertas(false);
      } else {
        limparMovimentacao();
        setSucesso(acao === "checkin" ? "Check-in registrado." : "Check-out registrado.");
        setAcoesAbertas(false);
      }
      await carregar();
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  }

  const viaturaResumo = dados.viaturas.find((item) => item.id === alvo);
  const kmAtualResumo = viaturaResumo?.quilometragem_atual;
  const kmProximaTroca = viaturaResumo?.km_proxima_troca_oleo;
  const kmRestanteOleo = kmAtualResumo != null && kmProximaTroca != null ? Number(kmProximaTroca) - Number(kmAtualResumo) : null;
  async function atualizarResumoOperacional() {
    await carregar();
  }
  const resumoOperacional = acao === "checkin" && alvo && <section className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-bold text-slate-900">Resumo operacional · {viaturaResumo?.identificacao || "Viatura"}</h3><p className="text-xs text-slate-600">Quilometragem oficial: <strong>{kmAtualResumo == null ? "Não registrada" : `${kmAtualResumo} km`}</strong></p><p className="text-xs text-slate-600">Próxima troca de óleo: <strong>{kmProximaTroca == null ? "Dado não disponível" : `${kmProximaTroca} km`}</strong></p></div><button type="button" onClick={atualizarResumoOperacional} disabled={carregando || carregandoHistorico} className="rounded border border-blue-200 bg-white px-2 py-1 text-xs font-semibold text-blue-800 disabled:opacity-50">Atualizar resumo</button></div>
    {kmRestanteOleo != null && kmRestanteOleo < 500 && <p role="status" className="rounded-md border border-red-300 bg-red-50 p-2 font-semibold text-red-800">{kmRestanteOleo <= 0 ? `A troca de óleo está vencida em ${Math.abs(kmRestanteOleo)} km. Avise o P4 para atualizar a previsão após a manutenção.` : `A troca de óleo está próxima: restam ${kmRestanteOleo} km. Avise o P4 para programar a manutenção.`}</p>}
  </section>;
  const formulario = <>{resumoOperacional}<form ref={formRef} onSubmit={enviar} className="space-y-4 rounded-xl border bg-white p-4 shadow-sm md:p-5">
    <div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-sm font-semibold text-slate-700">Fluxo:</span><button type="button" onClick={() => abrirAcao("checkin")} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${acao === "checkin" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}><LogIn size={16}/>Check-in</button>{checkinsOperacionais.length > 0 && <><span className="text-slate-400">→</span><button type="button" onClick={() => abrirAcao("ocorrencia")} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${acao === "ocorrencia" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}><AlertTriangle size={16}/>Registrar ocorrência (opcional)</button><span className="text-slate-400">→</span><button type="button" onClick={() => abrirAcao("checkout")} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${acao === "checkout" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}><LogOut size={16}/>Check-out</button></>}</div>
    {acao === "checkin" && <><div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2"><div><span className="text-xs text-slate-500">Motorista autenticado</span><p className="text-sm font-semibold text-slate-900">{identidadeMotorista}</p><p className="text-xs text-slate-600">{dados.usuario?.unidade || user?.unidade || "Unidade não informada"}</p></div><div><span className="text-xs text-slate-500">Data e horário de início</span><p className="text-sm font-semibold text-slate-900">Registrados pelo servidor no envio</p><p className="text-xs text-slate-600">Agora: {dataHoraAgora}</p></div></div><Campo label="Viatura"><select className={inputClass} required value={alvo} onChange={(e) => selecionarViatura(e.target.value)}><option value="">Selecione</option>{viaturasLivres.map((v) => <option key={v.id} value={v.id}>{v.identificacao} · {v.placa}</option>)}</select></Campo><div className="grid gap-2 sm:grid-cols-2"><Campo label="Tipo de check-in"><select className={inputClass} value={tipoEntrada} onChange={(e) => { setTipoEntrada(e.target.value); setTipoEntradaDetalhe(""); }} required><option value="">Selecione</option>{ENTRADAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Campo>{tipoEntrada === "outras_situacoes" && <Campo label="Finalidade específica (opcional)"><input className={inputClass} value={tipoEntradaDetalhe} onChange={(e) => setTipoEntradaDetalhe(e.target.value)} maxLength={300} placeholder="Descreva a finalidade da entrada, se necessário"/></Campo>}</div>{alvo && <><button type="button" onClick={() => visualizarOcorrencias(dados.viaturas.find((v) => v.id === alvo))} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">Visualizar ocorrências da viatura</button><section className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm"><h3 className="font-bold">Referência da última saída</h3><p>Quilometragem oficial atual: <strong>{dados.viaturas.find((v) => v.id === alvo)?.quilometragem_atual ?? "Não registrada"} km</strong>. A quilometragem inicial sugerida vem do cadastro atual da viatura.</p>{!ehPolicial && (ultimoCheckinDaViatura ? <><p>{dataHora(ultimoCheckinDaViatura.data_hora_fim)} · saída {rotuloTipoMovimentacao(ultimoCheckinDaViatura.tipo_saida)}{ultimoCheckinDaViatura.tipo_saida_detalhe ? ` · ${ultimoCheckinDaViatura.tipo_saida_detalhe}` : ""} · KM final {ultimoCheckinDaViatura.km_final ?? "—"} · responsável {nomePolicial(ultimoCheckinDaViatura.responsavel_saida || ultimoCheckinDaViatura.responsavel)}</p><ResumoChecklistViatura titulo="Consultar checklist de saída anterior" checklist={ultimoCheckinDaViatura.checklist_saida}/><p className="text-xs">Observações: {ultimoCheckinDaViatura.observacoes_saida || "Nenhuma registrada"}</p><GaleriaFotos fotos={ultimoCheckinDaViatura.fotos_saida_urls}/></> : <p className="text-slate-600">Ainda não há check-out anterior registrado neste módulo.</p>)}</section></>}<Secao titulo="Quilometragem inicial"><Campo label="Quilometragem observada no painel"><input className={inputClass} type="number" min="0" step="0.1" required value={km} onChange={(e) => setKm(e.target.value)}/>{alvo && dados.viaturas.find((v) => v.id === alvo)?.quilometragem_atual != null && Number(km) !== Number(dados.viaturas.find((v) => v.id === alvo)?.quilometragem_atual) && <span className="text-xs font-semibold text-amber-800">Diverge da quilometragem oficial. O registro será recusado até a divergência ser conferida e o cadastro oficial corrigido por fluxo autorizado.</span>}</Campo></Secao><ChecklistForm valor={checklistEntrada} atualizar={setChecklistEntrada} motoristaAnterior={motoristaAnterior}/></>}
    {acao === "checkout" && <>{checkinsOperacionais.length === 0 ? <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Não há check-in ativo para este usuário. Registre um check-in antes de realizar o check-out.</p> : ehPolicial ? <div className={`${inputClass} bg-slate-50`}>Viatura do check-in ativo: {checkinSelecionado?.viatura?.identificacao} · {checkinSelecionado?.viatura?.placa}</div> : <Campo label="Check-in ativo"><select className={inputClass} required value={alvo} onChange={(e) => { setAlvo(e.target.value); setKm(""); setObservacoesSaida(""); }}><option value="">Selecione</option>{ativos.map((c) => <option key={c.id} value={c.id}>{c.viatura?.identificacao} · {c.viatura?.placa} — {nomePolicial(c.responsavel)}</option>)}</select></Campo>}<div className="grid gap-2 sm:grid-cols-2"><Campo label="Tipo de check-out"><select className={inputClass} value={tipoSaida} onChange={(e) => { setTipoSaida(e.target.value); setTipoSaidaDetalhe(""); }} required><option value="">Selecione</option>{SAIDAS.filter(([v]) => v !== "baixa_definitiva" || podeBaixarViatura).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Campo>{tipoSaida === "outras_situacoes" && <Campo label="Finalidade específica (opcional)"><input className={inputClass} value={tipoSaidaDetalhe} onChange={(e) => setTipoSaidaDetalhe(e.target.value)} maxLength={300} placeholder="Descreva o motivo da saída, se necessário"/></Campo>}</div><Secao titulo="Encerramento"><Campo label="Quilometragem final"><input className={inputClass} type="number" min="0" step="0.1" required value={km} onChange={(e) => setKm(e.target.value)}/></Campo><Campo label="Observações"><textarea className={inputClass} rows="3" maxLength="3000" value={observacoesSaida} onChange={(e) => setObservacoesSaida(e.target.value)} placeholder="Informações relevantes sobre o check-out (opcional)"/></Campo><p className="text-xs text-slate-600">A data e o horário de encerramento são registrados pelo servidor.</p></Secao></>}
    {acao === "ocorrencia" && <><Campo label="Check-in ativo"><select className={inputClass} required value={alvo} onChange={(e) => { const c = checkinsOperacionais.find((item) => item.id === e.target.value); setAlvo(e.target.value); setKm(c?.viatura?.quilometragem_atual ?? ""); }}><option value="">Selecione</option>{checkinsOperacionais.map((c) => <option key={c.id} value={c.id}>{c.viatura?.identificacao} · {c.viatura?.placa} — {nomePolicial(c.responsavel)}</option>)}</select></Campo>{checkinSelecionado && <button type="button" onClick={() => visualizarOcorrencias(checkinSelecionado.viatura)} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">Visualizar ocorrências da viatura</button>}<Campo label="Tipo de ocorrência"><select className={inputClass} value={tipoOcorrencia} onChange={(e) => setTipoOcorrencia(e.target.value)}>{OCORRENCIAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Campo><Campo label="Descrição"><textarea className={inputClass} rows="4" required maxLength="5000" placeholder={tipoOcorrencia === "abastecimento" ? "Descreva a situação: saldo insuficiente, falta de tempo por ocorrência/flagrante, composição anterior, vales pendentes, cartão bloqueado ou outro motivo." : "Descreva o fato ocorrido."} value={descricao} onChange={(e) => setDescricao(e.target.value)}/></Campo><Campo label="Quilometragem no momento"><input className={inputClass} type="number" min="0" step="0.1" required value={km} onChange={(e) => setKm(e.target.value)}/></Campo><p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">Registrada por: {identidadeMotorista}. Registrar ocorrência não encerra o check-in nem altera a situação operacional da viatura.</p></>}
    {acao !== "checkout" && <Campo label="Fotos (até 5 imagens JPEG/PNG/WebP; limite combinado aplicado ao salvar)"><input className={inputClass} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => setFotos([...e.target.files].slice(0, 5))}/></Campo>}
    <button disabled={salvando || carregando || ((acao === "checkout" || acao === "ocorrencia") && !checkinSelecionado)} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50">{salvando ? "Salvando…" : acao === "checkin" ? "Registrar check-in" : acao === "checkout" ? "Encerrar checkout" : "Registrar ocorrência"}</button>
  </form></>;

  return <main className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">Check-in e Check-out de Viaturas</h1><p className="text-sm text-slate-600">Movimentações, disponibilidade e ocorrências da frota.</p></div><div className="flex gap-2">{!ehPolicial && <button onClick={() => { abrirAcao("checkin"); setAcoesAbertas(true); }} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">Ações da viatura</button>}<button onClick={() => { setCarregando(true); setErro(""); carregar(); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><RefreshCw size={16}/> Atualizar</button></div></header>
    {erro && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{erro}</div>}{sucesso && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{sucesso}</div>}
    {ehPolicial && <section>{formulario}</section>}
    {ehPolicial && minhasMovimentacoes.length > 0 && <details className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><summary className="cursor-pointer font-semibold text-slate-900">Minhas movimentações · compartilhar checklist completo</summary><div className="mt-3 space-y-2">{minhasMovimentacoes.map((movimento) => <div key={movimento.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3"><p className="text-sm text-slate-700">{movimento.viatura?.identificacao || "Viatura"} · {movimento.viatura?.placa || "—"} · {dataHora(movimento.data_hora_inicio)} · {movimento.ativo ? "Em serviço" : "Encerrada"}</p><BotaoCompartilharChecklist checkinId={movimento.id}/></div>)}</div></details>}
    {!ehPolicial && (
    <section className="rounded-xl border bg-white p-4 shadow-sm"><h2 className="mb-3 font-bold text-slate-900">Viaturas</h2>{carregando ? <p className="text-sm text-slate-500">Carregando…</p> : dados.viaturas.length === 0 ? <p className="text-sm text-slate-500">Nenhuma viatura disponível para consulta.</p> : <div className="divide-y">{dados.viaturas.map((viatura) => {
      const checkinsViatura = dados.checkins.filter((item) => item.viatura_id === viatura.id);
      const ocorrenciasViatura = ehPolicial ? (historicosPainel[viatura.id]?.ocorrencias || []) : dados.ocorrencias.filter((item) => item.viatura_id === viatura.id);
      const aberta = viaturaExpandida === viatura.id;
      return <article key={viatura.id} className="py-1"><button type="button" aria-expanded={aberta} onClick={() => alternarViatura(viatura.id)} className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-3 text-left hover:bg-slate-50"><span className="font-semibold text-slate-900">{viatura.identificacao} · {viatura.placa}</span><ChevronDown size={18} className={`shrink-0 text-slate-500 transition-transform ${aberta ? "rotate-180" : ""}`}/></button>{aberta && <div className="space-y-4 px-2 pb-4 text-sm">
        <section><h3 className="font-semibold">Situação</h3><p className="text-slate-600">{viatura.situacao || (checkinsViatura.some((item) => item.ativo) ? "Em operação" : "Sem check-in ativo")}</p></section>
        {!ehPolicial && <section><h3 className="mb-2 font-semibold">Movimentações</h3>{checkinsViatura.length ? <div className="space-y-2">{checkinsViatura.map((c) => <article key={c.id} className="rounded border p-2"><p className="font-medium">{c.ativo ? "Em operação" : "Encerrada"} · {nomePolicial(c.responsavel)}</p><p className="text-xs text-slate-600">{c.km_inicial} km → {c.km_final ?? "—"} km · Entrada {dataHora(c.data_hora_inicio)}{c.data_hora_fim ? ` · Saída ${dataHora(c.data_hora_fim)}` : ""}</p><GaleriaFotos fotos={[...(c.fotos_entrada_urls || []), ...(c.fotos_saida_urls || [])]}/></article>)}</div> : <p className="text-slate-500">Nenhuma movimentação registrada.</p>}</section>}
        {ehPolicial && checkinsViatura.filter((item) => item.ativo).map((c) => <section key={c.id}><h3 className="mb-1 font-semibold">Sua utilização atual</h3><p className="text-slate-600">Desde {dataHora(c.data_hora_inicio)} · {c.km_inicial} km iniciais</p><GaleriaFotos fotos={c.fotos_entrada_urls}/></section>)}
        <section><h3 className="mb-2 font-semibold">Ocorrências</h3>{ehPolicial && carregandoPainel[viatura.id] ? <p className="text-slate-500">Carregando ocorrências...</p> : historicosPainel[viatura.id]?.erro ? <p role="alert" className="text-rose-700">{historicosPainel[viatura.id].erro}</p> : ocorrenciasViatura.length ? <div className="space-y-2">{ocorrenciasViatura.map((o) => <article key={o.id} className="rounded border border-amber-200 p-2"><div className="flex flex-wrap justify-between gap-2"><strong>{o.tipo} · {dataHora(o.data_hora)}</strong><span className={o.analisada ? "text-slate-500" : "text-amber-700"}>{o.analisada ? "Analisada" : "Pendente"}</span></div><p className="mt-1 text-slate-700">{o.descricao}</p><p className="text-xs text-slate-500">Registrada por {nomePolicial(o.policial)} · {o.quilometragem} km</p><GaleriaFotos fotos={o.fotos_urls}/>{o.acompanhamentos?.length > 0 && <div className="mt-2 space-y-2 border-t pt-2"><h4 className="font-semibold">Comentários e atualizações</h4>{o.acompanhamentos.map((a) => <div key={a.id} className="rounded bg-slate-50 p-2"><p className="text-xs font-medium">{a.tipo === "encaminhamento_oficina" ? `Encaminhada para oficina${a.oficina ? `: ${a.oficina}` : ""}` : "Comentário"} · {nomePolicial(a.policial)} · {dataHora(a.created_at)}</p><p className="mt-1 whitespace-pre-wrap">{a.comentario}</p></div>)}</div>}</article>)}</div> : <p className="text-slate-500">Nenhuma ocorrência disponível nesta consulta.</p>}</section>
      </div>}</article>;
    })}</div>}</section>
    )}
    {viaturaOcorrenciasModal && <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`Ocorrências da viatura ${viaturaOcorrenciasModal.identificacao}`}><div className="relative max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl"><button type="button" onClick={() => setViaturaOcorrenciasModal(null)} className="absolute right-3 top-3 rounded-full p-2 text-slate-600 hover:bg-slate-100" aria-label="Fechar"><X size={20}/></button><h2 className="mb-1 pr-12 text-lg font-bold text-slate-900">Ocorrências da viatura</h2><p className="mb-4 text-sm text-slate-600">{viaturaOcorrenciasModal.identificacao} · {viaturaOcorrenciasModal.placa}</p>{carregandoHistorico ? <p className="py-6 text-sm text-slate-500">Carregando ocorrências...</p> : erroHistorico ? <p role="alert" className="py-4 text-sm text-rose-700">{erroHistorico}</p> : historicoViatura.ocorrencias.length === 0 ? <p className="py-6 text-sm text-slate-600">Não há ocorrências registradas para esta viatura.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left text-sm"><thead><tr className="border-b bg-slate-50"><th className="p-2">Data e hora</th><th className="p-2">Descrição</th><th className="p-2">Situação</th><th className="p-2">Autor</th><th className="p-2">Comentários e encaminhamentos</th></tr></thead><tbody>{historicoViatura.ocorrencias.map((o) => <tr key={o.id} className="border-b align-top"><td className="whitespace-nowrap p-2">{dataHora(o.data_hora)}</td><td className="max-w-xs whitespace-pre-wrap p-2">{o.descricao}</td><td className="whitespace-nowrap p-2">{o.analisada ? "Analisada" : "Pendente de análise"}</td><td className="p-2">{nomePolicial(o.policial)}</td><td className="min-w-64 p-2">{o.acompanhamentos?.length ? <ul className="space-y-2">{o.acompanhamentos.map((a) => <li key={a.id} className="rounded bg-slate-50 p-2"><p className="text-xs font-semibold">{a.tipo === "encaminhamento_oficina" ? `Encaminhamento para oficina${a.oficina ? `: ${a.oficina}` : ""}` : "Comentário / atualização"} · {nomePolicial(a.policial)} · {dataHora(a.created_at)}</p><p className="mt-1 whitespace-pre-wrap">{a.comentario}</p></li>)}</ul> : <span className="text-slate-500">Nenhum comentário ou encaminhamento.</span>}</td></tr>)}</tbody></table></div>}{historicoViatura.tem_mais && <button type="button" disabled={carregandoHistorico} onClick={() => carregarHistoricoViatura(viaturaOcorrenciasModal.id, historicoViatura.pagina + 1, true)} className="mt-3 text-sm font-semibold text-blue-700 underline disabled:opacity-50">Carregar ocorrências anteriores</button>}</div></div>}
    {!ehPolicial && acoesAbertas && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Ações de movimentação da viatura"><div className="relative max-h-[95vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-slate-100 p-3 sm:rounded-2xl sm:p-5"><button type="button" onClick={() => setAcoesAbertas(false)} className="absolute right-3 top-3 rounded-full p-2 text-slate-600 hover:bg-slate-200" aria-label="Fechar"><X size={20}/></button><h2 className="mb-4 pr-12 text-lg font-bold text-slate-900">Ações da viatura</h2>{formulario}</div></div>}
  </main>;
}
