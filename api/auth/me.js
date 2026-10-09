import { createClient } from "@supabase/supabase-js";
import { lerSessao } from "./_session.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Método não permitido.",
    });
  }

  try {
    const sessao = lerSessao(req);

    if (!sessao) {
      return res.status(401).json({
        error: "Sessão inválida ou expirada.",
      });
    }

    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;

    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error("Configuração do servidor ausente.");
    }

    const db = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data, error } = await db
      .from("policiais")
      .select("*")
      .eq("id", sessao.sub)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      const { data: externo, error: erroExterno } = await db
        .from("drso_policiais_externos")
        .select("id,nome_completo,nome_guerra,matricula,numeral,posto_graduacao,unidade_origem,tipo,auth_version,ativo,primeiro_acesso")
        .eq("id", sessao.sub)
        .eq("ativo", true)
        .maybeSingle();
      if (erroExterno && erroExterno.code !== "42P01") throw erroExterno;
      if (!externo || externo.auth_version !== sessao.ver) {
        return res.status(401).json({ error: "Conta externa não encontrada, desativada ou sessão revogada." });
      }
      return res.status(200).json({ user: {
        id: externo.id, nome_completo: externo.nome_completo, nome_guerra: externo.nome_guerra,
        matricula: externo.matricula, numeral: externo.numeral, posto_graduacao: externo.posto_graduacao,
        unidade: externo.unidade_origem, unidade_origem: externo.unidade_origem,
        role: "drso_externo", tipo_acesso: "drso_externo", drso_tipo: externo.tipo, primeiro_acesso: externo.primeiro_acesso === true,
      }});
    }

    if (
      !Number.isInteger(data.auth_version) ||
      data.auth_version !== sessao.ver
    ) {
      return res.status(401).json({
        error: "Sessão revogada. Faça login novamente.",
      });
    }

    const user = { ...data };
    delete user.senha;
    delete user.auth_version;

    return res.status(200).json({ user });
  } catch (error) {
    console.error("Falha ao validar sessão:", error.message);

    return res.status(500).json({
      error: "Não foi possível validar a sessão.",
    });
  }
}
