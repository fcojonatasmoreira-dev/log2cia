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

  // Dados da escala de serviço
  const [comandanteNome, setComandanteNome] = useState("");
  const [subcomandanteNome, setSubcomandanteNome] = useState("");
  const [p1Nome, setP1Nome] = useState("");
  const [fiscalAisNome, setFiscalAisNome] = useState("");
  const [auxAdmFiscalNome, setAuxAdmFiscalNome] = useState("");
  const [auxPermanenteNome, setAuxPermanenteNome] = useState("");
  const [armeiroNome, setArmeiroNome] = useState("");
  const [buscasEscala, setBuscasEscala] = useState({});

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
        setComandanteNome(livroParaEditar.comandante_nome || "");
        setSubcomandanteNome(livroParaEditar.subcomandante_nome || "");
        setP1Nome(livroParaEditar.p1_nome || "");
        setFiscalAisNome(livroParaEditar.fiscal_ais_nome || "");
        setAuxAdmFiscalNome(livroParaEditar.aux_adm_fiscal_nome || "");
        setAuxPermanenteNome(livroParaEditar.aux_permanente_nome || "");
        setArmeiroNome(livroParaEditar.armeiro_nome || "");
        setBuscasEscala({});

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
        setComandanteNome("");
        setSubcomandanteNome("");
        setP1Nome("");
        setFiscalAisNome("");
        setAuxAdmFiscalNome("");
        setAuxPermanenteNome("");
        setArmeiroNome("");
        setBuscasEscala({});
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

  async function verificarLivroExistente(
    data,
    turnoSelecionado,
    ignorarId = null,
  ) {
    let consulta = supabase
      .from("livros_permanencia")
      .select("id")
      .eq("data_servico", data)
      .eq("turno", turnoSelecionado);

    if (ignorarId) consulta = consulta.neq("id", ignorarId);

    const { data: existentes, error } = await consulta.limit(1);
    if (error) throw error;
    return Boolean(existentes?.length);
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
        const numero = String(
          p.numeral || p.numero_policial || p.numero || p.nº || p.num || "",
        ).toLowerCase();
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

  const filtrarPoliciaisPorFuncao = (termo, funcao) => {
    const normalizar = (valor) =>
      String(valor || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

    let lista = policiais;

    if (funcao === "comandante" || funcao === "subcomandante") {
      lista = policiais.filter((p) => {
        const posto = normalizar(p.posto_graduacao || p.posto);
        return /tenente|capitao|major|coronel/.test(posto);
      });
    } else if (funcao === "armeiro") {
      lista = policiais.filter(
        (p) =>
          String(p.role || "")
            .trim()
            .toLowerCase() === "armeiro",
      );
    }

    if (!termo || termo.trim() === "") return lista.slice(0, 5);
    const t = normalizar(termo);

    return lista
      .filter((p) => {
        const camposBusca = [
          p.nome_guerra,
          p.nome_completo,
          p.nome,
          p.matricula,
          p.numeral,
          p.numero_policial,
          p.numero,
          p.nº,
          p.num,
          p.posto_graduacao,
          p.posto,
        ];
        return camposBusca.some((campo) => normalizar(campo).includes(t));
      })
      .slice(0, 5);
  };

  const formatarNomeCompletoPolicial = (p) => {
    if (!p) return "";

    // Captura os dados independentemente dos nomes das colunas
    const posto = p.posto_graduacao || p.posto || p.graduacao || "";
    const numero =
      p.numeral || p.numero_policial || p.numero || p.nº || p.num || "";
    const guerra = p.nome_guerra || p.guerra || p.nome || "";

    // Monta no padrão: Posto/Graduação + Numeral + Nome de Guerra
    const partes = [];
    if (posto) partes.push(posto);
    if (numero) partes.push(numero);
    if (guerra) partes.push(`– ${guerra}`);

    return partes.join(" ").replace(/\s+–/, " –").trim();
  };

  const formatarNomeComMatricula = (nomeCompleto) => {
    if (!nomeCompleto) return "";
    const nomeNormalizado = String(nomeCompleto).trim().toLowerCase();
    const policial = policiais.find(
      (p) =>
        formatarNomeCompletoPolicial(p).trim().toLowerCase() ===
          nomeNormalizado ||
        String(p.nome_guerra || p.guerra || p.nome || "")
          .trim()
          .toLowerCase() === nomeNormalizado,
    );
    const matricula = policial?.matricula || policial?.mat || "";
    return matricula ? `${nomeCompleto} / ${matricula}` : nomeCompleto;
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
      // Ao gerar a partir de um livro existente, cria o outro turno do mesmo dia.
      const turnoNovo = String(turno).trim().toUpperCase() === "A" ? "B" : "A";
      const jaExiste = await verificarLivroExistente(dataServico, turnoNovo);
      if (jaExiste) {
        alert(`Já existe um livro para ${dataServico} no turno ${turnoNovo}.`);
        return;
      }

      const { data: livroCriado, error: livroErr } = await supabase
        .from("livros_permanencia")
        .insert([
          {
            data_servico: dataServico,
            turno: turnoNovo,
            permanente_nome: permanenteSelecionado,
            antecessor_nome: antecessorSelecionado,
            substituto_nome: substitutoSelecionado,
            comandante_nome: comandanteNome,
            subcomandante_nome: subcomandanteNome,
            p1_nome: p1Nome,
            fiscal_ais_nome: fiscalAisNome,
            aux_adm_fiscal_nome: auxAdmFiscalNome,
            aux_permanente_nome: auxPermanenteNome,
            armeiro_nome: armeiroNome,
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

      const ocorrenciasPreenchidas = ocorrencias
        .map((o) => ({ ...o, descricao: (o.descricao || "").trim() }))
        .filter((o) => o.descricao);

      if (ocorrenciasPreenchidas.length > 0) {
        const ocoPayload = ocorrenciasPreenchidas.map((o, idx) => ({
          livro_id: novoLivroId,
          ordem: idx + 1,
          descricao: o.descricao,
        }));
        await supabase.from("livro_ocorrencias").insert(ocoPayload);
      }

      alert(
        `Novo rascunho do turno ${turnoNovo} gerado com sucesso a partir deste livro!`,
      );
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

      const jaExiste = await verificarLivroExistente(
        dataServico,
        turno,
        livroId,
      );
      if (jaExiste) {
        alert(`Já existe um livro para ${dataServico} no turno ${turno}.`);
        return;
      }

      if (livroId && !modoVisualizacao) {
        const { error: updErr } = await supabase
          .from("livros_permanencia")
          .update({
            data_servico: dataServico,
            turno: turno,
            permanente_nome: permanenteSelecionado,
            antecessor_nome: antecessorSelecionado,
            substituto_nome: substitutoSelecionado,
            comandante_nome: comandanteNome,
            subcomandante_nome: subcomandanteNome,
            p1_nome: p1Nome,
            fiscal_ais_nome: fiscalAisNome,
            aux_adm_fiscal_nome: auxAdmFiscalNome,
            aux_permanente_nome: auxPermanenteNome,
            armeiro_nome: armeiroNome,
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
              comandante_nome: comandanteNome,
              subcomandante_nome: subcomandanteNome,
              p1_nome: p1Nome,
              fiscal_ais_nome: fiscalAisNome,
              aux_adm_fiscal_nome: auxAdmFiscalNome,
              aux_permanente_nome: auxPermanenteNome,
              armeiro_nome: armeiroNome,
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

      const ocorrenciasPreenchidas = ocorrencias
        .map((o) => ({ ...o, descricao: (o.descricao || "").trim() }))
        .filter((o) => o.descricao);

      if (ocorrenciasPreenchidas.length > 0) {
        const ocoPayload = ocorrenciasPreenchidas.map((o, idx) => ({
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
    const elemento = document.getElementById("conteudo-pdf-oficial");
    const rodape = elemento?.querySelector("img[data-pdf-rodape]");
    const displayOriginal = elemento?.style.display;
    const rodapeDisplayOriginal = rodape?.style.display;

    try {
      if (!elemento) throw new Error("Elemento de impressão não encontrado.");

      elemento.style.display = "block";
      if (rodape) rodape.style.display = "none";

      const { jsPDF } = await import("jspdf");
      const canvas = await html2canvas(elemento, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      elemento.style.display = displayOriginal || "none";
      if (rodape) rodape.style.display = rodapeDisplayOriginal || "";

      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const alturaRodape = 8;
      const espacoNumeracao = 7;
      const alturaConteudo = pdfHeight - alturaRodape - espacoNumeracao;
      const pixelsPorMm = canvas.width / pdfWidth;
      const alturaFatia = Math.floor(alturaConteudo * pixelsPorMm);

      // Define pontos de quebra em limites de linhas/tabelas para não
      // cortar uma tabela no meio quando houver espaço para movê-la.
      const retanguloElemento = elemento.getBoundingClientRect();
      const escalaY = canvas.height / Math.max(retanguloElemento.height, 1);
      const topoElemento = retanguloElemento.top;
      const tabelas = Array.from(elemento.querySelectorAll("table")).map(
        (tabela) => {
          const retanguloTabela = tabela.getBoundingClientRect();
          const titulo = tabela.previousElementSibling;
          const tituloTexto = titulo?.textContent?.trim() || "";
          const topoTitulo =
            titulo && /PARTE|CONTROLE/i.test(tituloTexto)
              ? Math.max(
                  0,
                  (titulo.getBoundingClientRect().top - topoElemento) * escalaY,
                )
              : Math.max(0, (retanguloTabela.top - topoElemento) * escalaY);
          return {
            topo: Math.max(0, (retanguloTabela.top - topoElemento) * escalaY),
            base: Math.min(
              canvas.height,
              (retanguloTabela.bottom - topoElemento) * escalaY,
            ),
            topoTitulo,
            linhas: Array.from(tabela.querySelectorAll("tr")).map((linha) =>
              Math.min(
                canvas.height,
                (linha.getBoundingClientRect().bottom - topoElemento) * escalaY,
              ),
            ),
          };
        },
      );

      const cortes = [];
      let inicioCorte = 0;
      while (inicioCorte < canvas.height) {
        let fimCorte = Math.min(inicioCorte + alturaFatia, canvas.height);

        if (fimCorte < canvas.height) {
          const tabelaAtingida = tabelas.find(
            (tabela) => tabela.topo < fimCorte && tabela.base > fimCorte,
          );

          if (tabelaAtingida) {
            // Se o título e a tabela ainda cabem juntos na página seguinte,
            // inicia o conjunto lá. Caso contrário, quebra entre linhas.
            const alturaGrupo = tabelaAtingida.base - tabelaAtingida.topoTitulo;
            if (
              tabelaAtingida.topoTitulo > inicioCorte + 20 &&
              alturaGrupo <= alturaFatia
            ) {
              fimCorte = tabelaAtingida.topoTitulo;
            } else {
              const limitesSeguros = tabelaAtingida.linhas.filter(
                (limite) => limite > inicioCorte + 20 && limite <= fimCorte,
              );
              if (limitesSeguros.length) {
                fimCorte = limitesSeguros[limitesSeguros.length - 1];
              } else if (tabelaAtingida.topo > inicioCorte + 20) {
                fimCorte = tabelaAtingida.topoTitulo;
              }
            }
          }
        }

        if (fimCorte <= inicioCorte) {
          fimCorte = Math.min(inicioCorte + alturaFatia, canvas.height);
        }
        cortes.push({ inicio: inicioCorte, fim: fimCorte });
        inicioCorte = fimCorte;
      }
      const totalPaginas = cortes.length;

      let rodapeData = null;
      if (rodape?.complete && rodape.naturalWidth > 0) {
        const canvasRodape = document.createElement("canvas");
        canvasRodape.width = rodape.naturalWidth;
        canvasRodape.height = rodape.naturalHeight;
        const contextoRodape = canvasRodape.getContext("2d");
        contextoRodape.drawImage(rodape, 0, 0);
        rodapeData = canvasRodape.toDataURL("image/png");
      }

      for (let pagina = 0; pagina < totalPaginas; pagina += 1) {
        if (pagina > 0) pdf.addPage();

        const { inicio: inicioY, fim: fimY } = cortes[pagina];
        const alturaAtual = fimY - inicioY;
        const paginaCanvas = document.createElement("canvas");
        paginaCanvas.width = canvas.width;
        paginaCanvas.height = alturaAtual;
        const contexto = paginaCanvas.getContext("2d");
        contexto.fillStyle = "#ffffff";
        contexto.fillRect(0, 0, paginaCanvas.width, paginaCanvas.height);
        contexto.drawImage(
          canvas,
          0,
          inicioY,
          canvas.width,
          alturaAtual,
          0,
          0,
          canvas.width,
          alturaAtual,
        );

        const imagemPagina = paginaCanvas.toDataURL("image/jpeg", 0.98);
        const alturaImagemMm = alturaAtual / pixelsPorMm;
        pdf.addImage(imagemPagina, "JPEG", 0, 0, pdfWidth, alturaImagemMm);

        if (rodapeData) {
          pdf.addImage(
            rodapeData,
            "PNG",
            0,
            pdfHeight - alturaRodape,
            pdfWidth,
            alturaRodape,
          );
        }

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.text(
          `Página ${pagina + 1} de ${totalPaginas}`,
          pdfWidth - 10,
          pdfHeight - alturaRodape - 2,
          { align: "right" },
        );
      }

      pdf.save(`Livro_Permanencia_${dataServico}_Turno_${turno}.pdf`);
      onSuccess();
    } catch (err) {
      alert("Erro ao gerar PDF oficial: " + err.message);
    } finally {
      if (elemento) elemento.style.display = displayOriginal || "none";
      if (rodape) rodape.style.display = rodapeDisplayOriginal || "";
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {[
                [
                  "comandante",
                  "Comandante da 2ª CIA / 15º BPM",
                  comandanteNome,
                  setComandanteNome,
                ],
                [
                  "subcomandante",
                  "Subcomandante da 2ª CIA / 15º BPM",
                  subcomandanteNome,
                  setSubcomandanteNome,
                ],
                ["p1", "P-1 da 2ª CIA / 15º BPM", p1Nome, setP1Nome],
                [
                  "fiscalAis",
                  "Fiscal da AIS 15",
                  fiscalAisNome,
                  setFiscalAisNome,
                ],
                [
                  "auxAdmFiscal",
                  "Aux. Adm. do Fiscal",
                  auxAdmFiscalNome,
                  setAuxAdmFiscalNome,
                ],
                [
                  "auxPermanente",
                  "Aux. Permanente da Guarda",
                  auxPermanenteNome,
                  setAuxPermanenteNome,
                ],
                [
                  "armeiro",
                  "Armeiro da 2ª CIA / 15º BPM",
                  armeiroNome,
                  setArmeiroNome,
                ],
              ].map(([chave, label, valor, atualizar]) => (
                <div key={chave} className="relative">
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    {label}
                  </label>
                  {chave === "armeiro" ? (
                    <select
                      disabled={modoVisualizacao || loadingPoliciais}
                      value={valor}
                      onChange={(e) => atualizar(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl uppercase outline-none disabled:bg-slate-100 disabled:text-slate-600"
                    >
                      <option value="">
                        {loadingPoliciais
                          ? "Carregando armeiros..."
                          : "Selecione o armeiro..."}
                      </option>
                      {policiais
                        .filter(
                          (p) =>
                            String(p.role || "")
                              .trim()
                              .toLowerCase() === "armeiro",
                        )
                        .map((p) => {
                          const nomeFormatado = formatarNomeCompletoPolicial(p);
                          return (
                            <option key={p.id} value={nomeFormatado}>
                              {nomeFormatado}
                            </option>
                          );
                        })}
                    </select>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                        <input
                          type="text"
                          disabled={modoVisualizacao}
                          value={buscasEscala[chave] ?? valor}
                          onChange={(e) => {
                            const termo = e.target.value;
                            atualizar(termo);
                            setBuscasEscala((anterior) => ({
                              ...anterior,
                              [chave]: termo,
                            }));
                          }}
                          placeholder="Digite nome de guerra ou numeral..."
                          className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl uppercase outline-none disabled:bg-slate-100 disabled:text-slate-600"
                        />
                      </div>
                      {buscasEscala[chave] &&
                        !modoVisualizacao &&
                        filtrarPoliciaisPorFuncao(buscasEscala[chave], chave)
                          .length > 0 && (
                          <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                            {filtrarPoliciaisPorFuncao(
                              buscasEscala[chave],
                              chave,
                            ).map((p) => {
                              const nomeFormatado =
                                formatarNomeCompletoPolicial(p);
                              return (
                                <div
                                  key={p.id}
                                  onClick={() => {
                                    atualizar(nomeFormatado);
                                    setBuscasEscala((anterior) => {
                                      const novasBuscas = { ...anterior };
                                      delete novasBuscas[chave];
                                      return novasBuscas;
                                    });
                                  }}
                                  className="p-2 hover:bg-blue-50 cursor-pointer text-slate-700 font-medium border-b border-slate-100 last:border-none"
                                >
                                  {nomeFormatado}
                                </div>
                              );
                            })}
                          </div>
                        )}
                    </>
                  )}
                </div>
              ))}
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
                  <div className="sm:col-span-2">
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
                  <div className="sm:col-span-2">
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
                  <div className="sm:col-span-2">
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
              {[
                ["COMANDANTE DA 2ªCIA / 15ºBPM", comandanteNome],
                ["SUB. COMANDANTE DA 2ªCIA / 15ºBPM", subcomandanteNome],
                ["P-1 DA 2ªCIA / 15ºBPM", p1Nome],
                ["FISCAL DA AIS 15", fiscalAisNome],
                ["AUX. ADM. DO FISCAL", auxAdmFiscalNome],
                ["PERMANENTE DA GUARDA", permanenteSelecionado],
                ["AUX. PERMANENTE DA GUARDA", auxPermanenteNome],
                ["ARMEIRO DA 2ªCIA / 15ºBPM", armeiroNome],
              ].map(([funcao, nome]) => (
                <tr key={funcao}>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "4px",
                      width: "50%",
                      fontWeight: "bold",
                    }}
                  >
                    {funcao}
                  </td>
                  <td style={{ border: "1px solid #000", padding: "4px" }}>
                    {nome || "—"}
                  </td>
                </tr>
              ))}
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

          {/* 2.ª PARTE — VIATURAS BAIXADAS */}
          <div
            style={{
              fontSize: "12px",
              fontWeight: "bold",
              textAlign: "center",
              margin: "15px 0",
            }}
          >
            VIATURAS BAIXADAS (OFICINA / MANUTENÇÃO)
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
                {["VIATURA", "MOTORISTA CIENTE", "MOTIVO", "LOCAL"].map(
                  (titulo) => (
                    <th
                      key={titulo}
                      style={{ border: "1px solid #000", padding: "4px" }}
                    >
                      {titulo}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {viaturasBaixadas.map((v, i) => (
                <tr key={i}>
                  {[v.vtr, v.motorista, v.motivo, v.local].map((valor, j) => (
                    <td
                      key={j}
                      style={{ border: "1px solid #000", padding: "4px" }}
                    >
                      {valor || "-"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {/* 3.ª PARTE — SAÍDA E CHEGADA */}
          <div
            style={{
              fontSize: "12px",
              fontWeight: "bold",
              textAlign: "center",
              margin: "15px 0",
            }}
          >
            CONTROLE DE SAÍDA E CHEGADA DAS VTRS DISPONÍVEIS
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
                {[
                  "VIATURA",
                  "KM / HR SAÍDA",
                  "KM / HR CHEGADA",
                  "MOTORISTA",
                  "DESTINO",
                ].map((titulo) => (
                  <th
                    key={titulo}
                    style={{ border: "1px solid #000", padding: "4px" }}
                  >
                    {titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {viaturasSaida.map((v, i) => (
                <tr key={i}>
                  {[
                    v.vtr,
                    v.km_hr_saida,
                    v.km_hr_chegada,
                    v.motorista,
                    v.destino,
                  ].map((valor, j) => (
                    <td
                      key={j}
                      style={{ border: "1px solid #000", padding: "4px" }}
                    >
                      {valor || "-"}
                    </td>
                  ))}
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
            {ocorrencias.filter((oco) => (oco.descricao || "").trim())
              .length === 0 ? (
              <div>Sem alterações</div>
            ) : (
              ocorrencias
                .filter((oco) => (oco.descricao || "").trim())
                .map((oco, idx) => (
                  <div key={idx} style={{ marginBottom: "8px" }}>
                    <b>{idx + 1}</b> – {oco.descricao.trim()}
                  </div>
                ))
            )}
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
            <b>{formatarNomeComMatricula(permanenteSelecionado)}</b>
            <br />
            Permanente da Guarda
            <br />
            <b>TURNO {turno}</b>
          </div>

          {/* FAIXA COLORIDA DE RODAPÉ INSTITUCIONAL */}
          <div style={{ marginTop: "0", textAlign: "center" }}>
            <img
              data-pdf-rodape
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
