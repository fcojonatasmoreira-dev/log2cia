import { useEffect } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";

export default function QrScanner({ onScanSuccess }) {
  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      "reader",
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        facingMode: "environment",
      },
      false,
    );

    scanner.render(
      (decodedText) => {
        scanner.clear();
        onScanSuccess(decodedText);
      },
      () => {},
    );

    return () => {
      scanner
        .clear()
        .catch((error) => console.error("Erro ao fechar câmera:", error));
    };
  }, [onScanSuccess]);

  return (
    <div className="w-full max-w-md mx-auto p-4 bg-white rounded-lg shadow-md text-center">
      <h3 className="text-lg font-bold mb-2 text-gray-800">
        Aponte a câmera para o QR Code da Arma
      </h3>
      <div id="reader" className="w-full overflow-hidden rounded-lg"></div>
    </div>
  );
}
