import { createClient } from "@supabase/supabase-js";
import {
  criarSessao,
  definirCookie,
  lerSessao,
  limparCookie,
} from "./_session.js";
import { hashSenha, pareceHashSenha, verificarSenha } from "./_password.js";

const supabaseAdmin = () => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente do servidor.",
    );
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

export default async function handler(req, res) {
  const action = req.query?.action;

  switch (action) {
    case "login":
      return login(req, res);

    case "logout":
      return logout(req, res);

    case "me":
      return me(req, res);

    case "change-password":
      return changePassword(req, res);

    default:
      return res.status(404).json({
        error: "Rota de autenticação não encontrada.",
      });
  }
}

async function login(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método não permitido.",
    });
  }

  try {
    const matricula = String(req.body?.matricula || "").trim();
    const senha = String(req.body?.senha || "");
    const manterConectado = req.body?.manterConectado === true;

    if (!matricula || !senha || matricula.length > 80 || senha.length > 256) {
      return res.status(400).json({
        error: "Informe matrícula e senha válidas.",
      });
    }

    const db = supabaseAdmin();

    const { data: policial, error } = await db
      .from("policiais")
      .select("*")
      .eq("matricula", matricula)
      .maybeSingle();

    if (error) throw error;

    if (!policial) {
      return res.status(401).json({
        error: "Matrícula ou senha incorreta.",
      });
    }

    const senhaArmazenada =
      typeof policial.senha === "string" ? policial.senha : "";

    const usaSenhaPadrao = !senhaArmazenada.trim();

    const senhaLegada = usaSenhaPadrao
      ? obterSenhaPadrao(policial)
      : senhaArmazenada.trim();

    const senhaValida = pareceHashSenha(senhaArmazenada)
      ? await verificarSenha(senha, senhaArmazenada)
      : senha === senhaLegada;

    if (!senhaValida) {
      return res.status(401).json({
        error: "Matrícula ou senha incorreta.",
      });
    }

    if (!pareceHashSenha(senhaArmazenada)) {
      const { error: atualizacaoError } = await db
        .from("policiais")
        .update({
          senha: await hashSenha(senhaLegada),
          ...(usaSenhaPadrao ? { primeiro_acesso: true } : {}),
        })
        .eq("id", policial.id);

      if (atualizacaoError) throw atualizacaoError;

      if (usaSenhaPadrao) {
        policial.primeiro_acesso = true;
      }
    }

    const usuario = { ...policial };
    delete usuario.senha;

    const token = criarSessao(usuario, manterConectado);

    definirCookie(res, token, manterConectado);

    return res.status(200).json({
      user: usuario,
    });
  } catch (error) {
    console.error("Falha no login:", error.message);

    return res.status(500).json({
      error:
        "Não foi possível autenticar. Verifique a configuração do servidor.",
    });
  }
}

async function logout(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método não permitido.",
    });
  }

  try {
    const sessao = lerSessao(req);

    if (sessao) {
      const db = supabaseAdmin();

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

    return res.status(200).json({
      ok: true,
    });
  } catch (error) {
    console.error("Falha ao encerrar sessão:", error.message);

    return res.status(500).json({
      error: "Não foi possível encerrar a sessão.",
    });
  }
}

async function me(req, res) {
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

    const db = supabaseAdmin();

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

    return res.status(200).json({
      user,
    });
  } catch (error) {
    console.error("Falha ao validar sessão:", error.message);

    return res.status(500).json({
      error: "Não foi possível validar a sessão.",
    });
  }
}

async function changePassword(req, res) {
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

    const db = supabaseAdmin();

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

    if (!data || data.length === 0) {
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

function senhaForte(senha) {
  return (
    typeof senha === "string" &&
    senha.length >= 8 &&
    /[A-Z]/.test(senha) &&
    /[0-9]/.test(senha) &&
    /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(senha)
  );
}

function obterSenhaPadrao(policial) {
  const numeral = String(policial?.numeral || "").trim();
  const matricula = String(policial?.matricula || "").trim();

  if (numeral && numeral !== "—") {
    return numeral;
  }

  return matricula.length >= 4 ? matricula.slice(-4) : matricula;
}
