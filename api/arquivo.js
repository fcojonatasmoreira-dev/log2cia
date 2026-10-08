import {
  supabaseAdmin,
  usuarioAutenticado,
  normalizarRole,
  respostaErro,
} from "./_server.js";

const ROLES_CONSULTA = ["master", "p4", "p1", "oficial"];

function texto(valor) {
  return typeof valor === "string" ? valor.trim() : "";
}

function permitidoConsulta(role) {
  return ROLES_CONSULTA.includes(role);
}

function podeGerenciar(role) {
  return ["master", "p1"].includes(role);
}

export default async function handler(req, res) {
  try {
    const usuario = await usuarioAutenticado(req, res);
    if (!usuario) return;

    const role = normalizarRole(usuario);

    if (!permitidoConsulta(role)) {
      return respostaErro(
        res,
        403,
        "Você não tem permissão para consultar o arquivo de Ofícios.",
      );
    }

    const db = supabaseAdmin();

    if (req.method === "GET") {
      const [
        { data: estantes, error: erroEstantes },
        { data: colunas, error: erroColunas },
        { data: pastas, error: erroPastas },
      ] = await Promise.all([
        db.from("arquivos_estantes").select("*").order("nome"),
        db.from("arquivos_colunas").select("*").order("nome"),
        db.from("arquivos_pastas").select("*").order("nome"),
      ]);

      if (erroEstantes) throw erroEstantes;
      if (erroColunas) throw erroColunas;
      if (erroPastas) throw erroPastas;

      return res.status(200).json({
        estantes: estantes || [],
        colunas: colunas || [],
        pastas: pastas || [],
      });
    }

    if (!podeGerenciar(role)) {
      return respostaErro(
        res,
        403,
        "Somente o Master ou P1 pode gerenciar a estrutura física do arquivo.",
      );
    }

    if (req.method === "POST") {
      const tipo = texto(req.body?.tipo);
      const nome = texto(req.body?.nome);
      const parentId = texto(req.body?.parent_id);

      if (!["estante", "coluna", "pasta"].includes(tipo) || !nome) {
        return respostaErro(
          res,
          400,
          "Informe o tipo e o nome do item do arquivo.",
        );
      }

      if (tipo === "estante") {
        const { data, error } = await db
          .from("arquivos_estantes")
          .insert({ nome, ativo: true })
          .select("*")
          .single();

        if (error) {
          if (error.code === "23505") {
            return respostaErro(
              res,
              409,
              "Já existe uma estante com esse nome.",
            );
          }

          throw error;
        }

        return res.status(201).json({ estante: data });
      }

      if (!parentId) {
        return respostaErro(res, 400, "Informe a localização pai do item.");
      }

      if (tipo === "coluna") {
        const { data: estante } = await db
          .from("arquivos_estantes")
          .select("id")
          .eq("id", parentId)
          .maybeSingle();

        if (!estante) {
          return respostaErro(res, 404, "Estante não encontrada.");
        }

        const { data, error } = await db
          .from("arquivos_colunas")
          .insert({
            estante_id: parentId,
            nome,
            ativo: true,
          })
          .select("*")
          .single();

        if (error) {
          if (error.code === "23505") {
            return respostaErro(
              res,
              409,
              "Já existe uma coluna com esse nome nessa estante.",
            );
          }

          throw error;
        }

        return res.status(201).json({ coluna: data });
      }

      const { data: coluna } = await db
        .from("arquivos_colunas")
        .select("id")
        .eq("id", parentId)
        .maybeSingle();

      if (!coluna) {
        return respostaErro(res, 404, "Coluna não encontrada.");
      }

      const { data, error } = await db
        .from("arquivos_pastas")
        .insert({
          coluna_id: parentId,
          nome,
          ativo: true,
        })
        .select("*")
        .single();

      if (error) {
        if (error.code === "23505") {
          return respostaErro(
            res,
            409,
            "Já existe uma pasta com esse nome nessa coluna.",
          );
        }

        throw error;
      }

      return res.status(201).json({ pasta: data });
    }

    if (req.method === "PATCH") {
      const tipo = texto(req.body?.tipo);
      const id = texto(req.body?.id);
      const nome = texto(req.body?.nome);
      const ativo =
        typeof req.body?.ativo === "boolean" ? req.body.ativo : undefined;

      if (!id || !["estante", "coluna", "pasta"].includes(tipo)) {
        return respostaErro(res, 400, "Informe o item que será alterado.");
      }

      if (nome === "" && ativo === undefined) {
        return respostaErro(res, 400, "Informe uma alteração válida.");
      }

      const tabela =
        tipo === "estante"
          ? "arquivos_estantes"
          : tipo === "coluna"
            ? "arquivos_colunas"
            : "arquivos_pastas";

      const atualizacao = {
        atualizado_em: new Date().toISOString(),
      };

      if (nome) atualizacao.nome = nome;
      if (ativo !== undefined) atualizacao.ativo = ativo;

      const { data, error } = await db
        .from(tabela)
        .update(atualizacao)
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        if (error.code === "23505") {
          return respostaErro(
            res,
            409,
            "Já existe outro item com esse nome no mesmo nível.",
          );
        }

        throw error;
      }

      return res.status(200).json({ item: data });
    }

    if (req.method === "DELETE") {
      const tipo = texto(req.body?.tipo);
      const id = texto(req.body?.id);

      if (!id || !["estante", "coluna", "pasta"].includes(tipo)) {
        return respostaErro(res, 400, "Informe o item que será excluído.");
      }

      if (tipo === "estante") {
        const { count, error } = await db
          .from("arquivos_colunas")
          .select("id", { count: "exact", head: true })
          .eq("estante_id", id);

        if (error) throw error;

        if ((count || 0) > 0) {
          return respostaErro(
            res,
            409,
            "Não é possível excluir esta estante porque existem colunas vinculadas a ela.",
          );
        }

        const { error: erroDelete } = await db
          .from("arquivos_estantes")
          .delete()
          .eq("id", id);

        if (erroDelete) throw erroDelete;

        return res.status(200).json({ ok: true });
      }

      if (tipo === "coluna") {
        const { count, error } = await db
          .from("arquivos_pastas")
          .select("id", { count: "exact", head: true })
          .eq("coluna_id", id);

        if (error) throw error;

        if ((count || 0) > 0) {
          return respostaErro(
            res,
            409,
            "Não é possível excluir esta coluna porque existem pastas vinculadas a ela.",
          );
        }

        const { error: erroDelete } = await db
          .from("arquivos_colunas")
          .delete()
          .eq("id", id);

        if (erroDelete) throw erroDelete;

        return res.status(200).json({ ok: true });
      }

      const { count, error } = await db
        .from("oficios")
        .select("id", { count: "exact", head: true })
        .eq("pasta_id", id);

      if (error) throw error;

      if ((count || 0) > 0) {
        return respostaErro(
          res,
          409,
          "Não é possível excluir esta pasta porque existem Ofícios arquivados nela.",
        );
      }

      const { error: erroDelete } = await db
        .from("arquivos_pastas")
        .delete()
        .eq("id", id);

      if (erroDelete) throw erroDelete;

      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");

    return respostaErro(res, 405, "Método não permitido.");
  } catch (error) {
    console.error("Erro na API do arquivo de Ofícios:", error);

    return respostaErro(
      res,
      500,
      "Não foi possível gerenciar a estrutura física do arquivo.",
    );
  }
}
