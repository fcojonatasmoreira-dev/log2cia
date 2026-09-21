import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

export default function MinhasCautelas() {
  const [cautelasPendentes, setCautelasPendentes] = useState([]);
  const [cautelasAtivas, setCautelasAtivas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processandoId, setProcessandoId] = useState(null);

  useEffect(() => {
    carregarCautelas();
  }, []);

  async function carregarCautelas() {
    setLoading(true);
    try {
      // Obtém o usuário logado na sessão unificada do localStorage ou auth
      let policialId = null;
      const usuarioSalvo = localStorage.getItem("log2cia_user");
      if (usuarioSalvo) {
        const dadosUser = JSON.parse(usuarioSalvo);
        if (dadosUser?.matricula) {
          const { data: polData } = await supabase
            .from("policiais")
            .select("id")
            .eq("matricula", dadosUser.matricula)
            .maybeSingle();
          if (polData) policialId = polData.id;
        }
      }

      if (!policialId) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) policialId = user.id;
      }

      if (!policialId) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("cautelas")
        .select(
          `
          id, status, data_cautela,
          cautela_itens (
            quantidade_municao, tipo_municao, quantidade_carregadores, observacoes,
            equipamentos ( id, tipo, modelo, modelo_descricao, num_serie, numero_serie, calibre )
          )
        `,
        )
        .eq("policial_id", policialId)
        .in("status", ["pendente_confirmacao", "ativa"])
        .order("data_cautela", { ascending: false });

      if (!error && data) {
        setCautelasPendentes(
          data.filter((c) => c.status === "pendente_confirmacao"),
        );
        setCautelasAtivas(data.filter((c) => c.status === "ativa"));
      }
    } catch (err) {
      console.error("Erro ao carregar cautelas do militar:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleAceitarCautela = async (cautela) => {
    setProcessandoId(cautela.id);

    try {
      // 1. Atualiza status da cautela para ativa
      const { error: errorCautela } = await supabase
        .from("cautelas")
        .update({ status: "ativa" })
        .eq("id", cautela.id);

      if (errorCautela) throw errorCautela;

      // 2. Atualiza status dos equipamentos vinculados para 'cautelado'
      const equipamentosIds = cautela.cautela_itens
        .map((i) => i.equipamentos?.id)
        .filter(Boolean);

      if (equipamentosIds.length > 0) {
        const { error: errorArma } = await supabase
          .from("equipamentos")
          .update({ status: "cautelado" })
          .in("id", equipamentosIds);

        if (errorArma) throw errorArma;
      }

      alert("Cautela confirmada e assinada com sucesso!");
      carregarCautelas();
    } catch (error) {
      alert("Erro ao confirmar cautela: " + error.message);
    } finally {
      setProcessandoId(null);
    }
  };

  if (loading)
    return (
      <div className="p-4 text-center text-gray-500">
        Carregando cautelas...
      </div>
    );

  return (
    <div className="max-w-md mx-auto p-4 min-h-screen bg-gray-50 pb-20">
      <h1 className="text-xl font-bold text-gray-800 mb-4 text-center">
        Minhas Cautelas
      </h1>

      {/* Seção: Aguardando Assinatura do Policial */}
      <div className="mb-6">
        <h2 className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-2 flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block animate-pulse"></span>
          Aguardando Sua Assinatura ({cautelasPendentes.length})
        </h2>

        {cautelasPendentes.length === 0 ? (
          <p className="text-sm text-gray-500 italic bg-white p-3 rounded-lg border border-gray-200">
            Nenhuma cautela pendente de confirmação.
          </p>
        ) : (
          cautelasPendentes.map((c) => {
            const item = c.cautela_itens?.[0] || {};
            const eq = item.equipamentos || {};

            return (
              <div
                key={c.id}
                className="bg-white p-4 rounded-xl shadow-sm border border-amber-300 mb-3 space-y-3"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-bold text-gray-900 block">
                      {eq.tipo?.toUpperCase()} -{" "}
                      {eq.modelo_descricao || eq.modelo || "N/I"}
                    </span>
                    <span className="text-xs text-gray-600 block">
                      Série:{" "}
                      <strong>
                        {eq.num_serie || eq.numero_serie || "N/I"}
                      </strong>{" "}
                      ({eq.calibre || "N/I"})
                    </span>
                  </div>
                  <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                    Pendente
                  </span>
                </div>

                <div className="bg-gray-50 p-2.5 rounded-lg text-xs space-y-1 text-gray-700">
                  <p>
                    <strong>Carregadores:</strong>{" "}
                    {item.quantidade_carregadores || 0}
                  </p>
                  <p>
                    <strong>Munição:</strong> {item.quantidade_municao || 0} un.
                    ({item.tipo_municao || "N/I"})
                  </p>
                  {item.observacoes && (
                    <p>
                      <strong>Obs:</strong> {item.observacoes}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => handleAceitarCautela(c)}
                  disabled={processandoId === c.id}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-lg shadow-sm disabled:bg-emerald-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
                >
                  {processandoId === c.id ? (
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
                      <span>Assinando e Confirmando...</span>
                    </>
                  ) : (
                    "✓ Aceitar e Assinar Cautela"
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Seção: Armamentos em Posse do Policial */}
      <div>
        <h2 className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2 flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
          Armamentos em Sua Posse ({cautelasAtivas.length})
        </h2>

        {cautelasAtivas.length === 0 ? (
          <p className="text-sm text-gray-500 italic bg-white p-3 rounded-lg border border-gray-200">
            Você não possui armamentos cautelados no momento.
          </p>
        ) : (
          cautelasAtivas.map((c) => {
            const item = c.cautela_itens?.[0] || {};
            const eq = item.equipamentos || {};

            return (
              <div
                key={c.id}
                className="bg-white p-4 rounded-xl shadow-sm border border-emerald-200 mb-3 space-y-2"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-bold text-gray-900 block">
                      {eq.tipo?.toUpperCase()} -{" "}
                      {eq.modelo_descricao || eq.modelo || "N/I"}
                    </span>
                    <span className="text-xs text-gray-600 block">
                      Série:{" "}
                      <strong>
                        {eq.num_serie || eq.numero_serie || "N/I"}
                      </strong>
                    </span>
                  </div>
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                    Ativa
                  </span>
                </div>

                <div className="text-xs text-gray-600">
                  <p>
                    Munição: {item.quantidade_municao || 0} un. (
                    {item.tipo_municao || "N/I"}) | Carregadores:{" "}
                    {item.quantidade_carregadores || 0}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Cautelado em:{" "}
                    {c.data_cautela
                      ? `${new Date(c.data_cautela).toLocaleDateString("pt-BR")} às ${new Date(c.data_cautela).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                      : "N/I"}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
