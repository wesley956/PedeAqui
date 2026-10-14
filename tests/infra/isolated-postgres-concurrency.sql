-- Ephemeral PostgreSQL concurrency harness. TEST MODEL, not full production schema.
-- The patterns being stressed correspond to concurrency contracts in:
-- supabase/sql/21_order_access_token.sql
-- supabase/sql/30_pdv.sql
-- supabase/sql/23_printing.sql
-- Do not deploy this schema or confuse results with tests of those functions.
create table fixture_stores (id integer primary key);
insert into fixture_stores select generate_series(1,8);
create table fixture_carts (
 id integer primary key, store_id integer not null references fixture_stores(id),
 status text not null default 'active'
);
create table fixture_orders (
 id bigint generated always as identity primary key,
 store_id integer not null references fixture_stores(id),
 source_cart_id integer not null unique references fixture_carts(id),
 display_number integer not null,
 unique(store_id, display_number)
);
create table fixture_sequences (
 store_id integer primary key references fixture_stores(id),
 last_number integer not null default 0
);
insert into fixture_sequences select id, 0 from fixture_stores;
create table fixture_pdv_keys (
 store_id integer not null references fixture_stores(id),
 idem_key text not null,
 order_id bigint,
 primary key(store_id, idem_key)
);
create table fixture_print_jobs (
 id bigint generated always as identity primary key,
 store_id integer not null references fixture_stores(id),
 order_id bigint not null references fixture_orders(id),
 status text not null default 'pending',
 claimed_by integer,
 unique(order_id)
);
create or replace function fixture_checkout(p_store int,p_cart int)
returns bigint language plpgsql as $$
declare v_id bigint; v_num integer; v_cart fixture_carts%rowtype;
begin
 select * into v_cart from fixture_carts
 where id=p_cart and store_id=p_store for update;
 if not found then raise exception 'cart unavailable or wrong store'; end if;
 select id into v_id from fixture_orders where source_cart_id=p_cart;
 if found then return v_id; end if;
 if v_cart.status <> 'active' then raise exception 'cart unavailable'; end if;
 update fixture_sequences set last_number=last_number+1
 where store_id=p_store returning last_number into v_num;
 insert into fixture_orders(store_id,source_cart_id,display_number)
 values(p_store,p_cart,v_num) returning id into v_id;
 update fixture_carts set status='converted' where id=p_cart;
 insert into fixture_print_jobs(store_id,order_id) values(p_store,v_id);
 return v_id;
end $$;
-- Mirrors the real PDV key lock's idempotence semantics using an atomic upsert.
create or replace function fixture_pdv(p_store int,p_key text,p_cart int)
returns bigint language plpgsql as $$
declare v_id bigint;
begin
 insert into fixture_pdv_keys(store_id,idem_key) values(p_store,p_key)
 on conflict do nothing;
 select order_id into v_id from fixture_pdv_keys
 where store_id=p_store and idem_key=p_key for update;
 if v_id is not null then return v_id; end if;
 v_id:=fixture_checkout(p_store,p_cart);
 update fixture_pdv_keys set order_id=v_id where store_id=p_store and idem_key=p_key;
 return v_id;
end $$;
