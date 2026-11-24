const PREFIXO_ROTA_INTERNA = "__dispatch";

const carregadores = {
  "auth/[action]": () => import("./auth/[action].js"),
  arquivo: () => import("./arquivo.js"),
  "banco-horas/index": () => import("./banco-horas/index.js"),
  cautelas: () => import("./cautelas.js"),
  credenciais: () => import("./credenciais.js"),
  dashboard: () => import("./dashboard.js"),
  "drso/index": () => import("./drso/index.js"),
  "equipamentos/index": () => import("./equipamentos/index.js"),
  oficios: () => import("./oficios.js"),
  "notificacoes/index": () => import("./notificacoes/index.js"),
  "permutas/index": () => import("./permutas/index.js"),
  "policiais/index": () => import("./policiais/index.js"),
  "policiais/[id]": () => import("./policiais/[id].js"),
  "policiais/[id]/[action]": () => import("./policiais/[id]/[action].js"),
  "radios/index": () => import("./radios/index.js"),
  "viaturas/index": () => import("./viaturas/index.js"),
};

function identificarRota(caminho) {
  const segmentos = String(caminho || "")
    .split("/")
    .filter(Boolean);

  if (segmentos.length === 2 && segmentos[0] === "auth") {
    return { chave: "auth/[action]", parametros: { action: segmentos[1] } };
  }

  if (segmentos[0] === "policiais") {
    if (segmentos.length === 1) return { chave: "policiais/index", parametros: {} };
    if (segmentos.length === 2) {
      return { chave: "policiais/[id]", parametros: { id: segmentos[1] } };
    }
    if (segmentos.length === 3) {
      return {
        chave: "policiais/[id]/[action]",
        parametros: { id: segmentos[1], action: segmentos[2] },
      };
    }
    return null;
  }

  if (segmentos.length !== 1) return null;
  const [nome] = segmentos;
  const rotasSimples = {
    arquivo: "arquivo",
    "banco-horas": "banco-horas/index",
    cautelas: "cautelas",
    credenciais: "credenciais",
    dashboard: "dashboard",
    drso: "drso/index",
    equipamentos: "equipamentos/index",
    oficios: "oficios",
    notificacoes: "notificacoes/index",
    permutas: "permutas/index",
    radios: "radios/index",
    viaturas: "viaturas/index",
  };
  const chave = rotasSimples[nome];
  return chave ? { chave, parametros: {} } : null;
}

export async function despacharApi(req, res, opcoes = {}) {
  const queryOriginal = req.query && typeof req.query === "object" ? req.query : {};
  const caminho = queryOriginal[PREFIXO_ROTA_INTERNA];
  const rota = identificarRota(Array.isArray(caminho) ? caminho[0] : caminho);
  if (!rota) return res.status(404).json({ error: "Rota da API não encontrada." });

  const carregar = opcoes.carregarHandler || carregadores[rota.chave];
  if (!carregar) return res.status(500).json({ error: "Handler da API não configurado." });
  const modulo = await carregar();
  if (typeof modulo?.default !== "function") {
    return res.status(500).json({ error: "Handler da API inválido." });
  }

  const query = { ...queryOriginal };
  delete query[PREFIXO_ROTA_INTERNA];
  Object.assign(query, rota.parametros);
  const descritorQuery = Object.getOwnPropertyDescriptor(req, "query");
  req.query = query;
  try {
    return await modulo.default(req, res);
  } finally {
    if (descritorQuery) Object.defineProperty(req, "query", descritorQuery);
    else delete req.query;
  }
}

export { identificarRota };
