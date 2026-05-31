// Legacy one-time migration helper from the old local MySQL database to Supabase.
// Not used by the application runtime.
const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')
require('dotenv').config()

const tables = [
  'roles',
  'usuarios',
  'clientes',
  'proveedores',
  'categorias',
  'productos',
  'cajas',
  'ventas',
  'detalle_ventas',
  'apartados',
  'detalle_apartados',
  'pagos_apartado',
  'beneficios',
  'beneficios_asignados',
  'compras',
  'detalle_compras',
  'pagos_compras',
  'movimientos_inventario',
  'categorias_gastos',
  'gastos',
  'movimientos_caja',
  'configuracion',
]

const booleanColumns = new Set([
  'beneficios.is_automatic',
  'beneficios.activo',
  'categorias.activo',
  'categorias_gastos.activo',
  'clientes.activo',
  'productos.activo',
  'proveedores.activo',
  'usuarios.activo',
  'movimientos_inventario.sospechoso',
])

const jsonColumns = new Set(['roles.permisos'])

function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`
}

function sqlValue(table, column, value) {
  if (value === null || value === undefined) return 'null'

  const key = `${table}.${column}`
  if (booleanColumns.has(key)) return Number(value) === 1 || value === true ? 'true' : 'false'
  if (jsonColumns.has(key)) return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`

  if (value instanceof Date) return `'${value.toISOString().replace('T', ' ').replace('Z', '+00')}'`
  if (typeof value === 'number') return String(value)
  if (typeof value === 'bigint') return value.toString()

  return `'${String(value).replace(/'/g, "''").replace(/\u0000/g, '')}'`
}

async function main() {
  const outputArgIndex = process.argv.indexOf('--output')
  const outputPath = outputArgIndex >= 0 ? process.argv[outputArgIndex + 1] : path.join('supabase', 'seed.local.sql')

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'orchid_pos',
    dateStrings: false,
  })

  const lines = [
    '-- Orchid POS data export for Supabase/PostgreSQL.',
    '-- Generated from local MySQL. Review before applying to cloud.',
    'begin;',
    '',
  ]

  lines.push(`truncate table ${tables.map((table) => `public.${quoteIdent(table)}`).reverse().join(', ')} restart identity cascade;`)
  lines.push('')

  for (const table of tables) {
    const [columnsRows] = await connection.query(
      'select column_name from information_schema.columns where table_schema = database() and table_name = ? order by ordinal_position',
      [table],
    )
    const columns = columnsRows.map((row) => row.COLUMN_NAME)
    const [rows] = await connection.query(`select * from ??`, [table])

    if (!rows.length) continue

    lines.push(`-- ${table}`)
    const columnSql = columns.map(quoteIdent).join(', ')
    for (const row of rows) {
      const values = columns.map((column) => sqlValue(table, column, row[column])).join(', ')
      lines.push(`insert into public.${quoteIdent(table)} (${columnSql}) values (${values});`)
    }
    lines.push('')
  }

  for (const table of tables) {
    lines.push(`select setval(pg_get_serial_sequence('public.${table}', 'id'), greatest((select coalesce(max(id), 1) from public.${quoteIdent(table)}), 1), true);`)
  }

  lines.push('', 'commit;', '')

  await connection.end()
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.promises.writeFile(outputPath, lines.join('\n'), 'utf8')
  console.log(`Data export written to ${outputPath}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
