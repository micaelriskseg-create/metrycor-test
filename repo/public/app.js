'use strict';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const brl=c=>((c||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const dt=s=>s?String(s).slice(0,10).split('-').reverse().join('/'):'—';
const num=c=>c?(c/100).toFixed(2).replace('.',','):'';
const cents=v=>{v=String(v||'').trim();if(!v)return 0;if(v.includes(','))v=v.replace(/\./g,'').replace(',','.');const n=parseFloat(v);return isNaN(n)?0:Math.round(n*100)};
const ymd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const ROLE={org_admin:'Administrador da corretora',manager:'Gestor',seller:'Vendedor'};
let S={me:null,stages:[],users:[],period:'month',from:'',to:'',view:'chart'};
async function api(m,u,b){const r=await fetch(u,{method:m,headers:b?{'Content-Type':'application/json'}:{},body:b?JSON.stringify(b):undefined});const j=await r.json().catch(()=>({}));
  if(r.status===401&&S.me&&!u.includes('/auth/')){S.me=null;render();toast('Sessão expirada','e')}
  if(!r.ok){const e=new Error(j.error||'Erro inesperado');e.status=r.status;e.data=j;throw e}return j}
function toast(t,k){const d=document.createElement('div');d.className='toast '+(k||'');d.textContent=t;$('#toasts').append(d);setTimeout(()=>d.remove(),4000)}
const guard=fn=>async(...a)=>{try{return await fn(...a)}catch(e){toast(e.message,'e')}};
// ---------- Matrix ----------
(function(){const c=$('#matrix'),x=c.getContext('2d');let cols,drops;const fs=16;
  const rs=()=>{c.width=innerWidth;c.height=innerHeight;cols=Math.ceil(c.width/fs);drops=Array.from({length:cols},()=>Math.random()*c.height/fs)};rs();addEventListener('resize',rs);
  setInterval(()=>{if(S.me)return c.style.display='none';c.style.display='block';x.fillStyle='rgba(8,8,17,.12)';x.fillRect(0,0,c.width,c.height);x.font=fs+'px monospace';
    drops.forEach((y,i)=>{x.fillStyle=Math.random()>.9?'#C4B5FD':'#8B5CF6';x.fillText(Math.random()>.5?'1':'0',i*fs,y*fs);if(y*fs>c.height&&Math.random()>.975)drops[i]=0;drops[i]++})},70)})();
// ---------- modal / form ----------
function modal(title,html,mount){const o=document.createElement('div');o.className='ov';o.innerHTML=`<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="mh"><h3>${esc(title)}</h3><button class="btn ghost sm" data-x aria-label="Fechar">✕</button></div><div class="mb">${html}</div></div>`;
  document.body.append(o);const close=()=>o.remove();o.addEventListener('mousedown',e=>{if(e.target===o)close()});$('[data-x]',o).onclick=close;document.addEventListener('keydown',function k(e){if(e.key==='Escape'){close();document.removeEventListener('keydown',k)}});
  mount&&mount($('.mb',o),close);return close}
function fields(fs,v={}){return fs.map(f=>{const val=v[f.k]??'';let inp;
  if(f.t==='select')inp=`<select name="${f.k}">${f.o.map(([a,b])=>`<option value="${esc(a)}" ${String(a)===String(val)?'selected':''}>${esc(b)}</option>`).join('')}</select>`;
  else if(f.t==='textarea')inp=`<textarea name="${f.k}">${esc(val)}</textarea>`;
  else inp=`<input name="${f.k}" type="${f.t==='date'?'date':f.t==='color'?'color':'text'}" value="${esc(f.t==='money'?num(val):val)}" ${f.req?'required':''} ${f.ro?'disabled':''} ${f.ph?`placeholder="${esc(f.ph)}"`:''}>`;
  return `<div class="fld" ${f.w?'style="grid-column:1/-1"':''}><label>${esc(f.l)}</label>${inp}</div>`}).join('')}
function collect(form,fs){const o={};for(const f of fs){const el=form.elements[f.k];if(!el||el.disabled)continue;o[f.k]=f.t==='money'?cents(el.value):el.type==='select-one'&&/_id$/.test(f.k)?(el.value?Number(el.value):null):el.value}return o}
const CATS=['Automóvel','Vida','Residencial','Empresarial','Saúde','Odontológico','Responsabilidade civil','Outros'],SRC=['Manual','Meta Lead Ads','Indicação','Site','WhatsApp'];
const PRI=[['baixa','Baixa'],['media','Média'],['alta','Alta']];
const isMgr=()=>S.me.user.role!=='seller';
const leadFields=()=>[{k:'name',l:'Nome completo *',req:1,w:1},{k:'phone',l:'Telefone'},{k:'whatsapp',l:'WhatsApp'},{k:'email',l:'E-mail'},{k:'document',l:'CPF/CNPJ'},{k:'company',l:'Empresa'},
  {k:'category',l:'Categoria de seguro',t:'select',o:[['','—'],...CATS.map(c=>[c,c])]},{k:'product',l:'Produto de interesse'},{k:'source',l:'Origem',t:'select',o:SRC.map(c=>[c,c])},
  {k:'owner_id',l:'Vendedor responsável',t:'select',o:S.users.filter(u=>u.active).map(u=>[u.id,u.name])},{k:'priority',l:'Prioridade',t:'select',o:PRI},{k:'next_action',l:'Próxima ação'},{k:'tags',l:'Etiquetas (separe por vírgula)'},
  {k:'premium_cents',l:'Prêmio estimado (R$)',t:'money'},{k:'brokerage_cents',l:'Corretagem estimada (R$)',t:'money',ro:!isMgr()},{k:'commission_cents',l:'Comissão estimada (R$)',t:'money',ro:!isMgr()},{k:'notes',l:'Observações',t:'textarea',w:1}];
// ---------- auth ----------
function authView(mode){
  const reg=mode==='reg';$('#app').innerHTML=`<div class="auth"><form class="authbox" id="af" novalidate><div class="logo">METRYCOR</div><p class="sub">${reg?'Crie o ambiente da sua corretora':'Gestão inteligente para corretoras de seguros'}</p><div id="ae"></div>
  ${reg?`<div class="grid2">${fields([{k:'name',l:'Nome completo',w:1},{k:'company',l:'Nome da corretora',w:1},{k:'username',l:'Nome de usuário'},{k:'email',l:'E-mail'},{k:'document',l:'CPF ou CNPJ'},{k:'phone',l:'Telefone'}])}
  <div class="fld"><label>Senha (mín. 8)</label><input name="password" type="password" autocomplete="new-password"></div><div class="fld"><label>Confirmar senha</label><input name="confirm" type="password" autocomplete="new-password"></div></div>`
  :`<div class="fld"><label>Usuário ou e-mail</label><input name="login" autocomplete="username" autofocus></div><div class="fld"><label>Senha</label><input name="password" type="password" autocomplete="current-password"></div>`}
  <button class="btn" style="width:100%" id="ab">${reg?'Criar conta':'Entrar'}</button>
  <p class="hint" style="text-align:center">${reg?'<a href="#" id="sw">Já tenho conta</a>':'<a href="#" id="fg">Esqueci minha senha</a> · <a href="#" id="sw">Criar uma conta</a>'}</p></form></div>`;
  $('#sw').onclick=e=>{e.preventDefault();authView(reg?'login':'reg')};
  if($('#fg'))$('#fg').onclick=e=>{e.preventDefault();$('#ae').innerHTML='<div class="err">A recuperação por e-mail depende do serviço de e-mail, ainda não configurado nesta versão.</div>'};
  $('#af').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target)),btn=$('#ab');btn.disabled=true;btn.textContent='Aguarde…';
    try{if(reg){await api('POST','/api/auth/register',b);await api('POST','/api/auth/login',{login:b.username,password:b.password})}else await api('POST','/api/auth/login',b);await boot()}
    catch(er){$('#ae').innerHTML=`<div class="err">${esc(er.message)}</div>`;btn.disabled=false;btn.textContent=reg?'Criar conta':'Entrar'}};
}
// ---------- layout ----------
const NAV=[['dashboard','▣','Dashboard'],['vendas','◈','Gestão de Vendas',[['kanban','Kanban'],['leads','Leads'],['clients','Clientes'],['tasks','Tarefas']]],['x1','$','Gestão Financeira',0,1],['x2','▤','Gestão de Apólices',0,1],['x3','✆','WhatsApp',0,1],['x4','▥','Relatórios',0,1],['settings','⚙','Configurações']];
function layout(){
  const r=route().p,{user,org}=S.me;
  $('#app').innerHTML=`${org.is_demo?'<div class="demo">AMBIENTE DE DEMONSTRAÇÃO — todos os dados são fictícios</div>':''}<div class="shell ${localStorage.mcCol?'col':''}"><aside class="side"><div class="logo">${localStorage.mcCol?'M':'METRYCOR'}</div><nav class="nav" aria-label="Principal">
  ${NAV.map(([id,ic,lb,sub,off])=>off?`<div class="dis" title="Módulo ainda não implementado">${ic} <span class="lbl">${lb} <small>em breve</small></span></div>`:sub?`<div class="dis" style="opacity:1;cursor:default">${ic} <span class="lbl">${lb}</span></div>${sub.map(([s,l])=>`<a class="sub2 ${r===s?'on':''}" href="#/${s}">${l}</a>`).join('')}`:`<a class="${r===id?'on':''}" href="#/${id}">${ic} <span class="lbl">${lb}</span></a>`).join('')}</nav></aside>
  <div class="main"><header class="top"><button class="btn ghost sm" id="tg" aria-label="Recolher menu">☰</button><input id="gs" placeholder="Buscar leads…" aria-label="Busca global"><span class="sp"></span><span title="API conectada" class="hint"><span class="dot"></span> Online</span>
  <button class="btn ghost sm" id="bell" aria-label="Notificações">🔔<span class="badge" id="bc" hidden></span></button><span class="hint">${esc(user.name)} · ${ROLE[user.role]}</span><button class="btn ghost sm" id="out">Sair</button></header><div class="page" id="pg"><div class="spin"></div></div></div></div>`;
  $('#tg').onclick=()=>{localStorage.mcCol=localStorage.mcCol?'':'1';layout();go()};
  $('#gs').onkeydown=e=>{if(e.key==='Enter')location.hash='#/leads?q='+encodeURIComponent(e.target.value)};
  $('#out').onclick=async()=>{await api('POST','/api/auth/logout');S.me=null;render()};
  $('#bell').onclick=guard(async()=>{const a=await api('GET','/api/alerts');modal('Alertas',`<h4>Tarefas atrasadas</h4>${a.overdueTasks.map(t=>`<p>• ${esc(t.title)} <span class="hint">(${dt(t.due_at)})</span></p>`).join('')||'<p class="hint">Nenhuma.</p>'}<h4>Leads sem acompanhamento há mais de 7 dias</h4>${a.staleLeads.map(l=>`<p>• ${esc(l.name)}</p>`).join('')||'<p class="hint">Nenhum.</p>'}`)});
  api('GET','/api/alerts').then(a=>{const n=a.overdueTasks.length+a.staleLeads.length;const b=$('#bc');if(b&&n){b.hidden=false;b.textContent=n}}).catch(()=>{});
}
function route(){const h=location.hash.slice(2)||'dashboard',[p,q]=h.split('?');return {p,q:Object.fromEntries(new URLSearchParams(q||''))}}
const pages={dashboard,kanban,leads,clients,tasks,settings};
async function go(){if(!S.me)return;const {p}=route();layout();const pg=$('#pg');try{await (pages[p]||dashboard)(pg)}catch(e){pg.innerHTML=`<div class="err">${esc(e.message)}</div>`}}
async function boot(){try{S.me=await api('GET','/api/me');[S.stages,S.users]=await Promise.all([api('GET','/api/stages'),api('GET','/api/users')]);if(!location.hash)location.hash='#/dashboard';go()}catch{S.me=null;authView('login')}}
const render=()=>S.me?go():authView('login');addEventListener('hashchange',go);
// ---------- dashboard ----------
function periodRange(){const t=new Date(),d=n=>{const x=new Date(t);x.setDate(x.getDate()-n);return ymd(x)};
  switch(S.period){case'today':return[ymd(t),ymd(t)];case'7d':return[d(6),ymd(t)];case'prev':{const a=new Date(t.getFullYear(),t.getMonth()-1,1),b=new Date(t.getFullYear(),t.getMonth(),0);return[ymd(a),ymd(b)]}
    case'custom':return[S.from||ymd(t),S.to||ymd(t)];default:return[ymd(new Date(t.getFullYear(),t.getMonth(),1)),ymd(t)]}}
