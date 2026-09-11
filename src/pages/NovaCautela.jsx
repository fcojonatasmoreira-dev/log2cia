import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function NovaCautela() {
  const navigate = useNavigate();

  const [modoDigitacao, setModoDigitacao] = useState("manual"); // 'manual' ou 'camera'
  const [termoBusca, setTermoBusca] = useState("");
  const [armaEncontrada, setArmaEncontrada] = useState(null);
  const [mensagemErro, setMensagemErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  // Lista de policiais para o combo/seleção da cautela
  const [policiais, setPoliciais] = useState([]);
  const [policialSelecionado, setPolicialSelecionado] = useState("");

  // Detalhes da cautela (munição e carregadores)
  const [qtdCarregadores, setQtdCarregadores] = useState(0);
  const [qtdMunicao, setQtdMunicao] = useState(0);
  const [tipoMunicao, setTipoMunicao] = useState("");
  const [salvandoCautela, setSalvandoCautela] = useState(false);

  useEffect(() => {
    carregarPoliciais();
  }, []);

  async function carregarPoliciais() {
    try {
      const { data, error } = await supabase
        .from("policiais")
        .select("id, nome_guerra, posto_graduacao, matricula")
        .order("nome_guerra", { ascending: true });

      if (error) throw error;
      if (data) setPoliciais(data);
    } catch (err) {
      console.error("Erro ao carregar lista de policiais:", err.message);
    }
  }

  // Busca em etapas sequenciais para evitar erros de sintaxe 400 com .or()
  const handleBuscarArmamento = async (e) => {
    if (e) e.preventDefault();

    const termo = termoBusca.trim();
    if (!termo) {
      setMensagemErro("Digite o número de série, modelo ou patrimônio.");
      return;
    }

    setCarregando(true);
    setMensagemErro("");
    setArmaEncontrada(null);

    try {
      // 1. Busca por número de série
      let { data, error } = await supabase
        .from("equipamentos")
        .select("*")
        .ilike("num_serie", `%${termo}%`)
        .limit(1)
        .maybeSingle();

      // 2. Se não encontrou por série, busca por modelo_descricao
      if (!data && !error) {
        const resModelo = await supabase
          .from("equipamentos")
          .select("*")
          .ilike("modelo_descricao", `%${termo}%`)
          .limit(1)
          .maybeSingle();
        data = resModelo.data;
        error = resModelo.error;
      }

      // 3. Se ainda não encontrou, busca por patrimonio
      if (!data && !error) {
        const resPatrimonio = await supabase
          .from("equipamentos")
          .select("*")
          .ilike("patrimonio", `%${termo}%`)
          .limit(1)
          .maybeSingle();
        data = resPatrimonio.data;
        error = resPatrimonio.error;
      }

      if (error) throw error;

      if (!data) {
        setMensagemErro("Armamento não encontrado no acervo!");
      } else {
        setArmaEncontrada(data);
      }
    } catch (err) {
      console.error("Erro ao buscar armamento:", err.message);
      setMensagemErro("Erro na busca: " + err.message);
    } finally {
      setCarregando(false);
    }
  };

  const handleFinalizarCautela = async (e) => {
    e.preventDefault();

    if (!armaEncontrada) {
      setMensagemErro("Selecione um armamento antes de finalizar.");
      return;
    }

    if (!policialSelecionado) {
      setMensagemErro("Selecione o policial responsável pela cautela.");
      return;
    }

    setSalvandoCautela(true);
    setMensagemErro("");

    try {
      // 1. Criar o registro principal na tabela 'cautelas'
      const { data: novaCautela, error: errCautela } = await supabase
        .from("cautelas")
        .insert([
          {
            policial_id: policialSelecionado,
            status: "ativa",
            data_cautela: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (errCautela) throw errCautela;

      // 2. Inserir o item na tabela 'cautela_itens'
      const { error: errItem } = await supabase.from("cautela_itens").insert([
        {
          cautela_id: novaCautela.id,
          equipamento_id: armaEncontrada.id,
          quantidade_carregadores: Number(qtdCarregadores) || 0,
          quantidade_municao: Number(qtdMunicao) || 0,
          tipo_municao: tipoMunicao,
        },
      ]);

      if (errItem) throw errItem;

      // 3. Atualizar o status do equipamento para 'cautelado'
      await supabase
        .from("equipamentos")
        .update({ status: "cautelado" })
        .eq("id", armaEncontrada.id);

      // Sucesso -> Redireciona para a lista de cautelas
      navigate("/cautelas");
    } catch (err) {
      console.error("Erro ao finalizar cautela:", err.message);
      setMensagemErro("Erro ao salvar cautela: " + err.message);
    } finally {
      setSalvandoCautela(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      {/* Botão de Voltar e Título */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/cautelas")}
          className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 font-bold text-xs"
        >
          ← Voltar
        </button>
        <h1 className="text-xl font-bold text-slate-800">
          Saída de Armamento / Nova Cautela
        </h1>
      </div>

      {/* Caixa Principal */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-5">
        {/* Seletor do Modo de Busca */}
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setModoDigitacao("camera")}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              modoDigitacao === "camera"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            📷 Câmera / QR Code
          </button>
          <button
            type="button"
            onClick={() => setModoDigitacao("manual")}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              modoDigitacao === "manual"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            ⌨️ Digitação Manual
          </button>
        </div>

        {/* Alertas de Erro */}
        {mensagemErro && (
          <div className="p-3 text-xs font-bold text-red-700 bg-red-100 border border-red-200 rounded-lg text-center">
            {mensagemErro}
          </div>
        )}

        {/* Área de Entrada Manual */}
        {modoDigitacao === "manual" ? (
          <form onSubmit={handleBuscarArmamento} className="space-y-3">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                Nº de Série, Modelo ou Patrimônio
              </label>
              <input
                type="text"
                value={termoBusca}
                onChange={(e) => setTermoBusca(e.target.value)}
                placeholder="Ex: ABC12345, PT 840, PAT123"
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={carregando}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow transition-all disabled:opacity-50"
            >
              {carregando ? "Buscando..." : "Buscar Armamento"}
            </button>
          </form>
        ) : (
          <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
            <span className="text-3xl block mb-2">📸</span>
            <p className="text-xs text-slate-600 font-medium">
              Aproxime o QR Code do armamento da câmera para leitura.
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              (Suporte a câmera ativo)
            </p>
          </div>
        )}

        {/* Exibição do Armamento Localizado + Formulário do Policial */}
        {armaEncontrada && (
          <div className="mt-6 border-t border-slate-200 pt-5 space-y-4">
            {/* Card do Armamento Encontrado */}
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-emerald-800 uppercase">
                  {armaEncontrada.tipo || "Armamento"} Encontrado
                </span>
                <span className="px-2 py-0.5 bg-emerald-200 text-emerald-900 rounded-full text-[10px] font-bold">
                  {armaEncontrada.status}
                </span>
              </div>
              <div className="text-sm font-bold text-slate-900">
                {armaEncontrada.modelo_descricao || armaEncontrada.modelo}
              </div>
              <div className="text-xs text-slate-600">
                Nº Série:{" "}
                <strong className="font-mono text-slate-800">
                  {armaEncontrada.num_serie || armaEncontrada.numero_serie}
                </strong>
                {armaEncontrada.patrimonio &&
                  ` | Patrimônio: ${armaEncontrada.patrimonio}`}
              </div>
            </div>

            {/* Formulário de Conclusão da Cautela */}
            <form
              onSubmit={handleFinalizarCautela}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Policial Responsável *
                </label>
                <select
                  required
                  value={policialSelecionado}
                  onChange={(e) => setPolicialSelecionado(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">-- Selecione o Policial --</option>
                  {policiais.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.posto_graduacao} {p.nome_guerra} - Matrícula:{" "}
                      {p.matricula}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Carregadores
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={qtdCarregadores}
                    onChange={(e) => setQtdCarregadores(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Qtd. Munições
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={qtdMunicao}
                    onChange={(e) => setQtdMunicao(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Tipo da Munição / Calibre
                </label>
                <input
                  type="text"
                  placeholder="Ex: .40 S&W Gold Hex, 9mm Luger"
                  value={tipoMunicao}
                  onChange={(e) => setTipoMunicao(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium"
                />
              </div>

              <button
                type="submit"
                disabled={salvandoCautela}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm uppercase tracking-wider rounded-xl shadow transition-all disabled:opacity-50 mt-2"
              >
                {salvandoCautela
                  ? "Registrando Cautela..."
                  : "Confirmar e Gerar Cautela"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
