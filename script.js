const products=window.BESTI_PRODUCTS||[];
const grid=document.querySelector('#product-grid');
const count=document.querySelector('#result-count');
const cartCount=document.querySelector('.cart-count');
const sortTrigger=document.querySelector('.sort-trigger');
const sortMenu=document.querySelector('#sort-menu');
const siteHeader=document.querySelector('.site-header');
const cartTrigger=document.querySelector('.bag-button');
const cartDrawer=document.querySelector('#cart-drawer');
const cartOverlay=document.querySelector('.cart-overlay');
const cartItemsNode=document.querySelector('#cart-items');
const cartTotalNode=document.querySelector('#cart-total');
const checkoutButton=document.querySelector('#checkout-button');
const checkoutResult=document.querySelector('#checkout-result');
const checkoutNote=document.querySelector('#checkout-note');
const productModal=document.querySelector('#product-modal');
const productModalOverlay=document.querySelector('.product-modal-overlay');
const productModalContent=document.querySelector('#product-modal-content');
const accountTrigger=document.querySelector('.profile-button');
const accountModal=document.querySelector('#account-modal');
const accountOverlay=document.querySelector('.account-overlay');
const accountForm=document.querySelector('#account-form');
const accountOrdersContent=document.querySelector('#account-orders-content');
const accountSaveNote=document.querySelector('#account-save-note');
const loginForm=document.querySelector('#login-form');
const registerForm=document.querySelector('#register-form');
const verifyForm=document.querySelector('#verify-form');
const categoryTrigger=document.querySelector('.category-trigger');
const categoryPanel=document.querySelector('#category-panel');
const categoryGroups=document.querySelector('#category-groups');
const categoryClose=document.querySelector('.category-close');
const categoryNames={outerwear:'Верхняя одежда',tops:'Кофты',bottoms:'Штаны',sets:'Костюмы',jackets:'Пиджаки'};
const categoryOrder=['outerwear','tops','bottoms','sets','jackets'];
const latestSkus=new Set([...products].sort((a,b)=>skuNumber(b.sku)-skuNumber(a.sku)).slice(0,12).map(item=>item.sku));
let activeFilter='all';
let selectedGroup='';
let visibleLimit=16;
const cartItems=new Map();
let sortMode=0;
let modalProduct=null;
let modalSelectedSize='';
let checkoutPending=false;
let checkoutMessage='';
let checkoutError='';

