import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import ResumoChecklistViatura from "../components/viaturas/ResumoChecklistViatura";

const rotulosMovimentacao = { inicio_servico: "Entrada de serviço", retirada_oficina: "Retirada da oficina", recebimento_opm: "Recebimento de outra OPM", viatura_nova: "Recebimento de viatura nova", fim_servico: "Fim de serviço", encaminhamento_oficina: "Encaminhamento à oficina", devolucao_opm: "Devolução à OPM de origem", baixa_definitiva: "Baixa definitiva", outras_situacoes: "Outras situações" };

function FotosChecklist({ fotos = [] }) {
  return <section className="space-y-2"><h3 className="text-sm font-semibold text-slate-800">Fotos anexadas</h3>{fotos.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{fotos.map((url, indice) => <a key={`${indice}-${url}`} href={url} target="_blank" rel="noreferrer" aria-label={`Abrir foto ${indice + 1} do checklist`}><img src={url} alt={`Foto ${indice + 1} do checklist`} loading="lazy" className="aspect-square w-full rounded-lg border border-slate-200 object-cover"/></a>)}</div> : <p className="text-xs text-slate-500">Nenhuma foto foi anexada a esta etapa.</p>}</section>;
}

function DadosEtapa({ titulo, etapa }) {
  if (!etapa) return <section className="rounded-xl border border-slate-200 p-4"><h2 className="font-semibold text-slate-800">{titulo}</h2><p className="mt-1 text-sm text-slate-500">Esta etapa ainda não foi registrada.</p></section>;
  const responsavel = etapa.responsavel;
  return <section className="space-y-4 rounded-xl border border-slate-200 p-4">
    <h2 className="font-semibold text-slate-800">{titulo}</h2>
    <dl className="grid gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-2">
      <div><dt className="text-slate-500">Data e hora</dt><dd className="font-semibold">{new Date(etapa.data_hora).toLocaleString("pt-BR")}</dd></div>
      <div><dt className="text-slate-500">Quilometragem</dt><dd className="font-semibold">{new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(etapa.quilometragem)} km</dd></div>
      <div><dt className="text-slate-500">Tipo de movimentação</dt><dd className="font-semibold">{rotulosMovimentacao[etapa.tipo] || etapa.tipo || "—"}{etapa.tipo_detalhe ? ` · ${etapa.tipo_detalhe}` : ""}</dd></div>
      <div><dt className="text-slate-500">Turno do serviço</dt><dd className="font-semibold">Turno {etapa.turno || "—"} {etapa.turno === "A" ? "(06h–18h)" : etapa.turno === "B" ? "(18h–06h)" : ""}</dd></div>
      <div><dt className="text-slate-500">Posto/graduação</dt><dd className="font-semibold">{responsavel?.posto_graduacao || "—"}</dd></div>
      <div><dt className="text-slate-500">Nome de guerra</dt><dd className="font-semibold">{responsavel?.nome_guerra || "—"}</dd></div>
      <div><dt className="text-slate-500">Matrícula</dt><dd className="font-semibold">{responsavel?.matricula || "—"}</dd></div>
    </dl>
    <ResumoChecklistViatura titulo={`Itens do checklist de ${titulo.toLowerCase()}`} checklist={etapa.checklist}/>
    {etapa.observacoes && <p className="whitespace-pre-wrap text-sm"><strong>Observações:</strong> {etapa.observacoes}</p>}
    <FotosChecklist fotos={etapa.fotos}/>
  </section>;
}

export default function ChecklistPublico() {
  const { token } = useParams();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    fetch(`/api/viaturas?recurso=checklist-publico&token=${encodeURIComponent(token || "")}`, { cache: "no-store" })
      .then(async (resposta) => {
        const resultado = await resposta.json().catch(() => ({}));
        if (!resposta.ok) throw new Error(resultado.error || "Este link de checklist é inválido ou expirou.");
        return resultado;
      })
      .then((resultado) => { if (ativo) setDados(resultado); })
      .catch((error) => { if (ativo) setErro(error.message); });
    return () => { ativo = false; };
  }, [token]);

  const etapa = dados?.etapa === "entrada" ? "entrada" : "saída";
  return <main className="min-h-screen bg-slate-100 px-4 py-8">
    <article className="mx-auto max-w-3xl space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <header><p className="text-sm font-semibold text-blue-700">Log2CIA · Viaturas</p><h1 className="mt-1 text-2xl font-bold text-slate-900">{dados?.etapa === "completo" ? "Checklist da movimentação" : `Checklist de ${etapa}`}</h1><p className="mt-1 text-sm text-slate-500">Consulta compartilhada somente para leitura.</p></header>
      {erro ? <p role="alert" className="rounded-lg bg-rose-50 p-4 text-sm text-rose-700">{erro}</p> : !dados ? <p className="text-sm text-slate-500">Carregando checklist…</p> : <>
        <div><dt className="text-slate-500">Viatura</dt><dd className="rounded-xl bg-slate-50 p-4 font-semibold text-slate-900">{dados.viatura?.identificacao || "—"} · {dados.viatura?.placa || "—"}</dd></div>
        {dados.etapa === "completo" ? <div className="space-y-4"><DadosEtapa titulo="Entrada" etapa={dados.etapas?.entrada}/><DadosEtapa titulo="Saída" etapa={dados.etapas?.saida}/></div> : <>
          <DadosEtapa titulo={etapa === "entrada" ? "Entrada" : "Saída"} etapa={{ data_hora: dados.data_hora, quilometragem: dados.quilometragem, tipo: dados.tipo, tipo_detalhe: dados.tipo_detalhe, observacoes: dados.observacoes, turno: dados.turno, responsavel: dados.responsavel, checklist: dados.checklist, fotos: dados.fotos }}/>
        </>}
      </>}
    </article>
  </main>;
}
