const test=require('node:test'),assert=require('node:assert/strict'),os=require('node:os'),path=require('node:path'),fs=require('node:fs');
const {openDb,createServer,seedDemo}=require('./server');
const file=path.join(os.tmpdir(),'mc-test-'+process.pid+'.db');
const db=openDb(file);seedDemo(db);const srv=createServer(db);let base;
test.before(()=>new Promise(r=>srv.listen(0,()=>{base='http://127.0.0.1:'+srv.address().port;r()})));
test.after(()=>{srv.close();for(const s of ['','-wal','-shm'])fs.rmSync(file+s,{force:true})});
const client=()=>{let ck='';return async(m,u,b)=>{const r=await fetch(base+u,{method:m,headers:{'Content-Type':'application/json',cookie:ck},body:b?JSON.stringify(b):undefined});const sc=r.headers.get('set-cookie');if(sc)ck=sc.split(';')[0];return {s:r.status,j:await r.json()}}};
const reg=(u,doc)=>({name:'Usuário '+u,username:u,email:u+'@x.com',document:doc,phone:'31999998888',password:'senha-forte-1',confirm:'senha-forte-1'});
test('autenticação: sem sessão = 401; login errado = 401; admin demo entra',async()=>{
  const a=client();assert.equal((await a('GET','/api/me')).s,401);
  assert.equal((await a('POST','/api/auth/login',{login:'admin',password:'x'})).s,401);
  assert.equal((await a('POST','/api/auth/login',{login:'admin',password:'admin'})).s,200);
  assert.equal((await a('GET','/api/me')).j.user.role,'org_admin');
  await a('POST','/api/auth/logout');assert.equal((await a('GET','/api/me')).s,401)});
test('registro valida CPF/CNPJ e impede duplicidade',async()=>{
  const a=client();assert.equal((await a('POST','/api/auth/register',reg('joao1','11111111111'))).s,400);
  assert.equal((await a('POST','/api/auth/register',reg('joao1','52998224725'))).s,201);
  assert.equal((await a('POST','/api/auth/register',reg('joao2','52998224725'))).s,400);
  assert.equal((await a('POST','/api/auth/register',{...reg('joao3','11222333000181'),confirm:'outra'})).s,400)});
test('CRM: lead, duplicidade, etapa obrigatória, venda, dashboard, histórico',async()=>{
  const a=client();await a('POST','/api/auth/login',{login:'joao1',password:'senha-forte-1'});
  const st=(await a('GET','/api/stages')).j;assert.equal(st.length,10);
  const won=st.find(s=>s.kind==='won'),first=st[0];
  const l=await a('POST','/api/leads',{name:'Lead Teste',phone:'(31) 90000-0001',category:'Vida'});assert.equal(l.s,201);
  assert.equal((await a('POST','/api/leads',{name:'Outro',phone:'(31) 90000-0001'})).s,409);
  const id=l.j.id;
  assert.equal((await a('POST',`/api/leads/${id}/move`,{stage_id:won.id})).s,422); // prêmio obrigatório
  assert.equal((await a('PATCH',`/api/leads/${id}`,{premium_cents:100000,brokerage_cents:12000,commission_cents:4000})).s,200);
  assert.equal((await a('POST',`/api/leads/${id}/move`,{stage_id:won.id})).s,200);
  const d=(await a('GET','/api/dashboard')).j;
  assert.equal(d.cur.premium,100000);assert.equal(d.cur.brokerage,12000);assert.equal(d.cur.commissions,4000);assert.equal(d.cur.conversion,100);
  assert.equal((await a('GET','/api/clients')).j.length,1); // cliente criado na venda
  const det=(await a('GET',`/api/leads/${id}`)).j;assert.ok(det.activities.some(x=>x.kind==='etapa'));
  assert.equal((await a('POST',`/api/leads/${id}/move`,{stage_id:first.id})).s,200);
  assert.equal((await a('GET','/api/dashboard')).j.cur.premium,0)});
test('funil: criar, renomear, arquivar; só admin',async()=>{
  const a=client();await a('POST','/api/auth/login',{login:'joao1',password:'senha-forte-1'});
  const n=await a('POST','/api/stages',{name:'Etapa Nova',color:'#112233'});assert.equal(n.s,201);
  assert.equal((await a('PATCH','/api/stages/'+n.j.id,{name:'Renomeada'})).s,200);
  assert.equal((await a('PATCH','/api/stages/'+n.j.id,{archived:true})).s,200);
  const b=client();await b('POST','/api/auth/login',{login:'ana.demo',password:'admin'});
  assert.equal((await b('POST','/api/stages',{name:'x'})).s,403)});
test('isolamento entre corretoras e permissões do vendedor',async()=>{
  const adm=client();await adm('POST','/api/auth/login',{login:'admin',password:'admin'});
  const demoLead=(await adm('GET','/api/leads')).j[0];
  const other=client();await other('POST','/api/auth/login',{login:'joao1',password:'senha-forte-1'});
  assert.equal((await other('GET','/api/leads/'+demoLead.id)).s,404);
  assert.equal((await other('PATCH','/api/leads/'+demoLead.id,{name:'hack'})).s,404);
  assert.equal((await other('POST','/api/leads/'+demoLead.id+'/move',{stage_id:1})).s,404);
  const ana=client();await ana('POST','/api/auth/login',{login:'ana.demo',password:'admin'});
  const mine=(await ana('GET','/api/leads')).j;assert.ok(mine.length>0&&mine.every(x=>x.owner_name.startsWith('Ana')));
  const lead=mine[0];assert.equal((await ana('PATCH','/api/leads/'+lead.id,{commission_cents:1})).s,403);
  const notMine=(await adm('GET','/api/leads')).j.find(x=>x.owner_name&&!x.owner_name.startsWith('Ana'));
  assert.equal((await ana('GET','/api/leads/'+notMine.id)).s,404);
  assert.equal((await ana('POST','/api/users',{name:'x'})).s,403)});
test('tarefas: criar, concluir, excluir; vendedor só vê as suas',async()=>{
  const a=client();await a('POST','/api/auth/login',{login:'ana.demo',password:'admin'});
  const t=await a('POST','/api/tasks',{title:'Ligar',due_at:'2030-01-01',priority:'alta'});assert.equal(t.s,201);
  assert.equal((await a('PATCH','/api/tasks/'+t.j.id,{status:'concluida'})).s,200);
  const list=(await a('GET','/api/tasks')).j;assert.equal(list.find(x=>x.id===t.j.id).status,'concluida');
  assert.ok(list.every(x=>x.assignee_name.startsWith('Ana')));
  assert.equal((await a('DELETE','/api/tasks/'+t.j.id)).s,200)});
test('senha nunca em texto puro',()=>{const r=db.prepare("SELECT password_hash h FROM users WHERE username='admin'").get();assert.ok(r.h.startsWith('s$')&&!r.h.includes('admin'))});