function skuNumber(sku){return Number((sku||'').match(/\d+$/)?.[0]||0)}
function price(value){return Number.isFinite(value)?new Intl.NumberFormat('ru-RU').format(value)+' ₽':'Цена уточняется'}
function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
function cartKey(sku,size){return `${sku}::${size}`}
function productInCart(sku){return [...cartItems.values()].some(entry=>entry.product.sku===sku)}
function displayName(value){
  const colors=/(?:светло[- ]?сер(?:ый|ая|ое|ые)|тёмно[- ]?(?:сер(?:ый|ая|ое|ые)|син(?:ий|яя|ее|ие))|темно[- ]?(?:сер(?:ый|ая|ое|ые)|син(?:ий|яя|ее|ие))|сер(?:ый|ая|ое|ые)|чёрн(?:ый|ая|ое|ые)|черн(?:ый|ая|ое|ые)|бел(?:ый|ая|ое|ые)|син(?:ий|яя|ее|ие)|голуб(?:ой|ая|ое|ые)|коричнев(?:ый|ая|ое|ые)|бежев(?:ый|ая|ое|ые)|красн(?:ый|ая|ое|ые)|зелён(?:ый|ая|ое|ые)|зелен(?:ый|ая|ое|ые)|бордов(?:ый|ая|ое|ые)|фиолетов(?:ый|ая|ое|ые)|молочн(?:ый|ая|ое|ые)|рыж(?:ий|ая|ее|ие)|лаймов(?:ый|ая|ое|ые)|салатов(?:ый|ая|ое|ые)|оливков(?:ый|ая|ое|ые))/gi;
  return String(value||'').split(/[:,]/,1)[0].replace(/\s+в\s+цветоч(?:ек|ном|ков)(?:\s+принт(?:ом)?)?/gi,'').replace(colors,'').replace(/\s+/g,' ').replace(/\s+([,.:;])/g,'$1').trim();
}
function renderCart(){
  const entries=[...cartItems.entries()];
  const quantity=entries.reduce((sum,[,entry])=>sum+entry.quantity,0);
  const total=entries.reduce((sum,[,entry])=>sum+(Number.isFinite(entry.product.price)?entry.product.price*entry.quantity:0),0);
  const hasUnpriced=entries.some(([,entry])=>!Number.isFinite(entry.product.price));
  cartCount.textContent=quantity;
  cartTrigger.setAttribute('aria-label',`Корзина, товаров: ${quantity}`);
  document.querySelector('.cart-heading-count').textContent=quantity;
  cartTotalNode.textContent=hasUnpriced?'Сумма уточняется':price(total);
  checkoutButton.disabled=!entries.length;
  checkoutButton.hidden=Boolean(checkoutMessage);
  checkoutNote.hidden=!entries.length||Boolean(checkoutMessage)||Boolean(checkoutError);
  checkoutResult.hidden=!checkoutMessage&&!checkoutError;
  checkoutResult.innerHTML=checkoutMessage||escapeHTML(checkoutError);
  if(!entries.length){
    cartItemsNode.innerHTML='<p class="cart-empty">В корзине пока пусто</p>';
    return;
  }
  cartItemsNode.innerHTML=entries.map(([key,entry])=>`<article class="cart-row" data-cart-key="${escapeHTML(key)}">
    <div class="cart-thumb tone-${escapeHTML(entry.product.tone)}${entry.product.image?' has-photo':''}">${entry.product.image?`<img class="cart-photo" src="${escapeHTML(entry.product.image)}" alt="" loading="lazy">`:`<span class="garment ${escapeHTML(entry.product.shape)}"></span>`}</div>
    <div class="cart-row-content"><div class="cart-row-info"><div><h3>${escapeHTML(displayName(entry.product.name))}</h3><p class="cart-row-size">Размер: ${escapeHTML(entry.size)}</p></div><span>${price(entry.product.price)}</span></div>
    <div class="cart-row-controls"><div class="quantity-control"><button type="button" data-cart-action="decrease" aria-label="Уменьшить количество">−</button><span>${entry.quantity}</span><button type="button" data-cart-action="increase" aria-label="Увеличить количество" ${entry.quantity>=entry.maxStock?'disabled':''}>+</button></div><button class="cart-remove" type="button" data-cart-action="remove">Удалить</button></div></div>
  </article>`).join('');
}
function openCart(){cartDrawer.hidden=false;cartOverlay.hidden=false;cartDrawer.setAttribute('aria-hidden','false');cartTrigger.setAttribute('aria-expanded','true');document.body.classList.add('cart-open')}
function closeCart(){cartDrawer.hidden=true;cartOverlay.hidden=true;cartDrawer.setAttribute('aria-hidden','true');cartTrigger.setAttribute('aria-expanded','false');document.body.classList.remove('cart-open')}
async function finishCheckout(){
  if(!cartItems.size||!BestiCloud.isSignedIn())return false;
  const entries=[...cartItems.values()];
  const items=entries.map(entry=>({sku:entry.product.sku,name:displayName(entry.product.name),size:entry.size,quantity:entry.quantity,price:entry.product.price!==null&&entry.product.price!==''&&Number.isFinite(Number(entry.product.price))?Number(entry.product.price):null}));
  let order;
  try{order=await BestiCloud.createOrder(items)}catch(error){checkoutError=`Не удалось сохранить заказ: ${error.message}`;renderCart();return false}
  cartItems.clear();
  checkoutError='';
  checkoutMessage=`Заказ <strong>${escapeHTML(order.order_number)}</strong> оформлен. Спасибо! С вами свяжется менеджер в Telegram с аккаунта <a href="https://t.me/bestimood" target="_blank" rel="noopener">@Bestimood1</a> и примет у вас оплату.`;
  render();renderCart();await renderAccountOrders();
  return true;
}
async function beginCheckout(){
  if(!cartItems.size)return;
  checkoutMessage='';checkoutError='';renderCart();
  if(BestiCloud.isSignedIn()){
    checkoutButton.disabled=true;
    const saved=await finishCheckout();
    checkoutButton.disabled=!cartItems.size;
    if(!saved)renderCart();
    return;
  }
  checkoutPending=true;closeCart();openAccount();
}
function closeCategoryPanel(){categoryPanel.hidden=true;categoryTrigger.setAttribute('aria-expanded','false')}
function buildCategoryMenu(){
  const groups=[...new Set(products.map(item=>item.group))].sort((a,b)=>categoryOrder.indexOf(a)-categoryOrder.indexOf(b));
  categoryGroups.innerHTML=groups.map(group=>`<button class="category-option" type="button" data-group="${escapeHTML(group)}">${escapeHTML(categoryNames[group]||group)}</button>`).join('');
  categoryGroups.insertAdjacentHTML('afterend','<div class="subcategory-list" id="subcategory-list"></div>');
}
function filteredProducts(){
  let list=products.filter(item=>{
    if(activeFilter==='all')return true;
    if(activeFilter==='hits')return item.hit;
    if(activeFilter==='new')return latestSkus.has(item.sku);
    if(activeFilter==='sale')return item.sale;
    if(activeFilter.startsWith('group:'))return item.group===activeFilter.slice(6);
    if(activeFilter.startsWith('subcategory:')){const [,group,subcategory]=activeFilter.split(':');return item.group===group&&item.subcategory===subcategory}
    return true;
  });
  if(sortMode===1)list=[...list].sort((a,b)=>(a.price??Infinity)-(b.price??Infinity));
  if(sortMode===2)list=[...list].sort((a,b)=>(b.price??-Infinity)-(a.price??-Infinity));
  return list;
}
function render(){
  const list=filteredProducts();
  const shown=list.slice(0,visibleLimit);
  count.textContent=`${list.length} ${list.length===1?'модель':list.length>1&&list.length<5?'модели':'моделей'}`;
  grid.innerHTML=shown.length?shown.map((item,index)=>{
    const tag=item.tag||(item.hit?'ХИТ':'');
    return `<article class="product-card" data-sku="${escapeHTML(item.sku)}" tabindex="0" role="button" aria-label="Подробнее: ${escapeHTML(item.name)}" style="animation-delay:${Math.min(index,8)*25}ms">
      <div class="product-visual tone-${item.tone}${item.image?' has-photo':''}" data-slide="0">${item.image?`<img class="product-photo" src="${escapeHTML(item.image)}" alt="${escapeHTML(item.name)}" loading="lazy">`:`<span class="garment ${item.shape}"></span>`}${tag?`<span class="product-tag">${tag}</span>`:''}<button class="favorite" type="button" aria-label="Добавить в избранное">♡</button>${item.image?'':`<button class="gallery-arrow gallery-prev" type="button" aria-label="Предыдущее фото">‹</button><button class="gallery-arrow gallery-next" type="button" aria-label="Следующее фото">›</button><div class="gallery-dots" aria-label="Слайды"><button class="is-active" type="button" aria-label="Слайд 1"></button><button type="button" aria-label="Слайд 2"></button><button type="button" aria-label="Слайд 3"></button></div>`}</div>
      <div class="product-info"><h3>${escapeHTML(displayName(item.name))}</h3><strong>${price(item.price)}</strong></div>
      <button class="add-button${productInCart(item.sku)?' is-in-cart':''}" type="button">${productInCart(item.sku)?'В корзине ✓':'Добавить в корзину'}</button>
    </article>`;
  }).join(''):'<div class="empty-state">В этой категории пока нет товаров</div>';
  const loadMore=document.querySelector('.load-more');
  const hasMore=shown.length<list.length;
  loadMore.hidden=false;
  loadMore.disabled=!hasMore;
  loadMore.innerHTML=hasMore?'Показать ещё <span>↓</span>':'Больше товаров нет';
}
function setFilter(value){
  activeFilter=value;visibleLimit=16;
  document.querySelectorAll('.category-option').forEach(button=>button.classList.toggle('is-active',value===`group:${button.dataset.group}`));
  document.querySelector('[data-filter="all"]')?.classList.toggle('is-active',value==='all');
  render();
}
function setGallerySlide(visual,index){
  const slide=(index+3)%3;
  visual.dataset.slide=String(slide);
  visual.querySelectorAll('.gallery-dots button').forEach((dot,i)=>dot.classList.toggle('is-active',i===slide));
}
function openProductModal(product){
  modalProduct=product;
  modalSelectedSize='';
  const stock=Number.isFinite(product.stock)?(product.stock>0?`В наличии: ${product.stock} шт.`:'Нет в наличии'):'';
  const sizes=product.sizeMode==='sized'?['XS','S','M','L','XL']:product.sizeMode==='one'?['Единый']:[];
  const sizeStock=size=>product.sizeMode==='one'?Number(product.oneSizeStock||0):Number(product.sizeStock?.[size]||0);
  const sizePicker=sizes.length?`<div class="size-picker"><p>Размер</p><div class="size-options">${sizes.map(size=>{const available=sizeStock(size)>0;return `<button class="size-option${available?'':' is-unavailable'}" type="button" data-product-size="${size}" aria-pressed="false" ${available?'':'disabled'}>${size}</button>`}).join('')}</div><span class="size-hint">Выберите размер</span></div>`:'<p class="size-hint size-missing">Размеры не указаны</p>';
  productModalContent.innerHTML=`<div class="product-modal-gallery"><div class="product-visual detail-visual tone-${escapeHTML(product.tone)}${product.image?' has-photo':''}" data-slide="0">${product.image?`<img class="product-photo detail-photo" src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}">`:`<span class="garment ${escapeHTML(product.shape)}"></span><button class="gallery-arrow gallery-prev" type="button" aria-label="Предыдущее фото">‹</button><button class="gallery-arrow gallery-next" type="button" aria-label="Следующее фото">›</button><div class="gallery-dots" aria-label="Слайды"><button class="is-active" type="button" aria-label="Слайд 1"></button><button type="button" aria-label="Слайд 2"></button><button type="button" aria-label="Слайд 3"></button></div>`}</div></div><div class="product-modal-info"><p class="eyebrow">${escapeHTML(categoryNames[product.group]||product.group||'Коллекция BESTI')}</p><h2>${escapeHTML(product.name)}</h2><strong class="product-modal-price">${price(product.price)}</strong>${sizePicker}<dl class="product-details">${product.subcategory?`<div><dt>Категория</dt><dd>${escapeHTML(product.subcategory)}</dd></div>`:''}<div><dt>Состав</dt><dd>${escapeHTML(product.fabric||'')}</dd></div>${stock?`<div><dt>Наличие</dt><dd>${escapeHTML(stock)}</dd></div>`:''}<div><dt>Артикул</dt><dd>${escapeHTML(product.sku)}</dd></div></dl><button class="add-button product-modal-add" type="button" disabled>Выберите размер</button></div>`;
  productModal.hidden=false;productModalOverlay.hidden=false;productModal.setAttribute('aria-hidden','false');document.body.classList.add('product-modal-open');
}
function closeProductModal(){productModal.hidden=true;productModalOverlay.hidden=true;productModal.setAttribute('aria-hidden','true');document.body.classList.remove('product-modal-open');modalProduct=null}
let pendingAuth=null;
let authPreviousView='auth-choice';
let cloudProfile=null;
function showAuthView(view){document.querySelectorAll('.auth-view').forEach(node=>{node.hidden=node.id!==view});document.querySelector('#account-content').hidden=view!=='account-content';const titles={'auth-choice':'Личный кабинет','auth-login':'Войти','auth-register':'Регистрация','auth-verify':'Подтверждение','account-content':'Личный кабинет'};document.querySelector('#account-title').textContent=titles[view]||'Личный кабинет'}
function setAccountTab(tab){
  document.querySelectorAll('.account-tab').forEach(button=>{const active=button.dataset.accountTab===tab;button.classList.toggle('is-active',active);button.setAttribute('aria-selected',String(active))});
  document.querySelectorAll('.account-panel').forEach(panel=>{panel.hidden=panel.id!==`account-${tab}`});
}
async function renderAccountOrders(){
  let orders=[];
  try{orders=await BestiCloud.getOrders()}catch(error){accountOrdersContent.innerHTML=`<p class="auth-error">Не удалось загрузить заказы: ${escapeHTML(error.message)}</p>`;return}
  if(!Array.isArray(orders)||!orders.length){accountOrdersContent.innerHTML='<div class="account-empty"><span class="account-empty-icon" aria-hidden="true">□</span><h3>Заказов пока нет</h3><p>Когда вы оформите заказ, он появится здесь.</p><button class="account-catalog-link" type="button">Перейти в каталог <span>↗</span></button></div>';return}
  accountOrdersContent.innerHTML=orders.map(order=>{
    const items=Array.isArray(order.items)?order.items:[];
    const total=order.total==null?null:Number(order.total);
    const date=order.created_at?new Date(order.created_at):null;
    const dateLabel=date&&!Number.isNaN(date.getTime())?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric'}).format(date):'Дата не указана';
    return `<article class="account-order"><div class="account-order-top"><div><p class="eyebrow">Заказ ${escapeHTML(order.order_number||'')}</p><time>${escapeHTML(dateLabel)}</time></div><span class="account-order-status">${escapeHTML(order.status||'Принят')}</span></div><ul>${items.map(item=>`<li><span>${escapeHTML(item.name||'Товар')}${item.size?` · ${escapeHTML(item.size)}`:''}${Number(item.quantity)>1?` × ${Number(item.quantity)}`:''}</span><span>${item.price!==null&&Number.isFinite(Number(item.price))?price(Number(item.price)*(Number(item.quantity)||1)):'Цена уточняется'}</span></li>`).join('')}</ul><div class="account-order-total"><span>Итого</span><strong>${total===null?'Сумма уточняется':price(total)}</strong></div></article>`;
  }).join('');
}
async function refreshAccountData(){
  try{
    cloudProfile=await BestiCloud.getProfile();
    if(!cloudProfile){showAuthView('auth-choice');return}
    const values={firstName:cloudProfile.first_name,lastName:cloudProfile.last_name,email:cloudProfile.email,phone:cloudProfile.phone,telegram:cloudProfile.telegram,birthDate:cloudProfile.birth_date,customerNumber:cloudProfile.customer_number,pickupPoint:cloudProfile.pickup_point};
    for(const [name,value] of Object.entries(values)){const field=accountForm.elements.namedItem(name);if(field)field.value=value||''}
    await renderAccountOrders();
  }catch(error){accountOrdersContent.innerHTML=`<p class="auth-error">Не удалось загрузить данные: ${escapeHTML(error.message)}</p>`}
}
function openAccount(){
  closeCart();closeProductModal();
  setAccountTab('orders');accountSaveNote.textContent='';
  showAuthView(BestiCloud.isSignedIn()?'account-content':'auth-choice');
  accountModal.hidden=false;accountOverlay.hidden=false;accountModal.setAttribute('aria-hidden','false');accountTrigger.setAttribute('aria-expanded','true');document.body.classList.add('account-open');
  if(BestiCloud.isSignedIn())refreshAccountData();
}
function closeAccount(){checkoutPending=false;accountModal.hidden=true;accountOverlay.hidden=true;accountModal.setAttribute('aria-hidden','true');accountTrigger.setAttribute('aria-expanded','false');document.body.classList.remove('account-open')}
function initializeStyledSelects(){
  document.querySelectorAll('select').forEach((select,index)=>{
    const label=select.closest('label');
    const accessibleName=(label?.childNodes[0]?.textContent||`Выбор ${index+1}`).trim();
    const wrap=document.createElement('span');wrap.className='besti-select';
    select.parentNode.insertBefore(wrap,select);wrap.append(select);
    select.classList.add('besti-select-native');select.tabIndex=-1;select.setAttribute('aria-hidden','true');
    const trigger=document.createElement('button');trigger.type='button';trigger.className='besti-select-trigger';trigger.setAttribute('aria-label',accessibleName);trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
    const value=document.createElement('span');value.className='besti-select-value';
    const chevron=document.createElement('svg');chevron.setAttribute('viewBox','0 0 12 8');chevron.setAttribute('aria-hidden','true');chevron.innerHTML='<path d="m1 1 5 5 5-5"/>';
    trigger.append(value,chevron);
    const menu=document.createElement('div');menu.className='besti-select-menu';menu.setAttribute('role','listbox');menu.hidden=true;
    [...select.options].forEach(option=>{const item=document.createElement('button');item.type='button';item.className='besti-select-option';item.setAttribute('role','option');item.dataset.value=option.value;item.textContent=option.textContent;menu.append(item)});
    wrap.append(trigger,menu);
    const sync=()=>{value.textContent=select.selectedOptions[0]?.textContent||'';menu.querySelectorAll('.besti-select-option').forEach(item=>{const selected=item.dataset.value===select.value;item.classList.toggle('is-selected',selected);item.setAttribute('aria-selected',String(selected))})};
    select.addEventListener('change',sync);sync();
    trigger.addEventListener('click',()=>{const willOpen=menu.hidden;document.querySelectorAll('.besti-select-menu:not([hidden])').forEach(openMenu=>{openMenu.hidden=true;openMenu.previousElementSibling.setAttribute('aria-expanded','false')});menu.hidden=!willOpen;trigger.setAttribute('aria-expanded',String(willOpen));if(willOpen)menu.querySelector('.is-selected')?.focus()});
    menu.addEventListener('click',event=>{const option=event.target.closest('.besti-select-option');if(!option)return;select.value=option.dataset.value;select.dispatchEvent(new Event('change',{bubbles:true}));menu.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.focus()});
    menu.addEventListener('keydown',event=>{const options=[...menu.querySelectorAll('.besti-select-option')];const current=options.indexOf(document.activeElement);if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();options[(current+(event.key==='ArrowDown'?1:-1)+options.length)%options.length]?.focus()}if(event.key==='Escape'){menu.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.focus()}});
  });
  document.addEventListener('click',event=>{if(event.target.closest('.besti-select'))return;document.querySelectorAll('.besti-select-menu:not([hidden])').forEach(menu=>{menu.hidden=true;menu.previousElementSibling.setAttribute('aria-expanded','false')})});
}
function selectGroup(group,applyFilter=true){
  selectedGroup=group;
  if(applyFilter)setFilter(`group:${group}`);
  categoryGroups.querySelectorAll('[data-group]').forEach(button=>button.classList.toggle('is-active',button.dataset.group===group));
  const names=[...new Set(products.filter(item=>item.group===group).map(item=>item.subcategory).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
  const list=document.querySelector('#subcategory-list');
  list.innerHTML=names.map(name=>`<button type="button" data-subcategory="${escapeHTML(name)}">${escapeHTML(name)}</button>`).join('');
}

buildCategoryMenu();
categoryTrigger.addEventListener('click',()=>{
  const opening=categoryPanel.hidden;
  categoryPanel.hidden=!opening;
  categoryTrigger.setAttribute('aria-expanded',String(opening));
});
categoryClose.addEventListener('click',closeCategoryPanel);
categoryPanel.addEventListener('click',event=>{
  const groupButton=event.target.closest('[data-group]');
  const subcategoryButton=event.target.closest('[data-subcategory]');
  const allButton=event.target.closest('[data-filter="all"]');
  if(groupButton){selectGroup(groupButton.dataset.group);return}
  if(subcategoryButton){setFilter(`subcategory:${selectedGroup}:${subcategoryButton.dataset.subcategory}`);closeCategoryPanel();return}
  if(allButton){setFilter('all');closeCategoryPanel()}
});
document.addEventListener('click',event=>{if(!categoryPanel.hidden&&!categoryPanel.contains(event.target)&&!categoryTrigger.contains(event.target))closeCategoryPanel()});
document.querySelectorAll('[data-quick-filter]').forEach(link=>link.addEventListener('click',()=>setFilter(link.dataset.quickFilter)));
document.querySelectorAll('[data-jump-filter]').forEach(link=>link.addEventListener('click',()=>setFilter(link.dataset.jumpFilter)));
sortTrigger.addEventListener('click',()=>{
  const opening=sortMenu.hidden;
  sortMenu.hidden=!opening;
  sortTrigger.setAttribute('aria-expanded',String(opening));
});
sortMenu.addEventListener('click',event=>{
  const option=event.target.closest('[data-sort]');
  if(!option)return;
  sortMode=Number(option.dataset.sort);
  sortTrigger.querySelector('span').textContent=option.textContent;
  sortMenu.querySelectorAll('[data-sort]').forEach(button=>button.classList.toggle('is-active',button===option));
  sortMenu.hidden=true;
  sortTrigger.setAttribute('aria-expanded','false');
  render();
});
document.addEventListener('click',event=>{
  if(!sortMenu.hidden&&!sortMenu.contains(event.target)&&!sortTrigger.contains(event.target)){
    sortMenu.hidden=true;
    sortTrigger.setAttribute('aria-expanded','false');
  }
});
grid.addEventListener('click',event=>{
  const add=event.target.closest('.add-button');
  const fav=event.target.closest('.favorite');
  const galleryArrow=event.target.closest('.gallery-arrow');
  const galleryDot=event.target.closest('.gallery-dots button');
  const card=event.target.closest('.product-card');
  if(galleryArrow){const visual=galleryArrow.closest('.product-visual');setGallerySlide(visual,Number(visual.dataset.slide)+(galleryArrow.classList.contains('gallery-next')?1:-1));return}
  if(galleryDot){setGallerySlide(galleryDot.closest('.product-visual'),[...galleryDot.parentElement.children].indexOf(galleryDot));return}
  if(add){openProductModal(products.find(item=>item.sku===add.closest('.product-card').dataset.sku));return}
  if(fav){fav.classList.toggle('is-favorite');fav.textContent=fav.classList.contains('is-favorite')?'♥':'♡'}
  if(card&&!event.target.closest('button'))openProductModal(products.find(item=>item.sku===card.dataset.sku));
});
grid.addEventListener('keydown',event=>{const card=event.target.closest('.product-card');if(card&&(event.key==='Enter'||event.key===' ')&&!event.target.closest('button')){event.preventDefault();openProductModal(products.find(item=>item.sku===card.dataset.sku))}});
document.querySelector('.product-modal-close').addEventListener('click',closeProductModal);
productModalOverlay.addEventListener('click',closeProductModal);
productModalContent.addEventListener('click',event=>{
  const arrow=event.target.closest('.gallery-arrow');const dot=event.target.closest('.gallery-dots button');
  const visual=event.target.closest('.product-visual');
  if(arrow){setGallerySlide(visual,Number(visual.dataset.slide)+(arrow.classList.contains('gallery-next')?1:-1));return}
  if(dot){setGallerySlide(visual,[...dot.parentElement.children].indexOf(dot));return}
  const sizeButton=event.target.closest('[data-product-size]');
  if(sizeButton&&!sizeButton.disabled){modalSelectedSize=sizeButton.dataset.productSize;productModalContent.querySelectorAll('[data-product-size]').forEach(button=>{button.classList.toggle('is-selected',button===sizeButton);button.setAttribute('aria-pressed',String(button===sizeButton))});const key=cartKey(modalProduct.sku,modalSelectedSize);const inCart=cartItems.has(key);const addButton=productModalContent.querySelector('.product-modal-add');addButton.disabled=false;addButton.classList.toggle('is-in-cart',inCart);addButton.textContent=inCart?'Добавить ещё':'Добавить в корзину';productModalContent.querySelector('.size-hint').textContent=`Выбран размер: ${modalSelectedSize}`;return}
  if(event.target.closest('.product-modal-add')&&modalProduct&&modalSelectedSize){const key=cartKey(modalProduct.sku,modalSelectedSize);const maxStock=modalProduct.sizeMode==='one'?Number(modalProduct.oneSizeStock||0):Number(modalProduct.sizeStock?.[modalSelectedSize]||0);const entry=cartItems.get(key)||{product:modalProduct,size:modalSelectedSize,quantity:0,maxStock};if(entry.quantity>=entry.maxStock)return;checkoutMessage='';checkoutError='';entry.quantity++;cartItems.set(key,entry);render();renderCart();const addButton=productModalContent.querySelector('.product-modal-add');addButton.textContent='Добавлено ✓';addButton.classList.add('is-in-cart')}
});
cartTrigger.addEventListener('click',openCart);
checkoutButton.addEventListener('click',beginCheckout);
accountTrigger.addEventListener('click',openAccount);
document.querySelector('.account-close').addEventListener('click',closeAccount);
accountOverlay.addEventListener('click',closeAccount);
document.querySelector('.account-modal').addEventListener('click',event=>{
  const action=event.target.closest('[data-auth-action]')?.dataset.authAction;
  if(!action)return;
  if(action==='login'){document.querySelector('#login-error').textContent='';loginForm.reset();showAuthView('auth-login')}
  if(action==='register'){document.querySelector('#register-error').textContent='';registerForm.reset();showAuthView('auth-register')}
  if(action==='back'){showAuthView(authPreviousView);document.querySelector('#verify-error').textContent=''}
  if(action==='logout'){BestiCloud.signOut().catch(()=>{}).finally(()=>{cloudProfile=null;showAuthView('auth-choice')})}
});
registerForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const data=Object.fromEntries(new FormData(registerForm).entries());
  const error=document.querySelector('#register-error');
  if(data.personalDataConsent!=='on'){error.textContent='Для регистрации нужно согласие на обработку персональных данных.';return}
  const remember=data.rememberMe==='on';
  delete data.personalDataConsent;
  delete data.rememberMe;
  try{
    const email=data.email.trim().toLowerCase();
    const password=data.password;delete data.password;
    await BestiCloud.signUp(email,password,{first_name:data.firstName,last_name:data.lastName,phone:data.phone,telegram:data.telegram},remember);
    cloudProfile=await BestiCloud.saveProfile({...data,email},true);
    if(!cloudProfile)throw new Error('Аккаунт создан, но не удалось создать профиль. Войдите позже и повторите.');
    setAccountTab('orders');showAuthView('account-content');await refreshAccountData();
    if(checkoutPending){checkoutPending=false;const placed=await finishCheckout();if(placed){closeAccount();openCart()}else{error.textContent=checkoutError||'Не удалось сохранить заказ. Проверьте данные профиля и повторите попытку.'}}
  }catch(problem){error.textContent=problem.message||'Не удалось создать аккаунт.'}
});
loginForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const data=Object.fromEntries(new FormData(loginForm).entries());
  const error=document.querySelector('#login-error');
  try{
    const email=data.email.trim().toLowerCase();
    await BestiCloud.signIn(email,data.password,data.rememberMe==='on');
    cloudProfile=await BestiCloud.getProfile();
    if(!cloudProfile)throw new Error('Профиль не найден. Обратитесь к менеджеру или зарегистрируйтесь заново.');
    setAccountTab('orders');showAuthView('account-content');await refreshAccountData();
    if(checkoutPending){checkoutPending=false;const placed=await finishCheckout();if(placed){closeAccount();openCart()}else{error.textContent=checkoutError||'Не удалось сохранить заказ. Проверьте данные профиля и повторите попытку.'}}
  }catch(problem){error.textContent=problem.message||'Не удалось войти. Проверьте почту и пароль.'}
});
verifyForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const entered=String(new FormData(verifyForm).get('code')||'').trim();
  const error=document.querySelector('#verify-error');
  const submit=verifyForm.querySelector('[type="submit"]');submit.disabled=true;
  try{
    if(!pendingAuth)throw new Error('Начните вход или регистрацию заново.');
    const email=pendingAuth.mode==='register'?pendingAuth.data.email.trim().toLowerCase():pendingAuth.email;
    await BestiCloud.verifyCode(email,entered,pendingAuth.mode==='register'?'signup':'email');
    if(pendingAuth.mode==='register')cloudProfile=await BestiCloud.saveProfile(pendingAuth.data,true);
    else cloudProfile=await BestiCloud.getProfile();
    if(!cloudProfile)throw new Error('Профиль не найден. Зарегистрируйтесь, чтобы создать аккаунт.');
    pendingAuth=null;setAccountTab('orders');showAuthView('account-content');await refreshAccountData();
    if(checkoutPending){checkoutPending=false;const placed=await finishCheckout();if(placed){closeAccount();openCart()}else{error.textContent=checkoutError||'Не удалось сохранить заказ. Проверьте данные профиля и повторите попытку.'}}
  }catch(problem){error.textContent=problem.message||'Не удалось подтвердить код.'}
  finally{submit.disabled=false}
});
document.querySelector('.account-tabs').addEventListener('click',event=>{const tab=event.target.closest('[data-account-tab]');if(tab)setAccountTab(tab.dataset.accountTab)});
accountForm.addEventListener('input',()=>{accountSaveNote.textContent='';});
accountForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const data=Object.fromEntries(new FormData(accountForm).entries());
  try{cloudProfile=await BestiCloud.saveProfile(data);accountSaveNote.textContent='Данные сохранены в аккаунте.';await refreshAccountData()}
  catch(problem){accountSaveNote.textContent=problem.message||'Не удалось сохранить данные.'}
});
accountOrdersContent.addEventListener('click',event=>{if(event.target.closest('.account-catalog-link')){closeAccount();document.querySelector('#catalog').scrollIntoView({behavior:'smooth'})}});
document.querySelector('.cart-close').addEventListener('click',closeCart);
cartOverlay.addEventListener('click',closeCart);
cartItemsNode.addEventListener('click',event=>{
  const action=event.target.closest('[data-cart-action]');
  if(!action)return;
  const row=action.closest('[data-cart-key]');
  const entry=cartItems.get(row.dataset.cartKey);
  if(!entry)return;
  if(action.dataset.cartAction==='increase'&&entry.quantity<entry.maxStock)entry.quantity++;
  if(action.dataset.cartAction==='decrease')entry.quantity--;
  if(action.dataset.cartAction==='remove'||entry.quantity<=0)cartItems.delete(row.dataset.cartKey);
  render();
  renderCart();
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!accountModal.hidden)closeAccount();else if(event.key==='Escape'&&!productModal.hidden)closeProductModal();else if(event.key==='Escape'&&!cartDrawer.hidden)closeCart()});
let swipeStart=null;
grid.addEventListener('pointerdown',event=>{
  if(event.target.closest('button'))return;
  const visual=event.target.closest('.product-visual');
  if(visual)swipeStart={visual,x:event.clientX,y:event.clientY,pointerId:event.pointerId};
});
grid.addEventListener('pointerup',event=>{
  if(!swipeStart||swipeStart.pointerId!==event.pointerId)return;
  const dx=event.clientX-swipeStart.x,dy=event.clientY-swipeStart.y;
  if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy))setGallerySlide(swipeStart.visual,Number(swipeStart.visual.dataset.slide)+(dx<0?1:-1));
  swipeStart=null;
});
grid.addEventListener('pointercancel',()=>{swipeStart=null});
let modalSwipeStart=null;
productModalContent.addEventListener('pointerdown',event=>{if(event.target.closest('button'))return;const visual=event.target.closest('.detail-visual');if(visual)modalSwipeStart={visual,x:event.clientX,y:event.clientY,pointerId:event.pointerId}});
productModalContent.addEventListener('pointerup',event=>{if(!modalSwipeStart||modalSwipeStart.pointerId!==event.pointerId)return;const dx=event.clientX-modalSwipeStart.x,dy=event.clientY-modalSwipeStart.y;if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy))setGallerySlide(modalSwipeStart.visual,Number(modalSwipeStart.visual.dataset.slide)+(dx<0?1:-1));modalSwipeStart=null});
productModalContent.addEventListener('pointercancel',()=>{modalSwipeStart=null});
grid.addEventListener('pointerout',event=>{
  const visual=event.target.closest('.product-visual');
  if(!visual||visual.contains(event.relatedTarget))return;
  const focusedControl=document.activeElement;
  if(visual.contains(focusedControl)&&focusedControl.matches('.gallery-arrow,.gallery-dots button'))focusedControl.blur();
});

const slides=[...document.querySelectorAll('.hero-slide')];
initializeStyledSelects();
const dots=[...document.querySelectorAll('.hero-pagination button')];
let currentSlide=0;
function showSlide(index){currentSlide=(index+slides.length)%slides.length;slides.forEach((slide,i)=>slide.classList.toggle('is-active',i===currentSlide));dots.forEach((dot,i)=>dot.classList.toggle('is-active',i===currentSlide))}
function updateHeaderTransparency(){siteHeader.classList.toggle('is-scrolled',window.scrollY>10)}
window.addEventListener('scroll',updateHeaderTransparency,{passive:true});
updateHeaderTransparency();
document.querySelector('.hero-prev').addEventListener('click',()=>showSlide(currentSlide-1));
document.querySelector('.hero-next').addEventListener('click',()=>showSlide(currentSlide+1));
dots.forEach((dot,i)=>dot.addEventListener('click',()=>showSlide(i)));
document.querySelector('.load-more').addEventListener('click',()=>{visibleLimit+=16;render()});
render();
renderCart();
