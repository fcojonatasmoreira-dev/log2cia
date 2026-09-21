import { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "../lib/supabaseClient";

function formatarTipo(texto) {
  if (!texto) return "Armamento";
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export default function ModalDetalhesArma({
  arma,
  userRole,
  onClose,
  onUpdateSuccess,
}) {
  const printRef = useRef();

  // Verifica o nível de permissão baseado no userRole passado ou recuperado do localStorage
  const [podeEditar, setPodeEditar] = useState(false);
  const [modoEdicao, setModoEdicao] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [mensagem, setMensagem] = useState(null);
  const [mostrarQrCodeModal, setMostrarQrCodeModal] = useState(false);

  // Campos do formulário
  const [tipo, setTipo] = useState(arma?.tipo || "armamento");
  const [modelo, setModelo] = useState(
    arma?.modelo_descricao || arma?.modelo || "",
  );
  const [numSerie, setNumSerie] = useState(
    arma?.num_serie || arma?.numero_serie || "",
  );
  const [patrimonio, setPatrimonio] = useState(arma?.patrimonio || "");
  const [calibre, setCalibre] = useState(
    arma?.detalhes?.calibre || arma?.calibre || "",
  );
  const [status, setStatus] = useState(arma?.status || "disponivel");
  const [localizacao, setLocalizacao] = useState(
    arma?.detalhes?.localizacao_atual || "Estoque da Reserva",
  );
  const [estadoConservacao, setEstadoConservacao] = useState(
    arma?.detalhes?.estado_conservacao || "Bom",
  );

  // Fotos atuais e novos arquivos
  const [fotoArmaUrl, setFotoArmaUrl] = useState(
    arma?.detalhes?.foto_arma_url || "",
  );
  const [fotoNumeracaoUrl, setFotoNumeracaoUrl] = useState(
    arma?.detalhes?.foto_numeracao_url || "",
  );
  const [arquivoArma, setArquivoArma] = useState(null);
  const [arquivoNumeracao, setArquivoNumeracao] = useState(null);

  useEffect(() => {
    let cargo = userRole;
    if (!cargo) {
      try {
        const usuarioSalvo = localStorage.getItem("log2cia_user");
        if (usuarioSalvo) {
          const parsed = JSON.parse(usuarioSalvo);
          cargo = parsed?.role;
        }
      } catch (e) {
        console.error("Erro ao ler role do storage:", e);
      }
    }

    const nivel = String(cargo || "").toLowerCase();
    if (nivel === "p4" || nivel === "master") {
      setPodeEditar(true);
    } else {
      setPodeEditar(false);
    }
  }, [userRole]);

  if (!arma) return null;

  async function fazerUploadImagem(file, prefixo) {
    if (!file) return null;
    const fileExt = file.name.split(".").pop();
    const fileName = `${prefixo}_${Date.now()}.${fileExt}`;
    const filePath = `equipamentos/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("documentos-segurança")
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage
      .from("documentos-segurança")
      .getPublicUrl(filePath);

    return publicUrlData.publicUrl;
  }

  const handleSalvarEdicao = async () => {
    if (!podeEditar) {
      alert("Acesso negado: Apenas P4 ou Master podem editar equipamentos.");
      return;
    }

    setSalvando(true);
    setMensagem(null);

    try {
      let novaFotoArma = fotoArmaUrl;
      let novaFotoNum = fotoNumeracaoUrl;

      if (arquivoArma) {
        novaFotoArma = await fazerUploadImagem(arquivoArma, "arma");
      }
      if (arquivoNumeracao) {
        novaFotoNum = await fazerUploadImagem(arquivoNumeracao, "num");
      }

      const payload = {
        tipo: tipo.toLowerCase(),
        modelo_descricao: modelo,
        num_serie: numSerie,
        patrimonio: patrimonio,
        status: status,
        detalhes: {
          ...(arma.detalhes || {}),
          calibre: calibre,
          localizacao_atual: localizacao,
          estado_conservacao: estadoConservacao,
          foto_arma_url: novaFotoArma,
          foto_numeracao_url: novaFotoNum,
        },
      };

      const { error } = await supabase
        .from("equipamentos")
        .update(payload)
        .eq("id", arma.id);

      if (error) throw error;

      setMensagem({
        tipo: "sucesso",
        texto: "Equipamento atualizado com sucesso!",
      });

      setTimeout(() => {
        setModoEdicao(false);
        setMensagem(null);
        if (onUpdateSuccess) onUpdateSuccess();
      }, 1000);
    } catch (err) {
      setMensagem({ tipo: "erro", texto: "Erro ao salvar: " + err.message });
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluirArmamento = async () => {
    if (!podeEditar) {
      alert("Acesso negado: Apenas P4 ou Master podem excluir equipamentos.");
      return;
    }

    if (
      !confirm(
        `Confirma a exclusão permanentemente deste equipamento (${modelo} - Série: ${numSerie})? Esta ação não pode ser desfeita.`,
      )
    ) {
      return;
    }

    setExcluindo(true);
    try {
      const { error } = await supabase
        .from("equipamentos")
        .delete()
        .eq("id", arma.id);

      if (error) throw error;

      alert("Equipamento excluído com sucesso!");
      if (onUpdateSuccess) onUpdateSuccess();
      onClose();
    } catch (err) {
      alert("Erro ao excluir equipamento: " + err.message);
    } finally {
      setExcluindo(false);
    }
  };

  const handleImprimir = () => {
    const conteudoEtiqueta = printRef.current.innerHTML;
    const janela = window.open("", "", "width=400,height=450");
    janela.document.write(`
      <html>
        <head>
          <title>Imprimir Etiqueta - ${numSerie}</title>
          <style>
            body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .etiqueta { border: 2px solid #000; padding: 12px; border-radius: 8px; text-align: center; width: 180px; }
            .titulo { font-size: 11px; font-weight: bold; text-transform: uppercase; margin-bottom: 6px; }
            .serie { font-size: 13px; font-weight: bold; margin-top: 6px; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          ${conteudoEtiqueta}
        </body>
      </html>
    `);
    janela.document.close();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-gray-100 space-y-3 my-auto max-h-[90vh] overflow-y-auto">
        {/* Cabeçalho */}
        <div className="flex justify-between items-center border-b pb-2">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-gray-800">
              Ficha do Equipamento / Armamento
            </h2>
            {/* O botão Editar aparece se podeEditar for true (P4 ou Master) */}
            {podeEditar && !modoEdicao && (
              <button
                type="button"
                onClick={() => setModoEdicao(true)}
                className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-md font-bold border border-blue-200 transition-all flex items-center gap-1"
              >
                ✏️ Editar
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 font-bold text-base p-1"
          >
            ✕
          </button>
        </div>

        {mensagem && (
          <div
            className={`p-2 rounded-lg text-xs text-center font-bold ${
              mensagem.tipo === "erro"
                ? "bg-red-100 text-red-700"
                : "bg-green-100 text-green-700"
            }`}
          >
            {mensagem.texto}
          </div>
        )}

        {/* Formulário / Exibição compacta */}
        <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
          <div>
            <label className="text-gray-500 block uppercase font-semibold text-[10px]">
              Tipo
            </label>
            {modoEdicao ? (
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="w-full p-1 mt-0.5 bg-white border border-gray-300 rounded text-xs font-bold outline-none"
              >
                <option value="armamento">Armamento</option>
                <option value="colete">Colete</option>
                <option value="municao">Munição</option>
              </select>
            ) : (
              <span className="font-bold text-gray-800 text-xs block mt-0.5">
                {formatarTipo(tipo)}
              </span>
            )}
          </div>

          <div>
            <label className="text-gray-500 block uppercase font-semibold text-[10px]">
              Modelo / Descrição
            </label>
            {modoEdicao ? (
              <input
                type="text"
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
                className="w-full p-1 mt-0.5 bg-white border border-gray-300 rounded text-xs font-bold outline-none"
              />
            ) : (
              <span className="font-bold text-gray-800 text-xs block mt-0.5">
                {modelo || "N/I"}
              </span>
            )}
          </div>

          <div>
            <label className="text-gray-500 block uppercase font-semibold text-[10px]">
              Nº de Série
            </label>
            {modoEdicao ? (
              <input
                type="text"
                value={numSerie}
                onChange={(e) => setNumSerie(e.target.value)}
                className="w-full p-1 mt-0.5 bg-white border border-gray-300 rounded text-xs font-bold outline-none"
              />
            ) : (
              <span className="font-bold text-gray-800 text-xs block mt-0.5 font-mono">
                {numSerie || "N/I"}
              </span>
            )}
          </div>

          <div>
            <label className="text-gray-500 block uppercase font-semibold text-[10px]">
              Calibre
            </label>
            {modoEdicao ? (
              <input
                type="text"
                value={calibre}
                onChange={(e) => setCalibre(e.target.value)}
                className="w-full p-1 mt-0.5 bg-white border border-gray-300 rounded text-xs font-bold outline-none"
              />
            ) : (
              <span className="font-bold text-gray-800 text-xs block mt-0.5">
                {calibre || "N/I"}
              </span>
            )}
          </div>

          <div>
            <label className="text-gray-500 block uppercase font-semibold text-[10px]">
              Tombo / Patrimônio
            </label>
            {modoEdicao ? (
              <input
                type="text"
                value={patrimonio}
                onChange={(e) => setPatrimonio(e.target.value)}
                className="w-full p-1 mt-0.5 bg-white border border-gray-300 rounded text-xs font-bold outline-none"
              />
            ) : (
              <span className="font-bold text-gray-800 text-xs block mt-0.5 font-mono">
                {patrimonio || "N/I"}
              </span>
            )}
          </div>

          <div>
            <label className="text-gray-500 block uppercase font-semibold text-[10px]">
              Status
            </label>
            {modoEdicao ? (
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full p-1 mt-0.5 bg-white border border-gray-300 rounded text-xs font-bold outline-none"
              >
                <option value="disponivel">Disponível</option>
                <option value="cautelado">Cautelado</option>
                <option value="manutencao">Manutenção</option>
              </select>
            ) : (
              <span
                className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold mt-0.5 ${
                  status === "disponivel"
                    ? "bg-green-100 text-green-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {status === "disponivel" ? "Disponível" : status}
              </span>
            )}
          </div>

          <div>
            <label className="text-gray-500 block uppercase font-semibold text-[10px]">
              Localização Atual
            </label>
            {modoEdicao ? (
              <select
                value={localizacao}
                onChange={(e) => setLocalizacao(e.target.value)}
                className="w-full p-1 mt-0.5 bg-white border border-gray-300 rounded text-xs font-bold outline-none"
              >
                <option value="Estoque da Reserva">Estoque da Reserva</option>
                <option value="Acautelada com Policial">
                  Acautelada com Policial
                </option>
                <option value="Apreendida">Apreendida</option>
                <option value="Em Perícia">Em Perícia</option>
                <option value="Manutenção">Manutenção</option>
              </select>
            ) : (
              <span className="font-bold text-gray-800 text-xs block mt-0.5">
                {localizacao}
              </span>
            )}
          </div>

          <div>
            <label className="text-gray-500 block uppercase font-semibold text-[10px]">
              Estado de Conservação
            </label>
            {modoEdicao ? (
              <select
                value={estadoConservacao}
                onChange={(e) => setEstadoConservacao(e.target.value)}
                className="w-full p-1 mt-0.5 bg-white border border-gray-300 rounded text-xs font-bold outline-none"
              >
                <option value="Novo">Novo</option>
                <option value="Bom">Bom</option>
                <option value="Regular">Regular</option>
                <option value="Danificado">Danificado</option>
                <option value="Manutenção">Em Manutenção</option>
              </select>
            ) : (
              <span className="font-bold text-gray-800 text-xs block mt-0.5">
                {estadoConservacao}
              </span>
            )}
          </div>
        </div>

        {/* Seção de Fotos */}
        {modoEdicao ? (
          <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 p-2.5 rounded-lg border">
            <div>
              <label className="block font-bold text-gray-700 uppercase text-[10px] mb-1">
                Foto da Arma
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setArquivoArma(e.target.files[0])}
                className="w-full text-[10px] text-gray-500 file:mr-1 file:py-1 file:px-2 file:rounded file:border-0 file:text-[10px] file:font-semibold file:bg-blue-50 file:text-blue-700"
              />
            </div>
            <div>
              <label className="block font-bold text-gray-700 uppercase text-[10px] mb-1">
                Foto Numeração
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setArquivoNumeracao(e.target.files[0])}
                className="w-full text-[10px] text-gray-500 file:mr-1 file:py-1 file:px-2 file:rounded file:border-0 file:text-[10px] file:font-semibold file:bg-blue-50 file:text-blue-700"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div className="text-center bg-gray-50 p-2 rounded-lg border">
              <span className="text-[10px] font-bold uppercase text-gray-500 block mb-1">
                Foto Geral da Arma
              </span>
              {fotoArmaUrl ? (
                <a href={fotoArmaUrl} target="_blank" rel="noreferrer">
                  <img
                    src={fotoArmaUrl}
                    alt="Arma"
                    className="h-20 w-full object-cover rounded-md hover:opacity-90 transition-all"
                  />
                </a>
              ) : (
                <span className="text-[10px] text-gray-400 italic block py-4">
                  Sem foto
                </span>
              )}
            </div>
            <div className="text-center bg-gray-50 p-2 rounded-lg border">
              <span className="text-[10px] font-bold uppercase text-gray-500 block mb-1">
                Numeração / Série
              </span>
              {fotoNumeracaoUrl ? (
                <a href={fotoNumeracaoUrl} target="_blank" rel="noreferrer">
                  <img
                    src={fotoNumeracaoUrl}
                    alt="Numeração"
                    className="h-20 w-full object-cover rounded-md hover:opacity-90 transition-all"
                  />
                </a>
              ) : (
                <span className="text-[10px] text-gray-400 italic block py-4">
                  Sem foto
                </span>
              )}
            </div>
          </div>
        )}

        {/* Botão de Exibição de QR Code Ocultável */}
        <div className="text-center">
          <button
            type="button"
            onClick={() => setMostrarQrCodeModal(!mostrarQrCodeModal)}
            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg border border-slate-300 transition-all w-full"
          >
            {mostrarQrCodeModal
              ? "▲ Ocultar Etiqueta / QR Code"
              : "▼ Gerar / Exibir Etiqueta e QR Code"}
          </button>

          {mostrarQrCodeModal && (
            <div className="flex flex-col items-center justify-center p-3 mt-2 bg-gray-100 rounded-xl border border-dashed border-gray-300">
              <div ref={printRef}>
                <div className="etiqueta bg-white border-2 border-black p-3 rounded-lg text-center shadow-sm">
                  <div className="titulo text-[10px] font-bold uppercase tracking-wider text-black">
                    {formatarTipo(tipo)} - {modelo}
                  </div>
                  <div className="my-2 flex justify-center">
                    <QRCodeSVG value={arma.id} size={110} level="M" />
                  </div>
                  <div className="serie text-xs font-black text-black font-mono">
                    SÉR: {numSerie}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Ações e Botão Excluir (Disponível para P4 e Master) */}
        <div className="flex flex-col gap-2 pt-2 border-t">
          <div className="flex gap-2">
            {modoEdicao ? (
              <>
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => setModoEdicao(false)}
                  className="w-1/3 py-2 bg-gray-200 text-gray-700 font-bold text-xs rounded-lg hover:bg-gray-300"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={salvando}
                  onClick={handleSalvarEdicao}
                  className="w-2/3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow disabled:opacity-50"
                >
                  {salvando ? "Salvando..." : "Salvar Alterações"}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-1/3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold text-xs rounded-lg"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={handleImprimir}
                  className="w-2/3 py-2 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-lg shadow flex items-center justify-center gap-2"
                >
                  <span>🖨️ Imprimir Etiqueta</span>
                </button>
              </>
            )}
          </div>

          {/* Botão de Excluir visível para P4 e Master */}
          {podeEditar && !modoEdicao && (
            <button
              type="button"
              disabled={excluindo}
              onClick={handleExcluirArmamento}
              className="w-full py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-lg border border-rose-200 transition-all flex items-center justify-center gap-1.5"
            >
              <span>
                🗑️{" "}
                {excluindo ? "Excluindo..." : "Excluir Equipamento do Acervo"}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
