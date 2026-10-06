import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Clock3,
  PlusCircle,
  RefreshCw,
  Wallet,
} from "lucide-react";

const formatarData = (valor) => {
  if (!valor) return "—";
  const data = new Date(`${valor}T00:00:00`);
  return Number.isNaN(data.getTime())
    ? valor
    : data.toLocaleDateString("pt-BR");
};

const formatarHoras = (valor) =>
  `${Number(valor || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} h`;

export default function NovaInsercaoBancoHoras() {
  const [policiais, setPoliciais] = useState([]);
  const [policialId, setPolicialId] = useState("");
  const [buscaPolicial, setBuscaPolicial] = useState("");
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [saldo, setSaldo] = useState(0);
  const [folgasDisponiveis, setFolgasDisponiveis] = useState(0);
  const [tipo, setTipo] = useState("credito");
  const [horas, setHoras] = useState("");
  const [quantidadeFolgas, setQuantidadeFolgas] = useState("1");
  const [descricao, setDescricao] = useState("");
  const [dataReferencia, setDataReferencia] = useState("");
  const [turno, setTurno] = useState("");
  const [turnoDescricao, setTurnoDescricao] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const carregarPoliciais = useCallback(async () => {
    const response = await fetch("/api/policiais", { credentials: "include" });
    const json = await response.json();
    if (!response.ok)
      throw new Error(json.error || "Não foi possível carregar os policiais.");
    const lista = (json.policiais || []).filter((p) => p.status !== "inativo");
    setPoliciais(lista);
    setPolicialId((atual) =>
      atual && lista.some((p) => p.id === atual) ? atual : "",
    );
  }, []);

  const carregarMovimentacoes = useCallback(
    async (id = policialId) => {
      if (!id) {
        setMovimentacoes([]);
        setSaldo(0);
        return;
      }
      const response = await fetch(
        `/api/banco-horas?policial_id=${encodeURIComponent(id)}`,
        { credentials: "include" },
      );
      const json = await response.json();
      if (!response.ok)
        throw new Error(
          json.error || "Não foi possível carregar o banco de horas.",
        );
      setMovimentacoes(json.movimentacoes || []);
      setSaldo(Number(json.saldo || 0));
      setFolgasDisponiveis(Number(json.folgas_disponiveis || 0));
    },
    [policialId],
  );

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      await carregarPoliciais();
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, [carregarPoliciais]);

  useEffect(() => {
    carregar();
  }, [carregar]);
  useEffect(() => {
    if (!policialId) return;
    setCarregando(true);
    setErro("");
    carregarMovimentacoes(policialId)
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, [policialId, carregarMovimentacoes]);

  const policialSelecionado = useMemo(
    () => policiais.find((p) => p.id === policialId),
    [policiais, policialId],
  );
  const policiaisFiltrados = useMemo(() => {
    const termo = buscaPolicial.trim().toLocaleLowerCase("pt-BR");
    if (!termo || policialId) return [];
    return policiais
      .filter((p) =>
        [
          p.nome_guerra,
          p.nome_completo,
          p.numeral,
          p.matricula,
          p.posto_graduacao,
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("pt-BR")
          .includes(termo),
      )
      .slice(0, 10);
  }, [policiais, buscaPolicial, policialId]);
  const nomePolicial = (p) =>
    `${p.posto_graduacao ? `${p.posto_graduacao} ` : ""}${p.nome_guerra || p.nome_completo || "Policial sem nome"} — ${p.numeral ? `${p.numeral} • ` : ""}${p.matricula || "Sem matrícula"}`;

  const registrar = async (e) => {
    e.preventDefault();
    setErro("");
    setSucesso("");
    if (!policialId || !descricao.trim()) {
      setErro("Selecione o policial e informe a descrição/justificativa.");
      return;
    }
    if (
      ["credito", "debito", "dispensa"].includes(tipo) &&
      (!Number.isFinite(Number(horas)) || Number(horas) <= 0)
    ) {
      setErro("Informe uma quantidade válida de horas.");
      return;
    }
    if (
      tipo === "concessao_folga" &&
      (!Number.isInteger(Number(quantidadeFolgas)) ||
        Number(quantidadeFolgas) <= 0)
    ) {
      setErro("Informe uma quantidade inteira de folgas.");
      return;
    }
    if (tipo === "utilizacao_folga" && !dataReferencia) {
      setErro("Informe a data de referência do serviço.");
      return;
    }
    if (turno === "OUTRO" && !turnoDescricao.trim()) {
      setErro("Descreva o outro turno.");
      return;
    }
    setSalvando(true);
    try {
      let body;
      if (tipo === "concessao_folga") {
        body = {
          acao: "conceder_folga",
          policial_id: policialId,
          quantidade_folgas: Number(quantidadeFolgas),
          descricao: descricao.trim(),
          data_referencia: dataReferencia || null,
        };
      } else if (tipo === "utilizacao_folga") {
        body = {
          acao: "utilizar_folga",
          policial_id: policialId,
          data_referencia: dataReferencia,
          turno: turno || null,
          turno_descricao: turno === "OUTRO" ? turnoDescricao.trim() : null,
          descricao: descricao.trim(),
        };
      } else {
        const tipoApi = tipo === "credito" ? "credito" : "debito";
        const descricaoFinal =
          tipo === "dispensa"
            ? `Dispensa de serviço (${Number(horas)}h) — ${descricao.trim()}`
            : descricao.trim();
        body = {
          acao: "movimentar",
          policial_id: policialId,
          tipo: tipoApi,
          horas: Number(horas),
          descricao: descricaoFinal,
          data_referencia: dataReferencia || null,
          turno: turno || null,
          turno_descricao: turno === "OUTRO" ? turnoDescricao.trim() : null,
        };
      }
      const response = await fetch("/api/banco-horas", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await response.json();
      if (!response.ok)
        throw new Error(
          json.error || "Não foi possível registrar a movimentação.",
        );
      setSucesso(
        tipo === "credito"
          ? "Crédito registrado com sucesso."
          : tipo === "debito"
            ? "Débito registrado com sucesso."
            : tipo === "dispensa"
              ? `Dispensa registrada como débito de ${Number(horas)} horas.`
              : tipo === "concessao_folga"
                ? "Folga de serviço concedida com sucesso."
                : "Folga de serviço utilizada com sucesso.",
      );
      setHoras("");
      setQuantidadeFolgas("1");
      setDescricao("");
      setDataReferencia("");
      setTurno("");
      setTurnoDescricao("");
      await carregarMovimentacoes(policialId);
    } catch (e2) {
      setErro(e2.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Banco de Horas</h1>
          <p className="text-sm text-slate-500">
            Gestão de créditos, débitos e dispensas dos policiais.
          </p>
        </div>
        <button
          onClick={() => {
            carregarPoliciais()
              .then(() => carregarMovimentacoes())
              .catch((e) => setErro(e.message));
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50"
        >
          <RefreshCw className="w-4 h-4" /> Atualizar
        </button>
      </div>
      {erro && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {erro}
        </div>
      )}
      {sucesso && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {sucesso}
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-blue-600" />
            <h2 className="font-bold text-slate-800">
              Registrar crédito, débito ou dispensa
            </h2>
          </div>
          <form
            onSubmit={registrar}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            <div className="sm:col-span-2 relative">
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                Policial
              </label>
              <input
                type="text"
                value={
                  policialSelecionado
                    ? nomePolicial(policialSelecionado)
                    : buscaPolicial
                }
                onChange={(e) => {
                  setBuscaPolicial(e.target.value);
                  setPolicialId("");
                }}
                required={!policialId}
                autoComplete="off"
                placeholder="Buscar por nome, numeral ou matrícula..."
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white"
              />
              {!policialId && buscaPolicial.trim() && (
                <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                  {policiaisFiltrados.length ? (
                    policiaisFiltrados.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setPolicialId(p.id);
                          setBuscaPolicial(nomePolicial(p));
                        }}
                        className="block w-full px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-blue-50"
                      >
                        {nomePolicial(p)}
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-2.5 text-sm text-slate-500">
                      Nenhum policial encontrado.
                    </p>
                  )}
                </div>
              )}
              {policialId && (
                <button
                  type="button"
                  onClick={() => {
                    setPolicialId("");
                    setBuscaPolicial("");
                  }}
                  className="mt-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  Alterar policial
                </button>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                Tipo de lançamento
              </label>
              <select
                value={tipo}
                onChange={(e) => {
                  const v = e.target.value;
                  setTipo(v);
                  setHoras("");
                  setQuantidadeFolgas("1");
                  setTurno(v === "concessao_folga" ? "" : "A");
                  setTurnoDescricao("");
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white"
              >
                <option value="credito">Crédito de horas</option>
                <option value="debito">Débito de horas</option>
                <option value="dispensa">
                  Dispensa de serviço (débito no banco)
                </option>
                <option value="concessao_folga">
                  Concessão de folga de serviço
                </option>
                <option value="utilizacao_folga">
                  Utilização de folga de serviço
                </option>
              </select>
            </div>
            {tipo === "utilizacao_folga" ? null : (
              <div>
                {tipo === "concessao_folga" ? (
                  <>
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                      Quantidade de folgas
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      max="99"
                      value={quantidadeFolgas}
                      onChange={(e) => setQuantidadeFolgas(e.target.value)}
                      required
                      className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white"
                      placeholder="Ex.: 1"
                    />
                  </>
                ) : (
                  <>
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                      Quantidade de horas
                    </label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      max="9999"
                      value={horas}
                      onChange={(e) => setHoras(e.target.value)}
                      readOnly={tipo === "dispensa"}
                      required
                      className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white read-only:bg-slate-100"
                      placeholder="Ex.: 12"
                    />
                  </>
                )}
              </div>
            )}
            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                {tipo === "concessao_folga"
                  ? "Data do crédito de folga de serviço"
                  : tipo === "utilizacao_folga"
                    ? "Data da utilização da folga de serviço"
                    : "Data de referência"}
              </label>
              <input
                type="date"
                value={dataReferencia}
                onChange={(e) => setDataReferencia(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white"
              />
              <p className="mt-1 text-xs text-slate-500">
                {tipo === "concessao_folga"
                  ? "Informe o dia em que o crédito de folga de serviço foi concedido."
                  : tipo === "utilizacao_folga"
                    ? "Informe o dia em que a folga de serviço foi utilizada."
                    : "Data usada como referência para este lançamento."}
              </p>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                Turno (opcional)
              </label>
              <select
                value={turno}
                onChange={(e) => {
                  setTurno(e.target.value);
                  if (e.target.value !== "OUTRO") setTurnoDescricao("");
                }}
                disabled={tipo === "concessao_folga"}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white disabled:bg-slate-100"
              >
                <option value="">Não se aplica</option>
                <option value="A">A (06h às 18h)</option>
                <option value="B">B (18h às 06h)</option>
                <option value="OUTRO">Outros</option>
              </select>
            </div>
            {turno === "OUTRO" && (
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                  Descrição do outro turno
                </label>
                <input
                  value={turnoDescricao}
                  onChange={(e) => setTurnoDescricao(e.target.value)}
                  required
                  maxLength={200}
                  placeholder="Ex.: 08h às 16h"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white"
                />
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                Descrição / justificativa
              </label>
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                required
                rows={3}
                maxLength={1000}
                placeholder={
                  tipo === "dispensa"
                    ? "Informe o motivo e a referência do serviço dispensado..."
                    : "Descreva o motivo do lançamento..."
                }
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm resize-y"
              />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={salvando || carregando || !policialId}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <PlusCircle className="w-4 h-4" />
                {salvando ? "Registrando..." : "Registrar movimentação"}
              </button>
            </div>
          </form>
          <p className="text-xs text-slate-500">
            Folgas são controladas como direitos de serviço, independentemente
            da carga horária do serviço em que forem utilizadas.
          </p>
        </section>
        <section className="bg-slate-900 rounded-2xl p-5 text-white shadow-sm h-fit">
          <div className="flex items-center gap-2 text-slate-300 text-sm">
            <Wallet className="w-5 h-5" /> Saldo atual
          </div>
          <div className="mt-3 text-3xl font-extrabold">
            {formatarHoras(saldo)}
          </div>
          <div className="mt-3 border-t border-slate-700 pt-3">
            <div className="text-xs text-slate-400">Folgas disponíveis</div>
            <div className="text-2xl font-extrabold">{folgasDisponiveis}</div>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {policialSelecionado
              ? `${policialSelecionado.nome_guerra || policialSelecionado.nome_completo} • ${policialSelecionado.matricula}`
              : "Selecione um policial"}
          </p>
        </section>
      </div>
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
          <Clock3 className="w-5 h-5 text-slate-500" />
          <h2 className="font-bold text-slate-800">
            Histórico de movimentações
          </h2>
        </div>
        {carregando ? (
          <p className="p-5 text-sm text-slate-500">Carregando...</p>
        ) : movimentacoes.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">
            Nenhuma movimentação registrada para este policial.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="text-left p-3">Data</th>
                  <th className="text-left p-3">Tipo</th>
                  <th className="text-left p-3">Descrição</th>
                  <th className="text-right p-3">Horas</th>
                </tr>
              </thead>
              <tbody>
                {movimentacoes.map((m) => (
                  <tr key={m.id} className="border-t border-slate-100">
                    <td className="p-3 whitespace-nowrap">
                      {m.data_referencia
                        ? formatarData(m.data_referencia)
                        : new Date(m.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-1 rounded-lg text-xs font-bold ${m.tipo === "credito" || m.tipo === "concessao_folga" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}
                      >
                        {m.tipo === "credito"
                          ? "Crédito"
                          : m.tipo === "concessao_folga"
                            ? "Crédito de folga de serviço"
                            : m.tipo === "utilizacao_folga"
                              ? "Utilização de folga de serviço"
                              : m.descricao?.toLowerCase().includes("dispensa")
                                ? "Dispensa"
                                : m.tipo === "ajuste_zeragem"
                                  ? "Ajuste"
                                  : "Débito"}
                      </span>
                    </td>
                    <td className="p-3 min-w-64">
                      {m.descricao || "—"}
                      {m.turno ? (
                        <span className="ml-2 text-xs text-slate-500">
                          Turno {m.turno}
                        </span>
                      ) : null}
                    </td>
                    <td
                      className={`p-3 text-right font-bold whitespace-nowrap ${m.tipo === "credito" ? "text-emerald-700" : "text-rose-700"}`}
                    >
                      {m.tipo === "concessao_folga"
                        ? `+${m.quantidade_folgas || 0} folga(s)`
                        : m.tipo === "utilizacao_folga"
                          ? `−${m.quantidade_folgas || 1} folga • ${formatarHoras(m.horas_servico)}`
                          : `${m.tipo === "credito" ? "+" : "−"}${formatarHoras(m.horas)}`}
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
