import { useState, useEffect, useTransition } from "react";
import { supabase } from "../lib/supabaseClient";
import QrScanner from "../components/qr/QrScanner";

export default function NovaCautela() {
  const [modo, setModo] = useState("qr"); // 'qr' ou 'manual'
  const [buscaTexto, setBuscaTexto] = useState("");
  const [etapa, setEtapa] = useState("scanner");
  const [armamento, setArmamento] = useState(null);
  const [policiais, setPoliciais] = useState([]);
  const [mensagem, setMensagem] = useState(null);

  const [isPending, startTransition] = useTransition();

  const [policialId, setPolicialId] = useState("");
  const [qtdMunicao, setQtdMunicao] = useState(30);
  const [tipoMunicao, setTipoMunicao] = useState("9mm");
  const [qtdCarregadores, setQtdCarregadores] = useState(3);
  const [observacoes, setObservacoes] = useState("");

  useEffect(() => {
    async function fetchPoliciais() {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .order("nome", { ascending: true });
      if (data) setPoliciais(data);
    }
    fetchPoliciais();
  }, []);

  const buscarArmamento = async (termo) => {
    if (!termo.trim()) return;
    setMensagem(null);

    try {
      const { data: arma, error } = await supabase
        .from("equipamentos")
        .select("*")
        .or(
          `id.eq.${termo},num_serie.ilike.%${termo}%,modelo_descricao.ilike.%${termo}%`,
        )
        .maybeSingle();

      if (error || !arma) {
        setMensagem({
          tipo: "erro",
          texto: "Armamento não encontrado no acervo!",
        });
        return;
      }

      if (arma.status === "cautelado") {
        setMensagem({
          tipo: "erro",
          texto: "Atenção: Este armamento consta como CAUTELADO!",
        });
        return;
      }

      setArmamento(arma);
      setEtapa("formulario");
    } catch (err) {
      setMensagem({
        tipo: "erro",
        texto: "Erro ao buscar armamento: " + err.message,
      });
    }
  };

  const handleCLiqueRegistrar = () => {
    if (!policialId) {
      alert("Selecione o policial responsável pela cautela.");
      return;
    }

    startTransition(async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const { data: novaCautela, error: errC } = await supabase
          .from("cautelas")
          .insert([
            {
              policial_id: policialId,
              operador_abertura_id: user?.id,
              data_cautela: new Date().toISOString(),
              status: "pendente_confirmacao",
            },
          ])
          .select()
          .single();

        if (errC) throw errC;

        const { error: errItem } = await supabase.from("cautela_itens").insert([
          {
            cautela_id: novaCautela.id,
            equipamento_id: armamento.id,
            quantidade_municao: Number(qtdMunicao),
            tipo_municao: tipoMunicao,
            quantidade_carregadores: Number(qtdCarregadores),
            observacoes: observacoes,
          },
        ]);

        if (errItem) throw errItem;

        setMensagem({
          tipo: "sucesso",
          texto: "Cautela registrada com sucesso!",
        });

        setTimeout(() => {
          setArmamento(null);
          setPolicialId("");
          setBuscaTexto("");
          setEtapa("scanner");
          setMensagem(null);
        }, 1500);
      } catch (err) {
        setMensagem({ tipo: "erro", texto: "Erro ao salvar: " + err.message });
      }
    });
  };

  return (
    <div className="max-w-md mx-auto p-4 min-h-screen bg-gray-50 pb-20">
      <h1 className="text-xl font-bold text-center text-gray-800 mb-4">
        Saída de Armamento
      </h1>

      {mensagem && (
        <div
          className={`p-3 mb-4 rounded-lg text-sm text-center font-medium ${
            mensagem.tipo === "erro"
              ? "bg-red-100 text-red-700"
              : "bg-green-100 text-green-700"
          }`}
        >
          {mensagem.texto}
        </div>
      )}

      {etapa === "scanner" && (
        <div className="space-y-4">
          <div className="flex bg-gray-200 p-1 rounded-lg">
            <button
              onClick={() => setModo("qr")}
              className={`flex-1 py-1.5 text-xs font-bold rounded-md ${modo === "qr" ? "bg-white shadow text-gray-800" : "text-gray-600"}`}
            >
              Câmera / QR Code
            </button>
            <button
              onClick={() => setModo("manual")}
              className={`flex-1 py-1.5 text-xs font-bold rounded-md ${modo === "manual" ? "bg-white shadow text-gray-800" : "text-gray-600"}`}
            >
              Digitação Manual
            </button>
          </div>

          {modo === "qr" ? (
            <QrScanner onScanSuccess={(codigo) => buscarArmamento(codigo)} />
          ) : (
            <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-3">
              <label className="block text-xs font-bold text-gray-700 uppercase">
                Nº de Série ou Modelo
              </label>
              <input
                type="text"
                placeholder="Ex: ABC12345 ou PT 840"
                value={buscaTexto}
                onChange={(e) => setBuscaTexto(e.target.value)}
                className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm"
              />
              <button
                onClick={() => buscarArmamento(buscaTexto)}
                className="w-full py-2.5 bg-blue-600 text-white font-bold rounded-lg text-sm"
              >
                Buscar Armamento
              </button>
            </div>
          )}
        </div>
      )}

      {etapa === "formulario" && armamento && (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 space-y-4">
          <div className="bg-slate-100 p-3 rounded-lg text-sm">
            <span className="block font-bold text-slate-700">
              {armamento.tipo} - {armamento.modelo}
            </span>
            <span className="block text-slate-600">
              Série:{" "}
              <strong className="text-slate-900">
                {armamento.numero_serie}
              </strong>
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Policial (Cautelante) *
            </label>
            <select
              value={policialId}
              disabled={isPending}
              onChange={(e) => setPolicialId(e.target.value)}
              className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">-- Selecione o Policial --</option>
              {policiais.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.posto_graduacao || ""} {p.nome_guerra || p.nome} (
                  {p.matricula || "N/I"})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Carregadores
              </label>
              <input
                type="number"
                value={qtdCarregadores}
                onChange={(e) => setQtdCarregadores(e.target.value)}
                className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Qtd. Munição
              </label>
              <input
                type="number"
                value={qtdMunicao}
                onChange={(e) => setQtdMunicao(e.target.value)}
                className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Tipo Munição
            </label>
            <input
              type="text"
              value={tipoMunicao}
              onChange={(e) => setTipoMunicao(e.target.value)}
              className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Observações
            </label>
            <textarea
              rows="2"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm"
            ></textarea>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setEtapa("scanner");
                setArmamento(null);
              }}
              className="w-1/3 py-2.5 bg-gray-200 text-gray-700 font-medium rounded-lg text-sm"
            >
              Voltar
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={handleCLiqueRegistrar}
              className="w-2/3 py-2.5 bg-blue-600 text-white font-bold rounded-lg text-sm disabled:bg-blue-300"
            >
              {isPending ? "Enviando..." : "Registrar Cautela"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
