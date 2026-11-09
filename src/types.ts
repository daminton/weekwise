export type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'

export interface Food {
  id: string
  name: string
  brand?: string
  barcode?: string
  servingLabel: string
  calories: number
  protein: number
  carbs: number
  fat: number
  source: 'openfoodfacts' | 'manual' | 'custom'
}

export interface FoodLog {
  id: string
  date: string // local YYYY-MM-DD
  meal: MealType
  food: Food
  servings: number
  createdAt: number
}

export interface Preferences {
  weekStartsOn: number // 0 Sunday ... 6 Saturday
  weeklyCalories: number
  weeklyProtein: number
  weeklyCarbs: number
  weeklyFat: number
}
