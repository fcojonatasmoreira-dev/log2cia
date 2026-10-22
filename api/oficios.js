import { randomUUID } from "node:crypto";
import {
  supabaseAdmin,
  usuarioAutenticado,
  normalizarRole,
  respostaErro,
} from "./_server.js";
import {
  conflitoDeNumero,
  numeroOficio,
  obterProximoNumero,
} from "./oficiosNumeracao.js";

const ROLES_AUTORIZADAS = ["master", "p4", "p1", "oficial"];
const ROLES_EVENTOS = ["master", "p1", "oficial"];
const LIMITE_ARQUIVO_EVENTO = 2_600_000;
const UUID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function texto(valor) {
  return typeof valor === "string" ? valor.trim() : "";
}

function normalizarData(valor) {
  const data = texto(valor);
  return /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : "";
}

function validarAnexos(valor) {
  if (valor === undefined) return [];
  if (!Array.isArray(valor)) return null;
  const anexos = valor.map(texto).filter(Boolean);
  return anexos.length <= 50 ? anexos : null;
}

async function obterEstrutura(db) {
  const [{ data: estantes, error: e1 }, { data: colunas, error: e2 }, { data: pastas, error: e3 }] = await Promise.all([
    db.from("arquivos_estantes").select("id,nome,ativo,recebe_oficios_externos").order("nome"),
    db.from("arquivos_colunas").select("id,nome,estante_id,ativo").order("nome"),
    db.from("arquivos_pastas").select("id,nome,coluna_id,ativo").order("nome"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;
  return { estantes: estantes || [], colunas: colunas || [], pastas: pastas || [] };
}

function indexarEstrutura(estrutura) {
  const estantes = new Map(estrutura.estantes.map((item) => [item.id, item]));
  const colunas = new Map(estrutura.colunas.map((item) => [item.id, item]));
  const pastas = new Map(estrutura.pastas.map((item) => [item.id, item]));

  const localizacaoPorPasta = new Map();
  for (const pasta of estrutura.pastas) {
    const coluna = colunas.get(pasta.coluna_id);
    const estante = coluna ? estantes.get(coluna.estante_id) : null;
    localizacaoPorPasta.set(pasta.id, {
      pasta_id: pasta.id,
      pasta: pasta.nome,
      coluna_id: coluna?.id || null,
      coluna: coluna?.nome || null,
      estante_id: estante?.id || null,
      estante: estante?.nome || null,
      texto: [estante?.nome, coluna?.nome, pasta.nome].filter(Boolean).join(" / "),
    });
  }

  return { estantes, colunas, pastas, localizacaoPorPasta };
}

function formatarOficio(oficio, indiceArquivo) {
  const localizacao = indiceArquivo.localizacaoPorPasta.get(oficio.pasta_id) || null;
  return {
    ...oficio,
    numero: numeroOficio(
      oficio.numero_sequencial,
      oficio.ano,
      Boolean(oficio.solicitacao_evento_id),
    ),
    localizacao_arquivo: localizacao?.texto || null,
    arquivo: localizacao,
  };
}

function validarFormulario(body, exigirTipoOrigem = false) {
  const dataOficio = normalizarData(body?.data_oficio);
  const remetente = texto(body?.remetente);
  const destinatario = texto(body?.destinatario);
  const assunto = texto(body?.assunto);
  const referencia = texto(body?.referencia);
  const descricao = texto(body?.descricao);
  const pastaId = texto(body?.pasta_id);
  const tipoOrigem = texto(body?.tipo_origem);
  const anexos = validarAnexos(body?.anexos_nominais);

  if (!dataOficio || !remetente || !destinatario || !assunto || !pastaId) {
    return { erro: "Informe data, remetente, destinatário, assunto e localização do arquivo." };
  }
  if ((exigirTipoOrigem && !["interno", "externo"].includes(tipoOrigem))
    || (!exigirTipoOrigem && tipoOrigem && !["interno", "externo"].includes(tipoOrigem))) {
    return { erro: "Selecione se o Ofício é interno ou externo." };
  }
  if (anexos === null) return { erro: "A lista de anexos nominais é inválida." };

  return {
    dados: {
      data_oficio: dataOficio,
      remetente,
      destinatario,
      assunto,
      referencia: referencia || null,
      descricao: descricao || null,
      anexos_nominais: anexos,
      pasta_id: pastaId,
      ...(tipoOrigem ? { tipo_origem: tipoOrigem } : {}),
    },
  };
}

function validarArquivoEvento(valor, tiposPermitidos) {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  const encontrado = /^data:(application\/pdf|image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(valor.conteudo || ""));
  if (!encontrado || !tiposPermitidos.includes(encontrado[1]) || encontrado[2].length % 4 !== 0) return null;
  const bytes = Buffer.from(encontrado[2], "base64");
  if (!bytes.length || bytes.length > LIMITE_ARQUIVO_EVENTO || bytes.toString("base64") !== encontrado[2]) return null;
  const assinaturaValida = encontrado[1] === "application/pdf"
    ? bytes.subarray(0, 4).toString("ascii") === "%PDF"
    : encontrado[1] === "image/jpeg"
      ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : encontrado[1] === "image/png"
        ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (!assinaturaValida) return null;
  const extensoes = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  return { bytes, mime: encontrado[1], extensao: extensoes[encontrado[1]] };
}

async function guardarArquivoEvento(db, eventoId, tipo, arquivo) {
  const path = `eventos/${eventoId}/${tipo}-${randomUUID()}.${arquivo.extensao}`;
  const { error } = await db.storage.from("documentos-seguranca").upload(path, arquivo.bytes, { contentType: arquivo.mime, upsert: false });
  if (error) {
    if (/bucket not found/i.test(error.message || "")) throw Object.assign(new Error("O armazenamento privado de documentos não está disponível."), { code: "STORAGE_BUCKET_MISSING" });
    throw error;
  }
  return path;
}

async function processarSolicitacaoPublicaEvento(req, res, db) {
  if (req.method !== "POST") return res.setHeader("Allow", "POST").status(405).json({ error: "Método não permitido." });
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) return respostaErro(res, 400, "Dados inválidos.");
  if (texto(body.site_url)) return res.status(202).json({ recebido: true });

  const responsavelNome = texto(body.responsavel_nome);
  const estanteId = texto(body.estante_id);
  const responsavelTelefone = texto(body.responsavel_telefone || body.responsavel_contato);
  const responsavelEmail = texto(body.responsavel_email).toLowerCase();
  const nomeEvento = texto(body.nome_evento);
  const tipoEvento = texto(body.tipo_evento);
  const tipoEventoBase = tipoEvento.startsWith("Outro: ") ? "Outro" : tipoEvento;
  const tiposEventoPermitidos = ["Esportivo", "Religioso", "Cívico ou institucional", "Cultural ou artístico", "Comunitário ou social", "Outro"];
  const inicioTexto = texto(body.data_hora_inicio);
  const fimTexto = texto(body.data_hora_fim);
  const inicio = new Date(inicioTexto);
  const fim = new Date(fimTexto);
  const endereco = texto(body.endereco);
  const referencia = texto(body.referencia);
  const descricao = texto(body.descricao);
  const atracoes = texto(body.atracoes);
  const latitude = body.latitude === "" || body.latitude == null ? null : Number(body.latitude);
  const longitude = body.longitude === "" || body.longitude == null ? null : Number(body.longitude);
  const arquivosRecebidos = Array.isArray(body.oficios) ? body.oficios : body.oficio ? [body.oficio] : [];
  const arquivos = arquivosRecebidos.map((item) => ({
    nome: texto(item?.nome),
    ...validarArquivoEvento(item, ["application/pdf", "image/jpeg", "image/png", "image/webp"]),
  }));
  const tamanhoTotalArquivos = arquivos.reduce((total, item) => total + (item.bytes?.length || 0), 0);
  const camposInvalidos = [];
  const telefoneDigitos = responsavelTelefone.replace(/\D/g, "");
  const telefoneValido = [10, 11].includes(telefoneDigitos.length)
    || ([12, 13].includes(telefoneDigitos.length) && telefoneDigitos.startsWith("55"));
  const inicioValido = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(inicioTexto) && Number.isFinite(inicio.getTime());
  const fimValido = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(fimTexto) && Number.isFinite(fim.getTime());
  const coordenadasValidas = (latitude === null) === (longitude === null)
    && (latitude === null || (Number.isFinite(latitude) && latitude >= -90 && latitude <= 90))
    && (longitude === null || (Number.isFinite(longitude) && longitude >= -180 && longitude <= 180));
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(estanteId)) camposInvalidos.push("estante_id");
  if (responsavelNome.length < 1 || responsavelNome.length > 160) camposInvalidos.push("responsavel_nome");
  if (responsavelTelefone.length > 20 || !telefoneValido) camposInvalidos.push("responsavel_telefone");
  if (responsavelEmail.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(responsavelEmail)) camposInvalidos.push("responsavel_email");
  if (nomeEvento.length < 1 || nomeEvento.length > 180) camposInvalidos.push("nome_evento");
  if (tipoEvento.length < 1 || tipoEvento.length > 120 || !tiposEventoPermitidos.includes(tipoEventoBase) || (tipoEventoBase === "Outro" && tipoEvento.length <= 7)) camposInvalidos.push("tipo_evento");
  if (!inicioValido) camposInvalidos.push("data_hora_inicio");
  if (!fimValido || (inicioValido && fimValido && fim <= inicio)) camposInvalidos.push("data_hora_fim");
  if (endereco.length > 250 || (!endereco && latitude === null)) camposInvalidos.push("endereco");
  if (referencia.length > 300) camposInvalidos.push("referencia");
  if (!coordenadasValidas) camposInvalidos.push("localizacao");
  if (descricao.length < 1 || descricao.length > 5000) camposInvalidos.push("descricao");
  if (atracoes.length > 3000) camposInvalidos.push("atracoes");
  if (arquivosRecebidos.length < 1 || arquivosRecebidos.length > 5
    || arquivos.some((item) => !item.bytes || !item.nome || item.nome.length > 255)
    || tamanhoTotalArquivos > LIMITE_ARQUIVO_EVENTO) camposInvalidos.push("oficios");
  if (camposInvalidos.length) {
    const nomes = {
      estante_id: "QR Code da estante", responsavel_nome: "nome do responsável",
      responsavel_telefone: "telefone/WhatsApp", responsavel_email: "e-mail",
      nome_evento: "nome do evento", tipo_evento: "tipo do evento",
      data_hora_inicio: "data e hora de início", data_hora_fim: "data e hora de término",
      endereco: "endereço ou localização do evento", referencia: "ponto de referência",
      localizacao: "coordenadas do local", descricao: "descrição", atracoes: "atrações",
      oficios: "anexos (PDF ou imagem até 2,6 MB no total)",
    };
    const lista = [...new Set(camposInvalidos)].map((campo) => nomes[campo] || campo).join(", ");
    return res.status(400).json({ error: `Revise estes campos: ${lista}.`, campos_invalidos: [...new Set(camposInvalidos)] });
  }

  const { data: estanteAutorizada, error: erroEstante } = await db
    .from("arquivos_estantes")
    .select("id")
    .eq("id", estanteId)
    .eq("ativo", true)
    .eq("recebe_oficios_externos", true)
    .maybeSingle();
  if (erroEstante) throw erroEstante;
  if (!estanteAutorizada) return respostaErro(res, 400, "Este QR Code não corresponde a uma estante autorizada para recebimento externo.");

  const eventoId = randomUUID();
  const caminhosArquivos = [];
  let eventoCriado = false;
  try {
    for (const arquivo of arquivos) {
      const path = await guardarArquivoEvento(db, eventoId, "anexo", arquivo);
      caminhosArquivos.push(path);
    }
    const { data, error } = await db.rpc("solicitacao_evento_criar_para_estante", {
      p_estante_id: String(estanteId),
      p_id: eventoId,
      p_responsavel_nome: responsavelNome,
      p_responsavel_contato: responsavelTelefone,
      p_nome_evento: nomeEvento,
      p_tipo_evento: tipoEvento,
      p_inicio: inicio.toISOString(),
      p_fim: fim.toISOString(),
      p_endereco: endereco || null,
      p_referencia: referencia || null,
      p_latitude: latitude,
      p_longitude: longitude,
      p_descricao: descricao,
      p_atracoes: atracoes || null,
      p_oficio_path: caminhosArquivos[0],
    });
    if (error) throw error;
    eventoCriado = true;
    const { error: erroContatos } = await db.from("solicitacoes_eventos").update({ responsavel_telefone: responsavelTelefone, responsavel_email: responsavelEmail }).eq("id", eventoId);
    if (erroContatos) throw erroContatos;
    const anexos = arquivos.map((arquivo, indice) => ({
      evento_id: eventoId,
      arquivo_path: caminhosArquivos[indice],
      nome_arquivo: arquivo.nome,
      mime_type: arquivo.mime,
      tamanho_bytes: arquivo.bytes.length,
      ordem: indice + 1,
    }));
    const { error: erroAnexos } = await db.from("solicitacao_evento_anexos").insert(anexos);
    if (erroAnexos) throw erroAnexos;
    if (!data?.protocolo) throw new Error("A numeração da solicitação não foi gerada. A migration de protocolos ainda pode não estar aplicada.");
    return res.status(201).json({ recebido: true, protocolo: data.protocolo });
  } catch (error) {
    if (eventoCriado) await db.from("solicitacoes_eventos").delete().eq("id", eventoId);
    if (caminhosArquivos.length) await db.storage.from("documentos-seguranca").remove(caminhosArquivos);
    throw error;
  }
}

async function pesquisarEnderecoPublicoEvento(req, res, db) {
  if (req.method !== "POST") return res.setHeader("Allow", "POST").status(405).json({ error: "Método não permitido." });
  const busca = texto(req.body?.endereco);
  if (busca.length < 3 || busca.length > 250) return respostaErro(res, 400, "Digite um endereço de evento entre 3 e 250 caracteres.");
  const urlGeocodificacao = process.env.GEOCODING_SEARCH_URL || "https://nominatim.openstreetmap.org/search";
  let autocompleteHabilitado = false;
  try {
    autocompleteHabilitado = process.env.GEOCODING_AUTOCOMPLETE_ENABLED === "true"
      && Boolean(process.env.GEOCODING_SEARCH_URL)
      && new URL(urlGeocodificacao).hostname !== "nominatim.openstreetmap.org";
  } catch { /* A URL inválida será apresentada como erro de configuração na pesquisa manual. */ }
  if (req.body?.autocomplete && !autocompleteHabilitado) {
    return respostaErro(res, 409, "Sugestões durante a digitação não estão habilitadas para o serviço de busca configurado.");
  }
  let reservada;
  let erroLimite;
  try {
    ({ data: reservada, error: erroLimite } = await db.rpc("solicitacao_evento_geocodificacao_reservar"));
  } catch (error) {
    erroLimite = error;
  }
  if (erroLimite) {
    const semEstrutura = ["42883", "42P01", "PGRST202"].includes(erroLimite.code)
      || /solicitacao_evento_geocodificacao_reservar|solicitacoes_eventos_geocode_limite/i.test(erroLimite.message || "");
    return respostaErro(res, 503, semEstrutura
      ? "A busca está indisponível porque o controle de frequência ainda não foi configurado no banco. A migration 20261019001100 precisa ser aplicada."
      : "Não foi possível verificar o limite de pesquisas agora. Tente novamente em instantes.");
  }
  if (!reservada) {
    res.setHeader("Retry-After", "1");
    return respostaErro(res, 429, "Aguarde um segundo antes de pesquisar outro endereço.");
  }

  const origem = texto(process.env.PUBLIC_APP_URL || req.headers.origin || req.headers.referer);
  let url;
  try {
    url = new URL(urlGeocodificacao);
  } catch {
    return respostaErro(res, 503, "A busca está indisponível: GEOCODING_SEARCH_URL precisa conter uma URL válida do serviço de geocodificação.");
  }
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "br");
  url.searchParams.set("q", busca);
  let resposta;
  try {
    resposta = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "pt-BR",
        "User-Agent": `Log2CIA Event Form/1.0 (${origem || "solicitações públicas de eventos"})`,
        ...(origem ? { Referer: origem } : {}),
      },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return respostaErro(res, 502, "Falha de conexão com o serviço de geocodificação. Tente novamente ou marque o local no mapa.");
  }
  if (resposta.status === 429) {
    const aguardar = resposta.headers.get("retry-after");
    if (aguardar) res.setHeader("Retry-After", aguardar);
    return respostaErro(res, 429, "O serviço de geocodificação limitou as consultas. Aguarde e tente novamente.");
  }
  if (!resposta.ok) return respostaErro(res, 502, `O serviço de geocodificação respondeu com erro HTTP ${resposta.status}. Tente novamente ou marque o local no mapa.`);
  const dados = await resposta.json().catch(() => null);
  if (!Array.isArray(dados)) return respostaErro(res, 502, "O serviço retornou uma resposta inválida.");
  const resultados = dados.map((item) => ({
    place_id: item.place_id,
    display_name: texto(item.display_name),
    latitude: Number(item.lat),
    longitude: Number(item.lon),
  })).filter((item) => item.display_name
    && Number.isFinite(item.latitude) && item.latitude >= -90 && item.latitude <= 90
    && Number.isFinite(item.longitude) && item.longitude >= -180 && item.longitude <= 180);
  if (dados.length > 0 && resultados.length === 0) {
    return respostaErro(res, 502, "O serviço de geocodificação retornou um formato incompatível. Configure um serviço que responda com display_name, lat e lon (place_id é opcional).");
  }
  return res.status(200).json({ resultados });
}

