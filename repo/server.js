'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const PROD=process.env.METRYCOR_ENV==='production';
class HttpError extends Error{constructor(c,m,d){super(m);this.code=c;this.data=d}}
const bad=(m,d)=>new HttpError(400,m,d);
// ---------- banco + migrations versionadas ----------
function openDb(file){
  const db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL');
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY)');
  const dir=path.join(__dirname,'migrations');
  for(const f of fs.readdirSync(dir).filter(x=>x.endsWith('.sql')).sort()){
    if(db.prepare('SELECT 1 FROM schema_migrations WHERE name=?').get(f))continue;
    db.exec('BEGIN');try{db.exec(fs.readFileSync(path.join(dir,f),'utf8'));db.prepare('INSERT INTO schema_migrations VALUES(?)').run(f);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
  }
  return db;
}
// ---------- utilidades ----------
const hash=p=>{const s=crypto.randomBytes(16).toString('hex');return `s$${s}$${crypto.scryptSync(p,s,64).toString('hex')}`};
const verify=(p,h)=>{const [,s,x]=h.split('$');const a=Buffer.from(crypto.scryptSync(p,s,64).toString('hex')),b=Buffer.from(x);return a.length===b.length&&crypto.timingSafeEqual(a,b)};
const sha=t=>crypto.createHash('sha256').update(t).digest('hex');
const digits=s=>String(s||'').replace(/\D/g,'');
const cpfOk=c=>{if(c.length!==11||/^(\d)\1+$/.test(c))return false;for(let t=9;t<11;t++){let s=0;for(let i=0;i<t;i++)s+=c[i]*(t+1-i);if((s*10%11)%10!=c[t])return false}return true};
const cnpjOk=c=>{if(c.length!==14||/^(\d)\1+$/.test(c))return false;for(let t=12;t<14;t++){let s=0,p=t-7;for(let i=0;i<t;i++){s+=c[i]*p--;if(p<2)p=9}if((s%11<2?0:11-s%11)!=c[t])return false}return true};
const docOk=d=>cpfOk(d)||cnpjOk(d);
const emailOk=e=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e||'');
const day=d=>d.toISOString().slice(0,10);
const addDays=(s,n)=>{const d=new Date(s+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return day(d)};
const now=()=>new Date().toISOString();
const audit=(db,u,entity,id,action,detail)=>db.prepare('INSERT INTO audit_logs(org_id,user_id,entity,entity_id,action,detail) VALUES(?,?,?,?,?,?)').run(u.org_id,u.id,entity,id,action,detail?JSON.stringify(detail):null);
const DEFAULT_STAGES=[['Novo lead','#A1A1B5'],['Primeiro contato','#C4B5FD'],['Em atendimento','#A78BFA'],['Levantamento de necessidades','#8B5CF6'],['Cotação solicitada','#7C3AED'],['Proposta enviada','#A855F7'],['Em negociação','#9333EA'],['Aguardando documentação','#F59E0B'],['Venda concluída','#22C55E','won','premium_cents'],['Perdido ou cancelado','#EF4444','lost']];
function seedStages(db,org){DEFAULT_STAGES.forEach((s,i)=>db.prepare('INSERT INTO pipeline_stages(org_id,name,color,position,kind,required_fields) VALUES(?,?,?,?,?,?)').run(org,s[0],s[1],i,s[2]||'open',s[3]||''))}
const FIELD_LABEL={premium_cents:'prêmio',owner_id:'vendedor',category:'categoria',phone:'telefone',email:'e-mail',lost_reason:'motivo da perda'};
// ---------- demo ----------
function seedDemo(db){
  if(PROD||process.env.DEMO_MODE==='0')return;
  if(db.prepare("SELECT 1 FROM users WHERE username='admin'").get())return;
  const pw=process.env.DEMO_ADMIN_PASSWORD||'admin';
  const org=Number(db.prepare("INSERT INTO organizations(name,document,is_demo) VALUES('Corretora Demo Aurora (DADOS FICTÍCIOS)','00000000000191',1)").run().lastInsertRowid);
  seedStages(db,org);
  const mk=(n,u,r)=>Number(db.prepare('INSERT INTO users(org_id,name,username,email,password_hash,role) VALUES(?,?,?,?,?,?)').run(org,n,u,u+'@demo.metrycor.invalid',hash(pw),r).lastInsertRowid);
  const admin=mk('Administrador Demo','admin','org_admin');
  const sellers=[mk('Ana Vendedora (demo)','ana.demo','seller'),mk('Bruno Vendedor (demo)','bruno.demo','seller'),mk('Carla Gestora (demo)','carla.demo','manager')];
  const stages=db.prepare('SELECT id,kind FROM pipeline_stages WHERE org_id=? ORDER BY position').all(org);
  const cats=['Automóvel','Vida','Residencial','Empresarial','Saúde','Odontológico'],srcs=['Meta Lead Ads','Indicação','Site','WhatsApp','Manual'];
  const names=['Marina Alves','Rafael Costa','Tatiane Mello','Otávio Ribeiro','Lúcia Ferraz','Diego Matos','Helena Prado','Gustavo Lima','Patrícia Nunes','Caio Duarte','Fernanda Reis','Sérgio Moraes','Vera Campos','Igor Teixeira','Bianca Rocha','Henrique Dias','Aline Barros','Marcelo Pinto','Renata Lopes','Paulo Cardoso','Sandra Vieira','Leandro Freitas','Camila Azevedo','Thiago Nogueira'];
  const today=day(new Date());let r=7;const rnd=n=>{r=(r*9301+49297)%233280;return Math.floor(r/233280*n)};
  names.forEach((n,i)=>{
    const st=stages[i%stages.length],owner=[...sellers.slice(0,2),admin][rnd(3)],prem=(rnd(60)+8)*100*100,ago=rnd(55),closedAgo=rnd(Math.min(ago+1,30));
    const closed=st.kind!=='open'?addDays(today,-closedAgo)+'T15:00:00.000Z':null;
    const doc=null,phone='(31) 9'+String(8000+i*37).padStart(4,'0')+'-'+String(1000+i*91).slice(0,4);
    let cid=null;
    if(st.kind==='won')cid=Number(db.prepare('INSERT INTO clients(org_id,name,phone,email,is_demo) VALUES(?,?,?,?,1)').run(org,n,phone,'cliente'+i+'@demo.invalid').lastInsertRowid);
    const l=Number(db.prepare(`INSERT INTO leads(org_id,client_id,name,phone,email,category,source,owner_id,stage_id,premium_cents,brokerage_cents,commission_cents,priority,next_action,entered_at,last_contact_at,closed_at,lost_reason,is_demo)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`).run(org,cid,n,phone,'lead'+i+'@demo.invalid',cats[rnd(6)],srcs[rnd(5)],owner,st.id,prem,Math.round(prem*0.12),Math.round(prem*0.04),['baixa','media','alta'][rnd(3)],st.kind==='open'?'Retornar contato':null,addDays(today,-ago)+'T12:00:00.000Z',addDays(today,-rnd(Math.min(ago+1,12)))+'T12:00:00.000Z',closed,st.kind==='lost'?'Preço acima do esperado':null).lastInsertRowid);
    db.prepare("INSERT INTO lead_activities(org_id,lead_id,user_id,kind,text) VALUES(?,?,?,'sistema','Lead criado (dados de demonstração)')").run(org,l,owner);
    if(st.kind==='open'&&i%2===0)db.prepare('INSERT INTO tasks(org_id,title,description,assigned_to,lead_id,due_at,priority,origin,is_demo) VALUES(?,?,?,?,?,?,?,?,1)').run(org,'Retornar contato com '+n,'Tarefa fictícia de demonstração',owner,l,addDays(today,[-3,-1,0,0,2,4][rnd(6)])+'T14:00:00.000Z',['media','alta'][rnd(2)],'lead');
  });
  db.prepare("INSERT INTO tasks(org_id,title,assigned_to,due_at,priority,is_demo) VALUES(?,?,?,?, 'baixa',1)").run(org,'Revisar funil comercial da semana',admin,today+'T18:00:00.000Z');
}
// ---------- dashboard ----------
function dashboard(db,u,from,to){
  const seller=u.role==='seller',own=seller?' AND l.owner_id='+u.id:'';
  const len=Math.round((new Date(to)-new Date(from))/864e5)+1,pTo=addDays(from,-1),pFrom=addDays(pTo,-(len-1));
  const calc=(f,t)=>{
    const g=(kind)=>db.prepare(`SELECT COUNT(*) n,COALESCE(SUM(premium_cents),0) prem,COALESCE(SUM(brokerage_cents),0) brok,COALESCE(SUM(commission_cents),0) comm FROM leads l JOIN pipeline_stages s ON s.id=l.stage_id WHERE l.org_id=? AND l.deleted_at IS NULL AND s.kind=? AND substr(l.closed_at,1,10) BETWEEN ? AND ?${own}`).get(u.org_id,kind,f,t);
    const w=g('won'),lo=g('lost');
    const nc=db.prepare("SELECT COUNT(*) n FROM clients WHERE org_id=? AND deleted_at IS NULL AND substr(created_at,1,10) BETWEEN ? AND ?").get(u.org_id,f,t).n;
    return {premium:w.prem,brokerage:w.brok,commissions:w.comm,wonCount:w.n,lostCount:lo.n,newClients:nc,conversion:w.n+lo.n?Math.round(w.n/(w.n+lo.n)*1000)/10:null};
  };
  const cur=calc(from,to),prev=calc(pFrom,pTo);
  const q=(s,...a)=>db.prepare(s).all(...a);
  const open=db.prepare(`SELECT COUNT(*) n FROM leads l JOIN pipeline_stages s ON s.id=l.stage_id WHERE l.org_id=? AND l.deleted_at IS NULL AND s.kind='open'${own}`).get(u.org_id).n;
  const daily=q(`SELECT substr(closed_at,1,10) d,SUM(premium_cents) p,SUM(brokerage_cents) b FROM leads l JOIN pipeline_stages s ON s.id=l.stage_id WHERE l.org_id=? AND l.deleted_at IS NULL AND s.kind='won' AND substr(closed_at,1,10) BETWEEN ? AND ?${own} GROUP BY d`,u.org_id,from,to);
  const dm=Object.fromEntries(daily.map(x=>[x.d,x]));const series=[];for(let d=from;d<=to;d=addDays(d,1))series.push({d,premium:dm[d]?.p||0,brokerage:dm[d]?.b||0});
  const byCategory=q(`SELECT COALESCE(category,'Sem categoria') k,SUM(premium_cents) v FROM leads l JOIN pipeline_stages s ON s.id=l.stage_id WHERE l.org_id=? AND l.deleted_at IS NULL AND s.kind='won' AND substr(closed_at,1,10) BETWEEN ? AND ?${own} GROUP BY k ORDER BY v DESC`,u.org_id,from,to);
  const bySeller=seller?[]:q(`SELECT u.name k,SUM(commission_cents) v FROM leads l JOIN pipeline_stages s ON s.id=l.stage_id JOIN users u ON u.id=l.owner_id WHERE l.org_id=? AND l.deleted_at IS NULL AND s.kind='won' AND substr(closed_at,1,10) BETWEEN ? AND ? GROUP BY u.id ORDER BY v DESC`,u.org_id,from,to);
  const funnel=q(`SELECT s.name k,s.color,COUNT(l.id) v FROM pipeline_stages s LEFT JOIN leads l ON l.stage_id=s.id AND l.deleted_at IS NULL${own} WHERE s.org_id=? AND s.archived=0 GROUP BY s.id ORDER BY s.position`,u.org_id);
  return {period:{from,to,prevFrom:pFrom,prevTo:pTo},cur,prev,open,series,byCategory,bySeller,funnel,alerts:alerts(db,u),
    notes:['Prêmio, corretagem e comissão consideram oportunidades GANHAS com data de fechamento no período (valores previstos, não recebidos).','Taxa de conversão = ganhas ÷ (ganhas + perdidas) fechadas no período.','Repasse, apólices e cancelamentos aguardam os módulos Financeiro/Apólices.']};
}
function alerts(db,u){
  const own=u.role==='seller'?[u.id]:[];const today=day(new Date());
  const tasks=db.prepare(`SELECT id,title,due_at FROM tasks WHERE org_id=? AND status='pendente' AND substr(due_at,1,10)<?${own.length?' AND assigned_to=?':''} ORDER BY due_at LIMIT 20`).all(u.org_id,today,...own);
  const stale=db.prepare(`SELECT l.id,l.name,l.last_contact_at FROM leads l JOIN pipeline_stages s ON s.id=l.stage_id WHERE l.org_id=? AND l.deleted_at IS NULL AND s.kind='open' AND substr(COALESCE(l.last_contact_at,l.entered_at),1,10)<?${own.length?' AND l.owner_id=?':''} ORDER BY 3 LIMIT 20`).all(u.org_id,addDays(today,-7),...own);
  return {overdueTasks:tasks,staleLeads:stale};
}
// ---------- rotas ----------
const LEAD_F=['name','phone','whatsapp','email','document','company','category','product','source','owner_id','premium_cents','brokerage_cents','commission_cents','priority','next_action','notes','tags','lost_reason'];
const FIN_F=['brokerage_cents','commission_cents'];
const isMgr=u=>u.role!=='seller';
function loadLead(db,u,id){const l=db.prepare('SELECT * FROM leads WHERE id=? AND org_id=? AND deleted_at IS NULL').get(id,u.org_id);if(!l||(u.role==='seller'&&l.owner_id!==u.id))throw new HttpError(404,'Lead não encontrado');return l}
function cleanLead(db,u,b,isNew){
  const o={};for(const k of LEAD_F)if(k in b){if(FIN_F.includes(k)&&!isMgr(u))throw new HttpError(403,'Apenas gestores editam corretagem e comissão');o[k]=typeof b[k]==='string'?b[k].trim()||null:b[k]}
  if(isNew&&!o.name)throw bad('Informe o nome do lead');
  if('email' in o&&o.email&&!emailOk(o.email))throw bad('E-mail inválido');
  if('document' in o&&o.document){o.document=digits(o.document);if(!docOk(o.document))throw bad('CPF/CNPJ inválido')}
  for(const k of ['premium_cents','brokerage_cents','commission_cents'])if(k in o){o[k]=Math.round(Number(o[k])||0);if(o[k]<0)throw bad('Valores não podem ser negativos')}
  if('priority' in o&&!['baixa','media','alta'].includes(o.priority))throw bad('Prioridade inválida');
  if('owner_id' in o&&o.owner_id){if(u.role==='seller'&&o.owner_id!==u.id)throw new HttpError(403,'Vendedores só atribuem leads a si mesmos');if(!db.prepare('SELECT 1 FROM users WHERE id=? AND org_id=? AND active=1').get(o.owner_id,u.org_id))throw bad('Vendedor inválido')}
  return o;
}
const routes=[];const R=(m,p,h,o={})=>routes.push({m,re:new RegExp('^'+p.replace(/:(\w+)/g,'(?<$1>[^/]+)')+'$'),h,o});
R('POST','/api/auth/register',(c)=>{
  const b=c.body,E=(m)=>{throw bad(m)};
  const name=(b.name||'').trim(),username=(b.username||'').trim(),email=(b.email||'').trim().toLowerCase(),doc=digits(b.document),phone=digits(b.phone);
  if(name.length<3)E('Informe o nome completo');if(!/^[\w.-]{3,30}$/.test(username))E('Usuário: 3 a 30 caracteres (letras, números, . _ -)');
  if(!emailOk(email))E('E-mail inválido');if(!docOk(doc))E('CPF/CNPJ inválido');if(phone.length<10||phone.length>13)E('Telefone inválido');
  if(!b.password||b.password.length<8)E('A senha deve ter ao menos 8 caracteres');if(b.password!==b.confirm)E('As senhas não conferem');
  if(c.db.prepare('SELECT 1 FROM users WHERE username=? OR email=?').get(username,email))E('Usuário ou e-mail já cadastrado');
  if(c.db.prepare('SELECT 1 FROM organizations WHERE document=?').get(doc))E('Este CPF/CNPJ já possui uma corretora cadastrada');
  c.db.exec('BEGIN');try{
    const org=Number(c.db.prepare('INSERT INTO organizations(name,document) VALUES(?,?)').run((b.company||'').trim()||'Corretora de '+name,doc).lastInsertRowid);seedStages(c.db,org);
    const id=Number(c.db.prepare('INSERT INTO users(org_id,name,username,email,document,phone,password_hash,role) VALUES(?,?,?,?,?,?,?,?)').run(org,name,username,email,doc,phone,hash(b.password),'org_admin').lastInsertRowid);
    c.db.exec('COMMIT');return {ok:true,id}
  }catch(e){c.db.exec('ROLLBACK');throw e}
},{public:1,status:201});
const tries=new Map();
R('POST','/api/auth/login',(c)=>{
  const key=c.ip,t=tries.get(key)||{n:0,until:0};if(t.until>Date.now())throw new HttpError(429,'Muitas tentativas. Aguarde alguns minutos.');
  const id=String(c.body.login||'').trim(),u=c.db.prepare('SELECT * FROM users WHERE (username=? OR email=?) AND active=1').get(id,id);
  if(!u||!verify(String(c.body.password||''),u.password_hash)){t.n++;if(t.n>=8){t.until=Date.now()+9e5;t.n=0}tries.set(key,t);throw new HttpError(401,'Usuário ou senha incorretos')}
  tries.delete(key);const tok=crypto.randomBytes(32).toString('hex');
  c.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(sha(tok),u.id,new Date(Date.now()+12*36e5).toISOString());
  c.setCookie=`mc_session=${tok}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${PROD?'; Secure':''}`;return {ok:true}
},{public:1});
R('POST','/api/auth/logout',(c)=>{c.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(c.tokHash);c.setCookie='mc_session=; HttpOnly; Path=/; Max-Age=0';return {ok:true}});
R('POST','/api/auth/forgot',()=>({ok:true,message:'Se o e-mail estiver cadastrado, você receberá instruções. (Serviço de e-mail ainda não configurado nesta versão.)'}),{public:1});
R('GET','/api/me',c=>{const o=c.db.prepare('SELECT name,is_demo FROM organizations WHERE id=?').get(c.u.org_id);return {user:{id:c.u.id,name:c.u.name,username:c.u.username,email:c.u.email,role:c.u.role},org:{name:o.name,is_demo:!!o.is_demo}}});
R('GET','/api/dashboard',c=>{const t=day(new Date());let from=c.query.from||t.slice(0,8)+'01',to=c.query.to||t;if(!/^\d{4}-\d\d-\d\d$/.test(from)||!/^\d{4}-\d\d-\d\d$/.test(to)||from>to)throw bad('Período inválido');return dashboard(c.db,c.u,from,to)});
R('GET','/api/alerts',c=>alerts(c.db,c.u));
R('GET','/api/users',c=>c.db.prepare('SELECT id,name,username,email,role,active FROM users WHERE org_id=? ORDER BY name').all(c.u.org_id));
R('POST','/api/users',c=>{
  const b=c.body,username=(b.username||'').trim(),email=(b.email||'').trim().toLowerCase();
  if(!(b.name||'').trim()||!/^[\w.-]{3,30}$/.test(username)||!emailOk(email))throw bad('Dados do usuário inválidos');if(!['manager','seller','org_admin'].includes(b.role))throw bad('Perfil inválido');
  if(!b.password||b.password.length<8)throw bad('A senha deve ter ao menos 8 caracteres');
  if(c.db.prepare('SELECT 1 FROM users WHERE username=? OR email=?').get(username,email))throw bad('Usuário ou e-mail já cadastrado');
  const id=Number(c.db.prepare('INSERT INTO users(org_id,name,username,email,password_hash,role) VALUES(?,?,?,?,?,?)').run(c.u.org_id,b.name.trim(),username,email,hash(b.password),b.role).lastInsertRowid);audit(c.db,c.u,'user',id,'create',{role:b.role});return {id}
},{roles:['org_admin'],status:201});
// etapas do funil
R('GET','/api/stages',c=>c.db.prepare('SELECT * FROM pipeline_stages WHERE org_id=? ORDER BY position').all(c.u.org_id));
R('POST','/api/stages',c=>{
  const b=c.body;if(!(b.name||'').trim())throw bad('Informe o nome da etapa');const kind=b.kind||'open';if(!['open','won','lost'].includes(kind))throw bad('Tipo inválido');
  const pos=(c.db.prepare('SELECT COALESCE(MAX(position),-1)+1 p FROM pipeline_stages WHERE org_id=?').get(c.u.org_id).p);
  const id=Number(c.db.prepare('INSERT INTO pipeline_stages(org_id,name,color,position,kind,required_fields) VALUES(?,?,?,?,?,?)').run(c.u.org_id,b.name.trim(),/^#[0-9a-f]{6}$/i.test(b.color)?b.color:'#8B5CF6',pos,kind,b.required_fields||'').lastInsertRowid);
  audit(c.db,c.u,'stage',id,'create',b);return {id}
},{roles:['org_admin'],status:201});
R('PATCH','/api/stages/:id',c=>{
  const s=c.db.prepare('SELECT * FROM pipeline_stages WHERE id=? AND org_id=?').get(c.params.id,c.u.org_id);if(!s)throw new HttpError(404,'Etapa não encontrada');
  const b=c.body,n={name:(b.name??s.name).trim(),color:/^#[0-9a-f]{6}$/i.test(b.color)?b.color:s.color,kind:['open','won','lost'].includes(b.kind)?b.kind:s.kind,required_fields:b.required_fields??s.required_fields,archived:'archived' in b?(b.archived?1:0):s.archived};
  if(!n.name)throw bad('Nome obrigatório');
  if(n.archived&&c.db.prepare('SELECT 1 FROM leads WHERE stage_id=? AND deleted_at IS NULL').get(s.id))throw bad('Mova os leads desta etapa antes de arquivá-la');
  c.db.prepare('UPDATE pipeline_stages SET name=?,color=?,kind=?,required_fields=?,archived=? WHERE id=?').run(n.name,n.color,n.kind,n.required_fields,n.archived,s.id);
  if(b.direction){const o=c.db.prepare('SELECT * FROM pipeline_stages WHERE org_id=? AND archived=0 ORDER BY position').all(c.u.org_id),i=o.findIndex(x=>x.id===s.id),j=i+(b.direction==='up'?-1:1);
    if(i>=0&&o[j]){c.db.prepare('UPDATE pipeline_stages SET position=? WHERE id=?').run(o[j].position,s.id);c.db.prepare('UPDATE pipeline_stages SET position=? WHERE id=?').run(s.position,o[j].id)}}
  audit(c.db,c.u,'stage',s.id,'update',b);return {ok:true}
},{roles:['org_admin']});
// leads
R('GET','/api/leads',c=>{
  const p=[c.u.org_id];let w='l.org_id=? AND l.deleted_at IS NULL';
  if(c.u.role==='seller'){w+=' AND l.owner_id=?';p.push(c.u.id)}else if(c.query.owner){w+=' AND l.owner_id=?';p.push(Number(c.query.owner))}
  if(c.query.q){w+=' AND (l.name LIKE ? OR l.phone LIKE ? OR l.email LIKE ?)';const q='%'+c.query.q+'%';p.push(q,q,q)}
  if(c.query.stage){w+=' AND l.stage_id=?';p.push(Number(c.query.stage))}
  return c.db.prepare(`SELECT l.*,u.name owner_name,s.name stage_name,s.kind stage_kind,s.color stage_color,(SELECT title FROM tasks t WHERE t.lead_id=l.id AND t.status='pendente' ORDER BY due_at LIMIT 1) next_task FROM leads l LEFT JOIN users u ON u.id=l.owner_id JOIN pipeline_stages s ON s.id=l.stage_id WHERE ${w} ORDER BY l.created_at DESC,l.id DESC LIMIT 500`).all(...p)
});
R('POST','/api/leads',c=>{
  const o=cleanLead(c.db,c.u,c.body,true);
  if(!c.body.force){const dup=c.db.prepare('SELECT id,name FROM leads WHERE org_id=? AND deleted_at IS NULL AND ((? IS NOT NULL AND phone=?) OR (? IS NOT NULL AND email=?)) LIMIT 1').get(c.u.org_id,o.phone??null,o.phone??null,o.email??null,o.email??null);
    if(dup)throw new HttpError(409,`Possível duplicidade: lead "${dup.name}" já usa este telefone/e-mail.`,{duplicate:dup})}
  if(c.u.role==='seller')o.owner_id=c.u.id;else if(!o.owner_id)o.owner_id=c.u.id;
  let stage=c.body.stage_id?c.db.prepare("SELECT id FROM pipeline_stages WHERE id=? AND org_id=? AND archived=0 AND kind='open'").get(c.body.stage_id,c.u.org_id):c.db.prepare("SELECT id FROM pipeline_stages WHERE org_id=? AND archived=0 AND kind='open' ORDER BY position LIMIT 1").get(c.u.org_id);
  if(!stage)throw bad('Etapa inicial inválida');
  const ks=Object.keys(o);const id=Number(c.db.prepare(`INSERT INTO leads(org_id,stage_id,last_contact_at,${ks.join(',')}) VALUES(?,?,?,${ks.map(()=>'?').join(',')})`).run(c.u.org_id,stage.id,now(),...ks.map(k=>o[k])).lastInsertRowid);
  c.db.prepare("INSERT INTO lead_activities(org_id,lead_id,user_id,kind,text) VALUES(?,?,?,'sistema','Lead criado')").run(c.u.org_id,id,c.u.id);audit(c.db,c.u,'lead',id,'create');return {id}
},{status:201});
R('GET','/api/leads/:id',c=>{const l=loadLead(c.db,c.u,c.params.id);return {lead:l,activities:c.db.prepare('SELECT a.*,u.name user_name FROM lead_activities a LEFT JOIN users u ON u.id=a.user_id WHERE a.lead_id=? AND a.org_id=? ORDER BY a.id DESC').all(l.id,c.u.org_id),tasks:c.db.prepare('SELECT * FROM tasks WHERE lead_id=? AND org_id=? ORDER BY due_at').all(l.id,c.u.org_id)}});
R('PATCH','/api/leads/:id',c=>{
  const l=loadLead(c.db,c.u,c.params.id),o=cleanLead(c.db,c.u,c.body,false),ks=Object.keys(o);if(!ks.length)return {ok:true};
  const ch=ks.filter(k=>String(o[k]??'')!==String(l[k]??''));
  c.db.prepare(`UPDATE leads SET ${ks.map(k=>k+'=?').join(',')},updated_at=? WHERE id=?`).run(...ks.map(k=>o[k]),now(),l.id);
  if(ch.length){c.db.prepare("INSERT INTO lead_activities(org_id,lead_id,user_id,kind,text) VALUES(?,?,?,'alteracao',?)").run(c.u.org_id,l.id,c.u.id,'Campos alterados: '+ch.join(', ')+' (antes: '+ch.map(k=>String(l[k]??'—')).join(' | ')+')');audit(c.db,c.u,'lead',l.id,'update',Object.fromEntries(ch.map(k=>[k,[l[k],o[k]]])))}
  return {ok:true}
});
R('POST','/api/leads/:id/move',c=>{
  const l=loadLead(c.db,c.u,c.params.id),s=c.db.prepare('SELECT * FROM pipeline_stages WHERE id=? AND org_id=? AND archived=0').get(c.body.stage_id,c.u.org_id);if(!s)throw bad('Etapa inválida');
  if(s.id===l.stage_id)return {ok:true};
  const merged={...l,...(c.body.fields?cleanLead(c.db,c.u,c.body.fields,false):{})};
  const miss=s.required_fields.split(',').filter(Boolean).filter(f=>!merged[f]);
  if(s.kind==='lost'&&!merged.lost_reason&&!miss.includes('lost_reason'))miss.push('lost_reason');
  if(miss.length)throw new HttpError(422,'Campos obrigatórios para esta etapa: '+miss.map(f=>FIELD_LABEL[f]||f).join(', '),{missing:miss});
  const old=c.db.prepare('SELECT name FROM pipeline_stages WHERE id=?').get(l.stage_id);
  c.db.exec('BEGIN');try{
    if(c.body.fields){const o=cleanLead(c.db,c.u,c.body.fields,false),ks=Object.keys(o);if(ks.length)c.db.prepare(`UPDATE leads SET ${ks.map(k=>k+'=?').join(',')} WHERE id=?`).run(...ks.map(k=>o[k]),l.id)}
    const closed=s.kind==='open'?null:(l.closed_at||now());
    let cid=l.client_id;
    if(s.kind==='won'&&!cid){const ex=merged.document?c.db.prepare('SELECT id FROM clients WHERE org_id=? AND document=? AND deleted_at IS NULL').get(c.u.org_id,merged.document):null;
      cid=ex?ex.id:Number(c.db.prepare('INSERT INTO clients(org_id,name,document,phone,email,company) VALUES(?,?,?,?,?,?)').run(c.u.org_id,merged.name,merged.document,merged.phone,merged.email,merged.company).lastInsertRowid)}
    c.db.prepare('UPDATE leads SET stage_id=?,closed_at=?,client_id=?,last_contact_at=?,updated_at=? WHERE id=?').run(s.id,closed,cid,now(),now(),l.id);
    c.db.prepare("INSERT INTO lead_activities(org_id,lead_id,user_id,kind,text) VALUES(?,?,?,'etapa',?)").run(c.u.org_id,l.id,c.u.id,`Etapa: ${old.name} → ${s.name}`);audit(c.db,c.u,'lead',l.id,'move',{from:l.stage_id,to:s.id});c.db.exec('COMMIT');
  }catch(e){c.db.exec('ROLLBACK');throw e}
  return {ok:true}
});
R('POST','/api/leads/:id/activities',c=>{const l=loadLead(c.db,c.u,c.params.id);const t=(c.body.text||'').trim();if(!t)throw bad('Escreva a anotação');
  const k=['anotacao','ligacao','mensagem','reuniao'].includes(c.body.kind)?c.body.kind:'anotacao';
  c.db.prepare('INSERT INTO lead_activities(org_id,lead_id,user_id,kind,text) VALUES(?,?,?,?,?)').run(c.u.org_id,l.id,c.u.id,k,t);c.db.prepare('UPDATE leads SET last_contact_at=? WHERE id=?').run(now(),l.id);return {ok:true}},{status:201});
R('DELETE','/api/leads/:id',c=>{const l=loadLead(c.db,c.u,c.params.id);c.db.prepare('UPDATE leads SET deleted_at=? WHERE id=?').run(now(),l.id);audit(c.db,c.u,'lead',l.id,'delete');return {ok:true}},{roles:['org_admin','manager']});
// clientes
R('GET','/api/clients',c=>{const q='%'+(c.query.q||'')+'%';return c.db.prepare('SELECT c.*,(SELECT COUNT(*) FROM leads l WHERE l.client_id=c.id AND l.deleted_at IS NULL) leads FROM clients c WHERE org_id=? AND deleted_at IS NULL AND (name LIKE ? OR document LIKE ? OR email LIKE ? OR phone LIKE ?) ORDER BY id DESC LIMIT 500').all(c.u.org_id,q,q,q,q)});
const cleanClient=(b)=>{const o={name:(b.name||'').trim(),document:digits(b.document)||null,phone:(b.phone||'').trim()||null,email:(b.email||'').trim()||null,company:(b.company||'').trim()||null,notes:(b.notes||'').trim()||null};
  if(!o.name)throw bad('Informe o nome');if(o.email&&!emailOk(o.email))throw bad('E-mail inválido');if(o.document&&!docOk(o.document))throw bad('CPF/CNPJ inválido');return o};
const dupGuard=fn=>{try{return fn()}catch(e){if(/UNIQUE/.test(e.message))throw new HttpError(409,'Já existe um cliente com este CPF/CNPJ');throw e}};
R('POST','/api/clients',c=>{const o=cleanClient(c.body);return dupGuard(()=>{const id=Number(c.db.prepare('INSERT INTO clients(org_id,name,document,phone,email,company,notes) VALUES(?,?,?,?,?,?,?)').run(c.u.org_id,o.name,o.document,o.phone,o.email,o.company,o.notes).lastInsertRowid);audit(c.db,c.u,'client',id,'create');return {id}})},{status:201});
R('PATCH','/api/clients/:id',c=>{if(!c.db.prepare('SELECT 1 FROM clients WHERE id=? AND org_id=? AND deleted_at IS NULL').get(c.params.id,c.u.org_id))throw new HttpError(404,'Cliente não encontrado');const o=cleanClient(c.body);
  return dupGuard(()=>{c.db.prepare('UPDATE clients SET name=?,document=?,phone=?,email=?,company=?,notes=?,updated_at=? WHERE id=?').run(o.name,o.document,o.phone,o.email,o.company,o.notes,now(),c.params.id);audit(c.db,c.u,'client',Number(c.params.id),'update');return {ok:true}})});
// tarefas
R('GET','/api/tasks',c=>{const p=[c.u.org_id];let w='t.org_id=?';if(c.u.role==='seller'){w+=' AND t.assigned_to=?';p.push(c.u.id)}
  return c.db.prepare(`SELECT t.*,u.name assignee_name,l.name lead_name FROM tasks t LEFT JOIN users u ON u.id=t.assigned_to LEFT JOIN leads l ON l.id=t.lead_id WHERE ${w} ORDER BY (t.status='concluida'),t.due_at LIMIT 500`).all(...p)});
const cleanTask=(c,b)=>{const t=(b.title||'').trim();if(!t)throw bad('Informe o título');if(!/^\d{4}-\d\d-\d\d/.test(b.due_at||''))throw bad('Informe a data');
  let to=b.assigned_to||c.u.id;if(c.u.role==='seller')to=c.u.id;if(!c.db.prepare('SELECT 1 FROM users WHERE id=? AND org_id=?').get(to,c.u.org_id))throw bad('Responsável inválido');
  if(b.lead_id)loadLead(c.db,c.u,b.lead_id);return {title:t,description:(b.description||'').trim()||null,assigned_to:to,lead_id:b.lead_id||null,due_at:b.due_at.length===10?b.due_at+'T12:00:00.000Z':b.due_at,priority:['baixa','media','alta'].includes(b.priority)?b.priority:'media'}};
R('POST','/api/tasks',c=>{const o=cleanTask(c,c.body);const id=Number(c.db.prepare('INSERT INTO tasks(org_id,title,description,assigned_to,lead_id,due_at,priority) VALUES(?,?,?,?,?,?,?)').run(c.u.org_id,o.title,o.description,o.assigned_to,o.lead_id,o.due_at,o.priority).lastInsertRowid);return {id}},{status:201});
const loadTask=c=>{const t=c.db.prepare('SELECT * FROM tasks WHERE id=? AND org_id=?').get(c.params.id,c.u.org_id);if(!t||(c.u.role==='seller'&&t.assigned_to!==c.u.id))throw new HttpError(404,'Tarefa não encontrada');return t};
R('PATCH','/api/tasks/:id',c=>{const t=loadTask(c);
  if(c.body.status){if(!['pendente','concluida'].includes(c.body.status))throw bad('Status inválido');c.db.prepare('UPDATE tasks SET status=?,completed_at=? WHERE id=?').run(c.body.status,c.body.status==='concluida'?now():null,t.id);return {ok:true}}
  const o=cleanTask(c,{...t,...c.body});c.db.prepare('UPDATE tasks SET title=?,description=?,assigned_to=?,lead_id=?,due_at=?,priority=? WHERE id=?').run(o.title,o.description,o.assigned_to,o.lead_id,o.due_at,o.priority,t.id);return {ok:true}});
R('DELETE','/api/tasks/:id',c=>{const t=loadTask(c);c.db.prepare('DELETE FROM tasks WHERE id=?').run(t.id);audit(c.db,c.u,'task',t.id,'delete');return {ok:true}});
// ---------- servidor ----------
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
function createServer(db){
  return http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://x'),h={'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'"};
    const send=(code,obj,extra={})=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...h,...extra});res.end(JSON.stringify(obj))};
    try{
      if(!url.pathname.startsWith('/api/')){
        const f=url.pathname==='/'?'index.html':url.pathname.slice(1),p=path.join(__dirname,'public',f);
        if(!p.startsWith(path.join(__dirname,'public'))||!fs.existsSync(p)||!fs.statSync(p).isFile()){res.writeHead(404,h);return res.end('Não encontrado')}
        res.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream',...h});return res.end(fs.readFileSync(p));
      }
      const r=routes.find(x=>x.m===req.method&&x.re.test(url.pathname));if(!r)return send(404,{error:'Rota não encontrada'});
      const c={db,query:Object.fromEntries(url.searchParams),params:{...url.pathname.match(r.re).groups},ip:req.socket.remoteAddress,body:{}};
      if(req.method!=='GET'&&req.method!=='DELETE'){
        if(!(req.headers['content-type']||'').includes('application/json'))throw bad('Content-Type deve ser application/json');
        let raw='';for await(const ch of req){raw+=ch;if(raw.length>1e6)throw new HttpError(413,'Requisição muito grande')}
        try{c.body=raw?JSON.parse(raw):{}}catch{throw bad('JSON inválido')}
      }
      if(!r.o.public){
        const tok=(req.headers.cookie||'').split(/;\s*/).find(x=>x.startsWith('mc_session='))?.slice(11);c.tokHash=tok?sha(tok):'';
        const s=c.tokHash&&db.prepare('SELECT u.*,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND u.active=1').get(c.tokHash);
        if(!s||s.expires_at<now())throw new HttpError(401,'Sessão expirada. Entre novamente.');
        c.u=s;if(r.o.roles&&!r.o.roles.includes(s.role))throw new HttpError(403,'Você não tem permissão para esta ação');
      }
      const out=r.h(c);send(r.o.status||200,out,c.setCookie?{'Set-Cookie':c.setCookie}:{});
    }catch(e){
      if(e instanceof HttpError)return send(e.code,{error:e.message,...(e.data||{})});
      console.error('[erro]',e.message);send(500,{error:'Erro interno'});
    }
  });
}
module.exports={openDb,createServer,seedDemo};
if(require.main===module){
  fs.mkdirSync(path.join(__dirname,'data'),{recursive:true});const db=openDb(process.env.DB_PATH||path.join(__dirname,'data','metrycor.db'));seedDemo(db);
  const port=Number(process.env.PORT||3000);createServer(db).listen(port,()=>console.log(`Metrycor em http://localhost:${port} (${PROD?'produção':'desenvolvimento/demo'})`));
}
