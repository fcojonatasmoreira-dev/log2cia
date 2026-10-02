import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Clock3, PlusCircle, RefreshCw, X } from "lucide-react";

const dataBR = (valor) => {
  if (!valor) return "—";
  const data = new Date(`${String(valor).slice(0, 10)}T00:00:00`);
  return Number.isNaN(data.getTime())
    ? valor
    : data.toLocaleDateString("pt-BR");
};
const horasBR = (valor) =>
  `${Number(valor || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} h`;
const statusInfo = {
  pendente: { label: "Pendente", classe: "bg-amber-100 text-amber-700" },
  deferida: { label: "Deferida", classe: "bg-emerald-100 text-emerald-700" },
  indeferida: { label: "Indeferida", classe: "bg-rose-100 text-rose-700" },
};

export default function BancoHorasPolicial() {
  const [dados, setDados] = useState({
    saldo: 0,
    movimentacoes: [],
    solicitacoes: [],
  });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [formAberto, setFormAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [tipo, setTipo] = useState("inclusao_horas");
  const [horas, setHoras] = useState("");
  const [dataServico, setDataServico] = useState("");
  const [turno, setTurno] = useState("A");
  const [ocorrencia, setOcorrencia] = useState("");
  const [justificativa, setJustificativa] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const response = await fetch("/api/banco-horas", {
        credentials: "include",
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          json.error || "Não foi possível carregar seu Banco de Horas.",
        );
      setDados({
        saldo: Number(json.saldo || 0),
        movimentacoes: json.movimentacoes || [],
        solicitacoes: json.solicitacoes || [],
      });
    } catch (e) {
      setErro(e.message || "Não foi possível carregar seu Banco de Horas.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const enviarSolicitacao = async (e) => {
    e.preventDefault();
    setErro("");
    setSucesso("");
    if (!dataServico || !["A", "B"].includes(turno) || !justificativa.trim()) {
      setErro("Informe a data do serviço, o turno e a justificativa.");
      return;
    }
    if (
      tipo === "inclusao_horas" &&
      (!Number.isFinite(Number(horas)) ||
        Number(horas) <= 0 ||
        !ocorrencia.trim())
    ) {
      setErro(
        "Para solicitar inclusão, informe uma quantidade válida de horas e a referência da ocorrência.",
      );
      return;
    }
    setEnviando(true);
    try {
      const response = await fetch("/api/banco-horas", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          horas_solicitadas: tipo === "dispensa" ? 12 : Number(horas),
          data_servico: dataServico,
          turno,
          numero_ocorrencia:
            tipo === "inclusao_horas" ? ocorrencia.trim() : null,
          justificativa: justificativa.trim(),
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(json.error || "Não foi possível enviar a solicitação.");
      setSucesso(
        "Solicitação enviada com sucesso. Ela ficará pendente até a análise do P1.",
      );
      setFormAberto(false);
      setTipo("inclusao_horas");
      setHoras("");
      setDataServico("");
      setTurno("A");
      setOcorrencia("");
      setJustificativa("");
      await carregar();
    } catch (e2) {
      setErro(e2.message || "Não foi possível enviar a solicitação.");
    } finally {
      setEnviando(false);
    }
  };

  const movimentacoes = useMemo(
    () => dados.movimentacoes || [],
    [dados.movimentacoes],
  );
  const solicitacoes = useMemo(
    () => dados.solicitacoes || [],
    [dados.solicitacoes],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Meu Banco de Horas
          </h1>
          <p className="text-sm text-slate-500">
            Consulte seu saldo, solicite horas ou dispensa e acompanhe suas
            solicitações.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setFormAberto((v) => !v);
              setErro("");
              setSucesso("");
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <PlusCircle className="w-4 h-4" />
            {formAberto ? "Fechar formulário" : "Nova solicitação"}
          </button>
          <button
            onClick={carregar}
            disabled={carregando}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </button>
        </div>
      </div>
      {erro && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {erro}
        </div>
      )}
      {sucesso && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {sucesso}
        </div>
      )}
      <section className="rounded-2xl bg-slate-900 p-5 text-white shadow-sm">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <Clock3 className="h-5 w-5" />
          Saldo atual
        </div>
        <div className="mt-2 text-3xl font-extrabold">
          {horasBR(dados.saldo)}
        </div>
      </section>
      {formAberto && (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-800">Nova solicitação</h2>
            <button
              type="button"
              onClick={() => setFormAberto(false)}
              className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <form
            onSubmit={enviarSolicitacao}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
                Tipo de solicitação
              </label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="inclusao_horas">Inclusão de horas</option>
                <option value="dispensa">Dispensa de serviço</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
                Quantidade de horas
              </label>
              <input
                type="number"
                min="0.01"
                max="9999"
                step="0.01"
                value={tipo === "dispensa" ? "12" : horas}
                onChange={(e) => setHoras(e.target.value)}
                readOnly={tipo === "dispensa"}
                required={tipo === "inclusao_horas"}
                placeholder="Ex.: 12"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm read-only:bg-slate-100"
              />
              <p className="mt-1 text-xs text-slate-500">
                {tipo === "dispensa"
                  ? "A dispensa corresponde a 12 horas."
                  : "Informe a quantidade a solicitar."}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
                Data do serviço
              </label>
              <input
                type="date"
                value={dataServico}
                onChange={(e) => setDataServico(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
                Turno
              </label>
              <select
                value={turno}
                onChange={(e) => setTurno(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="A">A (06h às 18h)</option>
                <option value="B">B (18h às 06h)</option>
              </select>
            </div>
            {tipo === "inclusao_horas" && (
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
                  Número / referência da ocorrência no livro
                </label>
                <input
                  value={ocorrencia}
                  onChange={(e) => setOcorrencia(e.target.value)}
                  required
                  maxLength={200}
                  placeholder="Informe o número da ocorrência"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                />
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
                Justificativa
              </label>
              <textarea
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                required
                maxLength={1000}
                rows={4}
                placeholder="Descreva o motivo da solicitação..."
                className="w-full resize-y rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
              />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={enviando || carregando}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <PlusCircle className="h-4 w-4" />
                {enviando ? "Enviando..." : "Enviar solicitação"}
              </button>
            </div>
          </form>
        </section>
      )}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4">
          <h2 className="font-bold text-slate-800">Minhas solicitações</h2>
        </div>
        {carregando ? (
          <p className="p-5 text-sm text-slate-500">Carregando...</p>
        ) : solicitacoes.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">
            Você ainda não possui solicitações.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {solicitacoes.map((s) => (
              <article key={s.id} className="space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm text-slate-800">
                    {s.tipo === "dispensa"
                      ? "Dispensa de serviço"
                      : "Inclusão de horas"}{" "}
                    · {horasBR(s.horas_solicitadas)}
                  </strong>
                  <span
                    className={`rounded-lg px-2 py-1 text-xs font-bold ${statusInfo[s.status]?.classe || "bg-slate-100 text-slate-600"}`}
                  >
                    {statusInfo[s.status]?.label || s.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Serviço: {dataBR(s.data_servico)} · Turno {s.turno || "—"}
                  {s.numero_ocorrencia
                    ? ` · Ocorrência: ${s.numero_ocorrencia}`
                    : ""}
                </p>
                <p className="whitespace-pre-wrap text-sm text-slate-700">
                  {s.justificativa || "—"}
                </p>
                {s.parecer && (
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="mb-1 text-xs font-bold uppercase text-slate-500">
                      Parecer do P1
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-slate-700">
                      {s.parecer}
                    </p>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 p-4">
          <Clock3 className="h-5 w-5 text-slate-500" />
          <h2 className="font-bold text-slate-800">
            Meu histórico de movimentações
          </h2>
        </div>
        {carregando ? (
          <p className="p-5 text-sm text-slate-500">Carregando...</p>
        ) : movimentacoes.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">
            Nenhuma movimentação registrada.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-3 text-left">Data</th>
                  <th className="p-3 text-left">Tipo</th>
                  <th className="p-3 text-left">Descrição</th>
                  <th className="p-3 text-right">Horas</th>
                </tr>
              </thead>
              <tbody>
                {movimentacoes.map((m) => (
                  <tr key={m.id} className="border-t border-slate-100">
                    <td className="whitespace-nowrap p-3">
                      {m.data_referencia
                        ? dataBR(m.data_referencia)
                        : m.created_at
                          ? new Date(m.created_at).toLocaleDateString("pt-BR")
                          : "—"}
                    </td>
                    <td className="p-3">
                      <span
                        className={`rounded-lg px-2 py-1 text-xs font-bold ${m.tipo === "credito" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}
                      >
                        {m.tipo === "credito"
                          ? "Crédito"
                          : m.tipo === "ajuste_zeragem"
                            ? "Ajuste"
                            : m.descricao?.toLowerCase().includes("dispensa")
                              ? "Dispensa"
                              : "Débito"}
                      </span>
                    </td>
                    <td className="min-w-64 p-3">
                      {m.descricao || "—"}
                      {m.turno ? (
                        <span className="ml-2 text-xs text-slate-500">
                          Turno {m.turno}
                        </span>
                      ) : null}
                    </td>
                    <td
                      className={`whitespace-nowrap p-3 text-right font-bold ${m.tipo === "credito" ? "text-emerald-700" : "text-rose-700"}`}
                    >
                      {m.tipo === "credito" ? "+" : "−"}
                      {horasBR(m.horas)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
