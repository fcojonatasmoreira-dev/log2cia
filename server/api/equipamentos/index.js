import {
  respostaErro,
  supabaseAdmin,
  usuarioAutenticado,
  normalizarRole,
} from "../_server.js";
import { assinarCaminhos, enviarImagemPrivada } from "../_armazenamento.js";

const ROLES_GESTAO = ["master", "p4"];
const TIPOS_EDITAVEIS = ["armamento", "colete", "municao"];
const STATUS_VALIDOS = ["disponivel", "cautelado", "em_manutencao", "baixado"];
const ROLES_LEITURA = ["master", "p4", "armeiro", "oficial"];
const DETALHES_PERMITIDOS = ["localizacao_atual", "estado_conservacao", "foto_arma_path", "foto_numeracao_path", "obs", "calibre", "subtipo_armamento", "genero", "tamanho", "data_fabricacao", "data_validade", "obs_baixa_definitiva", "lote", "quantidade"];
const PREFIXOS_IMAGEM = ["arma", "num", "frente_arma", "num_serie", "rotulo_frente", "rotulo_verso", "municoes", "caixa_municao", "radio"];

// As URLs assinadas são geradas na leitura; o banco guarda apenas o caminho interno.
async function aplicarUrlsAssinadas(db, equipamentos) {
  const lista = Array.isArray(equipamentos) ? equipamentos : [equipamentos];
  const caminhos = lista.flatMap((equipamento) => [
    equipamento?.detalhes?.foto_arma_path,
    equipamento?.detalhes?.foto_numeracao_path,
  ]).filter(Boolean);
  if (!caminhos.length) return equipamentos;
  const assinaturas = await assinarCaminhos(db, caminhos);
  for (const equipamento of lista) {
    const detalhes = equipamento?.detalhes;
    if (!detalhes) continue;
    const urlArma = assinaturas.get(detalhes.foto_arma_path);
    const urlNumeracao = assinaturas.get(detalhes.foto_numeracao_path);
    if (urlArma) detalhes.foto_arma_url = urlArma;
    if (urlNumeracao) detalhes.foto_numeracao_url = urlNumeracao;
  }
  return equipamentos;
}

export function podeLerInventario(usuario) {
  return ROLES_LEITURA.includes(normalizarRole(usuario)) || usuario?.is_master === true;
}

export function podeGerenciarTipoEquipamento(usuario, tipo) {
  const role = normalizarRole(usuario);
  return usuario?.is_master === true || ROLES_GESTAO.includes(role) || (role === "armeiro" && tipo === "armamento");
}

function filtrarDetalhes(detalhes, existentes = {}) {
  const permitidos = Object.fromEntries(Object.entries(detalhes).filter(([campo, valor]) => DETALHES_PERMITIDOS.includes(campo) && (typeof valor === "string" || typeof valor === "number" || typeof valor === "boolean" || valor === null)));
  return { ...existentes, ...permitidos };
}

export function validarNovoEquipamento(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  if (typeof body.tipo !== "string" || typeof body.modelo_descricao !== "string" || (body.num_serie != null && typeof body.num_serie !== "string") || (body.patrimonio != null && typeof body.patrimonio !== "string")) return null;
  const tipo = String(body.tipo || "").trim().toLowerCase();
  const modelo = String(body.modelo_descricao || "").trim();
  const serie = String(body.num_serie ?? "").trim();
  const detalhes = body.detalhes;
  if (!TIPOS_EDITAVEIS.includes(tipo) || !modelo || !detalhes || typeof detalhes !== "object" || Array.isArray(detalhes)) return null;
  if (body.status && String(body.status).toLowerCase() !== "disponivel") return null;
  return {
    tipo,
    modelo_descricao: modelo,
    num_serie: serie,
    patrimonio: body.patrimonio ? String(body.patrimonio).trim() : null,
    status: "disponivel",
    detalhes: filtrarDetalhes(detalhes),
  };
}

