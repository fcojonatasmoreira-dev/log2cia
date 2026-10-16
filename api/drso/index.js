import { supabaseAdmin, normalizarRole, respostaErro } from "../_server.js";
import { lerSessao } from "../auth/_session.js";
import { hashSenha } from "../auth/_password.js";
const ehEscalante = (usuario) => usuario?.drso_escalante === true && normalizarRole(usuario) === "p1";
const podeGerenciar = (usuario) => normalizarRole(usuario) === "master" || usuario?.is_master === true || ehEscalante(usuario);
const txt = (v) => typeof v === "string" ? v.trim() : "";
const normalizarTexto = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[º°]/g, "").replace(/ª/g, "A").replace(/[._-]/g, " ").replace(/\s+/g, " ").trim();
const pesoHierarquia = (posto) => {
  const p = normalizarTexto(posto);
  if (p.includes("CORONEL") && !p.includes("TENENTE")) return 1;
  if (p.includes("TENENTE CORONEL") || p === "TC") return 2;
  if (p.includes("MAJOR")) return 3;
  if (p.includes("CAPITAO") || p === "CAP") return 4;
  if (p.includes("1 TENENTE") || p.includes("PRIMEIRO TENENTE")) return 5;
  if (p.includes("2 TENENTE") || p.includes("SEGUNDO TENENTE")) return 6;
  if (p.includes("ASPIRANTE")) return 7;
  if (p.includes("SUBTENENTE")) return 8;
  if (p.includes("1 SARGENTO") || p.includes("PRIMEIRO SARGENTO")) return 9;
  if (p.includes("2 SARGENTO") || p.includes("SEGUNDO SARGENTO")) return 10;
  if (p.includes("3 SARGENTO") || p.includes("TERCEIRO SARGENTO")) return 11;
  if (p.includes("CABO")) return 12;
  if (p.includes("SOLDADO")) return 13;
  return 99;
};
const valorNumeral = (valor) => {
  const n = String(valor ?? "").match(/\d+/)?.[0];
  return n == null ? Number.POSITIVE_INFINITY : Number(n);
};
const compararAntiguidade = (a, b) => pesoHierarquia(a?.posto_graduacao) - pesoHierarquia(b?.posto_graduacao) || valorNumeral(a?.numeral) - valorNumeral(b?.numeral) || String(a?.nome_guerra || a?.nome_completo || "").localeCompare(String(b?.nome_guerra || b?.nome_completo || ""), "pt-BR");
async function listarPaginado(criarConsulta, tamanho = 1000) {
  const itens = [];
  for (let inicio = 0; ; inicio += tamanho) {
    const { data, error } = await criarConsulta().range(inicio, inicio + tamanho - 1);
    if (error) throw error;
    itens.push(...(data || []));
    if (!data || data.length < tamanho) return itens;
  }
}
async function verificarConflitoNoDia(db, dataServico, policialId, escalaAtualId) {
  const { data: escalasDia, error: e1 } = await db.from("drso_escalas").select("id,local,horario_inicio,horario_fim").eq("data_servico", dataServico).neq("id", escalaAtualId);
  if (e1) throw e1;
  const ids = (escalasDia || []).map(e => e.id);
  if (!ids.length) return null;
  const { data: vinculos, error: e2 } = await db.from("drso_voluntarios").select("escala_id").or(`policial_id.eq.${policialId},policial_externo_id.eq.${policialId}`).eq("status", "selecionado").in("escala_id", ids);
  if (e2) throw e2;
  const conflito = (vinculos || []).find(v => ids.includes(v.escala_id));
  if (!conflito) return null;
  const escala = escalasDia.find(e => e.id === conflito.escala_id);
  return escala ? `Este policial já está escalado em outra DRSO nesta data (${escala.horario_inicio?.slice(0,5)}–${escala.horario_fim?.slice(0,5)}${escala.local ? `, ${escala.local}` : ""}).` : "Este policial já está escalado em outra DRSO nesta data.";
}
export default async function handler(req, res) {
  try {
    const sessao = lerSessao(req);
    if (!sessao?.sub) return respostaErro(res, 401, "Sessão inválida ou expirada.");
    const db = supabaseAdmin();
    let { data: usuario, error: erroUsuario } = await db.from("policiais")
      .select("id,nome_completo,nome_guerra,matricula,posto_graduacao,numeral,role,unidade,status,drso_escalante,auth_version")
      .eq("id", sessao.sub).maybeSingle();
    if (erroUsuario) throw erroUsuario;
    let externo = false;
    if (!usuario) {
      const { data: contaExterna, error: erroExterno } = await db.from("drso_policiais_externos")
        .select("id,nome_completo,nome_guerra,matricula,posto_graduacao,numeral,unidade_origem,tipo,auth_version,ativo")
        .eq("id", sessao.sub).eq("ativo", true).maybeSingle();
      if (erroExterno) throw erroExterno;
      if (!contaExterna || contaExterna.auth_version !== sessao.ver) return respostaErro(res, 401, "Conta externa inválida ou desativada.");
      usuario = { ...contaExterna, role: "drso_externo", tipo_acesso: "drso_externo", unidade: contaExterna.unidade_origem, drso_tipo: contaExterna.tipo };
      externo = true;
    } else if (usuario.auth_version !== sessao.ver) return respostaErro(res, 401, "Sessão revogada. Entre novamente.");
    const gestor = !externo && podeGerenciar(usuario);
    if (externo && req.method === "POST" && !["voluntariar", "retirar_voluntariado"].includes(String(req.body?.acao || ""))) return respostaErro(res, 403, "Contas externas só podem gerenciar o próprio voluntariado DRSO.");
    if (req.method === "GET") {
      const mes = txt(req.query?.mes) || new Date().toISOString().slice(0, 7);
      const inicio = `${mes}-01`; const fim = new Date(Number(mes.slice(0,4)), Number(mes.slice(5,7)), 1).toISOString().slice(0,10);
      const consultas = await Promise.all([
        listarPaginado(() => db.from("drso_escalas").select("*").gte("data_servico", inicio).lt("data_servico", fim).order("data_servico").order("horario_inicio").order("id")),
        db.from("policiais").select("id, nome_guerra, nome_completo, numeral, matricula, posto_graduacao, role, status, drso_escalante, unidade"),
        db.from("viaturas").select("id, identificacao, placa, situacao, ativo").eq("situacao", "operando").eq("ativo", true).order("identificacao"),
        db.from("drso_policiais_externos").select("id,nome_guerra,nome_completo,numeral,matricula,posto_graduacao,unidade_origem,tipo,ativo"),
      ]);
      const [escalasBrutas,policiaisResult,viaturasResult,externosResult] = consultas;
      const [policiaisR,viaturasR,externosR] = [policiaisResult.data,viaturasResult.data,externosResult.data];
      if (policiaisResult.error) throw policiaisResult.error;
      if (viaturasResult.error) throw viaturasResult.error;
      if (externosResult.error) throw externosResult.error;
      const escalasR = externo ? escalasBrutas.filter(e=>e.status==="aberta") : escalasBrutas;
      const ids = new Set(escalasR.map(x => x.id));
      const idsEscalas = [...ids];
      const voluntariosR = idsEscalas.length ? await listarPaginado(() => db.from("drso_voluntarios").select("*").in("escala_id", idsEscalas).order("escala_id").order("id")) : [];
      const efetivo = policiaisR.filter(p => !p.status || ["ativo", "operando", "em atividade", "em_atividade"].includes(String(p.status).toLowerCase().trim())).map(p => ({...p, origem_efetivo:"local", nome_exibicao:[p.posto_graduacao,p.numeral,p.nome_guerra||p.nome_completo].filter(Boolean).join(" ")}));
      const externosAtivos = externosR.filter(p=>p.ativo).map(p=>({...p, unidade:p.unidade_origem, role:"drso_externo", origem_efetivo:"externo", is_oficial_externo:p.tipo==="oficial", nome_exibicao:[p.posto_graduacao,p.numeral,p.nome_guerra||p.nome_completo].filter(Boolean).join(" ")}));
      const todosPoliciais = [...efetivo,...externosAtivos];
      const chavePolicial = (id, externoPessoa) => `${externoPessoa ? "externo" : "local"}:${id}`;
      const nomesPorId = new Map([
        ...efetivo.map(p=>[chavePolicial(p.id,false),p.nome_exibicao]),
        ...externosR.map(p=>[chavePolicial(p.id,true),[p.posto_graduacao,p.numeral,p.nome_guerra||p.nome_completo].filter(Boolean).join(" ")]),
      ]);
      const vinculos = voluntariosR.map(v=>{
        const isExterno=Boolean(v.policial_externo_id);
        const idPessoa=v.policial_externo_id||v.policial_id;
        return {...v,chave_policial:chavePolicial(idPessoa,isExterno),is_externo:isExterno,nome_exibicao:nomesPorId.get(chavePolicial(idPessoa,isExterno))||"Policial"};
      });
      const chaveUsuario = chavePolicial(usuario.id, externo);
      const policiaisVisiveis = externo ? todosPoliciais.filter(p => chavePolicial(p.id,p.origem_efetivo==="externo") === chaveUsuario || vinculos.some(v => v.chave_policial === chavePolicial(p.id,p.origem_efetivo==="externo"))) : todosPoliciais;
      const resposta = { escalas: escalasR, voluntarios: vinculos, policiais: policiaisVisiveis, viaturas: externo ? [] : viaturasR, usuario_id: usuario.id, conta_externa: externo, permissoes: { gerenciar: gestor, externo: externo, consultar_var: !externo, cadastrar_externos: gestor, escalante_drso: !externo && (ehEscalante(usuario) || normalizarRole(usuario) === "master" || usuario.is_master === true) } };
      if (gestor) {
        const { data: areasOperacao, error: erroAreas } = await db.from("macroareas_operacao")
          .select("id,nome,ativa,microareas_operacao(id,macroarea_id,nome,ativa)")
          .eq("ativa", true)
          .order("nome");
        if (erroAreas) throw erroAreas;
        resposta.policiais_externos = externosAtivos;
        resposta.areas_operacao = areasOperacao || [];
      }
      return res.status(200).json(resposta);
    }
    if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return respostaErro(res,405,"Método não permitido."); }
    const body = req.body || {}; const acao = txt(body.acao);
    if (acao === "voluntariar") {
      const escalaId = txt(body.escala_id); if (!escalaId) return respostaErro(res,400,"Selecione uma escala.");
      const {data: escala,error: ee}=await db.from("drso_escalas").select("id,status").eq("id",escalaId).maybeSingle(); if(ee)throw ee;
      if(!escala||escala.status!=="aberta")return respostaErro(res,409,"Esta escala não está recebendo voluntários.");
      const vinculoBase=externo?{policial_id:null,policial_externo_id:usuario.id}:{policial_id:usuario.id,policial_externo_id:null};
      const {data,error}=await db.from("drso_voluntarios").upsert({escala_id:escalaId,...vinculoBase,status:"voluntario",atualizado_em:new Date().toISOString()},{onConflict:externo?"escala_id,policial_externo_id":"escala_id,policial_id"}).select("*").single(); if(error)throw error;
      return res.status(201).json({voluntario:data});
    }
    if (acao === "retirar_voluntariado") {
      const escalaId=txt(body.escala_id); const {data:escala,error:ee}=await db.from("drso_escalas").select("status").eq("id",escalaId).maybeSingle();if(ee)throw ee;
      if(!escala||escala.status!=="aberta")return respostaErro(res,409,"Após o fechamento, solicite desistência ao escalante.");
      const {error}=await db.from("drso_voluntarios").delete().eq("escala_id",escalaId).eq(externo?"policial_externo_id":"policial_id",usuario.id);if(error)throw error;return res.status(200).json({sucesso:true});
    }
    if (acao === "solicitar_desistencia") {
      const escalaId = txt(body.escala_id);
      const { data: escala, error: e1 } = await db.from("drso_escalas").select("id,status").eq("id", escalaId).maybeSingle();
      if (e1) throw e1;
      if (!escala || escala.status !== "fechada") return respostaErro(res, 409, "A desistência só pode ser solicitada após o fechamento da escala.");
      const { data: vinculo, error: e2 } = await db.from("drso_voluntarios").select("id,status").eq("escala_id", escalaId).eq(externo?"policial_externo_id":"policial_id", usuario.id).eq("status", "selecionado").maybeSingle();
      if (e2) throw e2;
      if (!vinculo) return respostaErro(res, 404, "Você não está escalado nesta atividade.");
      const { error } = await db.from("drso_voluntarios").update({ status: "desistencia_solicitada", atualizado_em: new Date().toISOString() }).eq("id", vinculo.id);
      if (error) throw error;
      return res.status(200).json({ sucesso: true });
    }
    if (["criar_policial_externo", "listar_policiais_externos", "alternar_policial_externo", "editar_policial_externo", "excluir_policial_externo"].includes(acao)) {
      if (!gestor) return respostaErro(res,403,"Apenas o escalante DRSO autorizado pode administrar policiais externos.");
      if (acao === "listar_policiais_externos") {
        const {data,error}=await db.from("drso_policiais_externos").select("id,nome_completo,nome_guerra,matricula,numeral,posto_graduacao,unidade_origem,tipo,ativo,created_at").order("nome_guerra");
        if(error)throw error; return res.status(200).json({policiais_externos:data||[]});
      }
      if (acao === "editar_policial_externo") {
        const id=txt(body.policial_id);
        const nome_completo=txt(body.nome_completo),nome_guerra=txt(body.nome_guerra),matricula=txt(body.matricula),posto_graduacao=txt(body.posto_graduacao),unidade_origem=txt(body.unidade_origem),tipo=body.tipo==="oficial"?"oficial":"policial",numeral=txt(body.numeral);
        if(!id||!nome_completo||!nome_guerra||!matricula||!posto_graduacao||!unidade_origem)return respostaErro(res,400,"Informe nome completo, nome de guerra, matrícula, posto/graduação e unidade de origem.");
        const {data:atual,error:e1}=await db.from("drso_policiais_externos").select("id").eq("id",id).maybeSingle();if(e1)throw e1;if(!atual)return respostaErro(res,404,"Policial externo não encontrado.");
        const {data:matriculaLocal,error:e2}=await db.from("policiais").select("id").eq("matricula",matricula).maybeSingle();if(e2)throw e2;if(matriculaLocal)return respostaErro(res,409,"Essa matrícula já pertence ao efetivo oficial do sistema.");
        const {data:matriculaExterna,error:e3}=await db.from("drso_policiais_externos").select("id").eq("matricula",matricula).neq("id",id).maybeSingle();if(e3)throw e3;if(matriculaExterna)return respostaErro(res,409,"Já existe um policial externo com essa matrícula.");
        const {data,error}=await db.from("drso_policiais_externos").update({nome_completo,nome_guerra,matricula,numeral:numeral||null,posto_graduacao,unidade_origem,tipo,updated_at:new Date().toISOString()}).eq("id",id).select("id,nome_completo,nome_guerra,matricula,numeral,posto_graduacao,unidade_origem,tipo,ativo,created_at").single();
        if(error){if(error.code==="23505")return respostaErro(res,409,"Já existe um policial externo com essa matrícula.");throw error;}return res.status(200).json({policial_externo:data});
      }
      if (acao === "excluir_policial_externo") {
        const id=txt(body.policial_id);if(!id)return respostaErro(res,400,"Policial externo inválido.");
        const {data:atual,error:e1}=await db.from("drso_policiais_externos").select("id").eq("id",id).maybeSingle();if(e1)throw e1;if(!atual)return respostaErro(res,404,"Policial externo não encontrado.");
        const {data:vinculo,error:e2}=await db.from("drso_voluntarios").select("id").eq("policial_externo_id",id).limit(1).maybeSingle();if(e2)throw e2;if(vinculo)return respostaErro(res,409,"Não é possível excluir cadastro com histórico de DRSO. Desative o acesso para preservar o histórico.");
        const {error}=await db.from("drso_policiais_externos").delete().eq("id",id);if(error)throw error;return res.status(200).json({sucesso:true});
      }
      if (acao === "alternar_policial_externo") {
        const id=txt(body.policial_id); if(!id)return respostaErro(res,400,"Policial externo inválido.");
        const {data:atual,error:e1}=await db.from("drso_policiais_externos").select("id,ativo,auth_version").eq("id",id).maybeSingle();if(e1)throw e1;if(!atual)return respostaErro(res,404,"Policial externo não encontrado.");
        const {error}=await db.from("drso_policiais_externos").update({ativo:!atual.ativo,auth_version:(atual.auth_version||0)+1,updated_at:new Date().toISOString()}).eq("id",id);if(error)throw error;return res.status(200).json({sucesso:true,ativo:!atual.ativo});
      }
      const nome_completo=txt(body.nome_completo),nome_guerra=txt(body.nome_guerra),matricula=txt(body.matricula),posto_graduacao=txt(body.posto_graduacao),unidade_origem=txt(body.unidade_origem),senha=String(body.senha||""),tipo=body.tipo==="oficial"?"oficial":"policial",numeral=txt(body.numeral);
      const {data:matriculaLocal,error:erroMatriculaLocal}=await db.from("policiais").select("id").eq("matricula",matricula).maybeSingle();if(erroMatriculaLocal)throw erroMatriculaLocal;if(matriculaLocal)return respostaErro(res,409,"Essa matrícula já pertence ao efetivo oficial do sistema.");
      if(!nome_completo||!nome_guerra||!matricula||!posto_graduacao||!unidade_origem||senha.length<8)return respostaErro(res,400,"Informe nome completo, nome de guerra, matrícula, posto/graduação, unidade de origem e senha com pelo menos 8 caracteres.");
      const {data,error}=await db.from("drso_policiais_externos").insert({nome_completo,nome_guerra,matricula,posto_graduacao,unidade_origem,tipo,numeral:numeral||null,senha:await hashSenha(senha),criado_por:usuario.id}).select("id,nome_completo,nome_guerra,matricula,numeral,posto_graduacao,unidade_origem,tipo,ativo,created_at").single();
      if(error){if(error.code==="23505")return respostaErro(res,409,"Já existe um policial externo com essa matrícula.");throw error;}return res.status(201).json({policial_externo:data});
    }
    if(!gestor)return respostaErro(res,403,"Apenas o escalante DRSO autorizado pode gerenciar escalas.");
    if (acao === "atualizar_escala") {
      const escalaId = txt(body.escala_id);
      const dataServico = txt(body.data_servico);
      const horarioInicio = txt(body.horario_inicio);
      const horarioFim = txt(body.horario_fim);
      const local = txt(body.local);
      const viatura = txt(body.viatura);
      const vagas = Number(body.vagas);
      const formatoDataValido = /^\d{4}-\d{2}-\d{2}$/.test(dataServico) && !Number.isNaN(Date.parse(`${dataServico}T00:00:00Z`)) && new Date(`${dataServico}T00:00:00Z`).toISOString().slice(0, 10) === dataServico;
      const formatoHoraValido = (hora) => /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(hora);
      const regrasValidas = body.regras && typeof body.regras === "object" && !Array.isArray(body.regras) && ["composicao_hierarquica", "excecao_equipe_soldados", "escolha_equipe_oficial", "compulsoria"].every(chave => typeof body.regras[chave] === "boolean");
      if (!escalaId || !formatoDataValido || !formatoHoraValido(horarioInicio) || !formatoHoraValido(horarioFim) || !local || !viatura || !Number.isInteger(vagas) || vagas < 1 || vagas > 100 || !regrasValidas) {
        return respostaErro(res, 400, "Informe data, horários, área/local, viatura, vagas e regras válidas para a escala.");
      }
      const { data: escalaAtual, error: erroEscala } = await db.from("drso_escalas").select("id,data_servico,status").eq("id", escalaId).maybeSingle();
      if (erroEscala) throw erroEscala;
      if (!escalaAtual) return respostaErro(res, 404, "Escala não encontrada.");
      if (escalaAtual.status !== "aberta") return respostaErro(res, 409, "Só é possível editar escalas abertas.");
      const { data: participantes, error: erroParticipantes } = await db.from("drso_voluntarios").select("policial_id,policial_externo_id").eq("escala_id", escalaId).eq("status", "selecionado");
      if (erroParticipantes) throw erroParticipantes;
      if (vagas < (participantes || []).length) return respostaErro(res, 409, "A quantidade de vagas não pode ser menor que a equipe já selecionada.");
      if (dataServico !== escalaAtual.data_servico) {
        for (const participante of participantes || []) {
          const policialId = participante.policial_externo_id || participante.policial_id;
          if (!policialId) continue;
          const conflito = await verificarConflitoNoDia(db, dataServico, policialId, escalaId);
          if (conflito) return respostaErro(res, 409, conflito);
        }
      }
      const { data, error } = await db.from("drso_escalas").update({
        data_servico: dataServico,
        horario_inicio: horarioInicio,
        horario_fim: horarioFim,
        local,
        viatura,
        vagas,
        observacoes: txt(body.observacoes) || null,
        regras: body.regras,
      }).eq("id", escalaId).select("*").single();
      if (error) throw error;
      return res.status(200).json({ escala: data });
    }
    if (acao === "excluir_escala") {
      const escalaId = txt(body.escala_id);
      if (!escalaId) return respostaErro(res, 400, "Selecione uma escala para excluir.");
      const { data, error } = await db.from("drso_escalas").delete().eq("id", escalaId).select("id").maybeSingle();
      if (error?.code === "23503") return respostaErro(res, 409, "Não foi possível excluir a escala porque há registros vinculados. Nenhum participante foi removido.");
      if (error) throw error;
      if (!data) return respostaErro(res, 404, "Escala não encontrada.");
      return res.status(200).json({ sucesso: true, escala_id: data.id });
    }
    if (acao === "escalar_diretamente") {
      const escalaId = txt(body.escala_id), policialId = txt(body.policial_id), funcao = txt(body.funcao);
      if (!escalaId || !policialId || !["Comandante", "Patrulheiro", "Motorista"].includes(funcao)) return respostaErro(res, 400, "Selecione a escala, o policial e uma função válida.");
      const { data: escala, error: e1 } = await db.from("drso_escalas").select("id,status,data_servico").eq("id", escalaId).maybeSingle();
      if (e1) throw e1;
      if (!escala || escala.status !== "aberta") return respostaErro(res, 409, "Só é possível incluir diretamente em uma escala aberta.");
      const conflito = await verificarConflitoNoDia(db, escala.data_servico, policialId, escalaId); if (conflito) return respostaErro(res, 409, conflito);
      let { data: policial, error: e2 } = await db.from("policiais").select("id,status").eq("id", policialId).maybeSingle();
      if (e2) throw e2;
      if (!policial) { const externoBusca = await db.from("drso_policiais_externos").select("id,ativo,tipo").eq("id",policialId).maybeSingle(); if(externoBusca.error)throw externoBusca.error; policial=externoBusca.data; if(!policial||policial.ativo===false)return respostaErro(res,404,"Policial não encontrado ou inativo."); }
      const {data:externoId,error:erroExternoId}=await db.from("drso_policiais_externos").select("id").eq("id",policialId).maybeSingle();if(erroExternoId)throw erroExternoId;
      if (externoId && body.determinacao_oficial !== true) return respostaErro(res,400,"A inclusão direta de policial externo exige confirmação de determinação do oficial responsável.");
      const camposId=externoId?{policial_id:null,policial_externo_id:policialId}:{policial_id:policialId,policial_externo_id:null};
      const { data, error } = await db.from("drso_voluntarios").upsert({ escala_id: escalaId, ...camposId, status: "selecionado", origem: "direto", funcao, atualizado_em: new Date().toISOString() }, { onConflict: externoId?"escala_id,policial_externo_id":"escala_id,policial_id" }).select("*").single();
      if (error) throw error;
      return res.status(201).json({ vinculo: data });
    }
    if (acao === "selecionar_voluntario") {
      const escalaId = txt(body.escala_id), policialId = txt(body.policial_id), selecionar = body.selecionar === true;
      const { data: escala, error: e1 } = await db.from("drso_escalas").select("id,status,vagas,data_servico").eq("id", escalaId).maybeSingle();
      if (e1) throw e1;
      if (!escala || escala.status !== "aberta") return respostaErro(res, 409, "A pré-escala só pode ser alterada enquanto estiver aberta.");
      const { data: vinculo, error: e2 } = await db.from("drso_voluntarios").select("id,origem,status").eq("escala_id", escalaId).or(`policial_id.eq.${policialId},policial_externo_id.eq.${policialId}`).maybeSingle();
      if (e2) throw e2;
      if (!vinculo || vinculo.origem === "direto") return respostaErro(res, 404, "Voluntário não encontrado para seleção manual.");
      if (selecionar) {
        const conflito = await verificarConflitoNoDia(db, escala.data_servico, policialId, escalaId); if (conflito) return respostaErro(res, 409, conflito);
        const { count, error: e3 } = await db.from("drso_voluntarios").select("id", { count: "exact", head: true }).eq("escala_id", escalaId).eq("status", "selecionado");
        if (e3) throw e3;
        if ((count || 0) >= escala.vagas && vinculo.status !== "selecionado") return respostaErro(res, 409, "Todas as vagas já estão preenchidas na pré-escala.");
      }
      const { error } = await db.from("drso_voluntarios").update({ status: selecionar ? "selecionado" : "voluntario", atualizado_em: new Date().toISOString() }).eq("id", vinculo.id);
      if (error) throw error;
      return res.status(200).json({ sucesso: true });
    }
    if (acao === "definir_funcao") {
      const escalaId = txt(body.escala_id), policialId = txt(body.policial_id), funcao = txt(body.funcao);
      if (!escalaId || !policialId || !["Comandante", "Patrulheiro", "Motorista"].includes(funcao)) return respostaErro(res, 400, "Selecione uma escala, um policial e uma função válida.");
      const { data: escala, error: e1 } = await db.from("drso_escalas").select("id,status").eq("id", escalaId).maybeSingle();
      if (e1) throw e1;
      if (!escala || escala.status !== "aberta") return respostaErro(res, 409, "As funções só podem ser ajustadas enquanto a escala estiver aberta.");
      const { data: vinculo, error: e2 } = await db.from("drso_voluntarios").select("id").eq("escala_id", escalaId).or(`policial_id.eq.${policialId},policial_externo_id.eq.${policialId}`).eq("status", "selecionado").maybeSingle();
      if (e2) throw e2;
      if (!vinculo) return respostaErro(res, 404, "O policial não está selecionado nesta pré-escala.");
      if (funcao === "Comandante") {
        const { data: equipe, error: e3 } = await db.from("drso_voluntarios").select("policial_id,policial_externo_id").eq("escala_id", escalaId).eq("status", "selecionado");
        if (e3) throw e3;
        const idsEquipe = [...new Set((equipe || []).map(v => v.policial_externo_id || v.policial_id).filter(Boolean))];
        const [{ data: locais, error: e4 }, { data: externosEquipe, error: e5 }] = await Promise.all([
          idsEquipe.length ? db.from("policiais").select("id,nome_guerra,nome_completo,numeral,posto_graduacao").in("id", idsEquipe) : Promise.resolve({ data: [], error: null }),
          idsEquipe.length ? db.from("drso_policiais_externos").select("id,nome_guerra,nome_completo,numeral,posto_graduacao").in("id", idsEquipe) : Promise.resolve({ data: [], error: null }),
        ]);
        if (e4) throw e4;
        if (e5) throw e5;
        const antiguidade = [...(locais || []), ...(externosEquipe || [])].sort(compararAntiguidade);
        if (antiguidade[0]?.id !== policialId) return respostaErro(res, 409, "O comandante deve ser o policial mais antigo da equipe.");
      }
      const { error } = await db.from("drso_voluntarios").update({ funcao, atualizado_em: new Date().toISOString() }).eq("id", vinculo.id);
      if (error) throw error;
      return res.status(200).json({ sucesso: true });
    }
    if (acao === "retirar_da_escala") {
      const escalaId = txt(body.escala_id), policialId = txt(body.policial_id);
      const { data: escala, error: e1 } = await db.from("drso_escalas").select("id,status").eq("id", escalaId).maybeSingle();
      if (e1) throw e1;
      if (!escala || escala.status !== "aberta") return respostaErro(res, 409, "Só é possível retirar da pré-escala enquanto ela estiver aberta.");
      const { data: vinculo, error: e2 } = await db.from("drso_voluntarios").select("id,status,origem").eq("escala_id", escalaId).or(`policial_id.eq.${policialId},policial_externo_id.eq.${policialId}`).eq("status", "selecionado").maybeSingle();
      if (e2) throw e2;
      if (!vinculo) {
        const { data: jaRetirado, error: e3 } = await db.from("drso_voluntarios")
          .select("id,origem").eq("escala_id", escalaId)
          .or(`policial_id.eq.${policialId},policial_externo_id.eq.${policialId}`)
          .eq("status", "retirado").maybeSingle();
        if (e3) throw e3;
        if (jaRetirado?.origem !== "direto" && jaRetirado) {
          const { error } = await db.from("drso_voluntarios").update({ status: "voluntario", atualizado_em: new Date().toISOString() }).eq("id", jaRetirado.id);
          if (error) throw error;
          return res.status(200).json({ sucesso: true, inscricao_restaurada: true });
        }
        if (jaRetirado) return res.status(200).json({ sucesso: true, ja_retirado: true });
        return respostaErro(res, 404, "O policial não está selecionado nesta pré-escala.");
      }
      const { error } = await db.from("drso_voluntarios").update({ status: vinculo.origem === "direto" ? "retirado" : "voluntario", atualizado_em: new Date().toISOString() }).eq("id", vinculo.id);
      if (error) throw error;
      return res.status(200).json({ sucesso: true });
    }
    if (acao === "decidir_desistencia") {
      const escalaId = txt(body.escala_id), policialId = txt(body.policial_id), aprovar = body.aprovar === true;
      const { data: vinculo, error: e1 } = await db.from("drso_voluntarios").select("id,status,origem").eq("escala_id", escalaId).or(`policial_id.eq.${policialId},policial_externo_id.eq.${policialId}`).eq("status", "desistencia_solicitada").maybeSingle();
      if (e1) throw e1;
      if (!vinculo) return respostaErro(res, 404, "Não existe solicitação de desistência pendente para esse policial.");
      const { error } = await db.from("drso_voluntarios").update({ status: aprovar ? "retirado" : "selecionado", atualizado_em: new Date().toISOString() }).eq("id", vinculo.id);
      if (error) throw error;
      return res.status(200).json({ sucesso: true });
    }
    if(acao==="criar_escala"){
      const data_servico=txt(body.data_servico),horario_inicio=txt(body.horario_inicio),horario_fim=txt(body.horario_fim),local=txt(body.local),viatura=txt(body.viatura),vagas=Number(body.vagas);
      if(!data_servico||!horario_inicio||!horario_fim||!local||!viatura||!Number.isInteger(vagas)||vagas<1)return respostaErro(res,400,"Informe data, horários, local, viatura e quantidade de vagas.");
      const {data,error}=await db.from("drso_escalas").insert({data_servico,horario_inicio,horario_fim,local,viatura,vagas,observacoes:txt(body.observacoes)||null,regras:body.regras&&typeof body.regras==="object"?body.regras:{},status:"aberta",criado_por:usuario.id}).select("*").single();if(error)throw error;return res.status(201).json({escala:data});
    }
    if(acao==="fechar_escala"){
      const id=txt(body.escala_id);
      const {data:escala,error:e1}=await db.from("drso_escalas").select("*").eq("id",id).maybeSingle();
      if(e1)throw e1;if(!escala)return respostaErro(res,404,"Escala não encontrada.");
      if(escala.status!=="aberta")return respostaErro(res,409,"Esta escala já está fechada.");
      const {data:todosVinculos,error:e2}=await db.from("drso_voluntarios").select("id,policial_id,policial_externo_id,status,funcao,origem").eq("escala_id",id).in("status",["voluntario","selecionado"]);
      if(e2)throw e2;
      const normalizados=(todosVinculos||[]).map(v=>({...v,policial_id:v.policial_externo_id||v.policial_id,is_externo:Boolean(v.policial_externo_id)}));
      const diretos=normalizados.filter(v=>v.origem==="direto"&&v.status==="selecionado");
      if(diretos.length>escala.vagas)return respostaErro(res,409,"Há mais policiais incluídos diretamente do que vagas disponíveis. Ajuste a equipe antes de fechar.");
      const candidatos=normalizados.filter(v=>v.origem!=="direto");
      const ids=[...new Set((todosVinculos||[]).map(v=>v.policial_id))];
      const [{data:efetivo,error:e3},{data:externosFechamento,error:e4},{data:escalasFechadas,error:e5},{data:vinculosHistorico,error:e6}]=await Promise.all([
        ids.length?db.from("policiais").select("id,nome_guerra,nome_completo,numeral,posto_graduacao").in("id",ids):Promise.resolve({data:[],error:null}),
        ids.length?db.from("drso_policiais_externos").select("id,nome_guerra,nome_completo,numeral,posto_graduacao,tipo").in("id",ids):Promise.resolve({data:[],error:null}),
        db.from("drso_escalas").select("id,data_servico,horario_inicio,horario_fim,status"),
        db.from("drso_voluntarios").select("policial_id,policial_externo_id,escala_id,status").eq("status","selecionado")
      ]);if(e3)throw e3;if(e4)throw e4;if(e5)throw e5;if(e6)throw e6;
      const idsLocais=new Set((efetivo||[]).map(p=>p.id));
      const porId=new Map([...(efetivo||[]).map(p=>[p.id,{...p,origem_efetivo:"local"}]),...(externosFechamento||[]).map(p=>[p.id,{...p,origem_efetivo:"externo"}])]);
      // Oficiais externos não entram na seleção automática: somente inclusão direta pelo escalante.
      const candidatosAptos=candidatos.filter(v=>porId.get(v.policial_id)?.tipo!=="oficial");
      const horas=new Map();
      for(const v of vinculosHistorico||[]){if(v.escala_id===id)continue;const e=(escalasFechadas||[]).find(x=>x.id===v.escala_id);if(!e)continue;let m=(Number(e.horario_fim.slice(0,2))*60+Number(e.horario_fim.slice(3,5)))-(Number(e.horario_inicio.slice(0,2))*60+Number(e.horario_inicio.slice(3,5)));if(m<=0)m+=1440;const pid=v.policial_externo_id||v.policial_id;if(pid)horas.set(pid,(horas.get(pid)||0)+m/60);}
      const prioridade=(a,b)=>{
        const pa=porId.get(a.policial_id),pb=porId.get(b.policial_id);
        const rankA=idsLocais.has(a.policial_id)?0:1,rankB=idsLocais.has(b.policial_id)?0:1;
        return rankA-rankB || (horas.get(a.policial_id)||0)-(horas.get(b.policial_id)||0) || compararAntiguidade(pa,pb);
      };
      candidatosAptos.sort(prioridade);
      const escolhidos=[...diretos];
      for(const c of candidatosAptos){if(escolhidos.length>=escala.vagas)break;const conflito=await verificarConflitoNoDia(db,escala.data_servico,c.policial_id,id);if(conflito)continue;escolhidos.push(c);}
      if(escolhidos.length!==escala.vagas)return respostaErro(res,409,`Não há voluntários aptos suficientes para preencher as ${escala.vagas} vagas. Foram encontrados ${escolhidos.length}.`);
      const idsEscolhidos=new Set(escolhidos.map(v=>v.id));
      for(const v of normalizados){const novoStatus=idsEscolhidos.has(v.id)?"selecionado":"voluntario";if(v.status!==novoStatus){const {error}=await db.from("drso_voluntarios").update({status:novoStatus,atualizado_em:new Date().toISOString()}).eq("id",v.id);if(error)throw error;}}
      const ordenados=[...escolhidos].sort((a,b)=>compararAntiguidade(porId.get(a.policial_id),porId.get(b.policial_id)));
      const atribuicoes=new Map();
      if(ordenados.length){atribuicoes.set(ordenados[0].id,"Comandante");if(ordenados.length>=3){const modernos=ordenados.slice(-2);const atuais=modernos.map(v=>v.funcao);const validas=atuais.map((funcao,i)=>["Patrulheiro","Motorista"].includes(funcao)&&!atuais.some((outra,j)=>j!==i&&outra===funcao)?funcao:null);const primeira=validas[0]||(validas[1]==="Patrulheiro"?"Motorista":"Patrulheiro");const segunda=validas[1]||(primeira==="Patrulheiro"?"Motorista":"Patrulheiro");atribuicoes.set(modernos[0].id,primeira);atribuicoes.set(modernos[1].id,segunda);}else if(ordenados.length===2)atribuicoes.set(ordenados[1].id,["Patrulheiro","Motorista"].includes(ordenados[1].funcao)?ordenados[1].funcao:"Patrulheiro");}
      for(const [vinculoId,funcao] of atribuicoes){const {error}=await db.from("drso_voluntarios").update({funcao,atualizado_em:new Date().toISOString()}).eq("id",vinculoId);if(error)throw error;}
      const {data,error}=await db.from("drso_escalas").update({status:"fechada",fechada_em:new Date().toISOString(),fechada_por:usuario.id}).eq("id",id).select("*").single();if(error)throw error;return res.status(200).json({escala:data,selecionados:escolhidos.length});
    }
    if(acao==="reabrir_escala"){
      const id=txt(body.escala_id);const {data,error}=await db.from("drso_escalas").update({status:"aberta",fechada_em:null,fechada_por:null}).eq("id",id).select("*").single();if(error)throw error;return res.status(200).json({escala:data});
    }
    return respostaErro(res,400,"Ação não reconhecida.");
  } catch(error){console.error("Erro no módulo DRSO:",error);return respostaErro(res,500,"Não foi possível concluir a operação DRSO.");}
}
