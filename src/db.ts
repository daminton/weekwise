import Dexie, { type Table } from 'dexie'
import type { Food, FoodLog } from './types'

class NutritionDatabase extends Dexie {
  logs!: Table<FoodLog, string>
  foods!: Table<Food, string>

  constructor() {
    super('weekwise-nutrition')
    this.version(1).stores({
      logs: 'id, date, meal, createdAt',
      foods: 'id, name, barcode'
    })
  }
}

export const db = new NutritionDatabase()

export async function exportBackup() {
  const [logs, foods] = await Promise.all([db.logs.toArray(), db.foods.toArray()])
  const backup = {
    app: 'Weekwise',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    preferences: JSON.parse(localStorage.getItem('weekwise-preferences') || 'null'),
    logs,
    foods
  }
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `weekwise-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importBackup(file: File) {
  const parsed = JSON.parse(await file.text())
  if (parsed?.app !== 'Weekwise' || !Array.isArray(parsed.logs) || !Array.isArray(parsed.foods)) {
    throw new Error('That file does not look like a Weekwise backup.')
  }
  await db.transaction('rw', db.logs, db.foods, async () => {
    await db.logs.clear()
    await db.foods.clear()
    await db.logs.bulkPut(parsed.logs)
    await db.foods.bulkPut(parsed.foods)
  })
  if (parsed.preferences) localStorage.setItem('weekwise-preferences', JSON.stringify(parsed.preferences))
}
