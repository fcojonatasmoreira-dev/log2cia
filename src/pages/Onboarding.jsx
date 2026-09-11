import React, { useState, useRef } from "react";
import {
  Camera,
  Upload,
  CheckCircle,
  RefreshCw,
  Shield,
  AlertTriangle,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { uploadDocumentoSeguranca } from "../services/storageService";

export default function Onboarding({ user, onComplete }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Dados cadastrais
  const [formData, setFormData] = useState({
    matricula: "",
    posto_graduacao: "1º SARGENTO",
    numeral: "",
    lotacao: "2ª CIA / 15º BPM",
    nome_guerra: "",
    nome_completo: user?.user_metadata?.full_name || "",
  });

  // Mídias
  const [funcionalFile, setFuncionalFile] = useState(null);
  const [selfieBlob, setSelfieBlob] = useState(null);
  const [selfiePreview, setSelfiePreview] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Inicializar WebCam
  const startCamera = async () => {
    setCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      alert(
        "Não foi possível acessar a câmera do dispositivo. Verifique as permissões.",
      );
      setCameraActive(false);
    }
  };

  // Desligar WebCam
  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  // Capturar Foto do Video
  const captureSelfie = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          setSelfieBlob(blob);
          setSelfiePreview(URL.createObjectURL(blob));
          stopCamera();
        },
        "image/jpeg",
        0.85,
      );
    }
  };

  const handleFinalize = async (e) => {
    e.preventDefault();
    if (!funcionalFile || !selfieBlob) {
      alert("É obrigatório anexar a funcional e tirar a selfie de segurança.");
      return;
    }

    try {
      setLoading(true);

      // 1. Upload dos arquivos para o Storage Privado
      const funcionalUrl = await uploadDocumentoSeguranca(
        user.id,
        funcionalFile,
        "funcional",
      );
      const selfieUrl = await uploadDocumentoSeguranca(
        user.id,
        selfieBlob,
        "selfie",
      );

      // 2. Atualizar tabela de perfis (profiles) com status 'aguardando_analise'
      const { error } = await supabase
        .from("profiles")
        .update({
          matricula: formData.matricula,
          posto_graduacao: formData.posto_graduacao,
          numeral: formData.numeral,
          lotacao: formData.lotacao,
          nome: formData.nome_completo,
          foto_funcional_url: funcionalUrl,
          foto_selfie_url: selfieUrl,
          status_aprovacao: "aguardando_analise",
        })
        .eq("id", user.id);

      if (error) throw error;

      if (onComplete) onComplete();
    } catch (err) {
      alert(`Erro ao enviar dados para homologação: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans">
      <div className="bg-white max-w-2xl w-full rounded-2xl shadow-2xl overflow-hidden border border-slate-800">
        {/* Cabeçalho */}
        <div className="bg-slate-950 p-6 text-white border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-wide">
                Credenciamento de Segurança
              </h2>
              <p className="text-xs text-slate-400">
                Log2CIA — Validação de Identidade Operacional
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold bg-blue-900/50 text-blue-400 px-3 py-1 rounded-full border border-blue-800">
            Etapa {step} de 2
          </span>
        </div>

        <form onSubmit={handleFinalize} className="p-6 space-y-6">
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-base font-bold text-slate-800 border-b pb-2">
                1. Dados Funcionais do Servidor
              </h3>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Nome Completo
                </label>
                <input
                  type="text"
                  required
                  value={formData.nome_completo}
                  onChange={(e) =>
                    setFormData({ ...formData, nome_completo: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Matrícula / RE
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 308.123-1-X"
                    value={formData.matricula}
                    onChange={(e) =>
                      setFormData({ ...formData, matricula: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Posto / Graduação
                  </label>
                  <select
                    value={formData.posto_graduacao}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        posto_graduacao: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="SOLDADO">SOLDADO</option>
                    <option value="CABO">CABO</option>
                    <option value="3º SARGENTO">3º SARGENTO</option>
                    <option value="2º SARGENTO">2º SARGENTO</option>
                    <option value="1º SARGENTO">1º SARGENTO</option>
                    <option value="SUBTENENTE">SUBTENENTE</option>
                    <option value="OFFICER">OFICIAL</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Numeral (Se aplicável)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 19589"
                    value={formData.numeral}
                    onChange={(e) =>
                      setFormData({ ...formData, numeral: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Lotação / Unidade
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.lotacao}
                    onChange={(e) =>
                      setFormData({ ...formData, lotacao: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium text-sm transition-colors"
                >
                  Avançar para Validação Biométrica ➔
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <h3 className="text-base font-bold text-slate-800 border-b pb-2">
                2. Comprovação de Identidade e Biometria
              </h3>

              {/* Upload da Carteira Funcional */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700 uppercase">
                  Foto da Carteira Funcional (Frente/Verso)
                </label>
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:bg-slate-50 transition-colors">
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => setFuncionalFile(e.target.files[0])}
                    className="hidden"
                    id="funcional-input"
                  />
                  <label
                    htmlFor="funcional-input"
                    className="cursor-pointer flex flex-col items-center"
                  >
                    <Upload className="w-8 h-8 text-slate-400 mb-2" />
                    <span className="text-sm font-medium text-slate-700">
                      {funcionalFile
                        ? funcionalFile.name
                        : "Clique para selecionar o arquivo da Funcional"}
                    </span>
                    <span className="text-xs text-slate-400 mt-1">
                      Formatos aceitos: JPG, PNG, PDF
                    </span>
                  </label>
                </div>
              </div>

              {/* Captura de Selfie via WebCam */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700 uppercase">
                  Selfie em Tempo Real (Câmera)
                </label>

                <div className="relative bg-slate-900 rounded-xl overflow-hidden aspect-video flex items-center justify-center border border-slate-700">
                  {!cameraActive && !selfiePreview && (
                    <button
                      type="button"
                      onClick={startCamera}
                      className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Abrir Câmera</span>
                    </button>
                  )}

                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className={`w-full h-full object-cover ${cameraActive ? "block" : "hidden"}`}
                  />

                  {selfiePreview && !cameraActive && (
                    <img
                      src={selfiePreview}
                      alt="Selfie"
                      className="w-full h-full object-cover"
                    />
                  )}

                  <canvas ref={canvasRef} className="hidden" />
                </div>

                <div className="flex justify-center space-x-3 mt-2">
                  {cameraActive && (
                    <button
                      type="button"
                      onClick={captureSelfie}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1"
                    >
                      <Camera className="w-4 h-4 mr-1" /> Tirar Foto
                    </button>
                  )}

                  {selfiePreview && (
                    <button
                      type="button"
                      onClick={startCamera}
                      className="bg-slate-700 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1"
                    >
                      <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refazer Foto
                    </button>
                  )}
                </div>
              </div>

              {/* Botões de Submissão */}
              <div className="flex justify-between items-center pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-sm font-medium text-slate-600 hover:text-slate-900"
                >
                  ⬅ Voltar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg font-bold text-sm transition-colors shadow-lg flex items-center space-x-2"
                >
                  {loading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  <span>Enviar para Aprovação do Master</span>
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
