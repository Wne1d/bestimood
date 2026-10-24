const loginForm=document.querySelector('#admin-login-form');
const authPanel=document.querySelector('#admin-auth');
const ordersPanel=document.querySelector('#admin-orders');
const rowsNode=document.querySelector('#admin-order-rows');
const emptyNode=document.querySelector('#admin-empty');
const searchNode=document.querySelector('#admin-search');
let allOrders=[];

function esc(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
function formatMoney(value){return Number(value||0).toLocaleString('ru-RU')+' ₽'}
function displayDate(value){const date=new Date(value);return Number.isNaN(date.getTime())?'—':new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(date)}
function authorized(){return BestiCloud.currentUser()?.app_metadata?.role==='admin'}
function showOrders(){authPanel.hidden=true;ordersPanel.hidden=false;loadOrders()}
async function loadOrders(){
  const message=document.querySelector('#admin-list-error');message.textContent='Загружаем заказы…';
  try{allOrders=await BestiCloud.getOrders();message.textContent='';renderOrders()}
  catch(error){message.textContent=error.message||'Не удалось загрузить заказы.';allOrders=[];renderOrders()}
}
function renderOrders(){
  const query=searchNode.value.trim().toLowerCase();
  const orders=allOrders.filter(order=>{
    const haystack=[order.order_number,order.customer_number,order.first_name,order.last_name,order.email,order.phone,order.telegram].join(' ').toLowerCase();
    return !query||haystack.includes(query);
  });
  rowsNode.innerHTML=orders.map(order=>{
    const items=Array.isArray(order.items)?order.items:[];
    const itemLines=items.map(item=>`${esc(item.name||'Товар')}${item.size?` · ${esc(item.size)}`:''} × ${Number(item.quantity)||1}${item.price==null?' · цена уточняется':` · ${formatMoney(Number(item.price)*Number(item.quantity||1))}`}`).join('<br>');
    const telegram=String(order.telegram||'').trim();
    const telegramHref=telegram?`https://t.me/${encodeURIComponent(telegram.replace(/^@/,''))}`:'';
    return `<tr><td><span class="admin-order-num">${esc(order.order_number)}</span><br><span class="admin-muted">${esc(displayDate(order.created_at))}</span><br><span class="admin-muted">Покупатель ${esc(order.customer_number)}</span></td><td>${esc(order.last_name)} ${esc(order.first_name)}</td><td><a href="tel:${esc(order.phone)}">${esc(order.phone)}</a><br><a href="mailto:${esc(order.email)}">${esc(order.email)}</a>${order.pickup_point?`<br><span class="admin-muted">ПВЗ: ${esc(order.pickup_point)}</span>`:''}</td><td>${telegram?`<a href="${telegramHref}" target="_blank" rel="noopener">${esc(telegram)}</a>`:'—'}</td><td>${itemLines||'—'}</td><td>${order.total==null?'Сумма уточняется':formatMoney(order.total)}</td><td>${esc(order.status)}</td></tr>`;
  }).join('');
  emptyNode.hidden=orders.length>0;
}
function csvCell(value){
  let text=String(value??'');
  if(/^[\s]*[=+\-@]/.test(text))text="'"+text;
  return `"${text.replace(/"/g,'""')}"`;
}
function exportCsv(){
  const headers=['Номер заказа','Номер покупателя','Дата','Статус','Фамилия','Имя','Почта','Телефон','Telegram','ПВЗ','Товары','Сумма'];
  const lines=[headers,...allOrders.map(order=>[
    order.order_number,order.customer_number,displayDate(order.created_at),order.status,order.last_name,order.first_name,order.email,order.phone,order.telegram,order.pickup_point,
    (order.items||[]).map(item=>`${item.name}${item.size?` / ${item.size}`:''} × ${item.quantity}${item.price==null?' (цена уточняется)':` (${Number(item.price)} ₽)`}`).join('; '),order.total==null?'Сумма уточняется':order.total
  ])].map(row=>row.map(csvCell).join(';')).join('\r\n');
  const blob=new Blob(['\ufeff',lines],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`BESTI_заказы_${new Date().toISOString().slice(0,10)}.csv`;link.click();URL.revokeObjectURL(url);
}

loginForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const error=document.querySelector('#admin-auth-error');
  const button=loginForm.querySelector('button');button.disabled=true;
  const data=Object.fromEntries(new FormData(loginForm).entries());
  try{
    await BestiCloud.signIn(data.email.trim().toLowerCase(),data.password);
    if(!authorized())throw new Error('У этого аккаунта нет доступа менеджера. Попросите администратора выдать роль и войдите заново.');
    showOrders();
  }
  catch(problem){error.textContent=problem.message||'Не удалось войти.'}
  finally{button.disabled=false}
});
searchNode.addEventListener('input',renderOrders);
document.querySelector('#admin-export').addEventListener('click',exportCsv);
document.querySelector('#admin-logout').addEventListener('click',async()=>{try{await BestiCloud.signOut()}finally{location.reload()}});
if(BestiCloud.isSignedIn()){
  if(authorized())showOrders();
  else{authPanel.hidden=false;document.querySelector('#admin-auth-error').textContent='Аккаунту не назначена роль менеджера. Сначала назначьте роль, затем войдите снова.'}
}
