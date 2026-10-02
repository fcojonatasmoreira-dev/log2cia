import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  PlusCircle,
  RefreshCw,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const dataBR = (valor) => {
  if (!valor) return "—";
  const d = new Date(`${valor}T00:00:00`);
  return Number.isNaN(d.getTime()) ? valor : d.toLocaleDateString("pt-BR");
};
const horasBR = (valor) =>
  `${Number(valor || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} h`;

export default function BancoHoras() {
  const navigate = useNavigate();
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [policiais, setPoliciais] = useState([]);
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [filtro, setFiltro] = useState("pendente");
  const [carregando, setCarregando] = useState(true);
  const [analisando, setAnalisando] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [pareceres, setPareceres] = useState({});
  const [buscaPolicial, setBuscaPolicial] = useState("");
  const [policialSelecionado, setPolicialSelecionado] = useState("");
  const [podeExcluir, setPodeExcluir] = useState(false);
  const [excluindo, setExcluindo] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const [resBH, resPol] = await Promise.all([
        fetch("/api/banco-horas", { credentials: "include" }),
        fetch("/api/policiais", { credentials: "include" }),
      ]);
      const [bh, pol] = await Promise.all([resBH.json(), resPol.json()]);
      if (!resBH.ok)
        throw new Error(
          bh.error || "Não foi possível carregar as solicitações.",
        );
      if (!resPol.ok)
        throw new Error(pol.error || "Não foi possível carregar os policiais.");
      setSolicitacoes(bh.solicitacoes || []);
      setMovimentacoes(bh.movimentacoes || []);
      setPodeExcluir(bh.permissoes?.excluir_movimentacao === true);
      setPoliciais(pol.policiais || []);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);
  const policiaisPorId = useMemo(
    () => new Map(policiais.map((p) => [p.id, p])),
    [policiais],
  );
  const lista = useMemo(
    () => solicitacoes.filter((s) => filtro === "todas" || s.status === filtro),
    [solicitacoes, filtro],
  );
  const consultaPoliciais = useMemo(() => {
    const termo = buscaPolicial.trim().toLocaleLowerCase("pt-BR");
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
      .map((p) => {
        const movimentos = movimentacoes.filter((m) => m.policial_id === p.id);
        const saldo = movimentos
          .filter((m) => !m.excluido_em)
          .reduce((total, m) => {
            const horas = Number(m.horas || 0);
            if (m.tipo === "credito") return total + horas;
            if (m.tipo === "debito") return total - horas;
            if (m.tipo === "ajuste_zeragem") return total + horas;
            return total;
          }, 0);
        return { ...p, saldo: Number(saldo.toFixed(2)), movimentos };
      })
      .sort((a, b) =>
        (a.nome_guerra || a.nome_completo || "").localeCompare(
          b.nome_guerra || b.nome_completo || "",
          "pt-BR",
        ),
      );
  }, [policiais, movimentacoes, buscaPolicial]);
  const policialDetalhado = consultaPoliciais.find(
    (p) => p.id === policialSelecionado,
  );

  const excluirMovimentacao = async (movimentacao) => {
    if (!podeExcluir || !movimentacao?.id || excluindo) return;
    const confirmado = window.confirm(
      "Tem certeza de que deseja excluir definitivamente esta movimentação? Esta ação não pode ser desfeita.",
    );
    if (!confirmado) return;

    setExcluindo(movimentacao.id);
    setErro("");
    setSucesso("");
    try {
      const response = await fetch("/api/banco-horas", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "excluir_movimentacao",
          movimentacao_id: movimentacao.id,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json.error || "Não foi possível excluir a movimentação.");
      }
      setSucesso("Movimentação excluída definitivamente.");
      await carregar();
    } catch (e) {
      setErro(e.message || "Erro ao excluir a movimentação.");
    } finally {
      setExcluindo("");
    }
  };

  const analisar = async (solicitacao, status) => {
    const parecer = (pareceres[solicitacao.id] || "").trim();
    if (status === "indeferida" && !parecer) {
      setErro("Informe o motivo do indeferimento no campo de parecer.");
      return;
    }
    const acao = status === "deferida" ? "deferir" : "indeferir";
    if (!window.confirm(`Confirma ${acao} esta solicitação?`)) return;
    setAnalisando(solicitacao.id);
    setErro("");
    setSucesso("");
    try {
      const response = await fetch("/api/banco-horas", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          solicitacao_id: solicitacao.id,
          status,
          parecer: parecer || null,
        }),
      });
      const json = await response.json();
      if (!response.ok)
        throw new Error(
          json.error || "Não foi possível analisar a solicitação.",
        );
      setSucesso(
        `Solicitação ${status === "deferida" ? "deferida" : "indeferida"} com sucesso.`,
      );
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setAnalisando("");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Banco de Horas</h1>
          <p className="text-sm text-slate-500">
            Análise das solicitações de inclusão de horas e dispensa de serviço.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => navigate("/banco-horas/nova")}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
          >
            <PlusCircle className="w-4 h-4" /> Nova inserção
          </button>
          <button
            onClick={carregar}
            disabled={carregando}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" /> Atualizar
          </button>
        </div>
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
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock3 className="w-5 h-5 text-slate-500" />
            <h2 className="font-bold text-slate-800">Solicitações</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
              {lista.length}
            </span>
          </div>
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
          >
            <option value="pendente">Pendentes</option>
            <option value="deferida">Deferidas</option>
            <option value="indeferida">Indeferidas</option>
            <option value="todas">Todas</option>
          </select>
        </div>
        {carregando ? (
          <p className="p-5 text-sm text-slate-500">
            Carregando solicitações...
          </p>
        ) : lista.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">
            Nenhuma solicitação encontrada.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {lista.map((s) => {
              const p = policiaisPorId.get(s.policial_id);
              const pendente = s.status === "pendente";
              return (
                <article key={s.id} className="p-4 space-y-3">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-slate-800">
                          {p?.posto_graduacao ? `${p.posto_graduacao} ` : ""}
                          {p?.nome_guerra ||
                            p?.nome_completo ||
                            "Policial não localizado"}
                        </h3>
                        <span className="text-xs text-slate-500">
                          {p?.matricula || ""}
                        </span>
                        <span
                          className={`px-2 py-1 rounded-lg text-xs font-bold ${s.status === "pendente" ? "bg-amber-100 text-amber-700" : s.status === "deferida" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}
                        >
                          {s.status === "pendente"
                            ? "Pendente"
                            : s.status === "deferida"
                              ? "Deferida"
                              : "Indeferida"}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 mt-1">
                        {s.tipo === "dispensa"
                          ? "Dispensa de serviço"
                          : "Inclusão de horas"}{" "}
                        • {horasBR(s.horas_solicitadas)} • Data:{" "}
                        {dataBR(s.data_servico)} • Turno {s.turno || "—"}
                      </p>
                      {s.numero_ocorrencia && (
                        <p className="text-xs text-slate-500 mt-1">
                          Referência da ocorrência: {s.numero_ocorrencia}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-slate-400">
                      Solicitada em{" "}
                      {s.created_at
                        ? new Date(s.created_at).toLocaleString("pt-BR")
                        : "—"}
                    </span>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs font-bold uppercase text-slate-500 mb-1">
                      Justificativa
                    </p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">
                      {s.justificativa || "—"}
                    </p>
                  </div>
                  {!pendente && s.parecer && (
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs font-bold uppercase text-slate-500 mb-1">
                        Parecer
                      </p>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">
                        {s.parecer}
                      </p>
                    </div>
                  )}
                  {pendente && (
                    <div className="space-y-2">
                      <label className="block text-xs font-bold uppercase text-slate-500">
                        Parecer (obrigatório para indeferir)
                      </label>
                      <textarea
                        value={pareceres[s.id] || ""}
                        onChange={(e) =>
                          setPareceres((prev) => ({
                            ...prev,
                            [s.id]: e.target.value,
                          }))
                        }
                        rows={2}
                        maxLength={1000}
                        placeholder="Registre o parecer da análise..."
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm resize-y"
                      />
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          onClick={() => analisar(s, "indeferida")}
                          disabled={!!analisando}
                          className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                        >
                          <XCircle className="w-4 h-4" />
                          {analisando === s.id ? "Processando..." : "Indeferir"}
                        </button>
                        <button
                          onClick={() => analisar(s, "deferida")}
                          disabled={!!analisando}
                          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          {analisando === s.id ? "Processando..." : "Deferir"}
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-800">
              Consulta do Banco de Horas do efetivo
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Consulte o saldo individual e o histórico de movimentações dos
              policiais.
            </p>
          </div>
          <div className="relative w-full sm:max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={buscaPolicial}
              onChange={(e) => setBuscaPolicial(e.target.value)}
              placeholder="Buscar por nome, numeral ou matrícula..."
              className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        {carregando ? (
          <p className="p-5 text-sm text-slate-500">Carregando saldos...</p>
        ) : consultaPoliciais.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">
            Nenhum policial encontrado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="text-left p-3">Policial</th>
                  <th className="text-left p-3">Matrícula</th>
                  <th className="text-right p-3">Saldo atual</th>
                  <th className="text-right p-3">Movimentações</th>
                  <th className="text-right p-3">Ação</th>
                </tr>
              </thead>
              <tbody>
                {consultaPoliciais.map((p) => (
                  <tr
                    key={p.id}
                    className="border-t border-slate-100 hover:bg-slate-50/70"
                  >
                    <td className="p-3 font-semibold text-slate-800">
                      {p.posto_graduacao ? `${p.posto_graduacao} ` : ""}
                      {p.nome_guerra || p.nome_completo || "Policial sem nome"}
                    </td>
                    <td className="p-3 text-slate-600">{p.matricula || "—"}</td>
                    <td
                      className={`p-3 text-right font-bold ${p.saldo < 0 ? "text-rose-700" : "text-emerald-700"}`}
                    >
                      {horasBR(p.saldo)}
                    </td>
                    <td className="p-3 text-right text-slate-600">
                      {p.movimentos.length}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() =>
                          setPolicialSelecionado(
                            policialSelecionado === p.id ? "" : p.id,
                          )
                        }
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        {policialSelecionado === p.id
                          ? "Fechar histórico"
                          : "Ver histórico"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {policialDetalhado && (
          <div className="border-t border-slate-200 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h3 className="font-bold text-slate-800">
                  Histórico:{" "}
                  {policialDetalhado.nome_guerra ||
                    policialDetalhado.nome_completo}
                </h3>
                <p className="text-xs text-slate-500">
                  Matrícula: {policialDetalhado.matricula || "—"}
                </p>
              </div>
              <div className="text-lg font-extrabold text-slate-900">
                Saldo: {horasBR(policialDetalhado.saldo)}
              </div>
            </div>
            {policialDetalhado.movimentos.length === 0 ? (
              <p className="text-sm text-slate-500">
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
                      {podeExcluir && <th className="text-right p-3">Ação</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {policialDetalhado.movimentos.map((m) => (
                      <tr key={m.id} className="border-t border-slate-100">
                        <td className="p-3 whitespace-nowrap">
                          {dataBR(m.data_referencia || m.created_at)}
                        </td>
                        <td className="p-3">
                          {m.tipo === "credito"
                            ? "Crédito"
                            : m.tipo === "ajuste_zeragem"
                              ? "Ajuste"
                              : m.descricao?.toLowerCase().includes("dispensa")
                                ? "Dispensa"
                                : "Débito"}
                        </td>
                        <td className="p-3">
                          {m.descricao || "—"}
                          {m.turno ? ` • Turno ${m.turno}` : ""}
                        </td>
                        <td
                          className={`p-3 text-right font-bold whitespace-nowrap ${m.tipo === "credito" ? "text-emerald-700" : "text-rose-700"}`}
                        >
                          {m.tipo === "credito" ? "+" : "−"}
                          {horasBR(m.horas)}
                        </td>
                        {podeExcluir && (
                          <td className="p-3 text-right">
                            <button
                              onClick={() => excluirMovimentacao(m)}
                              disabled={!!excluindo}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {excluindo === m.id ? "Excluindo..." : "Excluir"}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
