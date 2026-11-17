import test from "node:test";
import assert from "node:assert/strict";
import { extrairImagemBase64 } from "../server/api/_armazenamento.js";
import handler from "../server/api/equipamentos/index.js";
import { criarSessao } from "../server/api/auth/_session.js";

function resposta() {
  return {
    statusCode: 200,
    status(codigo) { this.statusCode = codigo; return this; },
    json(body) { this.body = body; return this; },
  };
}

const IMAGEM_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("parser rejeita imagem acima do limite seguro do corpo do gateway", () => {
  const excedente = `data:image/png;base64,${"A".repeat(4_000_001)}`;
  assert.equal(extrairImagemBase64(excedente), null);
});

function montarAmbiente({ role = "armeiro" } = {}) {
  const estado = { uploads: [], assinatura: [] };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const metodo = (init.method || "GET").toUpperCase();
    const corpo = init.body && typeof init.body === "string" ? JSON.parse(init.body) : null;

    if (url.pathname === "/rest/v1/policiais") {
      return Response.json({ id: "policial-1", auth_version: 0, role, matricula: "123" });
    }
    if (url.pathname === "/storage/v1/object/sign/documentos-seguranca") {
      const caminhos = (corpo && corpo.paths) || [];
      for (const caminho of caminhos) estado.assinatura.push(caminho);
      return Response.json(
        caminhos.map((caminho) => ({
          path: caminho,
          signedURL: `/object/sign/documentos-seguranca/${caminho}?token=abc`,
          error: null,
        })),
      );
    }
    if (url.pathname.startsWith("/storage/v1/object/") && url.pathname.includes("/sign/")) {
      const caminho = decodeURIComponent(url.pathname.split("/object/sign/documentos-seguranca/")[1] || "");
      estado.assinatura.push(caminho);
      return Response.json({ signedURL: `/object/sign/documentos-seguranca/${caminho}?token=abc` });
    }
    if (url.pathname.startsWith("/storage/v1/object/")) {
      estado.uploads.push({ caminho: decodeURIComponent(url.pathname.split("/object/documentos-seguranca/")[1] || "") });
      return Response.json({ Key: "equipamentos/arma/x.jpg", Path: "equipamentos/arma/x.jpg" });
    }
    if (url.pathname === "/rest/v1/equipamentos") {
      if (metodo === "GET") {
        return Response.json([
          {
            id: "equipamento-1",
            tipo: "armamento",
            status: "disponivel",
            detalhes: {
              localizacao_atual: "Estoque da Reserva",
              foto_arma_path: "equipamentos/arma/1234.jpg",
            },
          },
        ]);
      }
      return Response.json([]);
    }
    return Response.json({ message: `Rota mock inesperada: ${url.pathname}` }, { status: 404 });
  };
  return estado;
}

test("upload de imagem do inventário passa pelo servidor e devolve caminho interno e URL assinada", async () => {
  process.env.SESSION_SECRET = "segredo-de-teste-com-comprimento-superior-a-32-caracteres";
  process.env.SUPABASE_URL = "https://supabase.mock.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-only";
  const estado = montarAmbiente();
  const cookie = `log2cia_session=${criarSessao({ id: "policial-1", auth_version: 0 })}`;

  const res = resposta();
  await handler(
    {
      method: "POST",
      headers: { cookie },
      query: { acao: "imagem" },
      body: { prefixo: "arma", conteudo: IMAGEM_BASE64 },
    },
    res,
  );

  assert.equal(res.statusCode, 201);
  assert.match(res.body.path, /^equipamentos\/arma\/[A-Za-z0-9-]+\.png$/);
  assert.match(res.body.url, /token=/);
  assert.equal(estado.uploads.length, 1);
  assert.equal(estado.uploads[0].caminho, res.body.path);
});

test("upload de imagem recusa prefixo desconhecido", async () => {
  process.env.SESSION_SECRET = "segredo-de-teste-com-comprimento-superior-a-32-caracteres";
  process.env.SUPABASE_URL = "https://supabase.mock.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-only";
  montarAmbiente();
  const cookie = `log2cia_session=${criarSessao({ id: "policial-1", auth_version: 0 })}`;

  const res = resposta();
  await handler(
    {
      method: "POST",
      headers: { cookie },
      query: { acao: "imagem" },
      body: { prefixo: "documentos_confiáveis", conteudo: IMAGEM_BASE64 },
    },
    res,
  );

  assert.equal(res.statusCode, 400);
});

test("leitura do inventário devolve URL assinada para o caminho interno gravado", async () => {
  process.env.SESSION_SECRET = "segredo-de-teste-com-comprimento-superior-a-32-caracteres";
  process.env.SUPABASE_URL = "https://supabase.mock.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-only";
  const estado = montarAmbiente();
  const cookie = `log2cia_session=${criarSessao({ id: "policial-1", auth_version: 0 })}`;

  const res = resposta();
  await handler({ method: "GET", headers: { cookie }, query: {} }, res);

  assert.equal(res.statusCode, 200);
  const [equipamento] = res.body.equipamentos;
  assert.equal(equipamento.detalhes.foto_arma_path, "equipamentos/arma/1234.jpg");
  assert.match(equipamento.detalhes.foto_arma_url, /token=abc/);
  assert.deepEqual(estado.assinatura, ["equipamentos/arma/1234.jpg"]);
});
