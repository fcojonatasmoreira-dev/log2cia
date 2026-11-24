import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, LoaderCircle } from "lucide-react";
import { listarNotificacoes, marcarNotificacaoLida, marcarTodasNotificacoesLidas } from "../../services/notificacoesService";

const INTERVALO_ATUALIZACAO_MS = 60_000;

function dataHora(valor) {
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? "Data indisponível" : data.toLocaleString("pt-BR");
}

export default function NotificacoesMenu() {
  const navegar = useNavigate();
  const [aberta, setAberta] = useState(false);
  const [notificacoes, setNotificacoes] = useState([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [operacao, setOperacao] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    const atualizarAtiva = async (silenciosa = false) => {
      if (!silenciosa) setCarregando(true);
      try {
        const resultado = await listarNotificacoes();
        if (ativo) {
          setNotificacoes(resultado.notificacoes);
          setNaoLidas(resultado.nao_lidas);
          setErro("");
        }
      } catch (error) {
        if (ativo) setErro(error.message || "Não foi possível atualizar as notificações.");
      } finally {
        if (ativo && !silenciosa) setCarregando(false);
      }
    };
    void atualizarAtiva();
    const intervalo = window.setInterval(() => {
      if (document.visibilityState === "visible") void atualizarAtiva(true);
    }, INTERVALO_ATUALIZACAO_MS);
    const aoRetornar = () => { if (document.visibilityState === "visible") void atualizarAtiva(true); };
    document.addEventListener("visibilitychange", aoRetornar);
    return () => {
      ativo = false;
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoRetornar);
    };
  }, []);

  const abrirPermuta = async (item) => {
    setOperacao(true);
    try {
      if (!item.lida_em) {
        await marcarNotificacaoLida(item.id);
        setNotificacoes((atuais) => atuais.map((notificacao) => notificacao.id === item.id
          ? { ...notificacao, lida_em: new Date().toISOString() } : notificacao));
        setNaoLidas((quantidade) => Math.max(0, quantidade - 1));
      }
      setAberta(false);
      navegar(`/permutas?permuta_id=${encodeURIComponent(item.permuta_id)}`);
    } catch (error) {
      setErro(error.message || "Não foi possível atualizar a notificação.");
    } finally {
      setOperacao(false);
    }
  };

  const marcarTodas = async () => {
    if (!naoLidas) return;
    setOperacao(true);
    try {
      await marcarTodasNotificacoesLidas();
      const lidaEm = new Date().toISOString();
      setNotificacoes((atuais) => atuais.map((item) => item.lida_em ? item : { ...item, lida_em: lidaEm }));
      setNaoLidas(0);
      setErro("");
    } catch (error) {
      setErro(error.message || "Não foi possível marcar as notificações como lidas.");
    } finally {
      setOperacao(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAberta((valor) => !valor)}
        aria-label={`Notificações${naoLidas ? `, ${naoLidas} não lidas` : ""}`}
        aria-expanded={aberta}
        aria-haspopup="dialog"
        className="relative inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-200 shadow-xs transition hover:bg-slate-700"
      >
        <Bell className="h-4 w-4 text-amber-300" />
        <span>Notificações</span>
        {naoLidas > 0 && <span className="min-w-5 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] leading-4 text-white">{naoLidas > 99 ? "99+" : naoLidas}</span>}
      </button>
      {aberta && <section role="dialog" aria-label="Central de notificações" className="absolute right-0 z-50 mt-2 max-h-[75vh] w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-800 shadow-xl">
        <header className="flex items-center justify-between gap-2 border-b border-slate-100 p-3">
          <div><h3 className="text-sm font-bold">Notificações</h3><p className="text-[11px] text-slate-500">{naoLidas} não lida(s)</p></div>
          <button type="button" disabled={!naoLidas || operacao} onClick={marcarTodas} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">
            <CheckCheck className="h-3.5 w-3.5" /> Marcar todas como lidas
          </button>
        </header>
        {erro && <p role="alert" className="border-b border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">{erro}</p>}
        <div className="max-h-[60vh] overflow-y-auto">
          {carregando && !notificacoes.length ? <p className="flex items-center justify-center gap-2 p-6 text-xs text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" /> Carregando…</p>
            : notificacoes.length ? <ul className="divide-y divide-slate-100">{notificacoes.map((item) => <li key={item.id}>
              <button type="button" disabled={operacao} onClick={() => void abrirPermuta(item)} className={`block w-full p-3 text-left hover:bg-slate-50 disabled:opacity-60 ${item.lida_em ? "" : "bg-blue-50/60"}`}>
                <span className="flex items-start justify-between gap-2"><strong className="text-xs text-slate-800">{item.tipo}</strong>{!item.lida_em && <i aria-label="Não lida" className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600" />}</span>
                <span className="mt-1 block text-xs text-slate-600">{item.descricao}</span>
                <time className="mt-1.5 block text-[10px] text-slate-400">{dataHora(item.criado_em)}</time>
              </button>
            </li>)}</ul> : <p className="p-6 text-center text-xs text-slate-500">Você não tem notificações.</p>}
        </div>
      </section>}
    </div>
  );
}
