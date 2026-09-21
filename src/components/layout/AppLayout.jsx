import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const [usuario, setUsuario] = useState(null);
  const [sidebarAberta, setSidebarAberta] = useState(false);

  const carregarUsuario = () => {
    try {
      const usuarioSalvo = localStorage.getItem("log2cia_user");
      if (usuarioSalvo) {
        setUsuario(JSON.parse(usuarioSalvo));
      }
    } catch (e) {
      console.error("Erro ao ler dados do usuário:", e);
    }
  };

  useEffect(() => {
    carregarUsuario();

    window.addEventListener("storage", carregarUsuario);
    window.addEventListener("usuarioAtualizado", carregarUsuario);

    return () => {
      window.removeEventListener("storage", carregarUsuario);
      window.removeEventListener("usuarioAtualizado", carregarUsuario);
    };
  }, []);

  const handleSairDoSistema = () => {
    localStorage.removeItem("log2cia_user");
    window.location.href = "/";
  };

  const getLinkClass = (path) => {
    const isActive = location.pathname === path;
    return `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
      isActive
        ? "bg-blue-600 text-white font-bold shadow"
        : "text-slate-300 hover:bg-slate-800 hover:text-white"
    }`;
  };

  const navegarPara = (path) => {
    navigate(path);
    setSidebarAberta(false);
  };

  const userRole = String(usuario?.role || "").toLowerCase();
  const isMaster = userRole === "master";
  const isArmeiroOrAdmin = ["master", "p4", "armeiro"].includes(userRole);

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-gray-100">
      {/* Barra Superior Mobile */}
      <div className="md:hidden bg-slate-900 text-white flex items-center justify-between p-4 shadow-md z-30">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white text-xs">
            🛡️
          </div>
          <span className="font-bold text-base tracking-wide">Log2CIA</span>
        </div>
        <button
          onClick={() => setSidebarAberta(!sidebarAberta)}
          className="p-2 text-slate-300 hover:text-white focus:outline-none"
        >
          {sidebarAberta ? "✕ Fechar" : "☰ Menu"}
        </button>
      </div>

      {sidebarAberta && (
        <div
          onClick={() => setSidebarAberta(false)}
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
        />
      )}

      {/* Sidebar Lateral */}
      <aside
        className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 text-white flex flex-col justify-between p-4 transition-transform duration-300 ease-in-out md:static md:translate-x-0 shrink-0
        ${sidebarAberta ? "translate-x-0" : "-translate-x-full"}
      `}
      >
        <div className="space-y-6">
          <div className="hidden md:flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white shadow">
              🛡️
            </div>
            <span className="font-bold text-lg text-white tracking-wide">
              Log2CIA
            </span>
          </div>

          <nav className="space-y-1 mt-4 md:mt-0">
            <button
              onClick={() => navegarPara("/")}
              className={`w-full ${getLinkClass("/")}`}
            >
              <span>📊</span> Dashboard
            </button>

            <button
              onClick={() => navegarPara("/cautelas")}
              className={`w-full ${getLinkClass("/cautelas")}`}
            >
              <span>🔄</span> Cautelas
            </button>

            {/* ACERVO / INVENTÁRIO - EXCLUSIVO PARA ARMEIRO, P4 E MASTER */}
            {isArmeiroOrAdmin && (
              <button
                onClick={() => navegarPara("/inventario")}
                className={`w-full ${getLinkClass("/inventario")}`}
              >
                <span>📦</span> Acervo / Inventário
              </button>
            )}

            {/* ABA POLICIAIS - EXCLUSIVA PARA ARMEIRO, P4 E MASTER */}
            {isArmeiroOrAdmin && (
              <button
                onClick={() => navegarPara("/policiais")}
                className={`w-full ${getLinkClass("/policiais")}`}
              >
                <span>👥</span> Policiais
              </button>
            )}

            {/* PAINEL MASTER - APENAS PARA MASTER */}
            {isMaster && (
              <button
                onClick={() => navegarPara("/painel-master")}
                className={`w-full mt-4 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold transition-all border border-amber-500/30 ${
                  location.pathname === "/painel-master"
                    ? "bg-amber-500 text-slate-950 shadow"
                    : "text-amber-400 bg-amber-500/10 hover:bg-amber-500/20"
                }`}
              >
                <span>🛡️</span> Painel Master
              </button>
            )}
          </nav>
        </div>

        {/* Rodapé da Sidebar */}
        <div className="border-t border-slate-800 pt-3 space-y-1">
          <button
            onClick={() => navegarPara("/alterar-senha")}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition-all"
          >
            <span>🔑</span> Alterar Senha
          </button>

          <button
            onClick={handleSairDoSistema}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-all"
          >
            <span>🚪</span> Sair
          </button>
        </div>
      </aside>

      {/* Conteúdo Principal */}
      <main className="flex-1 p-4 md:p-6 overflow-y-auto space-y-4">
        <div className="bg-slate-900 text-white rounded-2xl p-4 shadow flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-base font-bold shadow">
              👤
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white">
                  {usuario?.nome_completo ||
                    usuario?.nome ||
                    "Policial / Efetivo"}
                </h2>
                <span className="bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                  {usuario?.role || "efetivo"}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Posto: {usuario?.posto_graduacao || usuario?.posto || "N/A"} |
                Mat: {usuario?.matricula || "N/A"}
              </p>
            </div>
          </div>
          <div className="bg-slate-800 border border-slate-700 text-slate-300 text-xs font-medium px-3 py-2 rounded-xl flex items-center gap-2 shadow-inner">
            <span className="text-emerald-400">🛡️</span> Sessão Autenticada e
            Auditada
          </div>
        </div>

        <Outlet />
      </main>
    </div>
  );
}
