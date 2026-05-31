# Migración a Supabase

Esta carpeta contiene la migración inicial de Orchid POS desde MySQL a PostgreSQL/Supabase.

## Orden recomendado

1. Crear o elegir el proyecto en Supabase.
2. Ejecutar `migrations/202605300001_initial_orchid_pos_schema.sql` en el SQL Editor o con el CLI de Supabase.
3. Exportar datos locales desde MySQL:

```bash
npm run supabase:export-data
```

Esto genera `supabase/seed.local.sql`. Revísalo antes de subirlo porque contiene datos reales del negocio.

4. Ejecutar `supabase/seed.local.sql` en Supabase para cargar la data.

## Notas importantes

- La migración habilita RLS en todas las tablas públicas y no crea políticas para `anon` ni `authenticated`. El backend debe conectarse desde servidor con credenciales de Postgres/Supabase, no desde el frontend con la llave pública.
- Las vistas usan `security_invoker = true`, recomendado en Supabase/Postgres moderno.
- El backend actual todavía usa MySQL y consultas con placeholders `?`; después de aplicar esta migración hay que adaptar el backend a Postgres (`pg`) y cambiar varias consultas SQL.
