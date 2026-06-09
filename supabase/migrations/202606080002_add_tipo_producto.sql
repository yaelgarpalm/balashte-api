alter table public.productos
  add column if not exists tipo_producto varchar(20) not null default 'venta';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_productos_tipo_producto'
      and conrelid = 'public.productos'::regclass
  ) then
    alter table public.productos
      add constraint chk_productos_tipo_producto check (tipo_producto in ('venta','insumo'));
  end if;
end;
$$;

create index if not exists idx_productos_tipo_producto on public.productos(tipo_producto);

update public.productos
set tipo_producto = 'venta'
where tipo_producto is null;

create or replace view public.vista_productos_bajo_stock
with (security_invoker = true) as
select id, nombre, codigo, stock, stock_minimo, unidad, tipo_producto
from public.productos
where activo = true and deleted_at is null and stock <= stock_minimo;
