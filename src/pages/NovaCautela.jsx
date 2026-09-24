import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { Html5QrcodeScanner } from "html5-qrcode";
import { Search } from "lucide-react";

const obterPesoHierarquia = (posto) => {
  const p = String(posto || "")
    .trim()
    .toUpperCase();
  if (p.includes("CORONEL") && !p.includes("TENENTE")) return 1;
  if (p.includes("TENENTE CORONEL") || p.includes("TC")) return 2;
  if (p.includes("MAJOR")) return 3;
  if (p.includes("CAPITÃO") || p.includes("CAP")) return 4;
  if (p.includes("1º TENENTE") || p.includes("PRIMEIRO TENENTE")) return 5;
  if (p.includes("2º TENENTE") || p.includes("SEGUNDO TENENTE")) return 6;
  if (p.includes("ASPIRANTE")) return 7;
  if (p.includes("SUBTENENTE") || p.includes("SUB TENente")) return 8;
  if (p.includes("1º SARGENTO") || p.includes("PRIMEIRO SARGENTO")) return 9;
  if (p.includes("2º SARGENTO") || p.includes("SEGUNDO SARGENTO")) return 10;
  if (
    p.includes("3º SARGENTO") ||
    p.includes("TERCEIRO SARGENTO") ||
    p.includes("3º SGT")
  )
    return 11;
  if (p.includes("CABO") || p.includes("CB")) return 12;
  if (p.includes("SOLDADO") || p.includes("SD")) return 13;
  return 99;
};

