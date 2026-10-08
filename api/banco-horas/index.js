import {
  respostaErro,
  supabaseAdmin,
  usuarioAutenticado,
  normalizarRole,
} from "../_server.js";

const PERFIS_GESTAO = ["master", "p1", "oficial"];
const TIPOS_SOLICITACAO = ["inclusao_horas", "dispensa", "folga"];

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
      const movimentacoesAtivas = (movimentacoes || []).filter(
        (item) => !item.excluido_em,
      );
      const saldo = movimentacoesAtivas.reduce((total, item) => {
        const horas = Number(item.horas || 0);
        if (item.tipo === "credito") return total + horas;
        if (item.tipo === "debito") return total - horas;
        if (item.tipo === "ajuste_zeragem") return total + horas;
        return total;
      }, 0);
      const folgasDisponiveis = movimentacoesAtivas.reduce((total, item) => {
        if (item.tipo === "concessao_folga")
          return total + Number(item.quantidade_folgas || 0);
        if (item.tipo === "utilizacao_folga")
          return total - Number(item.quantidade_folgas || 0);
        return total;
      }, 0);
      return res.status(200).json({
        movimentacoes: movimentacoes || [],
        solicitacoes: solicitacoes || [],
        saldo: Number(saldo.toFixed(2)),
        folgas_disponiveis: Math.max(0, folgasDisponiveis),
        permissoes: {
          excluir_movimentacao: ["master", "oficial"].includes(normalizarRole(usuario)),
        },
      });
    }

    if (req.method === "DELETE") {
      if (!["master", "oficial"].includes(normalizarRole(usuario))) {
        return respostaErro(
          res,
          403,
          "Apenas Master e Oficial podem excluir movimentações.",
        );
      }

      const body = req.body;
      const movimentacaoId = texto(
        body?.movimentacao_id || req.query?.movimentacao_id,
      );
      if (!movimentacaoId) {
        return respostaErro(res, 400, "Informe a movimentação a ser excluída.");
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

      return res.status(200).json({ sucesso: true, movimentacao_id: data.id });
    }

    if (req.method === "POST") {
      const body = req.body;
      if (!body || typeof body !== "object" || Array.isArray(body))
        return respostaErro(res, 400, "Dados inválidos.");

      if (body.acao === "excluir_movimentacao") {
        if (!["master", "oficial"].includes(normalizarRole(usuario))) {
          return respostaErro(
            res,
            403,
            "Apenas Master e Oficial podem excluir movimentações.",
          );
        }
        const movimentacaoId = texto(body.movimentacao_id);
        const motivo = texto(body.motivo_exclusao);
        if (!movimentacaoId || !motivo) {
          return respostaErro(
            res,
            400,
            "Informe a movimentação e a justificativa da exclusão.",
          );
        }
        if (motivo.length > 1000) {
          return respostaErro(
            res,
            400,
            "A justificativa deve ter no máximo 1000 caracteres.",
          );
        }
        const { data, error } = await db
          .from("banco_horas_movimentacoes")
          .update({
            excluido_em: new Date().toISOString(),
            excluido_por: usuario.id,
            motivo_exclusao: motivo,
          })
          .eq("id", movimentacaoId)
          .is("excluido_em", null)
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          return respostaErro(
            res,
            404,
            "Movimentação não encontrada ou já excluída.",
          );
        }
        return res
          .status(200)
          .json({ sucesso: true, movimentacao_id: data.id });
      }

      if (body.acao === "movimentar") {
        if (!["master", "p1"].includes(normalizarRole(usuario)))
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
        const turnoDescricao = texto(body.turno_descricao);
        if (
          !policialId ||
          !["credito", "debito"].includes(tipo) ||
          !horas ||
          !descricao ||
          (turno !== null && !["A", "B", "OUTRO"].includes(turno)) ||
          (turno === "OUTRO" && !turnoDescricao)
        ) {
          return respostaErro(
            res,
            400,
            "Informe policial, tipo, quantidade positiva de horas e o turno. Se escolher Outros, descreva o turno.",
          );
        }
        const { data, error } = await db
          .from("banco_horas_movimentacoes")
          .insert({
            policial_id: policialId,
            tipo,
            horas,
            quantidade_folgas: 0,
            descricao,
            data_referencia: texto(body.data_referencia) || null,
            turno,
            turno_descricao: turno === "OUTRO" ? turnoDescricao : null,
            registrado_por: usuario.id,
          })
          .select("*")
          .single();
        if (error) throw error;
        return res.status(201).json({ movimentacao: data });
      }

      if (body.acao === "conceder_folga") {
        if (!["master", "p1"].includes(normalizarRole(usuario)))
          return respostaErro(
            res,
            403,
            "Apenas P1 e Master podem conceder folgas.",
          );
        const policialId = texto(body.policial_id);
        const quantidade = Number(body.quantidade_folgas);
        const descricao = texto(body.descricao);
        if (
          !policialId ||
          !Number.isInteger(quantidade) ||
          quantidade <= 0 ||
          quantidade > 99 ||
          !descricao
        ) {
          return respostaErro(
            res,
            400,
            "Informe policial, quantidade inteira de folgas e a justificativa.",
          );
        }
        const { data, error } = await db
          .from("banco_horas_movimentacoes")
          .insert({
            policial_id: policialId,
            tipo: "concessao_folga",
            horas: 0,
            quantidade_folgas: quantidade,
            descricao,
            data_referencia: texto(body.data_referencia) || null,
            turno: null,
            registrado_por: usuario.id,
          })
          .select("*")
          .single();
        if (error) throw error;
        return res.status(201).json({ movimentacao: data });
      }

      if (body.acao === "utilizar_folga") {
        if (!["master", "p1"].includes(normalizarRole(usuario)))
          return respostaErro(
            res,
            403,
            "Apenas P1 e Master podem registrar utilização de folga.",
          );
        const policialId = texto(body.policial_id);
        const horasServico =
          body.horas_servico == null || body.horas_servico === ""
            ? null
            : numeroPositivo(body.horas_servico);
        const dataReferencia = texto(body.data_referencia);
        const turno =
          body.turno == null || body.turno === ""
            ? null
            : texto(body.turno).toUpperCase();
        const turnoDescricao = texto(body.turno_descricao);
        const descricao = texto(body.descricao);
        if (
          !policialId ||
          !/^\d{4}-\d{2}-\d{2}$/.test(dataReferencia) ||
          !descricao ||
          (turno !== null && !["A", "B", "OUTRO"].includes(turno)) ||
          (turno === "OUTRO" && !turnoDescricao)
        ) {
          return respostaErro(
            res,
            400,
            "Informe policial, data, justificativa e o turno. Se escolher Outros, descreva o turno.",
          );
        }
        const { data, error } = await db.rpc(
          "registrar_utilizacao_folga_banco_horas_v2",
          {
            p_policial_id: policialId,
            p_data_referencia: dataReferencia,
            p_horas_servico: horasServico,
            p_turno: turno,
            p_turno_descricao: turno === "OUTRO" ? turnoDescricao : null,
            p_descricao: descricao,
            p_registrado_por: usuario.id,
          },
        );
        if (error) {
          if (error.message?.includes("FOLGA_INDISPONIVEL"))
            return respostaErro(
              res,
              409,
              "O policial não possui folga de serviço disponível.",
            );
          if (error.message?.includes("TURNO_DESCRICAO_OBRIGATORIA"))
            return respostaErro(res, 400, "Descreva o outro turno.");
          throw error;
        }
        return res.status(201).json({ movimentacao: data });
      }

      const tipo = texto(body.tipo);
      const origemDispensa =
        tipo === "dispensa" ? texto(body.origem_dispensa) : null;
      const eFolga = tipo === "folga";
      const horas = eFolga ? 0 : numeroPositivo(body.horas_solicitadas);
      const quantidadeFolgas = eFolga ? Number(body.quantidade_folgas || 1) : 0;
      const dataFatoBeneficio = eFolga ? texto(body.data_fato_beneficio) : null;
      const dataServico = eFolga ? null : texto(body.data_servico);
      const turno = eFolga ? null : texto(body.turno).toUpperCase();
      const turnoDescricao = eFolga ? null : texto(body.turno_descricao);
      const justificativa = texto(body.justificativa);
      const ocorrencia = texto(body.numero_ocorrencia);
      const dadosValidos = eFolga
        ? TIPOS_SOLICITACAO.includes(tipo) &&
          Number.isInteger(quantidadeFolgas) &&
          quantidadeFolgas > 0 &&
          quantidadeFolgas <= 99 &&
          /^\d{4}-\d{2}-\d{2}$/.test(dataFatoBeneficio) &&
          !!justificativa &&
          !!ocorrencia
        : TIPOS_SOLICITACAO.includes(tipo) &&
          !!horas &&
          /^\d{4}-\d{2}-\d{2}$/.test(dataServico) &&
          ["A", "B", "OUTRO"].includes(turno) &&
          (turno !== "OUTRO" || !!turnoDescricao) &&
          !!justificativa;
      if (!dadosValidos) {
        return respostaErro(
          res,
          400,
          eFolga
            ? "Informe a quantidade de folgas, a data do fato gerador, a referência da ocorrência e a justificativa."
            : "Informe tipo, data do serviço, carga horária, turno e justificativa. Se escolher Outros, descreva o turno.",
        );
      }
      if (
        tipo === "dispensa" &&
        !["banco_horas", "folga"].includes(origemDispensa)
      ) {
        return respostaErro(
          res,
          400,
          "Informe se a dispensa será abatida do Banco de Horas ou de uma folga disponível.",
        );
      }
      if (tipo === "inclusao_horas" && !ocorrencia) {
        return respostaErro(
          res,
          400,
          "Informe a referência da ocorrência no livro.",
        );
      }
      if (tipo === "dispensa" && origemDispensa === "folga") {
        const { data: movimentos, error: erroMov } = await db
          .from("banco_horas_movimentacoes")
          .select("tipo, quantidade_folgas")
          .eq("policial_id", usuario.id)
          .is("excluido_em", null);
        if (erroMov) throw erroMov;
        const disponiveis = (movimentos || []).reduce(
          (total, item) =>
            total +
            (item.tipo === "concessao_folga"
              ? Number(item.quantidade_folgas || 0)
              : item.tipo === "utilizacao_folga"
                ? -Number(item.quantidade_folgas || 0)
                : 0),
          0,
        );
        if (disponiveis < 1)
          return respostaErro(
            res,
            409,
            "Você não possui folga de serviço disponível para solicitar esta dispensa.",
          );
      }
      const { data, error } = await db
        .from("banco_horas_solicitacoes")
        .insert({
          policial_id: usuario.id,
          tipo,
          origem_dispensa: origemDispensa,
          horas_solicitadas: horas,
          quantidade_folgas: quantidadeFolgas,
          data_fato_beneficio: dataFatoBeneficio,
          data_servico: dataServico,
          turno,
          turno_descricao: turno === "OUTRO" ? turnoDescricao : null,
          numero_ocorrencia: ocorrencia || null,
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
      const { data, error } = await db.rpc(
        "analisar_solicitacao_banco_horas_v3",
        {
          p_solicitacao_id: solicitacaoId,
          p_status: status,
          p_parecer: parecer || null,
          p_analisada_por: usuario.id,
        },
      );
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
        if (error.message?.includes("PARECER_OBRIGATORIO")) {
          return respostaErro(res, 400, "Informe o motivo do indeferimento.");
        }
        if (error.message?.includes("FOLGA_INDISPONIVEL")) {
          return respostaErro(
            res,
            409,
            "A folga disponível já foi utilizada ou não está mais disponível.",
          );
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
