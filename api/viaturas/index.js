import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  supabaseAdmin,
  usuarioAutenticado,
  normalizarRole,
  respostaErro,
} from "../_server.js";
import processarLivroPermanencia from "../_livroPermanencia.js";

const PERFIS_GESTAO = ["master", "p4"];
const PERFIS_GESTAO_AREAS = ["master", "oficial", "p1_escalante_servico_ordinario"];
const PERFIS_BLOQUEADOS_AREAS = ["policial", "armeiro"];
const SITUACOES_VALIDAS = ["operando", "baixada", "manutencao", "inativa"];
const TIPOS_VALIDOS = ["organica", "locada", "locada_req"];
const UUID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PERFIS_CHECKIN = ["master", "p4", "oficial", "policial"];
const TIPOS_ENTRADA = ["inicio_servico", "retirada_oficina", "recebimento_opm", "viatura_nova", "outras_situacoes"];
const TIPOS_SAIDA = ["fim_servico", "encaminhamento_oficina", "devolucao_opm", "baixa_definitiva", "outras_situacoes"];
const TIPOS_OCORRENCIA = ["avaria", "acidente", "pane", "abastecimento", "outro"];

function tokenChecklist(id, etapa) {
  const payload = Buffer.from(`${id}:${etapa}`).toString("base64url");
  const assinatura = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY).update(payload).digest("base64url");
  return `${payload}.${assinatura}`;
}

function lerTokenChecklist(valor) {
  if (typeof valor !== "string" || valor.length > 256) return null;
  const [payload, assinatura, extra] = valor.split(".");
  if (!payload || !assinatura || extra || !/^[A-Za-z0-9_-]+$/.test(payload)) return null;
  const esperada = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY).update(payload).digest();
  let fornecida;
  try { fornecida = Buffer.from(assinatura, "base64url"); } catch { return null; }
  if (fornecida.length !== esperada.length || !timingSafeEqual(fornecida, esperada)) return null;
  const [id, etapa, mais] = Buffer.from(payload, "base64url").toString("utf8").split(":");
  return UUID_VALIDO.test(id || "") && ["entrada", "saida"].includes(etapa) && !mais ? { id, etapa } : null;
}

function normalizarJsonObjeto(valor) {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? valor : {};
}

function validarChecklistViatura(valor) {
  const checklist = { ...normalizarJsonObjeto(valor) };
  delete checklist.km_proxima_troca_oleo;
  const escolhas = {
    limpeza: ["sim", "nao"],
    combustivel: ["tanque_cheio", "meio_tanque", "um_quarto", "reserva"],
    nivel_oleo: ["alto", "medio", "baixo", "outro"],
    pneus: ["bom", "desgaste", "inadequado", "outro"],
    arrefecimento: ["alto", "medio", "baixo", "outro"],
    freios: ["otimo", "bom", "ruim"],
  };
  for (const [campo, opcoes] of Object.entries(escolhas)) {
    if (!opcoes.includes(checklist[campo])) return null;
  }
  const opcoesFerramentas = ["Macaco", "Chave de rodas", "Triângulo de sinalização", "Pneu estepe", "Tapetes", "Sem alterações", "Outro"];
  const opcoesArCondicionado = ["funcionando", "ventilador_sem_gas", "ventilador_nao_funciona", "sem_alteracoes", "outro"];
  const opcoesEquipamentos = ["Rádio / HT", "Smartphone", "Intermitente", "Sinal sonoro", "Buzina", "Faróis", "Luz de direção (piscas)", "Luz de ré", "Sem alterações", "Outro"];
  const listaValida = (itens, permitidos) => Array.isArray(itens) && itens.length > 0 && itens.every((item) => permitidos.includes(item)) && (!itens.includes("Sem alterações") || itens.length === 1);
  if (!listaValida(checklist.ar_condicionado, opcoesArCondicionado) || (checklist.ar_condicionado.includes("sem_alteracoes") && checklist.ar_condicionado.length > 1)) return null;
  if (!listaValida(checklist.kit_ferramentas, opcoesFerramentas) || !listaValida(checklist.alteracoes_equipamentos, opcoesEquipamentos)) return null;
  if (checklist.limpeza === "nao" && !texto(checklist.limpeza_motivo_antecessor)) return null;
  if (checklist.ar_condicionado.includes("outro") && !texto(checklist.ar_condicionado_outro)) return null;
  if (checklist.kit_ferramentas.includes("Outro") && !texto(checklist.ferramentas_outro)) return null;
  if (checklist.alteracoes_equipamentos.includes("Outro") && !texto(checklist.alteracoes_equipamentos_outro)) return null;
  if (checklist.nivel_oleo === "outro" && !texto(checklist.nivel_oleo_outro)) return null;
  if (checklist.arrefecimento === "outro" && !texto(checklist.arrefecimento_outro)) return null;
  if (!texto(checklist.pneus_detalhe) || checklist.pneus_detalhe.length > 500) return null;
  if (typeof checklist.observacoes_gerais !== "string" || checklist.observacoes_gerais.length > 3000) return null;
  return checklist;
}

function normalizarFotos(valor) {
  return Array.isArray(valor) && valor.length <= 5 && valor.reduce((total, foto) => total + (typeof foto === "string" ? foto.length : 4_000_001), 0) <= 3_800_000 && valor.every((foto) =>
    typeof foto === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(foto) && foto.length <= 2_800_000,
  ) ? valor : null;
}

async function guardarFotos(db, fotos, prefixo) {
  const paths = [];
  for (const foto of fotos) {
    const [, mime, base64] = foto.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/) || [];
    if (!base64) throw new Error("Arquivo de foto inválido.");
    const extensao = mime.split("/")[1].replace("jpeg", "jpg");
    const path = `viaturas/${prefixo}/${randomUUID()}.${extensao}`;
    const { error } = await db.storage.from("documentos-seguranca").upload(path, Buffer.from(base64, "base64"), { contentType: mime, upsert: false });
    if (error) {
      if (/bucket not found/i.test(error.message || "")) throw Object.assign(new Error("O bucket de fotos documentos-seguranca não está disponível no Supabase."), { code: "STORAGE_BUCKET_MISSING" });
      throw error;
    }
    paths.push(path);
  }
  return paths;
}

async function assinarFotos(db, caminhos) {
  const unicos = [...new Set((caminhos || []).filter((path) => typeof path === "string" && path.startsWith("viaturas/")))];
  if (!unicos.length) return new Map();
  const { data, error } = await db.storage.from("documentos-seguranca").createSignedUrls(unicos, 3600);
  if (error) {
    if (/bucket not found/i.test(error.message || "")) throw Object.assign(new Error("O bucket de fotos documentos-seguranca não está disponível no Supabase."), { code: "STORAGE_BUCKET_MISSING" });
    throw error;
  }
  return new Map((data || []).map((item) => [item.path, item.signedUrl]));
}

async function policialPodeConsultarViatura(db, usuarioId, viaturaId, somenteDisponivel = false) {
  const [{ data: viatura, error: erroViatura }, { data: ocupacoes, error: erroOcupacoes }] = await Promise.all([
    db.from("viaturas").select("id, ativo, situacao").eq("id", viaturaId).maybeSingle(),
    db.from("viatura_checkins").select("responsavel_id").eq("viatura_id", viaturaId).eq("ativo", true).limit(1),
  ]);
  if (erroViatura) throw erroViatura;
  if (erroOcupacoes) throw erroOcupacoes;
  if (!viatura?.ativo || ["baixada", "inativa"].includes(viatura.situacao)) return false;
  const ocupacao = ocupacoes?.[0];
  return !ocupacao || (!somenteDisponivel && ocupacao.responsavel_id === usuarioId);
}