async function processarEventos(req, res) {
  if (req.method === "POST" && req.body?.acao === "solicitar") return processarSolicitacaoPublicaEvento(req, res, supabaseAdmin());
  if (req.body?.acao === "configurar_geocodificacao" && req.method !== "POST") return res.setHeader("Allow", "POST").status(405).json({ error: "Método não permitido." });
  if (req.method === "POST" && req.body?.acao === "configurar_geocodificacao") {
    const endpoint = process.env.GEOCODING_SEARCH_URL || "";
    let endpointCompativel = false;
    try { endpointCompativel = Boolean(endpoint) && new URL(endpoint).hostname !== "nominatim.openstreetmap.org"; } catch { /* A pesquisa retornará erro de configuração quando acionada. */ }
    return res.status(200).json({ autocomplete_disponivel: process.env.GEOCODING_AUTOCOMPLETE_ENABLED === "true" && endpointCompativel });
  }
  if (req.method === "POST" && req.body?.acao === "pesquisar_endereco") return pesquisarEnderecoPublicoEvento(req, res, supabaseAdmin());
  const usuario = await usuarioAutenticado(req, res);
  if (!usuario) return;
  const role = normalizarRole(usuario);
  if (!ROLES_EVENTOS.includes(role)) return respostaErro(res, 403, "Você não tem permissão para acessar as solicitações de eventos.");
  const db = supabaseAdmin();

  if (req.method === "GET") {
    const { data: eventos, error } = await db.from("solicitacoes_eventos").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) throw error;
    const ids = (eventos || []).map((item) => item.id);
    const { data: anexosEventos, error: erroAnexos } = ids.length
      ? await db.from("solicitacao_evento_anexos").select("id,evento_id,arquivo_path,nome_arquivo,mime_type,tamanho_bytes,ordem,created_at").in("evento_id", ids).order("ordem", { ascending: true })
      : { data: [], error: null };
    if (erroAnexos) throw erroAnexos;
    const { data: interacoes, error: erroInteracoes } = ids.length
      ? await db.from("solicitacao_evento_interacoes").select("*").in("evento_id", ids).order("created_at", { ascending: true })
      : { data: [], error: null };
    if (erroInteracoes) throw erroInteracoes;
    const idsEstantes = [...new Set((eventos || []).map((item) => item.estante_id).filter(Boolean))];
    const { data: estantes, error: erroEstantes } = idsEstantes.length
      ? await db.from("arquivos_estantes").select("id,nome").in("id", idsEstantes)
      : { data: [], error: null };
    if (erroEstantes) throw erroEstantes;
    const { data: oficiosRegistrados, error: erroOficiosRegistrados } = ids.length
      ? await db.from("oficios").select("solicitacao_evento_id,numero_sequencial,ano").in("solicitacao_evento_id", ids)
      : { data: [], error: null };
    if (erroOficiosRegistrados) throw erroOficiosRegistrados;
    const visiveis = (interacoes || []).filter((item) => item.tipo !== "comentario"
      || (item.destinatario === "p1" && (role === "master" || role === "p1" || item.registrado_por === usuario.id)));
    const idsAutores = [...new Set(visiveis.map((item) => item.registrado_por).filter(Boolean))];
    const { data: policiais, error: erroPoliciais } = idsAutores.length
      ? await db.from("policiais").select("id, nome_guerra, nome_completo, posto_graduacao, numeral").in("id", idsAutores)
      : { data: [], error: null };
    if (erroPoliciais) throw erroPoliciais;
    const pessoas = new Map((policiais || []).map((item) => [item.id, item]));
    const nomesEstantes = new Map((estantes || []).map((item) => [item.id, item.nome]));
    const oficioPorEvento = new Map((oficiosRegistrados || []).map((item) => [item.solicitacao_evento_id, numeroOficio(item.numero_sequencial, item.ano, true)]));
    const interacoesPorEvento = new Map();
    for (const item of visiveis) {
      if (!interacoesPorEvento.has(item.evento_id)) interacoesPorEvento.set(item.evento_id, []);
      interacoesPorEvento.get(item.evento_id).push({ ...item, policial: pessoas.get(item.registrado_por) || null });
    }
    const caminhos = [
      ...(eventos || []).flatMap((item) => [item.oficio_path, item.opo_pdf_path].filter(Boolean)),
      ...(anexosEventos || []).map((item) => item.arquivo_path),
      ...(visiveis || []).map((item) => item.dados?.pdf_path).filter(Boolean),
    ];
    const { data: assinadas, error: erroAssinadas } = caminhos.length
      ? await db.storage.from("documentos-seguranca").createSignedUrls([...new Set(caminhos)], 3600)
      : { data: [], error: null };
    if (erroAssinadas) throw erroAssinadas;
    const urls = new Map((assinadas || []).map((item) => [item.path, item.signedUrl]));
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({ eventos: (eventos || []).map((item) => {
      const { oficio_path: caminhoOficio, opo_pdf_path: caminhoOpo, ...eventoSeguro } = item;
      return {
        ...eventoSeguro,
        estante_nome: item.estante_id ? nomesEstantes.get(item.estante_id) || null : null,
        numero_oficio_registrado: oficioPorEvento.get(item.id) || null,
        oficio_url: urls.get(caminhoOficio) || null,
        anexos: (anexosEventos || []).filter((anexo) => anexo.evento_id === item.id).map((anexo) => ({
          id: anexo.id,
          nome: anexo.nome_arquivo,
          tipo: anexo.mime_type,
          tamanho_bytes: anexo.tamanho_bytes,
          ordem: anexo.ordem,
          url: urls.get(anexo.arquivo_path) || null,
        })),
        opo_pdf_url: caminhoOpo ? urls.get(caminhoOpo) || null : null,
        interacoes: (interacoesPorEvento.get(item.id) || []).map((interacao) => {
          const { pdf_path: caminhoInteracao, ...dadosPublicos } = interacao.dados || {};
          return {
            ...interacao,
            dados: dadosPublicos,
            opo_pdf_url: caminhoInteracao ? urls.get(caminhoInteracao) || null : null,
          };
        }),
      };
    }) });
  }

  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) return respostaErro(res, 400, "Dados inválidos.");
  if (req.method === "PATCH" && body.acao === "arquivar") {
    if (role !== "master" && role !== "p1") return respostaErro(res, 403, "Somente Master ou P1 pode arquivar solicitações.");
    const eventoId = texto(body.evento_id);
    if (!UUID_VALIDO.test(eventoId) || typeof body.arquivado !== "boolean") return respostaErro(res, 400, "Solicitação ou ação de arquivamento inválida.");
    const { data, error } = await db.rpc("solicitacao_evento_arquivar", { p_evento_id: eventoId, p_usuario_id: usuario.id, p_arquivar: body.arquivado });
    if (error) throw error;
    if (!data) return respostaErro(res, 404, "Solicitação não encontrada.");
    return res.status(200).json({ evento: data });
  }
  if (req.method === "POST" && body.acao === "excluir") {
    if (role !== "master") return respostaErro(res, 403, "Somente Master pode excluir solicitações.");
    const eventoId = texto(body.evento_id);
    if (!UUID_VALIDO.test(eventoId)) return respostaErro(res, 400, "Solicitação inválida.");
    const { data, error } = await db.rpc("solicitacao_evento_excluir", { p_evento_id: eventoId });
    if (error) {
      if (error.message === "SOLICITACAO_VINCULADA_OFICIO") return respostaErro(res, 409, "Esta solicitação está vinculada a um Ofício oficial e não pode ser excluída. Ela pode permanecer arquivada.");
      throw error;
    }
    if (!data) return respostaErro(res, 404, "Solicitação não encontrada.");
    const caminhos = Array.isArray(data.arquivos) ? data.arquivos.filter((item) => typeof item === "string" && item) : [];
    if (caminhos.length) {
      const { error: erroArquivos } = await db.storage.from("documentos-seguranca").remove(caminhos);
      if (erroArquivos) return res.status(200).json({ excluida: true, aviso: "A solicitação foi excluída, mas um ou mais anexos privados não puderam ser removidos." });
    }
    return res.status(200).json({ excluida: true });
  }
  if (req.method === "POST" && body.acao === "comentar") {
    if (role !== "master" && role !== "oficial") return respostaErro(res, 403, "Somente o Oficial autorizado pode registrar comentários nesta etapa.");
    const eventoId = texto(body.evento_id);
    const conteudo = texto(body.conteudo);
    if (!UUID_VALIDO.test(eventoId) || !conteudo || conteudo.length > 3000) return respostaErro(res, 400, "Informe o evento e um comentário de até 3000 caracteres.");
    const { data, error } = await db.rpc("solicitacao_evento_comentar", { p_evento_id: eventoId, p_usuario_id: usuario.id, p_destinatario: "p1", p_conteudo: conteudo });
    if (error) throw error;
    if (!data) return respostaErro(res, 404, "Evento não encontrado.");
    return res.status(201).json({ interacao: data });
  }
  if (req.method === "POST" && body.acao === "registrar_oficio_externo") {
    if (role !== "master" && role !== "p1") return respostaErro(res, 403, "Somente o P1 autorizado pode registrar a solicitação como Ofício externo.");
    const eventoId = texto(body.evento_id);
    if (!UUID_VALIDO.test(eventoId)) return respostaErro(res, 400, "Solicitação inválida.");
    const validacao = validarFormulario({ ...body, tipo_origem: "externo" }, true);
    if (validacao.erro) return respostaErro(res, 400, validacao.erro);
    const dados = validacao.dados;
    const estrutura = await obterEstrutura(db);
    const estanteDoEvento = await db.from("solicitacoes_eventos").select("id,estante_id").eq("id", eventoId).maybeSingle();
    if (estanteDoEvento.error) throw estanteDoEvento.error;
    if (!estanteDoEvento.data) return respostaErro(res, 404, "Solicitação não encontrada.");
    if (!estanteDoEvento.data.estante_id) return respostaErro(res, 409, "Esta solicitação antiga não está vinculada a uma estante e não pode ser arquivada por este fluxo.");
    const pasta = estrutura.pastas.find((item) => item.id === dados.pasta_id && item.ativo);
    const coluna = pasta && estrutura.colunas.find((item) => item.id === pasta.coluna_id && item.ativo);
    if (!pasta || !coluna || coluna.estante_id !== estanteDoEvento.data.estante_id) {
      return respostaErro(res, 400, "Selecione uma pasta ativa dentro da estante que recebeu a solicitação.");
    }
    const ano = Number(dados.data_oficio.slice(0, 4));
    for (let tentativa = 0; tentativa < 5; tentativa += 1) {
      const numero = await obterProximoNumero(db, ano, "evento");
      const { data, error } = await db.from("oficios").insert({
        ...dados,
        tipo_origem: "externo",
        solicitacao_evento_id: eventoId,
        numero_sequencial: numero,
        ano,
        criado_por: usuario.id,
      }).select("id,numero_sequencial,ano").single();
      if (!error) return res.status(201).json({ oficio: { ...data, numero: numeroOficio(data.numero_sequencial, data.ano, true) } });
      if (error.code === "23505") {
        const { data: existente, error: erroExistente } = await db.from("oficios").select("id,numero_sequencial,ano").eq("solicitacao_evento_id", eventoId).maybeSingle();
        if (erroExistente) throw erroExistente;
        if (existente) return respostaErro(res, 409, `Esta solicitação já foi registrada como Ofício ${numeroOficio(existente.numero_sequencial, existente.ano, true)}.`);
        if (conflitoDeNumero(error)) continue;
        throw error;
      }
      throw error;
    }
    return respostaErro(res, 409, "Não foi possível reservar um número de Ofício. Tente novamente.");
  }
  if (req.method === "PATCH" && (body.acao === "equipe" || body.acao === "opo")) {
    if (role !== "master" && role !== "p1") return respostaErro(res, 403, "Somente o P1 autorizado pode atualizar estes dados.");
    const eventoId = texto(body.evento_id);
    if (!UUID_VALIDO.test(eventoId)) return respostaErro(res, 400, "Evento inválido.");
    const { data: existe, error: erroExiste } = await db.from("solicitacoes_eventos").select("id").eq("id", eventoId).maybeSingle();
    if (erroExiste) throw erroExiste;
    if (!existe) return respostaErro(res, 404, "Evento não encontrado.");
    if (body.acao === "equipe") {
      const equipe = texto(body.equipe_responsavel);
      if (!equipe || equipe.length > 160) return respostaErro(res, 400, "Informe a equipe responsável (até 160 caracteres).");
      const { data, error } = await db.rpc("solicitacao_evento_definir_equipe", { p_evento_id: eventoId, p_usuario_id: usuario.id, p_equipe: equipe });
      if (error) throw error;
      return res.status(200).json({ evento: data });
    }
    const numero = texto(body.opo_numero);
    if (numero.length > 100) return respostaErro(res, 400, "O número da OPO deve ter até 100 caracteres.");
    let path;
    const arquivo = body.opo_pdf ? validarArquivoEvento(body.opo_pdf, ["application/pdf"]) : null;
    if (body.opo_pdf && !arquivo) return respostaErro(res, 400, "Anexe um PDF válido de até 2,6 MB.");
    if (!numero && !arquivo) return respostaErro(res, 400, "Informe o número da OPO ou anexe o PDF.");
    try {
      if (arquivo) path = await guardarArquivoEvento(db, eventoId, "opo", arquivo);
      const { data, error } = await db.rpc("solicitacao_evento_opo_atualizar", { p_evento_id: eventoId, p_usuario_id: usuario.id, p_numero: numero || null, p_pdf_path: path || null });
      if (error) throw error;
      return res.status(200).json({ evento: data });
    } catch (error) {
      if (path) await db.storage.from("documentos-seguranca").remove([path]);
      throw error;
    }
  }
  return res.setHeader("Allow", "GET, POST, PATCH").status(405).json({ error: "Método ou ação não permitido." });
}

