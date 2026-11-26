import {
  Archive, ArrowLeftRight, BookOpen, CalendarCheck, CalendarDays,
  Car, ChartNoAxesColumnIncreasing, Clock3, FileText, LayoutDashboard,
  MapPinned, Package, UsersRound,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { modulosDashboard } from "../../utils/dashboardAccess";

const ICONES = {
  dashboard: ChartNoAxesColumnIncreasing,
  book: BookOpen,
  map: MapPinned,
  calendar: CalendarDays,
  clock: Clock3,
  swap: ArrowLeftRight,
  inventory: Package,
  car: Car,
  carCheck: Car,
  users: UsersRound,
  file: FileText,
  event: CalendarCheck,
  archive: Archive,
};
const CORES_ICONES = {
  blue: "text-blue-600",
  purple: "text-purple-600",
  green: "text-green-600",
  orange: "text-orange-600",
  cyan: "text-cyan-600",
  pink: "text-pink-600",
  amber: "text-amber-500",
  sky: "text-sky-600",
};

export default function ModuleNavigation({ usuario }) {
  const navigate = useNavigate();
  const location = useLocation();
  const modulos = modulosDashboard(usuario || {});

  return (
    <section aria-labelledby="modulos-heading" className="theme-surface rounded-2xl border border-blue-100 bg-gradient-to-br from-white to-[#f3f7ff] p-4 shadow-[0_8px_22px_#163b7210] sm:p-5">
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="flex items-center gap-3"><div className="grid h-8 w-8 place-items-center text-blue-500"><LayoutDashboard className="h-6 w-6" /></div><h2 id="modulos-heading" className="text-lg font-extrabold tracking-tight text-[#101a43] sm:text-xl">Módulos do Sistema</h2></div>
        <p className="text-xs text-slate-600">Acesse os principais módulos operacionais do Log2CIA.</p>
      </div>
      <nav aria-label="Módulos do Sistema" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        {modulos.map((modulo) => {
          const Icone = ICONES[modulo.icone] || LayoutDashboard;
          const ativo = location.pathname === modulo.caminho || (modulo.caminho !== "/" && location.pathname.startsWith(`${modulo.caminho}/`));
          return <button key={modulo.caminho} onClick={() => navigate(modulo.caminho)} aria-current={ativo ? "page" : undefined} className={`module-card modulo-${modulo.cor} ${ativo ? "module-card--active" : ""} group flex min-h-[64px] items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:gap-3 sm:px-3.5 ${ativo ? "border-blue-600 bg-gradient-to-r from-sky-500 to-blue-700 text-white shadow-md shadow-blue-700/20" : "theme-module border-blue-100 bg-white text-[#111a40] hover:border-blue-300"}`}><Icone className={`h-5 w-5 shrink-0 sm:h-6 sm:w-6 ${ativo ? "text-white" : CORES_ICONES[modulo.cor] || "text-blue-600"}`} /><span className="min-w-0"><span className="block text-[11px] font-extrabold leading-tight sm:text-xs">{modulo.titulo}</span><span className={`mt-1 hidden text-[9px] leading-tight sm:block ${ativo ? "text-blue-50" : "text-slate-500"}`}>{modulo.descricao}</span></span></button>;
        })}
      </nav>
    </section>
  );
}
