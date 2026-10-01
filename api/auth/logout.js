import { createClient } from "@supabase/supabase-js";
import { lerSessao, limparCookie } from "./_session.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método não permitido.",
    });
  }

  try {
    const sessao = lerSessao(req);

    if (sessao) {
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

      const { data: policial, error: erroConsulta } = await db
        .from("policiais")
        .select("id, auth_version")
        .eq("id", sessao.sub)
        .maybeSingle();

      if (erroConsulta) throw erroConsulta;

      if (policial && policial.auth_version === sessao.ver) {
        const { error } = await db
          .from("policiais")
          .update({
            auth_version: policial.auth_version + 1,
          })
          .eq("id", policial.id)
          .eq("auth_version", sessao.ver);

        if (error) throw error;
      }
    }

    limparCookie(res);

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Falha ao encerrar sessão:", error.message);

    return res.status(500).json({
      error: "Não foi possível encerrar a sessão.",
    });
  }
}
