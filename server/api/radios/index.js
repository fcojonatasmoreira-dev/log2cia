import {
  supabaseAdmin,
  usuarioAutenticado,
  normalizarRole,
  respostaErro,
} from "../_server.js";
import { assinarCaminhos, caminhoDeImagemValido, enviarImagemPrivada } from "../_armazenamento.js";
import { podeLerInventario } from "../equipamentos/index.js";

const PERFIS_GESTAO = ["master", "p4", "armeiro"];
const PERFIS_EDICAO_EXCLUSAO = ["master", "p4"];
const STATUS_VALIDOS = [
  "disponivel",
  "cautelado",
  "em_manutencao",
  "baixado",
];

function texto(valor) {
  return typeof valor === "string" ? valor.trim() : "";
}

// O banco guarda apenas o caminho interno da imagem; a URL assinada é gerada na leitura.
async function aplicarUrlAssinada(db, radios) {
  const lista = Array.isArray(radios) ? radios : [radios];
  const caminhos = lista.map((radio) => radio?.foto_radio_url).filter((caminho) => caminhoDeImagemValido(caminho));
  if (!caminhos.length) return radios;
  const assinaturas = await assinarCaminhos(db, caminhos);
  for (const radio of lista) {
    const url = radio?.foto_radio_url ? assinaturas.get(radio.foto_radio_url) : null;
    if (url) radio.foto_radio_url = url;
  }
  return radios;
}

export default async function handler(req, res) {
  try {
    const usuario = await usuarioAutenticado(req, res);
    if (!usuario) return;

    const db = supabaseAdmin();
    const role = normalizarRole(usuario);

    if (req.method === "GET") {
      if (usuario.modo_acesso !== "administrativo" || !podeLerInventario(usuario)) {
        return respostaErro(res, 403, "A consulta de rádios está disponível somente no modo Administrativo para perfis autorizados ao inventário.");
      }
      const { data, error } = await db
        .from("radios")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return res.status(200).json({ radios: await aplicarUrlAssinada(db, data || []) });
    }

    if (req.method === "POST") {
      if (String(req.query?.acao || "") === "imagem") {
        if (!PERFIS_GESTAO.includes(role)) {
          return respostaErro(res, 403, "Sem permissão para enviar imagens do inventário.");
        }
        const resultado = await enviarImagemPrivada(db, { prefixo: "radio", conteudo: req.body?.conteudo });
        if (resultado.erro) return respostaErro(res, 400, resultado.erro);
        return res.status(201).json({ path: resultado.path, url: resultado.url });
      }

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
        localizacao_atual: texto(body.localizacao_atual) || "Estoque da Reserva",
        foto_radio_url: caminhoDeImagemValido(texto(body.foto_radio_url)) ? texto(body.foto_radio_url) : null,
        observacoes: texto(body.observacoes),
      };

      const { data, error } = await db
        .from("radios")
        .insert(dados)
        .select("*")
        .single();

      if (error) {
        if (error.code === "23505") {
          return respostaErro(res, 409, "Já existe um rádio com essa identificação ou número de série.");
        }
        throw error;
      }

      const [radio] = await aplicarUrlAssinada(db, [data]);
      return res.status(201).json({ radio });
    }

    if (req.method === "PATCH") {
      if (!PERFIS_GESTAO.includes(role)) {
        return respostaErro(res, 403, "Sem permissão para atualizar rádios.");
      }

      const id = texto(req.query?.id);
      if (!id) return respostaErro(res, 400, "Identificador do rádio inválido.");

      const body = req.body;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return respostaErro(res, 400, "Dados de atualização inválidos.");
      }

      const camposEdicao = ["marca", "modelo_descricao", "numero_serie", "numero_identificacao", "tombo", "observacoes"];
      if (camposEdicao.some((campo) => Object.prototype.hasOwnProperty.call(req.body, campo)) && !PERFIS_EDICAO_EXCLUSAO.includes(role)) {
        return respostaErro(res, 403, "Somente Master e P4 podem editar os dados do rádio.");
      }

      const camposPermitidos = ["status", "localizacao_atual", ...camposEdicao];
      const dados = {};

      for (const campo of camposPermitidos) {
        if (Object.prototype.hasOwnProperty.call(body, campo)) {
          dados[campo] = body[campo];
        }
      }

      const camposTexto = ["marca", "modelo_descricao", "numero_serie", "numero_identificacao"];
      for (const campo of camposTexto) {
        if (Object.prototype.hasOwnProperty.call(dados, campo)) {
          dados[campo] = texto(dados[campo]).toUpperCase();
          if (!dados[campo]) {
            return respostaErro(res, 400, `${campo} é obrigatório.`);
          }
        }
      }
      if (Object.prototype.hasOwnProperty.call(dados, "tombo")) {
        dados.tombo = texto(dados.tombo).toUpperCase() || null;
      }
      if (Object.prototype.hasOwnProperty.call(dados, "observacoes")) {
        dados.observacoes = texto(dados.observacoes);
      }
      if (Object.prototype.hasOwnProperty.call(dados, "localizacao_atual")) {
        dados.localizacao_atual = texto(dados.localizacao_atual);
        if (!dados.localizacao_atual) {
          return respostaErro(res, 400, "Localização é obrigatória.");
        }
      }

      if (Object.keys(dados).length === 0) {
        return respostaErro(res, 400, "Nenhum campo permitido para atualização.");
      }

      if (
        Object.prototype.hasOwnProperty.call(dados, "status") &&
        !STATUS_VALIDOS.includes(dados.status)
      ) {
        return respostaErro(res, 400, "Status do rádio inválido.");
      }

      if (dados.status === "cautelado") {
        return respostaErro(
          res,
          400,
          "O status Cautelado deve ser alterado pela emissão ou devolução da cautela.",
        );
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
        .neq("status", "cautelado")
        .select("*")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return respostaErro(
          res,
          409,
          "Rádio não encontrado ou está cautelado e não pode ser alterado por esta operação.",
        );
      }

      return res.status(200).json({ radio: data });
    }

    if (req.method === "DELETE") {
      if (!PERFIS_EDICAO_EXCLUSAO.includes(role)) {
        return respostaErro(res, 403, "Somente Master e P4 podem excluir rádios.");
      }

      const id = texto(req.query?.id);
      if (!id) return respostaErro(res, 400, "Identificador do rádio inválido.");

      const { data: radio, error: consultaError } = await db
        .from("radios")
        .select("id, status")
        .eq("id", id)
        .maybeSingle();
      if (consultaError) throw consultaError;
      if (!radio) return respostaErro(res, 404, "Rádio não encontrado.");
      if (radio.status === "cautelado") {
        return respostaErro(res, 409, "Não é possível excluir um rádio enquanto estiver cautelado. Faça a devolução primeiro.");
      }

      const { error: exclusaoError } = await db
        .from("radios")
        .delete()
        .eq("id", id);
      if (exclusaoError) {
        if (exclusaoError.code === "23503") {
          return respostaErro(res, 409, "Este rádio possui vínculos e não pode ser excluído.");
        }
        throw exclusaoError;
      }
      return res.status(200).json({ success: true, id });
    }

    return res
      .setHeader("Allow", "GET, POST, PATCH, DELETE")
      .status(405)
      .json({ error: "Método não permitido." });
  } catch (error) {
    console.error("Erro na API de rádios:", error.message);
    return res.status(500).json({
      error: "Não foi possível concluir a operação.",
    });
  }
}
