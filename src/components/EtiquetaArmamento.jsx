import { useRef } from "react";
import { QRCodeSVG } from "qrcode.react";

export default function EtiquetaArmamento({ equipamento }) {
  const printRef = useRef();

  const handleImprimir = () => {
    const conteudo = printRef.current.innerHTML;
    const janelaImpressao = window.open("", "", "width=400,height=400");
    janelaImpressao.document.write(`
      <html>
        <head>
          <title>Etiqueta de Armamento</title>
          <style>
            body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .etiqueta { border: 2px solid #000; padding: 12px; border-radius: 8px; text-align: center; width: 180px; }
            .titulo { font-size: 11px; font-weight: bold; margin-bottom: 4px; text-transform: uppercase; }
            .serie { font-size: 14px; font-weight: bold; margin-top: 4px; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          ${conteudo}
        </body>
      </html>
    `);
    janelaImpressao.document.close();
  };

  if (!equipamento) return null;

  return (
    <div className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm text-center space-y-3 max-w-xs mx-auto">
      <div ref={printRef}>
        <div className="etiqueta inline-block border-2 border-black p-3 rounded-lg text-center bg-white">
          <div className="titulo text-[10px] font-bold uppercase tracking-wider">
            {equipamento.tipo} - {equipamento.modelo}
          </div>
          <div className="my-2 flex justify-center">
            <QRCodeSVG value={equipamento.id} size={110} level="M" />
          </div>
          <div className="serie text-xs font-black">
            Nº SÉRIE: {equipamento.numero_serie}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={handleImprimir}
        className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg shadow"
      >
        Imprimir Etiqueta
      </button>
    </div>
  );
}