export default async function handler(req, res) {
  try {
    if (req.query?.recurso === "eventos") return await processarEventos(req, res);
    const usuario = await usuarioAutenticado(req, res);
    if (!usuario) return;

    const role = normalizarRole(usuario);
    if (!ROLES_AUTORIZADAS.includes(role)) {
      return respostaErro(res, 403, "Você não tem permissão para acessar os Ofícios.");
    }

    const db = supabaseAdmin();
    const id = texto(req.query?.id);

    if (req.method === "GET") {
      const estrutura = await obterEstrutura(db);
      const indiceArquivo = indexarEstrutura(estrutura);
      const tipoFiltro = texto(req.query?.tipo_origem);
      if (tipoFiltro && !["interno", "externo", "evento"].includes(tipoFiltro)) return respostaErro(res, 400, "O filtro de tipo do Ofício é inválido.");
      let query = db.from("oficios").select("*").order("ano", { ascending: false }).order("numero_sequencial", { ascending: false });
      if (tipoFiltro === "evento") query = query.not("solicitacao_evento_id", "is", null);
      else if (tipoFiltro) query = query.eq("tipo_origem", tipoFiltro).is("solicitacao_evento_id", null);
      const { data, error } = await query;
      if (error) throw error;

      const busca = texto(req.query?.busca).toLocaleLowerCase("pt-BR");
      const dataFiltro = normalizarData(req.query?.data);
      const estanteFiltro = texto(req.query?.estante_id);
      const colunaFiltro = texto(req.query?.coluna_id);
      const pastaFiltro = texto(req.query?.pasta_id);

      const filtrados = (data || []).filter((oficio) => {
        if (dataFiltro && oficio.data_oficio !== dataFiltro) return false;
        if (["interno", "externo"].includes(tipoFiltro) && oficio.tipo_origem !== tipoFiltro) return false;
        if (tipoFiltro === "evento" && !oficio.solicitacao_evento_id) return false;
        const localizacao = indiceArquivo.localizacaoPorPasta.get(oficio.pasta_id);
        if (estanteFiltro && localizacao?.estante_id !== estanteFiltro) return false;
        if (colunaFiltro && localizacao?.coluna_id !== colunaFiltro) return false;
        if (pastaFiltro && oficio.pasta_id !== pastaFiltro) return false;
        if (!busca) return true;
        const campos = [
          numeroOficio(oficio.numero_sequencial, oficio.ano, Boolean(oficio.solicitacao_evento_id)),
          oficio.remetente,
          oficio.destinatario,
          oficio.assunto,
          oficio.referencia,
          oficio.descricao,
          localizacao?.texto,
          ...(Array.isArray(oficio.anexos_nominais) ? oficio.anexos_nominais : []),
        ];
        return campos.filter(Boolean).join(" ").toLocaleLowerCase("pt-BR").includes(busca);
      });

      const idsEventos = [...new Set(filtrados.map((item) => item.solicitacao_evento_id).filter(Boolean))];
      const { data: eventosVinculados, error: erroEventosVinculados } = idsEventos.length
        ? await db.from("solicitacoes_eventos").select("id,oficio_path").in("id", idsEventos)
        : { data: [], error: null };
      if (erroEventosVinculados) throw erroEventosVinculados;
      const caminhosEventos = (eventosVinculados || []).map((item) => item.oficio_path).filter(Boolean);
      const { data: arquivosAssinados, error: erroArquivosAssinados } = caminhosEventos.length
        ? await db.storage.from("documentos-seguranca").createSignedUrls([...new Set(caminhosEventos)], 3600)
        : { data: [], error: null };
      if (erroArquivosAssinados) throw erroArquivosAssinados;
      const urlPorCaminho = new Map((arquivosAssinados || []).map((item) => [item.path, item.signedUrl]));
      const caminhoPorEvento = new Map((eventosVinculados || []).map((item) => [item.id, item.oficio_path]));
      res.setHeader("Cache-Control", "private, no-store");

      const anoConsulta = Number(req.query?.ano) || new Date().getFullYear();
      const proximoNumero = await obterProximoNumero(db, anoConsulta, texto(req.query?.tipo_numero) === "evento" ? "evento" : "interno");
      return res.status(200).json({
        oficios: filtrados.map((item) => ({
          ...formatarOficio(item, indiceArquivo),
          documento_url: item.solicitacao_evento_id
            ? urlPorCaminho.get(caminhoPorEvento.get(item.solicitacao_evento_id)) || null
            : null,
        })),
        proximo_numero: proximoNumero,
        ano_numero: anoConsulta,
      });
    }

    if (req.method === "POST") {
      if (role === "oficial") {
        // O Oficial pode registrar Ofícios, conforme matriz funcional.
      }
      const validacao = validarFormulario(req.body, true);
      if (validacao.erro) return respostaErro(res, 400, validacao.erro);

      const estrutura = await obterEstrutura(db);
      const pasta = estrutura.pastas.find((item) => item.id === validacao.dados.pasta_id && item.ativo);
      if (!pasta) return respostaErro(res, 400, "A pasta selecionada não está disponível.");

      const dados = validacao.dados;
      const ano = Number(dados.data_oficio.slice(0, 4));

      for (let tentativa = 0; tentativa < 5; tentativa += 1) {
        const numero = await obterProximoNumero(db, ano);
        const { data, error } = await db.from("oficios").insert({
          ...dados,
          tipo_origem: dados.tipo_origem,
          numero_sequencial: numero,
          ano,
          criado_por: usuario.id,
        }).select("*").single();
        if (!error) {
          const indice = indexarEstrutura(estrutura);
          return res.status(201).json({ oficio: formatarOficio(data, indice) });
        }
        if (!conflitoDeNumero(error)) throw error;
      }
      return respostaErro(res, 409, "Não foi possível reservar um número de Ofício. Tente novamente.");
    }

    if (req.method === "PATCH") {
      if (!id) return respostaErro(res, 400, "Informe o Ofício que será editado.");
      const validacao = validarFormulario(req.body);
      if (validacao.erro) return respostaErro(res, 400, validacao.erro);

      const { data: existente, error: erroBusca } = await db.from("oficios").select("id,criado_por,numero_sequencial,ano,solicitacao_evento_id").eq("id", id).maybeSingle();
      if (erroBusca) throw erroBusca;
      if (!existente) return respostaErro(res, 404, "Ofício não encontrado.");
      if (existente.criado_por !== usuario.id) return respostaErro(res, 403, "Você só pode editar seus próprios Ofícios.");

      const estrutura = await obterEstrutura(db);
      const pasta = estrutura.pastas.find((item) => item.id === validacao.dados.pasta_id && item.ativo);
      if (!pasta) return respostaErro(res, 400, "A pasta selecionada não está disponível.");

      const dados = validacao.dados;
      const ano = Number(dados.data_oficio.slice(0, 4));
      let numeroSequencial = existente.numero_sequencial;
      if (Number(existente.ano) !== ano) numeroSequencial = await obterProximoNumero(db, ano, existente.solicitacao_evento_id ? "evento" : "interno");

      for (let tentativa = 0; tentativa < 5; tentativa += 1) {
        const { data, error } = await db.from("oficios").update({
          ...Object.fromEntries(Object.entries(dados).filter(([chave]) => chave !== "tipo_origem")),
          ano,
          numero_sequencial: numeroSequencial,
          atualizado_em: new Date().toISOString(),
        }).eq("id", id).eq("criado_por", usuario.id).select("*").single();
        if (!error) return res.status(200).json({ oficio: formatarOficio(data, indexarEstrutura(estrutura)) });
        if (!conflitoDeNumero(error)) {
          if (error.code === "23505") return respostaErro(res, 409, "Já existe outro Ofício com esse número e ano.");
          throw error;
        }
        if (Number(existente.ano) !== ano) numeroSequencial = await obterProximoNumero(db, ano, existente.solicitacao_evento_id ? "evento" : "interno");
        else return respostaErro(res, 409, "Já existe outro Ofício com esse número e ano.");
      }
      return respostaErro(res, 409, "Não foi possível reservar um número de Ofício. Tente novamente.");
    }

    if (req.method === "DELETE") {
      if (!id) return respostaErro(res, 400, "Informe o Ofício que será excluído.");
      const { data, error } = await db.from("oficios").delete().eq("id", id).eq("criado_por", usuario.id).select("id").maybeSingle();
      if (error) throw error;
      if (!data) return respostaErro(res, 403, "Você só pode excluir seus próprios Ofícios.");
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return respostaErro(res, 405, "Método não permitido.");
  } catch (error) {
    console.error("Erro na API de Ofícios:", error);
    if (error.code === "STORAGE_BUCKET_MISSING") return res.status(503).json({ error: error.message });
    if (error.message === "ESTANTE_NAO_AUTORIZADA") return res.status(409).json({ error: "A estante foi desabilitada e não pode receber esta solicitação." });
    return respostaErro(res, 500, "Não foi possível concluir a operação de Ofícios.");
  }
}
