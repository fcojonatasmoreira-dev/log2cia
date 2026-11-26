const roleOf = (usuario) => String(usuario?.role || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function modulosDashboard(usuario) {
  const role = roleOf(usuario);
  const master = role === "master" || usuario?.is_master === true;
  const policial = usuario?.modo_acesso === "policial";
  const isOficial = role === "oficial";
  const isP1 = role === "p1" || role === "p1_escalante_servico_ordinario";
  const isP4 = role === "p4";
  const isArmeiro = role === "armeiro";
  const isPermanente = role === "permanente" || role === "permanente da guarda";
  const podeLivro = master || isP1 || isPermanente || isArmeiro || isOficial;
  const podePermutas = master || role === "policial" || isP1 || isOficial;
  const podeArquivo = master || isP1;

  const todos = [
    { titulo: "Dashboard", descricao: "Visão geral e alertas", caminho: "/", icone: "dashboard", cor: "blue", mostrar: true },
    { titulo: "Livro Digital", descricao: "Registros da unidade", caminho: "/livro-permanencia", icone: "book", cor: "purple", mostrar: !policial && podeLivro },
    { titulo: "Áreas de Operação", descricao: "Setores e áreas", caminho: "/areas-operacao", icone: "map", cor: "green", mostrar: !policial && !["policial", "armeiro"].includes(role) },
    { titulo: "Escalas DRSO", descricao: "Escalas e voluntariado", caminho: "/drso", icone: "calendar", cor: "orange", mostrar: true },
    { titulo: "Banco de Horas", descricao: "Controle e solicitações", caminho: "/banco-horas", icone: "clock", cor: "cyan", mostrar: policial || master || role === "p1" || isOficial },
    { titulo: "Permutas", descricao: "Trocas de serviço", caminho: "/permutas", icone: "swap", cor: "pink", mostrar: podePermutas },
    { titulo: "Acervo / Inventário", descricao: "Bens e materiais", caminho: "/inventario", icone: "inventory", cor: "amber", mostrar: !policial && (master || isP4 || isArmeiro || isOficial) },
    { titulo: "Viaturas", descricao: "Gestão da frota", caminho: "/viaturas", icone: "car", cor: "blue", mostrar: !policial && (master || isP4 || isOficial) },
    { titulo: "Check-in Viaturas", descricao: "Entradas e saídas", caminho: "/checkin-viaturas", icone: "carCheck", cor: "blue", mostrar: policial || role === "policial" || master || isP4 || isOficial },
    { titulo: "Policiais", descricao: "Cadastro e efetivo", caminho: "/policiais", icone: "users", cor: "blue", mostrar: !policial && (master || isP4 || isArmeiro || isOficial) },
    { titulo: "Ofícios", descricao: "Internos e externos", caminho: "/oficios", icone: "file", cor: "sky", mostrar: !policial && (master || isP4 || isP1 || isOficial) },
    { titulo: "Eventos", descricao: "Solicitações e apoio", caminho: "/eventos", icone: "event", cor: "purple", mostrar: !policial && (master || isP1 || isOficial) },
    { titulo: "Gerenciar Arquivo", descricao: "Documentos da unidade", caminho: "/gerenciamento-arquivo", icone: "archive", cor: "blue", mostrar: !policial && podeArquivo },
  ];
  return todos.filter((item) => item.mostrar).map(({ mostrar: _mostrar, ...item }) => item);
}

export function podeVerPainelMaster(usuario) {
  return usuario?.modo_acesso !== "policial" && (roleOf(usuario) === "master" || usuario?.is_master === true);
}

export function podeVerAlertasDashboard(usuario) {
  return usuario?.is_master === true || ["policial", "p1", "p1_escalante_servico_ordinario", "oficial", "master"].includes(roleOf(usuario));
}
