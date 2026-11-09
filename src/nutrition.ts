import type { Food } from './types'

const FIELDS = 'code,product_name,brands,quantity,nutriments,serving_size,image_front_small_url'

export async function lookupBarcode(barcode: string): Promise<Food> {
  const response = await fetch(
    `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`
  )
  if (!response.ok) throw new Error(`Food lookup failed (${response.status}).`)
  const data = await response.json()
  const p = data?.product
  if (data?.status !== 'success' || !p) throw new Error('We could not find that barcode. You can add it manually.')
  const n = p.nutriments || {}
  const hasServingValues = n['energy-kcal_serving'] != null
  const kcal = hasServingValues
    ? n['energy-kcal_serving']
    : (n['energy-kcal_100g'] ?? (n['energy_100g'] ? n['energy_100g'] / 4.184 : undefined))
  if (kcal == null) throw new Error('This product does not have calorie information. You can add it manually.')
  const nutrient = (name: string) => Number(n[`${name}_${hasServingValues ? 'serving' : '100g'}`] || 0)
  return {
    id: `off-${barcode}`,
    name: p.product_name || `Product ${barcode}`,
    brand: p.brands || '',
    barcode,
    servingLabel: hasServingValues ? (p.serving_size || '1 serving') : '100 g',
    calories: Number(kcal),
    protein: nutrient('proteins'),
    carbs: nutrient('carbohydrates'),
    fat: nutrient('fat'),
    source: 'openfoodfacts'
  }
}
