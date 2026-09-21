import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import ModalDetalhesArma from "../components/ModalDetalhesArma";

function formatarTipo(texto) {
  if (!texto) return "Armamento";
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export default function Inventario() {
  const [equipamentos, setEquipamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [armaSelecionada, setArmaSelecionada] = useState(null);
  const [modalNovo, setModalNovo] = useState(false);
  const [userRole, setUserRole] = useState("policial");

  // Campos gerais do formulário
  const [novoTipo, setNovoTipo] = useState("armamento");
  const [novoModelo, setNovoModelo] = useState("");
  const [novoSerie, setNovoSerie] = useState("");
  const [novoPatrimonio, setNovoPatrimonio] = useState("");
  const [novoCalibre, setNovoCalibre] = useState("");
  const [novoLocalizacao, setNovoLocalizacao] = useState("Estoque da Reserva");
  const [novoEstado, setNovoEstado] = useState("Bom");

  // Campos específicos para Colete Balístico
  const [coleteGenero, setColeteGenero] = useState("MASCULINO");
  const [coleteTamanho, setColeteTamanho] = useState("M");
  const [coleteDataFabricacao, setColeteDataFabricacao] = useState("");
  const [coleteDataValidade, setColeteDataValidade] = useState("");
  const [coleteObs, setColeteObs] = useState("");

  // Campos específicos para Munição
  const [municaoLote, setMunicaoLote] = useState("");
  const [municaoQuantidade, setMunicaoQuantidade] = useState("");
  const [municaoObs, setMunicaoObs] = useState("");

  // Estados para arquivos e upload
  const [arquivoArma, setArquivoArma] = useState(null);
  const [arquivoNumeracao, setArquivoNumeracao] = useState(null);
  const [salvando, setSalvando] = useState(false);

  // Verifica o cargo do usuário logado no localStorage
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
    carregarInventario();
  }, []);

  const isP4OrMaster = userRole === "master" || userRole === "p4";

  async function carregarInventario() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("equipamentos")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (data) setEquipamentos(data);
    } catch (err) {
      console.error("Erro ao carregar equipamentos:", err.message);
    } finally {
      setLoading(false);
    }
  }

  // Função auxiliar para upload de imagem no bucket "documentos-segurança"
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

  // Adaptações automáticas ao trocar o tipo no select
  const handleTipoChange = (val) => {
    setNovoTipo(val);
    if (val === "colete" && !novoModelo) {
      setNovoModelo("PROTECTA - COLETE - NÍVEL III-A");
    }
    if (val === "municao" && !novoModelo) {
      setNovoModelo("Munição 9mm / .40");
    }
  };

  const handleCadastrarArmamento = async (e) => {
    e.preventDefault();
    if (!isP4OrMaster) {
      alert(
        "Acesso negado: Apenas perfis P4 ou Master podem cadastrar novos equipamentos.",
      );
      return;
    }
    setSalvando(true);

    try {
      const fotoArmaUrl = await fazerUploadImagem(arquivoArma, "item");
      const fotoNumeracaoUrl = await fazerUploadImagem(arquivoNumeracao, "det");

      let detalhesObj = {
        localizacao_atual: novoLocalizacao,
        estado_conservacao: novoEstado,
        foto_arma_url: fotoArmaUrl,
        foto_numeracao_url: fotoNumeracaoUrl,
      };

      let serieFinal = novoSerie;
      let patrimonioFinal = novoPatrimonio;

      if (novoTipo === "colete") {
        detalhesObj = {
          ...detalhesObj,
          genero: coleteGenero,
          tamanho: coleteTamanho,
          data_fabricacao: coleteDataFabricacao,
          data_validade: coleteDataValidade,
          obs: coleteObs,
        };
      } else if (novoTipo === "municao") {
        serieFinal = municaoLote
          ? `LOTE-${municaoLote}`
          : `LOTE-S/N-${Date.now()}`;
        detalhesObj = {
          ...detalhesObj,
          lote: municaoLote || "Não Identificado",
          quantidade: municaoQuantidade || 0,
          obs: municaoObs,
        };
      } else {
        detalhesObj.calibre = novoCalibre;
      }

      const { error } = await supabase.from("equipamentos").insert([
        {
          tipo: novoTipo.toLowerCase(),
          modelo_descricao: novoModelo,
          num_serie: serieFinal,
          patrimonio: patrimonioFinal || null,
          status: "disponivel",
          detalhes: detalhesObj,
        },
      ]);

      if (error) throw error;

      // Limpa formulário
      setNovoModelo("");
      setNovoSerie("");
      setNovoPatrimonio("");
      setNovoCalibre("");
      setColeteGenero("MASCULINO");
      setColeteTamanho("M");
      setColeteDataFabricacao("");
      setColeteDataValidade("");
      setColeteObs("");
      setMunicaoLote("");
      setMunicaoQuantidade("");
      setMunicaoObs("");
      setNovoLocalizacao("Estoque da Reserva");
      setNovoEstado("Bom");
      setArquivoArma(null);
      setArquivoNumeracao(null);
      setModalNovo(false);
      carregarInventario();
    } catch (err) {
      alert("Erro ao cadastrar equipamento: " + err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Acervo / Inventário
          </h1>
          <p className="text-xs text-slate-500">
            Gestão e controle de equipamentos bélicos
          </p>
        </div>

        {isP4OrMaster && (
          <button
            type="button"
            onClick={() => setModalNovo(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg shadow text-xs flex items-center gap-2 transition-all"
          >
            <span>+</span> Novo Equipamento
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-10 text-slate-500 font-medium">
          Carregando acervo...
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 uppercase font-bold text-[11px]">
                <th className="p-3">Tipo / Descrição</th>
                <th className="p-3">Série / Lote</th>
                <th className="p-3">Patrimônio</th>
                <th className="p-3">Especificações</th>
                <th className="p-3">Localização</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {equipamentos.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-4 text-center text-slate-400">
                    Nenhum equipamento cadastrado.
                  </td>
                </tr>
              ) : (
                equipamentos.map((item) => {
                  const tipoFormatted = formatarTipo(item.tipo);
                  const modeloVal =
                    item.modelo_descricao || item.modelo || "N/I";
                  const serieVal = item.num_serie || item.numero_serie || "N/I";
                  const patrimonioVal = item.patrimonio || "—";
                  const localizacaoVal =
                    item.detalhes?.localizacao_atual || "Estoque da Reserva";

                  let infoExtra = item.detalhes?.calibre || "";
                  if (item.tipo === "colete") {
                    infoExtra = `Gênero: ${item.detalhes?.genero || "N/I"} | Tam: ${item.detalhes?.tamanho || "N/I"} | Val: ${item.detalhes?.data_validade || "N/I"}`;
                  } else if (item.tipo === "municao") {
                    infoExtra = `Lote: ${item.detalhes?.lote || "Não Identificado"} | Qtd: ${item.detalhes?.quantidade || 0} un`;
                  }

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="p-3 font-bold text-slate-800">
                        {tipoFormatted} - {modeloVal}
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-700">
                        {serieVal}
                      </td>
                      <td className="p-3 font-mono text-slate-600">
                        {patrimonioVal}
                      </td>
                      <td className="p-3 text-slate-600 font-medium">
                        {infoExtra || "—"}
                      </td>
                      <td className="p-3 text-slate-600">{localizacaoVal}</td>
                      <td className="p-3">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            item.status === "disponivel"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {item.status === "disponivel"
                            ? "Disponível"
                            : item.status}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => setArmaSelecionada(item)}
                          className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold rounded-lg transition-all text-xs border border-blue-200"
                        >
                          Ver Detalhes / Fotos
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de Cadastro Dinâmico */}
      {modalNovo && isP4OrMaster && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 space-y-4 my-8">
            <div className="flex justify-between items-center border-b pb-3">
              <h2 className="text-lg font-bold text-gray-800">
                Cadastrar Novo Equipamento
              </h2>
              <button
                onClick={() => setModalNovo(false)}
                className="text-gray-400 font-bold text-lg p-1"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleCadastrarArmamento}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1">
                  Tipo de Equipamento
                </label>
                <select
                  value={novoTipo}
                  onChange={(e) => handleTipoChange(e.target.value)}
                  className="w-full p-2 bg-gray-50 border border-gray-300 rounded-lg font-medium"
                >
                  <option value="armamento">Armamento</option>
                  <option value="colete">Colete Balístico</option>
                  <option value="municao">Munição</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1">
                  {novoTipo === "municao"
                    ? "Tipo / Calibre da Munição *"
                    : "Marca / Modelo *"}
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    novoTipo === "colete"
                      ? "Ex: PROTECTA - COLETE - NÍVEL III-A"
                      : novoTipo === "municao"
                        ? "Ex: Munição 9mm Luger / .40 S&W"
                        : "Ex: PT 840, Glock G22"
                  }
                  value={novoModelo}
                  onChange={(e) => setNovoModelo(e.target.value)}
                  className="w-full p-2 bg-gray-50 border border-gray-300 rounded-lg"
                />
              </div>

              {/* SE FOR MUNIÇÃO: EXIBE CAMPOS DE LOTE E QUANTIDADE */}
              {novoTipo === "municao" ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-bold text-gray-700 uppercase mb-1">
                      Identificação do Lote (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: LOTE-9923 (Deixe em branco se não houver)"
                      value={municaoLote}
                      onChange={(e) => setMunicaoLote(e.target.value)}
                      className="w-full p-2 bg-gray-50 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-gray-700 uppercase mb-1">
                      Quantidade / Saldo *
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="Ex: 50"
                      value={municaoQuantidade}
                      onChange={(e) => setMunicaoQuantidade(e.target.value)}
                      className="w-full p-2 bg-gray-50 border border-gray-300 rounded-lg font-mono font-bold"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-bold text-gray-700 uppercase mb-1">
                      Nº de Série *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: ABC12345"
                      value={novoSerie}
                      onChange={(e) => setNovoSerie(e.target.value)}
                      className="w-full p-2 bg-gray-50 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-gray-700 uppercase mb-1">
                      Tombo / Patrimônio
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: PAT-9920"
                      value={novoPatrimonio}
                      onChange={(e) => setNovoPatrimonio(e.target.value)}
                      className="w-full p-2 bg-gray-50 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
              )}

              {/* CAMPOS ESPECÍFICOS DE COLETE */}
              {novoTipo === "colete" && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-gray-700 uppercase mb-1">
                        Gênero
                      </label>
                      <select
                        value={coleteGenero}
                        onChange={(e) => setColeteGenero(e.target.value)}
                        className="w-full p-2 bg-gray-50 border border-gray-300 rounded-lg font-medium"
                      >
                        <option value="MASCULINO">MASCULINO</option>
                        <option value="FEMININO">FEMININO</option>
                        <option value="UNISEX">UNISEX</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-gray-700 uppercase mb-1">
                        Tamanho
                      </label>
                      <select
                        value={coleteTamanho}
                        onChange={(e) => setColeteTamanho(e.target.value)}
                        className="w-full p-2 bg-gray-50 border border-gray-300 rounded-lg font-medium font-mono"
                      >
                        <option value="PP">PP</option>
                        <option value="P">P</option>
                        <option value="P1">P1</option>
                        <option value="M">M</option>
                        <option value="M2">M2</option>
                        <option value="G">G</option>
                        <option value="GG">GG</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-gray-700 uppercase mb-1">
                        Data de Fabricação
                      </label>
                      <input
                        type="date"
                        value={coleteDataFabricacao}
                        onChange={(e) =>
                          setColeteDataFabricacao(e.target.value)
                        }
                        className="w-full p-2 bg-gray-50 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-gray-700 uppercase mb-1">
                        Data de Validade (Fim)
                      </label>
                      <input
                        type="date"
                        value={coleteDataValidade}
                        onChange={(e) => setColeteDataValidade(e.target.value)}
                        className="w-full p-2 bg-gray-50 border border-gray-300 rounded-lg"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-gray-700 uppercase mb-1">
                      Observações (OBS)
                    </label>
                    <input
                      type="text"
                      placeholder="Observações adicionais do colete..."
                      value={coleteObs}
                      onChange={(e) => setColeteObs(e.target.value)}
                      className="w-full p-2 bg-gray-50 border border-gray-300 rounded-lg"
                    />
                  </div>
                </>
              )}

              {/* SE FOR MUNIÇÃO: CAMPO DE OBSERVAÇÕES */}
              {novoTipo === "municao" && (
                <div>
                  <label className="block font-bold text-gray-700 uppercase mb-1">
                    Observações (OBS)
                  </label>
                  <input
                    type="text"
                    placeholder="Observações sobre o lote ou caixa de munição..."
                    value={municaoObs}
                    onChange={(e) => setMunicaoObs(e.target.value)}
                    className="w-full p-2 bg-gray-50 border border-gray-300 rounded-lg"
                  />
                </div>
              )}

              {/* SE FOR ARMAMENTO: CALIBRE E ESTADO */}
              {novoTipo === "armamento" && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-bold text-gray-700 uppercase mb-1">
                      Calibre / Detalhe
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: .40 S&W, 9mm"
                      value={novoCalibre}
                      onChange={(e) => setNovoCalibre(e.target.value)}
                      className="w-full p-2 bg-gray-50 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-gray-700 uppercase mb-1">
                      Estado de Conservação
                    </label>
                    <select
                      value={novoEstado}
                      onChange={(e) => setNovoEstado(e.target.value)}
                      className="w-full p-2 bg-gray-50 border border-gray-300 rounded-lg font-medium"
                    >
                      <option value="Novo">Novo</option>
                      <option value="Bom">Bom</option>
                      <option value="Regular">Regular</option>
                      <option value="Danificado">Danificado</option>
                      <option value="Manutenção">Em Manutenção</option>
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1">
                  Localização Atual
                </label>
                <select
                  value={novoLocalizacao}
                  onChange={(e) => setNovoLocalizacao(e.target.value)}
                  className="w-full p-2 bg-gray-50 border border-gray-300 rounded-lg font-medium"
                >
                  <option value="Estoque da Reserva">Estoque da Reserva</option>
                  <option value="Acautelada com Policial">
                    Acautelada com Policial
                  </option>
                  <option value="Apreendida">Apreendida</option>
                  <option value="Em Perícia">Em Perícia</option>
                  <option value="Manutenção">Manutenção</option>
                </select>
              </div>

              {/* Seção de Upload de Imagens */}
              <div className="grid grid-cols-2 gap-2 border-t pt-2">
                <div>
                  <label className="block font-bold text-gray-700 uppercase mb-1">
                    Foto Geral
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setArquivoArma(e.target.files[0])}
                    className="w-full text-[10px] text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[10px] file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 uppercase mb-1">
                    Foto do Detalhe / Caixa
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setArquivoNumeracao(e.target.files[0])}
                    className="w-full text-[10px] text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[10px] file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setModalNovo(false)}
                  className="w-1/3 py-2 bg-gray-200 text-gray-700 font-bold rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="w-2/3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow disabled:opacity-50"
                >
                  {salvando ? "Salvando..." : "Salvar Equipamento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Visualização/Edição Avançada */}
      {armaSelecionada && (
        <ModalDetalhesArma
          arma={armaSelecionada}
          userRole={userRole}
          onClose={() => setArmaSelecionada(null)}
          onUpdateSuccess={() => {
            carregarInventario();
            setArmaSelecionada(null);
          }}
        />
      )}
    </div>
  );
}
