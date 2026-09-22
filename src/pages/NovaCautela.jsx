import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { Html5QrcodeScanner } from "html5-qrcode";

export default function NovaCautela() {
  const navigate = useNavigate();

  const [modoDigitacao, setModoDigitacao] = useState("manual");
  const [termoBusca, setTermoBusca] = useState("");
  const [armaEncontrada, setArmaEncontrada] = useState(null);
  const [mensagemErro, setMensagemErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const [policiais, setPoliciais] = useState([]);
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
        .select("id, nome_guerra, posto_graduacao, matricula")
        .order("nome_guerra", { ascending: true });

      if (error) throw error;
      if (data) {
        // Se não for master, remove o próprio usuário logado da lista para impedir autocautela
        const roleAtual = String(userRole || "").toLowerCase();
        if (roleAtual !== "master" && policialLogadoId) {
          const filtrados = data.filter((p) => p.id !== policialLogadoId);
          setPoliciais(filtrados);
        } else {
          setPoliciais(data);
        }
      }
    } catch (err) {
      console.error("Erro ao carregar policiais:", err.message);
    }
  }

  // Executa o recarregamento dos policiais se o ID logado for resolvido após a listagem
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
      let { data, error } = await supabase
        .from("equipamentos")
        .select("*")
        .ilike("num_serie", `%${termo}%`)
        .limit(1)
        .maybeSingle();

      if (!data && !error) {
        const resModelo = await supabase
          .from("equipamentos")
          .select("*")
          .ilike("modelo_descricao", `%${termo}%`)
          .limit(1)
          .maybeSingle();
        data = resModelo.data;
      }

      if (!data) {
        setMensagemErro("Armamento não encontrado no acervo!");
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

    // Validação extra de segurança contra autocautela
    if (userRole !== "master" && policialSelecionado === policialLogadoId) {
      setMensagemErro(
        "Erro de Segurança: Você não pode registrar uma cautela para si próprio.",
      );
      return;
    }

    setSalvandoCautela(true);
    setMensagemErro("");

    try {
      const dadosNovaCautela = {
        policial_id: policialSelecionado,
        status: "ativa",
        status_aceite: "pendente",
        data_cautela: new Date().toISOString(),
        armeiro_id: policialLogadoId || null,
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
          quantidade_carregadores: Number(qtdCarregadores) || 0,
          quantidade_municao: Number(qtdMunicao) || 0,
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
        .eq("num_serie", armaEncontrada.num_serie);

      navigate("/cautelas");
    } catch (err) {
      console.error("Erro ao finalizar cautela:", err.message);
      setMensagemErro("Falha na operação: " + err.message);
    } finally {
      setSalvandoCautela(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <div className="flex items-center gap-3">
        <button
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
                placeholder="Ex: 1234, PT 840..."
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
                {armaEncontrada.modelo_descricao}
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
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Policial Responsável *
                </label>
                <select
                  required
                  value={policialSelecionado}
                  onChange={(e) => setPolicialSelecionado(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">-- Selecione o Policial --</option>
                  {policiais.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.posto_graduacao} {p.nome_guerra} - Matrícula:{" "}
                      {p.matricula}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Carregadores
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={qtdCarregadores}
                    onChange={(e) => setQtdCarregadores(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Qtd. Munições
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={qtdMunicao}
                    onChange={(e) => setQtdMunicao(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium"
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
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium"
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
