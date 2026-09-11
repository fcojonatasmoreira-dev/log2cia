import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function Cautelas() {
  const navigate = useNavigate();

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
          policial:policiais!policial_id ( nome_guerra, posto_graduacao, matricula ),
          cautela_itens (
            id,
            quantidade_municao, tipo_municao, quantidade_carregadores,
            equipamento:equipamentos ( tipo, modelo_descricao, num_serie )
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
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg shadow transition-all text-xs"
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
                  const pol = c.policial || {};

                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      {/* Policial */}
                      <td className="p-3">
                        <span className="font-bold text-slate-800 block">
                          {pol.posto_graduacao} {pol.nome_guerra || "N/I"}
                        </span>
                        <span className="text-xs text-slate-500">
                          Matrícula: {pol.matricula || "N/I"}
                        </span>
                      </td>

                      {/* Itens Cautelados */}
                      <td className="p-3 space-y-1.5">
                        {c.cautela_itens && c.cautela_itens.length > 0 ? (
                          c.cautela_itens.map((ci) => {
                            const eq = ci.equipamento || {};
                            const tipo = eq.tipo
                              ? eq.tipo.toUpperCase()
                              : "EQUIPAMENTO";
                            const modelo = eq.modelo_descricao || "N/I";
                            const serie = eq.num_serie || "N/I";

                            return (
                              <div
                                key={ci.id}
                                className="bg-slate-50 p-2 rounded-lg border border-slate-100"
                              >
                                <div className="font-bold text-slate-800 text-xs">
                                  {tipo} - {modelo}
                                </div>
                                <div className="text-[11px] text-slate-500 font-mono">
                                  Série:{" "}
                                  <span className="font-bold text-slate-700">
                                    {serie}
                                  </span>
                                </div>
                                {(ci.quantidade_carregadores > 0 ||
                                  ci.quantidade_municao > 0) && (
                                  <div className="text-[10px] text-slate-500 mt-0.5">
                                    {ci.quantidade_carregadores > 0 && (
                                      <span>
                                        Carregadores:{" "}
                                        <strong>
                                          {ci.quantidade_carregadores}
                                        </strong>{" "}
                                      </span>
                                    )}
                                    {ci.quantidade_municao > 0 && (
                                      <span>
                                        | Munição:{" "}
                                        <strong>{ci.quantidade_municao}</strong>{" "}
                                        ({ci.tipo_municao || "N/I"})
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        ) : (
                          <span className="text-slate-400 text-xs italic">
                            Sem itens vinculados
                          </span>
                        )}
                      </td>

                      {/* Data / Hora Saída */}
                      <td className="p-3 text-slate-600 text-xs font-medium">
                        {c.data_cautela
                          ? new Date(c.data_cautela).toLocaleString("pt-BR")
                          : "N/A"}
                      </td>

                      {/* Status */}
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
