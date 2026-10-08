import {
  supabaseAdmin,
  usuarioAutenticado,
  normalizarRole,
  respostaErro,
} from "./_server.js";

const ROLES_AUTORIZADAS = ["master", "p4", "p1", "oficial"];

function texto(valor) {
  return typeof valor === "string" ? valor.trim() : "";
}

function numeroOficio(numero, ano) {
  return `${String(numero).padStart(3, "0")}/${ano}`;
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

async function obterProximoNumero(db, ano) {
  const { data, error } = await db
    .from("oficios")
    .select("numero_sequencial")
    .eq("ano", ano)
    .order("numero_sequencial", { ascending: true });
  if (error) throw error;

  let esperado = 1;
  for (const item of data || []) {
    const numero = Number(item.numero_sequencial);
    if (numero < esperado) continue;
    if (numero === esperado) esperado += 1;
    if (numero > esperado) break;
  }
  return esperado;
}

async function obterEstrutura(db) {
  const [{ data: estantes, error: e1 }, { data: colunas, error: e2 }, { data: pastas, error: e3 }] = await Promise.all([
    db.from("arquivos_estantes").select("id,nome,ativo").order("nome"),
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
    numero: numeroOficio(oficio.numero_sequencial, oficio.ano),
    localizacao_arquivo: localizacao?.texto || null,
    arquivo: localizacao,
  };
}

function validarFormulario(body) {
  const dataOficio = normalizarData(body?.data_oficio);
  const remetente = texto(body?.remetente);
  const destinatario = texto(body?.destinatario);
  const assunto = texto(body?.assunto);
  const referencia = texto(body?.referencia);
  const descricao = texto(body?.descricao);
  const pastaId = texto(body?.pasta_id);
  const anexos = validarAnexos(body?.anexos_nominais);

  if (!dataOficio || !remetente || !destinatario || !assunto || !pastaId) {
    return { erro: "Informe data, remetente, destinatário, assunto e localização do arquivo." };
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
    },
  };
}

export default async function handler(req, res) {
  try {
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
      let query = db.from("oficios").select("*").order("ano", { ascending: false }).order("numero_sequencial", { ascending: false });
      const { data, error } = await query;
      if (error) throw error;

      const busca = texto(req.query?.busca).toLocaleLowerCase("pt-BR");
      const dataFiltro = normalizarData(req.query?.data);
      const estanteFiltro = texto(req.query?.estante_id);
      const colunaFiltro = texto(req.query?.coluna_id);
      const pastaFiltro = texto(req.query?.pasta_id);

      const filtrados = (data || []).filter((oficio) => {
        if (dataFiltro && oficio.data_oficio !== dataFiltro) return false;
        const localizacao = indiceArquivo.localizacaoPorPasta.get(oficio.pasta_id);
        if (estanteFiltro && localizacao?.estante_id !== estanteFiltro) return false;
        if (colunaFiltro && localizacao?.coluna_id !== colunaFiltro) return false;
        if (pastaFiltro && oficio.pasta_id !== pastaFiltro) return false;
        if (!busca) return true;
        const campos = [
          numeroOficio(oficio.numero_sequencial, oficio.ano),
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

      const anoConsulta = Number(req.query?.ano) || new Date().getFullYear();
      const proximoNumero = await obterProximoNumero(db, anoConsulta);
      return res.status(200).json({
        oficios: filtrados.map((item) => formatarOficio(item, indiceArquivo)),
        proximo_numero: proximoNumero,
        ano_numero: anoConsulta,
      });
    }

    if (req.method === "POST") {
      if (role === "oficial") {
        // O Oficial pode registrar Ofícios, conforme matriz funcional.
      }
      const validacao = validarFormulario(req.body);
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
          numero_sequencial: numero,
          ano,
          criado_por: usuario.id,
        }).select("*").single();
        if (!error) {
          const indice = indexarEstrutura(estrutura);
          return res.status(201).json({ oficio: formatarOficio(data, indice) });
        }
        if (error.code !== "23505") throw error;
      }
      return respostaErro(res, 409, "Não foi possível reservar um número de Ofício. Tente novamente.");
    }

    if (req.method === "PATCH") {
      if (!id) return respostaErro(res, 400, "Informe o Ofício que será editado.");
      const validacao = validarFormulario(req.body);
      if (validacao.erro) return respostaErro(res, 400, validacao.erro);

      const { data: existente, error: erroBusca } = await db.from("oficios").select("id,criado_por,numero_sequencial,ano").eq("id", id).maybeSingle();
      if (erroBusca) throw erroBusca;
      if (!existente) return respostaErro(res, 404, "Ofício não encontrado.");
      if (existente.criado_por !== usuario.id) return respostaErro(res, 403, "Você só pode editar seus próprios Ofícios.");

      const estrutura = await obterEstrutura(db);
      const pasta = estrutura.pastas.find((item) => item.id === validacao.dados.pasta_id && item.ativo);
      if (!pasta) return respostaErro(res, 400, "A pasta selecionada não está disponível.");

      const dados = validacao.dados;
      const ano = Number(dados.data_oficio.slice(0, 4));
      let numeroSequencial = existente.numero_sequencial;
      if (Number(existente.ano) !== ano) numeroSequencial = await obterProximoNumero(db, ano);

      const { data, error } = await db.from("oficios").update({
        ...dados,
        ano,
        numero_sequencial: numeroSequencial,
        atualizado_em: new Date().toISOString(),
      }).eq("id", id).eq("criado_por", usuario.id).select("*").single();
      if (error) {
        if (error.code === "23505") return respostaErro(res, 409, "Já existe outro Ofício com esse número e ano.");
        throw error;
      }
      return res.status(200).json({ oficio: formatarOficio(data, indexarEstrutura(estrutura)) });
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
    return respostaErro(res, 500, "Não foi possível concluir a operação de Ofícios.");
  }
}