const delta=(c,p)=>p?`<span class="${c>=p?'up':'dn'}">${c>=p?'▲':'▼'} ${Math.abs(Math.round((c-p)/p*100))}% vs. anterior</span>`:`<span class="na">sem base de comparação</span>`;
function bars(rows,fmt,color){const m=Math.max(1,...rows.map(r=>r.v));return rows.length?rows.map(r=>`<div style="margin:7px 0"><div class="hint" style="display:flex;justify-content:space-between"><span>${esc(r.k)}</span><span>${fmt(r.v)}</span></div><div class="bar" style="width:${Math.max(2,r.v/m*100)}%;${r.color||color?`background:${r.color||color}`:''}"></div></div>`).join(''):'<div class="empty">Sem dados no período</div>'}
function daily(series,key){const w=560,h=160,m=Math.max(1,...series.map(s=>s[key])),bw=w/series.length;
  return `<svg viewBox="0 0 ${w} ${h+20}" style="width:100%" role="img" aria-label="Evolução diária">${series.map((s,i)=>`<rect x="${i*bw+1}" y="${h-s[key]/m*h}" width="${Math.max(1,bw-2)}" height="${s[key]/m*h}" rx="2" fill="#8B5CF6" opacity=".85"><title>${dt(s.d)}: ${brl(s[key])}</title></rect>`).join('')}<text x="0" y="${h+14}" fill="#A1A1B5" font-size="10">${dt(series[0].d)}</text><text x="${w}" y="${h+14}" fill="#A1A1B5" font-size="10" text-anchor="end">${dt(series.at(-1).d)}</text></svg>`}
