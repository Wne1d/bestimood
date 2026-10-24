-- Run once in Supabase SQL Editor after schema.sql and the initial catalogue seed.
-- Adds admin-managed product data, safe catalogue policies, image storage, and atomic stock deduction.

alter table public.catalog_products
  add column if not exists category_group text,
  add column if not exists subcategory text,
  add column if not exists fabric text,
  add column if not exists description text,
  add column if not exists tag text,
  add column if not exists hit boolean,
  add column if not exists new_item boolean,
  add column if not exists sale boolean,
  add column if not exists tone integer,
  add column if not exists shape text,
  add column if not exists image text,
  add column if not exists images jsonb not null default '[]'::jsonb,
  add column if not exists is_active boolean not null default true;

alter table public.catalog_products enable row level security;
drop policy if exists "Anyone can read product catalogue" on public.catalog_products;
drop policy if exists "Public and admins can read product catalogue" on public.catalog_products;
drop policy if exists "Admins can insert products" on public.catalog_products;
drop policy if exists "Admins can update products" on public.catalog_products;
drop policy if exists "Admins can delete products" on public.catalog_products;
create policy "Public and admins can read product catalogue" on public.catalog_products
  for select to anon, authenticated using (is_active or (select public.is_besti_admin()));
create policy "Admins can insert products" on public.catalog_products
  for insert to authenticated with check ((select public.is_besti_admin()));
create policy "Admins can update products" on public.catalog_products
  for update to authenticated using ((select public.is_besti_admin())) with check ((select public.is_besti_admin()));
create policy "Admins can delete products" on public.catalog_products
  for delete to authenticated using ((select public.is_besti_admin()));
revoke all on public.catalog_products from anon, authenticated;
grant select on public.catalog_products to anon, authenticated;
grant insert, update, delete on public.catalog_products to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 12582912, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 12582912,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Anyone can view product images" on storage.objects;
drop policy if exists "Admins can upload product images" on storage.objects;
drop policy if exists "Admins can update product images" on storage.objects;
drop policy if exists "Admins can delete product images" on storage.objects;
create policy "Anyone can view product images" on storage.objects
  for select to anon, authenticated using (bucket_id = 'product-images');
create policy "Admins can upload product images" on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images' and (select public.is_besti_admin()));
create policy "Admins can update product images" on storage.objects
  for update to authenticated using (bucket_id = 'product-images' and (select public.is_besti_admin()))
  with check (bucket_id = 'product-images' and (select public.is_besti_admin()));
create policy "Admins can delete product images" on storage.objects
  for delete to authenticated using (bucket_id = 'product-images' and (select public.is_besti_admin()));

create or replace function public.create_besti_order(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_items jsonb := '[]'::jsonb;
  v_item jsonb;
  v_qty integer;
  v_price numeric(12,2);
  v_product public.catalog_products%rowtype;
  v_available integer;
  v_size text;
  v_total numeric(12,2) := 0;
  v_has_unpriced boolean := false;
  v_order public.orders%rowtype;
begin
  if v_user_id is null then raise exception 'Нужно войти в аккаунт'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 50 then
    raise exception 'Корзина пуста или содержит слишком много позиций';
  end if;
  select * into v_profile from public.profiles where id = v_user_id;
  if not found or not v_profile.personal_data_consent then raise exception 'Профиль не заполнен или нет согласия на обработку данных'; end if;
  if coalesce(trim(v_profile.pickup_point), '') = '' then raise exception 'Укажите адрес ПВЗ в профиле перед оформлением заказа'; end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'quantity')::integer;
    if v_qty < 1 or v_qty > 99 then raise exception 'Некорректное количество товара'; end if;
    select * into v_product from public.catalog_products
      where sku = v_item ->> 'sku' and is_active = true for update;
    if not found then raise exception 'Товар % не найден или снят с продажи', v_item ->> 'sku'; end if;
    v_size := left(coalesce(v_item ->> 'size', ''), 30);
    if v_product.size_mode = 'one' then
      v_available := v_product.one_size_stock;
    else
      v_available := coalesce((v_product.size_stock ->> v_size)::integer, 0);
    end if;
    if v_available < v_qty then raise exception 'Недостаточно товара % выбранного размера. Обновите страницу каталога.', v_product.name; end if;

    if v_product.size_mode = 'one' then
      update public.catalog_products set one_size_stock = v_available - v_qty where sku = v_product.sku;
    else
      update public.catalog_products
        set size_stock = jsonb_set(size_stock, array[v_size], to_jsonb(v_available - v_qty), true)
        where sku = v_product.sku;
    end if;

    v_price := v_product.price;
    if v_price is null then v_has_unpriced := true; else v_total := v_total + v_price * v_qty; end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'sku', v_product.sku, 'name', v_product.name, 'size', v_size,
      'quantity', v_qty, 'price', v_price
    ));
  end loop;

  insert into public.orders (order_number, user_id, customer_number, first_name, last_name, email, phone, telegram, pickup_point, items, total)
  values (
    'ORD-' || lpad(nextval('public.order_number_seq')::text, 6, '0'),
    v_user_id, v_profile.customer_number, v_profile.first_name, v_profile.last_name,
    v_profile.email, v_profile.phone, v_profile.telegram, v_profile.pickup_point,
    v_items, case when v_has_unpriced then null else v_total end
  ) returning * into v_order;
  return to_jsonb(v_order);
end;
$$;

revoke all on function public.create_besti_order(jsonb) from public, anon;
grant execute on function public.create_besti_order(jsonb) to authenticated;
