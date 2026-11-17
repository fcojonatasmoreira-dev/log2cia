import { randomUUID } from "node:crypto";

export const BUCKET_DOCUMENTOS = "documentos-seguranca";
export const VALIDADE_URL_ASSINADA_SEGUNDOS = 3600;

const MIMES_PERMITIDOS = new Map([
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

// A imagem é enviada como data URI JSON pelo gateway Vercel (limite de corpo
// da Function: 4,5 MB). 4 milhões de caracteres base64 deixam margem para o
// prefixo e o restante do JSON, limitando a imagem decodificada a cerca de 3 MB.
const LIMITE_BASE64_CARACTERES = 4_000_000;
const TAMANHO_MAXIMO_BYTES = 3_000_000;

// Extrai o conteúdo base64 de um data URI e valida tipo e tamanho.
export function extrairImagemBase64(valor) {
  if (typeof valor !== "string") return null;
  const partes = valor.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/);
  if (!partes) return null;
  const mime = partes[1].toLowerCase();
  const base64 = partes[2];
  if (!base64 || base64.length > LIMITE_BASE64_CARACTERES) return null;
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > TAMANHO_MAXIMO_BYTES) return null;
  return { mime, base64, bytes };
}

export function caminhoDeImagemValido(caminho) {
  return typeof caminho === "string" && /^equipamentos\/[a-z0-9_-]+\/[A-Za-z0-9-]+\.(jpg|png|webp)$/.test(caminho);
}

// Grava a imagem no bucket privado e devolve o caminho interno e a URL assinada.
export async function enviarImagemPrivada(db, { prefixo, conteudo }) {
  const imagem = extrairImagemBase64(conteudo);
  if (!imagem) return { erro: "Imagem inválida ou acima do tamanho limite." };
  const extensao = MIMES_PERMITIDOS.get(imagem.mime);
  if (!extensao) return { erro: "Formato de imagem não permitido." };
  const path = `equipamentos/${prefixo}/${randomUUID()}.${extensao}`;
  const { error } = await db.storage
    .from(BUCKET_DOCUMENTOS)
    .upload(path, imagem.bytes, { contentType: imagem.mime, upsert: false });
  if (error) throw error;
  const { data, error: erroAssinatura } = await db.storage
    .from(BUCKET_DOCUMENTOS)
    .createSignedUrl(path, VALIDADE_URL_ASSINADA_SEGUNDOS);
  if (erroAssinatura) throw erroAssinatura;
  return { path, url: data?.signedUrl || null };
}

// Assina caminhos de imagem já gravados no bucket privado.
export async function assinarCaminhos(db, caminhos) {
  const unicos = [...new Set((caminhos || []).filter((caminho) => caminhoDeImagemValido(caminho)))];
  if (!unicos.length) return new Map();
  const { data, error } = await db.storage
    .from(BUCKET_DOCUMENTOS)
    .createSignedUrls(unicos, VALIDADE_URL_ASSINADA_SEGUNDOS);
  if (error) throw error;
  return new Map((data || []).map((item) => [item.path, item.signedUrl]));
}