async function dashboard(pg){
  const [from,to]=periodRange();const d=await api('GET',`/api/dashboard?from=${from}&to=${to}`),c=d.cur,p=d.prev;
  const K=[['Prêmio vendido (ganhas)',brl(c.premium),c.premium,p.premium],['Corretagem prevista',brl(c.brokerage),c.brokerage,p.brokerage],['Comissões de vendedores (previstas)',brl(c.commissions),c.commissions,p.commissions],['Novos clientes',c.newClients,c.newClients,p.newClients],['Oportunidades abertas',d.open],['Taxa de conversão',c.conversion==null?'—':c.conversion.toLocaleString('pt-BR')+'%',c.conversion,p.conversion],['Vendas concluídas',c.wonCount,c.wonCount,p.wonCount],['Perdidas/canceladas',c.lostCount,c.lostCount,p.lostCount]];
  pg.innerHTML=`<h1>Dashboard</h1><div class="row"><select id="per" aria-label="Período">${[['today','Hoje'],['7d','Últimos 7 dias'],['month','Mês atual'],['prev','Mês anterior'],['custom','Personalizado']].map(([a,b])=>`<option value="${a}" ${S.period===a?'selected':''}>${b}</option>`).join('')}</select>
  ${S.period==='custom'?`<input type="date" id="df" value="${from}"><input type="date" id="dto" value="${to}" max="${ymd(new Date())}">`:''}<span class="hint">${dt(from)} a ${dt(to)}</span></div>
  <div class="cards">${K.map(([l,v,a,b])=>`<div class="card kpi"><div class="l">${l}</div><div class="v">${v}</div>${b===undefined?'<span class="na">posição atual</span>':delta(a||0,b||0)}</div>`).join('')}</div>
  <div class="charts"><div class="card"><div class="row"><h3 style="margin:0">Prêmio fechado por dia</h3><span class="sp"></span><select id="vk" style="width:auto"><option value="premium">Prêmio</option><option value="brokerage" ${S.view==='brokerage'?'selected':''}>Corretagem</option></select></div><div id="dc">${daily(d.series,S.view==='brokerage'?'brokerage':'premium')}</div></div>
  <div class="card"><h3>Funil (leads por etapa)</h3>${bars(d.funnel.map(f=>({...f,color:f.color})),v=>v)}</div>
  <div class="card"><h3>Prêmio por categoria</h3>${bars(d.byCategory,brl)}</div>${d.bySeller.length?`<div class="card"><h3>Comissão prevista por vendedor</h3>${bars(d.bySeller,brl)}</div>`:''}</div>
  <p class="hint">${d.notes.map(esc).join('<br>')}</p>`;
  $('#per').onchange=e=>{S.period=e.target.value;go()};$('#vk').onchange=e=>{S.view=e.target.value;$('#dc').innerHTML=daily(d.series,S.view)};
  if($('#df'))$('#df').onchange=$('#dto').onchange=()=>{S.from=$('#df').value;S.to=$('#dto').value;if(S.from&&S.to&&S.from<=S.to)go()};
}
// ---------- kanban ----------
function daysAgo(s){return s?Math.floor((Date.now()-new Date(s))/864e5):null}
async function kanban(pg){
  const leads=await api('GET','/api/leads');S.stages=await api('GET','/api/stages');const st=S.stages.filter(s=>!s.archived);
  pg.innerHTML=`<div class="row"><h1 style="margin:0">Kanban comercial</h1><span class="sp"></span><button class="btn" id="nl">+ Novo lead</button></div><div class="board">${st.map(s=>{const ls=leads.filter(l=>l.stage_id===s.id);
    return `<div class="col1" data-s="${s.id}"><h4 style="color:${s.color}"><span>${esc(s.name)}</span><span>${ls.length}</span></h4>${ls.map(l=>{const d=daysAgo(l.last_contact_at);return `<div class="kc ${l.priority} ${d>7&&s.kind==='open'?'stale':''}" draggable="true" data-l="${l.id}" tabindex="0"><b>${esc(l.name)}</b><div class="m">${esc(l.category||'Sem categoria')} · ${esc(l.owner_name||'—')}</div><div class="m">Entrada ${dt(l.entered_at)} · ${d==null?'sem contato':d+'d sem contato'}</div><div class="m">Prêmio ${brl(l.premium_cents)} · Corret. ${brl(l.brokerage_cents)} · Com. ${brl(l.commission_cents)}</div>${l.next_task?`<div class="m">⏭ ${esc(l.next_task)}</div>`:''}</div>`}).join('')}</div>`}).join('')}</div>`;
  $('#nl').onclick=()=>leadForm(null,go);
  $$('.kc').forEach(k=>{k.onclick=()=>leadModal(+k.dataset.l);k.onkeydown=e=>{if(e.key==='Enter')leadModal(+k.dataset.l)};k.ondragstart=e=>e.dataTransfer.setData('text',k.dataset.l)});
  $$('.col1').forEach(c=>{c.ondragover=e=>{e.preventDefault();c.classList.add('over')};c.ondragleave=()=>c.classList.remove('over');c.ondrop=guard(async e=>{e.preventDefault();c.classList.remove('over');const id=+e.dataTransfer.getData('text'),l=leads.find(x=>x.id===id);if(!l||l.stage_id===+c.dataset.s)return;await moveLead(l,+c.dataset.s,go)})});
}
async function moveLead(l,stageId,done){
  try{await api('POST',`/api/leads/${l.id}/move`,{stage_id:stageId});toast('Etapa atualizada');done()}
  catch(e){if(e.status!==422)throw e;const miss=e.data.missing,FL={premium_cents:['Prêmio (R$)','money'],lost_reason:['Motivo da perda','text'],category:['Categoria','text'],phone:['Telefone','text'],email:['E-mail','text'],owner_id:['Vendedor','text']},fs=miss.map(k=>({k,l:FL[k]?.[0]||k,t:FL[k]?.[1]||'text',w:1}));
    modal('Dados necessários para esta etapa',`<p class="hint">${esc(e.message)}</p><form>${fields(fs)}<button class="btn">Confirmar e mover</button></form>`,(b,close)=>{$('form',b).onsubmit=guard(async ev=>{ev.preventDefault();const f=collect(ev.target,fs);await api('POST',`/api/leads/${l.id}/move`,{stage_id:stageId,fields:f});close();toast('Etapa atualizada');done()})})}
}
// ---------- leads ----------
async function leadForm(l,done){
  const fs=leadFields();modal(l?'Editar lead':'Novo lead',`<form class="grid2">${fields(fs,l||{owner_id:S.me.user.id,source:'Manual',priority:'media'})}<div style="grid-column:1/-1"><button class="btn">Salvar</button></div></form>`,(b,close)=>{
    $('form',b).onsubmit=guard(async ev=>{ev.preventDefault();const o=collect(ev.target,fs);try{l?await api('PATCH','/api/leads/'+l.id,o):await api('POST','/api/leads',o)}catch(e){if(e.status===409&&!l&&confirm(e.message+'\n\nCriar mesmo assim?'))await api('POST','/api/leads',{...o,force:true});else throw e}close();toast('Lead salvo');done()})})}
