require('dotenv').config()
const { Client } = require('pg')

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL no esta definido en .env')
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  })

  await client.connect()
  const result = await client.query(`
    select
      current_database() as database,
      current_user as user_name,
      current_setting('transaction_read_only') as transaction_read_only,
      version() as version
  `)
  await client.end()

  console.log(JSON.stringify(result.rows[0], null, 2))
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
