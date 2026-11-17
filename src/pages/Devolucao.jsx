import { useState } from "react";
import QrScanner from "../components/qr/QrScanner";
import { executarOperacaoCautela } from "../services/cautelasService";

export default function Devolucao() {
  const [cautelaItem, setCautelaItem] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState(null);

  const handleScanDevolucao = async (codigoLido) => {
    setLoading(true);
    setMensagem(null);

    let item = null;
    try {
      const query = new URLSearchParams({ uso: "devolucao", codigo: String(codigoLido || "") });
      const response = await fetch(`/api/cautelas?${query}`, { credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Falha na consulta da cautela.");
      item = body.item;
    } catch (err) {
      setMensagem({ tipo: "erro", texto: err.message });
      return;
    } finally {
      setLoading(false);
    }

    if (!item) {
      setMensagem({
        tipo: "erro",
        texto: "Nenhuma cautela ATIVA encontrada para este armamento.",
      });
      return;
    }

    setCautelaItem(item);
  };

  const handleConfirmarDevolucao = async () => {
    setLoading(true);
    setMensagem(null);

    try {
      await executarOperacaoCautela("devolver-qr", {
        item_id: cautelaItem.id,
      });

      setMensagem({
        tipo: "sucesso",
        texto: "Devolução concluída! Armamento retornado ao acervo.",
      });
      setCautelaItem(null);
    } catch (err) {
      setMensagem({
        tipo: "erro",
        texto: "Erro ao processar devolução: " + err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 min-h-screen bg-gray-50 pb-20">
      <h1 className="text-xl font-bold text-center text-gray-800 mb-4">
        Devolução de Armamento
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

      {!cautelaItem ? (
        <div className="space-y-4">
          <QrScanner onScanSuccess={handleScanDevolucao} />
          {loading && (
            <p className="text-center text-gray-500">
              Buscando cautela ativa...
            </p>
          )}
        </div>
      ) : (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 space-y-4">
          <div className="bg-slate-100 p-3 rounded-lg text-sm">
            <span className="font-bold block text-slate-800">
              {cautelaItem.equipamentos.tipo} -{" "}
              {cautelaItem.equipamentos.modelo}
            </span>
            <span className="text-xs text-slate-600 block">
              Série: {cautelaItem.equipamentos.numero_serie}
            </span>
            <span className="text-xs text-slate-600 block">
              Cautelado por: {cautelaItem.cautelas.policiais?.posto_graduacao}{" "}
              {cautelaItem.cautelas.policiais?.nome_guerra}
            </span>
          </div>

          <div className="bg-gray-50 p-2.5 rounded-lg text-xs space-y-1 text-gray-700">
            <p>
              <strong>Munições para conferência:</strong>{" "}
              {cautelaItem.quantidade_municao} un. ({cautelaItem.tipo_municao})
            </p>
            <p>
              <strong>Carregadores para conferência:</strong>{" "}
              {cautelaItem.quantidade_carregadores}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => setCautelaItem(null)}
              className="w-1/3 py-3 bg-gray-200 text-gray-700 font-medium rounded-lg text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmarDevolucao}
              disabled={loading}
              className="w-2/3 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-md disabled:bg-blue-400 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <span>Recebendo...</span>
                </>
              ) : (
                "Confirmar Recebimento"
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