export default function NovaCautela() {
  const navigate = useNavigate();

  const [modoDigitacao, setModoDigitacao] = useState("manual");
  const [termoBusca, setTermoBusca] = useState("");
  const [armaEncontrada, setArmaEncontrada] = useState(null);
  const [mensagemErro, setMensagemErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const [policiais, setPoliciais] = useState([]);
  const [buscaPolicial, setBuscaPolicial] = useState("");
  const [policialSelecionado, setPolicialSelecionado] = useState("");

  const [policialLogadoId, setPolicialLogadoId] = useState(null);
  const [userRole, setUserRole] = useState("policial");

  const [qtdCarregadores, setQtdCarregadores] = useState(0);
  const [qtdMunicao, setQtdMunicao] = useState(0);
  const [tipoMunicao, setTipoMunicao] = useState("");
  const [salvandoCautela, setSalvandoCautela] = useState(false);

  useEffect(() => {
    carregarDadosIniciais();
  }, []);

  async function carregarDadosIniciais() {
    await identificarPolicialLogadoEPerfil();
    await carregarPoliciais();
  }

  async function identificarPolicialLogadoEPerfil() {
    try {
      const usuarioSalvo = localStorage.getItem("log2cia_user");
      if (!usuarioSalvo) return;

      const dadosUser = JSON.parse(usuarioSalvo);
      const matriculaLogada = dadosUser?.matricula;
      const roleLida = String(dadosUser?.role || "policial")
        .trim()
        .toLowerCase();
      setUserRole(roleLida);

      if (matriculaLogada) {
        const { data: polData } = await supabase
          .from("policiais")
          .select("id")
          .eq("matricula", matriculaLogada)
          .maybeSingle();
        if (polData) setPolicialLogadoId(polData.id);
      }
    } catch (err) {
      console.error("Aviso ao identificar sessão:", err.message);
    }
  }

  async function carregarPoliciais() {
    try {
      const { data, error } = await supabase
        .from("policiais")
        .select("id, nome_guerra, posto_graduacao, matricula, nome_completo");

      if (error) throw error;
      if (data) {
        const roleAtual = String(userRole || "").toLowerCase();
        let listaTrabalho = data;
        if (roleAtual !== "master" && policialLogadoId) {
          listaTrabalho = data.filter((p) => p.id !== policialLogadoId);
        }

        listaTrabalho.sort((a, b) => {
          const pesoA = obterPesoHierarquia(a.posto_graduacao);
          const pesoB = obterPesoHierarquia(b.posto_graduacao);

          if (pesoA !== pesoB) {
            return pesoA - pesoB;
          }

          const nomeA = String(a.nome_guerra || "").toUpperCase();
          const nomeB = String(b.nome_guerra || "").toUpperCase();
          return nomeA.localeCompare(nomeB);
        });

        setPoliciais(listaTrabalho);
      }
    } catch (err) {
      console.error("Erro ao carregar policiais:", err.message);
      setMensagemErro("Erro ao carregar a lista de policiais: " + err.message);
    }
  }

  useEffect(() => {
    if (policialLogadoId) {
      carregarPoliciais();
    }
  }, [policialLogadoId, userRole]);

  useEffect(() => {
    let scanner = null;
    if (modoDigitacao === "camera") {
      const timer = setTimeout(() => {
        scanner = new Html5QrcodeScanner(
          "reader",
          { fps: 10, qrbox: { width: 250, height: 250 } },
          false,
        );
        scanner.render(
          async (decodedText) => {
            scanner.clear();
            await buscarArmaPorId(decodedText);
          },
          () => {},
        );
      }, 100);

      return () => {
        clearTimeout(timer);
        if (scanner) {
          scanner
            .clear()
            .catch((err) => console.error("Erro ao limpar scanner:", err));
        }
      };
    }
  }, [modoDigitacao]);

  async function buscarArmaPorId(idArma) {
    setCarregando(true);
    setMensagemErro("");
    setArmaEncontrada(null);

    try {
      const { data, error } = await supabase
        .from("equipamentos")
        .select("*")
        .eq("id", idArma)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        setMensagemErro("Armamento não encontrado pelo QR Code!");
        return;
      }
      validarEAtribuirArma(data);
    } catch (err) {
      setMensagemErro("Erro na leitura do QR Code: " + err.message);
    } finally {
      setCarregando(false);
    }
  }

  const handleBuscarArmamento = async (e) => {
    if (e) e.preventDefault();
    const termo = termoBusca.trim();
    if (!termo) {
      setMensagemErro("Digite o número de série, modelo ou patrimônio.");
      return;
    }

    setCarregando(true);
    setMensagemErro("");
    setArmaEncontrada(null);

    try {
      const { data, error } = await supabase
        .from("equipamentos")
        .select("*")
        .or(
          `num_serie.ilike.%${termo}%,modelo_descricao.ilike.%${termo}%,patrimonio.ilike.%${termo}%`,
        )
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setMensagemErro("Armamento não encontrado no acervo com este termo!");
        return;
      }

      validarEAtribuirArma(data);
    } catch (err) {
      setMensagemErro("Erro na busca: " + err.message);
    } finally {
      setCarregando(false);
    }
  };

  const validarEAtribuirArma = (data) => {
    const st = String(data.status || "").toLowerCase();
    if (st !== "disponivel") {
      setMensagemErro(
        `BLOQUEIO BÉLICO: O armamento série ${data.num_serie} consta como "${data.status.toUpperCase()}"!`,
      );
      return;
    }
    setArmaEncontrada(data);
    setModoDigitacao("manual");
  };

  // Função para gerar o Hash SHA-256 de Emissão de forma síncrona/assíncrona limpa
  const gerarHashEmissaoDirect = async (
    cautelaId,
    matriculaArmeiro,
    dataStr,
  ) => {
    try {
      const msg = `LOG2CIA-AUDIT-EMISSAO-${cautelaId}-${matriculaArmeiro}-${dataStr}`;
      const msgBuffer = new TextEncoder().encode(msg);
      const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
      return hashHex;
    } catch (e) {
      return `HASH-FALLBACK-EMISSAO-${Date.now().toString(16).toUpperCase()}`;
    }
  };

  const handleFinalizarCautela = async (e) => {
    e.preventDefault();
    if (!armaEncontrada) {
      setMensagemErro("Selecione um armamento disponível antes de finalizar.");
      return;
    }
    if (!policialSelecionado) {
      setMensagemErro("Selecione o policial responsável pela cautela.");
      return;
    }

    if (userRole !== "master" && policialSelecionado === policialLogadoId) {
      setMensagemErro(
        "Erro de Segurança: Você não pode registrar uma cautela para si próprio.",
      );
      return;
    }

    setSalvandoCautela(true);
    setMensagemErro("");

    try {
      let matriculaArmeiro = "ARMEIRO";
      const usuarioSalvo = localStorage.getItem("log2cia_user");
      if (usuarioSalvo) {
        const dadosUser = JSON.parse(usuarioSalvo);
        if (dadosUser?.matricula) matriculaArmeiro = dadosUser.matricula;
      }

      const dataHoraAtual = new Date().toISOString();
      const tempId = `temp_${Date.now()}`;
      const hashEmissaoGerado = await gerarHashEmissaoDirect(
        tempId,
        matriculaArmeiro,
        dataHoraAtual,
      );

      const dadosNovaCautela = {
        policial_id: policialSelecionado,
        status: "ativa",
        status_aceite: "pendente",
        data_cautela: dataHoraAtual,
        armeiro_id: policialLogadoId || null,
        hash_emissao: hashEmissaoGerado, // Garante que o hash de saída já nasce gerado e gravado
      };

      const { data: novaCautela, error: errCautela } = await supabase
        .from("cautelas")
        .insert([dadosNovaCautela])
        .select()
        .single();

      if (errCautela) throw errCautela;

      const { error: errItem } = await supabase.from("cautela_itens").insert([
        {
          cautela_id: novaCautela.id,
          equipamento_id: armaEncontrada.id || null,
          quantidade_carregadores: Math.max(
            0,
            parseInt(qtdCarregadores, 10) || 0,
          ),
          quantidade_municao: Math.max(0, parseInt(qtdMunicao, 10) || 0),
          tipo_municao: tipoMunicao,
        },
      ]);

      if (errItem) {
        await supabase.from("cautelas").delete().eq("id", novaCautela.id);
        throw errItem;
      }

      await supabase
        .from("equipamentos")
        .update({ status: "cautelado" })
        .eq("id", armaEncontrada.id);

      navigate("/cautelas");
    } catch (err) {
      console.error("Erro ao finalizar cautela:", err.message);
      setMensagemErro("Falha na operação: " + err.message);
    } finally {
      setSalvandoCautela(false);
    }
  };

  const policiaisFiltrados = policiais.filter((p) => {
    if (!buscaPolicial) return true;
    const termo = buscaPolicial.toLowerCase();
    const nomeGuerra = String(p.nome_guerra || "").toLowerCase();
    const matricula = String(p.matricula || "").toLowerCase();
    const nomeCompleto = String(p.nome_completo || "").toLowerCase();

    return (
      nomeGuerra.includes(termo) ||
      matricula.includes(termo) ||
      nomeCompleto.includes(termo)
    );
  });

  useEffect(() => {
    if (buscaPolicial.trim() !== "" && policiaisFiltrados.length === 1) {
      setPolicialSelecionado(policiaisFiltrados[0].id);
    }
  }, [buscaPolicial, policiaisFiltrados]);

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/cautelas")}
          className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 font-bold text-xs"
        >
          ← Voltar
        </button>
        <h1 className="text-xl font-bold text-slate-800">
          Saída de Armamento / Nova Cautela
        </h1>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-5">
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setModoDigitacao("camera")}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${modoDigitacao === "camera" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"}`}
          >
            📷 Câmera / QR Code
          </button>
          <button
            type="button"
            onClick={() => setModoDigitacao("manual")}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${modoDigitacao === "manual" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"}`}
          >
            ⌨️ Digitação Manual
          </button>
        </div>

        {mensagemErro && (
          <div className="p-3 text-xs font-bold text-red-700 bg-red-100 border border-red-200 rounded-lg text-center leading-relaxed">
            {mensagemErro}
          </div>
        )}

        {modoDigitacao === "manual" ? (
          <form onSubmit={handleBuscarArmamento} className="space-y-3">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                Nº de Série, Modelo ou Patrimônio
              </label>
              <input
                type="text"
                value={termoBusca}
                onChange={(e) => setTermoBusca(e.target.value)}
                placeholder="Ex: sgt20216, PT 840..."
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={carregando}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow transition-all disabled:opacity-50"
            >
              {carregando ? "Buscando..." : "Buscar Armamento"}
            </button>
          </form>
        ) : (
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-300">
            <div
              id="reader"
              className="w-full overflow-hidden rounded-lg"
            ></div>
          </div>
        )}

        {armaEncontrada && (
          <div className="mt-6 border-t border-slate-200 pt-5 space-y-4">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1">
              <div className="text-sm font-bold text-slate-900">
                {armaEncontrada.modelo_descricao || armaEncontrada.tipo}
              </div>
              <div className="text-xs text-slate-600">
                Nº Série:{" "}
                <strong className="font-mono text-slate-800">
                  {armaEncontrada.num_serie}
                </strong>
              </div>
            </div>

            <form
              onSubmit={handleFinalizarCautela}
              className="space-y-4 text-xs"
            >
              <div className="space-y-1.5">
                <label className="block font-bold text-slate-700 uppercase">
                  Policial Responsável (Busca por Matrícula ou Nome) *
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={buscaPolicial}
                    onChange={(e) => setBuscaPolicial(e.target.value)}
                    placeholder="Digite a matrícula ou nome..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 mb-1"
                  />
                </div>
                <select
                  required
                  value={policialSelecionado}
                  onChange={(e) => setPolicialSelecionado(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">-- Selecione o Policial --</option>
                  {policiaisFiltrados.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.posto_graduacao} {p.nome_guerra} - Mat:{" "}
                      {p.matricula || "N/I"}
                    </option>
                  ))}
                </select>
              </div>

              {/* CAMPOS NUMÉRICOS RESTRITOS */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Carregadores
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={qtdCarregadores}
                    onChange={(e) => setQtdCarregadores(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Qtd. Munições
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={qtdMunicao}
                    onChange={(e) => setQtdMunicao(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Tipo da Munição / Calibre
                </label>
                <input
                  type="text"
                  placeholder="Ex: .40 S&W Gold Hex"
                  value={tipoMunicao}
                  onChange={(e) => setTipoMunicao(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={salvandoCautela}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm uppercase tracking-wider rounded-xl shadow transition-all disabled:opacity-50 mt-2"
              >
                {salvandoSalvarCautelaCheck(salvandoCautela)}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function salvandoSalvarCautelaCheck(loading) {
  return loading ? "Registrando Cautela..." : "Confirmar e Gerar Cautela";
}
