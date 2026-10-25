/* The publishable key is intentionally public. Database access is protected by RLS. */
window.BESTI_SUPABASE_CONFIG = {
  url: 'https://ppshmulvwecmgjjmqrbw.supabase.co',
  publishableKey: 'sb_publishable_Oead9lfRgC8OPVjqWVYJYw_3gjYV8FZ'
};

window.BestiCloud = (() => {
  const {url, publishableKey} = window.BESTI_SUPABASE_CONFIG;
  const sessionKey = 'besti-supabase-session-v1';
  let session = readSession();
  let persistentSession = Boolean(localStorage.getItem(sessionKey));

  function readSession() {
    try { return JSON.parse(sessionStorage.getItem(sessionKey) || localStorage.getItem(sessionKey) || 'null'); }
    catch { return null; }
  }
  function saveSession(value, remember = persistentSession) {
    session = value ? {...value, expires_at: value.expires_at || (value.expires_in ? Math.floor(Date.now() / 1000) + value.expires_in : undefined)} : null;
    if (session) {
      persistentSession = remember;
      const storage = remember ? localStorage : sessionStorage;
      const otherStorage = remember ? sessionStorage : localStorage;
      otherStorage.removeItem(sessionKey);
      storage.setItem(sessionKey, JSON.stringify(session));
    } else {
      localStorage.removeItem(sessionKey);
      sessionStorage.removeItem(sessionKey);
      persistentSession = false;
    }
  }
  async function refreshSession() {
    if (!session?.refresh_token) return null;
    const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: {'Content-Type': 'application/json', apikey: publishableKey},
      body: JSON.stringify({refresh_token: session.refresh_token})
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { saveSession(null); throw new Error(body.msg || body.message || 'Сессия истекла. Войдите снова.'); }
    saveSession(body);
    return body;
  }
  async function accessToken() {
    if (!session?.access_token) throw new Error('Войдите в аккаунт.');
    if (session.expires_at && session.expires_at * 1000 < Date.now() + 30000) await refreshSession();
    return session.access_token;
  }
  async function request(path, {method = 'GET', body, headers = {}, auth = true} = {}) {
    const requestHeaders = {apikey: publishableKey, ...headers};
    if (auth) requestHeaders.Authorization = `Bearer ${await accessToken()}`;
    else requestHeaders.Authorization = `Bearer ${publishableKey}`;
    if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
    const response = await fetch(`${url}${path}`, {
      method, headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const responseBody = await response.json().catch(() => null);
    if (!response.ok) throw new Error(responseBody?.message || responseBody?.msg || responseBody?.hint || 'Не удалось связаться с базой.');
    return responseBody;
  }
  async function sendCode(email, createUser, userData = {}) {
    return request('/auth/v1/otp', {method: 'POST', auth: false, body: {
      email, create_user: createUser, data: userData
    }});
  }
  async function signUp(email, password, userData = {}, remember = false) {
    const result = await request('/auth/v1/signup', {method: 'POST', auth: false, body: {
      email, password, data: userData
    }});
    if (!result.access_token) throw new Error('Регистрация создана, но Supabase ждёт подтверждение почты. Отключите Confirm email в настройках Auth или подключите SMTP.');
    saveSession(result, remember);
    return result.user;
  }
  async function signIn(email, password, remember = false) {
    const result = await request('/auth/v1/token?grant_type=password', {method: 'POST', auth: false, body: {email, password}});
    if (!result.access_token) throw new Error('Не удалось войти. Проверьте почту и пароль.');
    saveSession(result, remember);
    return result.user;
  }
  async function verifyCode(email, token, type) {
    const result = await request('/auth/v1/verify', {method: 'POST', auth: false, body: {email, token, type}});
    if (!result.access_token) throw new Error('Не удалось подтвердить код. Проверьте его и попробуйте ещё раз.');
    saveSession(result);
    return result.user;
  }
  async function getProfile() {
    const user = session?.user;
    if (!user?.id) return null;
    const rows = await request(`/rest/v1/profiles?select=*&id=eq.${encodeURIComponent(user.id)}&limit=1`);
    return rows?.[0] || null;
  }
  async function saveProfile(profile, consent = false) {
    const user = session?.user;
    if (!user?.id) throw new Error('Войдите в аккаунт.');
    const body = {
      id: user.id,
      first_name: profile.firstName || profile.first_name || '',
      last_name: profile.lastName || profile.last_name || '',
      email: user.email || profile.email || '',
      phone: profile.phone || '',
      telegram: profile.telegram || '',
      birth_date: profile.birthDate || profile.birth_date || null,
      pickup_point: profile.pickupPoint || profile.pickup_point || ''
    };
    if (consent || profile.personalDataConsent === true || profile.personal_data_consent === true) {
      body.personal_data_consent = true;
      body.personal_data_consent_at = profile.personalDataConsentAt || profile.personal_data_consent_at || new Date().toISOString();
    }
    const existing = await getProfile();
    let rows;
    if (existing) {
      // PATCH avoids invoking the INSERT RLS policy during an upsert of an existing profile.
      rows = await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`, {
        method: 'PATCH', body,
        headers: {Prefer: 'return=representation'}
      });
    } else {
      if (body.personal_data_consent !== true) {
        throw new Error('Для создания профиля нужно согласие на обработку персональных данных.');
      }
      rows = await request('/rest/v1/profiles', {
        method: 'POST', body,
        headers: {Prefer: 'return=representation'}
      });
    }
    return rows?.[0] || await getProfile();
  }
  async function createOrder(items) {
    const result = await request('/rest/v1/rpc/create_besti_order', {method: 'POST', body: {p_items: items}});
    return result;
  }
  async function getOrders() {
    return request('/rest/v1/orders?select=*&order=created_at.desc&limit=1000');
  }
  async function getProducts({includeInactive = false} = {}) {
    const activeFilter = includeInactive ? '' : '&is_active=eq.true';
    const rows = await request(`/rest/v1/catalog_products?select=*&order=sku&limit=1000${activeFilter}`, {auth: includeInactive});
    const legacy = new Map((window.BESTI_PRODUCTS || []).map(product => [product.sku, product]));
    return rows.map(row => {
      const old = legacy.get(row.sku) || {};
      const images = Array.isArray(row.images) && row.images.length ? row.images : (old.images || [row.image || old.image].filter(Boolean));
      return {
        ...old, ...row,
        name: row.name || old.name,
        price: row.price === undefined ? old.price : row.price,
        group: row.category_group || old.group || 'outerwear',
        subcategory: row.subcategory ?? old.subcategory ?? '',
        fabric: row.fabric ?? old.fabric ?? '',
        description: row.description ?? old.description ?? '',
        hit: row.hit ?? old.hit ?? false,
        newItem: row.new_item ?? old.newItem ?? false,
        sale: row.sale ?? old.sale ?? false,
        tag: row.tag ?? old.tag ?? '',
        tone: row.tone ?? old.tone ?? 1,
        shape: row.shape ?? old.shape ?? 'coat',
        sizeMode: row.size_mode,
        sizeStock: row.size_stock || {},
        oneSizeStock: Number(row.one_size_stock || 0),
        stock: row.size_mode === 'one' ? Number(row.one_size_stock || 0) : Object.values(row.size_stock || {}).reduce((sum, value) => sum + Number(value || 0), 0),
        images,
        image: row.image || images[0] || old.image || ''
      };
    });
  }
  async function saveProduct(product) {
    const row = {
      sku: String(product.sku || '').trim().toUpperCase(),
      name: String(product.name || '').trim(),
      price: product.price === '' || product.price == null ? null : Number(product.price),
      size_mode: product.sizeMode,
      size_stock: product.sizeMode === 'one' ? {} : product.sizeStock,
      one_size_stock: product.sizeMode === 'one' ? Number(product.oneSizeStock || 0) : 0,
      category_group: product.group,
      subcategory: product.subcategory || '',
      fabric: product.fabric || '',
      description: product.description || '',
      tag: product.tag || '',
      hit: Boolean(product.hit),
      new_item: Boolean(product.newItem),
      sale: Boolean(product.sale),
      tone: Number(product.tone || 1),
      shape: product.shape || 'coat',
      image: product.images?.[0] || product.image || '',
      images: product.images || [],
      is_active: product.isActive !== false
    };
    const rows = await request('/rest/v1/catalog_products?on_conflict=sku', {
      method: 'POST', body: row,
      headers: {Prefer: 'resolution=merge-duplicates,return=representation'}
    });
    return rows?.[0] || row;
  }
  async function uploadProductImages(files, sku) {
    const urls = [];
    for (const file of files) {
      if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Для фото подходят JPG, PNG или WEBP.');
      if (file.size > 12 * 1024 * 1024) throw new Error('Размер одного фото не должен превышать 12 МБ.');
      const token = await accessToken();
      const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
      const path = `products/${encodeURIComponent(sku)}/${crypto.randomUUID()}.${extension}`;
      const response = await fetch(`${url}/storage/v1/object/product-images/${path}`, {
        method: 'POST',
        headers: {apikey: publishableKey, Authorization: `Bearer ${token}`, 'Content-Type': file.type, 'x-upsert': 'false'},
        body: file
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || result.error || 'Не удалось загрузить фотографию. Проверьте настройки Storage.');
      urls.push(`${url}/storage/v1/object/public/product-images/${path}`);
    }
    return urls;
  }
  async function archiveProduct(sku) {
    return request(`/rest/v1/catalog_products?sku=eq.${encodeURIComponent(sku)}`, {
      method: 'PATCH', body: {is_active: false}, headers: {Prefer: 'return=representation'}
    });
  }
  async function deleteProduct(sku) {
    return request(`/rest/v1/catalog_products?sku=eq.${encodeURIComponent(sku)}`, {
      method: 'DELETE', headers: {Prefer: 'return=representation'}
    });
  }
  async function signOut() {
    try { if (session?.access_token) await request('/auth/v1/logout', {method: 'POST', body: {}}); }
    finally { saveSession(null); }
  }
  function currentUser() { return session?.user || null; }
  function isSignedIn() { return Boolean(session?.access_token && session?.user?.id); }

  return {sendCode, verifyCode, signUp, signIn, getProfile, saveProfile, createOrder, getOrders, getProducts, saveProduct, uploadProductImages, archiveProduct, deleteProduct, signOut, currentUser, isSignedIn};
})();
