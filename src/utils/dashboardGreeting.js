export function saudacaoOficial(usuario, agora = new Date()) {
  if (String(usuario?.role || "").trim().toLowerCase() !== "oficial") return "";

  const hora = agora.getHours();
  const periodo = hora >= 5 && hora < 12
    ? "Bom dia"
    : hora >= 12 && hora < 18
      ? "Boa tarde"
      : "Boa noite";

  return `${periodo}, senhor comandante! 🫡`;
}
