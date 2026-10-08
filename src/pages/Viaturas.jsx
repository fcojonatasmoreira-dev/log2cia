import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Car,
  Download,
  Eye,
  Pencil,
  Trash2,
  FileSpreadsheet,
  FileText,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import * as XLSX from "xlsx-js-style";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  criarViatura,
  listarViaturas,
  atualizarViatura,
  excluirViatura,
} from "../services/viaturasService";

const SITUACOES = [
  { value: "operando", label: "Operando" },
  { value: "baixada", label: "Baixada" },
  { value: "manutencao", label: "Em manutenção" },
  { value: "inativa", label: "Inativa" },
];

const TIPOS = [
  { value: "organica", label: "Orgânica" },
  { value: "locada", label: "Locada" },
  { value: "locada_req", label: "Locada/REQ" },
];

const LOCALIZACOES_PADRAO = [
  "Pátio da CIA",
  "Outro",
];

const situacaoLabel = (valor) =>
  SITUACOES.find((item) => item.value === valor)?.label || valor || "—";
const tipoLabel = (valor) =>
  TIPOS.find((item) => item.value === valor)?.label || valor || "—";

function classeSituacao(valor) {
  if (valor === "operando") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (valor === "manutencao") return "bg-amber-50 text-amber-700 border-amber-200";
  if (valor === "baixada") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

function classeTipo(valor) {
  if (valor === "organica") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (valor === "locada") return "bg-sky-50 text-sky-700 border-sky-200";
  if (valor === "locada_req") return "bg-violet-50 text-violet-700 border-violet-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function classeLinha(viatura) {
  if (viatura.situacao === "baixada") return "bg-rose-50/40";
  if (viatura.situacao === "manutencao") return "bg-amber-50/40";
  if (viatura.situacao === "inativa") return "bg-slate-50";
  return "";
}

function numeroOrdenacaoIdentificacao(valor) {
  const grupos = String(valor || "").match(/\d+/g);
  if (!grupos?.length) return Number.MAX_SAFE_INTEGER;
  const ultimo = grupos[grupos.length - 1];
  const numero = Number(ultimo);
  return Number.isFinite(numero) ? numero : Number.MAX_SAFE_INTEGER;
}

function compararViaturas(a, b) {
  const modelo = String(a.modelo || "").localeCompare(
    String(b.modelo || ""),
    "pt-BR",
    { sensitivity: "base" },
  );
  if (modelo !== 0) return modelo;

  const numeroA = numeroOrdenacaoIdentificacao(a.identificacao);
  const numeroB = numeroOrdenacaoIdentificacao(b.identificacao);
  if (numeroA !== numeroB) return numeroA - numeroB;

  const identificacao = String(a.identificacao || "").localeCompare(
    String(b.identificacao || ""),
    "pt-BR",
    { numeric: true, sensitivity: "base" },
  );
  if (identificacao !== 0) return identificacao;

  return String(a.placa || "").localeCompare(String(b.placa || ""), "pt-BR");
}

const dataBR = (valor) => {
  if (!valor) return "—";
  const partes = String(valor).split("-");
  if (partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`;
  return valor;
};

function localizacaoTexto(viatura) {
  return viatura.localizacao_atual || (viatura.situacao === "manutencao" ? "Pátio da oficina" : "Pátio da CIA");
}

function motivoTexto(viatura) {
  if (viatura.situacao === "manutencao") return viatura.motivo_manutencao || "—";
  if (viatura.situacao === "baixada") return viatura.motivo_baixa || "—";
  return "—";
}

const formularioInicial = {
  unidade: "2ª CIA / 15º BPM",
  identificacao: "",
  placa: "",
  marca: "",
  modelo: "",
  ano: "",
  tipo: "organica",
  situacao: "operando",
  data_baixa: "",
  motivo_baixa: "",
  data_manutencao: "",
  motivo_manutencao: "",
  oficina: "",
  localizacao_atual: "Pátio da CIA",
  area_operacao: "",
  quilometragem_atual: "",
  km_ultima_troca_oleo: "",
  data_ultima_troca_oleo: "",
  km_proxima_troca_oleo: "",
  data_ultima_manutencao: "",
  km_ultima_manutencao: "",
  observacoes: "",
};

function montarLinhasRelatorio(viaturas) {
  return [...viaturas].sort(compararViaturas).map((v, index) => ({
    ordem: index + 1,
    modelo: v.modelo || "—",
    unidade: v.unidade || "—",
    placa: v.placa || "—",
    identificacao: v.identificacao || "—",
    marca: v.marca || "—",
    tipo: tipoLabel(v.tipo),
    situacao: situacaoLabel(v.situacao),
    data: v.situacao === "baixada" ? dataBR(v.data_baixa) : v.situacao === "manutencao" ? dataBR(v.data_manutencao) : "—",
    localizacao: localizacaoTexto(v),
    localizacaoAtual: v.localizacao_atual || "Pátio da CIA",
    areaOperacao: v.area_operacao || "—",
    motivo: motivoTexto(v),
    oficina: v.oficina || "—",
    quilometragem: v.quilometragem_atual != null ? `${v.quilometragem_atual} km` : "—",
    ultimaTrocaOleo: [dataBR(v.data_ultima_troca_oleo), v.km_ultima_troca_oleo != null ? `${v.km_ultima_troca_oleo} km` : null].filter(Boolean).join(" / ") || "—",
    proximaTrocaOleo: v.km_proxima_troca_oleo != null ? `${v.km_proxima_troca_oleo} km` : "—",
    ultimaManutencao: [dataBR(v.data_ultima_manutencao), v.km_ultima_manutencao != null ? `${v.km_ultima_manutencao} km` : null].filter(Boolean).join(" / ") || "—",
    observacoes: v.observacoes || "—",
    atualizadoPor: v.atualizado_por_nome || v.atualizado_por || "Não registrado",
    raw: v,
  }));
}

export default function Viaturas() {
  const [viaturas, setViaturas] = useState([]);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [viaturaSelecionada, setViaturaSelecionada] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [formulario, setFormulario] = useState(formularioInicial);
  const [salvando, setSalvando] = useState(false);
  const [baixandoExcel, setBaixandoExcel] = useState(false);
  const [baixandoPdf, setBaixandoPdf] = useState(false);
  const [sucessoExcel, setSucessoExcel] = useState(false);
  const [sucessoPdf, setSucessoPdf] = useState(false);
  const [excluindo, setExcluindo] = useState("");
  const [podeGerenciar, setPodeGerenciar] = useState(false);

  useEffect(() => {
    try {
      const usuario = JSON.parse(localStorage.getItem("log2cia_user") || "null");
      const role = String(usuario?.role || "").trim().toLowerCase();
      setPodeGerenciar(
        usuario?.is_master === true || ["master", "p4"].includes(role),
      );
    } catch {
      setPodeGerenciar(false);
    }
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const resultado = await listarViaturas();
      setViaturas(resultado.viaturas || []);
    } catch (e) {
      setErro(e.message || "Não foi possível carregar as viaturas.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const listaFiltrada = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    let base = termo
      ? viaturas.filter((v) =>
          [
            v.unidade,
            v.identificacao,
            v.placa,
            v.marca,
            v.modelo,
            v.tipo,
            v.situacao,
            v.oficina,
            v.motivo_baixa,
            v.motivo_manutencao,
            v.localizacao_atual,
            v.area_operacao,
          ]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase("pt-BR")
            .includes(termo),
        )
      : viaturas;

    if (filtro === "organica" || filtro === "locada" || filtro === "locada_req") {
      base = base.filter((v) => v.tipo === filtro);
    } else if (filtro === "operando" || filtro === "baixada" || filtro === "manutencao" || filtro === "inativa") {
      base = base.filter((v) => v.situacao === filtro);
    }

    return [...base].sort(compararViaturas);
  }, [viaturas, busca, filtro]);

  const resumo = useMemo(
    () => ({
      total: viaturas.length,
      operando: viaturas.filter((v) => v.situacao === "operando" && v.ativo).length,
      baixadas: viaturas.filter((v) => v.situacao === "baixada").length,
      manutencao: viaturas.filter((v) => v.situacao === "manutencao").length,
      inativas: viaturas.filter((v) => v.situacao === "inativa" || !v.ativo).length,
    }),
    [viaturas],
  );

  const abrirNovo = () => {
    setErro("");
    setSucesso("");
    setEditando(null);
    setFormulario(formularioInicial);
    setModalAberto(true);
  };

  const abrirEdicao = (viatura) => {
    setErro("");
    setSucesso("");
    setEditando(viatura);
    setFormulario({
      unidade: viatura.unidade || "2ª CIA / 15º BPM",
      identificacao: viatura.identificacao || "",
      placa: viatura.placa || "",
      marca: viatura.marca || "",
      modelo: viatura.modelo || "",
      ano: viatura.ano ?? "",
      tipo: viatura.tipo || "organica",
      situacao: viatura.situacao || "operando",
      data_baixa: viatura.data_baixa || "",
      motivo_baixa: viatura.motivo_baixa || "",
      data_manutencao: viatura.data_manutencao || "",
      motivo_manutencao: viatura.motivo_manutencao || "",
      oficina: viatura.oficina || "",
      localizacao_atual: viatura.localizacao_atual || "Pátio da CIA",
      area_operacao: viatura.area_operacao || "",
      quilometragem_atual: viatura.quilometragem_atual ?? "",
      km_ultima_troca_oleo: viatura.km_ultima_troca_oleo ?? "",
      data_ultima_troca_oleo: viatura.data_ultima_troca_oleo || "",
      km_proxima_troca_oleo: viatura.km_proxima_troca_oleo ?? "",
      data_ultima_manutencao: viatura.data_ultima_manutencao || "",
      km_ultima_manutencao: viatura.km_ultima_manutencao ?? "",
      observacoes: viatura.observacoes || "",
    });
    setModalAberto(true);
  };

  const fecharModal = () => {
    if (salvando) return;
    setModalAberto(false);
    setEditando(null);
    setFormulario(formularioInicial);
  };

  const alterar = (campo, valor) => {
    setFormulario((atual) => ({ ...atual, [campo]: valor }));
  };

  const alterarSituacao = (situacao) => {
    setFormulario((atual) => ({
      ...atual,
      situacao,
      localizacao_atual:
        situacao === "manutencao"
          ? "Pátio da oficina"
          : "Pátio da CIA",
      area_operacao: situacao === "operando" ? atual.area_operacao : "",
    }));
  };

  const salvar = async (e) => {
    e.preventDefault();
    setSalvando(true);
    setErro("");
    setSucesso("");
    try {
      if (formulario.situacao === "baixada" && !formulario.data_baixa) {
        throw new Error("Informe a data da baixa.");
      }
      if (formulario.situacao === "manutencao" && !formulario.data_manutencao) {
        throw new Error("Informe a data de início da manutenção.");
      }
      if (!formulario.localizacao_atual) {
        throw new Error("Informe onde a viatura está localizada.");
      }

      const camposNumericos = [
        "ano",
        "quilometragem_atual",
        "km_ultima_troca_oleo",
        "km_proxima_troca_oleo",
        "km_ultima_manutencao",
      ];
      const dados = { ...formulario };
      for (const campo of camposNumericos) {
        dados[campo] = formulario[campo] === "" ? null : Number(formulario[campo]);
      }

      if (editando) {
        await atualizarViatura(editando.id, dados);
        setSucesso("Viatura atualizada com sucesso.");
      } else {
        await criarViatura(dados);
        setSucesso("Viatura cadastrada com sucesso.");
      }

      fecharModal();
      await carregar();
    } catch (e) {
      setErro(e.message || "Não foi possível salvar a viatura.");
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (viatura) => {
    if (!window.confirm(`Confirma a exclusão da viatura ${viatura.identificacao || viatura.placa}? Esta ação não poderá ser desfeita.`)) return;
    setExcluindo(viatura.id);
    setErro("");
    setSucesso("");
    try {
      await excluirViatura(viatura.id);
      setViaturaSelecionada(null);
      setSucesso("Viatura excluída com sucesso.");
      await carregar();
    } catch (e) {
      setErro(e.message || "Não foi possível excluir a viatura.");
    } finally {
      setExcluindo("");
    }
  };

  const exportarExcel = async () => {
    setBaixandoExcel(true);
    setSucessoExcel(false);
    setErro("");
    try {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const linhas = montarLinhasRelatorio(listaFiltrada);
      const agora = new Date();
      const operador = (() => {
        try {
          const usuario = JSON.parse(localStorage.getItem("log2cia_user") || "{}");
          return [
            usuario?.posto_graduacao || usuario?.posto || usuario?.graduacao,
            usuario?.numeral || usuario?.numero || usuario?.numero_operacional,
            usuario?.nome_guerra || usuario?.nome_de_guerra,
            usuario?.matricula,
          ].filter(Boolean).join(" - ") || "Operador não identificado";
        } catch { return "Operador não identificado"; }
      })();
      const dados = [
        ["2ª CIA / 15º BPM — CONTROLE DE VIATURAS"],
        [`Emitido em: ${agora.toLocaleDateString("pt-BR")} às ${agora.toLocaleTimeString("pt-BR")} por: ${operador}`],
        [`Registros exibidos: ${linhas.length} | Total: ${resumo.total} | Operando: ${resumo.operando} | Baixadas: ${resumo.baixadas} | Em manutenção: ${resumo.manutencao} | Inativas: ${resumo.inativas}`],
        [],
        [
          "ORD",
          "MODELO",
          "UNIDADE",
          "PLACA",
          "PREFIXO / IDENTIFICAÇÃO",
          "MARCA",
          "TIPO",
          "SITUAÇÃO",
          "DATA BAIXA / MANUT.",
          "LOCALIZAÇÃO / ÁREA",
          "MOTIVO BAIXA / MANUT.",
          "OFICINA",
          "KM ATUAL",
          "ÚLTIMA TROCA DE ÓLEO",
          "PRÓXIMA TROCA DE ÓLEO",
          "ÚLTIMA MANUTENÇÃO",
          "ÚLTIMA ATUALIZAÇÃO POR",
          "OBSERVAÇÕES",
        ],
      ];
      let ultimoModelo = null;
      linhas.forEach((l) => {
        if (l.modelo !== ultimoModelo) {
          dados.push([`MODELO: ${l.modelo}`]);
          ultimoModelo = l.modelo;
        }
        dados.push([
          l.ordem,
          l.modelo,
          l.unidade,
          l.placa,
          l.identificacao,
          l.marca,
          l.tipo,
          l.situacao,
          l.data,
          l.localizacao,
          l.motivo,
          l.oficina,
          l.quilometragem,
          l.ultimaTrocaOleo,
          l.proximaTrocaOleo,
          l.ultimaManutencao,
          l.atualizadoPor,
          l.observacoes,
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(dados);
      ws["A1"].s = {
        font: { bold: true, sz: 14, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "1F4E78" } },
        alignment: { horizontal: "center", vertical: "center" },
      };
      ws["A2"].s = { font: { bold: true, color: { rgb: "1F2937" } } };

      const cabecalho = 4;
      for (let c = 0; c < 17; c += 1) {
        const celula = XLSX.utils.encode_cell({ r: cabecalho, c });
        ws[celula].s = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "404040" } },
          alignment: { horizontal: "center", vertical: "center", wrapText: true },
          border: {
            top: { style: "thin", color: { rgb: "FFFFFF" } },
            bottom: { style: "thin", color: { rgb: "FFFFFF" } },
          },
        };
      }

      let linhaPlanilha = 5;
      linhas.forEach((linha, index) => {
        const anterior = index > 0 ? linhas[index - 1].modelo : null;
        if (linha.modelo !== anterior) {
          const titulo = XLSX.utils.encode_cell({ r: linhaPlanilha, c: 0 });
          ws[titulo] = {
            v: `MODELO: ${linha.modelo}`,
            s: { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "5B6573" } }, alignment: { horizontal: "left" } },
          };
          for (let c = 1; c < 17; c += 1) {
            const celula = XLSX.utils.encode_cell({ r: linhaPlanilha, c });
            ws[celula] = { v: "", s: { fill: { fgColor: { rgb: "5B6573" } } } };
          }
          linhaPlanilha += 1;
        }

        const row = linhaPlanilha;
        const tipoCor = linha.raw.tipo === "organica" ? "E2F0D9" : linha.raw.tipo === "locada" ? "DDEBF7" : "E4DFEC";
        const situacaoCor = linha.raw.situacao === "baixada" ? "F4CCCC" : linha.raw.situacao === "manutencao" ? "FFF2CC" : linha.raw.situacao === "operando" ? "E2F0D9" : "E7E6E6";
        for (let c = 0; c < 17; c += 1) {
          const celula = XLSX.utils.encode_cell({ r: row, c });
          if (!ws[celula]) ws[celula] = { v: "" };
          ws[celula].s = {
            alignment: { vertical: "center", wrapText: true },
            fill: { fgColor: { rgb: situacaoCor } },
            border: { bottom: { style: "thin", color: { rgb: "D9E1F2" } } },
          };
        }
        ws[XLSX.utils.encode_cell({ r: row, c: 6 })].s.fill = { fgColor: { rgb: tipoCor } };
        ws[XLSX.utils.encode_cell({ r: row, c: 7 })].s.fill = { fgColor: { rgb: situacaoCor } };
        linhaPlanilha += 1;
      });

      ws["!cols"] = [
        { wch: 6 }, { wch: 20 }, { wch: 22 }, { wch: 13 }, { wch: 24 },
        { wch: 16 }, { wch: 15 }, { wch: 16 }, { wch: 18 }, { wch: 26 },
        { wch: 34 }, { wch: 22 }, { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 35 },
      ];
      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 16 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 16 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 16 } },
      ];
      linhaPlanilha = Math.max(linhaPlanilha, 4);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Viaturas");
      XLSX.writeFile(wb, `controle_viaturas_${new Date().toISOString().slice(0, 10)}.xlsx`);
      setSucesso("Excel gerado com sucesso.");
      setSucessoExcel(true);
      setTimeout(() => setSucessoExcel(false), 3000);
    } catch (e) {
      setErro(e.message || "Não foi possível gerar o Excel.");
    } finally {
      setBaixandoExcel(false);
    }
  };

  const exportarPDF = async () => {
    setBaixandoPdf(true);
    setSucessoPdf(false);
    setErro("");
    try {
      const linhas = montarLinhasRelatorio(listaFiltrada);
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const largura = doc.internal.pageSize.getWidth();
      const altura = doc.internal.pageSize.getHeight();
      const margem = 10;
      const gap = 5;
      const cardW = (largura - margem * 2 - gap) / 2;
      const cardH = 67;
      const headerH = 30;
      const agora = new Date();
      const operadorPdf = (() => {
        try {
          const usuario = JSON.parse(localStorage.getItem("log2cia_user") || "{}");
          return [
            usuario?.posto_graduacao || usuario?.posto || usuario?.graduacao,
            usuario?.numeral || usuario?.numero || usuario?.numero_operacional,
            usuario?.nome_guerra || usuario?.nome_de_guerra,
            usuario?.matricula,
          ].filter(Boolean).join(" - ") || "Operador não identificado";
        } catch {
          return "Operador não identificado";
        }
      })();

      const corTipo = (tipo) => {
        if (tipo === "locada") return [221, 235, 247];
        if (tipo === "locada_req") return [228, 223, 236];
        return [226, 240, 217];
      };
      const corSituacao = (situacao) => {
        if (situacao === "baixada") return [244, 204, 204];
        if (situacao === "manutencao") return [255, 242, 204];
        if (situacao === "inativa") return [231, 230, 230];
        return [226, 239, 218];
      };
      const texto = (valor) => String(valor || "—");
      const abreviar = (valor, max = 30) => {
        const t = texto(valor);
        return t.length > max ? `${t.slice(0, max - 1)}…` : t;
      };

      const desenharCabecalho = () => {
        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(14);
        doc.text("LOG2CIA — RELATÓRIO DE VIATURAS", 14, 15);
        doc.setFontSize(9);
        doc.text(
          `Emitido em: ${agora.toLocaleDateString("pt-BR")} às ${agora.toLocaleTimeString("pt-BR")} por: ${operadorPdf}`,
          14,
          21,
        );
      };

      const desenharModelo = (modelo, yAtual) => {
        doc.setFillColor(51, 65, 85);
        doc.roundedRect(margem, yAtual, largura - margem * 2, 7, 1.5, 1.5, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.text(`MODELO: ${modelo}`, margem + 3, yAtual + 4.8);
        doc.setTextColor(0, 0, 0);
        return yAtual + 10;
      };

      const desenharCard = (linha, x, yCard) => {
        doc.setDrawColor(180, 190, 200);
        doc.setLineWidth(0.35);
        doc.setFillColor(250, 251, 252);
        doc.roundedRect(x, yCard, cardW, cardH, 2, 2, "FD");

        // Cabeçalho do card: prefixo + tipo + situação na mesma linha.
        doc.setFillColor(...corSituacao(linha.raw.situacao));
        doc.roundedRect(x + 1, yCard + 1, cardW - 2, 9, 1.5, 1.5, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.7);
        doc.setTextColor(30, 41, 59);
        doc.text(`${linha.ordem}. ${abreviar(linha.identificacao, 17)}`, x + 3, yCard + 6.2);

        doc.setFillColor(...corTipo(linha.raw.tipo));
        doc.roundedRect(x + cardW / 2 - 18, yCard + 2.5, 36, 6, 1.2, 1.2, "F");
        doc.setFontSize(5.8);
        doc.setTextColor(30, 41, 59);
        doc.text(linha.tipo.toUpperCase(), x + cardW / 2, yCard + 6.4, { align: "center" });

        doc.setFontSize(7.2);
        doc.text(linha.situacao.toUpperCase(), x + cardW - 3, yCard + 6.2, { align: "right" });

        const col1 = x + 3;
        const col2 = x + cardW / 2 + 1;
        const valor = (label, val, xx, yy, max = 23) => {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(6.2);
          doc.text(`${label}:`, xx, yy);
          const larguraLabel = doc.getTextWidth(`${label}: `);
          doc.setFont("helvetica", "normal");
          doc.text(abreviar(val, max), xx + larguraLabel, yy);
        };

        valor("Placa", linha.placa, col1, yCard + 18, 15);
        valor("Unidade", linha.unidade, col2, yCard + 18, 20);
        valor("Marca", linha.marca, col1, yCard + 25, 15);
        valor("Ano", linha.raw.ano || "—", col2, yCard + 25, 8);
        valor("KM atual", linha.quilometragem, col1, yCard + 32, 15);

        const situacaoPdf = String(linha.raw.situacao || "").trim().toLowerCase();

        if (situacaoPdf === "operando") {
          valor("Localização", linha.localizacaoAtual, col2, yCard + 32, 20);
          valor("Área de emprego", linha.areaOperacao, col1, yCard + 39, 20);
          valor("Últ. óleo", linha.ultimaTrocaOleo, col2, yCard + 39, 18);
          valor("Próx. óleo", linha.proximaTrocaOleo, col1, yCard + 46, 18);
          valor("Últ. manut.", linha.ultimaManutencao, col2, yCard + 46, 18);
        } else if (situacaoPdf === "baixada") {
          valor("Localização", linha.localizacaoAtual, col2, yCard + 32, 20);
          valor("Oficina", linha.oficina, col1, yCard + 39, 20);
          valor("Data baixa", linha.data, col2, yCard + 39, 18);
          valor("Últ. óleo", linha.ultimaTrocaOleo, col1, yCard + 46, 18);
          valor("Próx. óleo", linha.proximaTrocaOleo, col2, yCard + 46, 18);
          valor("Últ. manut.", linha.ultimaManutencao, col1, yCard + 53, 18);
        } else if (situacaoPdf === "manutencao") {
          valor("Local", linha.localizacaoAtual, col2, yCard + 32, 20);
          valor("Oficina", linha.oficina, col1, yCard + 39, 20);
          valor("Data manut.", linha.data, col2, yCard + 39, 18);
          valor("Últ. óleo", linha.ultimaTrocaOleo, col1, yCard + 46, 18);
          valor("Próx. óleo", linha.proximaTrocaOleo, col2, yCard + 46, 18);
        } else {
          valor("Localização", linha.localizacaoAtual, col2, yCard + 32, 20);
          valor("Últ. óleo", linha.ultimaTrocaOleo, col1, yCard + 39, 18);
          valor("Próx. óleo", linha.proximaTrocaOleo, col2, yCard + 39, 18);
          valor("Últ. manut.", linha.ultimaManutencao, col1, yCard + 46, 18);
        }

        if (["baixada", "manutencao"].includes(situacaoPdf) && linha.motivo) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(6.2);
          doc.text("Motivo:", col1, yCard + 61);
          doc.setFont("helvetica", "normal");
          doc.text(abreviar(linha.motivo, 52), col1 + doc.getTextWidth("Motivo: "), yCard + 61);
        }
        doc.setFont("helvetica", "normal");
        doc.setFontSize(5.4);
        doc.setTextColor(100, 116, 139);
        doc.text(`Última atualização: ${abreviar(linha.atualizadoPor, 55)}`, col1, yCard + 65);
      };

      const desenharResumo = (yAtual) => {
        const alturaResumo = 42;
        if (yAtual + alturaResumo > altura - 10) {
          doc.addPage();
          desenharCabecalho();
          yAtual = headerH;
        }

        doc.setDrawColor(203, 213, 225);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(margem, yAtual, largura - margem * 2, alturaResumo, 2, 2, "FD");
        doc.setTextColor(30, 41, 59);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text("RESUMO GERAL DA FROTA", margem + 4, yAtual + 7);

        const caixas = [
          ["TOTAL", resumo.total, [71, 85, 105]],
          ["OPERANDO", resumo.operando, [22, 101, 52]],
          ["BAIXADAS", resumo.baixadas, [185, 28, 28]],
          ["MANUTENÇÃO", resumo.manutencao, [180, 83, 9]],
          ["INATIVAS", resumo.inativas, [71, 85, 105]],
        ];
        const larguraCaixa = (largura - 28 - 12) / 5;
        caixas.forEach(([label, valor, cor], index) => {
          const xx = 14 + index * (larguraCaixa + 3);
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(226, 232, 240);
          doc.roundedRect(xx, yAtual + 11, larguraCaixa, 13, 1.5, 1.5, "FD");
          doc.setTextColor(...cor);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(5.6);
          doc.text(label, xx + larguraCaixa / 2, yAtual + 16, { align: "center" });
          doc.setFontSize(10);
          doc.text(String(valor), xx + larguraCaixa / 2, yAtual + 21.5, { align: "center" });
        });

        const tipos = `Tipo: Orgânicas ${viaturas.filter((v) => v.tipo === "organica").length}  •  Locadas ${viaturas.filter((v) => v.tipo === "locada").length}  •  Locadas/REQ ${viaturas.filter((v) => v.tipo === "locada_req").length}`;
        doc.setTextColor(71, 85, 105);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.text(tipos, largura / 2, yAtual + 31, { align: "center" });
        doc.text(`Registros exibidos: ${linhas.length}  •  Filtro aplicado: ${filtro === "todos" ? "Todos" : filtro}`, largura / 2, yAtual + 37, { align: "center" });
        return yAtual + alturaResumo;
      };

      let y = headerH;
      let modeloAtual = null;
      let coluna = 0;
      desenharCabecalho();

      for (const linha of linhas) {
        if (linha.modelo !== modeloAtual) {
          if (coluna === 1) {
            y += cardH + gap;
            coluna = 0;
          }
          if (y + 10 > altura - 10) {
            doc.addPage();
            desenharCabecalho();
            y = headerH;
          }
          modeloAtual = linha.modelo;
          y = desenharModelo(modeloAtual, y);
        }

        if (coluna === 0 && y + cardH > altura - 10) {
          doc.addPage();
          desenharCabecalho();
          y = headerH;
          y = desenharModelo(modeloAtual, y);
          coluna = 0;
        }

        const x = margem + coluna * (cardW + gap);
        desenharCard(linha, x, y);
        coluna += 1;
        if (coluna === 2) {
          coluna = 0;
          y += cardH + gap;
        }
      }

      if (coluna === 1) y += cardH + gap;
      y += 2;
      desenharResumo(y);

      const totalPaginas = doc.getNumberOfPages();
      for (let pagina = 1; pagina <= totalPaginas; pagina += 1) {
        doc.setPage(pagina);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(100, 100, 100);
        doc.text(`Página ${pagina} de ${totalPaginas}`, largura - margem, altura - 5, { align: "right" });
      }

      await new Promise((resolve) => setTimeout(resolve, 3000));
      doc.save(`relatorio_viaturas_${agora.toISOString().slice(0, 10)}.pdf`);
      setSucesso("PDF gerado com sucesso.");
      setSucessoPdf(true);
      setTimeout(() => setSucessoPdf(false), 3000);
    } catch (e) {
      setErro(e.message || "Não foi possível gerar o PDF.");
    } finally {
      setBaixandoPdf(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Viaturas</h1>
              <p className="text-sm text-slate-500">Cadastro e controle da frota da unidade.</p>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={exportarExcel} disabled={baixandoExcel || baixandoPdf || carregando} className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${sucessoExcel ? "bg-emerald-800" : "bg-emerald-600 hover:bg-emerald-700"}`} title="Baixar relatório em Excel">
              {baixandoExcel ? <><RefreshCw className="w-4 h-4 animate-spin" /> Gerando...</> : sucessoExcel ? "✓ Relatório Baixado" : <><FileSpreadsheet className="w-4 h-4" /> Excel</>}
            </button>
            <button type="button" onClick={exportarPDF} disabled={baixandoPdf || baixandoExcel || carregando} className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${sucessoPdf ? "bg-rose-800" : "bg-rose-600 hover:bg-rose-700"}`} title="Baixar relatório em PDF">
              {baixandoPdf ? <><RefreshCw className="w-4 h-4 animate-spin" /> Gerando...</> : sucessoPdf ? "✓ Relatório Baixado" : <><FileText className="w-4 h-4" /> PDF</>}
            </button>
            {podeGerenciar && (
              <button type="button" onClick={abrirNovo} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
                <Plus className="w-4 h-4" /> Nova viatura
              </button>
            )}
          </div>
        </div>
      </div>

      {erro && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{erro}</div>}
      {sucesso && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{sucesso}</div>}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ["Total", resumo.total, "text-slate-800"],
          ["Operando", resumo.operando, "text-emerald-700"],
          ["Baixadas", resumo.baixadas, "text-rose-700"],
          ["Manutenção", resumo.manutencao, "text-amber-700"],
          ["Inativas", resumo.inativas, "text-slate-500"],
        ].map(([titulo, valor, classe]) => (
          <div key={titulo} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</div>
            <div className={`mt-1 text-2xl font-bold ${classe}`}>{valor}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por identificação, placa, unidade, marca, modelo, oficina..." className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
          </div>
          <button type="button" onClick={carregar} disabled={carregando} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${carregando ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
          {[
            ["todos", "Todos", "border-slate-200 bg-slate-50 text-slate-700"],
            ["organica", "Orgânicas", "border-emerald-200 bg-emerald-50 text-emerald-700"],
            ["locada", "Locadas", "border-sky-200 bg-sky-50 text-sky-700"],
            ["locada_req", "Locadas/REQ", "border-violet-200 bg-violet-50 text-violet-700"],
            ["operando", "Operando", "border-emerald-200 bg-emerald-50 text-emerald-700"],
            ["baixada", "Baixadas", "border-rose-200 bg-rose-50 text-rose-700"],
            ["manutencao", "Manutenção", "border-amber-200 bg-amber-50 text-amber-700"],
            ["inativa", "Inativas", "border-slate-300 bg-slate-100 text-slate-600"],
          ].map(([valor, label, classes]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setFiltro(valor)}
              className={`rounded-full border px-3 py-1.5 transition-all ${classes} ${filtro === valor ? "ring-2 ring-blue-200 shadow-sm" : "opacity-80 hover:opacity-100"}`}
            >
              {label}
            </button>
          ))}
          {filtro !== "todos" && (
            <button type="button" onClick={() => setFiltro("todos")} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-500 hover:bg-slate-50">
              Limpar filtro
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {carregando ? (
          <div className="p-8 text-center text-sm text-slate-500">Carregando viaturas...</div>
        ) : listaFiltrada.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">Nenhuma viatura encontrada.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-center p-3 font-semibold text-slate-600">ORD</th>
                  <th className="text-left p-3 font-semibold text-slate-600">MODELO</th>
                  <th className="text-left p-3 font-semibold text-slate-600">PLACA</th>
                  <th className="text-left p-3 font-semibold text-slate-600">PREFIXO</th>
                  <th className="text-left p-3 font-semibold text-slate-600">TIPO</th>
                  <th className="text-left p-3 font-semibold text-slate-600">SITUAÇÃO</th>
                  <th className="text-left p-3 font-semibold text-slate-600">LOCALIZAÇÃO / ÁREA</th>
                  <th className="text-left p-3 font-semibold text-slate-600">MOTIVO / OFICINA</th>
                  <th className="text-right p-3 font-semibold text-slate-600">AÇÕES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {listaFiltrada.map((viatura, index) => (
                  <tr key={viatura.id} className={`hover:bg-slate-50 ${classeLinha(viatura)}`}>
                    <td className="p-3 text-center font-bold text-slate-500">{index + 1}</td>
                    <td className="p-3 font-bold text-slate-800 whitespace-nowrap">
                      {viatura.modelo || "—"}
                      <div className="text-[11px] font-normal text-slate-400">{viatura.marca || ""}</div>
                    </td>
                    <td className="p-3 font-mono text-slate-700 whitespace-nowrap">{viatura.placa}</td>
                    <td className="p-3 font-bold text-slate-800 whitespace-nowrap">
                      {viatura.identificacao}
                      <div className="text-[11px] font-normal text-slate-400">{viatura.unidade}</div>
                    </td>
                    <td className="p-3"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${classeTipo(viatura.tipo)}`}>{tipoLabel(viatura.tipo)}</span></td>
                    <td className="p-3"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${classeSituacao(viatura.situacao)}`}>{situacaoLabel(viatura.situacao)}</span></td>
                    <td className="p-3 text-slate-700">
                      <div className="font-medium">{localizacaoTexto(viatura)}</div>
                      {viatura.situacao === "operando" && viatura.localizacao_atual && <div className="text-xs text-slate-400">{viatura.localizacao_atual}</div>}
                    </td>
                    <td className="p-3 text-slate-600">
                      <div className="font-medium">{motivoTexto(viatura)}</div>
                      {viatura.situacao === "baixada" && <div className="text-xs text-slate-400">Baixa: {dataBR(viatura.data_baixa)} {viatura.oficina ? `• ${viatura.oficina}` : ""}</div>}
                      {viatura.situacao === "manutencao" && <div className="text-xs text-slate-400">Início: {dataBR(viatura.data_manutencao)} {viatura.oficina ? `• ${viatura.oficina}` : ""}</div>}
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1.5">
                        <button type="button" onClick={() => setViaturaSelecionada(viatura)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200" title="Visualizar viatura">
                          <Eye className="w-3.5 h-3.5" /> Visualizar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viaturaSelecionada && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto"
          onClick={(e) => { if (e.target === e.currentTarget) setViaturaSelecionada(null); }}
        >
          <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl border border-slate-200 my-8">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-slate-800">Detalhes da viatura</h2>
                <p className="text-xs text-slate-500 mt-0.5">Consulta dos dados cadastrais, operacionais e de manutenção.</p>
              </div>
              <button type="button" onClick={() => setViaturaSelecionada(null)} className="text-slate-400 hover:text-slate-700 text-xl">×</button>
            </div>
            <div className="p-5 space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${classeTipo(viaturaSelecionada.tipo)}`}>{tipoLabel(viaturaSelecionada.tipo)}</span>
                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${classeSituacao(viaturaSelecionada.situacao)}`}>{situacaoLabel(viaturaSelecionada.situacao)}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                  ["Identificação / Prefixo", viaturaSelecionada.identificacao],
                  ["Placa", viaturaSelecionada.placa],
                  ["Unidade", viaturaSelecionada.unidade],
                  ["Marca / Modelo", `${viaturaSelecionada.marca || "—"} / ${viaturaSelecionada.modelo || "—"}`],
                  ["Ano", viaturaSelecionada.ano || "—"],
                  ["Quilometragem atual", viaturaSelecionada.quilometragem_atual != null ? `${viaturaSelecionada.quilometragem_atual} km` : "—"],
                  ["Localização", localizacaoTexto(viaturaSelecionada)],
                  ["Área operacional", viaturaSelecionada.area_operacao || "—"],
                  ["Oficina", viaturaSelecionada.oficina || "—"],
                  ["Data baixa/manutenção", viaturaSelecionada.situacao === "baixada" ? dataBR(viaturaSelecionada.data_baixa) : viaturaSelecionada.situacao === "manutencao" ? dataBR(viaturaSelecionada.data_manutencao) : "—"],
                  ["Motivo", motivoTexto(viaturaSelecionada)],
                  ["KM última troca de óleo", viaturaSelecionada.km_ultima_troca_oleo != null ? `${viaturaSelecionada.km_ultima_troca_oleo} km` : "—"],
                  ["Data última troca de óleo", dataBR(viaturaSelecionada.data_ultima_troca_oleo)],
                  ["KM próxima troca de óleo", viaturaSelecionada.km_proxima_troca_oleo != null ? `${viaturaSelecionada.km_proxima_troca_oleo} km` : "—"],
                  ["Data última manutenção", dataBR(viaturaSelecionada.data_ultima_manutencao)],
                  ["KM última manutenção", viaturaSelecionada.km_ultima_manutencao != null ? `${viaturaSelecionada.km_ultima_manutencao} km` : "—"],
                  ["Última atualização por", viaturaSelecionada.atualizado_por_nome || viaturaSelecionada.atualizado_por || "Não registrado"],
                ].map(([titulo, valor]) => (
                  <div key={titulo} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{titulo}</div>
                    <div className="mt-1 text-sm font-semibold text-slate-700">{valor || "—"}</div>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Observações</div>
                <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{viaturaSelecionada.observacoes || "Nenhuma observação registrada."}</p>
              </div>
              {podeGerenciar && (
                <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                  <button type="button" onClick={() => { setViaturaSelecionada(null); abrirEdicao(viaturaSelecionada); }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                    <Pencil className="w-4 h-4" /> Editar
                  </button>
                  <button type="button" onClick={() => excluir(viaturaSelecionada)} disabled={excluindo === viaturaSelecionada.id} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50">
                    <Trash2 className="w-4 h-4" /> {excluindo === viaturaSelecionada.id ? "Excluindo..." : "Excluir"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 md:p-4">
          <div className="w-full max-w-5xl max-h-[92vh] overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 flex flex-col">
            <div className="shrink-0 flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <div>
                <h2 className="text-base font-bold text-slate-800">{editando ? "Editar viatura" : "Nova viatura"}</h2>
                <p className="text-xs text-slate-500 mt-0.5">Cadastro e controle operacional da frota.</p>
              </div>
              <button type="button" onClick={fecharModal} disabled={salvando} className="text-slate-400 hover:text-slate-700 text-xl">×</button>
            </div>

            <form onSubmit={salvar} className="min-h-0 flex flex-col">
              <div className="min-h-0 overflow-y-auto p-5 space-y-3">
                <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <label className="space-y-1">
                      <span className="text-xs font-bold text-slate-700">Situação da viatura *</span>
                      <select value={formulario.situacao} onChange={(e) => alterarSituacao(e.target.value)} className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                        {SITUACOES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-slate-600">Tipo *</span>
                      <select value={formulario.tipo} onChange={(e) => alterar("tipo", e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                        {TIPOS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1 sm:col-span-2 lg:col-span-2">
                      <span className="text-xs font-semibold text-slate-600">Unidade *</span>
                      <input required value={formulario.unidade} onChange={(e) => alterar("unidade", e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <label className="space-y-1 lg:col-span-1"><span className="text-xs font-semibold text-slate-600">Identificação / Prefixo *</span><input required value={formulario.identificacao} onChange={(e) => alterar("identificacao", e.target.value)} placeholder="RP 01 / CP 02" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
                  <label className="space-y-1"><span className="text-xs font-semibold text-slate-600">Placa *</span><input required value={formulario.placa} onChange={(e) => alterar("placa", e.target.value)} placeholder="OIF2817" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
                  <label className="space-y-1"><span className="text-xs font-semibold text-slate-600">Marca *</span><input required value={formulario.marca} onChange={(e) => alterar("marca", e.target.value)} placeholder="CHEVROLET" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
                  <label className="space-y-1"><span className="text-xs font-semibold text-slate-600">Modelo *</span><input required value={formulario.modelo} onChange={(e) => alterar("modelo", e.target.value)} placeholder="TRAIL BLAZER" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
                  <label className="space-y-1"><span className="text-xs font-semibold text-slate-600">Ano</span><input type="number" min="1900" max="2100" value={formulario.ano} onChange={(e) => alterar("ano", e.target.value)} placeholder="2024" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
                </div>

                <div className={`rounded-xl border p-3 space-y-3 ${formulario.situacao === "operando" ? "border-emerald-100 bg-emerald-50/50" : formulario.situacao === "baixada" ? "border-rose-100 bg-rose-50/50" : formulario.situacao === "manutencao" ? "border-amber-100 bg-amber-50/50" : "border-slate-200 bg-slate-50/70"}`}>
                  <div className="text-sm font-bold text-slate-800">Localização atual</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-slate-600">Onde está *</span>
                      <select
                        value={formulario.situacao === "manutencao" ? "Pátio da oficina" : (["Pátio da CIA"].includes(formulario.localizacao_atual) ? "Pátio da CIA" : "Outro")}
                        onChange={(e) => alterar("localizacao_atual", e.target.value === "Outro" ? "" : e.target.value)}
                        disabled={formulario.situacao === "manutencao"}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-amber-50 disabled:text-amber-800"
                      >
                        {(formulario.situacao === "manutencao" ? ["Pátio da oficina"] : LOCALIZACOES_PADRAO).map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </label>
                    {formulario.situacao !== "manutencao" ? (
                      <label className="space-y-1">
                        <span className="text-xs font-semibold text-slate-600">Detalhamento da localização</span>
                        <input
                          value={formulario.localizacao_atual === "Pátio da CIA" || formulario.localizacao_atual === "Pátio da oficina" ? "" : formulario.localizacao_atual}
                          onChange={(e) => alterar("localizacao_atual", e.target.value)}
                          disabled={formulario.localizacao_atual === "Pátio da CIA" || formulario.localizacao_atual === "Pátio da oficina"}
                          placeholder="Informe a localização"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none disabled:bg-slate-100 disabled:text-slate-400"
                        />
                      </label>
                    ) : (
                      <div className="rounded-lg border border-amber-100 bg-white px-3 py-2 text-sm text-amber-800">A viatura está no pátio da oficina durante a manutenção.</div>
                    )}
                  </div>
                  {formulario.situacao === "operando" && (
                    <label className="space-y-1 block">
                      <span className="text-xs font-semibold text-slate-600">Área / destino operacional</span>
                      <input value={formulario.area_operacao} onChange={(e) => alterar("area_operacao", e.target.value)} placeholder="Cascavel, P2, Patrulhamento Rural" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                    </label>
                  )}
                </div>

                {(formulario.situacao === "baixada" || formulario.situacao === "manutencao") && (
                  <div className={`rounded-xl border p-3 space-y-3 ${formulario.situacao === "baixada" ? "border-rose-100 bg-rose-50/50" : "border-amber-100 bg-amber-50/50"}`}>
                    <div className={`text-sm font-bold ${formulario.situacao === "baixada" ? "text-rose-800" : "text-amber-800"}`}>{formulario.situacao === "baixada" ? "Dados da baixa" : "Dados da manutenção"}</div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <label className="space-y-1"><span className="text-xs font-semibold text-slate-600">Data *</span><input type="date" required value={formulario.situacao === "baixada" ? formulario.data_baixa : formulario.data_manutencao} onChange={(e) => alterar(formulario.situacao === "baixada" ? "data_baixa" : "data_manutencao", e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
                      <label className="space-y-1 md:col-span-2"><span className="text-xs font-semibold text-slate-600">Oficina / local</span><input value={formulario.oficina} onChange={(e) => alterar("oficina", e.target.value)} placeholder="BEBERIBE / PÁTIO DA CIA" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
                    </div>
                    <label className="space-y-1 block"><span className="text-xs font-semibold text-slate-600">{formulario.situacao === "baixada" ? "Motivo da baixa" : "Motivo da manutenção"}</span><textarea rows="2" value={formulario.situacao === "baixada" ? formulario.motivo_baixa : formulario.motivo_manutencao} onChange={(e) => alterar(formulario.situacao === "baixada" ? "motivo_baixa" : "motivo_manutencao", e.target.value)} placeholder="Vazamento no cárter / troca de óleo / pneus" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none resize-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
                  </div>
                )}

                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-3">
                  <div className="text-sm font-bold text-slate-800">Controle de quilometragem e manutenção</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <label className="space-y-1"><span className="text-xs font-semibold text-slate-600">Quilometragem atual</span><input type="number" min="0" step="0.1" value={formulario.quilometragem_atual} onChange={(e) => alterar("quilometragem_atual", e.target.value)} placeholder="125430" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
                    <label className="space-y-1"><span className="text-xs font-semibold text-slate-600">KM última troca de óleo</span><input type="number" min="0" step="0.1" value={formulario.km_ultima_troca_oleo} onChange={(e) => alterar("km_ultima_troca_oleo", e.target.value)} placeholder="120000" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
                    <label className="space-y-1"><span className="text-xs font-semibold text-slate-600">Data última troca de óleo</span><input type="date" value={formulario.data_ultima_troca_oleo} onChange={(e) => alterar("data_ultima_troca_oleo", e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
                    <label className="space-y-1"><span className="text-xs font-semibold text-slate-600">KM próxima troca de óleo</span><input type="number" min="0" step="0.1" value={formulario.km_proxima_troca_oleo} onChange={(e) => alterar("km_proxima_troca_oleo", e.target.value)} placeholder="125000" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
                    <label className="space-y-1"><span className="text-xs font-semibold text-slate-600">Data última manutenção</span><input type="date" value={formulario.data_ultima_manutencao} onChange={(e) => alterar("data_ultima_manutencao", e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
                    <label className="space-y-1"><span className="text-xs font-semibold text-slate-600">KM última manutenção</span><input type="number" min="0" step="0.1" value={formulario.km_ultima_manutencao} onChange={(e) => alterar("km_ultima_manutencao", e.target.value)} placeholder="118000" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
                  </div>
                </div>

                <label className="space-y-1 block"><span className="text-xs font-semibold text-slate-600">Observações</span><textarea rows="2" value={formulario.observacoes} onChange={(e) => alterar("observacoes", e.target.value)} placeholder="Observações sobre a viatura..." className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none resize-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
              </div>

              <div className="shrink-0 flex justify-end gap-2 border-t border-slate-100 bg-white px-5 py-3">
                <button type="button" onClick={fecharModal} disabled={salvando} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
                <button type="submit" disabled={salvando} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{salvando ? "Salvando..." : "Salvar"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
