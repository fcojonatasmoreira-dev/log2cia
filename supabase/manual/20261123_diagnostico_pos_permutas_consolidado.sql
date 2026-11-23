-- Diagnóstico pós-migration — Permutas de Serviço (consolidado).
-- SOMENTE LEITURA: uma única consulta final a catálogos PostgreSQL.
-- Não lê linhas das tabelas de Permutas, não chama RPCs e não altera objetos.
-- Compare verificações REVISAR MANUAL com a migration aprovada antes de aceitar.

WITH
expected_tables(table_name, expected_columns) AS (
  VALUES
    ('permutas_servico', ARRAY[
      'id uuid NOT NULL', 'tipo text NOT NULL', 'status text NOT NULL',
      'solicitante_id uuid NOT NULL', 'destinatario_id uuid NOT NULL',
      'criada_em timestamp with time zone NOT NULL', 'atualizada_em timestamp with time zone NOT NULL'
    ]::text[]),
    ('permutas_servico_manifestacoes', ARRAY[
      'id uuid NOT NULL', 'permuta_id uuid NOT NULL', 'policial_id uuid NOT NULL',
      'substituto_id uuid NOT NULL', 'origem_servico text NOT NULL', 'referencia_origem text NULL',
      'data_servico date NOT NULL', 'turno text NOT NULL', 'horario_inicio time without time zone NOT NULL',
      'horario_fim time without time zone NOT NULL', 'descricao text NOT NULL',
      'criada_em timestamp with time zone NOT NULL'
    ]::text[]),
    ('permutas_servico_confirmacoes', ARRAY[
      'permuta_id uuid NOT NULL', 'policial_id uuid NOT NULL',
      'confirmada_em timestamp with time zone NOT NULL'
    ]::text[]),
    ('permutas_servico_historico', ARRAY[
      'id bigint NOT NULL', 'permuta_id uuid NOT NULL', 'ator_id uuid NOT NULL',
      'tipo_evento text NOT NULL', 'estado_anterior text NULL', 'estado_novo text NOT NULL',
      'justificativa text NULL', 'servicos_conferidos boolean NOT NULL',
      'ocorrido_em timestamp with time zone NOT NULL'
    ]::text[])
),
expected_constraints(table_name, pks, fks, uniques, checks) AS (
  VALUES ('permutas_servico', 1, 2, 0, 3),
         ('permutas_servico_manifestacoes', 1, 3, 1, 6),
         ('permutas_servico_confirmacoes', 1, 2, 0, 0),
         ('permutas_servico_historico', 1, 2, 0, 4)
),
expected_indexes(index_name, table_name) AS (
  VALUES ('permutas_servico_solicitante_status_idx', 'permutas_servico'),
         ('permutas_servico_destinatario_status_idx', 'permutas_servico'),
         ('permutas_servico_status_data_idx', 'permutas_servico'),
         ('permutas_servico_manifestacoes_data_idx', 'permutas_servico_manifestacoes'),
         ('permutas_servico_historico_permuta_idx', 'permutas_servico_historico')
),
expected_functions(name, identity_types, arg_names, service_execute) AS (
  VALUES
    ('permutas_servico_bloquear_policial_v1', 'uuid[]', ARRAY['p_ids']::text[], false),
    ('permutas_servico_conflito_v1', 'uuid date time without time zone time without time zone', ARRAY['p_policial_id','p_data','p_inicio','p_fim']::text[], false),
    ('permutas_servico_criar_v1', 'text uuid uuid date text time without time zone time without time zone text', ARRAY['p_tipo','p_solicitante_id','p_destinatario_id','p_data','p_turno','p_inicio','p_fim','p_descricao']::text[], true),
    ('permutas_servico_confirmar_v1', 'uuid uuid date text time without time zone time without time zone text', ARRAY['p_permuta_id','p_ator_id','p_data','p_turno','p_inicio','p_fim','p_descricao']::text[], true),
    ('permutas_servico_decidir_v1', 'uuid uuid boolean text boolean', ARRAY['p_permuta_id','p_ator_id','p_deferir','p_justificativa','p_servicos_conferidos']::text[], true),
    ('permutas_servico_cancelar_v1', 'uuid uuid text', ARRAY['p_permuta_id','p_ator_id','p_justificativa']::text[], true)
),
relations AS (
  SELECT c.oid, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity,
         n.nspname
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('permutas_servico','permutas_servico_manifestacoes',
      'permutas_servico_confirmacoes','permutas_servico_historico')
    AND c.relkind IN ('r','p')
),
actual_columns AS (
  SELECT r.relname,
    array_agg(a.attname || ' ' || pg_catalog.format_type(a.atttypid,a.atttypmod)
      || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE ' NULL' END ORDER BY a.attnum) AS columns,
    bool_or(a.attname='id' AND a.attidentity='a') AS identity_always
  FROM relations r
  JOIN pg_catalog.pg_attribute a ON a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped
  GROUP BY r.relname
),
actual_constraints AS (
  SELECT r.relname,
    count(*) FILTER (WHERE con.contype='p') AS pks,
    count(*) FILTER (WHERE con.contype='f') AS fks,
    count(*) FILTER (WHERE con.contype='u') AS uniques,
    count(*) FILTER (WHERE con.contype='c') AS checks,
    count(*) FILTER (WHERE NOT con.convalidated) AS unvalidated
  FROM relations r
  LEFT JOIN pg_catalog.pg_constraint con ON con.conrelid=r.oid
  GROUP BY r.relname
),
checks AS (
  -- Estrutura das tabelas e colunas.
  SELECT 'TABELAS/COLUNAS'::text AS categoria,
    'Estrutura exata de public.'||e.table_name AS condicao_verificada,
    CASE WHEN a.relname IS NULL THEN 'BLOQUEAR'
      WHEN a.columns IS DISTINCT FROM e.expected_columns THEN 'BLOQUEAR'
      WHEN e.table_name='permutas_servico_historico' AND NOT coalesce(a.identity_always,false) THEN 'BLOQUEAR'
      ELSE 'APROVAR' END AS resultado,
    'Esperado: '||e.expected_columns::text||'; encontrado: '||coalesce(a.columns::text,'tabela ausente')
      ||CASE WHEN e.table_name='permutas_servico_historico' THEN '; id identity ALWAYS='||coalesce(a.identity_always::text,'false') ELSE '' END AS detalhe
  FROM expected_tables e LEFT JOIN actual_columns a ON a.relname=e.table_name

  UNION ALL
  SELECT 'DEPENDÊNCIAS','public.policiais.id: tipo uuid e chave primária',
    CASE WHEN pc.oid IS NULL THEN 'BLOQUEAR'
      WHEN pa.atttypid IS DISTINCT FROM 'uuid'::pg_catalog.regtype THEN 'BLOQUEAR'
      WHEN NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint pk
        WHERE pk.conrelid=pc.oid AND pk.contype='p' AND pk.conkey=ARRAY[pa.attnum]::smallint[]) THEN 'BLOQUEAR'
      ELSE 'APROVAR' END,
    'Tabela='||coalesce(pc.oid::regclass::text,'ausente')||'; tipo='||coalesce(pg_catalog.format_type(pa.atttypid,pa.atttypmod),'coluna ausente')
      ||'; PK simples em id='||EXISTS (SELECT 1 FROM pg_catalog.pg_constraint pk
        WHERE pk.conrelid=pc.oid AND pk.contype='p' AND pk.conkey=ARRAY[pa.attnum]::smallint[])::text
  FROM (SELECT c.oid FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname='policiais' AND c.relkind IN ('r','p')) pc
  FULL JOIN (SELECT a.attrelid,a.attnum,a.atttypid,a.atttypmod FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON c.oid=a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname='policiais' AND a.attname='id' AND a.attnum>0 AND NOT a.attisdropped) pa
    ON pa.attrelid=pc.oid

  UNION ALL
  SELECT 'DEPENDÊNCIAS','Roles anon, authenticated e service_role',
    CASE WHEN count(*)=3 THEN 'APROVAR' ELSE 'BLOQUEAR' END,
    'Encontradas: '||coalesce(string_agg(r.rolname,', ' ORDER BY r.rolname),'nenhuma')||'; esperado: anon, authenticated, service_role'
  FROM pg_catalog.pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role')

  UNION ALL
  SELECT 'DEPENDÊNCIAS','Funções PostgreSQL usadas pela migration',
    CASE WHEN bool_and(ok) THEN 'APROVAR' ELSE 'BLOQUEAR' END,
    string_agg(name||'='||CASE WHEN ok THEN 'disponível' ELSE 'ausente' END, '; ' ORDER BY name)
  FROM (VALUES
    ('gen_random_uuid', to_regprocedure('pg_catalog.gen_random_uuid()') IS NOT NULL OR to_regprocedure('gen_random_uuid()') IS NOT NULL),
    ('hashtextextended', to_regprocedure('pg_catalog.hashtextextended(text,bigint)') IS NOT NULL),
    ('pg_advisory_xact_lock', to_regprocedure('pg_catalog.pg_advisory_xact_lock(bigint)') IS NOT NULL),
    ('tsrange', to_regprocedure('pg_catalog.tsrange(timestamp without time zone,timestamp without time zone,text)') IS NOT NULL)
  ) d(name,ok)

  UNION ALL
  -- Conjunto, validade e compatibilidade do conjunto de constraints.
  SELECT 'CONSTRAINTS','Contagem e validação em public.'||e.table_name,
    CASE WHEN a.relname IS NULL OR a.pks<>e.pks OR a.fks<>e.fks OR a.uniques<>e.uniques OR a.checks<>e.checks OR a.unvalidated<>0 THEN 'BLOQUEAR' ELSE 'APROVAR' END,
    format('PK %s/%s; FK %s/%s; UNIQUE %s/%s; CHECK %s/%s; não validadas=%s',a.pks,e.pks,a.fks,e.fks,a.uniques,e.uniques,a.checks,e.checks,a.unvalidated)
  FROM expected_constraints e LEFT JOIN actual_constraints a ON a.relname=e.table_name

  UNION ALL
  SELECT 'CONSTRAINTS','Definições das constraints de Permutas',
    CASE WHEN count(*) FILTER (WHERE NOT con.convalidated)>0 THEN 'BLOQUEAR'
      WHEN count(*)=0 THEN 'BLOQUEAR' ELSE 'REVISAR MANUAL' END,
    coalesce(string_agg(c.relname||'.'||con.conname||' ['||con.contype::text||'] '||pg_catalog.pg_get_constraintdef(con.oid,true), '; ' ORDER BY c.relname,con.conname),'Nenhuma constraint encontrada')
  FROM relations r JOIN pg_catalog.pg_class c ON c.oid=r.oid
  LEFT JOIN pg_catalog.pg_constraint con ON con.conrelid=r.oid

  UNION ALL
  -- Cada FK precisa apontar a tabela/coluna aprovada e ter tipo compatível.
  SELECT 'CHAVES ESTRANGEIRAS','FKs para policiais.id e permutas_servico.id',
    CASE WHEN count(*)=9 AND count(*) FILTER (WHERE NOT convalidated OR src_type IS DISTINCT FROM ref_type OR NOT expected_match)=0 THEN 'APROVAR' ELSE 'BLOQUEAR' END,
    'FKs encontradas='||count(*)||'/9; válidas, destino e tipos compatíveis='||count(*) FILTER (WHERE convalidated AND src_type=ref_type AND expected_match)||'/9; detalhes: '
      ||coalesce(string_agg(src_table||'.'||constraint_name||': '||definition,'; ' ORDER BY src_table,constraint_name),'nenhuma')
  FROM (
    SELECT con.conname AS constraint_name, con.convalidated, pg_catalog.pg_get_constraintdef(con.oid,true) AS definition,
      c.relname AS src_table, rn.nspname AS ref_schema, rc.relname AS ref_table,
      la.attname AS src_col, ra.attname AS ref_col, la.atttypid AS src_type, ra.atttypid AS ref_type,
      c.oid AS src_oid,
      (pg_catalog.cardinality(con.conkey)=1 AND pg_catalog.cardinality(con.confkey)=1 AND rn.nspname='public' AND EXISTS (
        SELECT 1 FROM (VALUES
          ('permutas_servico','solicitante_id','policiais','id'),('permutas_servico','destinatario_id','policiais','id'),
          ('permutas_servico_manifestacoes','permuta_id','permutas_servico','id'),('permutas_servico_manifestacoes','policial_id','policiais','id'),('permutas_servico_manifestacoes','substituto_id','policiais','id'),
          ('permutas_servico_confirmacoes','permuta_id','permutas_servico','id'),('permutas_servico_confirmacoes','policial_id','policiais','id'),
          ('permutas_servico_historico','permuta_id','permutas_servico','id'),('permutas_servico_historico','ator_id','policiais','id')
        ) x(t,c,rt,rc) WHERE x.t=c.relname AND x.c=la.attname AND x.rt=rc.relname AND x.rc=ra.attname
      )) AS expected_match
    FROM relations r JOIN pg_catalog.pg_class c ON c.oid=r.oid
    JOIN pg_catalog.pg_constraint con ON con.conrelid=r.oid AND con.contype='f'
    JOIN pg_catalog.pg_class rc ON rc.oid=con.confrelid JOIN pg_catalog.pg_namespace rn ON rn.oid=rc.relnamespace
    JOIN LATERAL unnest(con.conkey) WITH ORDINALITY lk(attnum,pos) ON true
    JOIN LATERAL unnest(con.confkey) WITH ORDINALITY rk(attnum,pos) ON rk.pos=lk.pos
    JOIN pg_catalog.pg_attribute la ON la.attrelid=con.conrelid AND la.attnum=lk.attnum
    JOIN pg_catalog.pg_attribute ra ON ra.attrelid=con.confrelid AND ra.attnum=rk.attnum
  ) f

  UNION ALL
  -- PKs e UNIQUEs de colunas exatas.
  SELECT 'CONSTRAINTS','Chaves primárias e UNIQUE esperadas',
    CASE WHEN count(*)=5 AND count(*) FILTER (WHERE ok)=5 THEN 'APROVAR' ELSE 'BLOQUEAR' END,
    coalesce(string_agg(table_name||' '||kind||' ('||cols||')='||CASE WHEN ok THEN 'presente' ELSE 'AUSENTE/DIVERGENTE' END,'; ' ORDER BY table_name,kind),'verificação indisponível')
  FROM (VALUES
    ('permutas_servico','p','id'),('permutas_servico_manifestacoes','p','id'),
    ('permutas_servico_confirmacoes','p','permuta_id,policial_id'),('permutas_servico_historico','p','id'),
    ('permutas_servico_manifestacoes','u','permuta_id,policial_id')
  ) x(table_name,kind,cols)
  CROSS JOIN LATERAL (SELECT EXISTS (
    SELECT 1 FROM relations r JOIN pg_catalog.pg_constraint con ON con.conrelid=r.oid AND con.contype=x.kind::"char"
    WHERE r.relname=x.table_name AND (SELECT string_agg(a.attname,',' ORDER BY k.ord)
      FROM unnest(con.conkey) WITH ORDINALITY k(attnum,ord) JOIN pg_catalog.pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.attnum)=x.cols
  ) AS ok) q

  UNION ALL
  SELECT 'ÍNDICES','Índices esperados, válidos e na tabela correta',
    CASE WHEN count(*)=5 AND count(*) FILTER (WHERE idx.oid IS NOT NULL AND i.indisvalid AND i.indisready)=5 THEN 'APROVAR' ELSE 'BLOQUEAR' END,
    string_agg(e.index_name||' em '||e.table_name||': '||CASE WHEN idx.oid IS NULL THEN 'AUSENTE' WHEN NOT i.indisvalid OR NOT i.indisready THEN 'INVÁLIDO/INCOMPLETO' ELSE pg_catalog.pg_get_indexdef(idx.oid) END,'; ' ORDER BY e.index_name)
  FROM expected_indexes e
  LEFT JOIN pg_catalog.pg_class tab ON tab.relname=e.table_name AND tab.relnamespace='public'::regnamespace
  LEFT JOIN pg_catalog.pg_class idx ON idx.relname=e.index_name AND idx.relnamespace='public'::regnamespace AND idx.relkind IN ('i','I')
  LEFT JOIN pg_catalog.pg_index i ON i.indexrelid=idx.oid AND i.indrelid=tab.oid

  UNION ALL
  SELECT 'RLS','RLS habilitada nas quatro tabelas',
    CASE WHEN count(*)=4 AND count(*) FILTER (WHERE relrowsecurity)=4 THEN 'APROVAR' ELSE 'BLOQUEAR' END,
    format('Tabelas encontradas=%s/4; RLS habilitada=%s/4; FORCE RLS=%s',count(*),count(*) FILTER (WHERE relrowsecurity),count(*) FILTER (WHERE relforcerowsecurity))
  FROM relations

  UNION ALL
  SELECT 'POLICIES','Policies existentes nas tabelas do módulo',
    CASE WHEN count(*)=0 THEN 'APROVAR' ELSE 'REVISAR MANUAL' END,
    CASE WHEN count(*)=0 THEN 'Nenhuma policy (a migration não cria policies).'
      ELSE string_agg(tablename||'.'||policyname||' roles='||roles::text||' cmd='||cmd||' USING='||coalesce(qual,'NULL')||' CHECK='||coalesce(with_check,'NULL'),'; ' ORDER BY tablename,policyname) END
  FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename IN ('permutas_servico','permutas_servico_manifestacoes','permutas_servico_confirmacoes','permutas_servico_historico')

  UNION ALL
  SELECT 'GRANTS EFETIVOS','anon/authenticated sem privilégios de tabela nem sequência',
    CASE WHEN count(*)=2 AND count(*) FILTER (WHERE oid IS NOT NULL AND NOT has_any_priv)=2 THEN 'APROVAR' ELSE 'BLOQUEAR' END,
    string_agg(role_name||': relação='||relation_privileges||'; sequência='||sequence_privileges,'; ' ORDER BY role_name)
  FROM (
    SELECT e.role_name,r.oid,
      coalesce((SELECT string_agg(relname||'='||privs,', ') FROM (
        SELECT rel.relname, string_agg(p.privilege,', ' ORDER BY p.privilege) AS privs
        FROM relations rel CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(privilege)
        WHERE has_table_privilege(r.oid,rel.oid,p.privilege) GROUP BY rel.relname
      ) z),'nenhum') AS relation_privileges,
      coalesce((SELECT string_agg(priv,', ') FROM (VALUES ('USAGE'),('SELECT'),('UPDATE')) p(priv)
        WHERE EXISTS (SELECT 1 FROM pg_catalog.pg_class s JOIN pg_catalog.pg_namespace sn ON sn.oid=s.relnamespace
          WHERE sn.nspname='public' AND s.relname='permutas_servico_historico_id_seq' AND s.relkind='S'
            AND has_sequence_privilege(r.oid,s.oid,p.priv))),'nenhum') AS sequence_privileges,
      EXISTS (SELECT 1 FROM relations rel CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(privilege)
        WHERE has_table_privilege(r.oid,rel.oid,p.privilege))
      OR EXISTS (SELECT 1 FROM pg_catalog.pg_class s JOIN pg_catalog.pg_namespace sn ON sn.oid=s.relnamespace
        CROSS JOIN (VALUES ('USAGE'),('SELECT'),('UPDATE')) p(privilege)
        WHERE sn.nspname='public' AND s.relname='permutas_servico_historico_id_seq' AND s.relkind='S' AND has_sequence_privilege(r.oid,s.oid,p.privilege)) AS has_any_priv
    FROM (VALUES ('anon'),('authenticated')) e(role_name)
    LEFT JOIN pg_catalog.pg_roles r ON r.rolname=e.role_name
  ) effective

  UNION ALL
  SELECT 'GRANTS EFETIVOS','service_role: DML esperado nas tabelas e uso da sequência histórica',
    CASE WHEN count(*)=4 AND count(*) FILTER (WHERE all_table_privileges)=4 AND bool_and(seq_usage) THEN 'APROVAR' ELSE 'BLOQUEAR' END,
    'Tabelas com ALL efetivo='||count(*) FILTER (WHERE all_table_privileges)||'/4; USAGE/SELECT sequência='||bool_and(seq_usage)::text
  FROM (
    SELECT rel.relname,
      (SELECT bool_and(has_table_privilege(r.oid,rel.oid,p.priv)) FROM (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(priv)) AS all_table_privileges,
      EXISTS (SELECT 1 FROM pg_catalog.pg_class s JOIN pg_catalog.pg_namespace sn ON sn.oid=s.relnamespace
        WHERE sn.nspname='public' AND s.relname='permutas_servico_historico_id_seq' AND s.relkind='S'
          AND has_sequence_privilege(r.oid,s.oid,'USAGE') AND has_sequence_privilege(r.oid,s.oid,'SELECT')) AS seq_usage
    FROM relations rel CROSS JOIN pg_catalog.pg_roles r WHERE r.rolname='service_role'
  ) g

  UNION ALL
  SELECT 'GRANTS DIRETOS','ACLs de relações/sequência sem acesso direto de anon/authenticated',
    CASE WHEN count(*) FILTER (WHERE grantee_name IN ('PUBLIC','anon','authenticated') AND privilege_type IS NOT NULL)=0 THEN 'APROVAR' ELSE 'BLOQUEAR' END,
    coalesce(string_agg(object_name||' → '||grantee_name||' '||privilege_type,'; ' ORDER BY object_name,grantee_name,privilege_type),'Nenhuma ACL explícita; privilégios efetivos acima também conferidos')
  FROM (
    SELECT c.relname AS object_name,CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE gr.rolname END AS grantee_name,acl.privilege_type
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault(CASE WHEN c.relkind='S' THEN 'S' ELSE 'r' END::"char",c.relowner))) acl
    LEFT JOIN pg_catalog.pg_roles gr ON gr.oid=acl.grantee
    WHERE n.nspname='public' AND c.relname IN ('permutas_servico','permutas_servico_manifestacoes','permutas_servico_confirmacoes','permutas_servico_historico','permutas_servico_historico_id_seq')
  ) acl_rows

  UNION ALL
  SELECT 'FUNÇÕES SECURITY DEFINER','Assinatura, overload, SECURITY DEFINER e search_path das seis funções',
    CASE WHEN count(*)=6 AND count(*) FILTER (WHERE ok)=6 THEN 'APROVAR' ELSE 'BLOQUEAR' END,
    string_agg(e.name||'('||coalesce(pg_catalog.pg_get_function_identity_arguments(p.oid),'AUSENTE')||'): '||
      CASE WHEN p.oid IS NULL THEN 'ausente' ELSE 'SECURITY DEFINER='||p.prosecdef::text||'; search_path='||coalesce(p.proconfig::text,'(padrão)')||'; overloads='||overloads::text||'; assinatura/args corretos='||signature_ok::text END,
      '; ' ORDER BY e.name)
  FROM expected_functions e
  LEFT JOIN LATERAL (SELECT p.*,count(*) OVER() AS overloads,
      ((SELECT string_agg(pg_catalog.format_type(arg_type,NULL),' ' ORDER BY arg_ord)
          FROM unnest(p.proargtypes) WITH ORDINALITY arg_types(arg_type,arg_ord))=e.identity_types
        AND p.proargnames IS NOT DISTINCT FROM e.arg_names) AS signature_ok
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=e.name) p ON true
  CROSS JOIN LATERAL (SELECT p.oid IS NOT NULL AND p.overloads=1 AND p.signature_ok AND p.prosecdef
      AND p.proconfig @> ARRAY['search_path=pg_catalog, pg_temp'] AS ok) v

  UNION ALL
  SELECT 'PERMISSÕES RPC','EXECUTE efetivo: PUBLIC/anon/authenticated nenhum; service_role só nas quatro RPCs',
    CASE WHEN count(*)=6 AND count(*) FILTER (WHERE ok)=6 THEN 'APROVAR' ELSE 'BLOQUEAR' END,
    string_agg(e.name||': PUBLIC='||public_exec::text||', anon='||coalesce(anon_exec::text,'role ausente')||', authenticated='||coalesce(auth_exec::text,'role ausente')||', service_role='||coalesce(service_exec::text,'role ausente')||', esperado service_role='||e.service_execute::text,'; ' ORDER BY e.name)
  FROM (
    SELECT e.name,e.service_execute,p.oid,p.proowner,
      coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner)) AS acl,
      EXISTS (SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_exec,
      CASE WHEN ar.oid IS NOT NULL THEN has_function_privilege(ar.oid,p.oid,'EXECUTE') END AS anon_exec,
      CASE WHEN hr.oid IS NOT NULL THEN has_function_privilege(hr.oid,p.oid,'EXECUTE') END AS auth_exec,
      CASE WHEN sr.oid IS NOT NULL THEN has_function_privilege(sr.oid,p.oid,'EXECUTE') END AS service_exec
    FROM expected_functions e
    LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
    LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace=n.oid AND p.proname=e.name
    LEFT JOIN pg_catalog.pg_roles ar ON ar.rolname='anon'
    LEFT JOIN pg_catalog.pg_roles hr ON hr.rolname='authenticated'
    LEFT JOIN pg_catalog.pg_roles sr ON sr.rolname='service_role'
  ) e
  CROSS JOIN LATERAL (SELECT oid IS NOT NULL AND NOT public_exec AND anon_exec IS FALSE AND auth_exec IS FALSE AND service_exec IS NOT DISTINCT FROM e.service_execute AS ok) v

  UNION ALL
  SELECT 'TRIGGERS','Ausência de triggers não previstos nas quatro tabelas',
    CASE WHEN count(*)=4 AND count(t.oid)=0 THEN 'APROVAR' ELSE 'REVISAR MANUAL' END,
    'Tabelas='||count(DISTINCT r.relname)||'/4; triggers não internos='||count(t.oid)||coalesce(': '||string_agg(r.relname||'.'||t.tgname||' '||pg_catalog.pg_get_triggerdef(t.oid,true),'; '),'')
  FROM relations r LEFT JOIN pg_catalog.pg_trigger t ON t.tgrelid=r.oid AND NOT t.tgisinternal

  UNION ALL
  SELECT 'HISTÓRICO','Estrutura da trilha de decisões preservada',
    CASE WHEN a.columns IS DISTINCT FROM e.expected_columns OR NOT coalesce(a.identity_always,false) THEN 'BLOQUEAR' ELSE 'APROVAR' END,
    'Esperado: '||e.expected_columns::text||'; encontrado: '||coalesce(a.columns::text,'tabela ausente')||'; id identity ALWAYS='||coalesce(a.identity_always::text,'false')
  FROM expected_tables e LEFT JOIN actual_columns a ON a.relname=e.table_name WHERE e.table_name='permutas_servico_historico'

  UNION ALL
  SELECT 'HISTÓRICO','Existência de eventos concretos de decisão/cancelamento',
    'REVISAR MANUAL','Este diagnóstico só lê catálogos. Para confirmar linhas DEFERIDA/INDEFERIDA/CANCELADA e sua preservação após cancelamento, consulte manualmente os registros de public.permutas_servico_historico.'
),
summary AS (
  SELECT count(*) FILTER (WHERE resultado='APROVAR') AS aprovar,
         count(*) FILTER (WHERE resultado='BLOQUEAR') AS bloquear,
         count(*) FILTER (WHERE resultado='REVISAR MANUAL') AS revisar
  FROM checks
),
output AS (
  SELECT categoria,condicao_verificada,resultado,detalhe FROM checks
  UNION ALL
  SELECT 'RESUMO','Contagem por resultado',
    CASE WHEN bloquear>0 THEN 'BLOQUEAR' WHEN revisar>0 THEN 'REVISAR MANUAL' ELSE 'APROVAR' END,
    format('Checagens individuais (esta linha não entra na contagem): APROVAR=%s; BLOQUEAR=%s; REVISAR MANUAL=%s',aprovar,bloquear,revisar)
  FROM summary
)
SELECT categoria,condicao_verificada,resultado,detalhe
FROM output
ORDER BY CASE WHEN categoria='RESUMO' THEN 1 ELSE 0 END,categoria,condicao_verificada;
