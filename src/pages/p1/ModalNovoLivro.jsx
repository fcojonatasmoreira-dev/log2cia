import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabaseClient";
import html2canvas from "html2canvas-pro";
import {
  BookOpen,
  Plus,
  Trash2,
  Car,
  FileText,
  Search,
  Lock,
  Download,
  Check,
  Copy,
  Loader2,
} from "lucide-react";

export default function ModalNovoLivro({
  isOpen,
  onClose,
  onSuccess,
  userLogado,
  livroParaEditar,
  isMasterGlobal,
}) {
  const [policiais, setPoliciais] = useState([]);
  const [loadingPoliciais, setLoadingPoliciais] = useState(false);

  // Estado local de master que será validado com segurança no modal
  const [isMaster, setIsMaster] = useState(isMasterGlobal || false);

  // Campos principais do cabeçalho
  const [dataServico, setDataServico] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [turno, setTurno] = useState("A");

  // Estados para busca e seleção de policiais
  const [buscaPermanente, setBuscaPermanente] = useState("");
  const [permanenteSelecionado, setPermanenteSelecionado] = useState(
    userLogado?.nome_guerra || userLogado?.nome || "",
  );

  const [buscaAntecessor, setBuscaAntecessor] = useState("");
  const [antecessorSelecionado, setAntecessorSelecionado] = useState("");

  const [buscaSubstituto, setBuscaSubstituto] = useState("");
  const [substitutoSelecionado, setSubstitutoSelecionado] = useState("");

  // Controle de Viaturas (3ª Parte) - Tabela 1
  const [viaturasLista, setViaturasLista] = useState([
    {
      vtr: "RP 151002",
      km_inicial: "",
      km_final: "",
      km_rodado: "",
      km_abast: "",
      litros: "",
      valor: "",
      saldo: "",
      status: "Disponível",
      motorista: "",
      destino: "",
    },
  ]);

  // Controle de Viaturas Baixadas (3ª Parte) - Tabela 2
  const [viaturasBaixadas, setViaturasBaixadas] = useState([
    { vtr: "", motorista: "", motivo: "", local: "" },
  ]);

  // Controle de Saída e Chegada (3ª Parte) - Tabela 3
  const [viaturasSaida, setViaturasSaida] = useState([
    { vtr: "", km_hr_saida: "", km_hr_chegada: "", motorista: "", destino: "" },
  ]);

  // Ocorrências (5ª Parte)
  const [ocorrencias, setOcorrencias] = useState([{ descricao: "" }]);

  const [salvando, setSalvando] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [modoVisualizacao, setModoVisualizacao] = useState(false);

  // Estados para o feedback de salvamento
  const [statusBotaoSalvo, setStatusBotaoSalvo] = useState(false);
  const [horarioUltimoSalvar, setHorarioUltimoSalvar] = useState(null);
  const [tempoDecorridoTexto, setTempoDecorridoTexto] = useState("");

  useEffect(() => {
    if (isOpen) {
      carregarPoliciais();
      verificarMasterDireto();

      setStatusBotaoSalvo(false);
      setHorarioUltimoSalvar(null);
      setTempoDecorridoTexto("");

      if (livroParaEditar) {
        setDataServico(
          livroParaEditar.data_servico || new Date().toISOString().slice(0, 10),
        );
        setTurno(livroParaEditar.turno || "A");
        setPermanenteSelecionado(livroParaEditar.permanente_nome || "");
        setAntecessorSelecionado(livroParaEditar.antecessor_nome || "");
        setSubstitutoSelecionado(livroParaEditar.substituto_nome || "");

        if (livroParaEditar.modoVisualizacaoEstrita === true) {
          setModoVisualizacao(true);
        } else {
          setModoVisualizacao(false);
        }

        carregarDadosFilhos(livroParaEditar.id);
      } else {
        setDataServico(new Date().toISOString().slice(0, 10));
        setTurno("A");
        setPermanenteSelecionado(
          userLogado?.nome_guerra || userLogado?.nome || "",
        );
        setAntecessorSelecionado("");
        setSubstitutoSelecionado("");
        setViaturasLista([
          {
            vtr: "RP 151002",
            km_inicial: "",
            km_final: "",
            km_rodado: "",
            km_abast: "",
            litros: "",
            valor: "",
            saldo: "",
            status: "Disponível",
            motorista: "",
            destino: "",
          },
        ]);
        setViaturasBaixadas([
          { vtr: "", motorista: "", motivo: "", local: "" },
        ]);
        setViaturasSaida([
          {
            vtr: "",
            km_hr_saida: "",
            km_hr_chegada: "",
            motorista: "",
            destino: "",
          },
        ]);
        setOcorrencias([{ descricao: "" }]);
        setModoVisualizacao(false);
      }
    }
  }, [isOpen, livroParaEditar, isMasterGlobal]);

  async function verificarMasterDireto() {
    if (isMasterGlobal) {
      setIsMaster(true);
      return;
    }
    try {
      const usuarioSalvo = localStorage.getItem("log2cia_user");
      if (!usuarioSalvo) return;

      const dadosUser = JSON.parse(usuarioSalvo);
      const matriculaLogada = dadosUser?.matricula;

      if (!matriculaLogada) return;

      const { data, error } = await supabase
        .from("policiais")
        .select("*")
        .eq("matricula", matriculaLogada)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const perfilBanco = String(
          data.perfil || data.role || data.nivel || data.tipo || "",
        ).toLowerCase();

        if (
          perfilBanco === "master" ||
          perfilBanco === "administrador" ||
          data.is_master === true ||
          data.is_admin === true
        ) {
          setIsMaster(true);
        }
      }
    } catch (err) {
      console.error("Erro ao verificar perfil master:", err.message);
    }
  }

  useEffect(() => {
    if (!horarioUltimoSalvar) return;

    const intervalo = setInterval(() => {
      const segundos = Math.floor((new Date() - horarioUltimoSalvar) / 1000);
      if (segundos < 60) {
        setTempoDecorridoTexto("Salvo há menos de 1 minuto");
      } else {
        const minutos = Math.floor(segundos / 60);
        setTempoDecorridoTexto(
          `Salvo há ${minutos} ${minutos === 1 ? "minuto" : "minutos"}`,
        );
      }
    }, 1000);

    return () => clearInterval(intervalo);
  }, [horarioUltimoSalvar]);

  async function carregarPoliciais() {
    setLoadingPoliciais(true);
    try {
      const { data, error } = await supabase.from("policiais").select("*");

      if (error) throw error;
      if (data) setPoliciais(data);
    } catch (err) {
      console.error("Erro ao carregar policiais:", err.message);
    } finally {
      setLoadingPoliciais(false);
    }
  }

  async function carregarDadosFilhos(livroId) {
    try {
      const { data: vtrData } = await supabase
        .from("livro_viaturas")
        .select("*")
        .eq("livro_id", livroId);

      if (vtrData && vtrData.length > 0) {
        setViaturasLista(
          vtrData.map((v) => ({
            vtr: v.viatura || "",
            km_inicial: v.km_inicial ?? "",
            km_final: v.km_final ?? "",
            km_rodado: v.km_rodado ?? "",
            km_abast: v.km_abastecimento ?? "",
            litros: v.litros ?? "",
            valor: v.valor ?? "",
            saldo: v.saldo ?? "",
            status: v.status_viatura || "Disponível",
            motorista: v.motorista || "",
            destino: v.destino || "",
          })),
        );
      }

      const { data: ocoData } = await supabase
        .from("livro_ocorrencias")
        .select("*")
        .eq("livro_id", livroId)
        .order("ordem", { ascending: true });

      if (ocoData && ocoData.length > 0) {
        setOcorrencias(ocoData.map((o) => ({ descricao: o.descricao || "" })));
      }
    } catch (err) {
      console.error("Erro ao carregar itens filhos do livro:", err.message);
    }
  }

  const filtrarPoliciais = (termo) => {
    if (!termo || termo.trim() === "") return [];
    const t = termo.toLowerCase();

    return policiais
      .filter((p) => {
        const nomeGuerra = String(p.nome_guerra || p.nome || "").toLowerCase();
        const matricula = String(p.matricula || p.mat || "").toLowerCase();
        const numero = String(p.numero || p.nº || "").toLowerCase();
        const posto = String(p.posto_graduacao || p.posto || "").toLowerCase();

        return (
          nomeGuerra.includes(t) ||
          matricula.includes(t) ||
          numero.includes(t) ||
          posto.includes(t)
        );
      })
      .slice(0, 5);
  };

  const formatarNomeCompletoPolicial = (p) => {
    if (!p) return "";

    // Captura as chaves independentemente de como estão no banco de dados
    const posto = p.posto_graduacao || p.posto || p.graduacao || "";
    const numero = p.numero || p.nº || p.num || "";
    const guerra = p.nome_guerra || p.guerra || p.nome || "";
    const mat = p.matricula || p.mat || "";

    // Monta rigorosamente no padrão: Posto/Grad + Número + Nome de Guerra + Matrícula
    const partes = [];
    if (posto) partes.push(posto);
    if (numero) partes.push(numero);
    if (guerra) partes.push(`– ${guerra}`);
    if (mat) partes.push(`(Mat: ${mat})`);

    return partes.join(" ").replace(/\s+–/, " –").trim();
  };

  const adicionarViaturaRow = () => {
    setViaturasLista([
      ...viaturasLista,
      {
        vtr: "RP 151002",
        km_inicial: "",
        km_final: "",
        km_rodado: "",
        km_abast: "",
        litros: "",
        valor: "",
        saldo: "",
        status: "Disponível",
        motorista: "",
        destino: "",
      },
    ]);
  };

  const removerViaturaRow = (index) => {
    setViaturasLista(viaturasLista.filter((_, i) => i !== index));
  };

  const atualizarViatura = (index, campo, valor) => {
    const novaLista = [...viaturasLista];
    novaLista[index][campo] = valor;
    setViaturasLista(novaLista);
  };

  const adicionarOcorrencia = () => {
    setOcorrencias([...ocorrencias, { descricao: "" }]);
  };

  const removerOcorrencia = (index) => {
    setOcorrencias(ocorrencias.filter((_, i) => i !== index));
  };

  const atualizarOcorrencia = (index, valor) => {
    const novaLista = [...ocorrencias];
    novaLista[index].descricao = valor;
    setOcorrencias(novaLista);
  };

  const handleGerarNovoLivroApartirDeste = async () => {
    if (
      !window.confirm(
        "Deseja gerar um novo livro de turno a partir destas informações para iniciar um novo rascunho?",
      )
    )
      return;
    setSalvando(true);

    try {
      const { data: livroCriado, error: livroErr } = await supabase
        .from("livros_permanencia")
        .insert([
          {
            data_servico: dataServico,
            turno: turno,
            permanente_nome: permanenteSelecionado,
            antecessor_nome: antecessorSelecionado,
            substituto_nome: substitutoSelecionado,
            status: "em_andamento",
          },
        ])
        .select()
        .single();

      if (livroErr) throw livroErr;
      const novoLivroId = livroCriado.id;

      if (viaturasLista.length > 0) {
        const viaturasPayload = viaturasLista.map((v) => ({
          livro_id: novoLivroId,
          viatura: v.vtr,
          km_inicial: v.km_inicial ? parseFloat(v.km_inicial) : null,
          km_final: v.km_final ? parseFloat(v.km_final) : null,
          km_abastecimento: v.km_abast ? parseFloat(v.km_abast) : null,
          litros: v.litros ? parseFloat(v.litros) : null,
          valor: v.valor ? parseFloat(v.valor) : null,
          saldo: v.saldo ? parseFloat(v.saldo) : null,
          status_viatura: v.status,
          motorista: v.motorista,
          destino: v.destino,
        }));
        await supabase.from("livro_viaturas").insert(viaturasPayload);
      }

      if (ocorrencias.length > 0) {
        const ocoPayload = ocorrencias.map((o, idx) => ({
          livro_id: novoLivroId,
          ordem: idx + 1,
          descricao: o.descricao,
        }));
        await supabase.from("livro_ocorrencias").insert(ocoPayload);
      }

      alert("Novo rascunho gerado com sucesso a partir do histórico!");
      onSuccess();
      onClose();
    } catch (err) {
      alert("Erro ao clonar livro: " + err.message);
    } finally {
      setSalvando(false);
    }
  };

  const handleSalvarLivro = async (e, fecharTurno = false) => {
    if (e) e.preventDefault();
    setSalvando(true);

    try {
      const statusAtual = fecharTurno ? "fechado" : "em_andamento";
      let livroId = livroParaEditar?.id;

      if (livroId && !modoVisualizacao) {
        const { error: updErr } = await supabase
          .from("livros_permanencia")
          .update({
            data_servico: dataServico,
            turno: turno,
            permanente_nome: permanenteSelecionado,
            antecessor_nome: antecessorSelecionado,
            substituto_nome: substitutoSelecionado,
            status: statusAtual,
          })
          .eq("id", livroId);

        if (updErr) throw updErr;

        await supabase.from("livro_viaturas").delete().eq("livro_id", livroId);
        await supabase
          .from("livro_ocorrencias")
          .delete()
          .eq("livro_id", livroId);
      } else {
        const { data: livroCriado, error: livroErr } = await supabase
          .from("livros_permanencia")
          .insert([
            {
              data_servico: dataServico,
              turno: turno,
              permanente_nome: permanenteSelecionado,
              antecessor_nome: antecessorSelecionado,
              substituto_nome: substitutoSelecionado,
              status: statusAtual,
            },
          ])
          .select()
          .single();

        if (livroErr) throw livroErr;
        livroId = livroCriado.id;
      }

      if (viaturasLista.length > 0) {
        const viaturasPayload = viaturasLista.map((v) => ({
          livro_id: livroId,
          viatura: v.vtr,
          km_inicial: v.km_inicial ? parseFloat(v.km_inicial) : null,
          km_final: v.km_final ? parseFloat(v.km_final) : null,
          km_abastecimento: v.km_abast ? parseFloat(v.km_abast) : null,
          litros: v.litros ? parseFloat(v.litros) : null,
          valor: v.valor ? parseFloat(v.valor) : null,
          saldo: v.saldo ? parseFloat(v.saldo) : null,
          status_viatura: v.status,
          motorista: v.motorista,
          destino: v.destino,
        }));

        const { error: vtrErr } = await supabase
          .from("livro_viaturas")
          .insert(viaturasPayload);
        if (vtrErr) throw vtrErr;
      }

      if (ocorrencias.length > 0) {
        const ocoPayload = ocorrencias.map((o, idx) => ({
          livro_id: livroId,
          ordem: idx + 1,
          descricao: o.descricao,
        }));

        const { error: ocoErr } = await supabase
          .from("livro_ocorrencias")
          .insert(ocoPayload);
        if (ocoErr) throw ocoErr;
      }

      if (fecharTurno) {
        setModoVisualizacao(true);
        alert("Livro fechado com sucesso! Download do PDF oficial liberado.");
        onSuccess();
      } else {
        setHorarioUltimoSalvar(new Date());
        setTempoDecorridoTexto("Salvo há menos de 1 minuto");
        setStatusBotaoSalvo(true);
        setTimeout(() => {
          setStatusBotaoSalvo(false);
        }, 4000);
        onSuccess();
      }
    } catch (err) {
      alert("Erro ao registrar livro: " + err.message);
    } finally {
      setSalvando(false);
    }
  };

  const handleBaixarPdfOficial = async () => {
    setGerandoPdf(true);
    try {
      const elemento = document.getElementById("conteudo-pdf-oficial");
      if (!elemento) throw new Error("Elemento de impressão não encontrado.");

      elemento.style.display = "block";

      const { jsPDF } = await import("jspdf");
      const canvas = await html2canvas(elemento, {
        scale: 2,
        useCORS: true,
        logging: false,
      });

      elemento.style.display = "none";

      const imgData = canvas.toDataURL("image/jpeg", 0.98);
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      pdf.save(`Livro_Permanencia_${dataServico}_Turno_${turno}.pdf`);
      onSuccess();
    } catch (err) {
      alert("Erro ao gerar PDF oficial: " + err.message);
      const elem = document.getElementById("conteudo-pdf-oficial");
      if (elem) elem.style.display = "none";
    } finally {
      setGerandoPdf(false);
    }
  };

  if (!isOpen) return null;

  const formatarDataComDiaSemana = (dataStr) => {
    if (!dataStr) return "";
    const [ano, mes, dia] = dataStr.split("-");
    const dataObj = new Date(
      parseInt(ano, 10),
      parseInt(mes, 10) - 1,
      parseInt(dia, 10),
    );

    const meses = [
      "JANEIRO",
      "FEVEREIRO",
      "MARÇO",
      "ABRIL",
      "MAIO",
      "JUNHO",
      "JULHO",
      "AGOSTO",
      "SETEMBRO",
      "OUTUBRO",
      "NOVEMBRO",
      "DEZEMBRO",
    ];

    const diasSemana = [
      "DOMINGO",
      "SEGUNDA - FEIRA",
      "TERÇA - FEIRA",
      "QUARTA - FEIRA",
      "QUINTA - FEIRA",
      "SEXTA - FEIRA",
      "SÁBADO",
    ];

    const nomeDiaSemana = diasSemana[dataObj.getDay()];
    const nomeMes = meses[parseInt(mes, 10) - 1];

    return `${dia} DE ${nomeMes} DE ${ano} (${nomeDiaSemana})`;
  };

  const formatarDataExtensoSimples = (dataStr) => {
    if (!dataStr) return "";
    const [ano, mes, dia] = dataStr.split("-");
    const meses = [
      "",
      "Janeiro",
      "Fevereiro",
      "Março",
      "Abril",
      "Maio",
      "Junho",
      "Julho",
      "Agosto",
      "Setembro",
      "Outubro",
      "Novembro",
      "Dezembro",
    ];
    return `${dia} de ${meses[parseInt(mes, 10)]} de ${ano}`;
  };

  return (
    <div className="fixed inset-0 bg-slate-900/65 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-100 space-y-6 my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center border-b border-slate-100 pb-4 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-600" /> Livro Digital da
            Permanência —{" "}
            {modoVisualizacao
              ? "Visualizando Livro"
              : livroParaEditar
                ? "Editar Rascunho"
                : "Novo Registro"}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 font-bold text-lg p-1"
          >
            ✕
          </button>
        </div>

        {/* FORMULÁRIO PRINCIPAL DE EDIÇÃO E VISUALIZAÇÃO */}
        <form
          onSubmit={(e) => handleSalvarLivro(e, false)}
          className="space-y-6 text-xs bg-white p-2"
        >
          {/* BLOCO 1: DADOS GERAIS E ESCALA */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
            <h3 className="font-bold text-slate-700 uppercase tracking-wide text-xs border-b pb-2">
              1. Informações Básicas e Turno
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Data do Serviço *
                </label>
                <input
                  type="date"
                  required
                  disabled={modoVisualizacao}
                  value={dataServico}
                  onChange={(e) => setDataServico(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl outline-none disabled:bg-slate-100 disabled:text-slate-600"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Turno *
                </label>
                <select
                  value={turno}
                  disabled={modoVisualizacao}
                  onChange={(e) => setTurno(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold outline-none disabled:bg-slate-100 disabled:text-slate-600"
                >
                  <option value="A">Turno A (06h às 18h)</option>
                  <option value="B">Turno B (18h às 06h)</option>
                </select>
              </div>

              <div className="relative">
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Permanente Responsável *
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    disabled={modoVisualizacao}
                    value={buscaPermanente || permanenteSelecionado}
                    onChange={(e) => {
                      setBuscaPermanente(e.target.value);
                      setPermanenteSelecionado(e.target.value);
                    }}
                    placeholder="Digite nome ou número..."
                    className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl uppercase font-bold outline-none disabled:bg-slate-100 disabled:text-slate-600"
                  />
                </div>
                {buscaPermanente &&
                  !modoVisualizacao &&
                  filtrarPoliciais(buscaPermanente).length > 0 && (
                    <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                      {filtrarPoliciais(buscaPermanente).map((p) => {
                        const nomeFormatado = formatarNomeCompletoPolicial(p);
                        return (
                          <div
                            key={p.id}
                            onClick={() => {
                              setPermanenteSelecionado(nomeFormatado);
                              setBuscaPermanente("");
                            }}
                            className="p-2 hover:bg-blue-50 cursor-pointer text-slate-700 font-medium border-b border-slate-100 last:border-none"
                          >
                            {nomeFormatado}
                          </div>
                        );
                      })}
                    </div>
                  )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="relative">
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Antecessor Legal
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    disabled={modoVisualizacao}
                    value={buscaAntecessor || antecessorSelecionado}
                    onChange={(e) => {
                      setBuscaAntecessor(e.target.value);
                      setAntecessorSelecionado(e.target.value);
                    }}
                    placeholder="Digite nome de guerra ou número..."
                    className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl uppercase outline-none disabled:bg-slate-100 disabled:text-slate-600"
                  />
                </div>
                {buscaAntecessor &&
                  !modoVisualizacao &&
                  filtrarPoliciais(buscaAntecessor).length > 0 && (
                    <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                      {filtrarPoliciais(buscaAntecessor).map((p) => {
                        const nomeFormatado = formatarNomeCompletoPolicial(p);
                        return (
                          <div
                            key={p.id}
                            onClick={() => {
                              setAntecessorSelecionado(nomeFormatado);
                              setBuscaAntecessor("");
                            }}
                            className="p-2 hover:bg-blue-50 cursor-pointer text-slate-700 font-medium border-b border-slate-100 last:border-none"
                          >
                            {nomeFormatado}
                          </div>
                        );
                      })}
                    </div>
                  )}
              </div>

              <div className="relative">
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Substituto Legal (Passagem)
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    disabled={modoVisualizacao}
                    value={buscaSubstituto || substitutoSelecionado}
                    onChange={(e) => {
                      setBuscaSubstituto(e.target.value);
                      setSubstitutoSelecionado(e.target.value);
                    }}
                    placeholder="Digite nome de guerra ou número..."
                    className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl uppercase outline-none disabled:bg-slate-100 disabled:text-slate-600"
                  />
                </div>
                {buscaSubstituto &&
                  !modoVisualizacao &&
                  filtrarPoliciais(buscaSubstituto).length > 0 && (
                    <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                      {filtrarPoliciais(buscaSubstituto).map((p) => {
                        const nomeFormatado = formatarNomeCompletoPolicial(p);
                        return (
                          <div
                            key={p.id}
                            onClick={() => {
                              setSubstitutoSelecionado(nomeFormatado);
                              setBuscaSubstituto("");
                            }}
                            className="p-2 hover:bg-blue-50 cursor-pointer text-slate-700 font-medium border-b border-slate-100 last:border-none"
                          >
                            {nomeFormatado}
                          </div>
                        );
                      })}
                    </div>
                  )}
              </div>
            </div>
          </div>

          {/* BLOCO 2: 3ª PARTE - CONTROLE DE VIATURAS */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-6">
            <h3 className="font-bold text-slate-700 uppercase tracking-wide text-xs border-b pb-2 flex items-center gap-1.5">
              <Car className="w-4 h-4 text-blue-600" /> 3.ª Parte: Controle de
              Quilometragem, Abastecimento, Baixadas e Saídas
            </h3>

            {/* TABELA 1 */}
            <div className="space-y-3 bg-white p-3 rounded-xl border border-slate-200">
              <div className="flex justify-between items-center border-b pb-2">
                <span className="font-bold text-slate-700 text-xs">
                  1. Controle de Quilometragem e Abastecimento
                </span>
                {!modoVisualizacao && (
                  <button
                    type="button"
                    onClick={adicionarViaturaRow}
                    className="px-2.5 py-1 bg-blue-600 text-white rounded-lg font-bold text-[10px] flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Adicionar Vtr
                  </button>
                )}
              </div>

              {viaturasLista.map((vtrItem, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end pt-2 border-b border-slate-100 pb-2 last:border-none"
                >
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-600">
                      Viatura
                    </label>
                    <input
                      type="text"
                      disabled={modoVisualizacao}
                      value={vtrItem.vtr}
                      onChange={(e) =>
                        atualizarViatura(idx, "vtr", e.target.value)
                      }
                      placeholder="RP 151002"
                      className="w-full p-2 bg-slate-50 border rounded-lg uppercase text-xs disabled:bg-slate-100 disabled:text-slate-600"
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <label className="block text-[10px] font-bold text-slate-600">
                      KM Inicial
                    </label>
                    <input
                      type="number"
                      disabled={modoVisualizacao}
                      value={vtrItem.km_inicial}
                      onChange={(e) =>
                        atualizarViatura(idx, "km_inicial", e.target.value)
                      }
                      className="w-full p-2 bg-slate-50 border rounded-lg font-mono text-xs disabled:bg-slate-100 disabled:text-slate-600"
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <label className="block text-[10px] font-bold text-slate-600">
                      KM Final
                    </label>
                    <input
                      type="number"
                      disabled={modoVisualizacao}
                      value={vtrItem.km_final}
                      onChange={(e) =>
                        atualizarViatura(idx, "km_final", e.target.value)
                      }
                      className="w-full p-2 bg-slate-50 border rounded-lg font-mono text-xs disabled:bg-slate-100 disabled:text-slate-600"
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <label className="block text-[10px] font-bold text-slate-600">
                      KM Abast.
                    </label>
                    <input
                      type="number"
                      disabled={modoVisualizacao}
                      value={vtrItem.km_abast}
                      onChange={(e) =>
                        atualizarViatura(idx, "km_abast", e.target.value)
                      }
                      className="w-full p-2 bg-slate-50 border rounded-lg font-mono text-xs disabled:bg-slate-100 disabled:text-slate-600"
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <label className="block text-[10px] font-bold text-slate-600">
                      Litros
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      disabled={modoVisualizacao}
                      value={vtrItem.litros}
                      onChange={(e) =>
                        atualizarViatura(idx, "litros", e.target.value)
                      }
                      className="w-full p-2 bg-slate-50 border rounded-lg font-mono text-xs disabled:bg-slate-100 disabled:text-slate-600"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-600">
                      Valor (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      disabled={modoVisualizacao}
                      value={vtrItem.valor}
                      onChange={(e) =>
                        atualizarViatura(idx, "valor", e.target.value)
                      }
                      className="w-full p-2 bg-slate-50 border rounded-lg font-mono text-xs disabled:bg-slate-100 disabled:text-slate-600"
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <label className="block text-[10px] font-bold text-slate-600">
                      Saldo
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      disabled={modoVisualizacao}
                      value={vtrItem.saldo}
                      onChange={(e) =>
                        atualizarViatura(idx, "saldo", e.target.value)
                      }
                      className="w-full p-2 bg-slate-50 border rounded-lg font-mono text-xs disabled:bg-slate-100 disabled:text-slate-600"
                    />
                  </div>
                  <div className="sm:col-span-1 flex justify-end">
                    {viaturasLista.length > 1 && !modoVisualizacao && (
                      <button
                        type="button"
                        onClick={() => removerViaturaRow(idx)}
                        className="p-2 bg-rose-100 text-rose-700 rounded-lg hover:bg-rose-200"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* TABELA 2: BAIXADAS */}
            <div className="space-y-3 bg-white p-3 rounded-xl border border-slate-200">
              <div className="flex justify-between items-center border-b pb-2">
                <span className="font-bold text-slate-700 text-xs">
                  2. Viaturas Baixadas (Oficina / Manutenção)
                </span>
                {!modoVisualizacao && (
                  <button
                    type="button"
                    onClick={() =>
                      setViaturasBaixadas([
                        ...viaturasBaixadas,
                        { vtr: "", motorista: "", motivo: "", local: "" },
                      ])
                    }
                    className="px-2.5 py-1 bg-blue-600 text-white rounded-lg font-bold text-[10px] flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Adicionar Baixada
                  </button>
                )}
              </div>

              {viaturasBaixadas.map((bx, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end pt-2 border-b border-slate-100 pb-2 last:border-none"
                >
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-600">
                      Viatura
                    </label>
                    <input
                      type="text"
                      disabled={modoVisualizacao}
                      value={bx.vtr}
                      onChange={(e) => {
                        const lista = [...viaturasBaixadas];
                        lista[idx].vtr = e.target.value;
                        setViaturasBaixadas(lista);
                      }}
                      placeholder="Ex: CP 15332"
                      className="w-full p-2 bg-slate-50 border rounded-lg uppercase text-xs disabled:bg-slate-100 disabled:text-slate-600"
                    />
                  </div>

                  <div className="sm:col-span-3 relative">
                    <label className="block text-[10px] font-bold text-slate-600">
                      Motorista Ciente
                    </label>
                    <input
                      type="text"
                      disabled={modoVisualizacao}
                      value={bx.motorista}
                      onChange={(e) => {
                        const lista = [...viaturasBaixadas];
                        lista[idx].motorista = e.target.value;
                        setViaturasBaixadas(lista);
                      }}
                      placeholder="Busca por nome/número..."
                      className="w-full p-2 bg-slate-50 border rounded-lg uppercase text-xs disabled:bg-slate-100 disabled:text-slate-600"
                    />
                    {bx.motorista &&
                      !modoVisualizacao &&
                      filtrarPoliciais(bx.motorista).length > 0 && (
                        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-36 overflow-y-auto">
                          {filtrarPoliciais(bx.motorista).map((p) => {
                            const nomeFormatado =
                              formatarNomeCompletoPolicial(p);
                            return (
                              <div
                                key={p.id}
                                onClick={() => {
                                  const lista = [...viaturasBaixadas];
                                  lista[idx].motorista = nomeFormatado;
                                  setViaturasBaixadas(lista);
                                }}
                                className="p-2 hover:bg-blue-50 cursor-pointer text-xs text-slate-700 border-b last:border-none"
                              >
                                {nomeFormatado}
                              </div>
                            );
                          })}
                        </div>
                      )}
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-[10px] font-bold text-slate-600">
                      Motivo
                    </label>
                    <input
                      type="text"
                      disabled={modoVisualizacao}
                      value={bx.motivo}
                      onChange={(e) => {
                        const lista = [...viaturasBaixadas];
                        lista[idx].motivo = e.target.value;
                        setViaturasBaixadas(lista);
                      }}
                      placeholder="Problema mecânico"
                      className="w-full p-2 bg-slate-50 border rounded-lg text-xs disabled:bg-slate-100 disabled:text-slate-600"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-[10px] font-bold text-slate-600">
                      Local
                    </label>
                    <input
                      type="text"
                      disabled={modoVisualizacao}
                      value={bx.local}
                      onChange={(e) => {
                        const lista = [...viaturasBaixadas];
                        lista[idx].local = e.target.value;
                        setViaturasBaixadas(lista);
                      }}
                      placeholder="Oficina"
                      className="w-full p-2 bg-slate-50 border rounded-lg text-xs disabled:bg-slate-100 disabled:text-slate-600"
                    />
                  </div>

                  <div className="sm:col-span-1 flex justify-end">
                    {viaturasBaixadas.length > 1 && !modoVisualizacao && (
                      <button
                        type="button"
                        onClick={() =>
                          setViaturasBaixadas(
                            viaturasBaixadas.filter((_, i) => i !== idx),
                          )
                        }
                        className="p-2 bg-rose-100 text-rose-700 rounded-lg hover:bg-rose-200"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* TABELA 3: SAÍDA E CHEGADA */}
            <div className="space-y-3 bg-white p-3 rounded-xl border border-slate-200">
              <div className="flex justify-between items-center border-b pb-2">
                <span className="font-bold text-slate-700 text-xs">
                  3. Controle de Saída e Chegada das Vtrs Disponíveis
                </span>
                {!modoVisualizacao && (
                  <button
                    type="button"
                    onClick={() =>
                      setViaturasSaida([
                        ...viaturasSaida,
                        {
                          vtr: "",
                          km_hr_saida: "",
                          km_hr_chegada: "",
                          motorista: "",
                          destino: "",
                        },
                      ])
                    }
                    className="px-2.5 py-1 bg-blue-600 text-white rounded-lg font-bold text-[10px] flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Adicionar Saída
                  </button>
                )}
              </div>

              {viaturasSaida.map((s, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end pt-2 border-b border-slate-100 pb-2 last:border-none"
                >
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-600">
                      Vtr
                    </label>
                    <input
                      type="text"
                      disabled={modoVisualizacao}
                      value={s.vtr}
                      onChange={(e) => {
                        const lista = [...viaturasSaida];
                        lista[idx].vtr = e.target.value;
                        setViaturasSaida(lista);
                      }}
                      placeholder="CP 151002"
                      className="w-full p-2 bg-slate-50 border rounded-lg uppercase text-xs disabled:bg-slate-100 disabled:text-slate-600"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-600">
                      KM / Hr Saída
                    </label>
                    <input
                      type="text"
                      disabled={modoVisualizacao}
                      value={s.km_hr_saida}
                      onChange={(e) => {
                        const lista = [...viaturasSaida];
                        lista[idx].km_hr_saida = e.target.value;
                        setViaturasSaida(lista);
                      }}
                      placeholder="31.713 / 08:00"
                      className="w-full p-2 bg-slate-50 border rounded-lg text-xs font-mono disabled:bg-slate-100 disabled:text-slate-600"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-600">
                      KM / Hr Chegada
                    </label>
                    <input
                      type="text"
                      disabled={modoVisualizacao}
                      value={s.km_hr_chegada}
                      onChange={(e) => {
                        const lista = [...viaturasSaida];
                        lista[idx].km_hr_chegada = e.target.value;
                        setViaturasSaida(lista);
                      }}
                      placeholder="31.839 / 14:00"
                      className="w-full p-2 bg-slate-50 border rounded-lg text-xs font-mono disabled:bg-slate-100 disabled:text-slate-600"
                    />
                  </div>

                  <div className="sm:col-span-3 relative">
                    <label className="block text-[10px] font-bold text-slate-600">
                      Motorista
                    </label>
                    <input
                      type="text"
                      disabled={modoVisualizacao}
                      value={s.motorista}
                      onChange={(e) => {
                        const lista = [...viaturasSaida];
                        lista[idx].motorista = e.target.value;
                        setViaturasSaida(lista);
                      }}
                      placeholder="Busca..."
                      className="w-full p-2 bg-slate-50 border rounded-lg uppercase text-xs disabled:bg-slate-100 disabled:text-slate-600"
                    />
                    {s.motorista &&
                      !modoVisualizacao &&
                      filtrarPoliciais(s.motorista).length > 0 && (
                        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-36 overflow-y-auto">
                          {filtrarPoliciais(s.motorista).map((p) => {
                            const nomeFormatado =
                              formatarNomeCompletoPolicial(p);
                            return (
                              <div
                                key={p.id}
                                onClick={() => {
                                  const lista = [...viaturasSaida];
                                  lista[idx].motorista = nomeFormatado;
                                  setViaturasSaida(lista);
                                }}
                                className="p-2 hover:bg-blue-50 cursor-pointer text-xs text-slate-700 border-b last:border-none"
                              >
                                {nomeFormatado}
                              </div>
                            );
                          })}
                        </div>
                      )}
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-600">
                      Destino
                    </label>
                    <input
                      type="text"
                      disabled={modoVisualizacao}
                      value={s.destino}
                      onChange={(e) => {
                        const lista = [...viaturasSaida];
                        lista[idx].destino = e.target.value;
                        setViaturasSaida(lista);
                      }}
                      placeholder="DRSO"
                      className="w-full p-2 bg-slate-50 border rounded-lg uppercase text-xs disabled:bg-slate-100 disabled:text-slate-600"
                    />
                  </div>

                  <div className="sm:col-span-1 flex justify-end">
                    {viaturasSaida.length > 1 && !modoVisualizacao && (
                      <button
                        type="button"
                        onClick={() =>
                          setViaturasSaida(
                            viaturasSaida.filter((_, i) => i !== idx),
                          )
                        }
                        className="p-2 bg-rose-100 text-rose-700 rounded-lg hover:bg-rose-200"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* BLOCO 3: 5ª PARTE - OCORRÊNCIAS */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-slate-700 uppercase tracking-wide text-xs flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-blue-600" /> 5.ª Parte:
                Ocorrências e Alterações
              </h3>
              {!modoVisualizacao && (
                <button
                  type="button"
                  onClick={adicionarOcorrencia}
                  className="px-2.5 py-1 bg-blue-600 text-white rounded-lg font-bold text-[10px] flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Adicionar Ocorrência
                </button>
              )}
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
              <p className="font-bold text-slate-800 text-xs italic">
                "Comunico a Vossa Senhoria que:"
              </p>

              <div className="space-y-3">
                {ocorrencias.map((oco, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <span className="font-bold text-slate-600 text-xs mt-2 w-6 shrink-0">
                      {idx + 1}.
                    </span>
                    <div className="flex-1">
                      <textarea
                        rows="3"
                        disabled={modoVisualizacao}
                        value={oco.descricao}
                        onChange={(e) =>
                          atualizarOcorrencia(idx, e.target.value)
                        }
                        placeholder="Digite a descrição da ocorrência..."
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl resize-none text-xs outline-none disabled:bg-slate-100 disabled:text-slate-600"
                      />
                    </div>
                    {ocorrencias.length > 1 && !modoVisualizacao && (
                      <button
                        type="button"
                        onClick={() => removerOcorrencia(idx)}
                        className="mt-2 p-2 bg-rose-100 text-rose-700 rounded-lg hover:bg-rose-200"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </form>

        {/* TEMPLATE OCULTO PARA GERAÇÃO DO PDF OFICIAL */}
        <div
          id="conteudo-pdf-oficial"
          style={{
            display: "none",
            width: "210mm",
            background: "white",
            padding: "15mm",
            fontFamily: "Times New Roman, serif",
            color: "#000",
            boxSizing: "border-box",
          }}
        >
          {/* CABEÇALHO COM LOGO */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: "15px",
            }}
          >
            <div style={{ width: "100%", textAlign: "center" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: "20px",
                  marginBottom: "8px",
                }}
              >
                <img
                  src="/logo.png"
                  alt="Logo PMCE"
                  style={{ height: "55px", objectFit: "contain" }}
                  onError={(e) => {
                    e.target.style.display = "none";
                  }}
                />
              </div>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: "bold",
                  lineHeight: "1.3",
                }}
              >
                GOVERNO DO ESTADO DO CEARÁ
                <br />
                SECRETARIA DE SEGURANÇA PÚBLICA E DEFESA SOCIAL
                <br />
                POLÍCIA MILITAR DO CEARÁ
                <br />
                COMANDO DE POLICIAMENTO METROPOLITANO LESTE
                <br />
                2.ª CIA / 15.º BPM / CASCAVEL – CE
              </div>
            </div>

            {/* CAIXA "EM" */}
            <div
              style={{
                border: "1px solid #000",
                width: "130px",
                padding: "5px",
                textAlign: "center",
                fontSize: "10px",
                fontWeight: "bold",
                position: "absolute",
                right: "15mm",
              }}
            >
              EM:
              <br />
              <br />
              _____/_____/2026.
              <br />
              <br />
              <div
                style={{
                  borderTop: "1px solid #000",
                  marginTop: "5px",
                  paddingTop: "2px",
                }}
              >
                CMT DA 2.ª CIA
              </div>
            </div>
          </div>

          {/* TEXTO DE INTRODUÇÃO */}
          <div
            style={{
              fontSize: "12px",
              textAlign: "justify",
              margin: "20px 0",
              lineHeight: "1.5",
              textTransform: "uppercase",
            }}
          >
            PARTE DIÁRIA DO PERMANENTE DA GUARDA, O{" "}
            <b>{permanenteSelecionado || "3.º SGT PM 23.502 – SOARES"}</b>, NO
            SERVIÇO DO DIA <b>{formatarDataComDiaSemana(dataServico)}</b>, NO
            TURNO <b>{turno}</b>, AO COMANDANTE DA 2.ª CIA / 15.º BPM.
          </div>

          {/* 1.ª PARTE */}
          <div
            style={{
              fontSize: "12px",
              fontWeight: "bold",
              textAlign: "center",
              margin: "15px 0",
            }}
          >
            1.ª PARTE: RECEBIMENTO DO SERVIÇO
          </div>
          <div
            style={{
              fontSize: "12px",
              textAlign: "justify",
              margin: "10px 0",
              lineHeight: "1.4",
            }}
          >
            Recebi do meu antecessor legal, o{" "}
            <b>{antecessorSelecionado || "ST PM – FLAUBER"}</b>, todas as ordens
            e determinações legais em vigor, bem como, todo o material a cargo
            desta CIA PM, com alterações constadas em livro.
          </div>

          {/* 2.ª PARTE */}
          <div
            style={{
              fontSize: "12px",
              fontWeight: "bold",
              textAlign: "center",
              margin: "15px 0",
            }}
          >
            2.ª PARTE: ESCALA DE SERVIÇO
          </div>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "11px",
              marginBottom: "15px",
            }}
          >
            <tbody>
              <tr>
                <td
                  style={{
                    border: "1px solid #000",
                    padding: "4px",
                    width: "45%",
                    fontWeight: "bold",
                  }}
                >
                  COMANDANTE DA 2ªCIA / 15ºBPM
                </td>
                <td style={{ border: "1px solid #000", padding: "4px" }}>
                  1.º TEN QOPM – TEIXEIRA
                </td>
              </tr>
              <tr>
                <td
                  style={{
                    border: "1px solid #000",
                    padding: "4px",
                    fontWeight: "bold",
                  }}
                >
                  SUB. COMANDANTE DA 2ªCIA / 15ºBPM
                </td>
                <td style={{ border: "1px solid #000", padding: "4px" }}>—</td>
              </tr>
              <tr>
                <td
                  style={{
                    border: "1px solid #000",
                    padding: "4px",
                    fontWeight: "bold",
                  }}
                >
                  PERMANENTE DA GUARDA
                </td>
                <td style={{ border: "1px solid #000", padding: "4px" }}>
                  {permanenteSelecionado}
                </td>
              </tr>
            </tbody>
          </table>

          {/* 3.ª PARTE */}
          <div
            style={{
              fontSize: "12px",
              fontWeight: "bold",
              textAlign: "center",
              margin: "15px 0",
            }}
          >
            3.ª PARTE: CONTROLE DE VIATURA
          </div>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "10px",
              textAlign: "center",
              marginBottom: "15px",
            }}
          >
            <thead>
              <tr style={{ background: "#f2f2f2" }}>
                <th style={{ border: "1px solid #000", padding: "4px" }}>
                  VIATURA
                </th>
                <th style={{ border: "1px solid #000", padding: "4px" }}>
                  KM INICIAL
                </th>
                <th style={{ border: "1px solid #000", padding: "4px" }}>
                  KM FINAL
                </th>
                <th style={{ border: "1px solid #000", padding: "4px" }}>
                  KM ROD
                </th>
                <th style={{ border: "1px solid #000", padding: "4px" }}>
                  KM ABAST.
                </th>
                <th style={{ border: "1px solid #000", padding: "4px" }}>
                  LITROS
                </th>
                <th style={{ border: "1px solid #000", padding: "4px" }}>
                  VALOR
                </th>
                <th style={{ border: "1px solid #000", padding: "4px" }}>
                  SALDO
                </th>
              </tr>
            </thead>
            <tbody>
              {viaturasLista.map((v, i) => (
                <tr key={i}>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "4px",
                      fontWeight: "bold",
                    }}
                  >
                    {v.vtr}
                  </td>
                  <td style={{ border: "1px solid #000", padding: "4px" }}>
                    {v.km_inicial || "-"}
                  </td>
                  <td style={{ border: "1px solid #000", padding: "4px" }}>
                    {v.km_final || "-"}
                  </td>
                  <td style={{ border: "1px solid #000", padding: "4px" }}>
                    {v.km_rodado || "-"}
                  </td>
                  <td style={{ border: "1px solid #000", padding: "4px" }}>
                    {v.km_abast || "-"}
                  </td>
                  <td style={{ border: "1px solid #000", padding: "4px" }}>
                    {v.litros || "-"}
                  </td>
                  <td style={{ border: "1px solid #000", padding: "4px" }}>
                    {v.valor || "-"}
                  </td>
                  <td style={{ border: "1px solid #000", padding: "4px" }}>
                    {v.saldo || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* 4.ª PARTE */}
          <div
            style={{
              fontSize: "12px",
              fontWeight: "bold",
              textAlign: "center",
              margin: "15px 0",
            }}
          >
            4.ª PARTE: JUSTIÇA E DISCIPLINA
          </div>
          <div
            style={{
              fontSize: "11px",
              textAlign: "center",
              marginBottom: "15px",
            }}
          >
            S/A
          </div>

          {/* 5.ª PARTE */}
          <div
            style={{
              fontSize: "12px",
              fontWeight: "bold",
              textAlign: "center",
              margin: "15px 0",
            }}
          >
            5.ª PARTE: OCORRÊNCIAS
          </div>
          <div
            style={{
              fontSize: "11px",
              fontStyle: "italic",
              marginBottom: "10px",
            }}
          >
            COMUNICO A V.S.ª QUE:
          </div>
          <div
            style={{
              fontSize: "11px",
              textAlign: "justify",
              lineHeight: "1.4",
              marginBottom: "20px",
            }}
          >
            {ocorrencias.map((oco, idx) => (
              <div key={idx} style={{ marginBottom: "8px" }}>
                <b>{idx + 1}</b> –{" "}
                {oco.descricao || "Nenhuma alteração registrada."}
              </div>
            ))}
          </div>

          {/* 6.ª PARTE */}
          <div
            style={{
              fontSize: "12px",
              fontWeight: "bold",
              textAlign: "center",
              margin: "15px 0",
            }}
          >
            6.ª PARTE: PASSAGEM DE SERVIÇO
          </div>
          <div
            style={{
              fontSize: "11px",
              textAlign: "justify",
              marginBottom: "30px",
              lineHeight: "1.4",
            }}
          >
            Entreguei ao meu substituto legal o{" "}
            <b>{substitutoSelecionado || "2.º SGT PM – 23.233 – IWATA"}</b>, com
            todas as ordens e determinações legais em vigor, bem como todo o
            material a cargo desta CIA, com alterações constadas em livro.
          </div>

          {/* ENCERRAMENTO E ASSINATURA */}
          <div
            style={{ textAlign: "center", fontSize: "12px", marginTop: "40px" }}
          >
            Quartel em Cascavel, {formatarDataExtensoSimples(dataServico)}.
            <br />
            <br />
            <br />
            ____________________________________________________________
            <br />
            <b>{permanenteSelecionado}</b>
            <br />
            Permanente da Guarda
            <br />
            <b>TURNO {turno}</b>
          </div>

          {/* FAIXA COLORIDA DE RODAPÉ INSTITUCIONAL */}
          <div style={{ marginTop: "50px", textAlign: "center" }}>
            <img
              src="/rodape.png"
              alt="Rodapé"
              style={{ width: "100%", height: "20px", objectFit: "cover" }}
              onError={(e) => {
                e.target.style.display = "none";
              }}
            />
          </div>
        </div>

        {/* BOTÕES DE CONTROLE INFERIORES */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-3 border-t">
          <div className="w-full sm:w-auto flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 font-bold rounded-xl text-slate-700 hover:bg-slate-200"
            >
              fechar
            </button>

            {tempoDecorridoTexto && (
              <span className="text-emerald-700 font-bold text-[11px] animate-pulse">
                {tempoDecorridoTexto}
              </span>
            )}
          </div>

          <div className="w-full sm:w-auto flex flex-wrap gap-2 justify-end">
            {!modoVisualizacao ? (
              <>
                <button
                  type="submit"
                  disabled={salvando}
                  onClick={(e) => handleSalvarLivro(e, false)}
                  className={`w-full sm:w-auto px-6 py-2.5 font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 ${
                    statusBotaoSalvo
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : "bg-slate-800 text-white hover:bg-slate-900"
                  } disabled:opacity-50`}
                >
                  {statusBotaoSalvo ? (
                    <>
                      <Check className="w-4 h-4" /> Salvo
                    </>
                  ) : salvando ? (
                    "Salvando..."
                  ) : (
                    "Salvar Livro"
                  )}
                </button>
                <button
                  type="button"
                  disabled={salvando}
                  onClick={(e) => handleSalvarLivro(e, true)}
                  className="w-full sm:w-auto px-6 py-2.5 bg-rose-600 text-white font-bold rounded-xl shadow-md hover:bg-rose-700 flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Lock className="w-4 h-4" /> Fechar Livro
                </button>
              </>
            ) : (
              <>
                {isMaster && (
                  <button
                    type="button"
                    disabled={salvando}
                    onClick={handleGerarNovoLivroApartirDeste}
                    className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-md hover:bg-indigo-700 flex items-center gap-1.5"
                  >
                    <Copy className="w-4 h-4" /> Gerar Novo Livro a partir deste
                  </button>
                )}

                <button
                  type="button"
                  disabled={gerandoPdf}
                  onClick={handleBaixarPdfOficial}
                  className="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 text-white font-bold rounded-xl shadow-md hover:bg-emerald-700 flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
                >
                  {gerandoPdf ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Gerando PDF...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" /> Baixar Livro Oficial
                      (PDF)
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