async function leadModal(id){
  const d=await api('GET','/api/leads/'+id),l=d.lead;const stage=S.stages.find(s=>s.id===l.stage_id);
  modal(l.name,`<div class="tabs"><button class="on" data-t="a">Dados gerais</button><button data-t="b">Negociação</button><button data-t="c">Atividades</button><button data-t="d">Tarefas</button></div><div id="tb"></div>`,(b,close)=>{
    const tabs={a:()=>`<p><span class="pill" style="color:${stage?.color}">${esc(stage?.name)}</span> <span class="pill p-${l.priority}">${l.priority}</span></p><div class="grid2">${[['Telefone',l.phone],['WhatsApp',l.whatsapp],['E-mail',l.email],['Empresa',l.company],['Categoria',l.category],['Produto',l.product],['Origem',l.source],['Entrada',dt(l.entered_at)],['Próxima ação',l.next_action],['Etiquetas',l.tags]].map(([k,v])=>`<div class="fld"><label>${k}</label>${esc(v||'—')}</div>`).join('')}</div><p class="hint">${esc(l.notes||'')}</p><button class="btn" id="ed">Editar</button> ${isMgr()?'<button class="btn danger" id="del">Excluir</button>':''}`,
      b:()=>`<div class="cards" style="grid-template-columns:repeat(3,1fr)">${[['Prêmio',l.premium_cents],['Corretagem prevista',l.brokerage_cents],['Comissão prevista',l.commission_cents]].map(([k,v])=>`<div class="card kpi"><div class="l">${k}</div><div class="v">${brl(v)}</div></div>`).join('')}</div><p class="hint">Valores previstos. O prêmio não é receita da corretora; apenas a corretagem. Recebimento e pagamento serão controlados no módulo Financeiro (pendente).</p>${l.lost_reason?`<p>Motivo da perda: ${esc(l.lost_reason)}</p>`:''}`,
      c:()=>`<form id="af2" class="row"><select name="kind"><option value="anotacao">Anotação</option><option value="ligacao">Ligação</option><option value="mensagem">Mensagem</option><option value="reuniao">Reunião</option></select><input name="text" placeholder="Registrar atividade" style="flex:1"><button class="btn">Adicionar</button></form><div class="tl">${d.activities.map(a=>`<div><small>${dt(a.created_at)} ${esc(a.user_name||'sistema')} · ${esc(a.kind)}</small><br>${esc(a.text)}</div>`).join('')}</div>`,
      d:()=>`${d.tasks.map(t=>`<p>${t.status==='concluida'?'✓':'○'} ${esc(t.title)} <span class="hint">${dt(t.due_at)}</span></p>`).join('')||'<p class="hint">Sem tarefas.</p>'}<button class="btn" id="nt">+ Nova tarefa</button>`};
    const show=t=>{$$('.tabs button',b).forEach(x=>x.classList.toggle('on',x.dataset.t===t));$('#tb',b).innerHTML=tabs[t]();
      if($('#ed',b))$('#ed',b).onclick=()=>{close();leadForm(l,()=>go())};if($('#del',b))$('#del',b).onclick=guard(async()=>{if(confirm('Excluir este lead?')){await api('DELETE','/api/leads/'+l.id);close();toast('Lead excluído');go()}});
      if($('#af2',b))$('#af2',b).onsubmit=guard(async ev=>{ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));await api('POST',`/api/leads/${l.id}/activities`,f);close();leadModal(l.id)});
      if($('#nt',b))$('#nt',b).onclick=()=>{close();taskForm({lead_id:l.id},go)}};
    $$('.tabs button',b).forEach(x=>x.onclick=()=>show(x.dataset.t));show('a')})}
