import { randomUUID } from "node:crypto";
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
const TIPOS_ENTRADA = ["inicio_servico", "retirada_oficina", "recebimento_opm", "viatura_nova"];
const TIPOS_SAIDA = ["fim_servico", "encaminhamento_oficina", "devolucao_opm", "baixa_definitiva"];
const TIPOS_OCORRENCIA = ["avaria", "acidente", "pane", "abastecimento", "outro"];

function normalizarJsonObjeto(valor) {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? valor : {};
}

function validarChecklistViatura(valor) {
  const checklist = normalizarJsonObjeto(valor);
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
  if (checklist.km_proxima_troca_oleo === null || checklist.km_proxima_troca_oleo === "") return null;
  const kmOleo = Number(checklist.km_proxima_troca_oleo);
  if (!Number.isFinite(kmOleo) || kmOleo < 0) return null;
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

async function carregarTodos(queryFactory) {
  const linhas = [];
  const tamanhoPagina = 1000;
  for (let inicio = 0; ; inicio += tamanhoPagina) {
    const { data, error } = await queryFactory().range(inicio, inicio + tamanhoPagina - 1);
    if (error) throw error;
    linhas.push(...(data || []));
    if (!data || data.length < tamanhoPagina) return linhas;
  }
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

async function processarCheckins(req, res, db, usuario, role) {
  if (!PERFIS_CHECKIN.includes(role)) return respostaErro(res, 403, "Sem permissão para acessar o controle de viaturas.");
  if (req.method === "GET") {
    const [{ data: viaturas, error: erroViaturas }, checkins, ocorrencias] = await Promise.all([
      db.from("viaturas").select("id, identificacao, placa, modelo, situacao, ativo, quilometragem_atual").order("identificacao"),
      carregarTodos(() => db.from("viatura_checkins").select("*").order("data_hora_inicio", { ascending: false })),
      carregarTodos(() => db.from("viatura_ocorrencias").select("*").order("data_hora", { ascending: false })),
    ]);
    if (erroViaturas) throw erroViaturas;
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
    return res.status(200).json({
      viaturas: viaturas || [],
      usuario: { id: usuario.id, nome_guerra: usuario.nome_guerra, nome_completo: usuario.nome_completo, posto_graduacao: usuario.posto_graduacao, numeral: usuario.numeral, matricula: usuario.matricula, unidade: usuario.unidade, role },
      checkins: (checkins || []).map((item) => ({ ...item, viatura: viaturasPorId.get(item.viatura_id), responsavel: pessoas.get(item.responsavel_id), responsavel_saida: pessoas.get(item.responsavel_saida_id), fotos_entrada_urls: (item.fotos_entrada || []).map((path) => fotosAssinadas.get(path)).filter(Boolean), fotos_saida_urls: (item.fotos_saida || []).map((path) => fotosAssinadas.get(path)).filter(Boolean) })),
      ocorrencias: (ocorrencias || []).map((item) => ({ ...item, viatura: viaturasPorId.get(item.viatura_id), policial: pessoas.get(item.registrada_por), fotos_urls: (item.fotos || []).map((path) => fotosAssinadas.get(path)).filter(Boolean) })),
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
    if (!UUID_VALIDO.test(body.viatura_id || "")) return respostaErro(res, 400, "Selecione uma viatura.");
    const checklist = validarChecklistViatura(body.checklist);
    if (!checklist) return respostaErro(res, 400, "Preencha as condições obrigatórias do checklist de entrada.");
    const pathFotos = await guardarFotos(db, fotos, usuario.id);
    const { data, error } = await db.rpc("viatura_checkin_criar", { p_viatura_id: body.viatura_id, p_responsavel_id: usuario.id, p_usuario_id: usuario.id, p_km: km, p_tipo: body.tipo, p_checklist: checklist, p_observacoes: texto(body.observacoes) || null, p_fotos: pathFotos });
    if (error) throw error;
    resultado = data;
  } else if (acao === "checkout") {
    if (!TIPOS_SAIDA.includes(body.tipo)) return respostaErro(res, 400, "Tipo de saída inválido.");
    if (body.tipo === "baixa_definitiva" && !["master", "p4"].includes(role)) return respostaErro(res, 403, "Somente Master e P4 podem registrar baixa definitiva.");
    if (!UUID_VALIDO.test(body.checkin_id || "")) return respostaErro(res, 400, "Check-in inválido.");
    const checklist = validarChecklistViatura(body.checklist);
    if (!checklist) return respostaErro(res, 400, "Preencha as condições obrigatórias do checklist de saída.");
    const pathFotos = await guardarFotos(db, fotos, usuario.id);
    const { data, error } = await db.rpc("viatura_checkout_fechar", { p_checkin_id: body.checkin_id, p_responsavel_id: usuario.id, p_usuario_id: usuario.id, p_km: km, p_tipo: body.tipo, p_checklist: checklist, p_observacoes: texto(body.observacoes) || null, p_fotos: pathFotos });
    if (error) throw error;
    resultado = data;
  } else if (acao === "ocorrencia") {
    if (!TIPOS_OCORRENCIA.includes(body.tipo) || !UUID_VALIDO.test(body.checkin_id || "")) return respostaErro(res, 400, "Tipo ou check-in inválido.");
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
    const usuario = await usuarioAutenticado(req, res);
    if (!usuario) return;

    const db = supabaseAdmin();
    const role = normalizarRole(usuario);

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
      const viaturas = await anexarNomeAtualizacao(db, viaturasSemAreas);
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
