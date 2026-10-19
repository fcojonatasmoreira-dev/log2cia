import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import ResumoChecklistViatura from "../components/viaturas/ResumoChecklistViatura";

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
      <header><p className="text-sm font-semibold text-blue-700">Log2CIA · Viaturas</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Checklist de {etapa}</h1><p className="mt-1 text-sm text-slate-500">Consulta compartilhada somente para leitura.</p></header>
      {erro ? <p role="alert" className="rounded-lg bg-rose-50 p-4 text-sm text-rose-700">{erro}</p> : !dados ? <p className="text-sm text-slate-500">Carregando checklist…</p> : <>
        <dl className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Viatura</dt><dd className="font-semibold text-slate-900">{dados.viatura?.identificacao || "—"} · {dados.viatura?.placa || "—"}</dd></div><div><dt className="text-slate-500">Data e hora</dt><dd className="font-semibold text-slate-900">{new Date(dados.data_hora).toLocaleString("pt-BR")}</dd></div><div><dt className="text-slate-500">Quilometragem</dt><dd className="font-semibold text-slate-900">{new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(dados.quilometragem)} km</dd></div></dl>
        <ResumoChecklistViatura titulo={`Checklist de ${etapa}`} checklist={dados.checklist}/>
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-800">Fotos anexadas</h2>
          {dados.fotos?.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{dados.fotos.map((url, indice) => <a key={`${indice}-${url}`} href={url} target="_blank" rel="noreferrer" aria-label={`Abrir foto ${indice + 1} do checklist`}><img src={url} alt={`Foto ${indice + 1} do checklist`} loading="lazy" className="aspect-square w-full rounded-lg border border-slate-200 object-cover"/></a>)}</div> : <p className="text-xs text-slate-500">Nenhuma foto foi anexada a este checklist.</p>}
        </section>
      </>}
    </article>
  </main>;
}
