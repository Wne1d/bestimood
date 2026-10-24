-- BESTI MOOD: run once in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create sequence if not exists public.customer_number_seq start 1;
create sequence if not exists public.order_number_seq start 1;

create table if not exists public.catalog_products (
  sku text primary key,
  name text not null,
  price numeric(12,2),
  size_mode text not null,
  size_stock jsonb not null default '{}'::jsonb,
  one_size_stock integer not null default 0
);
alter table public.catalog_products enable row level security;
drop policy if exists "Anyone can read product catalogue" on public.catalog_products;
create policy "Anyone can read product catalogue" on public.catalog_products for select to anon, authenticated using (true);
revoke all on public.catalog_products from anon, authenticated;
grant select on public.catalog_products to anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  customer_number text not null unique,
  first_name text not null default '',
  last_name text not null default '',
  email text not null default '',
  phone text not null default '',
  telegram text not null default '',
  birth_date date,
  pickup_point text not null default '',
  personal_data_consent boolean not null default false,
  personal_data_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.assign_customer_number()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and coalesce(new.customer_number, '') = '' then
    new.customer_number := 'BESTI-' || lpad(nextval('public.customer_number_seq')::text, 6, '0');
  elsif tg_op = 'UPDATE' then
    new.customer_number := old.customer_number;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_assign_customer_number on public.profiles;
create trigger profiles_assign_customer_number
before insert or update on public.profiles
for each row execute function public.assign_customer_number();

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  user_id uuid not null references auth.users(id) on delete restrict,
  customer_number text not null,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  telegram text not null default '',
  pickup_point text not null default '',
  items jsonb not null,
  total numeric(12,2) default 0,
  status text not null default 'Ожидает связи менеджера',
  created_at timestamptz not null default now(),
  constraint orders_items_array check (jsonb_typeof(items) = 'array')
);

create or replace function public.is_besti_admin()
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
$$;

alter table public.profiles enable row level security;
alter table public.orders enable row level security;

drop policy if exists "Customers can read own profile" on public.profiles;
create policy "Customers can read own profile" on public.profiles
for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "Customers can create own profile" on public.profiles;
create policy "Customers can create own profile" on public.profiles
for insert to authenticated with check ((select auth.uid()) = id and personal_data_consent = true);

drop policy if exists "Customers can update own profile" on public.profiles;
create policy "Customers can update own profile" on public.profiles
for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "Customers and admins can read orders" on public.orders;
create policy "Customers and admins can read orders" on public.orders
for select to authenticated using ((select auth.uid()) = user_id or (select public.is_besti_admin()));

revoke all on public.profiles from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
revoke all on public.orders from anon, authenticated;
grant select on public.orders to authenticated;

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

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'quantity')::integer;
    if v_qty < 1 or v_qty > 99 then raise exception 'Некорректное количество товара'; end if;
    select * into v_product from public.catalog_products where sku = v_item ->> 'sku';
    if not found then raise exception 'Товар % не найден в каталоге', v_item ->> 'sku'; end if;
    if v_product.size_mode = 'one' then
      v_available := v_product.one_size_stock;
    else
      v_available := coalesce((v_product.size_stock ->> (v_item ->> 'size'))::integer, 0);
    end if;
    if v_available < v_qty then raise exception 'Недостаточно товара % выбранного размера. Обновите страницу каталога.', v_product.name; end if;
    v_price := v_product.price;
    if v_price is null then
      v_has_unpriced := true;
    else
      v_total := v_total + v_price * v_qty;
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'sku', v_product.sku,
      'name', v_product.name,
      'size', left(coalesce(v_item ->> 'size', ''), 30),
      'quantity', v_qty,
      'price', v_price
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

-- Add a manager after they have registered and verified their email:
-- update auth.users
-- set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
-- where email = 'manager@example.com';
