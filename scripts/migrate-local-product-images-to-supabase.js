require('dotenv').config()
const fs = require('fs/promises')
const path = require('path')
const { Client } = require('pg')
const { createClient } = require('@supabase/supabase-js')

const bucket = process.env.SUPABASE_PRODUCT_IMAGES_BUCKET || 'product-images'

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  return 'application/octet-stream'
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL no esta definido.')
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridos.')
  }

  const db = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
  })
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  await db.connect()
  const { rows } = await db.query(`
    select id, imagen_url
    from productos
    where imagen_url like '/uploads/productos/%'
  `)

  let migrated = 0
  for (const row of rows) {
    const relativePath = String(row.imagen_url).replace(/^\//, '')
    const localPath = path.join(process.cwd(), relativePath)
    const fileName = path.basename(localPath)
    const storagePath = `productos/${fileName}`

    try {
      const buffer = await fs.readFile(localPath)
      const { error } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
        contentType: contentTypeFor(localPath),
        cacheControl: '31536000',
        upsert: true,
      })
      if (error) throw error

      const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath)
      await db.query('update productos set imagen_url = $1 where id = $2', [data.publicUrl, row.id])
      migrated += 1
      console.log(`Migrated product ${row.id}: ${storagePath}`)
    } catch (error) {
      console.warn(`Skipped product ${row.id}: ${error.message}`)
    }
  }

  await db.end()
  console.log(`Migrated ${migrated} product image(s).`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
