export async function imagemDecodificada(imagem) {
  if (!imagem || !imagem.complete || imagem.naturalWidth <= 0) return false;

  if (typeof imagem.decode === "function") {
    try {
      await imagem.decode();
    } catch {
      return false;
    }
  }

  return imagem.naturalWidth > 0;
}
