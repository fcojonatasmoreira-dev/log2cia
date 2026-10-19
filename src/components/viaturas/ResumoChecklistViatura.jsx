const ROTULOS = {
  limpeza: "Recebeu a viatura limpa",
  limpeza_motivo_antecessor: "Motivo da falta de limpeza",
  combustivel: "Nível de combustível",
  ar_condicionado: "Ar-condicionado",
  ar_condicionado_outro: "Detalhe do ar-condicionado",
  kit_ferramentas: "Kit de ferramentas ausentes",
  ferramentas_outro: "Detalhe das ferramentas",
  alteracoes_equipamentos: "Alterações nos equipamentos",
  alteracoes_equipamentos_outro: "Detalhe dos equipamentos",
  nivel_oleo: "Nível do óleo do motor",
  nivel_oleo_outro: "Detalhe do nível de óleo",
  pneus: "Situação dos pneus",
  pneus_detalhe: "Detalhes dos pneus",
  arrefecimento: "Nível do líquido de arrefecimento",
  arrefecimento_outro: "Detalhe do arrefecimento",
  freios: "Situação dos freios",
  observacoes_gerais: "Observações gerais",
  motorista_antecessor: "Motorista antecessor",
};

const VALORES = {
  sim: "Sim",
  nao: "Não",
  tanque_cheio: "Tanque cheio",
  meio_tanque: "Meio tanque",
  um_quarto: "Tanque em 1/4",
  reserva: "Reserva",
  funcionando: "Funcionando",
  ventilador_sem_gas: "Ventilador funciona, mas não tem gás",
  ventilador_nao_funciona: "Ventilador não funciona",
  sem_alteracoes: "Sem alterações",
  alto: "Alto",
  medio: "Médio",
  baixo: "Baixo",
  bom: "Bom",
  desgaste: "Com desgaste",
  inadequado: "Inadequado",
  otimo: "Ótimo",
  outro: "Outro",
};

const CATEGORIAS = [
  { titulo: "Conservação e combustível", campos: ["limpeza", "limpeza_motivo_antecessor", "combustivel"] },
  { titulo: "Equipamentos e ferramentas", campos: ["ar_condicionado", "ar_condicionado_outro", "kit_ferramentas", "ferramentas_outro", "alteracoes_equipamentos", "alteracoes_equipamentos_outro"] },
  { titulo: "Condições mecânicas", campos: ["nivel_oleo", "nivel_oleo_outro", "pneus", "pneus_detalhe", "arrefecimento", "arrefecimento_outro", "freios"] },
  { titulo: "Observações", campos: ["observacoes_gerais", "motorista_antecessor"] },
];

function formatarChave(chave) {
  return ROTULOS[chave] || chave.replaceAll("_", " ").replace(/^./, (letra) => letra.toUpperCase());
}

function formatarValor(chave, valor) {
  if (Array.isArray(valor)) return valor.map((item) => {
    if (item && typeof item === "object") return Object.values(item).map(String).filter(Boolean).join(" · ");
    return VALORES[item] || String(item);
  }).filter(Boolean);
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  if (typeof valor === "number" && chave.startsWith("km_")) return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(valor)} km`;
  if (typeof valor === "string") {
    if (chave.startsWith("km_") && valor.trim() && Number.isFinite(Number(valor))) return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(Number(valor))} km`;
    return VALORES[valor] || valor;
  }
  if (valor && typeof valor === "object") return Object.values(valor).filter((item) => item !== null && item !== "").map((item) => Array.isArray(item) ? item.join(", ") : String(item)).join(" · ");
  return String(valor ?? "");
}

function temResposta(valor) {
  return valor !== null && valor !== undefined && valor !== "" && (!Array.isArray(valor) || valor.length > 0);
}

export default function ResumoChecklistViatura({ titulo, checklist }) {
  const dados = checklist && typeof checklist === "object" && !Array.isArray(checklist) ? checklist : {};
  const grupos = CATEGORIAS.map((categoria) => ({
    ...categoria,
    respostas: categoria.campos.filter((chave) => temResposta(dados[chave])).map((chave) => [chave, dados[chave]]),
  })).filter((categoria) => categoria.respostas.length);
  const conhecidas = new Set(CATEGORIAS.flatMap((categoria) => categoria.campos));
  const antigas = Object.entries(dados).filter(([chave, valor]) => chave !== "km_proxima_troca_oleo" && !conhecidas.has(chave) && temResposta(valor));

  if (!grupos.length && !antigas.length) return <p className="text-sm text-slate-500">{titulo ? `${titulo}: ` : ""}Checklist não registrado.</p>;

  return <details className="rounded border bg-white p-3">
    <summary className="cursor-pointer text-sm font-semibold text-slate-800">{titulo || "Checklist"}</summary>
    <div className="mt-3 space-y-3">
      {grupos.map((grupo) => <section key={grupo.titulo}>
        <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">{grupo.titulo}</h4>
        <dl className="grid gap-2 sm:grid-cols-2">
          {grupo.respostas.map(([chave, valor]) => <div key={chave} className="text-xs">
            <dt className="font-semibold text-slate-600">{formatarChave(chave)}</dt>
            <dd className="text-slate-800">{(() => { const resposta = formatarValor(chave, valor); return Array.isArray(resposta) ? <ul className="list-inside list-disc">{resposta.map((item, indice) => <li key={`${chave}-${indice}`}>{item}</li>)}</ul> : resposta; })()}</dd>
          </div>)}
        </dl>
      </section>)}
      {antigas.length > 0 && <section>
        <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Outras informações registradas</h4>
        <dl className="grid gap-2 sm:grid-cols-2">{antigas.map(([chave, valor]) => <div key={chave} className="text-xs"><dt className="font-semibold text-slate-600">{formatarChave(chave)}</dt><dd className="text-slate-800">{String(formatarValor(chave, valor))}</dd></div>)}</dl>
      </section>}
    </div>
  </details>;
}
