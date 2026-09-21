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
} from "../services/masterService";
import { supabase } from "../lib/supabaseClient";

export default function PainelMaster() {
  const [pendentes, setPendentes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [urls, setUrls] = useState({ funcional: null, selfie: null });
  const [loadingUrls, setLoadingUrls] = useState(false);
  const [roleSelecionada, setRoleSelecionada] = useState("armeiro");

  // Estado da Modal de Cadastro (Adaptado para a tabela unificada 'policiais' e cargos completos)
  const [isModalPreOpen, setIsModalPreOpen] = useState(false);
  const [preForm, setPreForm] = useState({
    nome_completo: "",
    nome_guerra: "",
    matricula: "",
    posto_graduacao: "SOLDADO",
    numeral: "",
    role: "policial",
    unidade: "2ª CIA / 15º BPM",
    status: "EM ATIVIDADE",
    primeiro_acesso: true,
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
      // 1. Verifica se a matrícula já existe na tabela unificada "policiais"
      const { data: existente } = await supabase
        .from("policiais")
        .select("id")
        .eq("matricula", preForm.matricula.trim())
        .maybeSingle();

      if (existente) {
        alert("Já existe um policial cadastrado com essa matrícula.");
        setSubmittingPre(false);
        return;
      }

      // 2. Insere na tabela unificada "policiais"
      const { error } = await supabase.from("policiais").insert([
        {
          nome_completo: preForm.nome_completo,
          nome_guerra: preForm.nome_guerra || preForm.nome_completo,
          matricula: preForm.matricula.trim(),
          posto_graduacao: preForm.posto_graduacao,
          numeral: preForm.numeral.trim(),
          role: preForm.role,
          unidade: preForm.unidade,
          status: preForm.status,
          primeiro_acesso: preForm.primeiro_acesso,
        },
      ]);

      if (error) throw error;

      alert(
        `Operador ${preForm.nome_completo} (${preForm.role.toUpperCase()}) cadastrado com sucesso!`,
      );

      setIsModalPreOpen(false);
      setPreForm({
        nome_completo: "",
        nome_guerra: "",
        matricula: "",
        posto_graduacao: "SOLDADO",
        numeral: "",
        role: "policial",
        unidade: "2ª CIA / 15º BPM",
        status: "EM ATIVIDADE",
        primeiro_acesso: true,
      });
      loadPendentes();
    } catch (err) {
      alert(`Erro ao cadastrar operador: ${err.message}`);
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
              Gestão de credenciamentos e cadastro direto de operadores e
              efetivo.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsModalPreOpen(true)}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-colors shadow-xs"
          >
            <UserPlus className="w-4 h-4" />
            <span>Cadastrar Operador</span>
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
                    <option value="policial">Policial</option>
                    <option value="armeiro">Armeiro</option>
                    <option value="p4">P4</option>
                    <option value="master">Master</option>
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

      {/* MODAL DE CADASTRO DIRETO DE OPERADOR (PAINEL MASTER) */}
      {isModalPreOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 font-sans">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 border-b pb-2">
              Cadastrar Novo Operador / Efetivo
            </h2>
            <form
              onSubmit={handlePreCadastroSubmit}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Fulano de Tal"
                  value={preForm.nome_completo}
                  onChange={(e) =>
                    setPreForm({ ...preForm, nome_completo: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">
                  Nome de Guerra *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Silva"
                  value={preForm.nome_guerra}
                  onChange={(e) =>
                    setPreForm({ ...preForm, nome_guerra: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">
                    Matrícula / RE *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 30012345"
                    value={preForm.matricula}
                    onChange={(e) =>
                      setPreForm({ ...preForm, matricula: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">
                    Posto / Graduação *
                  </label>
                  <select
                    value={preForm.posto_graduacao}
                    onChange={(e) =>
                      setPreForm({
                        ...preForm,
                        posto_graduacao: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="SOLDADO">SOLDADO</option>
                    <option value="CABO">CABO</option>
                    <option value="3º SARGENTO">3º SARGENTO</option>
                    <option value="2º SARGENTO">2º SARGENTO</option>
                    <option value="1º SARGENTO">1º SARGENTO</option>
                    <option value="SUBTENENTE">SUBTENENTE</option>
                    <option value="2º TENENTE">2º TENENTE</option>
                    <option value="1º TENENTE">1º TENENTE</option>
                    <option value="CAPITÃO">CAPITÃO</option>
                    <option value="MAJOR">MAJOR</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">
                  Numeral (Senha Provisória do 1º Acesso) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 31929"
                  value={preForm.numeral}
                  onChange={(e) =>
                    setPreForm({ ...preForm, numeral: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">
                    Perfil de Acesso (Role) *
                  </label>
                  <select
                    value={preForm.role}
                    onChange={(e) =>
                      setPreForm({ ...preForm, role: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="policial">Policial</option>
                    <option value="armeiro">Armeiro</option>
                    <option value="p4">P4</option>
                    <option value="master">Master</option>
                  </select>
                </div>

                <div className="flex flex-col justify-end pb-1.5">
                  <label className="flex items-center space-x-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={preForm.primeiro_acesso}
                      onChange={(e) =>
                        setPreForm({
                          ...preForm,
                          primeiro_acesso: e.target.checked,
                        })
                      }
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                    />
                    <span className="font-semibold text-slate-700 uppercase group-hover:text-blue-700 transition-colors">
                      Forçar Troca de Senha
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalPreOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingPre}
                  className="px-4 py-2 font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-md disabled:opacity-50"
                >
                  {submittingPre ? "Salvando..." : "Finalizar Cadastro"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
