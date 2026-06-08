require('dotenv').config()
const fs = require('fs/promises')
const path = require('path')
const { Client } = require('pg')

const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations')
const migrationsTable = 'schema_migrations'

async function tableExists(client, tableName) {
  const result = await client.query(
    `select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public' and table_name = $1
    ) as exists`,
    [tableName],
  )
  return Boolean(result.rows[0]?.exists)
}

async function ensureMigrationsTable(client) {
  await client.query(`
    create table if not exists public.${migrationsTable} (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `)
}

async function markExistingBaseline(client, migrationNames) {
  const initialMigration = migrationNames.find((name) => name.includes('initial_orchid_pos_schema'))
  if (!initialMigration) return

  const hasProducts = await tableExists(client, 'productos')
  if (!hasProducts) return

  await client.query(
    `insert into public.${migrationsTable} (name)
     values ($1)
     on conflict (name) do nothing`,
    [initialMigration],
  )
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL no esta definido.')
  }

  const files = (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort()

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  })

  await client.connect()
  try {
    await ensureMigrationsTable(client)
    await markExistingBaseline(client, files)

    const appliedResult = await client.query(`select name from public.${migrationsTable}`)
    const applied = new Set(appliedResult.rows.map((row) => row.name))

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skip ${file}`)
        continue
      }

      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8')
      console.log(`apply ${file}`)
      await client.query('begin')
      try {
        await client.query(sql)
        await client.query(
          `insert into public.${migrationsTable} (name)
           values ($1)
           on conflict (name) do nothing`,
          [file],
        )
        await client.query('commit')
      } catch (error) {
        await client.query('rollback')
        throw error
      }
    }

    console.log('migrations ok')
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
