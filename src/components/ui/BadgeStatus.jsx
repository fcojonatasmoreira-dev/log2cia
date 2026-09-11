import React from "react";

const statusStyles = {
  disponivel: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cautelado: "bg-amber-100 text-amber-800 border-amber-200",
  manutencao: "bg-rose-100 text-rose-800 border-rose-200",
  baixado: "bg-slate-200 text-slate-700 border-slate-300",
  ativa: "bg-blue-100 text-blue-800 border-blue-200",
  concluida: "bg-slate-100 text-slate-700 border-slate-200",
  atrasada: "bg-red-100 text-red-800 border-red-300 animate-pulse",
};

const statusLabels = {
  disponivel: "Disponível",
  cautelado: "Cautelado",
  manutencao: "Manutenção",
  baixado: "Baixado",
  ativa: "Em Cautela",
  concluida: "Devolvido",
  atrasada: "Atrasada",
};

export default function BadgeStatus({ status }) {
  const style =
    statusStyles[status] || "bg-gray-100 text-gray-800 border-gray-200";
  const label = statusLabels[status] || status;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${style}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5" />
      {label}
    </span>
  );
}
