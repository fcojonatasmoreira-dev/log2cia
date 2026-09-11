import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import ModalDetalhesArma from "../components/ModalDetalhesArma";

function formatarTipo(texto) {
  if (!texto) return "Armamento";
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export default function Inventario() {
  const [equipamentos, setEquipamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [armaSelecionada, setArmaSelecionada] = useState(null);
  const [modalNovo, setModalNovo] = useState(false);

  // Campos do formulário de novo armamento
  const [novoTipo, setNovoTipo] = useState("armamento");
  const [novoModelo, setNovoModelo] = useState("");
  const [novoSerie, setNovoSerie] = useState("");
  const [novoPatrimonio, setNovoPatrimonio] = useState("");
  const [novoCalibre, setNovoCalibre] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregarInventario();
  }, []);

  async function carregarInventario() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("equipamentos")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (data) setEquipamentos(data);
    } catch (err) {
      console.error("Erro ao carregar equipamentos:", err.message);
    } finally {
      setLoading(false);
    }
  }

  const handleCadastrarArmamento = async (e) => {
    e.preventDefault();
    setSalvando(true);

    try {
      const { error } = await supabase.from("equipamentos").insert([
        {
          tipo: novoTipo.toLowerCase(),
          modelo_descricao: novoModelo,
          num_serie: novoSerie,
          patrimonio: novoPatrimonio,
          status: "disponivel",
          detalhes: { calibre: novoCalibre },
        },
      ]);

      if (error) throw error;

      // Limpa formulário e recarrega
      setNovoModelo("");
      setNovoSerie("");
      setNovoPatrimonio("");
      setNovoCalibre("");
      setModalNovo(false);
      carregarInventario();
    } catch (err) {
      alert("Erro ao cadastrar armamento: " + err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto">
      {/* Cabeçalho da Página com o Botão de Cadastro */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Acervo / Inventário
          </h1>
          <p className="text-xs text-slate-500">
            Gestão e controle de equipamentos bélicos
          </p>
        </div>

        <button
          type="button"
          onClick={() => setModalNovo(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg shadow text-xs flex items-center gap-2 transition-all"
        >
          <span>+</span> Novo Armamento
        </button>
      </div>

      {/* Tabela do Acervo */}
      {loading ? (
        <div className="text-center py-10 text-slate-500 font-medium">
          Carregando acervo...
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 uppercase font-bold text-[11px]">
                <th className="p-3">Tipo / Modelo</th>
                <th className="p-3">Nº Série</th>
                <th className="p-3">Patrimônio</th>
                <th className="p-3">Calibre</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {equipamentos.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-4 text-center text-slate-400">
                    Nenhum equipamento cadastrado.
                  </td>
                </tr>
              ) : (
                equipamentos.map((item) => {
                  const tipoFormatted = formatarTipo(item.tipo);
                  const modeloVal =
                    item.modelo_descricao || item.modelo || "N/I";
                  const serieVal = item.num_serie || item.numero_serie || "N/I";
                  const patrimonioVal = item.patrimonio || "N/I";
                  const calibreVal =
                    item.detalhes?.calibre || item.calibre || "N/I";

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="p-3 font-bold text-slate-800">
                        {tipoFormatted} - {modeloVal}
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-700">
                        {serieVal}
                      </td>
                      <td className="p-3 font-mono text-slate-600">
                        {patrimonioVal}
                      </td>
                      <td className="p-3 text-slate-600">{calibreVal}</td>
                      <td className="p-3">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            item.status === "disponivel"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {item.status === "disponivel"
                            ? "Disponível"
                            : item.status}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => setArmaSelecionada(item)}
                          className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold rounded-lg transition-all text-xs border border-blue-200"
                        >
                          Ver QR Code / Detalhes
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

      {/* Modal de Cadastro de Novo Armamento */}
      {modalNovo && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h2 className="text-lg font-bold text-gray-800">
                Cadastrar Novo Armamento
              </h2>
              <button
                onClick={() => setModalNovo(false)}
                className="text-gray-400 font-bold text-lg p-1"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleCadastrarArmamento}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1">
                  Tipo
                </label>
                <select
                  value={novoTipo}
                  onChange={(e) => setNovoTipo(e.target.value)}
                  className="w-full p-2 bg-gray-50 border border-gray-300 rounded-lg font-medium"
                >
                  <option value="armamento">Armamento</option>
                  <option value="colete">Colete</option>
                  <option value="municao">Munição</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1">
                  Modelo / Descrição *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: PT 840, Glock G22"
                  value={novoModelo}
                  onChange={(e) => setNovoModelo(e.target.value)}
                  className="w-full p-2 bg-gray-50 border border-gray-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-gray-700 uppercase mb-1">
                    Nº de Série *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: ABC12345"
                    value={novoSerie}
                    onChange={(e) => setNovoSerie(e.target.value)}
                    className="w-full p-2 bg-gray-50 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 uppercase mb-1">
                    Calibre
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: .40 S&W, 9mm"
                    value={novoCalibre}
                    onChange={(e) => setNovoCalibre(e.target.value)}
                    className="w-full p-2 bg-gray-50 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1">
                  Patrimônio / Tombo
                </label>
                <input
                  type="text"
                  placeholder="Ex: PAT-9920"
                  value={novoPatrimonio}
                  onChange={(e) => setNovoPatrimonio(e.target.value)}
                  className="w-full p-2 bg-gray-50 border border-gray-300 rounded-lg"
                />
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setModalNovo(false)}
                  className="w-1/3 py-2 bg-gray-200 text-gray-700 font-bold rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="w-2/3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow disabled:opacity-50"
                >
                  {salvando ? "Salvando..." : "Salvar Armamento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Visualização/Edição */}
      {armaSelecionada && (
        <ModalDetalhesArma
          arma={armaSelecionada}
          onClose={() => setArmaSelecionada(null)}
          onUpdateSuccess={() => {
            carregarInventario();
            setArmaSelecionada(null);
          }}
        />
      )}
    </div>
  );
}
