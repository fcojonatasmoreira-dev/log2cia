import { useState } from "react";
import { Share2 } from "lucide-react";
import { criarLinkChecklistViatura } from "../../services/viaturasService";

export default function BotaoCompartilharChecklist({ checkinId }) {
  const [estado, setEstado] = useState("");
  const [copiando, setCopiando] = useState(false);

  async function copiar() {
    if (copiando) return;
    setCopiando(true);
    setEstado("Gerando link…");
    try {
      const { token } = await criarLinkChecklistViatura(checkinId);
      const link = new URL(`/checklist-publico/${encodeURIComponent(token)}`, window.location.origin).toString();
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        setEstado("Link copiado");
      } else {
        window.prompt("Copie o link do checklist:", link);
        setEstado("Link pronto para copiar");
      }
    } catch (error) {
      setEstado(error.message || "Não foi possível copiar o link.");
    } finally {
      setCopiando(false);
    }
  }

  return <button type="button" disabled={copiando} onClick={copiar} className="inline-flex items-center gap-1 rounded border border-blue-200 bg-white px-2 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-50 disabled:opacity-50"><Share2 className="h-3 w-3"/>{estado || "Compartilhar checklist completo"}</button>;
}
