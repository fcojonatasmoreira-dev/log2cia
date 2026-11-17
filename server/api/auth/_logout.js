import { createClient } from "@supabase/supabase-js";
import { lerSessao, limparCookie } from "./_session.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método não permitido." });
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

      const atualizarVersao = async (tabela) => {
        const { data, error } = await db
          .from(tabela)
          .select("id, auth_version")
          .eq("id", sessao.sub)
          .maybeSingle();

        if (error) throw error;
        if (!data) return false;

        const versao = Number.isInteger(data.auth_version)
          ? data.auth_version
          : 0;

        if (versao !== sessao.ver) return true;

        const { data: atualizado, error: erroAtualizacao } = await db
          .from(tabela)
          .update({ auth_version: versao + 1 })
          .eq("id", sessao.sub)
          .eq("auth_version", versao)
          .select("id")
          .maybeSingle();

        if (erroAtualizacao) throw erroAtualizacao;
        return Boolean(atualizado);
      };

      let encontrado = await atualizarVersao("policiais");

      if (!encontrado) {
        encontrado = await atualizarVersao("drso_policiais_externos");
      }

      // Mesmo se a conta já tiver sido revogada, encerra o cookie local.
      limparCookie(res);
      return res.status(200).json({ ok: true });
    }

    limparCookie(res);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Falha ao encerrar sessão:", error.message);
    limparCookie(res);
    return res.status(500).json({
      error: "Não foi possível encerrar a sessão.",
    });
  }
}
