// ENTREGA INCREMENTAL: Inventario.jsx | 2026-10-02 | v2: cadastro e edição de coletes alinhados (gênero e tamanho).
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import ModalDetalhesArma from "../components/ModalDetalhesArma";
import {
  classificarEquipamento,
  obterLocalizacaoGravada,
} from "../utils/classificacaoAcervo";
import {
  Filter,
  Search,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Upload,
  Radio,
  Shield,
  Target,
  Eye,
  Pencil,
  Trash2,
} from "lucide-react";
import * as XLSX from "xlsx-js-style";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function formatarTipo(texto) {
  if (!texto) return "Armamento";
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export default function Inventario() {
  const [equipamentos, setEquipamentos] = useState([]);
  const [cautelasAtivasPorEquipamento, setCautelasAtivasPorEquipamento] =
    useState({});
  const [radios, setRadios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [armaSelecionada, setArmaSelecionada] = useState(null);
  const [radioSelecionado, setRadioSelecionado] = useState(null);
  const [itemEspecialSelecionado, setItemEspecialSelecionado] = useState(null);
  const [itemEspecialEmEdicao, setItemEspecialEmEdicao] = useState(null);
  const [salvandoEdicaoEquipamento, setSalvandoEdicaoEquipamento] =
    useState(false);
  const [excluindoEquipamento, setExcluindoEquipamento] = useState(null);
  const [modalNovo, setModalNovo] = useState(false);
  const [userRole, setUserRole] = useState("policial");

  // Aba ativa: 'geral' (armamentos/coletes/munição) ou 'radios'
  const [abaAtiva, setAbaAtiva] = useState("armamentos");

  // Estados de Filtros e Busca
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroDescricao, setFiltroDescricao] = useState("");
  const [filtroSerie, setFiltroSerie] = useState("");
  const [filtroModeloArmamento, setFiltroModeloArmamento] = useState("");
  const [filtroIdentificacaoRadio, setFiltroIdentificacaoRadio] = useState("");
  const [filtroStatusRadio, setFiltroStatusRadio] = useState("todos");
  const [filtroStatusEquipamento, setFiltroStatusEquipamento] =
    useState("todos");
  const [filtroVencimento, setFiltroVencimento] = useState("todos");
  const [filtroValidadeDe, setFiltroValidadeDe] = useState("");
  const [filtroValidadeAte, setFiltroValidadeAte] = useState("");
  const [filtroLocalizacao, setFiltroLocalizacao] = useState("todas");

  // Estados de Download / Relatório
  const [baixandoExcel, setBaixandoExcel] = useState(false);
  const [baixandoPdf, setBaixandoPdf] = useState(false);
  const [sucessoExcel, setSucessoExcel] = useState(false);
  const [sucessoPdf, setSucessoPdf] = useState(false);

  // Campos gerais do formulário de cadastro (Geral)
  const [novoTipo, setNovoTipo] = useState("armamento");
  const [subtipoArmamento, setSubtipoArmamento] = useState("Pistola");
  const [novoModelo, setNovoModelo] = useState("");
  const [novoSerie, setNovoSerie] = useState("");
  const [novoPatrimonio, setNovoPatrimonio] = useState("");
  const [novoCalibre, setNovoCalibre] = useState("");
  const [novoLocalizacao, setNovoLocalizacao] = useState("Estoque da Reserva");
  const [novoEstado, setNovoEstado] = useState("Bom");
  const [observacoes, setObservacoes] = useState("");

  // Campos específicos para Colete Balístico
  const [coleteGenero, setColeteGenero] = useState("MASCULINO");
  const [coleteTamanho, setColeteTamanho] = useState("M");
  const [coleteDataFabricacao, setColeteDataFabricacao] = useState("");
  const [coleteDataValidade, setColeteDataValidade] = useState("");

  // Campos específicos para Munição
  const [municaoLote, setMunicaoLote] = useState("");
  const [municaoQuantidade, setMunicaoQuantidade] = useState("");

  // Campos específicos para Novo Rádio Comunicador
  const [radioMarca, setRadioMarca] = useState("");
  const [radioModelo, setRadioModelo] = useState("");
  const [radioSerie, setRadioSerie] = useState("");
  const [radioIdentificacao, setRadioIdentificacao] = useState("");
  const [radioTombo, setRadioTombo] = useState("");
  const [radioLocalizacao, setRadioLocalizacao] =
    useState("Estoque da Reserva");
  const [radioObs, setRadioObs] = useState("");

  // Estados para arquivos e upload restaurados
  const [arquivoArma, setArquivoArma] = useState(null);
  const [arquivoNumeracao, setArquivoNumeracao] = useState(null);
  const [arquivoColeteFrente, setArquivoColeteFrente] = useState(null);
  const [arquivoColeteVerso, setArquivoColeteVerso] = useState(null);
  const [arquivoMunicaoGeral, setArquivoMunicaoGeral] = useState(null);
  const [arquivoMunicaoCaixa, setArquivoMunicaoCaixa] = useState(null);
  const [arquivoRadio, setArquivoRadio] = useState(null);

  const [salvando, setSalvando] = useState(false);
  const [atualizandoStatusRadio, setAtualizandoStatusRadio] = useState(null);
  const [radioEmEdicao, setRadioEmEdicao] = useState(null);
  const [salvandoEdicaoRadio, setSalvandoEdicaoRadio] = useState(false);
  const [excluindoRadio, setExcluindoRadio] = useState(null);

  const checkUserRole = () => {
    try {
      const usuarioSalvo = localStorage.getItem("log2cia_user");
      if (usuarioSalvo) {
        const usuario = JSON.parse(usuarioSalvo);
        setUserRole(String(usuario?.role || "policial").toLowerCase());
      }
    } catch (e) {
      console.error("Erro ao verificar cargo:", e);
    }
  };

  useEffect(() => {
    checkUserRole();
    carregarDados();
  }, []);

  const isP4OrMasterOrArmeiro =
    userRole === "master" || userRole === "p4" || userRole === "armeiro";
  const podeEditarExcluirRadio = userRole === "master" || userRole === "p4";

  const abrirEdicaoRadio = (radio) => {
    if (!podeEditarExcluirRadio) return;
    if (radio.status === "cautelado") {
      alert("Não é possível editar um rádio enquanto estiver cautelado.");
      return;
    }
    setRadioEmEdicao({
      ...radio,
      marca: radio.marca || "",
      modelo_descricao: radio.modelo_descricao || "",
      numero_serie: radio.numero_serie || "",
      numero_identificacao: radio.numero_identificacao || "",
      tombo: radio.tombo || "",
      localizacao_atual: radio.localizacao_atual || "Estoque da Reserva",
      observacoes: radio.observacoes || "",
    });
  };

  const salvarEdicaoRadio = async (e) => {
    e.preventDefault();
    if (!radioEmEdicao || !podeEditarExcluirRadio) return;
    if (radioEmEdicao.status === "cautelado") {
      alert("Não é possível editar um rádio enquanto estiver cautelado.");
      return;
    }
    setSalvandoEdicaoRadio(true);
    try {
      const response = await fetch(
        `/api/radios?id=${encodeURIComponent(radioEmEdicao.id)}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            marca: radioEmEdicao.marca,
            modelo_descricao: radioEmEdicao.modelo_descricao,
            numero_serie: radioEmEdicao.numero_serie,
            numero_identificacao: radioEmEdicao.numero_identificacao,
            tombo: radioEmEdicao.tombo,
            localizacao_atual: radioEmEdicao.localizacao_atual,
            observacoes: radioEmEdicao.observacoes,
          }),
        },
      );
      const resultado = await response.json();
      if (!response.ok)
        throw new Error(resultado.error || "Não foi possível editar o rádio.");
      setRadios((atuais) =>
        atuais.map((item) =>
          item.id === resultado.radio.id ? resultado.radio : item,
        ),
      );
      setRadioEmEdicao(null);
      alert("Rádio atualizado com sucesso!");
    } catch (error) {
      alert("Não foi possível editar o rádio: " + error.message);
    } finally {
      setSalvandoEdicaoRadio(false);
    }
  };

  const excluirRadio = async (radio) => {
    if (!podeEditarExcluirRadio) return;
    if (radio.status === "cautelado") {
      alert(
        "Não é possível excluir um rádio enquanto estiver cautelado. Faça a devolução primeiro.",
      );
      return;
    }
    const confirmado = window.confirm(
      `Confirma a exclusão do rádio ${radio.numero_identificacao} (série ${radio.numero_serie})? Esta ação não pode ser desfeita.`,
    );
    if (!confirmado) return;
    setExcluindoRadio(radio.id);
    try {
      const response = await fetch(
        `/api/radios?id=${encodeURIComponent(radio.id)}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      const resultado = await response.json();
      if (!response.ok)
        throw new Error(resultado.error || "Não foi possível excluir o rádio.");
      setRadios((atuais) => atuais.filter((item) => item.id !== radio.id));
      alert("Rádio excluído com sucesso!");
    } catch (error) {
      alert("Não foi possível excluir o rádio: " + error.message);
    } finally {
      setExcluindoRadio(null);
    }
  };

  const abrirEdicaoEquipamento = (item) => {
    if (!podeEditarExcluirRadio) return;
    setItemEspecialEmEdicao({
      ...item,
      modelo_descricao: item.modelo_descricao || "",
      num_serie: item.num_serie || "",
      patrimonio: item.patrimonio || "",
      status: item.status || "disponivel",
      detalhes: {
        ...(item.detalhes || {}),
        genero: item.detalhes?.genero || "MASCULINO",
        tamanho: item.detalhes?.tamanho || "M",
        data_fabricacao: item.detalhes?.data_fabricacao || "",
        data_validade: item.detalhes?.data_validade || "",
        lote: item.detalhes?.lote || "",
        quantidade: item.detalhes?.quantidade ?? 0,
        localizacao_atual: [
          "Acautelada com Policial",
          "Baixa Definitiva",
          "Estoque da Reserva",
        ].includes(item.detalhes?.localizacao_atual)
          ? item.detalhes.localizacao_atual
          : item.status === "cautelado"
            ? "Acautelada com Policial"
            : item.status === "baixado"
              ? "Baixa Definitiva"
              : "Estoque da Reserva",
        obs: item.detalhes?.obs || "",
        obs_baixa_definitiva: item.detalhes?.obs_baixa_definitiva || "",
      },
    });
  };

  const salvarEdicaoEquipamento = async (e) => {
    e.preventDefault();
    if (!itemEspecialEmEdicao || !podeEditarExcluirRadio) return;
    setSalvandoEdicaoEquipamento(true);
    try {
      const response = await fetch(
        `/api/equipamentos?id=${encodeURIComponent(itemEspecialEmEdicao.id)}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo: itemEspecialEmEdicao.tipo,
            modelo_descricao: itemEspecialEmEdicao.modelo_descricao,
            num_serie: itemEspecialEmEdicao.num_serie,
            patrimonio: itemEspecialEmEdicao.patrimonio || null,
            status: itemEspecialEmEdicao.status,
            detalhes: itemEspecialEmEdicao.detalhes,
          }),
        },
      );
      const resultado = await response.json();
      if (!response.ok)
        throw new Error(
          resultado.error || "Não foi possível editar o equipamento.",
        );
      setEquipamentos((atuais) =>
        atuais.map((item) =>
          item.id === resultado.equipamento.id ? resultado.equipamento : item,
        ),
      );
      setItemEspecialSelecionado(resultado.equipamento);
      setItemEspecialEmEdicao(null);
      alert("Equipamento atualizado com sucesso!");
    } catch (error) {
      alert("Não foi possível editar o equipamento: " + error.message);
    } finally {
      setSalvandoEdicaoEquipamento(false);
    }
  };

  const excluirEquipamento = async (item) => {
    if (!podeEditarExcluirRadio) return;
    const confirmado = window.confirm(
      `Confirma a exclusão de ${item.tipo === "colete" ? "colete" : "munição"} "${item.modelo_descricao || "sem descrição"}" (série/lote ${item.num_serie || "não informado"})? Esta ação não pode ser desfeita.`,
    );
    if (!confirmado) return;
    setExcluindoEquipamento(item.id);
    try {
      const response = await fetch(
        `/api/equipamentos?id=${encodeURIComponent(item.id)}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      const resultado = await response.json();
      if (!response.ok)
        throw new Error(
          resultado.error || "Não foi possível excluir o equipamento.",
        );
      setEquipamentos((atuais) =>
        atuais.filter((registro) => registro.id !== item.id),
      );
      setItemEspecialSelecionado(null);
      alert("Equipamento excluído com sucesso!");
    } catch (error) {
      alert("Não foi possível excluir o equipamento: " + error.message);
    } finally {
      setExcluindoEquipamento(null);
    }
  };

  async function carregarDados() {
    setLoading(true);
    try {
      const { data: equipData, error: equipError } = await supabase
        .from("equipamentos")
        .select("*")
        .order("created_at", { ascending: false });

      if (equipError) throw equipError;
      if (equipData) setEquipamentos(equipData);

      const { data: cautelasAtivas, error: cautelasError } = await supabase
        .from("cautelas")
        .select("id, tipo_cautela, cautela_itens(equipamento_id)")
        .eq("status", "ativa");
      if (cautelasError) throw cautelasError;

      const mapaCautelas = {};
      (cautelasAtivas || []).forEach((cautela) => {
        (cautela.cautela_itens || []).forEach((item) => {
          if (!item?.equipamento_id) return;
          mapaCautelas[item.equipamento_id] = {
            cautelaId: cautela.id,
            tipo_cautela: cautela.tipo_cautela || null,
          };
        });
      });
      setCautelasAtivasPorEquipamento(mapaCautelas);

      const radioResponse = await fetch("/api/radios", {
        method: "GET",
        credentials: "include",
      });
      const radioData = await radioResponse.json();
      if (!radioResponse.ok) {
        throw new Error(
          radioData.error || "Não foi possível carregar os rádios.",
        );
      }
      setRadios(radioData.radios || []);
    } catch (err) {
      console.error("Erro ao carregar dados:", err.message);
    } finally {
      setLoading(false);
    }
  }

  async function fazerUploadImagem(file, prefixo) {
    if (!file) return null;
    const fileExt = file.name.split(".").pop();
    const fileName = `${prefixo}_${Date.now()}.${fileExt}`;
    const filePath = `equipamentos/${fileName}`;
    const nomeBucket = "documentos-seguranca";

    const { error: uploadError } = await supabase.storage
      .from(nomeBucket)
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage
      .from(nomeBucket)
      .getPublicUrl(filePath);

    return publicUrlData.publicUrl;
  }

  const handleTipoChange = (val) => {
    setNovoTipo(val);
    if (val === "colete" && !novoModelo) {
      setNovoModelo("PROTECTA - NÍVEL III-A");
    } else if (val === "municao" && !novoModelo) {
      setNovoModelo("Munição 9mm / .40");
    }
  };

  const handleCadastrarEquipamento = async (e) => {
    e.preventDefault();
    if (!isP4OrMasterOrArmeiro) {
      alert(
        "Acesso negado: Seu tipo de acesso não permite cadastrar novos equipamentos.",
      );
      return;
    }
    setSalvando(true);

    try {
      if (abaAtiva === "radios") {
        const fotoRadioUrl = await fazerUploadImagem(arquivoRadio, "radio");

        const radioResponse = await fetch("/api/radios", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            marca: radioMarca.trim().toUpperCase(),
            modelo_descricao: radioModelo.trim().toUpperCase(),
            numero_serie: radioSerie.trim().toUpperCase(),
            numero_identificacao: radioIdentificacao.trim().toUpperCase(),
            tombo: radioTombo.trim() ? radioTombo.trim().toUpperCase() : null,
            status: "disponivel",
            localizacao_atual: radioLocalizacao,
            foto_radio_url: fotoRadioUrl,
            observacoes: radioObs,
          }),
        });
        const radioResultado = await radioResponse.json();
        if (!radioResponse.ok) {
          throw new Error(
            radioResultado.error || "Não foi possível cadastrar o rádio.",
          );
        }
        alert("Rádio comunicador cadastrado com sucesso!");

        setRadioMarca("");
        setRadioModelo("");
        setRadioSerie("");
        setRadioIdentificacao("");
        setRadioTombo("");
        setRadioObs("");
        setArquivoRadio(null);
      } else {
        let foto1Url = null;
        let foto2Url = null;

        if (novoTipo === "armamento") {
          foto1Url = await fazerUploadImagem(arquivoArma, "frente_arma");
          foto2Url = await fazerUploadImagem(arquivoNumeracao, "num_serie");
        } else if (novoTipo === "colete") {
          foto1Url = await fazerUploadImagem(
            arquivoColeteFrente,
            "rotulo_frente",
          );
          foto2Url = await fazerUploadImagem(
            arquivoColeteVerso,
            "rotulo_verso",
          );
        } else if (novoTipo === "municao") {
          foto1Url = await fazerUploadImagem(arquivoMunicaoGeral, "municoes");
          foto2Url = await fazerUploadImagem(
            arquivoMunicaoCaixa,
            "caixa_municao",
          );
        }

        let detalhesObj = {
          localizacao_atual: novoLocalizacao,
          estado_conservacao: novoEstado,
          foto_arma_url: foto1Url,
          foto_numeracao_url: foto2Url,
          obs: observacoes,
        };

        let serieFinal = novoSerie;
        let patrimonioFinal = novoPatrimonio;

        if (novoTipo === "armamento") {
          detalhesObj.subtipo_armamento = subtipoArmamento;
          detalhesObj.calibre = novoCalibre;
        } else if (novoTipo === "colete") {
          detalhesObj = {
            ...detalhesObj,
            genero: coleteGenero,
            tamanho: coleteTamanho,
            data_fabricacao: coleteDataFabricacao,
            data_validade: coleteDataValidade,
          };
        } else if (novoTipo === "municao") {
          serieFinal = municaoLote
            ? `LOTE-${municaoLote}`
            : `LOTE-S/N-${Date.now()}`;
          detalhesObj = {
            ...detalhesObj,
            lote: municaoLote || "Não Identificado",
            quantidade: municaoQuantidade || 0,
          };
        }

        const patrimonioTratado =
          patrimonioFinal && patrimonioFinal.trim() !== ""
            ? patrimonioFinal.trim()
            : null;

        const { error } = await supabase.from("equipamentos").insert([
          {
            tipo: novoTipo.toLowerCase(),
            modelo_descricao: novoModelo,
            num_serie: serieFinal,
            patrimonio: patrimonioTratado,
            status: "disponivel",
            detalhes: detalhesObj,
          },
        ]);

        if (error) throw error;
        alert("Equipamento cadastrado com sucesso!");

        setNovoModelo("");
        setNovoSerie("");
        setNovoPatrimonio("");
        setNovoCalibre("");
        setSubtipoArmamento("Pistola");
        setColeteGenero("MASCULINO");
        setColeteTamanho("M");
        setColeteDataFabricacao("");
        setColeteDataValidade("");
        setMunicaoLote("");
        setMunicaoQuantidade("");
        setObservacoes("");
        setNovoLocalizacao("Estoque da Reserva");
        setNovoEstado("Bom");
        setArquivoArma(null);
        setArquivoNumeracao(null);
        setArquivoColeteFrente(null);
        setArquivoColeteVerso(null);
        setArquivoMunicaoGeral(null);
        setArquivoMunicaoCaixa(null);
      }

      setModalNovo(false);
      carregarDados();
    } catch (err) {
      alert("Erro ao cadastrar equipamento: " + err.message);
    } finally {
      setSalvando(false);
    }
  };

  // Lógica de Filtragem Geral
  const equipamentosFiltrados = equipamentos.filter((item) => {
    const tipoItem = String(item.tipo || "").toLowerCase();
    const abaTipo = {
      armamentos: "armamento",
      coletes: "colete",
      municoes: "municao",
    }[abaAtiva];
    if (abaTipo && tipoItem !== abaTipo) return false;
    const modeloItem = String(
      item.modelo_descricao || item.modelo || "",
    ).toLowerCase();
    const serieItem = String(
      item.num_serie || item.numero_serie || "",
    ).toLowerCase();
    // O filtro de localização usa a localização efetivamente gravada no acervo.
    // A classificação de cautela não deve sobrescrever esse valor, especialmente
    // enquanto as cautelas de longo prazo ainda não foram geradas pelo sistema.
    const localizacaoItem = String(obterLocalizacaoGravada(item))
      .trim()
      .toLowerCase();

    if (filtroSerie && !serieItem.includes(filtroSerie.toLowerCase()))
      return false;
    if (
      tipoItem === "armamento" &&
      filtroModeloArmamento &&
      !modeloItem.includes(filtroModeloArmamento.trim().toLowerCase())
    )
      return false;
    if (filtroStatusEquipamento !== "todos") {
      const statusItem = String(item.status || "disponivel").toLowerCase();
      if (statusItem !== filtroStatusEquipamento.toLowerCase()) return false;
    }

    if (filtroLocalizacao !== "todas") {
      const filtroNormalizado = filtroLocalizacao.trim().toLowerCase();
      if (localizacaoItem !== filtroNormalizado) return false;
    }

    if (tipoItem === "colete") {
      const validade = String(item.detalhes?.data_validade || "").slice(0, 10);
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const dataValidade = validade ? new Date(`${validade}T00:00:00`) : null;
      const limite30 = new Date(hoje);
      limite30.setDate(limite30.getDate() + 30);
      if (
        filtroVencimento === "vencidos" &&
        (!dataValidade || dataValidade >= hoje)
      )
        return false;
      if (
        filtroVencimento === "proximos30" &&
        (!dataValidade || dataValidade < hoje || dataValidade > limite30)
      )
        return false;
      if (
        filtroVencimento === "baixados" &&
        item.status !== "baixado" &&
        String(item.detalhes?.localizacao_atual || "").toLowerCase() !==
          "baixa definitiva"
      )
        return false;
      if (filtroValidadeDe && (!validade || validade < filtroValidadeDe))
        return false;
      if (filtroValidadeAte && (!validade || validade > filtroValidadeAte))
        return false;
    }

    return true;
  });

  // Lógica de Filtragem Rádios
  const radiosFiltrados = radios.filter((item) => {
    const modeloItem = String(
      item.modelo_descricao || item.marca || "",
    ).toLowerCase();
    const serieItem = String(
      item.numero_serie || item.numero_identificacao || "",
    ).toLowerCase();
    const localizacaoItem = String(
      item.localizacao_atual || "Estoque da Reserva",
    ).toLowerCase();

    if (filtroSerie && !serieItem.includes(filtroSerie.toLowerCase()))
      return false;
    if (
      filtroIdentificacaoRadio &&
      !String(item.numero_identificacao || "")
        .toLowerCase()
        .includes(filtroIdentificacaoRadio.toLowerCase())
    )
      return false;
    if (
      filtroStatusRadio !== "todos" &&
      (item.status || "disponivel") !== filtroStatusRadio
    )
      return false;
    if (
      filtroLocalizacao !== "todas" &&
      localizacaoItem !== filtroLocalizacao.toLowerCase()
    )
      return false;

    return true;
  });

  // Totais da aba atual: quantidade após filtros e quantidade total cadastrada.
  const tipoDaAba = {
    armamentos: "armamento",
    coletes: "colete",
    municoes: "municao",
  }[abaAtiva];
  const totalRegistrosAba =
    abaAtiva === "radios"
      ? radios.length
      : equipamentos.filter((item) => item.tipo === tipoDaAba).length;
  const quantidadeFiltradaAba =
    abaAtiva === "radios"
      ? radiosFiltrados.length
      : equipamentosFiltrados.length;

  const exportarExcel = () => {
    setBaixandoExcel(true);
    setTimeout(() => {
      const agora = new Date();
      let operador = "Operador não identificado";
      try {
        const usuario = JSON.parse(
          localStorage.getItem("log2cia_user") || "{}",
        );
        const posto =
          usuario?.posto_graduacao ||
          usuario?.posto ||
          usuario?.graduacao ||
          "";
        const numeral =
          usuario?.numeral ||
          usuario?.numero ||
          usuario?.numero_operacional ||
          "";
        const nomeGuerra =
          usuario?.nome_guerra || usuario?.nome_de_guerra || "";
        const matricula = usuario?.matricula || "";
        operador =
          [posto, numeral, nomeGuerra, matricula].filter(Boolean).join(" - ") ||
          operador;
      } catch (e) {
        console.error(
          "Não foi possível identificar o operador do relatório:",
          e,
        );
      }

      const formatarStatusExcel = (status, item) => {
        const classificacao = classificarEquipamento(
          item,
          cautelasAtivasPorEquipamento,
        );
        if (
          [
            "temporaria",
            "longo_prazo",
            "acautelada_sem_classificacao",
          ].includes(classificacao.chave)
        )
          return "Cautelado";
        const statusMapeados = {
          disponivel: "Disponível",
          cautelado: "Cautelado",
          em_manutencao: "Em manutenção",
          baixado: "Baixado",
        };
        return (
          statusMapeados[String(status || "").toLowerCase()] || status || "N/I"
        );
      };
      const localizacaoExcel = (item) => obterLocalizacaoGravada(item) || "N/I";
      const dataExcel = (valor) => {
        if (!valor) return "N/I";
        const data = String(valor).slice(0, 10);
        const partes = data.split("-");
        return partes.length === 3
          ? `${partes[2]}/${partes[1]}/${partes[0]}`
          : valor;
      };

      const titulosExcel = {
        armamentos: "RELATÓRIO DE ARMAMENTOS",
        coletes: "RELATÓRIO DE COLETES",
        municoes: "RELATÓRIO DE MUNIÇÕES",
        radios: "RELATÓRIO DE RÁDIOS COMUNICADORES",
      };
      let colunas = [];
      let linhas = [];
      if (abaAtiva === "armamentos") {
        colunas = ["Modelo", "Nº de Série", "Calibre", "Localização", "Status"];
        linhas = equipamentosFiltrados
          .filter((item) => item.tipo === "armamento")
          .map((item) => [
            item.modelo_descricao || "N/I",
            item.num_serie || "N/I",
            item.detalhes?.calibre || item.calibre || "N/I",
            localizacaoExcel(item),
            formatarStatusExcel(item.status, item),
          ]);
      } else if (abaAtiva === "coletes") {
        colunas = [
          "Modelo",
          "Nº de Série",
          "Gênero",
          "Tamanho",
          "Data de Validade",
          "Localização",
          "Status",
        ];
        linhas = equipamentosFiltrados
          .filter((item) => item.tipo === "colete")
          .map((item) => [
            item.modelo_descricao || "N/I",
            item.num_serie || "N/I",
            item.detalhes?.genero || "N/I",
            item.detalhes?.tamanho || "N/I",
            dataExcel(item.detalhes?.data_validade),
            localizacaoExcel(item),
            formatarStatusExcel(item.status, item),
          ]);
      } else if (abaAtiva === "radios") {
        colunas = [
          "Marca",
          "Modelo",
          "Nº de Série",
          "Nº de Identificação",
          "Localização",
          "Status",
        ];
        linhas = radiosFiltrados.map((item) => [
          item.marca || "N/I",
          item.modelo_descricao || item.modelo || "N/I",
          item.numero_serie || "N/I",
          item.numero_identificacao || "N/I",
          item.localizacao_atual || "N/I",
          formatarStatusExcel(item.status, item),
        ]);
      } else {
        colunas = ["Modelo", "Série / Lote", "Localização", "Status"];
        linhas = equipamentosFiltrados.map((item) => [
          item.modelo_descricao || "N/I",
          item.num_serie || item.detalhes?.lote || "N/I",
          localizacaoExcel(item),
          formatarStatusExcel(item.status, item),
        ]);
      }

      // Numeração sequencial dos registros exibidos na planilha Excel.
      colunas = ["Ord.", ...colunas];
      linhas = linhas.map((linha, indice) => [indice + 1, ...linha]);

      const linhasPlanilha = [
        [`LOG2CIA — ${titulosExcel[abaAtiva] || "RELATÓRIO DO ACERVO"}`],
        [
          `Emitido em: ${agora.toLocaleDateString("pt-BR")} às ${agora.toLocaleTimeString("pt-BR")} por: ${operador}`,
        ],
        [],
        colunas,
        ...linhas,
      ];
      const worksheet = XLSX.utils.aoa_to_sheet(linhasPlanilha);
      worksheet["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: colunas.length - 1 } },
      ];
      worksheet["!cols"] = colunas.map((coluna) => ({
        wch: Math.max(coluna.length + 4, 16),
      }));
      for (let r = 3; r < linhasPlanilha.length; r += 1) {
        for (let c = 0; c < colunas.length; c += 1) {
          const celula = XLSX.utils.encode_cell({ r, c });
          if (worksheet[celula]) {
            worksheet[celula].s = {
              alignment: {
                horizontal: "center",
                vertical: "center",
                wrapText: true,
              },
              ...(r === 3
                ? {
                    font: { bold: true, color: { rgb: "FFFFFF" } },
                    fill: { fgColor: { rgb: "1E293B" } },
                  }
                : {}),
            };
          }
        }
      }
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        abaAtiva === "radios" ? "Radios" : "Inventario",
      );
      XLSX.writeFile(
        workbook,
        `relatorio_${abaAtiva}_${agora.toISOString().slice(0, 10)}.xlsx`,
      );

      setBaixandoExcel(false);
      setSucessoExcel(true);
      setTimeout(() => setSucessoExcel(false), 3000);
    }, 3000);
  };

  const exportarPDF = () => {
    setBaixandoPdf(true);
    setTimeout(() => {
      const doc = new jsPDF({ orientation: "landscape" });
      const agora = new Date();
      let operador = "Operador não identificado";
      try {
        const usuario = JSON.parse(
          localStorage.getItem("log2cia_user") || "{}",
        );
        const posto =
          usuario?.posto_graduacao ||
          usuario?.posto ||
          usuario?.graduacao ||
          "";
        const numeral =
          usuario?.numeral ||
          usuario?.numero ||
          usuario?.numero_operacional ||
          "";
        const nomeGuerra =
          usuario?.nome_guerra || usuario?.nome_de_guerra || "";
        const matricula = usuario?.matricula || "";
        operador =
          [posto, numeral, nomeGuerra, matricula].filter(Boolean).join(" - ") ||
          operador;
      } catch (e) {
        console.error(
          "Não foi possível identificar o operador do relatório:",
          e,
        );
      }

      const titulos = {
        armamentos: "RELATÓRIO DE ARMAMENTOS",
        coletes: "RELATÓRIO DE COLETES",
        municoes: "RELATÓRIO DE MUNIÇÕES",
        radios: "RELATÓRIO DE RÁDIOS COMUNICADORES",
      };
      const titulo = titulos[abaAtiva] || "RELATÓRIO DO ACERVO";
      doc.setFontSize(14);
      doc.text(`LOG2CIA — ${titulo}`, 14, 15);
      doc.setFontSize(9);
      doc.text(
        `Emitido em: ${agora.toLocaleDateString("pt-BR")} às ${agora.toLocaleTimeString("pt-BR")} por: ${operador}`,
        14,
        21,
      );

      const formatarStatus = (status) => {
        const statusMapeados = {
          disponivel: "Disponível",
          cautelado: "Cautelado",
          em_manutencao: "Em manutenção",
          baixado: "Baixado",
        };
        return (
          statusMapeados[String(status || "").toLowerCase()] || status || "N/I"
        );
      };
      // O PDF deve refletir os mesmos dados usados pelos filtros:
      // localização cadastrada e status real do registro.
      const formatarLocalizacao = (item) =>
        obterLocalizacaoGravada(item) || "N/I";
      const formatarData = (valor) => {
        if (!valor) return "N/I";
        const data = String(valor).slice(0, 10);
        const partes = data.split("-");
        return partes.length === 3
          ? `${partes[2]}/${partes[1]}/${partes[0]}`
          : valor;
      };

      let colunas = [];
      let linhas = [];
      if (abaAtiva === "armamentos") {
        colunas = ["Modelo", "Nº de Série", "Calibre", "Localização", "Status"];
        linhas = equipamentosFiltrados
          .filter((item) => item.tipo === "armamento")
          .map((item) => [
            item.modelo_descricao || "N/I",
            item.num_serie || "N/I",
            item.detalhes?.calibre || item.calibre || "N/I",
            formatarLocalizacao(item),
            formatarStatus(item.status),
          ]);
      } else if (abaAtiva === "coletes") {
        colunas = [
          "Modelo",
          "Nº de Série",
          "Gênero",
          "Tamanho",
          "Data de Validade",
          "Localização",
          "Status",
        ];
        linhas = equipamentosFiltrados
          .filter((item) => item.tipo === "colete")
          .map((item) => [
            item.modelo_descricao || "N/I",
            item.num_serie || "N/I",
            item.detalhes?.genero || "N/I",
            item.detalhes?.tamanho || "N/I",
            formatarData(item.detalhes?.data_validade),
            formatarLocalizacao(item),
            formatarStatus(item.status),
          ]);
      } else if (abaAtiva === "radios") {
        colunas = [
          "Marca",
          "Modelo",
          "Nº de Série",
          "Nº de Identificação",
          "Localização",
          "Status",
        ];
        linhas = radiosFiltrados.map((item) => [
          item.marca || "N/I",
          item.modelo_descricao || item.modelo || "N/I",
          item.numero_serie || "N/I",
          item.numero_identificacao || "N/I",
          item.localizacao_atual || "N/I",
          formatarStatus(item.status),
        ]);
      } else {
        colunas = ["Modelo", "Série / Lote", "Localização", "Status"];
        linhas = equipamentosFiltrados.map((item) => [
          item.modelo_descricao || "N/I",
          item.num_serie || item.detalhes?.lote || "N/I",
          formatarLocalizacao(item),
          formatarStatus(item.status),
        ]);
      }

      // Numeração sequencial dos registros exibidos no relatório PDF.
      colunas = ["Ord.", ...colunas];
      linhas = linhas.map((linha, indice) => [indice + 1, ...linha]);

      autoTable(doc, {
        startY: 27,
        head: [colunas],
        body: linhas,
        theme: "grid",
        headStyles: {
          fillColor: [30, 41, 59],
          halign: "center",
          valign: "middle",
        },
        styles: {
          fontSize: 8,
          cellPadding: 2.2,
          overflow: "linebreak",
          halign: "center",
          valign: "middle",
        },
        margin: { left: 14, right: 14 },
      });

      doc.save(`relatorio_${abaAtiva}_${agora.toISOString().slice(0, 10)}.pdf`);

      setBaixandoPdf(false);
      setSucessoPdf(true);
      setTimeout(() => setSucessoPdf(false), 3000);
    }, 3000);
  };

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto font-sans">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Acervo / Inventário
          </h1>
          <p className="text-xs text-slate-500">
            Gestão e controle de equipamentos e materiais bélicos
          </p>
          <p className="mt-1 text-[10px] font-medium text-slate-400">
            Arquivo: Inventario.jsx · Entrega incremental 2026-10-02 · v2
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportarExcel}
            disabled={baixandoExcel || sucessoExcel}
            className={`font-bold px-3 py-2 rounded-xl shadow-xs text-xs flex items-center gap-1.5 transition-all disabled:opacity-80 ${
              sucessoExcel
                ? "bg-emerald-800 text-white"
                : "bg-emerald-600 hover:bg-emerald-700 text-white"
            }`}
          >
            {baixandoExcel ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Gerando...</span>
              </>
            ) : sucessoExcel ? (
              <span>✓ Relatório Baixado</span>
            ) : (
              <>
                <FileSpreadsheet className="w-4 h-4" />
                <span>Excel</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={exportarPDF}
            disabled={baixandoPdf || sucessoPdf}
            className={`font-bold px-3 py-2 rounded-xl shadow-xs text-xs flex items-center gap-1.5 transition-all disabled:opacity-80 ${
              sucessoPdf
                ? "bg-rose-900 text-white"
                : "bg-rose-600 hover:bg-rose-700 text-white"
            }`}
          >
            {baixandoPdf ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Gerando...</span>
              </>
            ) : sucessoPdf ? (
              <span>✓ Relatório Baixado</span>
            ) : (
              <>
                <FileText className="w-4 h-4" />
                <span>PDF</span>
              </>
            )}
          </button>

          {isP4OrMasterOrArmeiro && (
            <button
              type="button"
              onClick={() => {
                if (abaAtiva === "coletes") setNovoTipo("colete");
                else if (abaAtiva === "municoes") setNovoTipo("municao");
                else if (abaAtiva === "armamentos") setNovoTipo("armamento");
                setModalNovo(true);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl shadow-md text-xs flex items-center gap-1.5 transition-all ml-1"
            >
              <span>+</span> Novo Equipamento
            </button>
          )}
        </div>
      </div>

      {/* ABAS DE NAVEGAÇÃO POR TIPO DE MATERIAL */}
      <div className="flex flex-wrap bg-slate-200/70 p-1 rounded-2xl w-fit border border-slate-300/60 gap-1">
        {[
          {
            id: "armamentos",
            label: "Armamentos",
            count: equipamentos.filter((item) => item.tipo === "armamento")
              .length,
            Icon: Shield,
          },
          {
            id: "coletes",
            label: "Coletes",
            count: equipamentos.filter((item) => item.tipo === "colete").length,
            Icon: Shield,
          },
          {
            id: "municoes",
            label: "Munições",
            count: equipamentos.filter((item) => item.tipo === "municao")
              .length,
            Icon: Target,
          },
          {
            id: "radios",
            label: "Rádios Comunicadores",
            count: radios.length,
            Icon: Radio,
          },
        ].map(({ id, label, count, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setAbaAtiva(id);
              setFiltroTipo("todos");
              setFiltroModeloArmamento("");
              setFiltroStatusEquipamento("todos");
              setFiltroStatusRadio("todos");
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${abaAtiva === id ? "bg-white text-blue-600 shadow-xs" : "text-slate-600 hover:text-slate-900"}`}
          >
            <Icon className="w-4 h-4" /> {label} ({count})
          </button>
        ))}
      </div>

      {/* BARRA DE FILTROS AVANÇADOS */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100 text-slate-800 font-bold text-xs uppercase tracking-wide">
          <Filter className="w-4 h-4 text-blue-600" />
          <span>Filtros de Localização e Busca no Acervo</span>
        </div>

        <div
          className={`grid grid-cols-1 sm:grid-cols-2 ${abaAtiva === "radios" ? "lg:grid-cols-3 xl:grid-cols-6" : abaAtiva === "coletes" ? "lg:grid-cols-3 xl:grid-cols-5" : abaAtiva === "armamentos" ? "lg:grid-cols-3 xl:grid-cols-4" : "lg:grid-cols-3"} gap-3`}
        >
          {abaAtiva === "armamentos" && (
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-600 uppercase">
                Modelo
              </label>
              <input
                type="text"
                value={filtroModeloArmamento}
                onChange={(e) => setFiltroModeloArmamento(e.target.value)}
                placeholder="Ex: SIG Sauer..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
              />
            </div>
          )}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-600 uppercase">
              Nº de Série / ID
            </label>
            <input
              type="text"
              value={filtroSerie}
              onChange={(e) => setFiltroSerie(e.target.value)}
              placeholder="Ex: LX02876..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-mono"
            />
          </div>

          {abaAtiva === "coletes" && (
            <>
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-600 uppercase">
                  Vencimento
                </label>
                <select
                  value={filtroVencimento}
                  onChange={(e) => setFiltroVencimento(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-medium"
                >
                  <option value="todos">Todas as validades</option>
                  <option value="vencidos">Vencidos</option>
                  <option value="proximos30">
                    Vencem nos próximos 30 dias
                  </option>
                  <option value="baixados">Baixados (baixa definitiva)</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-600 uppercase">
                  Validade a partir de
                </label>
                <input
                  type="date"
                  value={filtroValidadeDe}
                  onChange={(e) => setFiltroValidadeDe(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-600 uppercase">
                  Validade até
                </label>
                <input
                  type="date"
                  value={filtroValidadeAte}
                  onChange={(e) => setFiltroValidadeAte(e.target.value)}
                  min={filtroValidadeDe || undefined}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                />
              </div>
            </>
          )}
          {abaAtiva !== "radios" && (
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-600 uppercase">
                Status
              </label>
              <select
                value={filtroStatusEquipamento}
                onChange={(e) => setFiltroStatusEquipamento(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-medium"
              >
                <option value="todos">Todos os Status</option>
                <option value="disponivel">Disponível</option>
                <option value="cautelado">Cautelado</option>
                <option value="em_manutencao">Em manutenção</option>
                <option value="baixado">Baixado</option>
              </select>
            </div>
          )}
          {abaAtiva === "radios" && (
            <>
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-600 uppercase">
                  Nº de Identificação
                </label>
                <input
                  type="text"
                  value={filtroIdentificacaoRadio}
                  onChange={(e) => setFiltroIdentificacaoRadio(e.target.value)}
                  placeholder="Ex: 203827"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-600 uppercase">
                  Status
                </label>
                <select
                  value={filtroStatusRadio}
                  onChange={(e) => setFiltroStatusRadio(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-medium"
                >
                  <option value="todos">Todos os Status</option>
                  <option value="disponivel">Disponível</option>
                  <option value="cautelado">Cautelado</option>
                  <option value="em_manutencao">Em manutenção</option>
                  <option value="baixado">Baixado</option>
                </select>
              </div>
            </>
          )}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-600 uppercase">
              Localização Atual
            </label>
            <select
              value={filtroLocalizacao}
              onChange={(e) => setFiltroLocalizacao(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-medium"
            >
              <option value="todas">Todas as Localizações</option>
              <option value="Estoque da Reserva">Estoque da Reserva</option>
              <option value="Acautelada com Policial">
                Acautelada com Policial
              </option>
              <option value="Acautelada (Temporária)">
                Acautelada (Temporária)
              </option>
              <option value="Acautelada com Policial (Longo Prazo)">
                Acautelada com Policial (Longo Prazo)
              </option>
              <option value="Apreendida">Apreendida</option>
              <option value="Em Perícia">Em Perícia</option>
              <option value="Manutenção">Manutenção</option>
              <option value="Baixa Definitiva">Baixa Definitiva</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 text-slate-500 font-medium">
          Carregando acervo...
        </div>
      ) : abaAtiva !== "radios" ? (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
            <span className="text-xs font-semibold text-slate-700">
              Registros exibidos: <strong>{quantidadeFiltradaAba}</strong> de{" "}
              <strong>{totalRegistrosAba}</strong>
            </span>
            <span className="text-[10px] text-slate-500">
              Considera os filtros aplicados
            </span>
          </div>
          <table className="w-full text-center text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold text-[11px]">
                <th className="p-3.5 text-center">Modelo</th>
                <th className="p-3.5 text-center">Série / Lote</th>
                {abaAtiva === "armamentos" ? (
                  <th className="p-3.5 text-center">Calibre</th>
                ) : abaAtiva === "coletes" ? (
                  <>
                    <th className="p-3.5 text-center">Gênero</th>
                    <th className="p-3.5 text-center">Tamanho</th>
                    <th className="p-3.5 text-center">Data de Validade</th>
                  </>
                ) : (
                  <th className="p-3.5 text-center">Especificações</th>
                )}
                <th className="p-3.5 text-center">Localização</th>
                <th className="p-3.5 text-center">Status</th>
                <th className="p-3.5 text-center">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {equipamentosFiltrados.length === 0 ? (
                <tr>
                  <td
                    colSpan={abaAtiva === "coletes" ? 8 : 6}
                    className="p-8 text-center text-slate-400"
                  >
                    Nenhum equipamento encontrado com os filtros aplicados.
                  </td>
                </tr>
              ) : (
                equipamentosFiltrados.map((item) => {
                  const tipoFormatted = formatarTipo(item.tipo);
                  const modeloVal =
                    item.modelo_descricao || item.modelo || "N/I";
                  const serieVal = item.num_serie || item.numero_serie || "N/I";
                  const classificacaoItem = classificarEquipamento(
                    item,
                    cautelasAtivasPorEquipamento,
                  );
                  const localizacaoVal = obterLocalizacaoGravada(item);
                  const estaCautelado = [
                    "temporaria",
                    "longo_prazo",
                    "acautelada_sem_classificacao",
                  ].includes(classificacaoItem.chave);

                  let infoExtra = item.detalhes?.calibre || "";
                  if (item.tipo === "municao") {
                    infoExtra = `Lote: ${item.detalhes?.lote || "Não Identificado"} | Qtd: ${item.detalhes?.quantidade || 0} un`;
                  }

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="p-3.5 text-center font-bold text-slate-800">
                        {modeloVal}
                      </td>
                      <td className="p-3.5 text-center font-mono font-bold text-slate-700">
                        {serieVal}
                      </td>
                      {abaAtiva === "coletes" ? (
                        <>
                          <td className="p-3.5 text-center text-slate-600 font-medium">
                            {item.detalhes?.genero || "N/I"}
                          </td>
                          <td className="p-3.5 text-center text-slate-600 font-medium">
                            {item.detalhes?.tamanho || "N/I"}
                          </td>
                        </>
                      ) : (
                        <td className="p-3.5 text-center text-slate-600 font-medium">
                          {abaAtiva === "armamentos"
                            ? item.detalhes?.calibre || "—"
                            : infoExtra || "—"}
                        </td>
                      )}
                      {abaAtiva === "coletes" && (
                        <td className="p-3.5 text-center font-mono text-slate-700">
                          {item.detalhes?.data_validade
                            ? new Date(
                                `${String(item.detalhes.data_validade).slice(0, 10)}T00:00:00`,
                              ).toLocaleDateString("pt-BR")
                            : "Não informada"}
                        </td>
                      )}
                      <td className="p-3.5 text-center text-slate-600">
                        {localizacaoVal}
                      </td>
                      <td className="p-3.5 text-center">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${estaCautelado ? "bg-amber-100 text-amber-800" : item.status === "disponivel" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
                        >
                          {[
                            "temporaria",
                            "longo_prazo",
                            "acautelada_sem_classificacao",
                          ].includes(classificacaoItem.chave)
                            ? "Cautelado"
                            : item.status === "disponivel"
                              ? "Disponível"
                              : item.status}
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          onClick={() => {
                            if (item.tipo === "armamento")
                              setArmaSelecionada(item);
                            else setItemEspecialSelecionado(item);
                          }}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all text-xs border border-slate-200 shadow-xs"
                        >
                          Visualizar
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
            <span className="text-xs font-semibold text-slate-700">
              Registros exibidos: <strong>{quantidadeFiltradaAba}</strong> de{" "}
              <strong>{totalRegistrosAba}</strong>
            </span>
            <span className="text-[10px] text-slate-500">
              Considera os filtros aplicados
            </span>
          </div>
          <table className="w-full text-center text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold text-[11px]">
                <th className="p-3.5 text-center">Rádio / Marca / Modelo</th>
                <th className="p-3.5 text-center">Nº de Série</th>
                <th className="p-3.5 text-center">Nº Identificação</th>
                <th className="p-3.5 text-center">Tombo</th>
                <th className="p-3.5 text-center">Localização</th>
                <th className="p-3.5 text-center">Status</th>
                <th className="p-3.5 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {radiosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    Nenhum rádio comunicador cadastrado.
                  </td>
                </tr>
              ) : (
                radiosFiltrados.map((radio) => (
                  <tr
                    key={radio.id}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="p-3.5 text-center font-bold text-slate-800">
                      {radio.marca} - {radio.modelo_descricao}
                    </td>
                    <td className="p-3.5 text-center font-mono font-bold text-slate-700">
                      {radio.numero_serie}
                    </td>
                    <td className="p-3.5 text-center font-mono text-blue-600 font-bold">
                      {radio.numero_identificacao}
                    </td>
                    <td className="p-3.5 text-center text-slate-600">
                      {radio.tombo || "—"}
                    </td>
                    <td className="p-3.5 text-center text-slate-600">
                      {radio.localizacao_atual}
                    </td>
                    <td className="p-3.5 text-center">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          radio.status === "disponivel"
                            ? "bg-emerald-100 text-emerald-800"
                            : radio.status === "cautelado"
                              ? "bg-blue-100 text-blue-800"
                              : radio.status === "em_manutencao"
                                ? "bg-amber-100 text-amber-800"
                                : radio.status === "baixado"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {{
                          disponivel: "Disponível",
                          cautelado: "Cautelado",
                          em_manutencao: "Em manutenção",
                          baixado: "Baixado",
                        }[radio.status] ||
                          radio.status ||
                          "Disponível"}
                      </span>
                    </td>
                    <td className="p-3.5 text-center">
                      <div className="flex justify-center items-center">
                        <button
                          type="button"
                          onClick={() => setRadioSelecionado(radio)}
                          disabled={
                            salvandoEdicaoRadio || excluindoRadio === radio.id
                          }
                          title="Visualizar detalhes do rádio"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Eye className="w-3.5 h-3.5" /> Visualizar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {radioSelecionado && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-[70] flex items-center justify-center p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setRadioSelecionado(null);
          }}
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-100 space-y-4 my-8">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-800">
                  Detalhes do Rádio Comunicador
                </h2>
                <p className="text-[11px] text-slate-500 mt-1">
                  Consulta dos dados cadastrais e da foto do equipamento.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRadioSelecionado(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-base p-1"
                aria-label="Fechar detalhes"
              >
                ✕
              </button>
            </div>

            {radioSelecionado.foto_radio_url ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 flex justify-center">
                <img
                  src={radioSelecionado.foto_radio_url}
                  alt={`Foto do rádio ${radioSelecionado.numero_identificacao || ""}`}
                  className="max-h-64 max-w-full object-contain rounded-lg"
                />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 py-8 text-center text-xs text-slate-500">
                Nenhuma foto cadastrada para este rádio.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {[
                ["Marca", radioSelecionado.marca],
                ["Modelo", radioSelecionado.modelo_descricao],
                ["Nº de Série", radioSelecionado.numero_serie],
                ["Nº de Identificação", radioSelecionado.numero_identificacao],
                ["Tombo / Patrimônio", radioSelecionado.tombo],
                ["Localização Atual", radioSelecionado.localizacao_atual],
                [
                  "Status",
                  {
                    disponivel: "Disponível",
                    cautelado: "Cautelado",
                    em_manutencao: "Em manutenção",
                    baixado: "Baixado",
                  }[radioSelecionado.status] || radioSelecionado.status,
                ],
              ].map(([rotulo, valor]) => (
                <div
                  key={rotulo}
                  className="rounded-xl bg-slate-50 border border-slate-100 p-3"
                >
                  <p className="text-[10px] font-bold uppercase text-slate-500 mb-1">
                    {rotulo}
                  </p>
                  <p className="font-semibold text-slate-800 break-words">
                    {valor || "—"}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
              <p className="text-[10px] font-bold uppercase text-slate-500 mb-1">
                Observações
              </p>
              <p className="text-xs text-slate-800 whitespace-pre-wrap break-words">
                {radioSelecionado.observacoes ||
                  "Nenhuma observação cadastrada."}
              </p>
            </div>

            <div className="pt-3 border-t space-y-3">
              {podeEditarExcluirRadio && (
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold uppercase text-slate-600">
                    Alterar status
                  </label>
                  <select
                    value={radioSelecionado.status || "disponivel"}
                    disabled={atualizandoStatusRadio === radioSelecionado.id}
                    onChange={async (e) => {
                      const novoStatus = e.target.value;
                      const statusAnterior =
                        radioSelecionado.status || "disponivel";
                      if (novoStatus === statusAnterior) return;
                      if (
                        statusAnterior === "cautelado" ||
                        novoStatus === "cautelado"
                      ) {
                        alert(
                          "O status Cautelado deve ser alterado pela emissão ou devolução da cautela.",
                        );
                        return;
                      }
                      setAtualizandoStatusRadio(radioSelecionado.id);
                      const localizacaoAtualizada =
                        novoStatus === "em_manutencao"
                          ? "Manutenção"
                          : novoStatus === "disponivel"
                            ? "Estoque da Reserva"
                            : radioSelecionado.localizacao_atual;
                      try {
                        const response = await fetch(
                          `/api/radios?id=${encodeURIComponent(radioSelecionado.id)}`,
                          {
                            method: "PATCH",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              status: novoStatus,
                              localizacao_atual: localizacaoAtualizada,
                            }),
                          },
                        );
                        const resultado = await response.json();
                        if (!response.ok) {
                          throw new Error(
                            resultado.error ||
                              "Não foi possível atualizar o status.",
                          );
                        }
                        setRadios((atuais) =>
                          atuais.map((item) =>
                            item.id === radioSelecionado.id
                              ? resultado.radio
                              : item,
                          ),
                        );
                        setRadioSelecionado(resultado.radio);
                      } catch (error) {
                        alert(
                          "Não foi possível atualizar o status: " +
                            error.message,
                        );
                      } finally {
                        setAtualizandoStatusRadio(null);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800"
                    aria-label={`Alterar status do rádio ${radioSelecionado.numero_identificacao}`}
                  >
                    <option value="disponivel">Disponível</option>
                    <option value="cautelado">Cautelado</option>
                    <option value="em_manutencao">Em manutenção</option>
                    <option value="baixado">Baixado</option>
                  </select>
                  <p className="text-[10px] text-slate-500">
                    O status Cautelado é controlado pela emissão ou devolução da
                    cautela.
                  </p>
                </div>
              )}
              <div className="flex flex-wrap justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  {podeEditarExcluirRadio && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          const radio = radioSelecionado;
                          setRadioSelecionado(null);
                          abrirEdicaoRadio(radio);
                        }}
                        disabled={
                          radioSelecionado.status === "cautelado" ||
                          salvandoEdicaoRadio ||
                          excluindoRadio === radioSelecionado.id
                        }
                        title={
                          radioSelecionado.status === "cautelado"
                            ? "Rádio cautelado não pode ser editado"
                            : "Editar rádio"
                        }
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold disabled:opacity-40 disabled:cursor-not-allowed text-xs"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Editar
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const radio = radioSelecionado;
                          setRadioSelecionado(null);
                          await excluirRadio(radio);
                        }}
                        disabled={
                          radioSelecionado.status === "cautelado" ||
                          excluindoRadio === radioSelecionado.id ||
                          salvandoEdicaoRadio
                        }
                        title={
                          radioSelecionado.status === "cautelado"
                            ? "Rádio cautelado não pode ser excluído"
                            : "Excluir rádio"
                        }
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 font-bold disabled:opacity-40 disabled:cursor-not-allowed text-xs"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {excluindoRadio === radioSelecionado.id
                          ? "Excluindo..."
                          : "Excluir"}
                      </button>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setRadioSelecionado(null)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {radioEmEdicao && podeEditarExcluirRadio && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-[60] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-100 space-y-4 my-8">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-800">
                Editar Rádio Comunicador
              </h2>
              <button
                type="button"
                onClick={() => setRadioEmEdicao(null)}
                disabled={salvandoEdicaoRadio}
                className="text-slate-400 hover:text-slate-600 font-bold text-base p-1"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
            <form onSubmit={salvarEdicaoRadio} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Marca *
                  </label>
                  <input
                    required
                    value={radioEmEdicao.marca}
                    onChange={(e) =>
                      setRadioEmEdicao((atual) => ({
                        ...atual,
                        marca: e.target.value,
                      }))
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl uppercase"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Modelo *
                  </label>
                  <input
                    required
                    value={radioEmEdicao.modelo_descricao}
                    onChange={(e) =>
                      setRadioEmEdicao((atual) => ({
                        ...atual,
                        modelo_descricao: e.target.value,
                      }))
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl uppercase"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Nº de Série *
                  </label>
                  <input
                    required
                    value={radioEmEdicao.numero_serie}
                    onChange={(e) =>
                      setRadioEmEdicao((atual) => ({
                        ...atual,
                        numero_serie: e.target.value,
                      }))
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl uppercase font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Nº de Identificação *
                  </label>
                  <input
                    required
                    value={radioEmEdicao.numero_identificacao}
                    onChange={(e) =>
                      setRadioEmEdicao((atual) => ({
                        ...atual,
                        numero_identificacao: e.target.value,
                      }))
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl uppercase font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Tombo / Patrimônio
                  </label>
                  <input
                    value={radioEmEdicao.tombo}
                    onChange={(e) =>
                      setRadioEmEdicao((atual) => ({
                        ...atual,
                        tombo: e.target.value,
                      }))
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl uppercase"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Localização
                  </label>
                  <select
                    value={radioEmEdicao.localizacao_atual}
                    onChange={(e) =>
                      setRadioEmEdicao((atual) => ({
                        ...atual,
                        localizacao_atual: e.target.value,
                      }))
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="Estoque da Reserva">
                      Estoque da Reserva
                    </option>
                    <option value="Acautelada com Policial">
                      Acautelada com Policial
                    </option>
                    <option value="Manutenção">Manutenção</option>
                    <option value="Apreendida">Apreendida</option>
                    <option value="Em Perícia">Em Perícia</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Observações
                </label>
                <textarea
                  rows="3"
                  value={radioEmEdicao.observacoes}
                  onChange={(e) =>
                    setRadioEmEdicao((atual) => ({
                      ...atual,
                      observacoes: e.target.value,
                    }))
                  }
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl resize-none"
                />
              </div>
              <p className="text-[10px] text-slate-500">
                O status e a foto atual serão preservados. Para alterar o
                status, use o seletor da tabela.
              </p>
              <div className="flex gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setRadioEmEdicao(null)}
                  disabled={salvandoEdicaoRadio}
                  className="w-1/3 py-2.5 bg-slate-100 font-bold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoEdicaoRadio}
                  className="w-2/3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl disabled:opacity-60"
                >
                  {salvandoEdicaoRadio ? "Salvando..." : "Salvar alterações"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalNovo && isP4OrMasterOrArmeiro && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-100 space-y-4 my-8">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-800">
                Cadastrar Novo Equipamento
              </h2>
              <button
                onClick={() => setModalNovo(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-base p-1"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleCadastrarEquipamento}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Gênero / Categoria
                </label>
                <select
                  value={abaAtiva === "radios" ? "radio" : novoTipo}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "radio") {
                      setAbaAtiva("radios");
                    } else {
                      setAbaAtiva(
                        val === "colete"
                          ? "coletes"
                          : val === "municao"
                            ? "municoes"
                            : "armamentos",
                      );
                      handleTipoChange(val);
                    }
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="armamento">Armamento</option>
                  <option value="colete">Colete Balístico</option>
                  <option value="municao">Munição</option>
                  <option value="radio">Rádio Comunicador</option>
                </select>
              </div>

              {/* FORMULÁRIO ESPECÍFICO DE RÁDIO COMUNICADOR COM FOTO */}
              {abaAtiva === "radios" ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-700 uppercase mb-1">
                        Marca *
                      </label>
                      <input
                        type="text"
                        required
                        value={radioMarca}
                        onChange={(e) => setRadioMarca(e.target.value)}
                        placeholder="Ex: Motorola"
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl uppercase"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 uppercase mb-1">
                        Modelo *
                      </label>
                      <input
                        type="text"
                        required
                        value={radioModelo}
                        onChange={(e) => setRadioModelo(e.target.value)}
                        placeholder="Ex: APX 2000"
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl uppercase"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-700 uppercase mb-1">
                        Nº de Série *
                      </label>
                      <input
                        type="text"
                        required
                        value={radioSerie}
                        onChange={(e) => setRadioSerie(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl uppercase font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 uppercase mb-1">
                        Nº de Identificação *
                      </label>
                      <input
                        type="text"
                        required
                        value={radioIdentificacao}
                        onChange={(e) => setRadioIdentificacao(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl uppercase font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-700 uppercase mb-1">
                        Tombo / Patrimônio
                      </label>
                      <input
                        type="text"
                        value={radioTombo}
                        onChange={(e) => setRadioTombo(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl uppercase"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 uppercase mb-1">
                        Localização
                      </label>
                      <select
                        value={radioLocalizacao}
                        onChange={(e) => setRadioLocalizacao(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                      >
                        <option value="Estoque da Reserva">
                          Estoque da Reserva
                        </option>
                        <option value="Acautelada com Policial">
                          Acautelada com Policial
                        </option>
                        <option value="Manutenção">Manutenção</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Foto do Rádio
                    </label>
                    <label className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 cursor-pointer hover:bg-slate-100 transition-all truncate">
                      <Upload className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span className="truncate">
                        {arquivoRadio ? arquivoRadio.name : "Escolher arquivo"}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => setArquivoRadio(e.target.files[0])}
                      />
                    </label>
                  </div>
                </>
              ) : (
                /* FORMULÁRIO GERAL (ARMAMENTO / COLETE / MUNIÇÃO) COM TODAS AS FOTOS RESTAURADAS */
                <>
                  {novoTipo === "armamento" && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-bold text-slate-700 uppercase mb-1">
                          Tipo de Arma *
                        </label>
                        <select
                          value={subtipoArmamento}
                          onChange={(e) => setSubtipoArmamento(e.target.value)}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none"
                        >
                          <option value="Pistola">Pistola</option>
                          <option value="Fuzil">Fuzil</option>
                          <option value="Espingarda">Espingarda</option>
                          <option value="Carabina Tática">
                            Carabina Tática
                          </option>
                          <option value="Carabina">Carabina</option>
                          <option value="Submetralhadora">
                            Submetralhadora
                          </option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 uppercase mb-1">
                          Modelo *
                        </label>
                        <input
                          type="text"
                          required
                          value={novoModelo}
                          onChange={(e) => setNovoModelo(e.target.value)}
                          placeholder="Ex: PT 840, T4..."
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {novoTipo !== "armamento" && (
                    <div>
                      <label className="block font-bold text-slate-700 uppercase mb-1">
                        {novoTipo === "municao"
                          ? "Tipo / Calibre da Munição *"
                          : "Marca / Modelo *"}
                      </label>
                      <input
                        type="text"
                        required
                        value={novoModelo}
                        onChange={(e) => setNovoModelo(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                      />
                    </div>
                  )}

                  {novoTipo === "municao" ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-bold text-slate-700 uppercase mb-1">
                          Identificação do Lote
                        </label>
                        <input
                          type="text"
                          value={municaoLote}
                          onChange={(e) => setMunicaoLote(e.target.value)}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 uppercase mb-1">
                          Quantidade *
                        </label>
                        <input
                          type="number"
                          required
                          min="1"
                          value={municaoQuantidade}
                          onChange={(e) => setMunicaoQuantidade(e.target.value)}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold outline-none"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-bold text-slate-700 uppercase mb-1">
                          Nº de Série *
                        </label>
                        <input
                          type="text"
                          required
                          value={novoSerie}
                          onChange={(e) => setNovoSerie(e.target.value)}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 uppercase mb-1">
                          Tombo / Patrimônio
                        </label>
                        <input
                          type="text"
                          value={novoPatrimonio}
                          onChange={(e) => setNovoPatrimonio(e.target.value)}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {novoTipo === "colete" && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block font-bold text-slate-700 uppercase mb-1">
                            Gênero
                          </label>
                          <select
                            value={coleteGenero}
                            onChange={(e) => setColeteGenero(e.target.value)}
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                          >
                            <option value="MASCULINO">MASCULINO</option>
                            <option value="FEMININO">FEMININO</option>
                            <option value="UNISEX">UNISEX</option>
                          </select>
                        </div>
                        <div>
                          <label className="block font-bold text-slate-700 uppercase mb-1">
                            Tamanho
                          </label>
                          <select
                            value={coleteTamanho}
                            onChange={(e) => setColeteTamanho(e.target.value)}
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                          >
                            <option value="PP">PP</option>
                            <option value="P">P</option>
                            <option value="M">M</option>
                            <option value="G">G</option>
                            <option value="GG">GG</option>
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block font-bold text-slate-700 uppercase mb-1">
                            Data Fabricação
                          </label>
                          <input
                            type="date"
                            value={coleteDataFabricacao}
                            onChange={(e) =>
                              setColeteDataFabricacao(e.target.value)
                            }
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-slate-700 uppercase mb-1">
                            Data Validade
                          </label>
                          <input
                            type="date"
                            value={coleteDataValidade}
                            onChange={(e) =>
                              setColeteDataValidade(e.target.value)
                            }
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {novoTipo === "armamento" && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-bold text-slate-700 uppercase mb-1">
                          Calibre
                        </label>
                        <input
                          type="text"
                          value={novoCalibre}
                          onChange={(e) => setNovoCalibre(e.target.value)}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 uppercase mb-1">
                          Estado
                        </label>
                        <select
                          value={novoEstado}
                          onChange={(e) => setNovoEstado(e.target.value)}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                        >
                          <option value="Novo">Novo</option>
                          <option value="Bom">Bom</option>
                          <option value="Regular">Regular</option>
                          <option value="Danificado">Danificado</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">
                      Localização Atual
                    </label>
                    <select
                      value={novoLocalizacao}
                      onChange={(e) => setNovoLocalizacao(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    >
                      <option value="Estoque da Reserva">
                        Estoque da Reserva
                      </option>
                      <option value="Acautelada com Policial">
                        Acautelada com Policial
                      </option>
                      <option value="Apreendida">Apreendida</option>
                      <option value="Em Perícia">Em Perícia</option>
                      <option value="Manutenção">Manutenção</option>
                    </select>
                  </div>

                  {/* SEÇÃO DE UPLOAD DE FOTOS CONDICIONAIS RESTAURADA */}
                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <span className="block font-bold text-slate-700 uppercase text-[10px]">
                      Anexos de Imagens / Fotos
                    </span>

                    {novoTipo === "armamento" && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Foto da Frente da Arma
                          </label>
                          <label className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 cursor-pointer hover:bg-slate-100 transition-all truncate">
                            <Upload className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span className="truncate">
                              {arquivoArma
                                ? arquivoArma.name
                                : "Escolher arquivo"}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) =>
                                setArquivoArma(e.target.files[0])
                              }
                            />
                          </label>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Foto do Nº de Série
                          </label>
                          <label className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 cursor-pointer hover:bg-slate-100 transition-all truncate">
                            <Upload className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span className="truncate">
                              {arquivoNumeracao
                                ? arquivoNumeracao.name
                                : "Escolher arquivo"}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) =>
                                setArquivoNumeracao(e.target.files[0])
                              }
                            />
                          </label>
                        </div>
                      </div>
                    )}

                    {novoTipo === "colete" && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Foto Rótulo da Frente
                          </label>
                          <label className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 cursor-pointer hover:bg-slate-100 transition-all truncate">
                            <Upload className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span className="truncate">
                              {arquivoColeteFrente
                                ? arquivoColeteFrente.name
                                : "Escolher arquivo"}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) =>
                                setArquivoColeteFrente(e.target.files[0])
                              }
                            />
                          </label>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Foto Rótulo do Verso
                          </label>
                          <label className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 cursor-pointer hover:bg-slate-100 transition-all truncate">
                            <Upload className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span className="truncate">
                              {arquivoColeteVerso
                                ? arquivoColeteVerso.name
                                : "Escolher arquivo"}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) =>
                                setArquivoColeteVerso(e.target.files[0])
                              }
                            />
                          </label>
                        </div>
                      </div>
                    )}

                    {novoTipo === "municao" && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Foto das Munições
                          </label>
                          <label className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 cursor-pointer hover:bg-slate-100 transition-all truncate">
                            <Upload className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span className="truncate">
                              {arquivoMunicaoGeral
                                ? arquivoMunicaoGeral.name
                                : "Escolher arquivo"}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) =>
                                setArquivoMunicaoGeral(e.target.files[0])
                              }
                            />
                          </label>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Foto da Caixa (se houver)
                          </label>
                          <label className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 cursor-pointer hover:bg-slate-100 transition-all truncate">
                            <Upload className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span className="truncate">
                              {arquivoMunicaoCaixa
                                ? arquivoMunicaoCaixa.name
                                : "Escolher arquivo"}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) =>
                                setArquivoMunicaoCaixa(e.target.files[0])
                              }
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Observações
                </label>
                <textarea
                  rows="2"
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl resize-none"
                />
              </div>

              <div className="flex gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setModalNovo(false)}
                  className="w-1/3 py-2.5 bg-slate-100 font-bold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="w-2/3 py-2.5 bg-blue-600 text-white font-bold rounded-xl shadow-md"
                >
                  {salvando ? "Salvando..." : "Salvar Equipamento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {itemEspecialSelecionado && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-[70] flex items-center justify-center p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setItemEspecialSelecionado(null);
          }}
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-100 space-y-4 my-8">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-800">
                  {itemEspecialSelecionado.tipo === "colete"
                    ? "Detalhes do Colete Balístico"
                    : "Detalhes da Munição"}
                </h2>
                <p className="text-[11px] text-slate-500 mt-1">
                  Consulta dos dados cadastrais e imagens.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setItemEspecialSelecionado(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-base p-1"
                aria-label="Fechar detalhes"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                [
                  "Tipo / Descrição",
                  itemEspecialSelecionado.modelo_descricao ||
                    itemEspecialSelecionado.modelo ||
                    "—",
                ],
                [
                  "Nº de Série / Lote",
                  itemEspecialSelecionado.num_serie ||
                    itemEspecialSelecionado.numero_serie ||
                    "—",
                ],
                ...(itemEspecialSelecionado.tipo === "colete"
                  ? [
                      [
                        "Gênero",
                        itemEspecialSelecionado.detalhes?.genero || "—",
                      ],
                      [
                        "Tamanho",
                        itemEspecialSelecionado.detalhes?.tamanho || "—",
                      ],
                      [
                        "Data de Fabricação",
                        itemEspecialSelecionado.detalhes?.data_fabricacao ||
                          "—",
                      ],
                      [
                        "Data de Validade",
                        itemEspecialSelecionado.detalhes?.data_validade
                          ? new Date(
                              `${String(itemEspecialSelecionado.detalhes.data_validade).slice(0, 10)}T00:00:00`,
                            ).toLocaleDateString("pt-BR")
                          : "Não informada",
                      ],
                    ]
                  : [
                      [
                        "Lote",
                        itemEspecialSelecionado.detalhes?.lote ||
                          "Não Identificado",
                      ],
                      [
                        "Quantidade",
                        `${itemEspecialSelecionado.detalhes?.quantidade ?? 0} unidades`,
                      ],
                    ]),
                [
                  "Localização Atual",
                  itemEspecialSelecionado.detalhes?.localizacao_atual ||
                    "Estoque da Reserva",
                ],
                ["Status", itemEspecialSelecionado.status || "—"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl bg-slate-50 border border-slate-100 p-3"
                >
                  <p className="text-[10px] font-bold uppercase text-slate-500 mb-1">
                    {label}
                  </p>
                  <p className="text-xs font-semibold text-slate-800 break-words">
                    {value}
                  </p>
                </div>
              ))}
            </div>

            {itemEspecialSelecionado.tipo === "colete" &&
              (itemEspecialSelecionado.status === "baixado" ||
                String(
                  itemEspecialSelecionado.detalhes?.localizacao_atual || "",
                ).toLowerCase() === "baixa definitiva") && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-3">
                  <p className="text-[10px] font-bold uppercase text-red-700 mb-1">
                    Observação da baixa definitiva
                  </p>
                  <p className="text-xs text-slate-800 whitespace-pre-wrap break-words">
                    {itemEspecialSelecionado.detalhes?.obs_baixa_definitiva ||
                      "Nenhuma observação específica da baixa foi cadastrada."}
                  </p>
                </div>
              )}
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
              <p className="text-[10px] font-bold uppercase text-slate-500 mb-1">
                Observações
              </p>
              <p className="text-xs text-slate-800 whitespace-pre-wrap break-words">
                {itemEspecialSelecionado.detalhes?.obs ||
                  itemEspecialSelecionado.obs ||
                  "Nenhuma observação cadastrada."}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase text-slate-500">
                Fotos / Imagens
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  {
                    label:
                      itemEspecialSelecionado.tipo === "colete"
                        ? "Rótulo da frente"
                        : "Munições",
                    url: itemEspecialSelecionado.detalhes?.foto_arma_url,
                  },
                  {
                    label:
                      itemEspecialSelecionado.tipo === "colete"
                        ? "Rótulo do verso"
                        : "Caixa da munição",
                    url: itemEspecialSelecionado.detalhes?.foto_numeracao_url,
                  },
                ].map((foto) => (
                  <div
                    key={foto.label}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-2"
                  >
                    <p className="text-[10px] font-bold text-slate-500 mb-2">
                      {foto.label}
                    </p>
                    {foto.url ? (
                      <img
                        src={foto.url}
                        alt={foto.label}
                        className="w-full max-h-56 object-contain rounded-lg"
                      />
                    ) : (
                      <div className="py-8 text-center text-xs text-slate-400">
                        Imagem não cadastrada
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap justify-between gap-2 pt-2 border-t">
              <div className="flex gap-2">
                {podeEditarExcluirRadio && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        abrirEdicaoEquipamento(itemEspecialSelecionado);
                        setItemEspecialSelecionado(null);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-xs"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Editar
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        excluirEquipamento(itemEspecialSelecionado)
                      }
                      disabled={
                        excluindoEquipamento === itemEspecialSelecionado.id
                      }
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 font-bold text-xs disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {excluindoEquipamento === itemEspecialSelecionado.id
                        ? "Excluindo..."
                        : "Excluir"}
                    </button>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => setItemEspecialSelecionado(null)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {itemEspecialEmEdicao && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[80] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-800">
                  Editar{" "}
                  {itemEspecialEmEdicao.tipo === "colete"
                    ? "Colete Balístico"
                    : "Munição"}
                </h2>
                <p className="text-[11px] text-slate-500 mt-1">
                  Altere os dados e salve para atualizar o cadastro.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setItemEspecialEmEdicao(null)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1"
                aria-label="Fechar edição"
              >
                ✕
              </button>
            </div>
            <form onSubmit={salvarEdicaoEquipamento} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-[10px] font-bold uppercase text-slate-600 space-y-1">
                  Tipo / Descrição
                  <input
                    required
                    value={itemEspecialEmEdicao.modelo_descricao}
                    onChange={(e) =>
                      setItemEspecialEmEdicao((atual) => ({
                        ...atual,
                        modelo_descricao: e.target.value,
                      }))
                    }
                    className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-xs normal-case font-medium"
                  />
                </label>
                <label className="text-[10px] font-bold uppercase text-slate-600 space-y-1">
                  Nº de Série / Lote
                  <input
                    value={itemEspecialEmEdicao.num_serie}
                    onChange={(e) =>
                      setItemEspecialEmEdicao((atual) => ({
                        ...atual,
                        num_serie: e.target.value,
                      }))
                    }
                    className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-xs normal-case font-medium"
                  />
                </label>
                <label className="text-[10px] font-bold uppercase text-slate-600 space-y-1">
                  Tombo / Patrimônio
                  <input
                    value={itemEspecialEmEdicao.patrimonio}
                    onChange={(e) =>
                      setItemEspecialEmEdicao((atual) => ({
                        ...atual,
                        patrimonio: e.target.value,
                      }))
                    }
                    className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-xs normal-case font-medium"
                  />
                </label>
                <label className="text-[10px] font-bold uppercase text-slate-600 space-y-1">
                  Localização Atual
                  <select
                    value={itemEspecialEmEdicao.detalhes.localizacao_atual}
                    onChange={(e) => {
                      const localizacao = e.target.value;
                      const status =
                        localizacao === "Acautelada com Policial"
                          ? "cautelado"
                          : localizacao === "Baixa Definitiva"
                            ? "baixado"
                            : "disponivel";
                      setItemEspecialEmEdicao((atual) => ({
                        ...atual,
                        status,
                        detalhes: {
                          ...atual.detalhes,
                          localizacao_atual: localizacao,
                        },
                      }));
                    }}
                    className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-xs normal-case font-medium"
                  >
                    <option value="Acautelada com Policial">
                      Acautelado com policial
                    </option>
                    <option value="Baixa Definitiva">Baixa definitiva</option>
                    <option value="Estoque da Reserva">
                      Disponível na reserva
                    </option>
                  </select>
                </label>
                {itemEspecialEmEdicao.tipo !== "colete" && (
                  <label className="text-[10px] font-bold uppercase text-slate-600 space-y-1">
                    Status
                    <select
                      value={itemEspecialEmEdicao.status}
                      onChange={(e) =>
                        setItemEspecialEmEdicao((atual) => ({
                          ...atual,
                          status: e.target.value,
                        }))
                      }
                      className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-xs normal-case font-medium"
                    >
                      <option value="disponivel">Disponível</option>
                      <option value="cautelado">Cautelado</option>
                      <option value="em_manutencao">Em manutenção</option>
                      <option value="baixado">Baixado</option>
                    </select>
                  </label>
                )}
                {itemEspecialEmEdicao.tipo === "colete" ? (
                  <>
                    <label className="text-[10px] font-bold uppercase text-slate-600 space-y-1">
                      Gênero
                      <select
                        value={itemEspecialEmEdicao.detalhes.genero}
                        onChange={(e) =>
                          setItemEspecialEmEdicao((atual) => ({
                            ...atual,
                            detalhes: {
                              ...atual.detalhes,
                              genero: e.target.value,
                            },
                          }))
                        }
                        className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-xs normal-case font-medium"
                      >
                        <option value="MASCULINO">Masculino</option>
                        <option value="FEMININO">Feminino</option>
                        <option value="UNISEX">Unissex</option>
                      </select>
                    </label>
                    <label className="text-[10px] font-bold uppercase text-slate-600 space-y-1">
                      Tamanho
                      <select
                        value={itemEspecialEmEdicao.detalhes.tamanho}
                        onChange={(e) =>
                          setItemEspecialEmEdicao((atual) => ({
                            ...atual,
                            detalhes: {
                              ...atual.detalhes,
                              tamanho: e.target.value,
                            },
                          }))
                        }
                        className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-xs normal-case font-medium"
                      >
                        {["PP", "P", "M", "G", "GG"].map((tamanho) => (
                          <option key={tamanho} value={tamanho}>
                            {tamanho}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-[10px] font-bold uppercase text-slate-600 space-y-1">
                      Data de Fabricação
                      <input
                        type="date"
                        value={String(
                          itemEspecialEmEdicao.detalhes.data_fabricacao || "",
                        ).slice(0, 10)}
                        onChange={(e) =>
                          setItemEspecialEmEdicao((atual) => ({
                            ...atual,
                            detalhes: {
                              ...atual.detalhes,
                              data_fabricacao: e.target.value,
                            },
                          }))
                        }
                        className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-xs"
                      />
                    </label>
                    <label className="text-[10px] font-bold uppercase text-slate-600 space-y-1">
                      Data de Validade
                      <input
                        type="date"
                        value={String(
                          itemEspecialEmEdicao.detalhes.data_validade || "",
                        ).slice(0, 10)}
                        onChange={(e) =>
                          setItemEspecialEmEdicao((atual) => ({
                            ...atual,
                            detalhes: {
                              ...atual.detalhes,
                              data_validade: e.target.value,
                            },
                          }))
                        }
                        className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-xs"
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label className="text-[10px] font-bold uppercase text-slate-600 space-y-1">
                      Lote
                      <input
                        value={itemEspecialEmEdicao.detalhes.lote}
                        onChange={(e) =>
                          setItemEspecialEmEdicao((atual) => ({
                            ...atual,
                            detalhes: {
                              ...atual.detalhes,
                              lote: e.target.value,
                            },
                          }))
                        }
                        className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-xs normal-case font-medium"
                      />
                    </label>
                    <label className="text-[10px] font-bold uppercase text-slate-600 space-y-1">
                      Quantidade
                      <input
                        type="number"
                        min="0"
                        value={itemEspecialEmEdicao.detalhes.quantidade}
                        onChange={(e) =>
                          setItemEspecialEmEdicao((atual) => ({
                            ...atual,
                            detalhes: {
                              ...atual.detalhes,
                              quantidade: e.target.value,
                            },
                          }))
                        }
                        className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-xs normal-case font-medium"
                      />
                    </label>
                  </>
                )}
              </div>
              {itemEspecialEmEdicao.tipo === "colete" &&
                itemEspecialEmEdicao.detalhes.localizacao_atual ===
                  "Baixa Definitiva" && (
                  <label className="block text-[10px] font-bold uppercase text-red-700 space-y-1">
                    Observação da baixa definitiva
                    <textarea
                      rows="3"
                      required
                      value={itemEspecialEmEdicao.detalhes.obs_baixa_definitiva}
                      onChange={(e) =>
                        setItemEspecialEmEdicao((atual) => ({
                          ...atual,
                          detalhes: {
                            ...atual.detalhes,
                            obs_baixa_definitiva: e.target.value,
                          },
                        }))
                      }
                      placeholder="Informe o motivo e os dados da baixa definitiva..."
                      className="w-full p-2.5 border border-red-200 rounded-xl bg-red-50 text-xs normal-case font-medium resize-y"
                    />
                  </label>
                )}
              <label className="block text-[10px] font-bold uppercase text-slate-600 space-y-1">
                Observações
                <textarea
                  rows="3"
                  value={itemEspecialEmEdicao.detalhes.obs}
                  onChange={(e) =>
                    setItemEspecialEmEdicao((atual) => ({
                      ...atual,
                      detalhes: { ...atual.detalhes, obs: e.target.value },
                    }))
                  }
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-xs normal-case font-medium resize-y"
                />
              </label>
              <p className="text-[10px] text-slate-500">
                As imagens existentes serão preservadas nesta edição.
              </p>
              <div className="flex gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setItemEspecialEmEdicao(null)}
                  className="w-1/3 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoEdicaoEquipamento}
                  className="w-2/3 py-2.5 bg-blue-600 text-white font-bold rounded-xl disabled:opacity-50"
                >
                  {salvandoEdicaoEquipamento
                    ? "Salvando..."
                    : "Salvar alterações"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {armaSelecionada && (
        <ModalDetalhesArma
          arma={armaSelecionada}
          userRole={userRole}
          onClose={() => setArmaSelecionada(null)}
          onUpdateSuccess={() => {
            carregarDados();
            setArmaSelecionada(null);
          }}
        />
      )}
    </div>
  );
}