async function policialResponsavelPeloCheckin(db, usuarioId, checkinId) {
  const { data, error } = await db.from("viatura_checkins")
    .select("id")
    .eq("id", checkinId)
    .eq("responsavel_id", usuarioId)
    .eq("ativo", true)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function anexarAcompanhamentosOcorrencias(db, ocorrencias) {
  const idsOcorrencias = [...new Set((ocorrencias || []).map((item) => item.id).filter(Boolean))];
  if (!idsOcorrencias.length) return new Map();
  const { data, error } = await db.from("viatura_ocorrencia_acompanhamentos")
    .select("id, ocorrencia_id, registrado_por, tipo, oficina, comentario, created_at")
    .in("ocorrencia_id", idsOcorrencias)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const idsPoliciais = [...new Set((data || []).map((item) => item.registrado_por).filter(Boolean))];
  const { data: policiais, error: erroPoliciais } = idsPoliciais.length
    ? await db.from("policiais").select("id, nome_guerra, nome_completo, posto_graduacao, numeral, matricula").in("id", idsPoliciais)
    : { data: [], error: null };
  if (erroPoliciais) throw erroPoliciais;
  const policiaisMap = new Map((policiais || []).map((item) => [item.id, item]));
  const porOcorrencia = new Map();
  for (const item of data || []) {
    const itens = porOcorrencia.get(item.ocorrencia_id) || [];
    itens.push({ ...item, policial: policiaisMap.get(item.registrado_por) });
    porOcorrencia.set(item.ocorrencia_id, itens);
  }
  return porOcorrencia;
}

async function anexarSituacaoExibida(db, viaturas) {
  const idsViaturas = [...new Set((viaturas || []).map((item) => item.id).filter(Boolean))];
  if (!idsViaturas.length) return viaturas || [];
  const { data: ocorrencias, error: erroOcorrencias } = await db.from("viatura_ocorrencias")
    .select("id, viatura_id").in("viatura_id", idsViaturas).limit(10000);
  if (erroOcorrencias) throw erroOcorrencias;
  const ocorrenciaPorId = new Map((ocorrencias || []).map((item) => [item.id, item.viatura_id]));
  const idsOcorrencias = [...ocorrenciaPorId.keys()];
  const [{ data: encaminhamentos, error: erroEncaminhamentos }, { data: retiradas, error: erroRetiradas }] = await Promise.all([
    idsOcorrencias.length ? db.from("viatura_ocorrencia_acompanhamentos").select("ocorrencia_id, created_at").eq("tipo", "encaminhamento_oficina").in("ocorrencia_id", idsOcorrencias).order("created_at", { ascending: false }).limit(10000) : Promise.resolve({ data: [], error: null }),
    db.from("viatura_checkins").select("viatura_id, data_hora_inicio").in("viatura_id", idsViaturas).eq("tipo_entrada", "retirada_oficina").order("data_hora_inicio", { ascending: false }).limit(10000),
  ]);
  if (erroEncaminhamentos) throw erroEncaminhamentos;
  if (erroRetiradas) throw erroRetiradas;
  const encaminhamentoMaisRecente = new Map();
  for (const item of encaminhamentos || []) {
    const viaturaId = ocorrenciaPorId.get(item.ocorrencia_id);
    if (viaturaId && !encaminhamentoMaisRecente.has(viaturaId)) encaminhamentoMaisRecente.set(viaturaId, item.created_at);
  }
  const retiradaMaisRecente = new Map();
  for (const item of retiradas || []) if (!retiradaMaisRecente.has(item.viatura_id)) retiradaMaisRecente.set(item.viatura_id, item.data_hora_inicio);
  return (viaturas || []).map((item) => {
    const encaminhadaEm = encaminhamentoMaisRecente.get(item.id);
    const retiradaEm = retiradaMaisRecente.get(item.id);
    const encaminhadaPendente = encaminhadaEm && (!retiradaEm || new Date(encaminhadaEm) > new Date(retiradaEm));
    const situacaoExibida = ["baixada", "inativa"].includes(item.situacao) ? item.situacao : encaminhadaPendente ? "manutencao" : item.situacao;
    return { ...item, situacao_exibida: situacaoExibida };
  });
}

async function processarChecklistPublico(req, res, db) {
  if (req.method !== "GET") return res.setHeader("Allow", "GET").status(405).json({ error: "Método não permitido." });
  const autorizado = lerTokenChecklist(texto(req.query?.token));
  if (!autorizado) return respostaErro(res, 404, "Checklist não encontrado.");
  const { data: checkin, error } = await db.from("viatura_checkins")
    .select("id, viatura_id, responsavel_id, responsavel_saida_id, data_hora_inicio, data_hora_fim, km_inicial, km_final, checklist_entrada, checklist_saida, fotos_entrada, fotos_saida")
    .eq("id", autorizado.id).maybeSingle();
  if (error) throw error;
  const dataHora = autorizado.etapa === "entrada" ? checkin?.data_hora_inicio : checkin?.data_hora_fim;
  const quilometragem = autorizado.etapa === "entrada" ? checkin?.km_inicial : checkin?.km_final;
  const checklist = autorizado.etapa === "entrada" ? checkin?.checklist_entrada : checkin?.checklist_saida;
  if (!checkin || !dataHora || quilometragem == null || !checklist) return respostaErro(res, 404, "Checklist não encontrado.");
  const responsavelId = autorizado.etapa === "entrada" ? checkin.responsavel_id : checkin.responsavel_saida_id;
  const [{ data: viatura, error: erroViatura }, { data: responsavel, error: erroResponsavel }] = await Promise.all([
    db.from("viaturas").select("identificacao, placa").eq("id", checkin.viatura_id).maybeSingle(),
    responsavelId ? db.from("policiais").select("posto_graduacao, nome_guerra, matricula").eq("id", responsavelId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (erroViatura) throw erroViatura;
  if (erroResponsavel) throw erroResponsavel;
  if (!viatura) return respostaErro(res, 404, "Checklist não encontrado.");
  const caminhosFotos = autorizado.etapa === "entrada" ? checkin.fotos_entrada || [] : checkin.fotos_saida || [];
  const urlsFotos = await assinarFotos(db, caminhosFotos);
  res.setHeader("Cache-Control", "private, no-store");
  return res.status(200).json({ etapa: autorizado.etapa, viatura, responsavel, turno: turnoDoEvento(dataHora), data_hora: dataHora, quilometragem, checklist, fotos: caminhosFotos.map((path) => urlsFotos.get(path)).filter(Boolean) });
}

async function processarLinkChecklist(req, res, db, role) {
  if (!PERFIS_GESTAO.includes(role)) return respostaErro(res, 403, "Sem permissão para compartilhar checklists.");
  if (req.method !== "POST") return res.setHeader("Allow", "POST").status(405).json({ error: "Método não permitido." });
  const checkinId = texto(req.body?.checkin_id);
  const etapa = texto(req.body?.etapa);
  if (!UUID_VALIDO.test(checkinId) || !["entrada", "saida"].includes(etapa)) return respostaErro(res, 400, "Informe o check-in e a etapa do checklist.");
  const { data: checkin, error } = await db.from("viatura_checkins")
    .select("id, data_hora_fim, checklist_entrada, checklist_saida")
    .eq("id", checkinId).maybeSingle();
  if (error) throw error;
  if (!checkin) return respostaErro(res, 404, "Movimentação não encontrada.");
  if (etapa === "saida" && (!checkin.data_hora_fim || !checkin.checklist_saida)) return respostaErro(res, 409, "O checklist de saída ainda não foi registrado.");
  if (etapa === "entrada" && !checkin.checklist_entrada) return respostaErro(res, 409, "O checklist de entrada não está disponível.");
  return res.status(200).json({ token: tokenChecklist(checkin.id, etapa) });
}

async function processarExclusaoHistorico(req, res, db, role) {
  if (role !== "master") return respostaErro(res, 403, "Somente o perfil Master pode excluir registros históricos.");
  const tipo = texto(req.body?.tipo);
  const id = texto(req.body?.id);
  if (!["ocorrencia", "movimentacao", "checklist"].includes(tipo) || !UUID_VALIDO.test(id)) return respostaErro(res, 400, "Registro histórico inválido.");

  if (tipo === "checklist") {
    const etapa = texto(req.body?.etapa);
    if (!["entrada", "saida"].includes(etapa)) return respostaErro(res, 400, "Etapa do checklist inválida.");
    const coluna = etapa === "entrada" ? "checklist_entrada" : "checklist_saida";
    const { data, error } = await db.from("viatura_checkins").update({ [coluna]: etapa === "entrada" ? {} : null }).eq("id", id).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return respostaErro(res, 404, "Checklist não encontrado.");
    return res.status(200).json({ excluido: true, tipo, etapa });
  }

  if (tipo === "ocorrencia") {
    const { data, error } = await db.rpc("viatura_ocorrencia_excluir", { p_ocorrencia_id: id });
    if (error) {
      if (String(error.message || "").includes("OCORRENCIA_COM_FOTOS")) return respostaErro(res, 409, "A ocorrência possui fotos privadas vinculadas; remova-as pelo fluxo seguro de arquivos antes de excluir o registro.");
      throw error;
    }
    if (!data) return respostaErro(res, 404, "Ocorrência não encontrada.");
    return res.status(200).json({ excluido: true, tipo });
  }

  const { data: movimentacao, error } = await db.from("viatura_checkins").select("id, ativo, fotos_entrada, fotos_saida").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!movimentacao) return respostaErro(res, 404, "Movimentação não encontrada.");
  if (movimentacao.ativo) return respostaErro(res, 409, "Um check-in ativo não pode ser excluído do histórico.");
  if ((movimentacao.fotos_entrada || []).length || (movimentacao.fotos_saida || []).length) return respostaErro(res, 409, "A movimentação possui fotos vinculadas e não pode ser excluída com segurança.");
  const { data: ocorrencias, error: erroOcorrencias } = await db.from("viatura_ocorrencias").select("id").eq("checkin_id", id).limit(1);
  if (erroOcorrencias) throw erroOcorrencias;
  if (ocorrencias?.length) return respostaErro(res, 409, "A movimentação possui ocorrências vinculadas e não pode ser excluída.");
  const { data, error: erroDelete } = await db.from("viatura_checkins").delete().eq("id", id).select("id").maybeSingle();
  if (erroDelete) throw erroDelete;
  if (!data) return respostaErro(res, 404, "Movimentação não encontrada.");
  return res.status(200).json({ excluido: true, tipo });
}

async function processarHistoricoOcorrenciasViatura(req, res, db, usuario, role) {
  if (req.method !== "GET") return res.setHeader("Allow", "GET").status(405).json({ error: "Método não permitido." });
  if (!PERFIS_CHECKIN.includes(role)) return respostaErro(res, 403, "Sem permissão para consultar ocorrências de viaturas.");
  const viaturaId = texto(req.query?.historico_viatura_id);
  if (!UUID_VALIDO.test(viaturaId)) return respostaErro(res, 400, "Selecione uma viatura válida.");
  if (role === "policial" && !(await policialPodeConsultarViatura(db, usuario.id, viaturaId, false))) return respostaErro(res, 403, "Consulte apenas ocorrências de uma viatura disponível ou sob sua responsabilidade.");
  const pagina = Math.max(1, Math.min(100, Number.parseInt(req.query?.pagina, 10) || 1));
  const limite = 25;
  const inicio = (pagina - 1) * limite;
  const [{ data, error }, { data: ultimoCheckin, error: erroUltimoCheckin }] = await Promise.all([
    db.from("viatura_ocorrencias").select("id, checkin_id, viatura_id, registrada_por, tipo, descricao, data_hora, quilometragem, fotos, analisada, created_at").eq("viatura_id", viaturaId).order("data_hora", { ascending: false }).range(inicio, inicio + limite),
    db.from("viatura_checkins").select("id, viatura_id, responsavel_id, responsavel_saida_id, data_hora_inicio, data_hora_fim, km_inicial, km_final, tipo_saida, tipo_saida_detalhe, checklist_saida, observacoes_saida, fotos_saida, ativo").eq("viatura_id", viaturaId).eq("ativo", false).order("data_hora_fim", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (error) throw error;
  if (erroUltimoCheckin) throw erroUltimoCheckin;
  const ocorrencias = data || [];
  const temMais = ocorrencias.length > limite;
  const itens = ocorrencias.slice(0, limite);
  const idsPoliciais = [...new Set([...itens.map((item) => item.registrada_por), ultimoCheckin?.responsavel_saida_id || ultimoCheckin?.responsavel_id].filter(Boolean))];
  const [{ data: viatura, error: erroViatura }, { data: policiais, error: erroPoliciais }] = await Promise.all([
    db.from("viaturas").select("id, identificacao, placa, quilometragem_atual, km_proxima_troca_oleo").eq("id", viaturaId).maybeSingle(),
    idsPoliciais.length ? db.from("policiais").select("id, nome_guerra, nome_completo, posto_graduacao, numeral, matricula").in("id", idsPoliciais) : Promise.resolve({ data: [], error: null }),
  ]);
  if (erroViatura) throw erroViatura;
  if (erroPoliciais) throw erroPoliciais;
  if (!viatura) return respostaErro(res, 404, "Viatura não encontrada.");
  const fotos = await assinarFotos(db, [...itens.flatMap((item) => item.fotos || []), ...(ultimoCheckin?.fotos_saida || [])]);
  const pessoas = new Map((policiais || []).map((pessoa) => [pessoa.id, pessoa]));
  const acompanhamentos = await anexarAcompanhamentosOcorrencias(db, itens);
  return res.status(200).json({
    viatura,
    pagina,
    tem_mais: temMais,
    ultimo_checkin: role !== "policial" && ultimoCheckin ? { ...ultimoCheckin, responsavel_saida: pessoas.get(ultimoCheckin.responsavel_saida_id), responsavel: pessoas.get(ultimoCheckin.responsavel_id), fotos_saida_urls: (ultimoCheckin.fotos_saida || []).map((path) => fotos.get(path)).filter(Boolean) } : null,
    ocorrencias: itens.map((item) => ({ ...item, policial: pessoas.get(item.registrada_por), fotos_urls: (item.fotos || []).map((path) => fotos.get(path)).filter(Boolean), acompanhamentos: acompanhamentos.get(item.id) || [] })),
  });
}

function turnoDoEvento(valor) {
  const hora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Fortaleza", hour: "2-digit", hourCycle: "h23" }).format(new Date(valor)));
  return hora >= 6 && hora < 18 ? "A" : "B";
}

function validarDataFiltro(valor) {
  return typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(`${valor}T00:00:00Z`)) ? valor : null;
}

async function processarHistoricoOperacional(req, res, db, role) {
  if (req.method === "DELETE") return await processarExclusaoHistorico(req, res, db, role);
  if (req.method !== "GET") return res.setHeader("Allow", "GET, DELETE").status(405).json({ error: "Método não permitido." });
  if (!PERFIS_GESTAO.includes(role)) return respostaErro(res, 403, "Sem permissão para consultar o histórico operacional consolidado.");

  const pagina = Math.max(1, Math.min(400, Number.parseInt(req.query?.pagina, 10) || 1));
  const limite = 25;
  const acao = texto(req.query?.acao) || "todas";
  const turno = texto(req.query?.turno).toUpperCase();
  const situacao = texto(req.query?.situacao);
  const viaturaId = texto(req.query?.viatura_id);
  const policialId = texto(req.query?.policial_id);
  const mes = texto(req.query?.mes);
  const datasInicio = [];
  const datasFim = [];
  const dataDe = validarDataFiltro(req.query?.de);
  const dataAte = validarDataFiltro(req.query?.ate);
  if (dataDe) datasInicio.push(dataDe);
  if (dataAte) datasFim.push(dataAte);
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    datasInicio.push(`${mes}-01`);
    const [ano, numeroMes] = mes.split("-").map(Number);
    datasFim.push(`${mes}-${String(new Date(Date.UTC(ano, numeroMes, 0)).getUTCDate()).padStart(2, "0")}`);
  }
  const limiteDe = datasInicio.length ? datasInicio.sort().at(-1) : null;
  const limiteAte = datasFim.length ? datasFim.sort()[0] : null;
  if (!["todas", "checkin", "checkout", "ocorrencia", "abastecimento"].includes(acao)) return respostaErro(res, 400, "Filtro de ação inválido.");
  if (turno && !["A", "B"].includes(turno)) return respostaErro(res, 400, "Filtro de turno inválido.");
  if (situacao && !["pendente", "analisada"].includes(situacao)) return respostaErro(res, 400, "Filtro de situação inválido.");
  if (viaturaId && !UUID_VALIDO.test(viaturaId)) return respostaErro(res, 400, "Filtro de viatura inválido.");
  if (policialId && !UUID_VALIDO.test(policialId)) return respostaErro(res, 400, "Filtro de policial inválido.");

  const dataHoraIso = (data) => `${data}T00:00:00-03:00`;
  const definirDatas = (query, coluna) => {
    if (limiteDe) query = query.gte(coluna, dataHoraIso(limiteDe));
    if (limiteAte) {
      const [ano, mesAtual, dia] = limiteAte.split("-").map(Number);
      const proximoDia = new Date(Date.UTC(ano, mesAtual - 1, dia + 1)).toISOString().slice(0, 10);
      query = query.lt(coluna, dataHoraIso(proximoDia));
    }
    return query;
  };
  const definirComum = (query, colunaData, colunaPolicial) => {
    query = definirDatas(query, colunaData);
    if (viaturaId) query = query.eq("viatura_id", viaturaId);
    if (policialId) query = query.eq(colunaPolicial, policialId);
    return query;
  };
  const carregarEventos = async ({ tabela, colunas, data, policial, tipo, configurar }) => {
    const eventos = [];
    const tamanhoLote = 500;
    for (let inicio = 0; inicio < 10000; inicio += tamanhoLote) {
      let query = db.from(tabela).select(colunas);
      if (configurar) query = configurar(query);
      query = definirComum(query, data, policial).order(data, { ascending: false }).range(inicio, inicio + tamanhoLote - 1);
      const { data: linhas, error } = await query;
      if (error) throw error;
      const lote = linhas || [];
      eventos.push(...lote.filter((item) => !turno || turnoDoEvento(item[data]) === turno).map((registro) => ({ tipo_acao: tipo, data_hora: registro[data], registro })));
      if (lote.length < tamanhoLote) break;
    }
    return eventos;
  };

  const movimentosColunas = "id, viatura_id, responsavel_id, responsavel_saida_id, iniciado_por, encerrado_por, data_hora_inicio, data_hora_fim, km_inicial, km_final, tipo_entrada, tipo_entrada_detalhe, tipo_saida, tipo_saida_detalhe, checklist_entrada, checklist_saida, observacoes_entrada, observacoes_saida, fotos_entrada, fotos_saida, ativo";
  const tarefas = [];
  if (!situacao && ["todas", "checkin"].includes(acao)) tarefas.push(carregarEventos({ tabela: "viatura_checkins", colunas: movimentosColunas, data: "data_hora_inicio", policial: "responsavel_id", tipo: "checkin" }));
  if (!situacao && ["todas", "checkout"].includes(acao)) tarefas.push(carregarEventos({ tabela: "viatura_checkins", colunas: movimentosColunas, data: "data_hora_fim", policial: "responsavel_saida_id", tipo: "checkout", configurar: (query) => query.not("data_hora_fim", "is", null) }));
  if (["todas", "ocorrencia", "abastecimento"].includes(acao) && !["checkin", "checkout"].includes(acao)) tarefas.push(carregarEventos({
    tabela: "viatura_ocorrencias",
    colunas: "id, checkin_id, viatura_id, registrada_por, tipo, descricao, data_hora, quilometragem, fotos, analisada",
    data: "data_hora",
    policial: "registrada_por",
    tipo: "ocorrencia",
    configurar: (query) => {
      if (situacao) query = query.eq("analisada", situacao === "analisada");
      if (acao === "abastecimento") query = query.eq("tipo", "abastecimento");
      return query;
    },
  }));

  const eventos = (await Promise.all(tarefas)).flat();
  const [{ data: viaturasOriginais, error: erroViaturas }, { data: policiaisFiltro, error: erroPoliciaisFiltro }] = await Promise.all([
    db.from("viaturas").select("id, identificacao, placa, modelo, situacao, ativo, quilometragem_atual, localizacao_atual").order("identificacao").limit(2000),
    db.from("policiais").select("id, nome_guerra, nome_completo, posto_graduacao, numeral, matricula").order("nome_guerra").limit(1000),
  ]);
  if (erroViaturas) throw erroViaturas;
  if (erroPoliciaisFiltro) throw erroPoliciaisFiltro;
  const filtroDeRegistros = Boolean(limiteDe || limiteAte || turno || policialId || situacao || !["", "todas"].includes(acao));
  const idsCorrespondentes = new Set(eventos.map((item) => item.registro.viatura_id));
  let viaturasVisiveis = (viaturasOriginais || []).filter((item) => !viaturaId || item.id === viaturaId);
  if (filtroDeRegistros) viaturasVisiveis = viaturasVisiveis.filter((item) => idsCorrespondentes.has(item.id));
  viaturasVisiveis.sort((a, b) => String(a.identificacao || "").localeCompare(String(b.identificacao || ""), "pt-BR", { numeric: true, sensitivity: "base" }));

  const inicioPagina = (pagina - 1) * limite;
  const paginaViaturas = viaturasVisiveis.slice(inicioPagina, inicioPagina + limite);
  const temMais = viaturasVisiveis.length > inicioPagina + limite;
  const idsPagina = paginaViaturas.map((item) => item.id);
  const eventosPagina = eventos.filter((item) => idsPagina.includes(item.registro.viatura_id));
  const { data: ativos, error: erroAtivos } = idsPagina.length
    ? await db.from("viatura_checkins").select(movimentosColunas).in("viatura_id", idsPagina).eq("ativo", true)
    : { data: [], error: null };
  if (erroAtivos) throw erroAtivos;
  const idsPoliciais = [...new Set([
    ...eventosPagina.flatMap(({ tipo_acao, registro }) => tipo_acao === "ocorrencia" ? [registro.registrada_por] : [registro.responsavel_id, registro.responsavel_saida_id]),
    ...(ativos || []).flatMap((item) => [item.responsavel_id, item.responsavel_saida_id]),
  ].filter(Boolean))];
  const ocorrenciasPagina = eventosPagina.filter((item) => item.tipo_acao === "ocorrencia").map((item) => item.registro);
  const caminhosFotos = [
    ...eventosPagina.flatMap(({ tipo_acao, registro }) => tipo_acao === "ocorrencia" ? registro.fotos || [] : [...(registro.fotos_entrada || []), ...(registro.fotos_saida || [])]),
    ...(ativos || []).flatMap((item) => item.fotos_entrada || []),
  ];
  const [{ data: policiais, error: erroPoliciais }, fotos] = await Promise.all([
    idsPoliciais.length ? db.from("policiais").select("id, nome_guerra, nome_completo, posto_graduacao, numeral, matricula").in("id", idsPoliciais) : Promise.resolve({ data: [], error: null }),
    assinarFotos(db, caminhosFotos),
  ]);
  if (erroPoliciais) throw erroPoliciais;
  const pessoas = new Map((policiais || []).map((item) => [item.id, item]));
  const acompanhamentos = await anexarAcompanhamentosOcorrencias(db, ocorrenciasPagina);
  const ocorrenciasPorViatura = new Map();
  for (const item of ocorrenciasPagina) {
    const lista = ocorrenciasPorViatura.get(item.viatura_id) || [];
    lista.push({ ...item, policial: pessoas.get(item.registrada_por), fotos_urls: (item.fotos || []).map((path) => fotos.get(path)).filter(Boolean), acompanhamentos: acompanhamentos.get(item.id) || [] });
    ocorrenciasPorViatura.set(item.viatura_id, lista);
  }
  const movimentacoesPorViatura = new Map();
  for (const { tipo_acao, registro } of eventosPagina.filter((item) => item.tipo_acao !== "ocorrencia")) {
    const lista = movimentacoesPorViatura.get(registro.viatura_id) || new Map();
    const movimento = lista.get(registro.id) || {
      ...registro,
      responsavel: pessoas.get(registro.responsavel_id),
      responsavel_saida: pessoas.get(registro.responsavel_saida_id),
      fotos_entrada_urls: (registro.fotos_entrada || []).map((path) => fotos.get(path)).filter(Boolean),
      fotos_saida_urls: (registro.fotos_saida || []).map((path) => fotos.get(path)).filter(Boolean),
      acoes_correspondentes: [],
    };
    if (!movimento.acoes_correspondentes.includes(tipo_acao)) movimento.acoes_correspondentes.push(tipo_acao);
    lista.set(registro.id, movimento);
    movimentacoesPorViatura.set(registro.viatura_id, lista);
  }
  const ativosPorViatura = new Map((ativos || []).map((item) => [item.viatura_id, {
    ...item,
    responsavel: pessoas.get(item.responsavel_id),
    fotos_entrada_urls: (item.fotos_entrada || []).map((path) => fotos.get(path)).filter(Boolean),
  }]));
  const viaturasComSituacao = await anexarSituacaoExibida(db, paginaViaturas);
  const viaturas = viaturasComSituacao.map((viatura) => ({
    viatura,
    checkin_ativo: ativosPorViatura.get(viatura.id) || null,
    movimentacoes: [...(movimentacoesPorViatura.get(viatura.id)?.values() || [])].sort((a, b) => new Date(b.data_hora_fim || b.data_hora_inicio) - new Date(a.data_hora_fim || a.data_hora_inicio)),
    ocorrencias: (ocorrenciasPorViatura.get(viatura.id) || []).sort((a, b) => new Date(b.data_hora) - new Date(a.data_hora)),
  }));
  return res.status(200).json({ viaturas, policiais: policiaisFiltro || [], pagina, por_pagina: limite, tem_mais: temMais });
}

async function processarAcompanhamentosOcorrencia(req, res, db, usuario, role) {
  if (!PERFIS_GESTAO.includes(role) && !(role === "policial" && req.method === "GET")) return respostaErro(res, 403, "Sem permissão para acompanhar ocorrências de viaturas.");
  const ocorrenciaId = texto(req.query?.ocorrencia_id);
  if (!UUID_VALIDO.test(ocorrenciaId)) return respostaErro(res, 400, "Ocorrência inválida.");

  const { data: ocorrencia, error: erroOcorrencia } = await db.from("viatura_ocorrencias")
    .select("id, viatura_id, tipo, analisada")
    .eq("id", ocorrenciaId)
    .maybeSingle();
  if (erroOcorrencia) throw erroOcorrencia;
  if (!ocorrencia) return respostaErro(res, 404, "Ocorrência não encontrada.");
  if (role === "policial" && !(await policialPodeConsultarViatura(db, usuario.id, ocorrencia.viatura_id))) return respostaErro(res, 403, "Você só pode consultar atualizações de uma viatura disponível ou sob sua responsabilidade.");

  if (req.method === "GET") {
    const { data, error } = await db.from("viatura_ocorrencia_acompanhamentos")
      .select("id, ocorrencia_id, registrado_por, tipo, oficina, comentario, created_at")
      .eq("ocorrencia_id", ocorrenciaId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    const ids = [...new Set((data || []).map((item) => item.registrado_por))];
    const { data: policiais, error: erroPoliciais } = ids.length
      ? await db.from("policiais").select("id, nome_guerra, nome_completo, posto_graduacao, numeral, matricula").in("id", ids)
      : { data: [], error: null };
    if (erroPoliciais) throw erroPoliciais;
    const pessoas = new Map((policiais || []).map((item) => [item.id, item]));
    const ocorrenciaResumo = { id: ocorrencia.id, viatura_id: ocorrencia.viatura_id, tipo: ocorrencia.tipo, analisada: ocorrencia.analisada };
    return res.status(200).json({ ocorrencia: ocorrenciaResumo, acompanhamentos: (data || []).map((item) => ({ ...item, policial: pessoas.get(item.registrado_por) })) });
  }

  if (req.method !== "POST") return res.setHeader("Allow", "GET, POST").status(405).json({ error: "Método não permitido." });
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) return respostaErro(res, 400, "Dados inválidos.");
  const tipo = texto(body.tipo);
  const comentario = texto(body.comentario);
  const oficina = texto(body.oficina).toUpperCase();
  if (!["comentario", "encaminhamento_oficina"].includes(tipo)) return respostaErro(res, 400, "Tipo de acompanhamento inválido.");
  if (!comentario || comentario.length > 3000) return respostaErro(res, 400, "Informe um comentário de até 3000 caracteres.");
  if (oficina.length > 160) return respostaErro(res, 400, "O nome da oficina deve ter até 160 caracteres.");
  if (tipo === "comentario" && oficina) return respostaErro(res, 400, "Informe oficina somente no encaminhamento.");

  const { data, error } = await db.from("viatura_ocorrencia_acompanhamentos")
    .insert({ ocorrencia_id: ocorrenciaId, registrado_por: usuario.id, tipo, oficina: oficina || null, comentario })
    .select("id, ocorrencia_id, registrado_por, tipo, oficina, comentario, created_at")
    .single();
  if (error) throw error;
  return res.status(201).json({ acompanhamento: data, ocorrencia: { id: ocorrencia.id, viatura_id: ocorrencia.viatura_id, tipo: ocorrencia.tipo, analisada: ocorrencia.analisada } });
}

async function processarCheckins(req, res, db, usuario, role) {
  if (!PERFIS_CHECKIN.includes(role)) return respostaErro(res, 403, "Sem permissão para acessar o controle de viaturas.");
  if (req.method === "GET") {
    if (req.query?.historico_viatura_id) return await processarHistoricoOcorrenciasViatura(req, res, db, usuario, role);
    const carregarCheckinsVisiveis = async () => {
      if (role === "policial") return db.from("viatura_checkins").select("*").eq("responsavel_id", usuario.id).order("data_hora_inicio", { ascending: false }).limit(100);
      const [{ data: ativos, error: erroAtivos }, { data: encerrados, error: erroEncerrados }] = await Promise.all([
        db.from("viatura_checkins").select("*").eq("ativo", true).order("data_hora_inicio", { ascending: false }),
        db.from("viatura_checkins").select("*").eq("ativo", false).order("data_hora_inicio", { ascending: false }).limit(100),
      ]);
      return { data: [...(ativos || []), ...(encerrados || [])], error: erroAtivos || erroEncerrados };
    };
    const [{ data: viaturasOriginais, error: erroViaturas }, { data: checkins, error: erroCheckins }] = await Promise.all([
      db.from("viaturas").select("id, identificacao, placa, modelo, situacao, ativo, quilometragem_atual, km_proxima_troca_oleo").order("identificacao"),
      carregarCheckinsVisiveis(),
    ]);
    if (erroViaturas) throw erroViaturas;
    if (erroCheckins) throw erroCheckins;
    let viaturas = viaturasOriginais || [];
    if (role === "policial") {
      const { data: ocupacoes, error } = await db.from("viatura_checkins").select("viatura_id, responsavel_id").eq("ativo", true);
      if (error) throw error;
      const ocupadasPorOutros = new Set((ocupacoes || []).filter((item) => item.responsavel_id !== usuario.id).map((item) => item.viatura_id));
      viaturas = viaturas.filter((item) => item.ativo && !["baixada", "inativa"].includes(item.situacao) && !ocupadasPorOutros.has(item.id));
      // Ocorrências da operação atual; o histórico anterior é carregado pela consulta autorizada por viatura.
      var consultaOcorrencias = (checkins || []).some((item) => item.ativo)
        ? db.from("viatura_ocorrencias").select("*").in("checkin_id", (checkins || []).filter((item) => item.ativo).map((item) => item.id)).order("data_hora", { ascending: false }).limit(100)
        : Promise.resolve({ data: [], error: null });
    } else {
      var consultaOcorrencias = db.from("viatura_ocorrencias").select("*").order("data_hora", { ascending: false }).limit(100);
    }
    viaturas = await anexarSituacaoExibida(db, viaturas);
    const { data: ocorrencias, error: erroOcorrencias } = await consultaOcorrencias;
    if (erroOcorrencias) throw erroOcorrencias;
    const idsPoliciais = [...new Set([...(checkins || []).flatMap((item) => [item.responsavel_id, item.responsavel_saida_id]), ...(ocorrencias || []).map((item) => item.registrada_por)].filter(Boolean))];
    const { data: policiais, error: erroPoliciais } = idsPoliciais.length
      ? await db.from("policiais").select("id, nome_guerra, nome_completo, posto_graduacao, numeral, matricula, unidade, status").in("id", idsPoliciais)
      : { data: [], error: null };
    if (erroPoliciais) throw erroPoliciais;
    const caminhosFotos = [
      ...(checkins || []).flatMap((item) => [...(item.fotos_entrada || []), ...(item.fotos_saida || [])]),
      ...(ocorrencias || []).flatMap((item) => item.fotos || []),
    ];
    const fotosAssinadas = await assinarFotos(db, caminhosFotos);
    const pessoas = new Map((policiais || []).map((policial) => [policial.id, policial]));
    const viaturasPorId = new Map((viaturas || []).map((viatura) => [viatura.id, viatura]));
    const acompanhamentos = await anexarAcompanhamentosOcorrencias(db, ocorrencias || []);
    return res.status(200).json({
      viaturas: viaturas || [],
      usuario: { id: usuario.id, nome_guerra: usuario.nome_guerra, nome_completo: usuario.nome_completo, posto_graduacao: usuario.posto_graduacao, numeral: usuario.numeral, matricula: usuario.matricula, unidade: usuario.unidade, role },
      checkins: (checkins || []).map((item) => ({ ...item, viatura: viaturasPorId.get(item.viatura_id), responsavel: pessoas.get(item.responsavel_id), responsavel_saida: pessoas.get(item.responsavel_saida_id), fotos_entrada_urls: (item.fotos_entrada || []).map((path) => fotosAssinadas.get(path)).filter(Boolean), fotos_saida_urls: (item.fotos_saida || []).map((path) => fotosAssinadas.get(path)).filter(Boolean) })),
      ocorrencias: (ocorrencias || []).map((item) => ({ ...item, viatura: viaturasPorId.get(item.viatura_id), policial: pessoas.get(item.registrada_por), fotos_urls: (item.fotos || []).map((path) => fotosAssinadas.get(path)).filter(Boolean), acompanhamentos: acompanhamentos.get(item.id) || [] })),
    });
  }

  if (req.method !== "POST") return res.setHeader("Allow", "GET, POST").status(405).json({ error: "Método não permitido." });
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) return respostaErro(res, 400, "Dados inválidos.");
  const acao = texto(body.acao);
  const fotos = normalizarFotos(body.fotos || []);
  if (!fotos) return respostaErro(res, 400, "Envie até cinco fotos JPEG, PNG ou WebP, com até 2 MB por foto e 2,8 MB no total.");
  const km = Number(body.quilometragem);
  if (!Number.isFinite(km) || km < 0) return respostaErro(res, 400, "Informe uma quilometragem válida.");
  let resultado;
  if (acao === "checkin") {
    if (!TIPOS_ENTRADA.includes(body.tipo)) return respostaErro(res, 400, "Tipo de entrada inválido.");
    const tipoDetalhe = texto(body.tipo_detalhe);
    if (body.tipo === "outras_situacoes" && tipoDetalhe.length > 300) return respostaErro(res, 400, "A finalidade específica do check-in deve ter até 300 caracteres.");
    if (!UUID_VALIDO.test(body.viatura_id || "")) return respostaErro(res, 400, "Selecione uma viatura.");
    const checklist = validarChecklistViatura(body.checklist);
    if (!checklist) return respostaErro(res, 400, "Preencha as condições obrigatórias do checklist de entrada.");
    if (body.tipo === "outras_situacoes") checklist.tipo_entrada_detalhe = tipoDetalhe;
    const pathFotos = await guardarFotos(db, fotos, usuario.id);
    const { data, error } = await db.rpc("viatura_checkin_criar", { p_viatura_id: body.viatura_id, p_responsavel_id: usuario.id, p_usuario_id: usuario.id, p_km: km, p_tipo: body.tipo, p_checklist: checklist, p_observacoes: texto(body.observacoes) || null, p_fotos: pathFotos });
    if (error) throw error;
    resultado = data;
  } else if (acao === "checkout") {
    if (!TIPOS_SAIDA.includes(body.tipo)) return respostaErro(res, 400, "Tipo de saída inválido.");
    const tipoDetalhe = texto(body.tipo_detalhe);
    if (body.tipo === "outras_situacoes" && tipoDetalhe.length > 300) return respostaErro(res, 400, "A finalidade específica do check-out deve ter até 300 caracteres.");
    if (body.tipo === "baixa_definitiva" && !["master", "p4"].includes(role)) return respostaErro(res, 403, "Somente Master e P4 podem registrar baixa definitiva.");
    if (!UUID_VALIDO.test(body.checkin_id || "")) return respostaErro(res, 400, "Check-in inválido.");
    if (role === "policial" && !(await policialResponsavelPeloCheckin(db, usuario.id, body.checkin_id))) return respostaErro(res, 403, "Você só pode encerrar um check-in sob sua responsabilidade.");
    const checklist = validarChecklistViatura(body.checklist);
    if (!checklist) return respostaErro(res, 400, "Preencha as condições obrigatórias do checklist de saída.");
    if (body.tipo === "outras_situacoes") checklist.tipo_saida_detalhe = tipoDetalhe;
    const pathFotos = await guardarFotos(db, fotos, usuario.id);
    const { data, error } = await db.rpc("viatura_checkout_fechar", { p_checkin_id: body.checkin_id, p_responsavel_id: usuario.id, p_usuario_id: usuario.id, p_km: km, p_tipo: body.tipo, p_checklist: checklist, p_observacoes: texto(body.observacoes) || null, p_fotos: pathFotos });
    if (error) throw error;
    resultado = data;
  } else if (acao === "ocorrencia") {
    if (!TIPOS_OCORRENCIA.includes(body.tipo) || !UUID_VALIDO.test(body.checkin_id || "")) return respostaErro(res, 400, "Tipo ou check-in inválido.");
    if (role === "policial" && !(await policialResponsavelPeloCheckin(db, usuario.id, body.checkin_id))) return respostaErro(res, 403, "Você só pode registrar ocorrências em um check-in sob sua responsabilidade.");
    const descricao = texto(body.descricao);
    if (!descricao || descricao.length > 5000) return respostaErro(res, 400, "Informe uma descrição de até 5000 caracteres.");
    const pathFotos = await guardarFotos(db, fotos, usuario.id);
    const { data, error } = await db.rpc("viatura_ocorrencia_criar", { p_checkin_id: body.checkin_id, p_usuario_id: usuario.id, p_tipo: body.tipo, p_descricao: descricao, p_data_hora: body.data_hora || new Date().toISOString(), p_km: km, p_fotos: pathFotos });
    if (error) throw error;
    resultado = data;
  } else return respostaErro(res, 400, "Ação inválida.");
  return res.status(201).json({ registro: resultado });
}

function texto(valor) {
  return typeof valor === "string" ? valor.trim() : "";
}

function validarLinkGoogleMaps(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor !== "string" || valor.length > 2048) return undefined;
  try {
    const url = new URL(valor.trim());
    const hostPermitido = url.hostname === "maps.app.goo.gl"
      || url.hostname === "google.com"
      || url.hostname.endsWith(".google.com");
    return url.protocol === "https:" && hostPermitido ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function numeroInteiro(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = Number(valor);
  return Number.isInteger(numero) ? numero : null;
}

function numeroNaoNegativo(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
}

async function anexarNomeAtualizacao(db, viaturas) {
  if (!Array.isArray(viaturas) || viaturas.length === 0) return viaturas || [];
  const ids = [...new Set(viaturas.map((item) => item.atualizado_por).filter(Boolean))];
  if (!ids.length) return viaturas;
  const { data: policiais, error } = await db
    .from("policiais")
    .select("id, nome_guerra, nome_completo, numeral, posto_graduacao, matricula")
    .in("id", ids);
  if (error) throw error;
  const mapa = new Map((policiais || []).map((p) => [p.id, p]));
  return viaturas.map((item) => {
    const p = mapa.get(item.atualizado_por);
    const nome = p
      ? [p.posto_graduacao, p.numeral, p.nome_guerra || p.nome_completo, p.matricula]
          .filter(Boolean)
          .join(" ")
      : null;
    return { ...item, atualizado_por_nome: nome };
  });
}

async function macroareaAtiva(db, id) {
  if (!id) return true;
  if (!UUID_VALIDO.test(id)) return false;
  const { data, error } = await db
    .from("macroareas_operacao")
    .select("id")
    .eq("id", id)
    .eq("ativa", true)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function validarAtivacaoMicroarea(db, microareaId, macroareaIdInformada) {
  let macroareaId = macroareaIdInformada;
  if (!macroareaId) {
    const { data, error } = await db
      .from("microareas_operacao")
      .select("macroarea_id")
      .eq("id", microareaId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return false;
    macroareaId = data.macroarea_id;
  }
  return macroareaAtiva(db, macroareaId);
}

async function processarAreasOperacao(req, res, db, role) {
  if (PERFIS_BLOQUEADOS_AREAS.includes(role)) {
    return respostaErro(res, 403, "Sem permissão para consultar áreas de operação.");
  }

  if (req.method === "GET") {
    const { data, error } = await db
      .from("macroareas_operacao")
      .select("id, nome, descricao, ativa, created_at, updated_at, microareas_operacao(id, macroarea_id, nome, google_maps_url, latitude, longitude, comentario, ativa, created_at, updated_at)")
      .order("nome", { ascending: true });
    if (error) throw error;
    return res.status(200).json({ macroareas: data || [] });
  }

  if (!PERFIS_GESTAO_AREAS.includes(role)) {
    return respostaErro(res, 403, "Sem permissão para gerenciar áreas de operação.");
  }
  if (!["POST", "PATCH"].includes(req.method)) {
    return res.setHeader("Allow", "GET, POST, PATCH").status(405).json({ error: "Método não permitido." });
  }

  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return respostaErro(res, 400, "Dados da área inválidos.");
  }
  const tipo = texto(body.tipo).toLowerCase();
  const tabela = tipo === "microarea" ? "microareas_operacao" : tipo === "macroarea" ? "macroareas_operacao" : null;
  if (!tabela) return respostaErro(res, 400, "Tipo de área inválido.");

  const dados = { updated_at: new Date().toISOString() };
  if (Object.prototype.hasOwnProperty.call(body, "nome")) {
    dados.nome = texto(body.nome);
    if (!dados.nome) return respostaErro(res, 400, "Informe o nome da área.");
  }
  if (tipo === "macroarea" && Object.prototype.hasOwnProperty.call(body, "descricao")) {
    dados.descricao = texto(body.descricao) || null;
  }
  if (tipo === "microarea" && Object.prototype.hasOwnProperty.call(body, "google_maps_url")) {
    dados.google_maps_url = validarLinkGoogleMaps(body.google_maps_url);
    if (dados.google_maps_url === undefined) {
      return respostaErro(res, 400, "Informe um link HTTPS válido do Google Maps.");
    }
  }
  if (tipo === "microarea" && Object.prototype.hasOwnProperty.call(body, "comentario")) {
    if (typeof body.comentario !== "string" || body.comentario.length > 1000) {
      return respostaErro(res, 400, "O comentário deve ter até 1000 caracteres.");
    }
    dados.comentario = texto(body.comentario) || null;
  }
  if (tipo === "microarea" && (Object.prototype.hasOwnProperty.call(body, "latitude") || Object.prototype.hasOwnProperty.call(body, "longitude"))) {
    if (!Object.prototype.hasOwnProperty.call(body, "latitude") || !Object.prototype.hasOwnProperty.call(body, "longitude")) {
      return respostaErro(res, 400, "Informe latitude e longitude juntas.");
    }
    const latitudeVazia = body.latitude === null || body.latitude === "";
    const longitudeVazia = body.longitude === null || body.longitude === "";
    if (latitudeVazia !== longitudeVazia) {
      return respostaErro(res, 400, "Informe latitude e longitude juntas.");
    }
    if (latitudeVazia) {
      dados.latitude = null;
      dados.longitude = null;
    } else {
      const latitude = Number(body.latitude);
      const longitude = Number(body.longitude);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        return respostaErro(res, 400, "Latitude ou longitude fora dos limites válidos.");
      }
      dados.latitude = latitude;
      dados.longitude = longitude;
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "ativa")) {
    if (typeof body.ativa !== "boolean") return respostaErro(res, 400, "Situação da área inválida.");
    dados.ativa = body.ativa;
  }
  if (tipo === "microarea" && Object.prototype.hasOwnProperty.call(body, "macroarea_id")) {
    dados.macroarea_id = texto(body.macroarea_id);
    if (!dados.macroarea_id || !(await macroareaAtiva(db, dados.macroarea_id))) {
      return respostaErro(res, 400, "Selecione uma macroárea ativa para a microárea.");
    }
  }
  if (tipo === "microarea" && body.ativa === true) {
    const macroareaId = dados.macroarea_id || null;
    if (!(await validarAtivacaoMicroarea(db, req.query?.id, macroareaId))) {
      return respostaErro(res, 400, "Uma microárea só pode ficar ativa sob uma macroárea ativa.");
    }
  }

  if (req.method === "POST") {
    if (!dados.nome) return respostaErro(res, 400, "Informe o nome da área.");
    if (tipo === "microarea") {
      if (!dados.macroarea_id) return respostaErro(res, 400, "Selecione uma macroárea ativa para a microárea.");
    }
    const { data, error } = await db.from(tabela).insert(dados).select("*").single();
    if (error) {
      if (error.code === "23503" || error.code === "23505") return respostaErro(res, 400, "Não foi possível salvar a área. Confira os dados e a macroárea selecionada.");
      throw error;
    }
    return res.status(201).json({ area: data });
  }

  const id = texto(req.query?.id);
  if (!id) return respostaErro(res, 400, "Identificador da área inválido.");
  if (tipo === "microarea" && Object.prototype.hasOwnProperty.call(dados, "macroarea_id") && (!dados.macroarea_id || !(await macroareaAtiva(db, dados.macroarea_id)))) {
    return respostaErro(res, 400, "Selecione uma macroárea ativa para a microárea.");
  }
  if (Object.keys(dados).length === 1) return respostaErro(res, 400, "Nenhum campo permitido para atualização.");

  const { data, error } = await db.from(tabela).update(dados).eq("id", id).select("*").maybeSingle();
  if (error) {
    if (error.code === "23503" || error.code === "23505") return respostaErro(res, 400, "Não foi possível atualizar a área. Confira os dados e a macroárea selecionada.");
    throw error;
  }
  if (!data) return respostaErro(res, 404, "Área não encontrada.");
  return res.status(200).json({ area: data });
}

export default async function handler(req, res) {
  try {
    if (req.query?.recurso === "checklist-publico") {
      return await processarChecklistPublico(req, res, supabaseAdmin());
    }

    const usuario = await usuarioAutenticado(req, res);
    if (!usuario) return;

    const db = supabaseAdmin();
    const role = usuario.is_master === true ? "master" : normalizarRole(usuario);

    if (req.query?.recurso === "checklist-link") {
      return await processarLinkChecklist(req, res, db, role);
    }

    if (req.query?.recurso === "historico-operacional-viaturas") {
      return await processarHistoricoOperacional(req, res, db, role);
    }

    if (req.query?.recurso === "ocorrencia-acompanhamentos") {
      return await processarAcompanhamentosOcorrencia(req, res, db, usuario, role);
    }

    if (req.query?.recurso === "checkins") {
      return await processarCheckins(req, res, db, usuario, role);
    }

    if (req.query?.recurso === "areas-operacao") {
      return await processarAreasOperacao(req, res, db, role);
    }
    if (req.query?.recurso === "livro-permanencia") {
      return await processarLivroPermanencia(req, res, db, role);
    }

    if (req.method === "GET") {
      const podeConsultarAreas = !PERFIS_BLOQUEADOS_AREAS.includes(role);
      const { data, error } = await db
        .from("viaturas")
        .select(podeConsultarAreas ? "*, macroareas_operacao(id, nome)" : "*")
        .order("ativo", { ascending: false })
        .order("identificacao", { ascending: true });

      if (error) throw error;
      const viaturasSemAreas = podeConsultarAreas
        ? data || []
        : (data || []).map(({ macroarea_id, area_operacao, ...viatura }) => viatura);
      const viaturasAtualizadas = await anexarNomeAtualizacao(db, viaturasSemAreas);
      const viaturas = await anexarSituacaoExibida(db, viaturasAtualizadas);
      return res.status(200).json({ viaturas });
    }

    if (!PERFIS_GESTAO.includes(role)) {
      return respostaErro(res, 403, "Sem permissão para gerenciar viaturas.");
    }

    if (req.method === "POST") {
      const body = req.body;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return respostaErro(res, 400, "Dados da viatura inválidos.");
      }

      const unidade = texto(body.unidade).toUpperCase();
      const identificacao = texto(body.identificacao).toUpperCase();
      const placa = texto(body.placa).toUpperCase();
      const marca = texto(body.marca).toUpperCase();
      const modelo = texto(body.modelo).toUpperCase();
      const ano = numeroInteiro(body.ano);
      const tipo = texto(body.tipo).toLowerCase() || "organica";
      const situacao = texto(body.situacao).toLowerCase() || "operando";
      const dataBaixa = texto(body.data_baixa) || null;
      const motivoBaixa = texto(body.motivo_baixa);
      const oficina = texto(body.oficina).toUpperCase();
      const localizacaoInformada = texto(body.localizacao_atual);
      const localizacaoAtual =
        situacao === "manutencao"
          ? "Pátio da oficina"
          : localizacaoInformada || "Pátio da CIA";
      const macroareaIdInformada = texto(body.macroarea_id);
      const macroareaId = situacao === "operando" ? macroareaIdInformada || null : null;
      const dataManutencao = texto(body.data_manutencao) || null;
      const motivoManutencao = texto(body.motivo_manutencao);
      const quilometragemAtual = numeroNaoNegativo(body.quilometragem_atual);
      const kmUltimaTrocaOleo = numeroNaoNegativo(body.km_ultima_troca_oleo);
      const dataUltimaTrocaOleo = texto(body.data_ultima_troca_oleo) || null;
      const kmProximaTrocaOleo = numeroNaoNegativo(body.km_proxima_troca_oleo);
      const dataUltimaManutencao = texto(body.data_ultima_manutencao) || null;
      const kmUltimaManutencao = numeroNaoNegativo(body.km_ultima_manutencao);
      const observacoes = texto(body.observacoes);

      if (!unidade || !identificacao || !placa || !marca || !modelo) {
        return respostaErro(
          res,
          400,
          "Unidade, identificação, placa, marca e modelo são obrigatórios.",
        );
      }

      if (!SITUACOES_VALIDAS.includes(situacao)) {
        return respostaErro(res, 400, "Situação da viatura inválida.");
      }

      if (!TIPOS_VALIDOS.includes(tipo)) {
        return respostaErro(res, 400, "Tipo da viatura inválido.");
      }

      if (macroareaId && !(await macroareaAtiva(db, macroareaId))) {
        return respostaErro(res, 400, "Selecione uma macroárea ativa.");
      }

      if (situacao !== "manutencao" && (!localizacaoAtual || localizacaoAtual === "Outro" || localizacaoAtual === "Pátio da oficina")) {
        return respostaErro(res, 400, "Informe a localização: Pátio da CIA ou outra localização detalhada.");
      }

      if (situacao === "baixada" && !dataBaixa) {
        return respostaErro(res, 400, "Informe a data da baixa para uma viatura baixada.");
      }

      if (situacao === "manutencao" && !dataManutencao) {
        return respostaErro(res, 400, "Informe a data de início da manutenção.");
      }

      if (situacao === "operando" && !localizacaoAtual) {
        return respostaErro(res, 400, "Informe onde a viatura está localizada.");
      }

      if (body.ano !== null && body.ano !== undefined && body.ano !== "" && ano === null) {
        return respostaErro(res, 400, "Ano da viatura inválido.");
      }

      for (const [campo, valor] of [
        ["quilometragem_atual", body.quilometragem_atual],
        ["km_ultima_troca_oleo", body.km_ultima_troca_oleo],
        ["km_proxima_troca_oleo", body.km_proxima_troca_oleo],
        ["km_ultima_manutencao", body.km_ultima_manutencao],
      ]) {
        if (valor !== null && valor !== undefined && valor !== "" && numeroNaoNegativo(valor) === null) {
          return respostaErro(res, 400, `${campo} inválido.`);
        }
      }

      const { data, error } = await db
        .from("viaturas")
        .insert({
          unidade,
          identificacao,
          placa,
          marca,
          modelo,
          ano,
          tipo,
          situacao,
          data_baixa: situacao === "baixada" ? dataBaixa : null,
          motivo_baixa: situacao === "baixada" ? motivoBaixa || null : null,
          oficina: ["baixada", "manutencao"].includes(situacao) ? oficina || null : null,
          localizacao_atual: localizacaoAtual,
          area_operacao: null,
          macroarea_id: macroareaId,
          data_manutencao: situacao === "manutencao" ? dataManutencao : null,
          motivo_manutencao: situacao === "manutencao" ? motivoManutencao || null : null,
          quilometragem_atual: quilometragemAtual,
          km_ultima_troca_oleo: kmUltimaTrocaOleo,
          data_ultima_troca_oleo: dataUltimaTrocaOleo,
          km_proxima_troca_oleo: kmProximaTrocaOleo,
          data_ultima_manutencao: dataUltimaManutencao,
          km_ultima_manutencao: kmUltimaManutencao,
          observacoes: observacoes || null,
          ativo: situacao !== "inativa",
          atualizado_por: usuario.id,
          atualizado_em: new Date().toISOString(),
        })
        .select("*")
        .single();

      if (error) {
        if (error.code === "23505") {
          return respostaErro(res, 409, "Já existe uma viatura com essa placa.");
        }
        throw error;
      }

      const [viatura] = await anexarNomeAtualizacao(db, [data]);
      return res.status(201).json({ viatura });
    }

    if (req.method === "PATCH") {
      const id = texto(req.query?.id);
      if (!id) return respostaErro(res, 400, "Identificador da viatura inválido.");

      const body = req.body;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return respostaErro(res, 400, "Dados de atualização inválidos.");
      }

      const camposPermitidos = [
        "unidade",
        "identificacao",
        "placa",
        "marca",
        "modelo",
        "ano",
        "tipo",
        "situacao",
        "data_baixa",
        "motivo_baixa",
        "oficina",
        "localizacao_atual",
        "area_operacao",
        "macroarea_id",
        "data_manutencao",
        "motivo_manutencao",
        "quilometragem_atual",
        "km_ultima_troca_oleo",
        "data_ultima_troca_oleo",
        "km_proxima_troca_oleo",
        "data_ultima_manutencao",
        "km_ultima_manutencao",
        "observacoes",
        "ativo",
      ];
      const dados = {};

      for (const campo of camposPermitidos) {
        if (Object.prototype.hasOwnProperty.call(body, campo)) {
          dados[campo] = body[campo];
        }
      }

      if (Object.keys(dados).length === 0) {
        return respostaErro(res, 400, "Nenhum campo permitido para atualização.");
      }

      for (const campo of ["unidade", "identificacao", "placa", "marca", "modelo"]) {
        if (Object.prototype.hasOwnProperty.call(dados, campo)) {
          dados[campo] = texto(dados[campo]).toUpperCase();
          if (!dados[campo]) {
            return respostaErro(res, 400, `${campo} é obrigatório.`);
          }
        }
      }

      if (Object.prototype.hasOwnProperty.call(dados, "ano")) {
        const ano = numeroInteiro(dados.ano);
        if (dados.ano !== null && dados.ano !== "" && ano === null) {
          return respostaErro(res, 400, "Ano da viatura inválido.");
        }
        dados.ano = ano;
      }

      for (const campo of [
        "quilometragem_atual",
        "km_ultima_troca_oleo",
        "km_proxima_troca_oleo",
        "km_ultima_manutencao",
      ]) {
        if (Object.prototype.hasOwnProperty.call(dados, campo)) {
          const valor = numeroNaoNegativo(dados[campo]);
          if (dados[campo] !== null && dados[campo] !== "" && valor === null) {
            return respostaErro(res, 400, `${campo} inválido.`);
          }
          dados[campo] = valor;
        }
      }

      if (Object.prototype.hasOwnProperty.call(dados, "tipo")) {
        dados.tipo = texto(dados.tipo).toLowerCase();
        if (!TIPOS_VALIDOS.includes(dados.tipo)) {
          return respostaErro(res, 400, "Tipo da viatura inválido.");
        }
      }

      if (Object.prototype.hasOwnProperty.call(dados, "macroarea_id")) {
        dados.macroarea_id = texto(dados.macroarea_id) || null;
        if (dados.macroarea_id && !(await macroareaAtiva(db, dados.macroarea_id))) {
          return respostaErro(res, 400, "Selecione uma macroárea ativa.");
        }
        if (dados.macroarea_id) {
          const { data: viaturaAtual, error: erroViaturaAtual } = await db
            .from("viaturas")
            .select("situacao")
            .eq("id", id)
            .maybeSingle();
          if (erroViaturaAtual) throw erroViaturaAtual;
          const situacaoEfetiva = texto(dados.situacao || viaturaAtual?.situacao).toLowerCase();
          if (viaturaAtual && situacaoEfetiva !== "operando") {
            return respostaErro(res, 400, "Somente viaturas operando podem receber uma macroárea.");
          }
        }
      }

      if (Object.prototype.hasOwnProperty.call(dados, "situacao")) {
        dados.situacao = texto(dados.situacao).toLowerCase();
        if (!SITUACOES_VALIDAS.includes(dados.situacao)) {
          return respostaErro(res, 400, "Situação da viatura inválida.");
        }
        if (!Object.prototype.hasOwnProperty.call(dados, "ativo")) {
          dados.ativo = dados.situacao !== "inativa";
        }
        if (dados.situacao !== "baixada") {
          dados.data_baixa = null;
          dados.motivo_baixa = null;
        }
        if (dados.situacao !== "manutencao") {
          dados.data_manutencao = null;
          dados.motivo_manutencao = null;
        }
        if (dados.situacao === "manutencao" && !Object.prototype.hasOwnProperty.call(dados, "localizacao_atual")) {
          dados.localizacao_atual = "Pátio da oficina";
        } else if (dados.situacao === "baixada" && !Object.prototype.hasOwnProperty.call(dados, "localizacao_atual")) {
          dados.localizacao_atual = "Pátio da CIA";
        } else if (dados.situacao === "operando" && !Object.prototype.hasOwnProperty.call(dados, "localizacao_atual")) {
          dados.localizacao_atual = "Pátio da CIA";
        }
        if (dados.situacao !== "operando") {
          dados.area_operacao = null;
          dados.macroarea_id = null;
        }
        if (dados.situacao === "operando" || dados.situacao === "inativa") {
          dados.oficina = null;
        }
        if (dados.situacao === "manutencao") {
          dados.localizacao_atual = "Pátio da oficina";
        }
      }

      if (Object.prototype.hasOwnProperty.call(dados, "data_baixa")) {
        dados.data_baixa = texto(dados.data_baixa) || null;
      }
      if (Object.prototype.hasOwnProperty.call(dados, "motivo_baixa")) {
        dados.motivo_baixa = texto(dados.motivo_baixa) || null;
      }
      if (Object.prototype.hasOwnProperty.call(dados, "oficina")) {
        dados.oficina = texto(dados.oficina).toUpperCase() || null;
      }
      if (Object.prototype.hasOwnProperty.call(dados, "localizacao_atual")) {
        dados.localizacao_atual = texto(dados.localizacao_atual) || null;
      }
      if (Object.prototype.hasOwnProperty.call(dados, "area_operacao")) {
        dados.area_operacao = null;
      }
      if (Object.prototype.hasOwnProperty.call(dados, "data_manutencao")) {
        dados.data_manutencao = texto(dados.data_manutencao) || null;
      }
      if (Object.prototype.hasOwnProperty.call(dados, "motivo_manutencao")) {
        dados.motivo_manutencao = texto(dados.motivo_manutencao) || null;
      }
      for (const campo of ["data_ultima_troca_oleo", "data_ultima_manutencao"]) {
        if (Object.prototype.hasOwnProperty.call(dados, campo)) {
          dados[campo] = texto(dados[campo]) || null;
        }
      }
      if (Object.prototype.hasOwnProperty.call(dados, "observacoes")) {
        dados.observacoes = texto(dados.observacoes) || null;
      }

      if (Object.prototype.hasOwnProperty.call(dados, "localizacao_atual")) {
        if (dados.situacao === "manutencao") {
          dados.localizacao_atual = "Pátio da oficina";
        } else if (!dados.localizacao_atual || dados.localizacao_atual === "Outro" || dados.localizacao_atual === "Pátio da oficina") {
          return respostaErro(res, 400, "Informe a localização: Pátio da CIA ou outra localização detalhada.");
        }
      }

      if (Object.prototype.hasOwnProperty.call(dados, "ativo")) {
        dados.ativo = Boolean(dados.ativo);
        if (!dados.ativo) dados.situacao = "inativa";
        if (dados.ativo && dados.situacao === "inativa") dados.situacao = "operando";
      }

      dados.atualizado_por = usuario.id;
      dados.atualizado_em = new Date().toISOString();

      if (Object.prototype.hasOwnProperty.call(dados, "macroarea_id") && !Object.prototype.hasOwnProperty.call(dados, "situacao")) {
        dados.area_operacao = null;
      }

      const { data, error } = await db
        .from("viaturas")
        .update(dados)
        .eq("id", id)
        .select("*, macroareas_operacao(id, nome)")
        .maybeSingle();

      if (error) {
        if (error.code === "23505") {
          return respostaErro(res, 409, "Já existe uma viatura com essa placa.");
        }
        throw error;
      }
      if (!data) return respostaErro(res, 404, "Viatura não encontrada.");

      const [viatura] = await anexarNomeAtualizacao(db, [data]);
      return res.status(200).json({ viatura });
    }

    if (req.method === "DELETE") {
      const id = texto(req.query?.id);
      if (!id) return respostaErro(res, 400, "Identificador da viatura inválido.");

      const { data, error } = await db
        .from("viaturas")
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();

      if (error) {
        if (error.code === "23503") {
          return respostaErro(res, 409, "Esta viatura possui vínculos e não pode ser excluída. Inative o cadastro para preservá-la no histórico.");
        }
        throw error;
      }
      if (!data) return respostaErro(res, 404, "Viatura não encontrada.");
      return res.status(200).json({ sucesso: true, id: data.id });
    }

    return res
      .setHeader("Allow", "GET, POST, PATCH, DELETE")
      .status(405)
      .json({ error: "Método não permitido." });
  } catch (error) {
    console.error("Erro na API de viaturas:", error.message);
    if (error.code === "P0001") return res.status(409).json({ error: error.message });
    if (error.code === "23505") return respostaErro(res, 409, "A viatura já possui check-in ativo.");
    if (error.code === "STORAGE_BUCKET_MISSING") return res.status(503).json({ error: error.message });
    if (error.code === "42601" && /subquery must return only one column/i.test(error.message || "")) {
      return res.status(500).json({ error: `${error.message} A migration 20261019000100_checkin_checkout_viaturas.sql define retorno composto direto para a RPC de check-in; confira se essa definição já está aplicada no Supabase.` });
    }
    if (error.code === "21000") {
      return res.status(500).json({ error: `${error.message} Confira a função ou consulta remota que originou a cardinalidade antes de aplicar qualquer correção.` });
    }
    if (["42P01", "42883", "PGRST202"].includes(error.code)) {
      return res.status(503).json({ error: "A estrutura do módulo de check-in/check-out ainda não foi criada no Supabase. Revise e aplique a migration 20261019000100_checkin_checkout_viaturas.sql." });
    }
    return res.status(500).json({
      error: "Não foi possível concluir a operação.",
    });
  }
}
