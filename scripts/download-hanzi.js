import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import https from 'https'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '../public/assets/deck/hanzi-data')
const starterDeckPath = path.join(__dirname, '../public/assets/deck/hsk1-starter.json')

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const deck = JSON.parse(fs.readFileSync(starterDeckPath, 'utf8'))
const chars = new Set()

deck.cards.forEach(card => {
  for (const char of card.hanzi) {
    // Only fetch Chinese characters
    if (char.match(/[\u4e00-\u9fa5]/)) {
      chars.add(char)
    }
  }
})

console.log(`Found ${chars.size} unique characters. Downloading data...`)

let downloaded = 0
let failed = 0

async function downloadChar(char) {
  const filePath = path.join(dataDir, `${char}.json`)
  if (fs.existsSync(filePath)) {
    downloaded++
    return
  }

  const url = `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${encodeURIComponent(char)}.json`
  
  return new Promise((resolve) => {
    https.get(url, (res) => {
      if (res.statusCode === 200) {
        const file = fs.createWriteStream(filePath)
        res.pipe(file)
        file.on('finish', () => {
          file.close()
          downloaded++
          resolve()
        })
      } else {
        console.error(`Failed to download ${char}: ${res.statusCode}`)
        failed++
        resolve()
      }
    }).on('error', (err) => {
      console.error(`Error downloading ${char}: ${err.message}`)
      failed++
      resolve()
    })
  })
}

async function run() {
  const charArray = Array.from(chars)
  // Process in batches of 5 to avoid overwhelming the server
  for (let i = 0; i < charArray.length; i += 5) {
    const batch = charArray.slice(i, i + 5)
    await Promise.all(batch.map(downloadChar))
  }
  console.log(`Done! Downloaded ${downloaded}, Failed ${failed}`)
}

run()
