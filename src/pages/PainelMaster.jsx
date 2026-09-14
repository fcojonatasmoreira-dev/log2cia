import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  Eye,
  CheckCircle2,
  XCircle,
  RefreshCw,
  UserCheck,
  FileText,
  Camera,
  UserPlus,
} from "lucide-react";
import {
  getPerfisPendentes,
  getDocumentoUrl,
  homologarUsuario,
  preCadastrarOperador,
} from "../services/masterService";

export default function PainelMaster() {
  const [pendentes, setPendentes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [urls, setUrls] = useState({ funcional: null, selfie: null });
  const [loadingUrls, setLoadingUrls] = useState(false);
  const [roleSelecionada, setRoleSelecionada] = useState("armeiro");

  // Estado da Modal de Pré-Cadastro
  const [isModalPreOpen, setIsModalPreOpen] = useState(false);
  const [preForm, setPreForm] = useState({
    email: "",
    nome: "",
    role: "armeiro",
  });
  const [submittingPre, setSubmittingPre] = useState(false);

  const loadPendentes = async () => {
    try {
      setLoading(true);
      const data = await getPerfisPendentes();
      setPendentes(data);
    } catch (err) {
      alert(`Erro ao carregar solicitações: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPendentes();
  }, []);

  const handleSelectUser = async (user) => {
    setSelectedUser(user);
    setLoadingUrls(true);
    try {
      const funcionalUrl = await getDocumentoUrl(user.foto_funcional_url);
      const selfieUrl = await getDocumentoUrl(user.foto_selfie_url);
      setUrls({ funcional: funcionalUrl, selfie: selfieUrl });
    } catch (err) {
      alert(`Erro ao carregar mídias: ${err.message}`);
    } finally {
      setLoadingUrls(false);
    }
  };

  const handleAprovarRejeitar = async (status) => {
    if (!selectedUser) return;
    try {
      await homologarUsuario(selectedUser.id, status, roleSelecionada);
      alert(
        status === "aprovado"
          ? "Acesso aprovado com sucesso!"
          : "Credenciamento rejeitado.",
      );
      setSelectedUser(null);
      loadPendentes();
    } catch (err) {
      alert(`Erro no processo de homologação: ${err.message}`);
    }
  };

  const handlePreCadastroSubmit = async (e) => {
    e.preventDefault();
    setSubmittingPre(true);
    try {
      await preCadastrarOperador({
        email: preForm.email,
        nome: preForm.nome,
        roleAtribuida: preForm.role,
      });
      alert(
        `Convite gerado! O operador ${preForm.nome} tem até 7 dias para entrar com a conta Google (${preForm.email}) e enviar a funcional e selfie.`,
      );
      setIsModalPreOpen(false);
      setPreForm({ email: "", nome: "", role: "armeiro" });
      loadPendentes();
    } catch (err) {
      alert(`Erro ao pré-cadastrar: ${err.message}`);
    } finally {
      setSubmittingPre(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 text-white p-6 rounded-2xl shadow-xl">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-blue-600 rounded-xl">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-wide">
              Painel de Homologação Master
            </h1>
            <p className="text-xs text-slate-400">
              Análise biométrica e gestão de acessos do Log2CIA
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsModalPreOpen(true)}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-colors shadow-xs"
          >
            <UserPlus className="w-4 h-4" />
            <span>Pré-Cadastrar Operador</span>
          </button>

          <button
            onClick={loadPendentes}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
            title="Atualizar solicitações"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de Cadastros Pendentes */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-3">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
            <span>Solicitações Pendentes</span>
            <span className="bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full text-xs font-bold">
              {pendentes.length}
            </span>
          </h2>

          {loading ? (
            <p className="text-xs text-slate-400 text-center py-6">
              Buscando cadastros...
            </p>
          ) : pendentes.length === 0 ? (
            <div className="text-center py-8 text-slate-400 space-y-2">
              <UserCheck className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs">
                Nenhum credenciamento aguardando análise no momento.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {pendentes.map((p) => (
                <div
                  key={p.id}
                  onClick={() => handleSelectUser(p)}
                  className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                    selectedUser?.id === p.id
                      ? "border-blue-600 bg-blue-50/50 shadow-xs"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <p className="font-bold text-sm text-slate-900">
                    {p.nome || p.email}
                  </p>
                  <div className="flex items-center justify-between mt-1 text-xs text-slate-500 font-mono">
                    <span>
                      {p.posto_graduacao || "N/I"} {p.nome_guerra}
                    </span>
                    <span>RE: {p.matricula || "N/I"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detalhes do Credenciamento para Análise */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs p-6">
          {!selectedUser ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 py-16 space-y-2">
              <Eye className="w-10 h-10 text-slate-300" />
              <p className="text-sm font-medium">
                Selecione uma solicitação da lista para analisar as mídias e
                homologar.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="border-b pb-4 flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {selectedUser.nome}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    E-mail: {selectedUser.email}
                  </p>
                </div>
                <span className="bg-amber-100 text-amber-800 text-xs font-semibold px-3 py-1 rounded-full">
                  Aguardando Análise
                </span>
              </div>

              {/* Dados Funcionais */}
              <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div>
                  <p className="text-slate-400 font-medium uppercase">
                    Posto / Graduação
                  </p>
                  <p className="font-bold text-slate-800 mt-0.5">
                    {selectedUser.posto_graduacao || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 font-medium uppercase">
                    Matrícula / RE
                  </p>
                  <p className="font-bold text-slate-800 mt-0.5 font-mono">
                    {selectedUser.matricula || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 font-medium uppercase">
                    Lotação
                  </p>
                  <p className="font-bold text-slate-800 mt-0.5">
                    {selectedUser.lotacao || "—"}
                  </p>
                </div>
              </div>

              {/* Mídias de Segurança */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-900 text-white space-y-2">
                  <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300">
                    <Camera className="w-4 h-4 text-blue-400" />
                    <span>Selfie Biométrica em Tempo Real</span>
                  </div>
                  <div className="aspect-video bg-slate-950 rounded-lg overflow-hidden flex items-center justify-center">
                    {loadingUrls ? (
                      <RefreshCw className="w-6 h-6 animate-spin text-slate-500" />
                    ) : urls.selfie ? (
                      <img
                        src={urls.selfie}
                        alt="Selfie Biométrica"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs text-slate-500">
                        Sem selfie anexada
                      </span>
                    )}
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl p-3 bg-slate-900 text-white space-y-2">
                  <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    <span>Carteira Funcional Anexada</span>
                  </div>
                  <div className="aspect-video bg-slate-950 rounded-lg overflow-hidden flex items-center justify-center">
                    {loadingUrls ? (
                      <RefreshCw className="w-6 h-6 animate-spin text-slate-500" />
                    ) : urls.funcional ? (
                      <img
                        src={urls.funcional}
                        alt="Funcional Anexada"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs text-slate-500">
                        Sem documento anexado
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Decisão Master */}
              <div className="pt-4 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center space-x-2 w-full sm:w-auto">
                  <label className="text-xs font-semibold text-slate-700 uppercase">
                    Perfil a Atribuir:
                  </label>
                  <select
                    value={roleSelecionada}
                    onChange={(e) => setRoleSelecionada(e.target.value)}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 bg-white"
                  >
                    <option value="armeiro">
                      Armeiro / P4 (Acesso Operacional)
                    </option>
                    <option value="consulta">
                      Consulta / Comando (Apenas Leitura)
                    </option>
                  </select>
                </div>

                <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
                  <button
                    onClick={() => handleAprovarRejeitar("rejeitado")}
                    className="flex-1 sm:flex-none px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center space-x-1"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Rejeitar</span>
                  </button>
                  <button
                    onClick={() => handleAprovarRejeitar("aprovado")}
                    className="flex-1 sm:flex-none px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-lg flex items-center justify-center space-x-1"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Aprovar Acesso</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL DE PRÉ-CADASTRO DE OPERADOR */}
      {isModalPreOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 font-sans">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">
              Pré-Cadastrar Operador (P4/Armeiro)
            </h2>
            <p className="text-xs text-slate-500">
              O operador receberá o acesso pré-aprovado e terá{" "}
              <strong>7 dias</strong> para logar via Google e completar o envio
              da selfie e funcional.
            </p>
            <form onSubmit={handlePreCadastroSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  E-mail Google do Operador
                </label>
                <input
                  type="email"
                  required
                  placeholder="operador@gmail.com"
                  value={preForm.email}
                  onChange={(e) =>
                    setPreForm({ ...preForm, email: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Nome Completo / Referência
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Sgt Silva"
                  value={preForm.nome}
                  onChange={(e) =>
                    setPreForm({ ...preForm, nome: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Perfil Operacional
                </label>
                <select
                  value={preForm.role}
                  onChange={(e) =>
                    setPreForm({ ...preForm, role: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold bg-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="armeiro">
                    Armeiro / P4 (Acesso Operacional Completo)
                  </option>
                  <option value="consulta">
                    Consulta / Comando (Apenas Leitura)
                  </option>
                </select>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsModalPreOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingPre}
                  className="px-4 py-2 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-md disabled:opacity-50"
                >
                  {submittingPre
                    ? "Salvando..."
                    : "Conceder Acesso (Prazo 7 Dias)"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
