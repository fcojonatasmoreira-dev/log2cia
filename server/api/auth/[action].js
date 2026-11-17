const handlers = {
  login: () => import("./_login.js"),
  logout: () => import("./_logout.js"),
  me: () => import("./_me.js"),
  "change-password": () => import("./_change-password.js"),
};

export default async function handler(req, res) {
  const action = String(req.query?.action || "");
  const loadHandler = handlers[action];

  if (!loadHandler) {
    return res.status(404).json({
      error: "Rota de autenticação não encontrada.",
    });
  }

  const module = await loadHandler();
  return module.default(req, res);
}
