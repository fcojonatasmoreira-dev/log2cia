import { respostaErro } from "./_server.js";

const PERFIS_LEITURA = [
  "master",
  "p1_escalante_servico_ordinario",
  "permanente da guarda",
  "oficial",
];
const PERFIS_ESCRITA = [
  "master",
  "p1_escalante_servico_ordinario",
  "permanente da guarda",
];
const PERFIS_MASTER_LIVRO = ["master", "p1_escalante_servico_ordinario"];
const UUID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function texto(valor) {
  return typeof valor === "string" ? valor.trim() : "";
}

function numeroOpcional(valor, campo) {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = Number(valor);
  if (!Number.isFinite(numero)) throw new Error(`Valor inválido em ${campo}.`);
  return numero;
}

function normalizarLivro(origem, statusPadrao = "em_andamento") {
  const livro = origem && typeof origem === "object" && !Array.isArray(origem) ? origem : {};
  const status = texto(livro.status) || statusPadrao;
  if (!["em_andamento", "fechado"].includes(status)) {
    throw new Error("Status do livro inválido.");
  }
  return {
    data_servico: texto(livro.data_servico),
    turno: texto(livro.turno),
    permanente_nome: texto(livro.permanente_nome),
    antecessor_nome: texto(livro.antecessor_nome) || null,
    substituto_nome: texto(livro.substituto_nome) || null,
    status,
  };
}

function normalizarViaturas(origem, livroId) {
  if (!Array.isArray(origem)) throw new Error("Lista de viaturas inválida.");
  return origem.map((item) => ({
    livro_id: livroId,
    viatura: texto(item?.viatura),
    km_inicial: numeroOpcional(item?.km_inicial, "km_inicial"),
    km_final: numeroOpcional(item?.km_final, "km_final"),
    km_abastecimento: numeroOpcional(item?.km_abastecimento, "km_abastecimento"),
    litros: numeroOpcional(item?.litros, "litros"),
    valor: numeroOpcional(item?.valor, "valor"),
    saldo: numeroOpcional(item?.saldo, "saldo"),
    status_viatura: texto(item?.status_viatura) || "Disponível",
    motivo_baixa: texto(item?.motivo_baixa) || null,
    local_baixa: texto(item?.local_baixa) || null,
    motorista: texto(item?.motorista) || null,
    destino: texto(item?.destino) || null,
  }));
}

function normalizarOcorrencias(origem, livroId) {
  if (!Array.isArray(origem)) throw new Error("Lista de ocorrências inválida.");
  return origem.map((item, index) => ({
    livro_id: livroId,
    ordem: index + 1,
    descricao: texto(item?.descricao),
  }));
}

function validarFilhos(viaturas, ocorrencias, livroId) {
  normalizarViaturas(viaturas, livroId);
  normalizarOcorrencias(ocorrencias, livroId);
}

async function inserirFilhos(db, livroId, viaturas, ocorrencias) {
  const linhasViaturas = normalizarViaturas(viaturas, livroId);
  const linhasOcorrencias = normalizarOcorrencias(ocorrencias, livroId);

  if (linhasViaturas.length) {
    const { error } = await db.from("livro_viaturas").insert(linhasViaturas);
    if (error) throw error;
  }
  if (linhasOcorrencias.length) {
    const { error } = await db.from("livro_ocorrencias").insert(linhasOcorrencias);
    if (error) throw error;
  }
}

async function limparLivroCriado(db, livroId) {
  await db.from("livro_viaturas").delete().eq("livro_id", livroId);
  await db.from("livro_ocorrencias").delete().eq("livro_id", livroId);
  await db.from("livros_permanencia").delete().eq("id", livroId);
}

async function criarLivro(db, body, clonar = false) {
  let dadosLivro;
  try {
    dadosLivro = normalizarLivro(
      clonar ? { ...body.livro, status: "em_andamento" } : body.livro,
    );
    if (!dadosLivro.data_servico || !dadosLivro.turno || !dadosLivro.permanente_nome) {
      throw new Error("Data, turno e permanente responsável são obrigatórios.");
    }
    validarFilhos(body.viaturas, body.ocorrencias, "00000000-0000-4000-8000-000000000000");
  } catch (error) {
    return { error: error.message };
  }

  const { data: livro, error } = await db
    .from("livros_permanencia")
    .insert(dadosLivro)
    .select("*")
    .single();
  if (error) throw error;

  try {
    await inserirFilhos(db, livro.id, body.viaturas, body.ocorrencias);
  } catch (errorFilhos) {
    await limparLivroCriado(db, livro.id);
    throw errorFilhos;
  }

  return { data: livro, error: null };
}

