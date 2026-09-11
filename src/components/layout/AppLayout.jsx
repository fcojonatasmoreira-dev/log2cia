import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const [isMaster, setIsMaster] = useState(false);

  useEffect(() => {
    async function checarPerfilMaster() {
      try {
        const { data: sessionData, error: sessionError } =
          await supabase.auth.getSession();

        if (sessionError || !sessionData?.session?.user) {
          return;
        }

        const userId = sessionData.session.user.id;

        // Consulta filtrada estritamente na coluna existente 'role'
        const { data: perfil, error: perfilError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", userId)
          .maybeSingle();

        if (perfilError) {
          console.error(
            "Erro ao buscar perfil do usuário:",
            perfilError.message,
          );
          return;
        }

        if (perfil) {
          const roleVal = String(perfil.role || "").toLowerCase();
          if (roleVal.includes("master") || roleVal.includes("p4")) {
            setIsMaster(true);
          }
        }
      } catch (err) {
        console.error("Erro na checagem do perfil master:", err);
      }
    }

    checarPerfilMaster();
  }, []);

  const getLinkClass = (path) => {
    const isActive = location.pathname === path;
    return `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
      isActive
        ? "bg-blue-600 text-white font-bold shadow"
        : "text-slate-300 hover:bg-slate-800 hover:text-white"
    }`;
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Sidebar Lateral */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col justify-between p-4 shrink-0">
        <div className="space-y-6">
          {/* Header da Sidebar */}
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white shadow">
              🛡️
            </div>
            <span className="font-bold text-lg text-white tracking-wide">
              Log2CIA
            </span>
          </div>

          {/* Links do Menu */}
          <nav className="space-y-1">
            <button
              onClick={() => navigate("/dashboard")}
              className={`w-full ${getLinkClass("/dashboard")}`}
            >
              <span>📊</span> Dashboard
            </button>

            <button
              onClick={() => navigate("/cautelas")}
              className={`w-full ${getLinkClass("/cautelas")}`}
            >
              <span>🔄</span> Cautelas
            </button>

            <button
              onClick={() => navigate("/inventario")}
              className={`w-full ${getLinkClass("/inventario")}`}
            >
              <span>📦</span> Acervo / Inventário
            </button>

            <button
              onClick={() => navigate("/policiais")}
              className={`w-full ${getLinkClass("/policiais")}`}
            >
              <span>👥</span> Policiais
            </button>

            {/* PAINEL MASTER EXCLUSIVO */}
            {isMaster && (
              <button
                onClick={() => navigate("/painel-master")}
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
        <div className="border-t border-slate-800 pt-3">
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              navigate("/login");
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-all"
          >
            <span>🚪</span> Sair
          </button>
        </div>
      </aside>

      {/* Conteúdo Principal */}
      <main className="flex-1 p-6 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
