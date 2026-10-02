import {
  respostaErro,
  supabaseAdmin,
  usuarioAutenticado,
  normalizarRole,
} from "../_server.js";

const PERFIS_GESTAO = ["master", "p1"];
const TIPOS_SOLICITACAO = ["inclusao_horas", "dispensa"];

function texto(valor) {
  return typeof valor === "string" ? valor.trim() : "";
}

function numeroPositivo(valor) {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default async function handler(req, res) {
  try {
    const usuario = await usuarioAutenticado(req, res);
    if (!usuario) return;

    const db = supabaseAdmin();
    const gestor = PERFIS_GESTAO.includes(normalizarRole(usuario));

    if (req.method === "GET") {
      const solicitado = texto(req.query?.policial_id);
      if (!gestor && solicitado && solicitado !== usuario.id) {
        return respostaErro(
          res,
          403,
          "Você só pode consultar seu próprio banco de horas.",
        );
      }
      const policialId = gestor ? solicitado || null : usuario.id;
      let movQuery = db
        .from("banco_horas_movimentacoes")
        .select("*")
        .order("created_at", { ascending: false });
      let solQuery = db
        .from("banco_horas_solicitacoes")
        .select("*")
        .order("created_at", { ascending: false });
      if (policialId) {
        movQuery = movQuery.eq("policial_id", policialId);
        solQuery = solQuery.eq("policial_id", policialId);
      }
      const [
        { data: movimentacoes, error: erroMov },
        { data: solicitacoes, error: erroSol },
      ] = await Promise.all([movQuery, solQuery]);
      if (erroMov) throw erroMov;
      if (erroSol) throw erroSol;
      const saldo = (movimentacoes || [])
        .filter((item) => !item.excluido_em)
        .reduce((total, item) => {
          const horas = Number(item.horas || 0);
          if (item.tipo === "credito") return total + horas;
          if (item.tipo === "debito") return total - horas;
          if (item.tipo === "ajuste_zeragem") return total + horas;
          return total;
        }, 0);
      return res.status(200).json({
        movimentacoes: movimentacoes || [],
        solicitacoes: solicitacoes || [],
        saldo: Number(saldo.toFixed(2)),
        permissoes: {
          excluir_movimentacao: normalizarRole(usuario) === "master",
        },
      });
    }

    if (req.method === "POST") {
      const body = req.body;
      if (!body || typeof body !== "object" || Array.isArray(body))
        return respostaErro(res, 400, "Dados inválidos.");

      if (body.acao === "excluir_movimentacao") {
        if (normalizarRole(usuario) !== "master") {
          return respostaErro(
            res,
            403,
            "Apenas o Master pode excluir movimentações.",
          );
        }
        const movimentacaoId = texto(body.movimentacao_id);
        if (!movimentacaoId) {
          return respostaErro(
            res,
            400,
            "Informe a movimentação que deseja excluir.",
          );
        }
        // Primeiro localiza a movimentação para identificar se ela foi criada
        // pelo deferimento de uma solicitação. A consulta é necessária porque
        // a movimentação e a solicitação ficam em tabelas separadas.
        const { data: existente, error: erroBusca } = await db
          .from("banco_horas_movimentacoes")
          .select("id, solicitacao_id")
          .eq("id", movimentacaoId)
          .maybeSingle();
        if (erroBusca) throw erroBusca;
        if (!existente) {
          return respostaErro(res, 404, "Movimentação não encontrada.");
        }

        const { data, error } = await db
          .from("banco_horas_movimentacoes")
          .delete()
          .eq("id", movimentacaoId)
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          return respostaErro(res, 404, "Movimentação não encontrada.");
        }

        // Ao apagar uma movimentação vinculada a uma solicitação deferida,
        // apaga também a solicitação para que ela não continue na listagem.
        if (existente.solicitacao_id) {
          const { error: erroSolicitacao } = await db
            .from("banco_horas_solicitacoes")
            .delete()
            .eq("id", existente.solicitacao_id);
          if (erroSolicitacao) throw erroSolicitacao;
        }

        return res.status(200).json({
          sucesso: true,
          movimentacao_id: data.id,
          solicitacao_excluida: Boolean(existente.solicitacao_id),
        });
      }

      if (body.acao === "movimentar") {
        if (!gestor)
          return respostaErro(
            res,
            403,
            "Apenas P1 e Master podem registrar movimentações.",
          );
        const policialId = texto(body.policial_id);
        const tipo = texto(body.tipo);
        const horas = numeroPositivo(body.horas);
        const descricao = texto(body.descricao);
        const turno =
          body.turno == null || body.turno === ""
            ? null
            : texto(body.turno).toUpperCase();
        if (
          !policialId ||
          !["credito", "debito"].includes(tipo) ||
          !horas ||
          !descricao ||
          (turno !== null && !["A", "B"].includes(turno))
        ) {
          return respostaErro(
            res,
            400,
            "Informe policial, tipo, quantidade positiva de horas, descrição e turno A/B quando aplicável.",
          );
        }
        const { data, error } = await db
          .from("banco_horas_movimentacoes")
          .insert({
            policial_id: policialId,
            tipo,
            horas,
            descricao,
            data_referencia: texto(body.data_referencia) || null,
            turno,
            registrado_por: usuario.id,
          })
          .select("*")
          .single();
        if (error) throw error;
        return res.status(201).json({ movimentacao: data });
      }

      const tipo = texto(body.tipo);
      const horas =
        tipo === "dispensa" ? 12 : numeroPositivo(body.horas_solicitadas);
      const dataServico = texto(body.data_servico);
      const turno = texto(body.turno).toUpperCase();
      const justificativa = texto(body.justificativa);
      if (
        !TIPOS_SOLICITACAO.includes(tipo) ||
        !horas ||
        !/^\d{4}-\d{2}-\d{2}$/.test(dataServico) ||
        !["A", "B"].includes(turno) ||
        !justificativa
      ) {
        return respostaErro(
          res,
          400,
          "Informe tipo, data do serviço, turno A ou B e justificativa. Para inclusão, informe também as horas.",
        );
      }
      if (tipo === "inclusao_horas" && !texto(body.numero_ocorrencia)) {
        return respostaErro(
          res,
          400,
          "Informe a referência da ocorrência no livro (data, turno e número).",
        );
      }
      const { data, error } = await db
        .from("banco_horas_solicitacoes")
        .insert({
          policial_id: usuario.id,
          tipo,
          horas_solicitadas: horas,
          data_servico: dataServico,
          turno,
          numero_ocorrencia: texto(body.numero_ocorrencia) || null,
          justificativa,
        })
        .select("*")
        .single();
      if (error) throw error;
      return res.status(201).json({ solicitacao: data });
    }

    if (req.method === "PATCH") {
      if (!gestor)
        return respostaErro(
          res,
          403,
          "Apenas P1 e Master podem analisar solicitações.",
        );
      const body = req.body;
      const solicitacaoId = texto(body?.solicitacao_id);
      const status = texto(body?.status);
      const parecer = texto(body?.parecer);
      if (!solicitacaoId || !["deferida", "indeferida"].includes(status)) {
        return respostaErro(
          res,
          400,
          "Informe a solicitação e o resultado da análise.",
        );
      }
      if (status === "indeferida" && !parecer) {
        return respostaErro(res, 400, "Informe o motivo do indeferimento.");
      }
      const { data, error } = await db.rpc("analisar_solicitacao_banco_horas", {
        p_solicitacao_id: solicitacaoId,
        p_status: status,
        p_parecer: parecer || null,
        p_analisada_por: usuario.id,
      });
      if (error) {
        if (error.message?.includes("SOLICITACAO_NAO_PENDENTE")) {
          return respostaErro(
            res,
            409,
            "Esta solicitação já foi analisada ou não está pendente.",
          );
        }
        if (error.message?.includes("SOLICITACAO_NAO_ENCONTRADA")) {
          return respostaErro(res, 404, "Solicitação não encontrada.");
        }
        throw error;
      }
      return res.status(200).json({ solicitacao: data });
    }

    res.setHeader("Allow", "GET, POST, PATCH");
    return respostaErro(res, 405, "Método não permitido.");
  } catch (error) {
    console.error("Erro na API do Banco de Horas:", error);
    return respostaErro(
      res,
      500,
      "Não foi possível concluir a operação do Banco de Horas.",
    );
  }
}
