import {
  supabaseAdmin,
  usuarioAutenticado,
  normalizarRole,
  respostaErro,
} from "../_server.js";

const PERFIS_GESTAO = ["master", "p4", "armeiro"];

const STATUS_VALIDOS = ["disponivel", "cautelado", "em_manutencao", "baixado"];

function texto(valor) {
  return typeof valor === "string" ? valor.trim() : "";
}

export default async function handler(req, res) {
  try {
    const usuario = await usuarioAutenticado(req, res);
    if (!usuario) return;

    const db = supabaseAdmin();
    const role = normalizarRole(usuario);

    if (req.method === "GET") {
      const { data, error } = await db
        .from("radios")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return res.status(200).json({ radios: data || [] });
    }

    if (req.method === "POST") {
      if (!PERFIS_GESTAO.includes(role)) {
        return respostaErro(res, 403, "Sem permissão para cadastrar rádios.");
      }

      const body = req.body;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return respostaErro(res, 400, "Dados do rádio inválidos.");
      }

      const marca = texto(body.marca).toUpperCase();
      const modelo = texto(body.modelo_descricao).toUpperCase();
      const serie = texto(body.numero_serie).toUpperCase();
      const identificacao = texto(body.numero_identificacao).toUpperCase();

      if (!marca || !modelo || !serie || !identificacao) {
        return respostaErro(
          res,
          400,
          "Marca, modelo, número de série e identificação são obrigatórios.",
        );
      }

      const dados = {
        marca,
        modelo_descricao: modelo,
        numero_serie: serie,
        numero_identificacao: identificacao,
        tombo: texto(body.tombo).toUpperCase() || null,
        status: "disponivel",
        localizacao_atual:
          texto(body.localizacao_atual) || "Estoque da Reserva",
        foto_radio_url: texto(body.foto_radio_url) || null,
        observacoes: texto(body.observacoes),
      };

      const { data, error } = await db
        .from("radios")
        .insert(dados)
        .select("*")
        .single();

      if (error) {
        if (error.code === "23505") {
          return respostaErro(
            res,
            409,
            "Já existe um rádio com essa identificação ou número de série.",
          );
        }
        throw error;
      }

      return res.status(201).json({ radio: data });
    }

    if (req.method === "PATCH") {
      if (!PERFIS_GESTAO.includes(role)) {
        return respostaErro(res, 403, "Sem permissão para atualizar rádios.");
      }

      const id = texto(req.query?.id);
      if (!id) {
        return respostaErro(res, 400, "Identificador do rádio inválido.");
      }

      const body = req.body;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return respostaErro(res, 400, "Dados de atualização inválidos.");
      }

      const camposPermitidos = ["status", "localizacao_atual"];
      const dados = {};
      for (const campo of camposPermitidos) {
        if (Object.prototype.hasOwnProperty.call(body, campo)) {
          dados[campo] = body[campo];
        }
      }

      if (Object.keys(dados).length === 0) {
        return respostaErro(
          res,
          400,
          "Nenhum campo permitido para atualização.",
        );
      }

      if (
        Object.prototype.hasOwnProperty.call(dados, "status") &&
        !STATUS_VALIDOS.includes(dados.status)
      ) {
        return respostaErro(res, 400, "Status do rádio inválido.");
      }

      if (dados.status === "em_manutencao") {
        dados.localizacao_atual = "Manutenção";
      } else if (dados.status === "disponivel") {
        dados.localizacao_atual = "Estoque da Reserva";
      }

      const { data, error } = await db
        .from("radios")
        .update(dados)
        .eq("id", id)
        .select("*")
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        return respostaErro(res, 404, "Rádio não encontrado.");
      }

      return res.status(200).json({ radio: data });
    }

    return res
      .setHeader("Allow", "GET, POST, PATCH")
      .status(405)
      .json({ error: "Método não permitido." });
  } catch (error) {
    console.error("Erro na API de rádios:", error.message);
    return res.status(500).json({
      error: "Não foi possível concluir a operação.",
    });
  }
}
