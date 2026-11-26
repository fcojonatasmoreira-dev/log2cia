export const THEME_STORAGE_KEY = "log2cia_theme";
export const TEMAS = Object.freeze({ CLARO: "claro", ESCURO: "escuro" });

export function normalizarTema(valor) {
  return valor === TEMAS.ESCURO ? TEMAS.ESCURO : TEMAS.CLARO;
}

export function obterTemaSalvo(storage) {
  try {
    const armazenamento = storage || globalThis.localStorage;
    return normalizarTema(armazenamento?.getItem(THEME_STORAGE_KEY));
  } catch {
    return TEMAS.CLARO;
  }
}

export function aplicarTema(valor, root = globalThis.document?.documentElement, storage) {
  const tema = normalizarTema(valor);
  if (root) {
    root.dataset.theme = tema;
    root.style.colorScheme = tema === TEMAS.ESCURO ? "dark" : "light";
  }
  try {
    const armazenamento = storage || globalThis.localStorage;
    armazenamento?.setItem(THEME_STORAGE_KEY, tema);
  } catch {
    // A aplicação do tema continua válida mesmo quando o navegador bloqueia o armazenamento local.
  }
  return tema;
}
