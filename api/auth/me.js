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
      return res.status(401).json({
        error: "Usuário não encontrado.",
      });
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