async function leads(pg){
  const q=route().q.q||'';const rows=await api('GET','/api/leads'+(q?'?q='+encodeURIComponent(q):''));
  pg.innerHTML=`<div class="row"><h1 style="margin:0">Leads</h1><span class="sp"></span><input id="q" placeholder="Filtrar…" value="${esc(q)}"><button class="btn" id="nl">+ Novo lead</button></div><div class="card tw"><table><thead><tr><th>Nome</th><th>Etapa</th><th>Categoria</th><th>Vendedor</th><th>Prêmio</th><th>Prioridade</th><th>Entrada</th></tr></thead><tbody>${rows.map(l=>`<tr class="click" data-l="${l.id}"><td>${esc(l.name)}</td><td><span class="pill" style="color:${l.stage_color}">${esc(l.stage_name)}</span></td><td>${esc(l.category||'—')}</td><td>${esc(l.owner_name||'—')}</td><td>${brl(l.premium_cents)}</td><td><span class="pill p-${l.priority}">${l.priority}</span></td><td>${dt(l.entered_at)}</td></tr>`).join('')}</tbody></table>${rows.length?'':'<div class="empty">Nenhum lead encontrado.</div>'}</div>`;
  $('#nl').onclick=()=>leadForm(null,go);$('#q').onkeydown=e=>{if(e.key==='Enter')location.hash='#/leads?q='+encodeURIComponent(e.target.value)};$$('tr.click').forEach(r=>r.onclick=()=>leadModal(+r.dataset.l));
}
// ---------- clientes ----------
const cf=[{k:'name',l:'Nome *',w:1,req:1},{k:'document',l:'CPF/CNPJ'},{k:'phone',l:'Telefone'},{k:'email',l:'E-mail'},{k:'company',l:'Empresa'},{k:'notes',l:'Observações',t:'textarea',w:1}];
function clientForm(c,done){modal(c?'Editar cliente':'Novo cliente',`<form class="grid2">${fields(cf,c||{})}<div style="grid-column:1/-1"><button class="btn">Salvar</button></div></form>`,(b,close)=>{$('form',b).onsubmit=guard(async ev=>{ev.preventDefault();const o=collect(ev.target,cf);c?await api('PATCH','/api/clients/'+c.id,o):await api('POST','/api/clients',o);close();toast('Cliente salvo');done()})})}
async function clients(pg){
  const rows=await api('GET','/api/clients');pg.innerHTML=`<div class="row"><h1 style="margin:0">Clientes</h1><span class="sp"></span><button class="btn" id="nc">+ Novo cliente</button></div><div class="card tw"><table><thead><tr><th>Nome</th><th>CPF/CNPJ</th><th>Telefone</th><th>E-mail</th><th>Leads</th><th>Cadastro</th></tr></thead><tbody>${rows.map(c=>`<tr class="click" data-c="${c.id}"><td>${esc(c.name)}</td><td>${esc(c.document||'—')}</td><td>${esc(c.phone||'—')}</td><td>${esc(c.email||'—')}</td><td>${c.leads}</td><td>${dt(c.created_at)}</td></tr>`).join('')}</tbody></table>${rows.length?'':'<div class="empty">Nenhum cliente ainda. Clientes são criados automaticamente quando um lead vira venda concluída, ou manualmente.</div>'}</div>`;
  $('#nc').onclick=()=>clientForm(null,go);$$('tr.click').forEach(r=>r.onclick=()=>clientForm(rows.find(c=>c.id==r.dataset.c),go));
}
// ---------- tarefas ----------
function taskForm(t,done){const fs=[{k:'title',l:'Título *',w:1,req:1},{k:'description',l:'Descrição',t:'textarea',w:1},{k:'due_at',l:'Data',t:'date'},{k:'priority',l:'Prioridade',t:'select',o:PRI},{k:'assigned_to',l:'Responsável',t:'select',o:S.users.filter(u=>u.active).map(u=>[u.id,u.name])}];
  const v={priority:'media',assigned_to:S.me.user.id,...t,due_at:t?.due_at?.slice(0,10)||ymd(new Date())};
  modal(t?.id?'Editar tarefa':'Nova tarefa',`<form class="grid2">${fields(fs,v)}<div style="grid-column:1/-1"><button class="btn">Salvar</button></div></form>`,(b,close)=>{$('form',b).onsubmit=guard(async ev=>{ev.preventDefault();const o=collect(ev.target,fs);o.assigned_to=+o.assigned_to;if(t?.lead_id)o.lead_id=t.lead_id;t?.id?await api('PATCH','/api/tasks/'+t.id,o):await api('POST','/api/tasks',o);close();toast('Tarefa salva');done()})})}
