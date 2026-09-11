import { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "../lib/supabaseClient";

function formatarTipo(texto) {
  if (!texto) return "Armamento";
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export default function ModalDetalhesArma({ arma, onClose, onUpdateSuccess }) {
  const printRef = useRef();

  // Permissões e estados de edição
  const [podeEditar, setPodeEditar] = useState(true); // Habilitado para teste/uso direto
  const [modoEdicao, setModoEdicao] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState(null);

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

  useEffect(() => {
    async function checarPermissoes() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        // Busca genérica sem falhar por colunas inexistentes
        const { data: perfil } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        if (perfil) {
          const nivel = (
            perfil.role ||
            perfil.perfil_acesso ||
            perfil.tipo_usuario ||
            ""
          ).toLowerCase();
          if (nivel === "p4" || nivel === "master" || perfil.is_admin) {
            setPodeEditar(true);
          }
        }
      } catch (err) {
        console.warn("Usando permissão padrão para edição:", err);
      }
    }
    checarPermissoes();
  }, []);

  if (!arma) return null;

  const handleSalvarEdicao = async () => {
    setSalvando(true);
    setMensagem(null);

    try {
      const payload = {
        tipo: tipo.toLowerCase(),
        modelo_descricao: modelo,
        num_serie: numSerie,
        patrimonio: patrimonio,
        status: status,
        detalhes: { ...(arma.detalhes || {}), calibre: calibre },
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-gray-100 space-y-4">
        {/* Cabeçalho */}
        <div className="flex justify-between items-center border-b pb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-gray-800">
              Ficha do Armamento
            </h2>
            {podeEditar && !modoEdicao && (
              <button
                type="button"
                onClick={() => setModoEdicao(true)}
                className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-2.5 py-1 rounded-md font-bold border border-blue-200 transition-all flex items-center gap-1"
              >
                ✏️ Editar
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 font-bold text-lg p-1"
          >
            ✕
          </button>
        </div>

        {mensagem && (
          <div
            className={`p-2.5 rounded-lg text-xs text-center font-bold ${
              mensagem.tipo === "erro"
                ? "bg-red-100 text-red-700"
                : "bg-green-100 text-green-700"
            }`}
          >
            {mensagem.texto}
          </div>
        )}

        {/* Formulário / Exibição */}
        <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
          <div>
            <label className="text-gray-500 block uppercase font-semibold">
              Tipo
            </label>
            {modoEdicao ? (
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="w-full p-1.5 mt-0.5 bg-white border border-gray-300 rounded text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="armamento">Armamento</option>
                <option value="colete">Colete</option>
                <option value="municao">Munição</option>
              </select>
            ) : (
              <span className="font-bold text-gray-800 text-sm block mt-1">
                {formatarTipo(tipo)}
              </span>
            )}
          </div>

          <div>
            <label className="text-gray-500 block uppercase font-semibold">
              Modelo / Descrição
            </label>
            {modoEdicao ? (
              <input
                type="text"
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
                className="w-full p-1.5 mt-0.5 bg-white border border-gray-300 rounded text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
              />
            ) : (
              <span className="font-bold text-gray-800 text-sm block mt-1">
                {modelo || "N/I"}
              </span>
            )}
          </div>

          <div>
            <label className="text-gray-500 block uppercase font-semibold">
              Nº de Série
            </label>
            {modoEdicao ? (
              <input
                type="text"
                value={numSerie}
                onChange={(e) => setNumSerie(e.target.value)}
                className="w-full p-1.5 mt-0.5 bg-white border border-gray-300 rounded text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
              />
            ) : (
              <span className="font-bold text-gray-800 text-sm block mt-1">
                {numSerie || "N/I"}
              </span>
            )}
          </div>

          <div>
            <label className="text-gray-500 block uppercase font-semibold">
              Calibre
            </label>
            {modoEdicao ? (
              <input
                type="text"
                value={calibre}
                onChange={(e) => setCalibre(e.target.value)}
                className="w-full p-1.5 mt-0.5 bg-white border border-gray-300 rounded text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
              />
            ) : (
              <span className="font-bold text-gray-800 text-sm block mt-1">
                {calibre || "N/I"}
              </span>
            )}
          </div>

          <div>
            <label className="text-gray-500 block uppercase font-semibold">
              Patrimônio
            </label>
            {modoEdicao ? (
              <input
                type="text"
                value={patrimonio}
                onChange={(e) => setPatrimonio(e.target.value)}
                className="w-full p-1.5 mt-0.5 bg-white border border-gray-300 rounded text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
              />
            ) : (
              <span className="font-bold text-gray-800 text-sm block mt-1">
                {patrimonio || "N/I"}
              </span>
            )}
          </div>

          <div>
            <label className="text-gray-500 block uppercase font-semibold">
              Status
            </label>
            {modoEdicao ? (
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full p-1.5 mt-0.5 bg-white border border-gray-300 rounded text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="disponivel">Disponível</option>
                <option value="cautelado">Cautelado</option>
                <option value="manutencao">Manutenção</option>
              </select>
            ) : (
              <span
                className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold mt-1 ${
                  status === "disponivel"
                    ? "bg-green-100 text-green-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {status === "disponivel" ? "Disponível" : status}
              </span>
            )}
          </div>
        </div>

        {/* Etiqueta Visual para Impressão */}
        <div className="flex flex-col items-center justify-center p-3 bg-gray-100 rounded-xl border border-dashed border-gray-300">
          <div ref={printRef}>
            <div className="etiqueta bg-white border-2 border-black p-3 rounded-lg text-center shadow-sm">
              <div className="titulo text-[10px] font-bold uppercase tracking-wider text-black">
                {formatarTipo(tipo)} - {modelo}
              </div>
              <div className="my-2 flex justify-center">
                <QRCodeSVG value={arma.id} size={120} level="M" />
              </div>
              <div className="serie text-xs font-black text-black">
                SÉR: {numSerie}
              </div>
            </div>
          </div>
        </div>

        {/* Ações */}
        <div className="flex gap-2 pt-2">
          {modoEdicao ? (
            <>
              <button
                type="button"
                disabled={salvando}
                onClick={() => setModoEdicao(false)}
                className="w-1/3 py-2.5 bg-gray-200 text-gray-700 font-bold text-xs rounded-lg hover:bg-gray-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={salvando}
                onClick={handleSalvarEdicao}
                className="w-2/3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow disabled:opacity-50"
              >
                {salvando ? "Salvando..." : "Salvar Alterações"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="w-1/3 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold text-xs rounded-lg"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={handleImprimir}
                className="w-2/3 py-2.5 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-lg shadow flex items-center justify-center gap-2"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                  />
                </svg>
                Imprimir Etiqueta
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
