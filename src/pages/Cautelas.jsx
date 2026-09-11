import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function Cautelas() {
  const navigate = useNavigate(); // Instância obrigatória para o clique funcionar

  const [cautelas, setCautelas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarCautelas();
  }, []);

  async function carregarCautelas() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("cautelas")
        .select(
          `
          id, status, data_cautela,
          policial:profiles!policial_id ( nome_guerra, posto_graduacao, matricula ),
          cautela_itens (
            quantidade_municao, tipo_municao, quantidade_carregadores,
            equipamento:equipamentos ( tipo, modelo, numero_serie )
          )
        `,
        )
        .order("data_cautela", { ascending: false });

      if (error) throw error;
      if (data) setCautelas(data);
    } catch (err) {
      console.error("Erro ao carregar cautelas:", err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Controle de Cautelas
          </h1>
          <p className="text-sm text-slate-500">
            Registro de saída e devolução de material bélico do efetivo.
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate("/cautelas/nova")}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg shadow transition-all"
        >
          + Nova Cautela
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500 text-center py-8">
          Carregando listagem de cautelas...
        </p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[11px] font-semibold">
                <th className="p-3">Policial / Servidor</th>
                <th className="p-3">Itens Cautelados</th>
                <th className="p-3">Data / Hora Saída</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cautelas.length === 0 ? (
                <tr>
                  <td colSpan="4" className="p-4 text-center text-slate-400">
                    Nenhuma cautela registrada até o momento.
                  </td>
                </tr>
              ) : (
                cautelas.map((c) => {
                  const item = c.cautela_itens?.[0] || {};
                  const eq = item.equipamento || {};
                  const pol = c.policial || {};

                  return (
                    <tr key={c.id} className="hover:bg-slate-50/80">
                      <td className="p-3">
                        <span className="font-bold text-slate-800 block">
                          {pol.posto_graduacao} {pol.nome_guerra}
                        </span>
                        <span className="text-xs text-slate-500">
                          RE: {pol.matricula || "N/I"}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="inline-block bg-slate-100 px-2 py-1 rounded text-xs text-slate-700 font-medium">
                          {eq.tipo} {eq.modelo} ({eq.numero_serie})
                        </span>
                      </td>
                      <td className="p-3 text-slate-600 text-xs">
                        {c.data_cautela
                          ? new Date(c.data_cautela).toLocaleString("pt-BR")
                          : "N/A"}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            c.status === "ativa"
                              ? "bg-emerald-100 text-emerald-800"
                              : c.status === "pendente_confirmacao"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {c.status === "ativa"
                            ? "• Em Cautela"
                            : c.status === "pendente_confirmacao"
                              ? "• Pendente"
                              : c.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
