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
        db.from("drso_escalas").select("*").gte("data_servico", inicio).lt("data_servico", fim).order("data_servico").order("horario_inicio"),
        db.from("drso_voluntarios").select("*"),
        db.from("policiais").select("id, nome_guerra, nome_completo, numeral, matricula, posto_graduacao, role, status, drso_escalante, unidade"),
        db.from("viaturas").select("id, identificacao, placa, situacao, ativo").eq("situacao", "operando").eq("ativo", true).order("identificacao"),
        db.from("drso_policiais_externos").select("id,nome_guerra,nome_completo,numeral,matricula,posto_graduacao,unidade_origem,tipo,ativo"),
      ]);
      const [e1,e2,e3,e4,e5] = consultas.map(x=>x.error);
      if (e1) throw e1; if (e2) throw e2; if (e3) throw e3; if (e4) throw e4; if (e5) throw e5;
      const [escalasBrutas,voluntariosR,policiaisR,viaturasR,externosR] = consultas.map(x=>x.data||[]);
      const escalasR = externo ? escalasBrutas.filter(e=>e.status==="aberta") : escalasBrutas;
      const ids = new Set(escalasR.map(x => x.id));
      const efetivo = policiaisR.filter(p => !p.status || ["ativo", "operando", "em atividade", "em_atividade"].includes(String(p.status).toLowerCase().trim())).map(p => ({...p, origem_efetivo:"local", nome_exibicao:[p.posto_graduacao,p.numeral,p.nome_guerra||p.nome_completo].filter(Boolean).join(" ")}));
      const externosAtivos = externosR.filter(p=>p.ativo).map(p=>({...p, unidade:p.unidade_origem, role:"drso_externo", origem_efetivo:"externo", is_oficial_externo:p.tipo==="oficial", nome_exibicao:[p.posto_graduacao,p.numeral,p.nome_guerra||p.nome_completo].filter(Boolean).join(" ")}));
      const todosPoliciais = [...efetivo,...externosAtivos];
      const nomesPorId = new Map(todosPoliciais.map(p=>[p.id,p.nome_exibicao]));
      const vinculos = voluntariosR.filter(v => ids.has(v.escala_id)).map(v=>{const policialId=v.policial_externo_id||v.policial_id;return {...v,policial_id:policialId,is_externo:Boolean(v.policial_externo_id),nome_exibicao:nomesPorId.get(policialId)||"Policial"};});
      const policiaisVisiveis = externo ? todosPoliciais.filter(p => p.id === usuario.id || vinculos.some(v => v.policial_id === p.id)) : todosPoliciais;
      const resposta = { escalas: escalasR, voluntarios: vinculos, policiais: policiaisVisiveis, viaturas: externo ? [] : viaturasR, usuario_id: usuario.id, conta_externa: externo, permissoes: { gerenciar: gestor, externo: externo, consultar_var: !externo, cadastrar_externos: gestor, escalante_drso: !externo && (ehEscalante(usuario) || normalizarRole(usuario) === "master" || usuario.is_master === true) } };
      if (gestor) resposta.policiais_externos = externosAtivos;
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
    if (acao === "criar_policial_externo" || acao === "listar_policiais_externos" || acao === "alternar_policial_externo") {
      if (!gestor) return respostaErro(res,403,"Apenas o escalante DRSO autorizado pode administrar policiais externos.");
      if (acao === "listar_policiais_externos") {
        const {data,error}=await db.from("drso_policiais_externos").select("id,nome_completo,nome_guerra,matricula,numeral,posto_graduacao,unidade_origem,tipo,ativo,created_at").order("nome_guerra");
        if(error)throw error; return res.status(200).json({policiais_externos:data||[]});
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
    if (acao === "retirar_da_escala") {
      const escalaId = txt(body.escala_id), policialId = txt(body.policial_id);
      const { data: escala, error: e1 } = await db.from("drso_escalas").select("id,status").eq("id", escalaId).maybeSingle();
      if (e1) throw e1;
      if (!escala || escala.status !== "aberta") return respostaErro(res, 409, "Só é possível retirar da pré-escala enquanto ela estiver aberta.");
      const { data: vinculo, error: e2 } = await db.from("drso_voluntarios").select("id,status").eq("escala_id", escalaId).or(`policial_id.eq.${policialId},policial_externo_id.eq.${policialId}`).eq("status", "selecionado").maybeSingle();
      if (e2) throw e2;
      if (!vinculo) {
        const { data: jaRetirado, error: e3 } = await db.from("drso_voluntarios")
          .select("id").eq("escala_id", escalaId)
          .or(`policial_id.eq.${policialId},policial_externo_id.eq.${policialId}`)
          .eq("status", "retirado").maybeSingle();
        if (e3) throw e3;
        if (jaRetirado) return res.status(200).json({ sucesso: true, ja_retirado: true });
        return respostaErro(res, 404, "O policial não está selecionado nesta pré-escala.");
      }
      const { error } = await db.from("drso_voluntarios").update({ status: "retirado", atualizado_em: new Date().toISOString() }).eq("id", vinculo.id);
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
      const ordenados=[...escolhidos].sort((a,b)=>{
        const pa=porId.get(a.policial_id),pb=porId.get(b.policial_id);
        // A prioridade local/externo define quem ocupa as vagas, mas não pode
        // colocar uma praça à frente de um oficial na função de comandante.
        // A função é atribuída pela hierarquia real entre todos os selecionados.
        const oficialA=pa?.tipo==="oficial",oficialB=pb?.tipo==="oficial";
        if(oficialA!==oficialB)return oficialA?-1:1;
        return compararAntiguidade(pa,pb);
      });
      const atribuicoes=new Map();
      if(ordenados.length){atribuicoes.set(ordenados[0].id,"Comandante");if(ordenados.length>=3){const modernos=ordenados.slice(-2);const atuais=modernos.map(v=>v.funcao);const inversaoManual=atuais.includes("Patrulheiro")&&atuais.includes("Motorista");atribuicoes.set(modernos[0].id,inversaoManual?modernos[0].funcao:"Patrulheiro");atribuicoes.set(modernos[1].id,inversaoManual?modernos[1].funcao:"Motorista");}else if(ordenados.length===2)atribuicoes.set(ordenados[1].id,ordenados[1].funcao==="Motorista"?"Motorista":"Patrulheiro");}
      for(const [vinculoId,funcao] of atribuicoes){const {error}=await db.from("drso_voluntarios").update({funcao,atualizado_em:new Date().toISOString()}).eq("id",vinculoId);if(error)throw error;}
      const {data,error}=await db.from("drso_escalas").update({status:"fechada",fechada_em:new Date().toISOString(),fechada_por:usuario.id}).eq("id",id).select("*").single();if(error)throw error;return res.status(200).json({escala:data,selecionados:escolhidos.length});
    }
    if(acao==="reabrir_escala"){
      const id=txt(body.escala_id);const {data,error}=await db.from("drso_escalas").update({status:"aberta",fechada_em:null,fechada_por:null}).eq("id",id).select("*").single();if(error)throw error;return res.status(200).json({escala:data});
    }
    return respostaErro(res,400,"Ação não reconhecida.");
  } catch(error){console.error("Erro no módulo DRSO:",error);return respostaErro(res,500,"Não foi possível concluir a operação DRSO.");}
}