export default async function processarLivroPermanencia(req, res, db, role) {
  if (!PERFIS_LEITURA.includes(role)) {
    return respostaErro(res, 403, "Sem permissão para acessar o Livro da Permanência.");
  }

  if (req.method === "GET") {
    if (req.query?.acao === "itens") {
      const livroId = texto(req.query?.livro_id);
      if (!UUID_VALIDO.test(livroId)) return respostaErro(res, 400, "Identificador do livro inválido.");

      const [{ data: viaturas, error: erroViaturas }, { data: ocorrencias, error: erroOcorrencias }] = await Promise.all([
        db.from("livro_viaturas").select("*").eq("livro_id", livroId),
        db.from("livro_ocorrencias").select("*").eq("livro_id", livroId).order("ordem", { ascending: true }),
      ]);
      if (erroViaturas) throw erroViaturas;
      if (erroOcorrencias) throw erroOcorrencias;
      return res.status(200).json({ viaturas: viaturas || [], ocorrencias: ocorrencias || [] });
    }

    const { data, error } = await db
      .from("livros_permanencia")
      .select("*")
      .order("data_servico", { ascending: false });
    if (error) throw error;
    return res.status(200).json({ livros: data || [] });
  }

  if (req.method === "POST") {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return respostaErro(res, 400, "Dados do livro inválidos.");
    }
    const clonar = body.acao === "clonar";
    if (body.acao && !clonar) return respostaErro(res, 400, "Ação do livro inválida.");
    if (!PERFIS_ESCRITA.includes(role)) {
      return respostaErro(res, 403, "Sem permissão para registrar livros.");
    }
    if (clonar && !PERFIS_MASTER_LIVRO.includes(role)) {
      return respostaErro(res, 403, "Sem permissão para gerar livro a partir do histórico.");
    }

    const resultado = await criarLivro(db, body, clonar);
    if (resultado.error) return respostaErro(res, 400, resultado.error);
    return res.status(201).json({ livro: resultado.data });
  }

  if (req.method === "PATCH") {
    const livroId = texto(req.query?.id);
    if (!UUID_VALIDO.test(livroId)) return respostaErro(res, 400, "Identificador do livro inválido.");
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return respostaErro(res, 400, "Dados do livro inválidos.");
    }

    if (body.acao === "reabrir") {
      if (!PERFIS_MASTER_LIVRO.includes(role)) {
        return respostaErro(res, 403, "Somente Master e P1 escalante do serviço ordinário podem reabrir livros.");
      }
      const { data, error } = await db
        .from("livros_permanencia")
        .update({ status: "em_andamento" })
        .eq("id", livroId)
        .eq("status", "fechado")
        .select("id, status")
        .maybeSingle();
      if (error) throw error;
      if (!data) return respostaErro(res, 409, "O livro não está fechado ou não foi encontrado.");
      return res.status(200).json({ livro: data });
    }

    if (!PERFIS_ESCRITA.includes(role)) {
      return respostaErro(res, 403, "Sem permissão para editar livros.");
    }

    let dadosLivro;
    try {
      dadosLivro = normalizarLivro(body.livro);
      if (!dadosLivro.data_servico || !dadosLivro.turno || !dadosLivro.permanente_nome) {
        throw new Error("Data, turno e permanente responsável são obrigatórios.");
      }
      if (!Array.isArray(body.viaturas) || !Array.isArray(body.ocorrencias)) {
        throw new Error("Lista de viaturas ou ocorrências inválida.");
      }
      validarFilhos(body.viaturas, body.ocorrencias, livroId);
    } catch (error) {
      return respostaErro(res, 400, error.message);
    }

    const { data: livroAtual, error: erroLeitura } = await db
      .from("livros_permanencia")
      .select("id, status")
      .eq("id", livroId)
      .maybeSingle();
    if (erroLeitura) throw erroLeitura;
    if (!livroAtual) return respostaErro(res, 404, "Livro não encontrado.");
    if (livroAtual.status !== "em_andamento") {
      return respostaErro(res, 409, "Reabra o livro antes de editá-lo.");
    }

    const { data: livroAtualizado, error: erroAtualizacao } = await db
      .from("livros_permanencia")
      .update(dadosLivro)
      .eq("id", livroId)
      .eq("status", "em_andamento")
      .select("id")
      .maybeSingle();
    if (erroAtualizacao) throw erroAtualizacao;
    if (!livroAtualizado) return respostaErro(res, 409, "O livro foi alterado por outra operação.");

    const { error: erroExcluirViaturas } = await db.from("livro_viaturas").delete().eq("livro_id", livroId);
    if (erroExcluirViaturas) throw erroExcluirViaturas;
    const { error: erroExcluirOcorrencias } = await db.from("livro_ocorrencias").delete().eq("livro_id", livroId);
    if (erroExcluirOcorrencias) throw erroExcluirOcorrencias;
    await inserirFilhos(db, livroId, body.viaturas, body.ocorrencias);
    return res.status(200).json({ sucesso: true, id: livroId });
  }

  if (req.method === "DELETE") {
    if (!PERFIS_MASTER_LIVRO.includes(role)) {
      return respostaErro(res, 403, "Somente Master e P1 escalante do serviço ordinário podem excluir livros.");
    }
    const livroId = texto(req.query?.id);
    if (!UUID_VALIDO.test(livroId)) return respostaErro(res, 400, "Identificador do livro inválido.");

    const { error: erroViaturas } = await db.from("livro_viaturas").delete().eq("livro_id", livroId);
    if (erroViaturas) throw erroViaturas;
    const { error: erroOcorrencias } = await db.from("livro_ocorrencias").delete().eq("livro_id", livroId);
    if (erroOcorrencias) throw erroOcorrencias;
    const { data, error } = await db
      .from("livros_permanencia")
      .delete()
      .eq("id", livroId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return respostaErro(res, 404, "Livro não encontrado.");
    return res.status(200).json({ sucesso: true, id: data.id });
  }

  return res
    .setHeader("Allow", "GET, POST, PATCH, DELETE")
    .status(405)
    .json({ error: "Método não permitido." });
}
