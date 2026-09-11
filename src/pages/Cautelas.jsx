import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function Cautelas() {
  const navigate = useNavigate();

  const [cautelas, setCautelas] = useState([]);
  const [loading, setLoading] = useState(true);

  // Estados do Modal de Edição
  const [cautelaEditando, setCautelaEditando] = useState(null);
  const [editStatus, setEditStatus] = useState("");
  const [editCarregadores, setEditCarregadores] = useState(0);
  const [editMunicao, setEditMunicao] = useState(0);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

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

  // Excluir Cautela e Restaurar Status do Equipamento
  const handleExcluirCautela = async (cautela) => {
    if (!window.confirm("Deseja realmente excluir este registro de cautela?"))
      return;

    try {
      // 1. Pega o num_serie do equipamento vinculado para restaurar status
      const numSerie = cautela.cautela_itens?.[0]?.equipamento?.num_serie;

      // 2. Apaga itens e cautela
      await supabase
        .from("cautela_itens")
        .delete()
        .eq("cautela_id", cautela.id);
      const { error } = await supabase
        .from("cautelas")
        .delete()
        .eq("id", cautela.id);

      if (error) throw error;

      // 3. Se tinha equipamento vinculado, torna-o 'disponivel' novamente
      if (numSerie) {
        await supabase
          .from("equipamentos")
          .update({ status: "disponivel" })
          .eq("num_serie", numSerie);
      }

      setCautelas((prev) => prev.filter((c) => c.id !== cautela.id));
    } catch (err) {
      alert("Erro ao excluir cautela: " + err.message);
    }
  };

  const handleAbrirEdicao = (cautela) => {
    setCautelaEditando(cautela);
    setEditStatus(cautela.status);
    const item = cautela.cautela_itens?.[0];
    setEditCarregadores(item?.quantidade_carregadores || 0);
    setEditMunicao(item?.quantidade_municao || 0);
  };

  const handleSalvarEdicao = async (e) => {
    e.preventDefault();
    setSalvandoEdicao(true);

    try {
      // 1. Atualiza a Cautela
      const { error: errCautela } = await supabase
        .from("cautelas")
        .update({ status: editStatus })
        .eq("id", cautelaEditando.id);

      if (errCautela) throw errCautela;

      // 2. Se mudou status para devolvido/finalizada, libera o equipamento no acervo
      const numSerie =
        cautelaEditando.cautela_itens?.[0]?.equipamento?.num_serie;
      if (editStatus === "finalizada" && numSerie) {
        await supabase
          .from("equipamentos")
          .update({ status: "disponivel" })
          .eq("num_serie", numSerie);
      }

      // 3. Atualiza os Itens
      const itemId = cautelaEditando.cautela_itens?.[0]?.id;
      if (itemId) {
        await supabase
          .from("cautela_itens")
          .update({
            quantidade_carregadores: Number(editCarregadores),
            quantidade_municao: Number(editMunicao),
          })
          .eq("id", itemId);
      }

      setCautelaEditando(null);
      carregarCautelas();
    } catch (err) {
      alert("Erro ao salvar edição: " + err.message);
    } finally {
      setSalvandoEdicao(false);
    }
  };

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
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cautelas.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-4 text-center text-slate-400">
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
                      <td className="p-3">
                        <span className="font-bold text-slate-800 block">
                          {pol.posto_graduacao} {pol.nome_guerra || "N/I"}
                        </span>
                        <span className="text-xs text-slate-500">
                          Matrícula: {pol.matricula || "N/I"}
                        </span>
                      </td>

                      <td className="p-3 space-y-1.5">
                        {c.cautela_itens && c.cautela_itens.length > 0 ? (
                          c.cautela_itens.map((ci) => {
                            const eq = ci.equipamento || {};
                            return (
                              <div
                                key={ci.id}
                                className="bg-slate-50 p-2 rounded-lg border border-slate-100"
                              >
                                <div className="font-bold text-slate-800 text-xs">
                                  {eq.tipo?.toUpperCase()} -{" "}
                                  {eq.modelo_descricao || "N/I"}
                                </div>
                                <div className="text-[11px] text-slate-500 font-mono">
                                  Série:{" "}
                                  <span className="font-bold text-slate-700">
                                    {eq.num_serie || "N/I"}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-500 mt-0.5">
                                  Carregadores:{" "}
                                  <strong>{ci.quantidade_carregadores}</strong>{" "}
                                  | Munição:{" "}
                                  <strong>{ci.quantidade_municao}</strong> (
                                  {ci.tipo_municao || "N/I"})
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <span className="text-slate-400 text-xs italic">
                            Sem itens vinculados
                          </span>
                        )}
                      </td>

                      <td className="p-3 text-slate-600 text-xs font-medium">
                        {c.data_cautela
                          ? new Date(c.data_cautela).toLocaleString("pt-BR")
                          : "N/A"}
                      </td>

                      <td className="p-3">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            c.status === "ativa"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {c.status === "ativa" ? "• Em Cautela" : c.status}
                        </span>
                      </td>

                      <td className="p-3 text-right space-x-2">
                        <button
                          onClick={() => handleAbrirEdicao(c)}
                          className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold rounded text-xs transition-all"
                        >
                          ✏️ Editar
                        </button>
                        <button
                          onClick={() => handleExcluirCautela(c)}
                          className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 font-bold rounded text-xs transition-all"
                        >
                          🗑️ Excluir
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {cautelaEditando && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-800">Editar Cautela</h2>

            <form onSubmit={handleSalvarEdicao} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-600 mb-1 uppercase">
                  Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full p-2 bg-slate-50 border rounded-lg"
                >
                  <option value="ativa">ativa (Em Cautela)</option>
                  <option value="finalizada">
                    finalizada (Devolvido ao Acervo)
                  </option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-600 mb-1 uppercase">
                    Carregadores
                  </label>
                  <input
                    type="number"
                    value={editCarregadores}
                    onChange={(e) => setEditCarregadores(e.target.value)}
                    className="w-full p-2 bg-slate-50 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1 uppercase">
                    Munição
                  </label>
                  <input
                    type="number"
                    value={editMunicao}
                    onChange={(e) => setEditMunicao(e.target.value)}
                    className="w-full p-2 bg-slate-50 border rounded-lg"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setCautelaEditando(null)}
                  className="px-3 py-1.5 bg-slate-100 text-slate-600 font-bold rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoEdicao}
                  className="px-4 py-1.5 bg-blue-600 text-white font-bold rounded-lg"
                >
                  {salvandoEdicao ? "Salvando..." : "Salvar Alterações"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
