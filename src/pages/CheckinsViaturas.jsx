import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Car, CheckCircle2, Clock3, LogIn, LogOut, RefreshCw, X } from "lucide-react";
import { carregarControleViaturas, registrarMovimentacao } from "../services/checkinsViaturasService";

const ENTRADAS = [["inicio_servico", "Início de serviço"], ["retirada_oficina", "Retirada da oficina"], ["recebimento_opm", "Recebimento de outra OPM"], ["viatura_nova", "Recebimento de viatura nova"]];
const SAIDAS = [["fim_servico", "Fim de serviço"], ["encaminhamento_oficina", "Encaminhamento à oficina"], ["devolucao_opm", "Devolução à OPM de origem"], ["baixa_definitiva", "Baixa definitiva"]];
const OCORRENCIAS = [["avaria", "Avaria"], ["acidente", "Acidente"], ["pane", "Pane"], ["abastecimento", "Abastecimento"], ["outro", "Outro"]];
const AR_CONDICIONADO = [["funcionando", "Funcionando"], ["ventilador_sem_gas", "Ventilador funciona, mas não tem gás"], ["ventilador_nao_funciona", "Ventilador não funciona"], ["sem_alteracoes", "Sem alterações"], ["outro", "Outro"]];
const FERRAMENTAS = ["Macaco", "Chave de rodas", "Triângulo de sinalização", "Pneu de estepe", "Tapetes", "Sem alterações", "Outro"];
const EQUIPAMENTOS = ["Rádio / HT", "Smartphone", "Intermitente", "Sinal sonoro", "Buzina", "Faróis", "Luz de direção (piscas)", "Luz de ré", "Sem alterações", "Outro"];
const CHECKLIST_VAZIO = {
  limpeza: "", limpeza_motivo_antecessor: "", combustivel: "",
  ar_condicionado: [], ar_condicionado_outro: "", kit_ferramentas: [], ferramentas_outro: "",
  alteracoes_equipamentos: [], alteracoes_equipamentos_outro: "", nivel_oleo: "", nivel_oleo_outro: "", pneus: "", pneus_detalhe: "",
  arrefecimento: "", arrefecimento_outro: "", freios: "", km_proxima_troca_oleo: "", observacoes_gerais: "",
};
const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
const nomePolicial = (p) => p ? [p.posto_graduacao, p.numeral, p.nome_guerra || p.nome_completo, p.matricula].filter(Boolean).join(" · ") : "—";
const dataHora = (v) => v ? new Date(v).toLocaleString("pt-BR") : "—";