export default async function handler(req, res) {
  try {
    const usuario = await usuarioAutenticado(req, res);
    if (!usuario) return;
    const id = String(req.query?.id || "").trim();
    const db = supabaseAdmin();

    if (req.method === "GET") {
      if (!podeLerInventario(usuario)) return respostaErro(res, 403, "Sem permissão para consultar o inventário.");
      let query = db.from("equipamentos").select("*").order("created_at", { ascending: false });
      if (String(req.query?.disponiveis || "") === "true") {
        query = db.from("equipamentos").select("id, tipo, modelo_descricao, num_serie, status").eq("status", "disponivel").order("created_at", { ascending: false });
      } else if (id) {
        query = db.from("equipamentos").select("*").eq("id", id).maybeSingle();
      } else if (req.query?.q) {
        const termo = String(req.query.q).trim().replace(/[(),%_*\r\n]/g, " ").trim();
        if (!termo || termo.length > 100) return respostaErro(res, 400, "Termo de busca inválido.");
        query = db.from("equipamentos").select("*").or(`num_serie.ilike.%${termo}%,modelo_descricao.ilike.%${termo}%,patrimonio.ilike.%${termo}%`).limit(1).maybeSingle();
      }
      const { data, error } = await query;
      if (error) throw error;
      if (id || req.query?.q) {
        const [equipamento] = await aplicarUrlsAssinadas(db, [data || null]);
        return res.status(200).json({ equipamento });
      }
      return res.status(200).json({ equipamentos: await aplicarUrlsAssinadas(db, data || []) });
    }

    if (req.method === "POST") {
      if (String(req.query?.acao || "") === "imagem") {
        if (!["master", "p4", "armeiro"].includes(normalizarRole(usuario))) {
          return respostaErro(res, 403, "Sem permissão para enviar imagens do inventário.");
        }
        const prefixo = String(req.body?.prefixo || "").trim();
        if (!PREFIXOS_IMAGEM.includes(prefixo)) {
          return respostaErro(res, 400, "Prefixo de imagem inválido.");
        }
        const resultado = await enviarImagemPrivada(db, { prefixo, conteudo: req.body?.conteudo });
        if (resultado.erro) return respostaErro(res, 400, resultado.erro);
        return res.status(201).json({ path: resultado.path, url: resultado.url });
      }

      const dados = validarNovoEquipamento(req.body);
      if (!dados) return respostaErro(res, 400, "Dados de equipamento inválidos.");
      if (!podeGerenciarTipoEquipamento(usuario, dados.tipo)) return respostaErro(res, 403, "Sem permissão para cadastrar este tipo de equipamento.");
      const { data, error } = await db.from("equipamentos").insert([dados]).select("*").single();
      if (error) throw error;
      const [equipamento] = await aplicarUrlsAssinadas(db, [data]);
      return res.status(201).json({ equipamento });
    }

    if (!id) return respostaErro(res, 400, "Informe o ID do equipamento.");

    if (req.method === "PATCH") {
      const body = req.body || {};
      const { data: atual, error: erroBusca } = await db
        .from("equipamentos")
        .select("id, tipo, modelo_descricao, num_serie, patrimonio, status, detalhes")
        .eq("id", id)
        .maybeSingle();

      if (erroBusca) throw erroBusca;
      if (!atual) return respostaErro(res, 404, "Equipamento não encontrado.");
      if (!TIPOS_EDITAVEIS.includes(String(atual.tipo || "").toLowerCase())) {
        return respostaErro(res, 400, "Tipo de equipamento não permitido.");
      }
      if (!podeGerenciarTipoEquipamento(usuario, String(atual.tipo).toLowerCase())) {
        return respostaErro(res, 403, "Sem permissão para editar este tipo de equipamento.");
      }
      const statusSolicitado = String(body.status ?? atual.status ?? "disponivel").toLowerCase();
      const statusAtual = String(atual.status || "").toLowerCase();
      if ((statusAtual === "cautelado") !== (statusSolicitado === "cautelado")) return respostaErro(res, 409, "O status de equipamento deve ser alterado pelo fluxo de cautela.");

      if (typeof body.modelo_descricao !== "string" || (body.num_serie != null && typeof body.num_serie !== "string") || (body.patrimonio != null && typeof body.patrimonio !== "string")) return respostaErro(res, 400, "Dados de equipamento inválidos.");
      const modelo = String(body.modelo_descricao ?? "").trim();
      if (!modelo) return respostaErro(res, 400, "A descrição do equipamento é obrigatória.");

      const status = String(body.status ?? atual.status ?? "disponivel").trim().toLowerCase();
      if (!STATUS_VALIDOS.includes(status)) {
        return respostaErro(res, 400, "Status inválido.");
      }

      const detalhesEnviados = body.detalhes;
      if (!detalhesEnviados || typeof detalhesEnviados !== "object" || Array.isArray(detalhesEnviados)) {
        return respostaErro(res, 400, "Os detalhes do equipamento são inválidos.");
      }

      // Preserva dados não editados (incluindo URLs das imagens) e atualiza os campos enviados.
      const detalhes = filtrarDetalhes(detalhesEnviados, atual.detalhes || {});
      if (String(atual.tipo || "").toLowerCase() === "colete" && detalhes.localizacao_atual === "Baixa Definitiva" && !String(detalhes.obs_baixa_definitiva || "").trim()) {
        return respostaErro(res, 400, "Informe a observação da baixa definitiva.");
      }
      const atualizacao = {
        modelo_descricao: modelo,
        num_serie: String(body.num_serie ?? "").trim(),
        patrimonio: body.patrimonio ? String(body.patrimonio).trim() : null,
        status,
        detalhes,
      };

      const { data, error } = await db
        .from("equipamentos")
        .update(atualizacao)
        .eq("id", id)
        .select("*")
        .single();

      if (error) throw error;
      const [equipamento] = await aplicarUrlsAssinadas(db, [data]);
      return res.status(200).json({ equipamento });
    }

    if (req.method === "DELETE") {
      const { data: atual, error: erroBusca } = await db
        .from("equipamentos")
        .select("id, tipo, status, detalhes")
        .eq("id", id)
        .maybeSingle();

      if (erroBusca) throw erroBusca;
      if (!atual) return respostaErro(res, 404, "Equipamento não encontrado.");
      if (!TIPOS_EDITAVEIS.includes(String(atual.tipo || "").toLowerCase())) {
        return respostaErro(res, 400, "Tipo de equipamento não permitido.");
      }
      if (!podeGerenciarTipoEquipamento(usuario, String(atual.tipo).toLowerCase())) {
        return respostaErro(res, 403, "Sem permissão para excluir este tipo de equipamento.");
      }

      const localizacao = String(atual.detalhes?.localizacao_atual || "").toLowerCase();
      if (String(atual.status || "").toLowerCase() === "cautelado" || localizacao.includes("cautelad")) {
        return respostaErro(res, 409, "Não é possível excluir um equipamento cautelado. Regularize a cautela primeiro.");
      }

      if (String(atual.tipo || "").toLowerCase() === "armamento") {
        const { data: vinculos, error: erroVinculos } = await db.from("cautela_itens").select("id").eq("equipamento_id", id).limit(1);
        if (erroVinculos) throw erroVinculos;
        if (vinculos?.length) return respostaErro(res, 409, "O armamento possui vínculo com cautela e não pode ser excluído.");
      }

      const { error } = await db.from("equipamentos").delete().eq("id", id);
      if (error) throw error;
      return res.status(200).json({ success: true, id });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return respostaErro(res, 405, "Método não permitido.");
  } catch (error) {
    console.error("Erro na API de equipamentos:", error.message);
    return respostaErro(res, 500, "Não foi possível concluir a operação de equipamento.");
  }
}
