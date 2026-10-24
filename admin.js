const loginForm=document.querySelector('#admin-login-form');
const authPanel=document.querySelector('#admin-auth');
const ordersPanel=document.querySelector('#admin-orders');
const rowsNode=document.querySelector('#admin-order-rows');
const emptyNode=document.querySelector('#admin-empty');
const searchNode=document.querySelector('#admin-search');
let allOrders=[];
const productsView=document.querySelector('#products-view');
const ordersView=document.querySelector('#orders-view');
const productRows=document.querySelector('#product-rows');
const productEmpty=document.querySelector('#product-empty');
const productSearch=document.querySelector('#product-search');
const productForm=document.querySelector('#product-form');
let allProducts=[];
let editingSku='';

function esc(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
function formatMoney(value){return Number(value||0).toLocaleString('ru-RU')+' ₽'}
function displayDate(value){const date=new Date(value);return Number.isNaN(date.getTime())?'—':new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(date)}
function authorized(){return BestiCloud.currentUser()?.app_metadata?.role==='admin'}
function showOrders(){authPanel.hidden=true;ordersPanel.hidden=false;loadOrders()}
function showAdminTab(tab){
  document.querySelectorAll('[data-admin-tab]').forEach(button=>button.classList.toggle('is-active',button.dataset.adminTab===tab));
  ordersView.hidden=tab!=='orders';productsView.hidden=tab!=='products';
  if(tab==='products')loadProducts();
}
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
function productStock(product){return product.size_mode==='one'?`Единый: ${Number(product.one_size_stock||0)}`:['XS','S','M','L','XL'].map(size=>`${size}: ${Number(product.size_stock?.[size]||0)}`).join(' · ')}
function renderProducts(){
  const query=productSearch.value.trim().toLowerCase();
  const filtered=allProducts.filter(product=>!query||`${product.sku} ${product.name}`.toLowerCase().includes(query));
  productRows.innerHTML=filtered.map(product=>{
    const image=product.image||product.images?.[0]||'';
    return `<tr class="product-row"><td>${image?`<img class="product-thumb" src="${esc(image)}" alt="">`:'—'}</td><td><strong>${esc(product.sku)}</strong><br>${esc(product.name)}</td><td>${product.price==null?'—':formatMoney(product.price)}</td><td>${esc(productStock(product))}</td><td>${product.is_active?'В каталоге':'Скрыт'}</td><td><button type="button" data-product-edit="${esc(product.sku)}">Изменить</button>${product.is_active?` <button class="archive-product" type="button" data-product-hide="${esc(product.sku)}">Скрыть</button>`:''}</td></tr>`;
  }).join('');
  productEmpty.hidden=filtered.length>0;
}
async function loadProducts(){
  const message=document.querySelector('#product-list-error');message.textContent='Загружаем товары…';
  try{allProducts=await BestiCloud.getProducts({includeInactive:true});message.textContent='';renderProducts()}
  catch(error){message.textContent=`Не удалось загрузить каталог. Проверьте, что supabase/admin-products.sql выполнен: ${error.message}`;allProducts=[];renderProducts()}
}
function setSizeMode(mode){
  const sized=mode==='sized';document.querySelector('#sized-stock-fields').hidden=!sized;document.querySelector('#one-size-field').hidden=sized;
}
function openProductForm(product=null){
  productForm.reset();editingSku=product?.sku||'';
  document.querySelector('#product-form-message').textContent='';
  productForm.hidden=false;
  if(product){
    for(const name of ['sku','name','price','subcategory','fabric','description','tag','group','shape'])if(productForm.elements.namedItem(name))productForm.elements.namedItem(name).value=product[name]??'';
    productForm.elements.sku.readOnly=true;
    productForm.elements.sizeMode.value=product.size_mode||'sized';
    productForm.elements.oneSizeStock.value=Number(product.one_size_stock||0);
    for(const size of ['XS','S','M','L','XL'])productForm.elements[`stock${size}`].value=Number(product.size_stock?.[size]||0);
    productForm.elements.images.value=(product.images?.length?product.images:[product.image].filter(Boolean)).join('\n');
    for(const name of ['hit','newItem','sale'])productForm.elements[name].checked=Boolean(product[name]);
    productForm.elements.isActive.checked=product.is_active!==false;
  }else{
    productForm.elements.sku.readOnly=false;
    productForm.elements.sku.value=`NEW-${Date.now()}`;
    productForm.elements.group.value='outerwear';productForm.elements.shape.value='coat';
  }
  setSizeMode(productForm.elements.sizeMode.value);
  productForm.scrollIntoView({behavior:'smooth',block:'start'});
}
productForm.elements.sizeMode.addEventListener('change',event=>setSizeMode(event.target.value));
document.querySelector('#product-add').addEventListener('click',()=>openProductForm());
document.querySelector('#product-cancel').addEventListener('click',()=>{productForm.hidden=true;editingSku=''});
document.querySelector('#product-refresh').addEventListener('click',loadProducts);
productSearch.addEventListener('input',renderProducts);
document.querySelector('.admin-tabs').addEventListener('click',event=>{const tab=event.target.closest('[data-admin-tab]');if(tab)showAdminTab(tab.dataset.adminTab)});
productRows.addEventListener('click',async event=>{
  const edit=event.target.closest('[data-product-edit]');
  if(edit){const product=allProducts.find(item=>item.sku===edit.dataset.productEdit);if(product)openProductForm(product);return}
  const hide=event.target.closest('[data-product-hide]');
  if(hide){hide.disabled=true;try{await BestiCloud.archiveProduct(hide.dataset.productHide);await loadProducts()}catch(error){document.querySelector('#product-list-error').textContent=error.message;hide.disabled=false}}
});
productForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const message=document.querySelector('#product-form-message');const button=productForm.querySelector('[type="submit"]');button.disabled=true;message.style.color='';message.textContent='Сохраняем…';
  try{
    const form=productForm.elements;
    const mode=form.sizeMode.value;
    const product={
      sku:form.sku.value.trim().toUpperCase(),name:form.name.value.trim(),price:form.price.value,
      group:form.group.value,subcategory:form.subcategory.value.trim(),sizeMode:mode,
      sizeStock:Object.fromEntries(['XS','S','M','L','XL'].map(size=>[size,Math.max(0,Number(form[`stock${size}`].value)||0)])),
      oneSizeStock:Math.max(0,Number(form.oneSizeStock.value)||0),fabric:form.fabric.value.trim(),
      description:form.description.value.trim(),shape:form.shape.value,tag:form.tag.value.trim(),
      hit:form.hit.checked,newItem:form.newItem.checked,sale:form.sale.checked,isActive:form.isActive.checked,
      images:form.images.value.split(/\r?\n/).map(value=>value.trim()).filter(Boolean)
    };
    const files=[...form.photos.files];
    if(files.length)product.images=[...await BestiCloud.uploadProductImages(files,product.sku),...product.images];
    await BestiCloud.saveProduct(product);
    message.style.color='#55745f';message.textContent='Товар сохранён.';
    await loadProducts();
    window.setTimeout(()=>{productForm.hidden=true;editingSku=''},400);
  }catch(error){message.style.color='#9b4d58';message.textContent=error.message||'Не удалось сохранить товар.'}
  finally{button.disabled=false}
});
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
