import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabaseClient";
import {
  BookOpen,
  Plus,
  Edit3,
  Trash2,
  FileText,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  RotateCcw,
} from "lucide-react";
import ModalNovoLivro from "./ModalNovoLivro";

export default function LivroPermanencia({ userLogado }) {
  const [livros, setLivros] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [livroSelecionadoParaEdicao, setLivroSelecionadoParaEdicao] =
    useState(null);
  const [isMaster, setIsMaster] = useState(false);
  const [temAcesso, setTemAcesso] = useState(false);
  const [verificandoAcesso, setVerificandoAcesso] = useState(true);

  useEffect(() => {
    carregarLivros();
    verificarAcesso();
  }, [userLogado]);

  async function verificarAcesso() {
    setVerificandoAcesso(true);
    try {
      const usuarioSalvo = localStorage.getItem("log2cia_user");
      const dadosSalvos = usuarioSalvo ? JSON.parse(usuarioSalvo) : {};

      let dadosBanco = null;
      const matriculaLogada = userLogado?.matricula || dadosSalvos?.matricula;

      if (matriculaLogada) {
        const { data, error } = await supabase
          .from("policiais")
          .select("role, matricula")
          .eq("matricula", matriculaLogada)
          .maybeSingle();

        if (error) throw error;
        dadosBanco = data;
      }

      const perfis = [
        userLogado?.role,
        userLogado?.perfil,
        dadosSalvos?.role,
        dadosSalvos?.perfil,
        dadosBanco?.role,
      ]
        .filter(Boolean)
        .map((perfil) =>
          String(perfil)
            .trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\\u0300-\\u036f]/g, ""),
        );

      const ehMaster =
        userLogado?.is_master === true ||
        dadosSalvos?.is_master === true ||
        perfis.includes("master");

      const ehPermanente = perfis.includes("permanente da guarda");

      setIsMaster(ehMaster);
      setTemAcesso(ehMaster || ehPermanente);
    } catch (err) {
      console.error("Erro ao verificar acesso ao Livro da Permanência:", err);
      setIsMaster(false);
      setTemAcesso(false);
    } finally {
      setVerificandoAcesso(false);
    }
  }

  async function carregarLivros() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("livros_permanencia")
        .select("*")
        .order("data_servico", { ascending: false });

      if (error) throw error;
      if (data) setLivros(data);
    } catch (err) {
      console.error("Erro ao carregar livros:", err.message);
    } finally {
      setLoading(false);
    }
  }

  const handleNovoLivroClick = () => {
    setLivroSelecionadoParaEdicao(null);
    setModalAberto(true);
  };

  const handleEditarLivro = (livro) => {
    setLivroSelecionadoParaEdicao({
      ...livro,
      modoVisualizacaoEstrita: false,
    });
    setModalAberto(true);
  };

  const handleExcluirLivro = async (livroId) => {
    if (
      !window.confirm(
        "Tem certeza que deseja excluir permanentemente este livro de turno?",
      )
    )
      return;
    try {
      await supabase.from("livro_viaturas").delete().eq("livro_id", livroId);
      await supabase.from("livro_ocorrencias").delete().eq("livro_id", livroId);
      const { error } = await supabase
        .from("livros_permanencia")
        .delete()
        .eq("id", livroId);

      if (error) throw error;
      alert("Livro excluído com sucesso!");
      carregarLivros();
    } catch (err) {
      alert("Erro ao excluir livro: " + err.message);
    }
  };

  const visualizarLivro = (livro) => {
    setLivroSelecionadoParaEdicao({
      ...livro,
      modoVisualizacaoEstrita: true,
    });
    setModalAberto(true);
  };

  const handleReabrirLivro = async (livro) => {
    if (!isMaster || livro?.status !== "fechado") return;

    if (
      !window.confirm(
        "Deseja reabrir este livro? Ele voltará para Em Andamento e poderá ser editado novamente.",
      )
    ) {
      return;
    }

    try {
      const { data, error } = await supabase
        .from("livros_permanencia")
        .update({ status: "em_andamento" })
        .eq("id", livro.id)
        .eq("status", "fechado")
        .select("id, status")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error("O livro não está mais fechado ou não foi encontrado.");
      }

      alert("Livro reaberto com sucesso. Ele voltou para Em Andamento.");
      carregarLivros();
    } catch (err) {
      alert("Erro ao reabrir livro: " + err.message);
    }
  };

  if (verificandoAcesso) {
    return (
      <div className="p-8 text-center text-sm text-slate-500">
        Verificando acesso...
      </div>
    );
  }

  if (!temAcesso) {
    return (
      <div className="p-8 text-center text-sm text-slate-500">
        Você não tem permissão para acessar o Livro Digital da Permanência.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-blue-600" /> Livro Digital da
            Permanência
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Módulo P1 — Controle de Turnos, Viaturas, Ocorrências e Fechamento
            de Livro da OPM
          </p>
        </div>
        <button
          onClick={handleNovoLivroClick}
          className="px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-blue-700 shadow-md transition-all"
        >
          <Plus className="w-4 h-4" /> Novo Livro de Turno
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 font-bold text-xs text-slate-700 uppercase tracking-wider">
          Histórico de Livros de Permanência Registrados
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">
            Carregando livros...
          </div>
        ) : livros.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
            <FileText className="w-8 h-8 text-slate-300" />
            Nenhum livro de permanência registrado até o momento.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-100">
                  <th className="px-4 py-3 font-bold uppercase">
                    Data do Serviço
                  </th>
                  <th className="px-4 py-3 font-bold uppercase">Turno</th>
                  <th className="px-4 py-3 font-bold uppercase">
                    Permanente Responsável
                  </th>
                  <th className="px-4 py-3 font-bold uppercase">Antecessor</th>
                  <th className="px-4 py-3 font-bold uppercase">Status</th>
                  <th className="px-4 py-3 font-bold uppercase text-right">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {livros.map((livro) => {
                  const isFechado =
                    livro.status === "fechado" || livro.status === "assinado";
                  const isAssinado = livro.status === "assinado";

                  return (
                    <tr
                      key={livro.id}
                      className="hover:bg-slate-50/60 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-slate-700 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {livro.data_servico}
                      </td>
                      <td className="px-4 py-3 font-bold text-blue-600">
                        Turno {livro.turno}
                      </td>
                      <td className="px-4 py-3 uppercase text-slate-700 font-medium">
                        {livro.permanente_nome}
                      </td>
                      <td className="px-4 py-3 uppercase text-slate-500">
                        {livro.antecessor_nome || "—"}
                      </td>
                      <td className="px-4 py-3">
                        {isAssinado ? (
                          <span className="px-2.5 py-1 bg-purple-100 text-purple-800 rounded-full font-bold text-[10px] inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Assinado Gov.br
                          </span>
                        ) : isFechado ? (
                          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[10px] inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Fechado /
                            Concluído
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full font-bold text-[10px] inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Em Andamento
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isFechado ? (
                            <>
                              <button
                                onClick={() => visualizarLivro(livro)}
                                title="Visualizar Livro"
                                className="p-1.5 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              {isMaster && livro.status === "fechado" && (
                                <button
                                  onClick={() => handleReabrirLivro(livro)}
                                  title="Reabrir Livro (Master)"
                                  className="p-1.5 bg-amber-100 text-amber-700 rounded-xl hover:bg-amber-200 transition-colors"
                                >
                                  <RotateCcw className="w-4 h-4" />
                                </button>
                              )}
                            </>
                          ) : (
                            <button
                              onClick={() => handleEditarLivro(livro)}
                              className="px-3 py-1.5 bg-blue-600 text-white rounded-xl font-bold text-[11px] inline-flex items-center gap-1 hover:bg-blue-700 shadow-sm"
                            >
                              <Edit3 className="w-3.5 h-3.5" /> Continuar
                              Editando
                            </button>
                          )}

                          {isMaster && (
                            <button
                              onClick={() => handleExcluirLivro(livro.id)}
                              title="Excluir Livro (Master)"
                              className="p-1.5 bg-rose-100 text-rose-700 rounded-xl hover:bg-rose-200 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ModalNovoLivro
        isOpen={modalAberto}
        onClose={() => setModalAberto(false)}
        onSuccess={carregarLivros}
        userLogado={userLogado}
        livroParaEditar={livroSelecionadoParaEdicao}
        isMasterGlobal={isMaster}
      />
    </div>
  );
}
