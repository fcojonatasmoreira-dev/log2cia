import {
  supabaseAdmin,
  usuarioAutenticado,
  normalizarRole,
  respostaErro,
} from "../_server.js";

const PERFIS_GESTAO = ["master", "p4"];
const SITUACOES_VALIDAS = ["operando", "baixada", "manutencao", "inativa"];
const TIPOS_VALIDOS = ["organica", "locada", "locada_req"];

function texto(valor) {
  return typeof valor === "string" ? valor.trim() : "";
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

export default async function handler(req, res) {
  try {
    const usuario = await usuarioAutenticado(req, res);
    if (!usuario) return;

    const db = supabaseAdmin();
    const role = normalizarRole(usuario);

    if (req.method === "GET") {
      const { data, error } = await db
        .from("viaturas")
        .select("*")
        .order("ativo", { ascending: false })
        .order("identificacao", { ascending: true });

      if (error) throw error;
      const viaturas = await anexarNomeAtualizacao(db, data || []);
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
      const areaOperacao = texto(body.area_operacao);
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
          area_operacao: situacao === "operando" ? areaOperacao || null : null,
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
        dados.area_operacao = texto(dados.area_operacao) || null;
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

      const { data, error } = await db
        .from("viaturas")
        .update(dados)
        .eq("id", id)
        .select("*")
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
    return res.status(500).json({
      error: "Não foi possível concluir a operação.",
    });
  }
}