async function tasks(pg){
  const rows=await api('GET','/api/tasks'),today=ymd(new Date()),wk=ymd(new Date(Date.now()+7*864e5));
  const grp=[['Atrasadas',t=>t.status==='pendente'&&t.due_at.slice(0,10)<today],['Hoje',t=>t.status==='pendente'&&t.due_at.slice(0,10)===today],['Esta semana',t=>t.status==='pendente'&&t.due_at.slice(0,10)>today&&t.due_at.slice(0,10)<=wk],['Depois',t=>t.status==='pendente'&&t.due_at.slice(0,10)>wk],['Concluídas',t=>t.status==='concluida']];
  pg.innerHTML=`<div class="row"><h1 style="margin:0">Tarefas</h1><span class="sp"></span><button class="btn" id="nt">+ Nova tarefa</button></div>${grp.map(([n,f])=>{const l=rows.filter(f);return `<div class="card" style="margin-bottom:12px"><h3>${n} (${l.length})</h3>${l.map(t=>`<div class="row" style="margin:0;padding:6px 0;border-bottom:1px solid var(--bd)"><input type="checkbox" style="width:auto" data-k="${t.id}" ${t.status==='concluida'?'checked':''} aria-label="Concluir"><div style="flex:1"><b>${esc(t.title)}</b> <span class="pill p-${t.priority}">${t.priority}</span><div class="hint">${dt(t.due_at)} · ${esc(t.assignee_name||'—')}${t.lead_name?' · Lead: '+esc(t.lead_name):''} · origem: ${esc(t.origin)}</div></div><button class="btn ghost sm" data-e="${t.id}">Editar</button><button class="btn ghost sm" data-d="${t.id}">Excluir</button></div>`).join('')||'<div class="hint">Nada aqui.</div>'}</div>`}).join('')}`;
  $('#nt').onclick=()=>taskForm(null,go);
  $$('[data-k]').forEach(c=>c.onchange=guard(async()=>{await api('PATCH','/api/tasks/'+c.dataset.k,{status:c.checked?'concluida':'pendente'});go()}));
  $$('[data-e]').forEach(b=>b.onclick=()=>taskForm(rows.find(t=>t.id==b.dataset.e),go));
  $$('[data-d]').forEach(b=>b.onclick=guard(async()=>{if(confirm('Excluir tarefa?')){await api('DELETE','/api/tasks/'+b.dataset.d);go()}}));
}
// ---------- configurações ----------
async function settings(pg){
  S.stages=await api('GET','/api/stages');S.users=await api('GET','/api/users');const adm=S.me.user.role==='org_admin',KIND={open:'Aberta',won:'Ganha',lost:'Perdida'};
  pg.innerHTML=`<h1>Configurações</h1><div class="card" style="margin-bottom:12px"><h3>Perfil</h3><p>${esc(S.me.user.name)} · ${esc(S.me.user.email)} · ${ROLE[S.me.user.role]}</p><p class="hint">Corretora: ${esc(S.me.org.name)}</p></div>
  <div class="card" style="margin-bottom:12px"><div class="row"><h3 style="margin:0">Funil de vendas</h3><span class="sp"></span>${adm?'<button class="btn sm" id="ns">+ Nova etapa</button>':''}</div>${!adm?'<p class="hint">Somente o administrador da corretora edita o funil.</p>':''}
  <div class="tw"><table><tbody>${S.stages.map(s=>`<tr style="${s.archived?'opacity:.45':''}"><td><span class="dot" style="background:${s.color};box-shadow:none"></span> ${esc(s.name)}</td><td>${KIND[s.kind]}</td><td class="hint">${s.required_fields?'Exige: '+esc(s.required_fields):''}</td>${adm?`<td><button class="btn ghost sm" data-m="up" data-i="${s.id}" aria-label="Subir">↑</button><button class="btn ghost sm" data-m="down" data-i="${s.id}" aria-label="Descer">↓</button><button class="btn ghost sm" data-ed="${s.id}">Editar</button><button class="btn ghost sm" data-ar="${s.id}">${s.archived?'Reativar':'Arquivar'}</button></td>`:''}</tr>`).join('')}</tbody></table></div></div>
  <div class="card"><div class="row"><h3 style="margin:0">Equipe</h3><span class="sp"></span>${adm?'<button class="btn sm" id="nu">+ Novo usuário</button>':''}</div><div class="tw"><table><tbody>${S.users.map(u=>`<tr><td>${esc(u.name)}</td><td>${esc(u.username)}</td><td>${ROLE[u.role]}</td></tr>`).join('')}</tbody></table></div></div>`;
  const sf=[{k:'name',l:'Nome',w:1,req:1},{k:'color',l:'Cor',t:'color'},{k:'kind',l:'Tipo',t:'select',o:Object.entries(KIND)},{k:'required_fields',l:'Campos obrigatórios p/ entrar (premium_cents, owner_id, category, phone, email)',w:1}];
  const stForm=s=>modal(s?'Editar etapa':'Nova etapa',`<form class="grid2">${fields(sf,s||{color:'#8b5cf6',kind:'open'})}<div style="grid-column:1/-1"><button class="btn">Salvar</button></div></form>`,(b,close)=>{$('form',b).onsubmit=guard(async ev=>{ev.preventDefault();const o=collect(ev.target,sf);s?await api('PATCH','/api/stages/'+s.id,o):await api('POST','/api/stages',o);close();go()})});
  if(adm){$('#ns').onclick=()=>stForm();$$('[data-ed]').forEach(b=>b.onclick=()=>stForm(S.stages.find(s=>s.id==b.dataset.ed)));
    $$('[data-m]').forEach(b=>b.onclick=guard(async()=>{await api('PATCH','/api/stages/'+b.dataset.i,{direction:b.dataset.m});go()}));
    $$('[data-ar]').forEach(b=>b.onclick=guard(async()=>{const s=S.stages.find(x=>x.id==b.dataset.ar);await api('PATCH','/api/stages/'+s.id,{archived:!s.archived});go()}));
    const uf=[{k:'name',l:'Nome',w:1},{k:'username',l:'Usuário'},{k:'email',l:'E-mail'},{k:'password',l:'Senha (mín. 8)'},{k:'role',l:'Perfil',t:'select',o:[['seller','Vendedor'],['manager','Gestor'],['org_admin','Administrador']]}];
    $('#nu').onclick=()=>modal('Novo usuário',`<form class="grid2">${fields(uf)}<div style="grid-column:1/-1"><button class="btn">Criar</button></div></form>`,(b,close)=>{$('form',b).onsubmit=guard(async ev=>{ev.preventDefault();await api('POST','/api/users',collect(ev.target,uf));close();toast('Usuário criado');go()})})}
}
boot();
