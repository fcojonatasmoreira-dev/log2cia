import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Pencil,
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
  const [podeExcluirMovimentacao, setPodeExcluirMovimentacao] = useState(false);
  const [podeEditarMovimentacao, setPodeEditarMovimentacao] = useState(false);
  const [excluindoMovimentacao, setExcluindoMovimentacao] = useState("");
  const [editandoMovimentacao, setEditandoMovimentacao] = useState(null);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

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
      setPoliciais(pol.policiais || []);
      setPodeEditarMovimentacao(Boolean(bh.permissoes?.editar_movimentacao));
      setPodeExcluirMovimentacao(Boolean(bh.permissoes?.excluir_movimentacao));
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
        const saldo = movimentos.reduce((total, m) => {
          const horas = Number(m.horas || 0);
          if (m.tipo === "credito") return total + horas;
          if (m.tipo === "debito") return total - horas;
          if (m.tipo === "ajuste_zeragem") return total + horas;
          return total;
        }, 0);
        const folgas = movimentos.reduce((total, m) => {
          if (m.excluido_em) return total;
          if (m.tipo === "concessao_folga")
            return total + Number(m.quantidade_folgas || 0);
          if (m.tipo === "utilizacao_folga")
            return total - Number(m.quantidade_folgas || 0);
          return total;
        }, 0);
        return {
          ...p,
          saldo: Number(saldo.toFixed(2)),
          folgas: Math.max(0, folgas),
          movimentos,
        };
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
    if (
      !window.confirm(
        "Confirma a exclusão desta movimentação? Esta ação excluirá o lançamento do Banco de Horas e poderá alterar o saldo do policial.",
      )
    )
      return;

    setExcluindoMovimentacao(movimentacao.id);
    setErro("");
    setSucesso("");
    try {
      const response = await fetch("/api/banco-horas", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movimentacao_id: movimentacao.id }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          json.error || "Não foi possível excluir a movimentação.",
        );
      }
      setSucesso("Movimentação excluída com sucesso.");
      await carregar();
    } catch (e) {
      setErro(e.message || "Não foi possível excluir a movimentação.");
    } finally {
      setExcluindoMovimentacao("");
    }
  };

  const editarMovimentacao = (movimentacao) => {
    if (!["credito", "debito", "concessao_folga"].includes(movimentacao.tipo)) {
      setErro(
        "Este tipo de movimentação não pode ser editado por esta tela.",
      );
      return;
    }

    setErro("");
    setSucesso("");
    setEditandoMovimentacao({
      ...movimentacao,
      horas: Number(movimentacao.horas || 0),
      quantidade_folgas: Number(movimentacao.quantidade_folgas || 0),
      descricao: movimentacao.descricao || "",
      data_referencia: movimentacao.data_referencia || "",
      turno: movimentacao.turno || "",
      turno_descricao: movimentacao.turno_descricao || "",
    });
  };

  const salvarEdicaoMovimentacao = async (event) => {
    event.preventDefault();

    if (!editandoMovimentacao) return;

    setSalvandoEdicao(true);
    setErro("");
    setSucesso("");

    try {
      const response = await fetch("/api/banco-horas", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "editar_movimentacao",
          movimentacao_id: editandoMovimentacao.id,
          tipo: editandoMovimentacao.tipo,
          horas: editandoMovimentacao.horas,
          quantidade_folgas: editandoMovimentacao.quantidade_folgas,
          descricao: editandoMovimentacao.descricao,
          data_referencia: editandoMovimentacao.data_referencia || null,
          turno: editandoMovimentacao.turno || null,
          turno_descricao: editandoMovimentacao.turno_descricao || "",
        }),
      });

      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          json.error || "Não foi possível editar a movimentação.",
        );
      }

      setSucesso("Movimentação atualizada com sucesso.");
      setEditandoMovimentacao(null);
      await carregar();
    } catch (e) {
      setErro(e.message || "Não foi possível editar a movimentação.");
    } finally {
      setSalvandoEdicao(false);
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
            Análise das solicitações de inclusão de horas, crédito de folga e
            dispensa de serviço.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(() => {
            const usuarioSalvo = JSON.parse(localStorage.getItem("log2cia_user") || "{}");
            const role = String(usuarioSalvo?.role || "").trim().toLowerCase();
            return ["master", "p1"].includes(role) ? (
              <button
                onClick={() => navigate("/banco-horas/nova")}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
              >
                <PlusCircle className="w-4 h-4" /> Nova inserção
              </button>
            ) : null;
          })()}
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
                          : s.tipo === "folga"
                            ? "Crédito de folga"
                            : "Inclusão de horas"}{" "}
                        •{" "}
                        {s.tipo === "folga"
                          ? `${s.quantidade_folgas || 1} folga(s)`
                          : horasBR(s.horas_solicitadas)}
                        {s.tipo === "folga" ? (
                          <> • Fato gerador: {dataBR(s.data_fato_beneficio)}</>
                        ) : (
                          <>
                            {" "}
                            • Data: {dataBR(s.data_servico)} • Turno{" "}
                            {s.turno === "OUTRO"
                              ? s.turno_descricao || "Outros"
                              : s.turno || "—"}
                            {s.tipo === "dispensa" && s.origem_dispensa ? (
                              <>
                                {" "}
                                • Compensação:{" "}
                                {s.origem_dispensa === "folga"
                                  ? "Folga disponível"
                                  : "Banco de Horas"}
                              </>
                            ) : null}
                          </>
                        )}
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
                  {!pendente && (s.parecer || s.analisada_por) && (
                    <div className="rounded-xl bg-slate-50 p-3 space-y-1">
                      <p className="text-xs font-bold uppercase text-slate-500 mb-1">
                        Parecer
                      </p>
                      {s.parecer && (
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">
                          {s.parecer}
                        </p>
                      )}
                      {s.analisada_por && (
                        <p className="text-xs text-slate-500">
                          Analisada por: {policiaisPorId.get(s.analisada_por)?.nome_guerra || s.analisada_por}
                          {s.analisada_em ? ` • ${new Date(s.analisada_em).toLocaleString("pt-BR")}` : ""}
                        </p>
                      )}
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
                  <th className="text-right p-3">Folgas</th>
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
                    <td className="p-3 text-right font-bold text-slate-700">
                      {p.folgas}
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
              <div className="text-right text-lg font-extrabold text-slate-900">
                <div>Saldo: {horasBR(policialDetalhado.saldo)}</div>
                <div className="text-sm text-slate-500">
                  Folgas disponíveis: {policialDetalhado.folgas}
                </div>
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
                      {(podeEditarMovimentacao || podeExcluirMovimentacao) && (
                        <th className="text-right p-3">Ação</th>
                      )}
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
                            : m.tipo === "concessao_folga"
                              ? "Concessão de folga"
                              : m.tipo === "utilizacao_folga"
                                ? "Utilização de folga"
                                : m.tipo === "ajuste_zeragem"
                                  ? "Ajuste"
                                  : m.descricao
                                        ?.toLowerCase()
                                        .includes("dispensa")
                                    ? "Dispensa"
                                    : "Débito"}
                        </td>
                        <td className="p-3">
                          {m.descricao || "—"}
                          {m.turno ? ` • Turno ${m.turno}` : ""}
                        </td>
                        <td
                          className={`p-3 text-right font-bold whitespace-nowrap ${m.tipo === "credito" || m.tipo === "concessao_folga" ? "text-emerald-700" : "text-rose-700"}`}
                        >
                          {m.tipo === "concessao_folga"
                            ? `+${m.quantidade_folgas || 0} folga(s)`
                            : m.tipo === "utilizacao_folga"
                              ? `−${m.quantidade_folgas || 1} folga • ${horasBR(m.horas_servico)}`
                              : `${m.tipo === "credito" ? "+" : "−"}${horasBR(m.horas)}`}
                        </td>
                        {(podeEditarMovimentacao || podeExcluirMovimentacao) && (
                          <td className="p-3 text-right">
                            <div className="inline-flex items-center gap-2">
                              {podeEditarMovimentacao &&
                                ["credito", "debito", "concessao_folga"].includes(m.tipo) && (
                                  <button
                                    type="button"
                                    onClick={() => editarMovimentacao(m)}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                                    title="Editar movimentação"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                    Editar
                                  </button>
                                )}
                              {podeExcluirMovimentacao && (
                                <button
                                  type="button"
                                  onClick={() => excluirMovimentacao(m)}
                                  disabled={excluindoMovimentacao === m.id}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                                  title="Excluir movimentação"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  {excluindoMovimentacao === m.id
                                    ? "Excluindo..."
                                    : "Excluir"}
                                </button>
                              )}
                            </div>
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
        {editandoMovimentacao && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Editar movimentação
                  </h3>
                  <p className="text-xs text-slate-500">
                    Altere somente os dados do lançamento.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditandoMovimentacao(null)}
                  disabled={salvandoEdicao}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                  title="Fechar"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={salvarEdicaoMovimentacao} className="mt-4 space-y-4">
                {editandoMovimentacao.tipo === "concessao_folga" ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-slate-600">
                        Tipo
                      </span>
                      <input
                        type="text"
                        value="Concessão de folga"
                        disabled
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-slate-600">
                        Quantidade de folgas
                      </span>
                      <input
                        type="number"
                        min="1"
                        max="99"
                        step="1"
                        required
                        value={editandoMovimentacao.quantidade_folgas}
                        onChange={(e) =>
                          setEditandoMovimentacao((atual) => ({
                            ...atual,
                            quantidade_folgas: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                      />
                    </label>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-slate-600">
                        Tipo
                      </span>
                      <select
                        value={editandoMovimentacao.tipo}
                        onChange={(e) =>
                          setEditandoMovimentacao((atual) => ({
                            ...atual,
                            tipo: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                      >
                        <option value="credito">Crédito</option>
                        <option value="debito">Débito</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-slate-600">
                        Horas
                      </span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        required
                        value={editandoMovimentacao.horas}
                        onChange={(e) =>
                          setEditandoMovimentacao((atual) => ({
                            ...atual,
                            horas: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                      />
                    </label>
                  </div>
                )}

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">
                    Descrição
                  </span>
                  <textarea
                    required
                    rows={3}
                    value={editandoMovimentacao.descricao}
                    onChange={(e) =>
                      setEditandoMovimentacao((atual) => ({
                        ...atual,
                        descricao: e.target.value,
                      }))
                    }
                    className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                  />
                </label>

                <div className={editandoMovimentacao.tipo === "concessao_folga" ? "grid grid-cols-1 gap-4" : "grid grid-cols-1 gap-4 sm:grid-cols-2"}>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">
                      Data de referência
                    </span>
                    <input
                      type="date"
                      value={editandoMovimentacao.data_referencia}
                      onChange={(e) =>
                        setEditandoMovimentacao((atual) => ({
                          ...atual,
                          data_referencia: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                    />
                  </label>

                  {editandoMovimentacao.tipo !== "concessao_folga" && (
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-slate-600">
                        Turno
                      </span>
                      <select
                        value={editandoMovimentacao.turno}
                        onChange={(e) =>
                          setEditandoMovimentacao((atual) => ({
                            ...atual,
                            turno: e.target.value,
                            turno_descricao:
                              e.target.value === "OUTRO"
                                ? atual.turno_descricao
                                : "",
                          }))
                        }
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                      >
                        <option value="">Não informado</option>
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="OUTRO">Outros</option>
                      </select>
                    </label>
                  )}
                </div>

                {editandoMovimentacao.tipo !== "concessao_folga" && editandoMovimentacao.turno === "OUTRO" && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">
                      Descrição do turno
                    </span>
                    <input
                      type="text"
                      required
                      value={editandoMovimentacao.turno_descricao}
                      onChange={(e) =>
                        setEditandoMovimentacao((atual) => ({
                          ...atual,
                          turno_descricao: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                    />
                  </label>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditandoMovimentacao(null)}
                    disabled={salvandoEdicao}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={salvandoEdicao}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {salvandoEdicao ? "Salvando..." : "Salvar alterações"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
    </div>
  );
}
