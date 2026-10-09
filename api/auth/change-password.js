import { createClient } from "@supabase/supabase-js";
import { lerSessao } from "./_session.js";
import { hashSenha } from "./_password.js";

function senhaForte(senha) {
  return (
    typeof senha === "string" &&
    senha.length >= 8 &&
    /[A-Z]/.test(senha) &&
    /[0-9]/.test(senha) &&
    /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(senha)
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Método não permitido.",
    });
  }

  try {
    const sessao = lerSessao(req);

    if (!sessao?.sub || !Number.isInteger(sessao.ver) || sessao.ver < 0) {
      return res.status(401).json({
        error: "Sessão inválida ou expirada.",
      });
    }

    const novaSenha = req.body?.novaSenha;

    if (!senhaForte(novaSenha)) {
      return res.status(400).json({
        error: "A senha não atende aos critérios de segurança.",
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

    const senhaHash = await hashSenha(novaSenha.trim());

    const { data, error } = await db
      .from("policiais")
      .update({
        senha: senhaHash,
        primeiro_acesso: false,
        auth_version: sessao.ver + 1,
      })
      .eq("id", sessao.sub)
      .eq("auth_version", sessao.ver)
      .select("id");

    if (error) throw error;

    let alterada = Boolean(data && data.length > 0);
    if (!alterada) {
      // Conta externa DRSO: usa o mesmo formulário e os mesmos critérios de senha.
      const { data: externa, error: erroExterno } = await db
        .from("drso_policiais_externos")
        .update({
          senha: senhaHash,
          primeiro_acesso: false,
          auth_version: sessao.ver + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessao.sub)
        .eq("auth_version", sessao.ver)
        .eq("ativo", true)
        .select("id");
      if (erroExterno) throw erroExterno;
      alterada = Boolean(externa && externa.length > 0);
    }

    if (!alterada) {
      return res.status(401).json({
        error: "Sessão inválida ou expirada. Faça login novamente.",
      });
    }

    return res.status(200).json({
      ok: true,
      message: "Senha alterada. Faça login novamente.",
    });
  } catch (error) {
    console.error("Erro ao alterar senha:", error.message);

    return res.status(500).json({
      error: "Não foi possível atualizar a senha.",
    });
  }
}
