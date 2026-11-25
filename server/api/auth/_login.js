import { createClient } from "@supabase/supabase-js";
import { criarSessao, definirCookie } from "./_session.js";
import { hashSenha, pareceHashSenha, verificarSenha } from "./_password.js";
import { registrarEventoCredencial } from "../_credentialAudit.js";

const supabaseAdmin = () => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      "Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente do servidor.",
    );
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Método não permitido." });
  try {
    const matricula = String(req.body?.matricula || "").trim();
    const senha = String(req.body?.senha || "");
    const manterConectado = req.body?.manterConectado === true;
    if (!matricula || !senha || matricula.length > 80 || senha.length > 256) {
      return res
        .status(400)
        .json({ error: "Informe matrícula e senha válidas." });
    }
    const db = supabaseAdmin();
    const { data: policial, error } = await db
      .from("policiais")
      .select("*")
      .eq("matricula", matricula)
      .maybeSingle();
    if (error) throw error;
    if (!policial) {
      // Conta externa criada pelo escalante: acesso exclusivo ao voluntariado DRSO.
      const { data: externo, error: erroExterno } = await db
        .from("drso_policiais_externos")
        .select("*")
        .eq("matricula", matricula)
        .eq("ativo", true)
        .maybeSingle();
      if (erroExterno && erroExterno.code !== "42P01") throw erroExterno;
      if (externo?.conta_suspensa === true) {
        return res.status(401).json({ error: "Matrícula ou senha incorreta." });
      }
      const senhaExternaArmazenada = typeof externo?.senha === "string" ? externo.senha : "";
      const senhaExternaTemValor = senhaExternaArmazenada.trim().length > 0;
      const senhaExternaEhHash = pareceHashSenha(senhaExternaArmazenada);
      const senhaExternaValida = externo && senhaExternaTemValor && (senhaExternaEhHash
        ? await verificarSenha(senha, senhaExternaArmazenada)
        : senha === senhaExternaArmazenada);
      if (!externo || externo.credencial_provisionada === false || !senhaExternaValida)
        return res.status(401).json({ error: "Matrícula ou senha incorreta." });
      if (!senhaExternaEhHash) {
        let migracao = db.from("drso_policiais_externos")
          .update({ senha: await hashSenha(senhaExternaArmazenada) })
          .eq("id", externo.id)
          .eq("senha", externo.senha);
        migracao = Number.isInteger(externo.auth_version)
          ? migracao.eq("auth_version", externo.auth_version)
          : migracao.is("auth_version", null);
        const { data: atualizada, error: erroMigracao } = await migracao.select("id").maybeSingle();
        if (erroMigracao) throw erroMigracao;
        if (!atualizada) return res.status(409).json({ error: "Os dados de autenticação foram alterados. Tente entrar novamente." });
      }
      const usuarioExterno = {
        id: externo.id,
        nome_completo: externo.nome_completo,
        nome_guerra: externo.nome_guerra,
        matricula: externo.matricula,
        numeral: externo.numeral,
        posto_graduacao: externo.posto_graduacao,
        unidade: externo.unidade_origem,
        unidade_origem: externo.unidade_origem,
        role: "drso_externo",
        tipo_acesso: "drso_externo",
        drso_tipo: externo.tipo,
        auth_version: externo.auth_version,
        primeiro_acesso: externo.primeiro_acesso === true,
      };
      const tokenExterno = criarSessao(usuarioExterno, manterConectado);
      await registrarEventoCredencial(db, { origem: "drso_policiais_externos", usuarioId: externo.id, evento: "login" }).catch(() => {});
      definirCookie(res, tokenExterno, manterConectado);
      return res.status(200).json({ user: usuarioExterno });
    }

    if (policial.conta_suspensa === true) {
      return res.status(401).json({ error: "Matrícula ou senha incorreta." });
    }

    const senhaArmazenada =
      typeof policial.senha === "string" ? policial.senha : "";
    if (policial.credencial_provisionada === false) {
      return res.status(401).json({ error: "Matrícula ou senha incorreta." });
    }
    const senhaLegada = senhaArmazenada.trim();
    if (!senhaLegada) {
      return res.status(401).json({ error: "Matrícula ou senha incorreta." });
    }
    const senhaValida = pareceHashSenha(senhaArmazenada)
      ? await verificarSenha(senha, senhaArmazenada)
      : senha === senhaLegada;
    if (!senhaValida)
      return res.status(401).json({ error: "Matrícula ou senha incorreta." });

    // Migra para hash somente uma senha legada efetivamente armazenada.
    if (!pareceHashSenha(senhaArmazenada)) {
      const versaoOriginal = Number.isInteger(policial.auth_version)
        ? policial.auth_version
        : null;
      const atualizacao = {
        senha: await hashSenha(senhaLegada),
        ...(versaoOriginal === null ? { auth_version: 0 } : {}),
      };
      let queryAtualizacao = db
        .from("policiais")
        .update(atualizacao)
        .eq("id", policial.id)
        .eq("senha", policial.senha);
      queryAtualizacao = versaoOriginal === null
        ? queryAtualizacao.is("auth_version", null)
        : queryAtualizacao.eq("auth_version", versaoOriginal);
      const { data: migracao, error: atualizacaoError } = await queryAtualizacao
        .select("auth_version, primeiro_acesso")
        .maybeSingle();
      if (atualizacaoError) throw atualizacaoError;
      if (!migracao) {
        return res.status(409).json({ error: "Os dados de autenticação foram alterados. Tente entrar novamente." });
      }
      policial.auth_version = migracao.auth_version;
      policial.primeiro_acesso = migracao.primeiro_acesso;
    }

    const usuario = { ...policial };
    delete usuario.senha;
    delete usuario.credencial_provisionada;
    const token = criarSessao(usuario, manterConectado);
    await registrarEventoCredencial(db, { origem: "policiais", usuarioId: policial.id, evento: "login" }).catch(() => {});
    definirCookie(res, token, manterConectado);
    return res.status(200).json({ user: usuario });
  } catch (error) {
    console.error("Falha no login:", error.message);
    return res
      .status(500)
      .json({
        error:
          "Não foi possível autenticar. Verifique a configuração do servidor.",
      });
  }
}
