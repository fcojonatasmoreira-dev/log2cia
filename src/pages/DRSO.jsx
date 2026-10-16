import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, CheckCircle2, UserPlus, Trash2, X, LoaderCircle, Pencil, FileSpreadsheet, ChevronDown, ChevronRight } from "lucide-react";
import * as XLSX from "xlsx-js-style";
import { listarDrso, acaoDrso } from "../services/drsoService";
import { Link } from "react-router-dom";
import { listarViaturas } from "../services/viaturasService";

const dataPartesHoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
const hojeISO = `${dataPartesHoje.find(p=>p.type==="year").value}-${dataPartesHoje.find(p=>p.type==="month").value}-${dataPartesHoje.find(p=>p.type==="day").value}`;
const mesAtual = hojeISO.slice(0, 7);
const coresEscala = ["border-emerald-500 bg-emerald-50/40", "border-orange-500 bg-orange-50/40", "border-sky-500 bg-sky-50/40", "border-violet-500 bg-violet-50/40", "border-rose-500 bg-rose-50/40", "border-teal-500 bg-teal-50/40"];
const corDaEscala = (escala) => { const horario = `${escala?.horario_inicio || ""}-${escala?.horario_fim || ""}`; let hash = 0; for (const char of horario) hash = (hash * 31 + char.charCodeAt(0)) >>> 0; return coresEscala[hash % coresEscala.length]; };
const dataBR = (v) => v ? String(v).split("-").reverse().join("/") : "—";
const horaBR = (v) => String(v || "").slice(0,5);
const normalizarBusca = (valor) => String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const pesoHierarquia = (posto) => {
  const p = normalizarBusca(posto).toUpperCase()
    .replace(/[º°]/g, "")
    .replace(/\bSGT\b/g, "SARGENTO")
    .replace(/\bTEN\b/g, "TENENTE")
    .replace(/\bST\b/g, "SUBTENENTE")
    .replace(/\bCB\b/g, "CABO")
    .replace(/\bSD\b/g, "SOLDADO")
    .replace(/\bASP\b/g, "ASPIRANTE")
    .replace(/\bCEL\b/g, "CORONEL")
    .replace(/\bMAJ\b/g, "MAJOR")
    .replace(/\bTC\b/g, "TENENTE CORONEL")
    .replace(/[._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (p.includes("CORONEL") && !p.includes("TENENTE")) return 1;
  if (p.includes("TENENTE CORONEL") || p === "TC") return 2;
  if (p.includes("MAJOR")) return 3;
  if (p.includes("CAPITAO") || p === "CAP") return 4;
  if (p.includes("1 TENENTE") || p.includes("PRIMEIRO TENENTE")) return 5;
  if (p.includes("2 TENENTE") || p.includes("SEGUNDO TENENTE")) return 6;
  if (p.includes("ASPIRANTE")) return 7;
  if (p.includes("SUBTENENTE")) return 8;
  if (p.includes("1 SARGENTO") || p.includes("PRIMEIRO SARGENTO")) return 9;
  if (p.includes("2 SARGENTO") || p.includes("SEGUNDO SARGENTO")) return 10;
  if (p.includes("3 SARGENTO") || p.includes("TERCEIRO SARGENTO")) return 11;
  if (p.includes("CABO")) return 12;
  if (p.includes("SOLDADO")) return 13;
  return 99;
};
// Critério provisório de antiguidade: hierarquia primeiro e numeral crescente
// dentro da mesma graduação. A data da última promoção poderá substituir o numeral futuramente.
const valorNumeral = (valor) => {
  const n = String(valor ?? "").match(/\d+/)?.[0];
  return n == null ? Number.POSITIVE_INFINITY : Number(n);
};
const chavePolicialDRSO = (id, externo = false) => `${externo ? "externo" : "local"}:${id}`;
const chaveVinculoDRSO = (v) => v.chave_policial || chavePolicialDRSO(v.policial_externo_id || v.policial_id, Boolean(v.policial_externo_id));
const compararAntiguidade = (a, b) =>
  pesoHierarquia(a?.posto_graduacao) - pesoHierarquia(b?.posto_graduacao) ||
  valorNumeral(a?.numeral) - valorNumeral(b?.numeral) ||
  String(a?.nome_guerra || a?.nome_completo || "").localeCompare(String(b?.nome_guerra || b?.nome_completo || ""), "pt-BR");

export default function DRSO() {
  const [mes, setMes] = useState(mesAtual);
  const [diaSelecionado, setDiaSelecionado] = useState(hojeISO);
  const [consultaVarOficialAberta, setConsultaVarOficialAberta] = useState(false);
  const [dados, setDados] = useState({ escalas: [], voluntarios: [], policiais: [], viaturas: [], permissoes: { gerenciar: false } });
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [baixandoExcel, setBaixandoExcel] = useState(false);
  const [sucessoExcel, setSucessoExcel] = useState(false);
  const [formAberto, setFormAberto] = useState(false);
  const [escalaEditandoId, setEscalaEditandoId] = useState(null);
  const [externoFormAberto, setExternoFormAberto] = useState(false);
  const [areaSelecionada, setAreaSelecionada] = useState("");
  const [localOutroRascunho, setLocalOutroRascunho] = useState("");
  const [areasSelecionadas, setAreasSelecionadas] = useState([]);
  const [areasExpandidas, setAreasExpandidas] = useState([]);
  const [externoForm, setExternoForm] = useState({ nome_completo:"", nome_guerra:"", matricula:"", numeral:"", posto_graduacao:"Soldado", unidade_origem:"", tipo:"policial" });
  const [policialDireto, setPolicialDireto] = useState({});
  const [viaturas, setViaturas] = useState([]);
  const [regrasEscalaBase, setRegrasEscalaBase] = useState({});
  const [form, setForm] = useState({ data_servico: "", horario_inicio: "06:00", horario_fim: "12:00", local: "", viatura: "", viaturaOutra: "", vagas: 3, observacoes: "", regra_composicao: true, excecao_soldados: false, equipe_oficial: true, compulsoria: false });
  const carregar = useCallback(async () => { setCarregando(true); setErro(""); try { setDados(await listarDrso(mes)); return true; } catch(e) { setErro(e.message); return false; } finally { setCarregando(false); } }, [mes]);
  const atualizarManualmente = async () => { setAtualizando(true); setSucesso(""); try { if (await carregar()) setSucesso("Dados atualizados."); } finally { setAtualizando(false); } };
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { listarViaturas().then(r => setViaturas((r.viaturas || []).filter(v => v.ativo !== false && v.situacao === "operando"))).catch(() => setViaturas([])); }, []);
  const policiaisPorId = useMemo(() => new Map(dados.policiais.map(p => [p.id, p])), [dados.policiais]);
  const policiaisPorChave = useMemo(() => new Map(dados.policiais.map(p => [chavePolicialDRSO(p.id, p.origem_efetivo === "externo"), p])), [dados.policiais]);
  const policialDoVinculo = (v) => policiaisPorChave.get(chaveVinculoDRSO(v)) || { nome_exibicao: v.nome_exibicao };
  const policiais = useMemo(() => new Map(dados.policiais.map(p => [p.id, p.nome_exibicao || p.nome_guerra || p.nome_completo || p.matricula])), [dados.policiais]);
  const funcoesPorEscala = useCallback((escalaId) => {
    const equipe = dados.voluntarios.filter(v => v.escala_id === escalaId && v.status === "selecionado");
    const ordenados = equipe.map(v => ({ ...v, policial: policiaisPorChave.get(chaveVinculoDRSO(v)) })).sort((a,b) => compararAntiguidade(a.policial,b.policial));
    const funcoes = new Map();
    if (!ordenados.length) return funcoes;
    // O mais antigo é sempre comandante, independentemente da função salva anteriormente.
    funcoes.set(chaveVinculoDRSO(ordenados[0]), "Comandante");
    if (ordenados.length >= 3) {
      const motorista = ordenados.at(-1);
      const patrulheiro = ordenados.at(-2);
      const modernos = [patrulheiro, motorista];
      const funcoesAtuais = modernos.map(v => v.funcao);
      const validas = funcoesAtuais.map((funcao, i) => ["Patrulheiro", "Motorista"].includes(funcao) && !funcoesAtuais.some((outra, j) => j !== i && outra === funcao) ? funcao : null);
      const primeira = validas[0] || (validas[1] === "Patrulheiro" ? "Motorista" : "Patrulheiro");
      const segunda = validas[1] || (primeira === "Patrulheiro" ? "Motorista" : "Patrulheiro");
      funcoes.set(chaveVinculoDRSO(modernos[0]), primeira);
      funcoes.set(chaveVinculoDRSO(modernos[1]), segunda);
    } else if (ordenados.length === 2) {
      funcoes.set(chaveVinculoDRSO(ordenados[1]), ordenados[1].funcao === "Motorista" ? "Motorista" : "Patrulheiro");
    }
    return funcoes;
  }, [dados.voluntarios, policiaisPorChave]);
  const policiaisEncontrados = (termo) => {
    const busca = normalizarBusca(termo);
    if (!busca) return [];
    return dados.policiais.filter(p => [p.nome_guerra, p.nome_completo, p.nome_exibicao, p.matricula, p.numeral, p.posto_graduacao].some(campo => normalizarBusca(campo).includes(busca)))
      .sort(compararAntiguidade)
      .slice(0, 8);
  };
  const nomeViatura = (v) => [v?.identificacao, v?.placa].filter(Boolean).join(" · ");
  const macroareas = dados.areas_operacao || [];
  const idsMacroIntegrais = new Set(areasSelecionadas.filter(item => !item.microarea_id).map(item => item.macroarea_id));
  const idsMicroSelecionadas = new Set(areasSelecionadas.filter(item => item.microarea_id).map(item => item.microarea_id));
  const macroareaParcial = (macroarea) => !idsMacroIntegrais.has(macroarea.id) && (macroarea.microareas_operacao || []).some(micro => idsMicroSelecionadas.has(micro.id));
  const alternarMacroarea = (macroarea, selecionar) => setAreasSelecionadas(atual => [
    ...atual.filter(item => item.macroarea_id !== macroarea.id),
    ...(selecionar && macroarea.ativa ? [{ macroarea_id: macroarea.id, microarea_id: null }] : []),
  ]);
  const alternarMicroarea = (macroarea, microarea, selecionar) => setAreasSelecionadas(atual => {
    const atuaisDoGrupo = atual.filter(item => item.macroarea_id === macroarea.id);
    const haviaIntegral = atuaisDoGrupo.some(item => !item.microarea_id);
    let ids = haviaIntegral
      ? (macroarea.microareas_operacao || []).filter(item => item.ativa).map(item => item.id)
      : atuaisDoGrupo.filter(item => item.microarea_id).map(item => item.microarea_id);
    ids = selecionar ? [...new Set([...ids, microarea.id])] : ids.filter(id => id !== microarea.id);
    const microareasAtivas = (macroarea.microareas_operacao || []).filter(item => item.ativa);
    const todosMarcados = microareasAtivas.length > 0 && microareasAtivas.every(item => ids.includes(item.id));
    return [
      ...atual.filter(item => item.macroarea_id !== macroarea.id),
      ...(todosMarcados ? [{ macroarea_id: macroarea.id, microarea_id: null }] : ids.map(id => ({ macroarea_id: macroarea.id, microarea_id: id }))),
    ];
  });
  const alternarTodasAreas = (selecionar) => setAreasSelecionadas(atual => {
    const inativas = atual.filter(item => !macroareas.find(macro => macro.id === item.macroarea_id)?.ativa);
    const ativas = selecionar ? macroareas.filter(macro => macro.ativa).map(macro => ({ macroarea_id: macro.id, microarea_id: null })) : [];
    return [...inativas, ...ativas];
  });
  const rotuloAreas = (escala) => {
    const vinculadas = escala.areas_selecionadas || [];
    if (!vinculadas.length) return escala.local || "—";
    const nomesMacro = [...new Set(vinculadas.map(item => item.macroarea?.nome).filter(Boolean))];
    return [...nomesMacro, escala.area_manual].filter(Boolean).join(" · ") || escala.local || "—";
  };
  const notaMicroareasParciais = (escala) => {
    const porMacro = new Map();
    for (const item of escala.areas_selecionadas || []) {
      if (!item.microarea_id || !item.microarea?.nome) continue;
      const macro = item.macroarea?.nome || "Macroárea";
      if (!porMacro.has(macro)) porMacro.set(macro, []);
      porMacro.get(macro).push(item.microarea.nome);
    }
    return [...porMacro].map(([macro, micros]) => `${macro}: ${micros.join(", ")}`).join("; ");
  };
  const abrirEdicaoEscala = (escala) => {
    const viaturaCadastrada = viaturas.some(item => nomeViatura(item) === escala.viatura);
    setAreasSelecionadas((escala.areas_selecionadas || []).map(area => ({ macroarea_id: area.macroarea_id, microarea_id: area.microarea_id })));
    setAreasExpandidas([...new Set((escala.areas_selecionadas || []).filter(area => area.microarea_id).map(area => area.macroarea_id))]);
    setAreaSelecionada(escala.area_manual ? "__outro__" : "");
    setLocalOutroRascunho(escala.area_manual || "");
    setRegrasEscalaBase(escala.regras && typeof escala.regras === "object" ? escala.regras : {});
    setForm({
      data_servico: escala.data_servico || "",
      horario_inicio: horaBR(escala.horario_inicio),
      horario_fim: horaBR(escala.horario_fim),
      local: escala.local || "",
      viatura: viaturaCadastrada ? escala.viatura : "__outra__",
      viaturaOutra: viaturaCadastrada ? "" : escala.viatura || "",
      vagas: escala.vagas || 1,
      observacoes: escala.observacoes || "",
      regra_composicao: escala.regras?.composicao_hierarquica !== false,
      excecao_soldados: escala.regras?.excecao_equipe_soldados === true,
      equipe_oficial: escala.regras?.escolha_equipe_oficial !== false,
      compulsoria: escala.regras?.compulsoria === true,
    });
    setEscalaEditandoId(escala.id);
    setFormAberto(true);
  };
  const iniciarNovaEscala = () => {
    setEscalaEditandoId(null);
    setAreaSelecionada("");
    setLocalOutroRascunho("");
    setAreasSelecionadas([]);
    setAreasExpandidas([]);
    setRegrasEscalaBase({});
    setForm({ data_servico: "", horario_inicio: "06:00", horario_fim: "12:00", local: "", viatura: "", viaturaOutra: "", vagas: 3, observacoes: "", regra_composicao: true, excecao_soldados: false, equipe_oficial: true, compulsoria: false });
    setFormAberto(true);
  };
  const voluntariosPorEscala = (id) => dados.voluntarios.filter(v => v.escala_id === id);
  const horasEscala = (escala) => {
    const [hi, mi] = String(escala?.horario_inicio || "0:0").split(":").map(Number);
    const [hf, mf] = String(escala?.horario_fim || "0:0").split(":").map(Number);
    let minutos = (hf * 60 + mf) - (hi * 60 + mi);
    if (minutos <= 0) minutos += 1440;
    return minutos / 60;
  };
  const diasNoMes = useMemo(() => {
    const [ano, numeroMes] = mes.split("-").map(Number);
    return new Date(ano, numeroMes, 0).getDate();
  }, [mes]);
  const contagemPorDia = useMemo(() => {
    const contagem = new Map();
    for (const escala of dados.escalas) contagem.set(escala.data_servico, (contagem.get(escala.data_servico) || 0) + 1);
    return contagem;
  }, [dados.escalas]);
  const escalasVisiveis = useMemo(() => diaSelecionado ? dados.escalas.filter(e => e.data_servico === diaSelecionado) : dados.escalas, [dados.escalas, diaSelecionado]);
  const diaProvisorio = diaSelecionado || (mes === mesAtual ? hojeISO : "");
  const varOficialAcumulado = useMemo(() => {
    const resumo = new Map(dados.policiais.map(policial => {
      const chave = chavePolicialDRSO(policial.id, policial.origem_efetivo === "externo");
      return [chave, { chave, policial, horas: 0, horasCompulsorias: 0 }];
    }));
    const limite = diaProvisorio || `${mes}-32`;
    const contabilizadas = new Set();
    for (const vinculo of dados.voluntarios) {
      if (vinculo.status !== "selecionado") continue;
      const escala = dados.escalas.find(item => item.id === vinculo.escala_id);
      if (!escala || escala.status !== "fechada" || escala.data_servico.slice(0, 7) !== mes || escala.data_servico >= limite) continue;
      const chave = chaveVinculoDRSO(vinculo);
      const participacao = `${escala.id}:${chave}`;
      if (contabilizadas.has(participacao)) continue;
      contabilizadas.add(participacao);
      const policial = policiaisPorChave.get(chave) || { id: vinculo.policial_externo_id || vinculo.policial_id, origem_efetivo: vinculo.policial_externo_id ? "externo" : "local", nome_exibicao: vinculo.nome_exibicao };
      const item = resumo.get(chave) || { chave, policial, horas: 0, horasCompulsorias: 0 };
      if (escala.regras?.compulsoria === true) item.horasCompulsorias += horasEscala(escala);
      else item.horas += horasEscala(escala);
      resumo.set(chave, item);
    }
    return [...resumo.values()].sort((a, b) => compararAntiguidade(a.policial, b.policial));
  }, [dados.policiais, dados.voluntarios, dados.escalas, policiaisPorChave, diaProvisorio, mes]);
  const varProvisorioHoje = useMemo(() => {
    if (!diaProvisorio || mes !== diaProvisorio.slice(0, 7)) return [];
    const resumo = new Map();
    const horasAnterioresPorChave = new Map(varOficialAcumulado.map(item => [item.chave, item.horas]));
    for (const vinculo of dados.voluntarios) {
      const escala = dados.escalas.find(item => item.id === vinculo.escala_id);
      if (!escala || escala.data_servico !== diaProvisorio || !["voluntario", "selecionado", "desistencia_solicitada"].includes(vinculo.status)) continue;
      const chave = chaveVinculoDRSO(vinculo);
      const policial = policiaisPorChave.get(chave) || { id: vinculo.policial_externo_id || vinculo.policial_id, origem_efetivo: vinculo.policial_externo_id ? "externo" : "local", nome_exibicao: vinculo.nome_exibicao };
      const horasAnteriores = horasAnterioresPorChave.get(chave) || 0;
      if (!resumo.has(chave)) resumo.set(chave, { chave, policial, horasAnteriores, horasHoje: 0 });
    }
    const contabilizadas = new Set();
    for (const vinculo of dados.voluntarios) {
      if (vinculo.status !== "selecionado") continue;
      const escala = dados.escalas.find(item => item.id === vinculo.escala_id);
      if (!escala || escala.data_servico !== diaProvisorio || !["aberta", "fechada"].includes(escala.status)) continue;
      const chave = chaveVinculoDRSO(vinculo);
      const participacao = `${escala.id}:${chave}`;
      if (contabilizadas.has(participacao)) continue;
      contabilizadas.add(participacao);
      const item = resumo.get(chave);
      if (item && escala.regras?.compulsoria !== true) item.horasHoje += horasEscala(escala);
    }
    return [...resumo.values()].map(item => ({ ...item, horasProjetadas: item.horasAnteriores + item.horasHoje }))
      .sort((a, b) => compararAntiguidade(a.policial, b.policial));
  }, [dados.voluntarios, dados.escalas, policiaisPorChave, varOficialAcumulado, diaProvisorio, mes]);
  const aplicarAtualizacaoLocal = (body, resultado) => {
    if (body.acao === "escalar_diretamente" && resultado?.vinculo) {
      const vinculo = resultado.vinculo;
      const externoVinculo = Boolean(vinculo.policial_externo_id);
      const pessoaId = vinculo.policial_externo_id || vinculo.policial_id;
      const chave = chavePolicialDRSO(pessoaId, externoVinculo);
      const policial = policiaisPorChave.get(chave);
      const atualizado = { ...vinculo, chave_policial: chave, is_externo: externoVinculo, nome_exibicao: policial?.nome_exibicao || "Policial" };
      setDados(prev => ({ ...prev, voluntarios: [...prev.voluntarios.filter(v => v.id !== vinculo.id && !(v.escala_id === vinculo.escala_id && chaveVinculoDRSO(v) === chave)), atualizado] }));
      return true;
    }
    if (body.acao === "remover_inclusao_direta" && resultado?.vinculo_id) {
      setDados(prev => ({ ...prev, voluntarios: prev.voluntarios.filter(v => v.id !== resultado.vinculo_id) }));
      return true;
    }
    if ((body.acao === "reabrir_escala" || body.acao === "fechar_escala") && resultado?.escala) {
      setDados(prev => {
        const voluntariosPorId = new Map(prev.voluntarios.map(v => [v.id, v]));
        const atualizadosPorId = new Map((resultado.voluntarios || []).map(v => [v.id, v]));
        const voluntariosAtualizados = resultado.voluntarios
          ? [...prev.voluntarios.map(v => atualizadosPorId.has(v.id) ? { ...v, ...atualizadosPorId.get(v.id) } : v), ...resultado.voluntarios.filter(v => !voluntariosPorId.has(v.id))]
          : prev.voluntarios;
        return { ...prev, escalas: prev.escalas.map(e => e.id === resultado.escala.id ? { ...e, ...resultado.escala } : e), voluntarios: voluntariosAtualizados };
      });
      return true;
    }
    return false;
  };
  const executar = async (body, mensagem) => { setEnviando(true); setErro(""); setSucesso(""); try { const resultado = await acaoDrso(body); setSucesso(mensagem); if (!aplicarAtualizacaoLocal(body, resultado)) await carregar(); return resultado; } catch(e) { setErro(e.message); return null; } finally { setEnviando(false); } };
  const salvarEscala = async (e) => {
    e.preventDefault();
    const nomesMacroSelecionadas = [...new Set(areasSelecionadas.map(item => macroareas.find(macro => macro.id === item.macroarea_id)?.nome).filter(Boolean))];
    const areaManual = areaSelecionada === "__outro__" ? localOutroRascunho.trim() : "";
    const localCompatibilidade = [...nomesMacroSelecionadas, areaManual].filter(Boolean).join(" · ") || form.local.trim();
    if (!localCompatibilidade) {
      setErro("Selecione ao menos uma área cadastrada ou informe um local em “Outro”.");
      return;
    }
    const dadosEscala = {
      data_servico: form.data_servico,
      horario_inicio: form.horario_inicio,
      horario_fim: form.horario_fim,
      local: localCompatibilidade,
      area_manual: areaManual || null,
      areas: areasSelecionadas,
      viatura: form.viatura === "__outra__" ? form.viaturaOutra.trim() : form.viatura,
      vagas: Number(form.vagas),
      observacoes: form.observacoes,
      regras: { ...regrasEscalaBase, composicao_hierarquica: form.regra_composicao, excecao_equipe_soldados: form.excecao_soldados, escolha_equipe_oficial: form.equipe_oficial, compulsoria: form.compulsoria },
    };
    const editando = Boolean(escalaEditandoId);
    const resultado = await executar(editando ? { acao: "atualizar_escala", escala_id: escalaEditandoId, ...dadosEscala } : { acao: "criar_escala", ...dadosEscala }, editando ? "Escala atualizada." : "Escala cadastrada.");
    if (!resultado) return;
    setForm(prev => ({ ...prev, compulsoria: false }));
    setFormAberto(false);
    setEscalaEditandoId(null);
    if (editando && dadosEscala.data_servico.slice(0, 7) !== mes) {
      setMes(dadosEscala.data_servico.slice(0, 7));
      setDiaSelecionado(dadosEscala.data_servico);
    }
  };
  const criarExterno = async (e) => { e.preventDefault(); const resultado = await executar({acao:"criar_policial_externo",...externoForm}, "Policial externo cadastrado."); if (!resultado) return; if (resultado?.senha_inicial) window.alert(`Senha inicial de ${resultado.policial_externo?.nome_guerra || "policial"}: ${resultado.senha_inicial}\nO policial deverá alterá-la no primeiro acesso.`); setExternoForm({nome_completo:"",nome_guerra:"",matricula:"",numeral:"",posto_graduacao:"Soldado",unidade_origem:"",tipo:"policial"}); setExternoFormAberto(false); };
  const usuarioLogado = (()=>{try{return JSON.parse(localStorage.getItem("log2cia_user")||"{}")}catch{return {}}})();
  const externo = usuarioLogado.tipo_acesso === "drso_externo" || dados.permissoes.externo;
  const exportarEscalasFechadas = async () => {
    if (baixandoExcel || externo) return;
    setBaixandoExcel(true);
    setSucessoExcel(false);
    setErro("");
    setSucesso("");
    try {
      await new Promise(resolve => setTimeout(resolve, 0));
      const escalasFechadas = escalasVisiveis
        .filter(escala => escala.status === "fechada")
        .slice()
        .sort((a, b) => `${a.data_servico}|${a.horario_inicio}|${a.local || ""}|${a.id}`.localeCompare(`${b.data_servico}|${b.horario_inicio}|${b.local || ""}|${b.id}`));
      if (!escalasFechadas.length) throw new Error("Não há escalas fechadas no período exibido para exportar.");

      const paletaEscalas = ["E2F0D9", "DDEBF7", "FFF2CC", "E4DFEC", "FCE4D6", "D9EAD3", "CFE2F3", "F4CCCC"];
      const coresPorEscala = new Map(escalasFechadas.map((escala, indice) => [escala.id, paletaEscalas[indice % paletaEscalas.length]]));
      const linhas = [];
      for (const escala of escalasFechadas) {
        const equipe = voluntariosPorEscala(escala.id)
          .filter(vinculo => vinculo.status === "selecionado")
          .slice()
          .sort((a, b) => {
            const policialA = policiaisPorChave.get(chaveVinculoDRSO(a));
            const policialB = policiaisPorChave.get(chaveVinculoDRSO(b));
            return compararAntiguidade(policialA, policialB);
          });
        for (const vinculo of equipe) {
          const policial = policiaisPorChave.get(chaveVinculoDRSO(vinculo)) || {};
          linhas.push({ escala, vinculo, policial });
        }
      }
      if (!linhas.length) throw new Error("As escalas fechadas do período não têm participantes selecionados para exportar.");

      const agora = new Date();
      const perfilEmissor = dados.policiais.find(policial => policial.id === dados.usuario_id) || usuarioLogado;
      const emissor = [
        perfilEmissor?.posto_graduacao || perfilEmissor?.posto || perfilEmissor?.graduacao,
        perfilEmissor?.numeral || perfilEmissor?.numero || perfilEmissor?.numero_operacional,
        perfilEmissor?.nome_guerra || perfilEmissor?.nome_de_guerra || perfilEmissor?.nome_completo,
        perfilEmissor?.matricula,
      ].filter(Boolean).join(" - ") || "Usuário autenticado não identificado";
      const cabecalhos = ["ORD.", "POSTO/GRAD.", "MATRÍCULA", "NUMERAL", "NOME", "FUNÇÃO"];
      const planilha = [
        ["LOG2CIA — RELATÓRIO DE ESCALAS DRSO FECHADAS"],
        [`Emitido em: ${agora.toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" })} às ${agora.toLocaleTimeString("pt-BR", { timeZone: "America/Fortaleza" })}`],
        [`Emitido por: ${emissor}`],
        [`Período exibido: ${diaSelecionado ? dataBR(diaSelecionado) : mes}`],
      ];
      const linhasDeEquipe = [];
      const ordemPorEscala = new Map();
      let escalaAtualId = null;
      for (const registro of linhas) {
        const { escala, vinculo, policial } = registro;
        if (escala.id !== escalaAtualId) {
          escalaAtualId = escala.id;
          const identificacaoEquipe = [
            escala.viatura,
            rotuloAreas(escala),
            dataBR(escala.data_servico),
            `${horaBR(escala.horario_inicio)} às ${horaBR(escala.horario_fim)}`,
          ].filter(Boolean).join(" – ");
          linhasDeEquipe.push({ tipo: "titulo", escala, valores: [identificacaoEquipe] });
          const notaAreas = notaMicroareasParciais(escala);
          if (notaAreas) linhasDeEquipe.push({ tipo: "nota", escala, valores: [`Microáreas selecionadas: ${notaAreas}`] });
          linhasDeEquipe.push({ tipo: "cabecalho", escala, valores: cabecalhos });
        }
        const ordem = (ordemPorEscala.get(escala.id) || 0) + 1;
        ordemPorEscala.set(escala.id, ordem);
        linhasDeEquipe.push({
          tipo: "policial",
          escala,
          valores: [
            ordem,
            policial.posto_graduacao || "—",
            policial.matricula || "—",
            policial.numeral || "—",
            policial.nome_guerra || policial.nome_completo || vinculo.nome_exibicao || "Policial",
            vinculo.funcao || "—",
          ],
        });
      }
      const linhaDadosInicial = planilha.length;
      planilha.push(...linhasDeEquipe.map(item => item.valores));
      const ws = XLSX.utils.aoa_to_sheet(planilha);
      const ultimaColuna = cabecalhos.length - 1;
      ws["!merges"] = [0, 1, 2, 3, ...linhasDeEquipe.flatMap((item, indice) => ["titulo", "nota"].includes(item.tipo) ? [linhaDadosInicial + indice] : [])]
        .map(r => ({ s: { r, c: 0 }, e: { r, c: ultimaColuna } }));
      ws["!cols"] = [8, 20, 18, 14, 28, 18].map(wch => ({ wch }));
      ws["A1"].s = { font: { bold: true, sz: 14, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1F4E78" } }, alignment: { horizontal: "center", vertical: "center" } };
      for (let linha = 1; linha <= 3; linha += 1) ws[`A${linha + 1}`].s = { font: { bold: linha === 2, color: { rgb: "334155" } }, alignment: { vertical: "center" } };
      linhasDeEquipe.forEach((item, indice) => {
        const linhaPlanilha = linhaDadosInicial + indice;
        const cor = coresPorEscala.get(item.escala.id);
        if (item.tipo === "cabecalho") {
          for (let coluna = 0; coluna <= ultimaColuna; coluna += 1) {
            ws[XLSX.utils.encode_cell({ r: linhaPlanilha, c: coluna })].s = {
              font: { bold: true, color: { rgb: "FFFFFF" } },
              fill: { fgColor: { rgb: "475569" } },
              alignment: { horizontal: "center", vertical: "center", wrapText: true },
              border: { bottom: { style: "thin", color: { rgb: "FFFFFF" } } },
            };
          }
          return;
        }
        if (item.tipo === "titulo" || item.tipo === "nota") {
          ws[XLSX.utils.encode_cell({ r: linhaPlanilha, c: 0 })].s = {
            font: { bold: item.tipo === "titulo", italic: item.tipo === "nota", color: { rgb: "0F172A" } },
            fill: { fgColor: { rgb: cor } },
            alignment: { horizontal: "center", vertical: "center", wrapText: true },
            border: { top: { style: "thin", color: { rgb: "64748B" } }, bottom: { style: "thin", color: { rgb: "64748B" } } },
          };
          return;
        }
        for (let coluna = 0; coluna <= ultimaColuna; coluna += 1) {
          const celula = XLSX.utils.encode_cell({ r: linhaPlanilha, c: coluna });
          ws[celula].s = {
            font: coluna === 5 ? { bold: true, color: { rgb: "1E3A8A" } } : undefined,
            fill: { fgColor: { rgb: cor } },
            alignment: { horizontal: "center", vertical: "center", wrapText: true },
            border: { bottom: { style: "thin", color: { rgb: "FFFFFF" } } },
          };
        }
      });
      ws["!rows"] = [{ hpt: 24 }, { hpt: 20 }, { hpt: 20 }, { hpt: 20 }, { hpt: 8 }, ...linhasDeEquipe.map(item => ({ hpt: item.tipo === "cabecalho" ? 24 : item.tipo === "titulo" ? 22 : item.tipo === "nota" ? 20 : 20 }))];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Escalas DRSO");
      const dataArquivo = agora.toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" });
      XLSX.writeFile(wb, `relatorio_escalas_drso_fechadas_${dataArquivo}.xlsx`);
      setSucesso("Relatório Excel das escalas fechadas baixado.");
      setSucessoExcel(true);
      setTimeout(() => setSucessoExcel(false), 3000);
    } catch (e) {
      setErro(e.message || "Não foi possível gerar ou baixar o relatório Excel.");
    } finally {
      setBaixandoExcel(false);
    }
  };
  return <div className="space-y-5">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-800">Escalas DRSO</h1><p className="text-sm text-slate-500">Voluntariado, pré-escala e VAR mensal.</p></div><div className="flex flex-wrap gap-2"><button onClick={atualizarManualmente} disabled={carregando || baixandoExcel || atualizando} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"><RefreshCw className={`w-4 h-4 ${atualizando ? "animate-spin" : ""}`}/>{atualizando?"Atualizando...":"Atualizar"}</button>{!externo && <button onClick={exportarEscalasFechadas} disabled={carregando || baixandoExcel} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 disabled:cursor-not-allowed disabled:opacity-60">{baixandoExcel?<RefreshCw className="h-4 w-4 animate-spin"/>:sucessoExcel?<CheckCircle2 className="h-4 w-4"/>:<FileSpreadsheet className="h-4 w-4"/>}{baixandoExcel?"Gerando...":sucessoExcel?"Relatório baixado":"Exportar escalas fechadas"}</button>}{dados.permissoes.gerenciar && <><button onClick={()=>setExternoFormAberto(v=>!v)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold">Cadastrar policial externo</button><Link to="/drso/efetivo-externo" className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">Gerenciar efetivo externo</Link></>}</div></div>
    {erro && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{erro}</div>}{sucesso && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{sucesso}</div>}
    {externoFormAberto && dados.permissoes.gerenciar && <form onSubmit={criarExterno} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3"><div className="flex items-center justify-between"><h2 className="font-bold">Cadastrar policial externo para DRSO</h2><button type="button" onClick={()=>setExternoFormAberto(false)}><X className="h-4 w-4"/></button></div><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"><label className="text-sm">Nome completo<input required value={externoForm.nome_completo} onChange={e=>setExternoForm({...externoForm,nome_completo:e.target.value})} className="mt-1 w-full rounded-lg border p-2"/></label><label className="text-sm">Nome de guerra<input required value={externoForm.nome_guerra} onChange={e=>setExternoForm({...externoForm,nome_guerra:e.target.value})} className="mt-1 w-full rounded-lg border p-2"/></label><label className="text-sm">Matrícula (login)<input required value={externoForm.matricula} onChange={e=>setExternoForm({...externoForm,matricula:e.target.value})} className="mt-1 w-full rounded-lg border p-2"/></label><label className="text-sm">Numeral<input value={externoForm.numeral} onChange={e=>setExternoForm({...externoForm,numeral:e.target.value})} className="mt-1 w-full rounded-lg border p-2"/></label><label className="text-sm">Posto/graduação<select required value={externoForm.posto_graduacao} onChange={e=>setExternoForm({...externoForm,posto_graduacao:e.target.value})} className="mt-1 w-full rounded-lg border p-2">{["Soldado","Cabo","3º Sargento","2º Sargento","1º Sargento","Subtenente","Aspirante a Oficial","2º Tenente","1º Tenente","Capitão","Major","Tenente-Coronel","Coronel"].map(x=><option key={x}>{x}</option>)}</select></label><label className="text-sm">Unidade de origem<input required value={externoForm.unidade_origem} onChange={e=>setExternoForm({...externoForm,unidade_origem:e.target.value})} className="mt-1 w-full rounded-lg border p-2"/></label><label className="text-sm">Categoria<select value={externoForm.tipo} onChange={e=>setExternoForm({...externoForm,tipo:e.target.value})} className="mt-1 w-full rounded-lg border p-2"><option value="policial">Policial externo</option><option value="oficial">Oficial externo</option></select></label></div><p className="text-xs text-slate-500">A senha inicial seguirá o padrão do efetivo local: numeral, quando cadastrado; caso contrário, os últimos quatro dígitos da matrícula. O primeiro acesso exigirá a troca por uma senha forte. Entregue a senha inicial por canal seguro.</p><div className="flex justify-end"><button disabled={enviando} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Cadastrar conta externa</button></div></form>}
    <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-slate-800">Calendário do mês</h2><p className="text-xs text-slate-500">Selecione um dia para visualizar somente as escalas e a prévia do VAR daquela data.</p></div><div className="flex flex-wrap items-center gap-2 sm:justify-end"><label className="text-sm">Mês <input type="month" value={mes} onChange={e=>{setMes(e.target.value);setDiaSelecionado("");}} className="ml-2 rounded-lg border p-2"/></label>{diaSelecionado && <button onClick={() => setDiaSelecionado("")} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold"><X className="h-3 w-3"/>Ver mês inteiro</button>}</div></div>
      <div className="grid grid-cols-7 sm:grid-cols-10 md:grid-cols-15 gap-1.5">
        {Array.from({ length: diasNoMes }, (_, i) => {
          const dia = String(i + 1).padStart(2, "0");
          const data = `${mes}-${dia}`;
          const quantidade = contagemPorDia.get(data) || 0;
          const selecionado = diaSelecionado === data;
          return <button key={data} type="button" onClick={() => setDiaSelecionado(selecionado ? "" : data)} aria-pressed={selecionado} className={`min-h-12 rounded-lg border px-1 py-1 text-center transition ${selecionado ? "border-blue-600 bg-blue-600 text-white" : quantidade ? "border-blue-200 bg-blue-50 text-blue-900 hover:bg-blue-100" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}><span className="block text-sm font-semibold">{i + 1}</span><span className={`block text-[10px] ${selecionado ? "text-blue-100" : "text-slate-500"}`}>{quantidade ? `${quantidade} escala${quantidade > 1 ? "s" : ""}` : "—"}</span></button>;
        })}
      </div>
      {diaSelecionado && <p className="text-sm font-semibold text-blue-700">Visualizando {dataBR(diaSelecionado)}</p>}
    </section>
    {dados.permissoes.gerenciar && <div className="flex justify-end"><button onClick={iniciarNovaEscala} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"><Plus className="w-4 h-4"/>Nova escala</button></div>}
    {formAberto && <form onSubmit={salvarEscala} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4"><h2 className="font-bold text-slate-800">{escalaEditandoId ? "Editar escala" : "Cadastrar escala"}</h2><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <label className="text-sm">Data<input required type="date" value={form.data_servico} onChange={e=>setForm({...form,data_servico:e.target.value})} className="mt-1 w-full rounded-lg border p-2"/></label><label className="text-sm">Horário inicial<input required type="time" value={form.horario_inicio} onChange={e=>setForm({...form,horario_inicio:e.target.value})} className="mt-1 w-full rounded-lg border p-2"/></label><label className="text-sm">Horário final<input required type="time" value={form.horario_fim} onChange={e=>setForm({...form,horario_fim:e.target.value})} className="mt-1 w-full rounded-lg border p-2"/></label><fieldset className="text-sm sm:col-span-2 rounded-xl border border-slate-200 p-3"><legend className="px-1 font-medium">Áreas de atuação</legend><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><label className="flex items-center gap-2"><input type="checkbox" checked={macroareas.filter(m=>m.ativa).length>0&&macroareas.filter(m=>m.ativa).every(m=>idsMacroIntegrais.has(m.id))} onChange={e=>alternarTodasAreas(e.target.checked)}/>Selecionar todas as macroáreas</label><span className="text-xs text-slate-500">Áreas inativas já vinculadas são preservadas.</span></div><div className="max-h-64 space-y-2 overflow-y-auto">{macroareas.filter(m=>m.ativa||areasSelecionadas.some(a=>a.macroarea_id===m.id)).map(macro=>{const selecionada=idsMacroIntegrais.has(macro.id);const parcial=macroareaParcial(macro);const microareas=(macro.microareas_operacao||[]).filter(m=>m.ativa||idsMicroSelecionadas.has(m.id));return <div key={macro.id} className="rounded-lg border border-slate-100 bg-slate-50"><div className="flex items-center gap-2 p-2"><button type="button" aria-label={`${areasExpandidas.includes(macro.id)?"Recolher":"Expandir"} ${macro.nome}`} onClick={()=>setAreasExpandidas(atual=>atual.includes(macro.id)?atual.filter(id=>id!==macro.id):[...atual,macro.id])} className="rounded p-1 hover:bg-white">{areasExpandidas.includes(macro.id)?<ChevronDown className="h-4 w-4"/>:<ChevronRight className="h-4 w-4"/>}</button><input type="checkbox" checked={selecionada} ref={el=>{if(el)el.indeterminate=parcial}} disabled={!macro.ativa&&areasSelecionadas.some(a=>a.macroarea_id===macro.id)} onChange={e=>alternarMacroarea(macro,e.target.checked)}/><span className="font-medium">{macro.nome}</span>{!macro.ativa&&<span className="text-xs text-amber-700">Inativa</span>}{parcial&&<span className="text-xs text-slate-500">Seleção parcial</span>}</div>{areasExpandidas.includes(macro.id)&&<div className="space-y-1 border-t bg-white p-2 pl-10">{microareas.map(micro=><label key={micro.id} className="flex items-center gap-2 py-1"><input type="checkbox" checked={selecionada||idsMicroSelecionadas.has(micro.id)} disabled={!macro.ativa||!micro.ativa} onChange={e=>alternarMicroarea(macro,micro,e.target.checked)}/><span>{micro.nome}</span>{!micro.ativa&&<span className="text-xs text-amber-700">Inativa</span>}</label>)}</div>}</div>})}</div><div className="mt-3 border-t pt-3"><label className="flex items-center gap-2"><input type="checkbox" checked={areaSelecionada==="__outro__"} onChange={e=>setAreaSelecionada(e.target.checked?"__outro__":"")}/>Outro</label>{areaSelecionada==="__outro__"&&<input required={areaSelecionada==="__outro__"} value={localOutroRascunho} onChange={e=>setLocalOutroRascunho(e.target.value)} className="mt-2 w-full rounded-lg border p-2" placeholder="Informe outra área de atuação"/>}</div>{escalaEditandoId&&!areasSelecionadas.length&&areaSelecionada!=="__outro__"&&form.local&&<p className="mt-2 text-xs text-slate-500">Escala antiga sem áreas estruturadas. O local registrado será preservado: {form.local}</p>}</fieldset><label className="text-sm">Viatura<select required value={form.viatura} onChange={e=>setForm({...form,viatura:e.target.value,viaturaOutra:""})} className="mt-1 w-full rounded-lg border p-2"><option value="">Selecione a viatura</option>{viaturas.map(v=><option key={v.id} value={nomeViatura(v)}>{nomeViatura(v)}</option>)}<option value="__outra__">Outra</option></select>{form.viatura === "__outra__" && <input required value={form.viaturaOutra} onChange={e=>setForm({...form,viaturaOutra:e.target.value})} className="mt-2 w-full rounded-lg border p-2" placeholder="Informe o prefixo e a placa da viatura"/>}{viaturas.length===0&&<span className="mt-1 block text-xs text-amber-700">Nenhuma viatura operacional disponível no cadastro. Você pode selecionar “Outra”.</span>}</label><label className="text-sm">Quantidade de vagas<input required type="number" min="1" max="100" value={form.vagas} onChange={e=>setForm({...form,vagas:e.target.value})} className="mt-1 w-full rounded-lg border p-2"/></label></div><div className="grid gap-2 sm:grid-cols-2"><label className="flex gap-2 text-sm"><input type="checkbox" checked={form.regra_composicao} onChange={e=>setForm({...form,regra_composicao:e.target.checked})}/>Exigir composição hierárquica da equipe</label><label className="flex gap-2 text-sm"><input type="checkbox" checked={form.excecao_soldados} onChange={e=>setForm({...form,excecao_soldados:e.target.checked})}/>Autorizar exceção: equipe só de soldados</label><label className="flex gap-2 text-sm"><input type="checkbox" checked={form.equipe_oficial} onChange={e=>setForm({...form,equipe_oficial:e.target.checked})}/>Permitir escolha de equipe pelo oficial</label><label className="flex gap-2 text-sm"><input type="checkbox" checked={form.compulsoria} onChange={e=>setForm({...form,compulsoria:e.target.checked})}/>Escala compulsória</label></div><label className="block text-sm">Observações<textarea value={form.observacoes} onChange={e=>setForm({...form,observacoes:e.target.value})} className="mt-1 w-full rounded-lg border p-2" rows="2"/></label><div className="flex justify-end gap-2"><button type="button" onClick={()=>{setFormAberto(false);setEscalaEditandoId(null);}} className="rounded-xl border px-4 py-2 text-sm">Cancelar</button><button disabled={enviando} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">{enviando?"Salvando...":escalaEditandoId?"Salvar alterações":"Cadastrar escala"}</button></div></form>}
    <section className="rounded-2xl border border-slate-200 bg-white overflow-visible"><div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b p-4"><div><p className="text-xs text-slate-500">Policiais podem consultar e se voluntariar enquanto a escala estiver aberta.</p></div></div>{carregando?<p className="p-5 text-sm text-slate-500">Carregando escalas...</p>:escalasVisiveis.length===0?<p className="p-5 text-sm text-slate-500">{diaSelecionado ? "Nenhuma escala cadastrada para este dia." : "Nenhuma escala cadastrada para este mês."}</p>:<div className="divide-y">{escalasVisiveis.map(escala=>{const meus=voluntariosPorEscala(escala.id);const eu=meus.some(v=>(v.policial_id===dados.usuario_id||v.policial_externo_id===dados.usuario_id));return <article key={escala.id} className={`border-l-4 p-4 space-y-3 ${corDaEscala(escala)}`}><div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2"><div><div className="font-bold text-slate-800">{dataBR(escala.data_servico)} · {horaBR(escala.horario_inicio)}–{horaBR(escala.horario_fim)}</div><div className="text-sm text-slate-600">{rotuloAreas(escala)}</div>{escala.viatura&&<div className="text-sm text-slate-600">Viatura: {escala.viatura}</div>}<div className="text-xs text-slate-500 mt-1">{meus.length} voluntário(s) · {escala.vagas} vaga(s)</div></div><div className="flex items-center gap-2"><span className={`rounded-lg px-2 py-1 text-xs font-bold ${escala.status==="fechada"?"bg-emerald-100 text-emerald-700":"bg-amber-100 text-amber-700"}`}>{escala.status==="fechada"?"Fechada":"Aberta"}</span>{escala.status==="aberta"&&!dados.permissoes.gerenciar&&(eu?<button disabled={enviando} onClick={()=>executar({acao:"retirar_voluntariado",escala_id:escala.id},"Voluntariedade retirada.")} className="rounded-lg border px-3 py-2 text-xs font-semibold">Retirar voluntariedade</button>:<button disabled={enviando} onClick={()=>executar({acao:"voluntariar",escala_id:escala.id},"Voluntariedade registrada.")} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"><UserPlus className="inline w-3 h-3 mr-1"/>Voluntariar-me</button>)}{escala.status==="fechada"&&meus.some(v=>(v.policial_id===dados.usuario_id||v.policial_externo_id===dados.usuario_id)&&v.status==="selecionado")&&<button disabled={enviando} onClick={()=>executar({acao:"solicitar_desistencia",escala_id:escala.id},"Solicitação de desistência enviada ao escalante.")} className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-800">Solicitar desistência</button>}{dados.permissoes.gerenciar&&escala.status==="aberta"&&<button disabled={enviando} onClick={()=>executar({acao:"fechar_escala",escala_id:escala.id},"Escala fechada.")} className="rounded-lg border px-3 py-2 text-xs font-semibold"><CheckCircle2 className="inline w-3 h-3 mr-1"/>Fechar</button>}{dados.permissoes.gerenciar&&escala.status==="fechada"&&<button disabled={enviando} onClick={()=>executar({acao:"reabrir_escala",escala_id:escala.id},"Escala reaberta.")} className="rounded-lg border px-3 py-2 text-xs font-semibold">Reabrir</button>}{dados.permissoes.gerenciar&&escala.status==="aberta"&&<button disabled={enviando} onClick={()=>abrirEdicaoEscala(escala)} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"><Pencil className="h-3 w-3"/>Editar</button>}{dados.permissoes.gerenciar&&<button disabled={enviando} onClick={()=>{if(window.confirm(`Excluir a DRSO de ${dataBR(escala.data_servico)} (${horaBR(escala.horario_inicio)}–${horaBR(escala.horario_fim)})? Esta ação removerá os participantes e as horas dessa escala do VAR.`))executar({acao:"excluir_escala",escala_id:escala.id},"DRSO excluída.")}} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"><Trash2 className="h-3 w-3"/>Excluir</button>}</div></div><div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full text-left text-xs"><thead className="bg-slate-50 uppercase text-slate-500"><tr><th className="p-3">Policial</th><th className="p-3">Função</th><th className="p-3">Situação</th>{dados.permissoes.gerenciar&&<th className="p-3 text-right">Ações</th>}</tr></thead><tbody className="divide-y divide-slate-100">{meus.filter(v=>v.status!=="retirado").sort((a,b)=>compararAntiguidade(policialDoVinculo(a),policialDoVinculo(b))).map(v=>{const funcao=funcoesPorEscala(escala.id).get(chaveVinculoDRSO(v))||v.funcao;return <tr key={v.id}><td className="p-3 font-medium text-slate-800">{v.nome_exibicao||policiais.get(v.policial_id)||"Policial"}</td><td className="p-3">{dados.permissoes.gerenciar&&escala.status==="aberta"&&v.status==="selecionado"?<select aria-label={`Função de ${v.nome_exibicao||policiais.get(v.policial_id)||"policial"}`} value={funcao||""} onChange={e=>executar({acao:"definir_funcao",escala_id:escala.id,policial_id:v.policial_externo_id||v.policial_id,funcao:e.target.value},"Função atualizada.")} className="rounded-lg border border-slate-200 bg-white px-2 py-1">{funcao==="Comandante"?<option value="Comandante">Comandante</option>:<><option value="Patrulheiro">Patrulheiro</option><option value="Motorista">Motorista</option></>}</select>:funcao||"—"}</td><td className="p-3">{v.origem==="direto"?"Inclusão direta":v.status==="selecionado"?"Pré-selecionado":v.status==="desistencia_solicitada"?"Desistência pendente":"Voluntário"}</td>{dados.permissoes.gerenciar&&<td className="p-3 text-right"><div className="flex justify-end gap-3">{escala.status==="aberta"&&v.origem!=="direto"&&<button disabled={enviando} onClick={()=>executar({acao:"selecionar_voluntario",escala_id:escala.id,policial_id:v.policial_externo_id||v.policial_id,selecionar:v.status!=="selecionado"},v.status==="selecionado"?"Policial retirado da pré-escala.":"Policial selecionado para a pré-escala.")} className="font-bold underline">{v.status==="selecionado"?"Retirar seleção":"Selecionar"}</button>}{escala.status==="aberta"&&v.origem==="direto"&&<button disabled={enviando} onClick={()=>executar({acao:"remover_inclusao_direta",escala_id:escala.id,vinculo_id:v.id},"Inclusão direta removida da pré-escala.")} className="font-bold text-rose-700 underline">Remover inclusão</button>}{v.status==="desistencia_solicitada"&&<><button disabled={enviando} onClick={()=>executar({acao:"decidir_desistencia",escala_id:escala.id,policial_id:v.policial_externo_id||v.policial_id,aprovar:true},"Desistência aprovada; vínculo retirado da escala.")} className="font-bold text-emerald-700 underline">Aprovar</button><button disabled={enviando} onClick={()=>executar({acao:"decidir_desistencia",escala_id:escala.id,policial_id:v.policial_externo_id||v.policial_id,aprovar:false},"Desistência recusada; policial mantido na escala.")} className="font-bold text-rose-700 underline">Recusar</button></>}</div></td>}</tr>})}{meus.filter(v=>v.status!=="retirado").length===0&&<tr><td className="p-3 text-slate-500" colSpan={dados.permissoes.gerenciar?4:3}>Nenhum voluntário nesta escala.</td></tr>}</tbody></table></div>{escala.status==="fechada"&&meus.some(v=>v.origem==="direto"&&v.status==="selecionado")&&<p className="text-xs text-slate-600">{meus.filter(v=>v.origem==="direto"&&v.status==="selecionado").map(v=>`${v.nome_exibicao||policiais.get(v.policial_externo_id||v.policial_id)||"Policial"} foi escalado por escolha do comandante`).join("; ")}. Identificação do oficial responsável não registrada no sistema.</p>}{dados.permissoes.gerenciar&&escala.status==="aberta"&&<div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,1.2fr)_minmax(180px,0.8fr)_auto] items-start gap-3 rounded-xl bg-slate-50 p-3"><div className="relative min-w-0"><input value={policialDireto[escala.id]?.busca||""} onChange={e=>setPolicialDireto(prev=>({...prev,[escala.id]:{...(prev[escala.id]||{}),busca:e.target.value,policial_id:""}}))} placeholder="Buscar policial por matrícula, nome ou numeral" aria-label="Buscar policial por matrícula, nome ou numeral" className="w-full rounded-lg border p-2 text-xs"/>{(policialDireto[escala.id]?.busca||"").trim()&&!policialDireto[escala.id]?.policial_id&&<div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white shadow-xl">{policiaisEncontrados(policialDireto[escala.id]?.busca).length?policiaisEncontrados(policialDireto[escala.id]?.busca).map(p=><button type="button" key={p.id} onClick={()=>setPolicialDireto(prev=>({...prev,[escala.id]:{...(prev[escala.id]||{}),policial_id:p.id,busca:[p.posto_graduacao,p.numeral,p.nome_guerra||p.nome_completo].filter(Boolean).join(" ")}}))} className="block w-full border-b px-3 py-2 text-left text-xs hover:bg-slate-50"><span className="font-semibold">{[p.posto_graduacao,p.numeral,p.nome_guerra||p.nome_completo].filter(Boolean).join(" ")}</span><span className="block text-slate-500">Matrícula: {p.matricula||"não informada"}</span></button>):<p className="p-3 text-xs text-slate-500">Nenhum policial encontrado.</p>}</div>}{policialDireto[escala.id]?.policial_id&&<p className="mt-1 text-xs text-emerald-700">Policial selecionado. Apague a busca para escolher outro.</p>}</div><div className="min-w-0"><select value={policialDireto[escala.id]?.funcao||""} onChange={e=>setPolicialDireto(prev=>({...prev,[escala.id]:{...(prev[escala.id]||{}),funcao:e.target.value}}))} className="w-full rounded-lg border p-2 text-xs"><option value="">Escolher função</option><option value="Comandante">Comandante</option><option value="Patrulheiro">Patrulheiro</option><option value="Motorista">Motorista</option></select><p className="mt-1 text-[10px] leading-4 text-slate-500">O sistema sugere automaticamente o comandante pela hierarquia e, em empate, pelo numeral. Patrulheiro e motorista ficam com os mais modernos; o escalante pode inverter essas duas funções.</p></div><button disabled={enviando||!policialDireto[escala.id]?.policial_id||!policialDireto[escala.id]?.funcao} onClick={()=>{const escolhido=policiaisPorId.get(policialDireto[escala.id]?.policial_id);const determinacao=escolhido?.origem_efetivo==="externo"?window.confirm(`Confirma que a inclusão direta de ${escolhido?.nome_exibicao||"policial externo"} foi determinada pelo oficial responsável?`):false;if(escolhido?.origem_efetivo==="externo"&&!determinacao)return;executar({acao:"escalar_diretamente",escala_id:escala.id,policial_id:policialDireto[escala.id]?.policial_id,funcao:policialDireto[escala.id]?.funcao,determinacao_oficial:determinacao},"Policial incluído diretamente na pré-escala.")}} className="rounded-lg bg-slate-800 px-4 py-3 text-xs font-semibold text-white lg:self-start">Adicionar à escala</button></div>}{escala.observacoes&&<p className="text-sm text-slate-500">{escala.observacoes}</p>}</article>})}</div>}</section>
    {!externo && <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-bold">VAR provisório do dia</h2><p className="text-xs text-slate-500">Horas em escalas fechadas anteriores do mês + horas das escalas selecionadas deste dia. Não inclui meses anteriores nem conta uma participação mais de uma vez.</p></div><button type="button" onClick={()=>setConsultaVarOficialAberta(v=>!v)} aria-expanded={consultaVarOficialAberta} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">{consultaVarOficialAberta?"Fechar consulta":"Consultar VAR oficial"}</button></div>
      {mes!==diaProvisorio.slice(0, 7)?<p className="p-5 text-sm text-slate-500">Selecione o mês da data escolhida para consultar a prévia.</p>:varProvisorioHoje.length===0?<p className="p-5 text-sm text-slate-500">Nenhum policial disponível para a prévia.</p>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3 text-left">Policial</th><th className="p-3 text-right">Horas em escalas fechadas anteriores do mês</th><th className="p-3 text-right">Horas projetadas caso seja escalado {diaProvisorio === hojeISO ? "hoje" : `em ${dataBR(diaProvisorio)}`}</th></tr></thead><tbody className="divide-y divide-slate-100">{varProvisorioHoje.map(item=><tr key={item.chave}><td className="p-3 font-medium">{item.policial.nome_exibicao||item.policial.nome_guerra||item.policial.nome_completo||"Policial"}</td><td className="p-3 text-right tabular-nums">{item.horasAnteriores.toLocaleString("pt-BR")}h</td><td className="p-3 text-right font-bold tabular-nums text-blue-800">{item.horasProjetadas.toLocaleString("pt-BR")}h</td></tr>)}</tbody></table></div>}
    </section>}
    {!externo && consultaVarOficialAberta && <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="var-oficial-titulo" onClick={e=>{if(e.target===e.currentTarget)setConsultaVarOficialAberta(false)}}><section className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-start justify-between gap-4 border-b p-4"><div><h2 id="var-oficial-titulo" className="font-bold text-slate-800">VAR oficial mensal · {mes}</h2><p className="text-xs text-slate-500">Participações válidas em escalas fechadas até {diaProvisorio ? dataBR(new Date(new Date(`${diaProvisorio}T12:00:00Z`).getTime()-86400000).toISOString().slice(0,10)) : dataBR(`${mes}-${String(diasNoMes).padStart(2,"0")}`)}; sem horas do dia selecionado.</p></div><button type="button" onClick={()=>setConsultaVarOficialAberta(false)} className="rounded-lg border px-3 py-1.5 text-sm font-semibold">Fechar</button></div><div className="max-h-[65vh] overflow-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Policial</th><th className="p-3 text-right">Horas acumuladas no mês</th><th className="p-3 text-right">Horas compulsórias</th></tr></thead><tbody className="divide-y divide-slate-100">{varOficialAcumulado.map(item=>{const externoPolicial=item.policial.origem_efetivo==="externo";return <tr key={item.chave} className={externoPolicial?"border-l-4 border-violet-600 bg-violet-50":""}><td className="p-3 font-medium">{item.policial.nome_exibicao||item.policial.nome_guerra||item.policial.nome_completo||"Policial"}{externoPolicial&&<span className="ml-2 inline-flex rounded-full bg-violet-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Externo</span>}</td><td className="p-3 text-right font-semibold tabular-nums">{item.horas.toLocaleString("pt-BR")}h</td><td className="p-3 text-right font-semibold tabular-nums">{item.horasCompulsorias.toLocaleString("pt-BR")}h</td></tr>})}</tbody></table></div><p className="border-t bg-amber-50 p-4 text-xs text-amber-900">Horas compulsórias somam somente participações selecionadas em escalas fechadas marcadas como compulsórias. Escalas sem essa marcação contribuem com 0h compulsórias.</p></section></div>}
    {enviando && <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]" role="alertdialog" aria-modal="true" aria-live="assertive" aria-label="Operação em andamento"><div className="flex min-w-[250px] flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white px-8 py-6 text-center shadow-2xl"><LoaderCircle className="h-9 w-9 animate-spin text-blue-600"/><p className="font-semibold text-slate-800">Processando operação...</p><p className="text-sm text-slate-500">Aguarde e não clique novamente.</p></div></div>}
  </div>;
}