function Campo({ label, children }) { return <label className="grid gap-1 text-sm font-medium text-slate-700">{label}{children}</label>; }
function Secao({ titulo, children }) { return <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3"><legend className="px-1 text-sm font-bold text-slate-800">{titulo}</legend>{children}</fieldset>; }
function GaleriaFotos({ fotos = [] }) { return fotos.length ? <div className="mt-2 flex flex-wrap gap-2">{fotos.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" aria-label="Abrir foto anexada"><img src={url} alt="Foto anexada ao registro" className="h-16 w-16 rounded border object-cover" loading="lazy"/></a>)}</div> : null; }
function ResumoChecklist({ titulo, checklist }) {
  if (!checklist || !Object.keys(checklist).length) return <p className="text-sm text-slate-500">Checklist não registrado.</p>;
  return <details className="rounded border bg-white p-3"><summary className="cursor-pointer text-sm font-semibold text-slate-800">{titulo}</summary><dl className="mt-2 grid gap-2 sm:grid-cols-2">{Object.entries(checklist).filter(([chave, valor]) => valor !== null && valor !== "" && !["motorista_antecessor"].includes(chave)).map(([chave, valor]) => <div key={chave} className="text-xs"><dt className="font-semibold text-slate-600">{chave.replaceAll("_", " ")}</dt><dd className="text-slate-800">{Array.isArray(valor) ? valor.join(", ") : String(valor)}</dd></div>)}</dl></details>;
}
function ResumoOcorrencias({ ocorrencias = [] }) {
  return ocorrencias.length ? <div className="space-y-2">{ocorrencias.map((ocorrencia) => <article key={ocorrencia.id} className="rounded border border-amber-200 bg-amber-50 p-2 text-xs"><strong>{ocorrencia.tipo} · {dataHora(ocorrencia.data_hora)} · {ocorrencia.quilometragem} km</strong><p className="mt-1">{ocorrencia.descricao}</p><GaleriaFotos fotos={ocorrencia.fotos_urls}/><p className="mt-1 text-amber-900">{ocorrencia.analisada ? "Analisada" : "Pendente de análise"}</p></article>)}</div> : <p className="text-sm text-slate-500">Nenhuma ocorrência vinculada a este período.</p>;
}

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
      <Campo label="Quilometragem prevista para a próxima troca de óleo"><input className={inputClass} type="number" min="0" step="0.1" required value={valor.km_proxima_troca_oleo} onChange={(e) => set("km_proxima_troca_oleo", e.target.value)}/></Campo>
      <Campo label="Observações gerais de inspeção"><textarea className={inputClass} rows="3" maxLength="3000" value={valor.observacoes_gerais} onChange={(e) => set("observacoes_gerais", e.target.value)}/></Campo>
    </Secao>
    <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><button type="button" onClick={abrirOcorrencia} className="font-bold underline">Registrar ocorrência</button></div>
  </div>;
}

export default function CheckinsViaturas({ user }) {
  const [dados, setDados] = useState({ viaturas: [], checkins: [], ocorrencias: [], usuario: null });
  const [erro, setErro] = useState(""); const [sucesso, setSucesso] = useState("");
  const [carregando, setCarregando] = useState(true); const [salvando, setSalvando] = useState(false);
  const [acao, setAcao] = useState("checkin"); const [alvo, setAlvo] = useState("");
  const [tipo, setTipo] = useState(ENTRADAS[0][0]); const [km, setKm] = useState("");
  const [descricao, setDescricao] = useState(""); const [tipoOcorrencia, setTipoOcorrencia] = useState(OCORRENCIAS[0][0]);
  const [checklistEntrada, setChecklistEntrada] = useState(CHECKLIST_VAZIO);
  const [checklistSaida, setChecklistSaida] = useState(CHECKLIST_VAZIO);
  const [fotos, setFotos] = useState([]); const [acoesAbertas, setAcoesAbertas] = useState(false);
  const formRef = useRef(null); const registrarOcorrenciaDepoisDoCheckin = useRef(false); const retornoOcorrencia = useRef(null);
  const role = String(dados.usuario?.role || user?.role || "").trim().toLowerCase();
  const ehPolicial = role === "policial";
  const podeBaixarViatura = ["master", "p4"].includes(role);
  const carregar = useCallback(async () => {
    try { setDados(await carregarControleViaturas()); } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const ativos = dados.checkins.filter((item) => item.ativo);
  const pendentes = dados.ocorrencias.filter((item) => !item.analisada);
  const idsAtivos = new Set(ativos.map((item) => item.viatura_id));
  const viaturasLivres = dados.viaturas.filter((item) => item.ativo && !idsAtivos.has(item.id) && !["baixada", "inativa"].includes(item.situacao));
  const ultimoCheckinDaViatura = dados.checkins.filter((item) => item.viatura_id === alvo && !item.ativo).sort((a, b) => new Date(b.data_hora_fim || b.data_hora_inicio) - new Date(a.data_hora_fim || a.data_hora_inicio))[0];
  const checkinSelecionado = ativos.find((item) => item.id === alvo);
  const ocorrenciasPeriodo = dados.ocorrencias.filter((item) => item.checkin_id === checkinSelecionado?.id);
  const ocorrenciasAnteriores = dados.ocorrencias.filter((item) => item.checkin_id === ultimoCheckinDaViatura?.id);
  const motoristaAnterior = nomePolicial(ultimoCheckinDaViatura?.responsavel_saida || ultimoCheckinDaViatura?.responsavel);
  const identidadeMotorista = nomePolicial(dados.usuario || user);
  const dataHoraAgora = new Date().toLocaleString("pt-BR");

  function limparMovimentacao() {
    setAlvo(""); setKm(""); setTipo(ENTRADAS[0][0]); setChecklistEntrada(CHECKLIST_VAZIO); setChecklistSaida(CHECKLIST_VAZIO); setFotos([]);
  }
  function abrirAcao(valor) {
    retornoOcorrencia.current = null;
    setAcao(valor); setTipo(valor === "checkout" ? SAIDAS[0][0] : ENTRADAS[0][0]); setAlvo(""); setKm(""); setDescricao(""); setFotos([]);
  }
  function irParaOcorrencia() {
    if (acao === "checkin") {
      registrarOcorrenciaDepoisDoCheckin.current = true;
      formRef.current?.requestSubmit();
      return;
    }
    if (acao === "checkout") retornoOcorrencia.current = { acao: "checkout", alvo };
    setAcao("ocorrencia"); setAlvo(acao === "checkout" ? alvo : ""); setDescricao(""); setFotos([]);
    if (!ehPolicial) setAcoesAbertas(true);
  }

  async function enviar(event) {
    event.preventDefault(); setSalvando(true); setErro(""); setSucesso("");
    try {
      if (fotos.some((foto) => foto.size > 2 * 1024 * 1024) || fotos.reduce((total, foto) => total + foto.size, 0) > 2_700_000) {
        throw new Error("Cada foto pode ter até 2 MB, com limite combinado de 2,7 MB por envio.");
      }
      const selecionados = await Promise.all([...fotos].map((file) => new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file);
      })));
      const checklist = acao === "checkin" ? { ...checklistEntrada, km_proxima_troca_oleo: checklistEntrada.km_proxima_troca_oleo === "" ? null : Number(checklistEntrada.km_proxima_troca_oleo) } : acao === "checkout" ? { ...checklistSaida, km_proxima_troca_oleo: checklistSaida.km_proxima_troca_oleo === "" ? null : Number(checklistSaida.km_proxima_troca_oleo) } : {};
      const payload = { acao, tipo: acao === "ocorrencia" ? tipoOcorrencia : tipo, quilometragem: Number(km), checklist, observacoes: null, fotos: selecionados };
      if (acao === "checkin") Object.assign(payload, { viatura_id: alvo });
      else { Object.assign(payload, { checkin_id: alvo }); if (acao === "ocorrencia") Object.assign(payload, { descricao }); }
      const resposta = await registrarMovimentacao(payload);
      const registroCriado = Array.isArray(resposta.registro) ? resposta.registro[0] : resposta.registro;
      if (acao === "ocorrencia") {
        setDescricao(""); setFotos([]);
        setSucesso("Ocorrência registrada. O check-in permanece ativo e o checklist continua preservado.");
        setAcoesAbertas(false);
        if (retornoOcorrencia.current) {
          setAcao(retornoOcorrencia.current.acao); setAlvo(retornoOcorrencia.current.alvo); retornoOcorrencia.current = null;
        }
      } else {
        const iniciarOcorrencia = acao === "checkin" && registrarOcorrenciaDepoisDoCheckin.current;
        registrarOcorrenciaDepoisDoCheckin.current = false;
        if (iniciarOcorrencia) {
          setAcao("ocorrencia"); setAlvo(registroCriado?.id || ""); setKm(String(km)); setDescricao(""); setFotos([]);
          setSucesso(registroCriado?.id ? "Check-in registrado. O checklist foi preservado; conclua agora o registro separado da ocorrência." : "Check-in registrado e checklist preservado. Selecione o check-in ativo para concluir o registro separado da ocorrência.");
        } else {
          limparMovimentacao();
          setSucesso(acao === "checkin" ? "Check-in registrado." : "Check-out registrado.");
          setAcoesAbertas(false);
        }
      }
      await carregar();
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  }

  const formulario = <form ref={formRef} onSubmit={enviar} className="space-y-4 rounded-xl border bg-white p-4 shadow-sm md:p-5">
    <div className="flex flex-wrap gap-2">{[["checkin", LogIn, "Check-in"], ["ocorrencia", AlertTriangle, "Registrar ocorrência"], ["checkout", LogOut, "Check-out"]].map(([valor, Icon, label]) => <button type="button" key={valor} onClick={() => abrirAcao(valor)} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${acao === valor ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}><Icon size={16}/>{label}</button>)}</div>
    {acao === "checkin" && <><div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2"><div><span className="text-xs text-slate-500">Motorista autenticado</span><p className="text-sm font-semibold text-slate-900">{identidadeMotorista}</p><p className="text-xs text-slate-600">{dados.usuario?.unidade || user?.unidade || "Unidade não informada"}</p></div><div><span className="text-xs text-slate-500">Data e horário de início</span><p className="text-sm font-semibold text-slate-900">Registrados pelo servidor no envio</p><p className="text-xs text-slate-600">Agora: {dataHoraAgora}</p></div></div><Campo label="Viatura"><select className={inputClass} required value={alvo} onChange={(e) => { const viatura = dados.viaturas.find((v) => v.id === e.target.value); setAlvo(e.target.value); setKm(viatura?.quilometragem_atual ?? ""); }}><option value="">Selecione</option>{viaturasLivres.map((v) => <option key={v.id} value={v.id}>{v.identificacao} · {v.placa}</option>)}</select></Campo>{alvo && <section className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm"><h3 className="font-bold">Referência da última saída</h3><p>Quilometragem oficial atual: <strong>{dados.viaturas.find((v) => v.id === alvo)?.quilometragem_atual ?? "Não registrada"} km</strong>. A quilometragem inicial sugerida vem do cadastro atual da viatura.</p>{ultimoCheckinDaViatura ? <><p>{dataHora(ultimoCheckinDaViatura.data_hora_fim)} · saída {ultimoCheckinDaViatura.tipo_saida || "—"} · KM final {ultimoCheckinDaViatura.km_final ?? "—"} · responsável {nomePolicial(ultimoCheckinDaViatura.responsavel_saida || ultimoCheckinDaViatura.responsavel)}</p><ResumoChecklist titulo="Consultar checklist de saída anterior" checklist={ultimoCheckinDaViatura.checklist_saida}/><p className="text-xs">Observações: {ultimoCheckinDaViatura.observacoes_saida || "Nenhuma registrada"}</p><GaleriaFotos fotos={ultimoCheckinDaViatura.fotos_saida_urls}/><h4 className="font-semibold">Ocorrências do período anterior</h4><ResumoOcorrencias ocorrencias={ocorrenciasAnteriores}/></> : <p className="text-slate-600">Ainda não há check-out anterior registrado neste módulo.</p>}</section>}<Secao titulo="Quilometragem inicial"><Campo label="Quilometragem observada no painel"><input className={inputClass} type="number" min="0" step="0.1" required value={km} onChange={(e) => setKm(e.target.value)}/>{alvo && dados.viaturas.find((v) => v.id === alvo)?.quilometragem_atual != null && Number(km) !== Number(dados.viaturas.find((v) => v.id === alvo)?.quilometragem_atual) && <span className="text-xs font-semibold text-amber-800">Diverge da quilometragem oficial. O registro será recusado até a divergência ser conferida e o cadastro oficial corrigido por fluxo autorizado.</span>}</Campo></Secao><ChecklistForm valor={checklistEntrada} atualizar={setChecklistEntrada} abrirOcorrencia={irParaOcorrencia} motoristaAnterior={motoristaAnterior}/></>}
    {acao === "checkout" && <><Campo label="Check-in ativo"><select className={inputClass} required value={alvo} onChange={(e) => { const c = ativos.find((item) => item.id === e.target.value); setAlvo(e.target.value); setKm(c?.viatura?.quilometragem_atual ?? c?.km_inicial ?? ""); setChecklistSaida(c?.checklist_entrada ? { ...CHECKLIST_VAZIO, ...c.checklist_entrada } : CHECKLIST_VAZIO); }}><option value="">Selecione</option>{ativos.map((c) => <option key={c.id} value={c.id}>{c.viatura?.identificacao} · {c.viatura?.placa} — {nomePolicial(c.responsavel)}</option>)}</select></Campo>{checkinSelecionado && <section className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm"><h3 className="font-bold">Dados do check-in ativo</h3><p>{checkinSelecionado.viatura?.identificacao} · {checkinSelecionado.viatura?.placa} · {nomePolicial(checkinSelecionado.responsavel)}</p><p>Entrada: {dataHora(checkinSelecionado.data_hora_inicio)} · KM inicial {checkinSelecionado.km_inicial} · tipo {checkinSelecionado.tipo_entrada}</p><p>Observações da entrada: {checkinSelecionado.observacoes_entrada || "Nenhuma registrada"}</p><GaleriaFotos fotos={checkinSelecionado.fotos_entrada_urls}/><ResumoChecklist titulo="Checklist de entrada (referência)" checklist={checkinSelecionado.checklist_entrada}/><h4 className="font-semibold">Ocorrências vinculadas a este período</h4><ResumoOcorrencias ocorrencias={ocorrenciasPeriodo}/><p className="text-xs text-blue-900">Confira e atualize as condições para a saída.</p></section>}<Campo label="Responsável pelo encerramento"><div className={`${inputClass} bg-slate-50`}>{identidadeMotorista}</div></Campo><Secao titulo="Encerramento"><Campo label="Tipo de saída"><select className={inputClass} value={tipo} onChange={(e) => setTipo(e.target.value)}>{SAIDAS.filter(([v]) => v !== "baixa_definitiva" || podeBaixarViatura).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Campo><Campo label="Quilometragem final"><input className={inputClass} type="number" min="0" step="0.1" required value={km} onChange={(e) => setKm(e.target.value)}/></Campo><p className="text-xs text-slate-600">A data e o horário de encerramento são registrados pelo servidor.</p></Secao><ChecklistForm valor={checklistSaida} atualizar={setChecklistSaida} abrirOcorrencia={irParaOcorrencia}/></>}
    {acao === "ocorrencia" && <><Campo label="Check-in ativo"><select className={inputClass} required value={alvo} onChange={(e) => { const c = ativos.find((item) => item.id === e.target.value); setAlvo(e.target.value); setKm(c?.viatura?.quilometragem_atual ?? c?.km_inicial ?? ""); }}><option value="">Selecione</option>{ativos.map((c) => <option key={c.id} value={c.id}>{c.viatura?.identificacao} · {c.viatura?.placa} — {nomePolicial(c.responsavel)}</option>)}</select></Campo><Campo label="Tipo de ocorrência"><select className={inputClass} value={tipoOcorrencia} onChange={(e) => setTipoOcorrencia(e.target.value)}>{OCORRENCIAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Campo><Campo label="Descrição"><textarea className={inputClass} rows="4" required maxLength="5000" placeholder={tipoOcorrencia === "abastecimento" ? "Descreva a situação: saldo insuficiente, falta de tempo por ocorrência/flagrante, composição anterior, vales pendentes, cartão bloqueado ou outro motivo." : "Descreva o fato ocorrido."} value={descricao} onChange={(e) => setDescricao(e.target.value)}/></Campo><Campo label="Quilometragem no momento"><input className={inputClass} type="number" min="0" step="0.1" required value={km} onChange={(e) => setKm(e.target.value)}/></Campo><p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">Registrada por: {identidadeMotorista}. Registrar ocorrência não encerra o check-in nem altera a situação operacional da viatura.</p></>}
    <Campo label="Fotos (até 5 imagens JPEG/PNG/WebP; limite combinado aplicado ao salvar)"><input className={inputClass} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => setFotos([...e.target.files].slice(0, 5))}/></Campo>
    <button disabled={salvando || carregando} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50">{salvando ? "Salvando…" : acao === "checkin" ? "Registrar check-in" : acao === "checkout" ? "Encerrar checkout" : "Registrar ocorrência"}</button>
  </form>;

  return <main className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">Check-in e Check-out de Viaturas</h1><p className="text-sm text-slate-600">Movimentações, disponibilidade e ocorrências da frota.</p></div><div className="flex gap-2">{!ehPolicial && <button onClick={() => { abrirAcao("checkin"); setAcoesAbertas(true); }} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">Ações da viatura</button>}<button onClick={() => { setCarregando(true); setErro(""); carregar(); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><RefreshCw size={16}/> Atualizar</button></div></header>
    {erro && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{erro}</div>}{sucesso && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{sucesso}</div>}
    <section className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border bg-white p-4"><div className="flex items-center gap-2 text-sm text-slate-600"><Car size={17}/> Em operação</div><strong className="mt-2 block text-2xl">{ativos.length}</strong></div><div className="rounded-xl border bg-white p-4"><div className="flex items-center gap-2 text-sm text-slate-600"><CheckCircle2 size={17}/> Sem check-in ativo</div><strong className="mt-2 block text-2xl">{viaturasLivres.length}</strong></div><div className="rounded-xl border bg-white p-4"><div className="flex items-center gap-2 text-sm text-slate-600"><AlertTriangle size={17}/> Ocorrências pendentes</div><strong className="mt-2 block text-2xl">{pendentes.length}</strong></div></section>
    {ehPolicial && <section>{formulario}</section>}
    <section className="grid gap-5 lg:grid-cols-2"><div className="rounded-xl border bg-white p-4 shadow-sm"><h2 className="mb-3 flex items-center gap-2 font-bold text-slate-900"><Car size={18}/> Viaturas em operação</h2>{carregando ? <p className="text-sm text-slate-500">Carregando…</p> : ativos.length === 0 ? <p className="text-sm text-slate-500">Não há check-ins ativos.</p> : <div className="space-y-3">{ativos.map((c) => <article key={c.id} className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3"><div className="flex justify-between gap-3"><strong>{c.viatura?.identificacao} · {c.viatura?.placa}</strong><span className="text-xs text-emerald-700">Ativa</span></div><p className="mt-1 text-sm text-slate-600">{nomePolicial(c.responsavel)} · {c.km_inicial} km</p><p className="text-xs text-slate-500">Desde {dataHora(c.data_hora_inicio)}</p>{dados.ocorrencias.some((o) => o.checkin_id === c.id && !o.analisada) && <p className="mt-2 text-xs font-semibold text-amber-700">Ocorrência aguardando análise</p>}<GaleriaFotos fotos={c.fotos_entrada_urls}/></article>)}</div>}</div>
    <div className="rounded-xl border bg-white p-4 shadow-sm"><h2 className="mb-3 flex items-center gap-2 font-bold text-slate-900"><Clock3 size={18}/> Histórico de movimentações</h2><div className="max-h-96 space-y-2 overflow-auto">{dados.checkins.map((c) => <article key={c.id} className="border-b pb-2 text-sm"><div className="flex justify-between gap-2"><strong>{c.viatura?.identificacao} · {c.viatura?.placa}</strong><span className={c.ativo ? "text-emerald-700" : "text-slate-500"}>{c.ativo ? "Em operação" : "Encerrada"}</span></div><p className="text-slate-600">{nomePolicial(c.responsavel)} · {c.km_inicial} km → {c.km_final ?? "—"} km</p><p className="text-xs text-slate-500">Entrada {dataHora(c.data_hora_inicio)}{c.data_hora_fim ? ` · Saída ${dataHora(c.data_hora_fim)}` : ""}</p><GaleriaFotos fotos={[...(c.fotos_entrada_urls || []), ...(c.fotos_saida_urls || [])]}/></article>)}{dados.checkins.length === 0 && <p className="text-sm text-slate-500">Nenhuma movimentação registrada.</p>}</div></div></section>
    <section className="rounded-xl border bg-white p-4 shadow-sm"><h2 className="mb-3 font-bold text-slate-900">Ocorrências</h2>{dados.ocorrencias.length === 0 ? <p className="text-sm text-slate-500">Nenhuma ocorrência registrada.</p> : <div className="grid gap-2 md:grid-cols-2">{dados.ocorrencias.map((o) => <article key={o.id} className="rounded-lg border p-3 text-sm"><div className="flex justify-between gap-2"><strong>{o.viatura?.identificacao} · {o.tipo}</strong><span className={o.analisada ? "text-slate-500" : "text-amber-700"}>{o.analisada ? "Analisada" : "Pendente"}</span></div><p className="mt-1 text-slate-700">{o.descricao}</p><p className="text-xs text-slate-500">{nomePolicial(o.policial)} · {o.quilometragem} km · {dataHora(o.data_hora)}</p><GaleriaFotos fotos={o.fotos_urls}/></article>)}</div>}</section>
    {!ehPolicial && acoesAbertas && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Ações de movimentação da viatura"><div className="relative max-h-[95vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-slate-100 p-3 sm:rounded-2xl sm:p-5"><button type="button" onClick={() => setAcoesAbertas(false)} className="absolute right-3 top-3 rounded-full p-2 text-slate-600 hover:bg-slate-200" aria-label="Fechar"><X size={20}/></button><h2 className="mb-4 pr-12 text-lg font-bold text-slate-900">Ações da viatura</h2>{formulario}</div></div>}
  </main>;
}
