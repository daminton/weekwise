import { useEffect, useMemo, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import {
  Activity, ArrowLeft, ArrowRight, Barcode, CalendarDays, Check, ChevronDown,
  CircleHelp, Download, Flame, Plus, Search, Settings2, Trash2, Upload, Utensils,
  X, Camera, Scale
} from 'lucide-react'
import { db, exportBackup, importBackup } from './db'
import { lookupBarcode } from './nutrition'
import type { Food, FoodLog, MealType, Preferences } from './types'

const DEFAULT_PREFS: Preferences = {
  weekStartsOn: 1, weeklyCalories: 14000, weeklyProtein: 1120, weeklyCarbs: 1400, weeklyFat: 469
}
const MEALS: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack']
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const money = (n: number) => Math.round(n).toLocaleString()
const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
const fromISO = (s: string) => {
  const [y,m,d] = s.split('-').map(Number)
  return new Date(y, m-1, d)
}
const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const shiftDate = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate()+n); return x }
const startOfWeek = (date: Date, start: number) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() - ((d.getDay() - start + 7) % 7))
  return d
}
const fmt = (d: Date, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) =>
  d.toLocaleDateString(undefined, opts)
const describeWeekOffset = (offset: number) => {
  if (offset === 0) return 'Current week'
  if (offset < 0) {
    return `${Math.abs(offset)} week${offset < -1 ? 's' : ''} ago`
  }
  return `${offset} week${offset > 1 ? 's' : ''} ahead`
}
const newId = () => crypto.randomUUID()

function App() {
  const [prefs, setPrefs] = useState<Preferences>(() => ({
    ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem('weekwise-preferences') || '{}')
  }))
  const [logs, setLogs] = useState<FoodLog[]>([])
  const [foods, setFoods] = useState<Food[]>([])
  const [weekOffset, setWeekOffset] = useState(0)
  const [activeDate, setActiveDate] = useState(todayISO())
  const [showSettings, setShowSettings] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [lookupCode, setLookupCode] = useState('')
  const [lookupBusy, setLookupBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [selectedMeal, setSelectedMeal] = useState<MealType>('Breakfast')
  const [selectedFood, setSelectedFood] = useState<Food | null>(null)
  const [servings, setServings] = useState(1)
  const [manual, setManual] = useState({name:'', servingLabel:'1 serving', calories:'', protein:'', carbs:'', fat:''})
  const [searchText, setSearchText] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const weekStart = useMemo(() => shiftDate(startOfWeek(fromISO(todayISO()), prefs.weekStartsOn), weekOffset*7), [prefs.weekStartsOn, weekOffset])
  const weekDates = useMemo(() => Array.from({length:7}, (_,i)=>shiftDate(weekStart,i)), [weekStart])
  const weekEnd = weekDates[6]
  const weekLogs = useMemo(() => logs.filter(l => l.date >= toISO(weekStart) && l.date <= toISO(weekEnd)), [logs, weekStart, weekEnd])
  const totals = useMemo(() => weekLogs.reduce((a,l) => ({
    calories:a.calories+l.food.calories*l.servings,
    protein:a.protein+l.food.protein*l.servings,
    carbs:a.carbs+l.food.carbs*l.servings,
    fat:a.fat+l.food.fat*l.servings
  }), {calories:0,protein:0,carbs:0,fat:0}), [weekLogs])
  const activeLogs = useMemo(() => logs.filter(l=>l.date===activeDate).sort((a,b)=>a.createdAt-b.createdAt), [logs,activeDate])
  const savedFoods = useMemo(() => foods.filter(f => !searchText || `${f.name} ${f.brand||''}`.toLowerCase().includes(searchText.toLowerCase())), [foods,searchText])

  async function refresh() {
    const [l,f] = await Promise.all([db.logs.toArray(), db.foods.toArray()])
    setLogs(l); setFoods(f)
  }
  useEffect(() => { refresh() }, [])
  useEffect(() => { localStorage.setItem('weekwise-preferences', JSON.stringify(prefs)) }, [prefs])
  useEffect(() => {
    const active = fromISO(activeDate)
    if (active < weekStart || active > weekEnd) setActiveDate(toISO(weekStart))
  }, [weekOffset, prefs.weekStartsOn])
  useEffect(() => {
    if (notice || error) {
      const t = window.setTimeout(()=>{setNotice('');setError('')}, 4500)
      return () => window.clearTimeout(t)
    }
  }, [notice,error])

  async function addFood(food: Food, meal = selectedMeal, date = activeDate, count = 1) {
    await db.foods.put(food)
    await db.logs.add({id:newId(), date, meal, food, servings:count, createdAt:Date.now()})
    await refresh()
    setSelectedFood(null); setShowAdd(false); setShowManual(false); setShowScanner(false)
    setServings(1); setNotice(`${food.name} added to ${meal.toLowerCase()}.`)
  }
  async function deleteLog(id: string) { await db.logs.delete(id); await refresh() }
  async function searchBarcode(code = lookupCode) {
    const clean = code.trim()
    if (!clean) return
    setLookupBusy(true); setError('')
    try {
      const food = await lookupBarcode(clean)
      setSelectedFood(food); setServings(1); setShowScanner(false); setShowAdd(false)
    } catch(e) { setError(e instanceof Error ? e.message : 'Food lookup failed.') }
    finally { setLookupBusy(false) }
  }
  async function startScanner() {
    setShowScanner(true); setError('')
    try {
      const reader = new BrowserMultiFormatReader()
      readerRef.current = reader
      await new Promise(r=>setTimeout(r,150))
      if (!videoRef.current) return
      const devices = await BrowserMultiFormatReader.listVideoInputDevices()
      const preferred = devices.find(d=>/back|rear|environment/i.test(d.label)) || devices[0]
      await reader.decodeFromVideoDevice(preferred?.deviceId, videoRef.current, (result) => {
        if (result) {
          const code = result.getText()
          readerRef.current = null
          setLookupCode(code)
          searchBarcode(code)
        }
      })
    } catch(e) {
      setError('Camera could not start. Allow camera access, or enter the barcode manually.')
    }
  }
  function stopScanner() {
    readerRef.current = null
    setShowScanner(false)
  }
  async function createManualFood() {
    if (!manual.name.trim() || manual.calories === '') return
    const food: Food = {
      id:newId(), name:manual.name.trim(), servingLabel:manual.servingLabel || '1 serving',
      calories:Number(manual.calories)||0, protein:Number(manual.protein)||0,
      carbs:Number(manual.carbs)||0, fat:Number(manual.fat)||0, source:'manual'
    }
    await addFood(food)
  }
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file=e.target.files?.[0]
    if (!file) return
    try {
      await importBackup(file)
      setPrefs({...DEFAULT_PREFS,...JSON.parse(localStorage.getItem('weekwise-preferences')||'{}')})
      await refresh(); setNotice('Backup restored successfully.')
    } catch(err) { setError(err instanceof Error ? err.message : 'Could not import backup.') }
    e.target.value=''
  }
  const pct = (v:number,target:number) => target > 0 ? Math.min(100,v/target*100) : 0
  const remaining = Math.max(0,prefs.weeklyCalories-totals.calories)

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" aria-label="Weekwise home"><span className="brand-mark"><Activity size={19}/></span><span>weekwise</span></a>
      <div className="top-actions">
        <button className="icon-button" onClick={()=>setShowSettings(true)} aria-label="Settings"><Settings2 size={19}/></button>
      </div>
    </header>

    <main className="main-content">
      <section className="welcome-row">
        <div><p className="eyebrow">YOUR NUTRITION, YOUR RHYTHM</p><h1>Weekly overview</h1><p className="muted">A little consistency goes a long way.</p></div>
        <button className="primary-button desktop-add" onClick={()=>setShowAdd(true)}><Plus size={17}/> Log food</button>
      </section>

      <section className="week-nav card">
        <button className="icon-button" onClick={()=>setWeekOffset(v=>v-1)} aria-label="Previous week"><ArrowLeft size={18}/></button>
        <div className="week-label"><strong>{fmt(weekStart,{month:'long',day:'numeric'})} – {fmt(weekEnd,{month:'long',day:'numeric',year:'numeric'})}</strong><span>{describeWeekOffset(weekOffset)}</span></div>
        <button className="icon-button" onClick={()=>setWeekOffset(v=>Math.min(0,v+1))} disabled={weekOffset===0} aria-label="Next week"><ArrowRight size={18}/></button>
      </section>

      <section className="summary-grid">
        <div className="card calorie-card">
          <div className="card-heading"><span className="icon-tile peach"><Flame size={18}/></span><span>Weekly calories</span><span className="unit-label">KCAL</span></div>
          <div className="big-number">{money(totals.calories)}<span> / {money(prefs.weeklyCalories)}</span></div>
          <div className="progress-track"><div className="progress-fill calorie-fill" style={{width:`${pct(totals.calories,prefs.weeklyCalories)}%`}}/></div>
          <div className="under-progress"><span>{pct(totals.calories,prefs.weeklyCalories).toFixed(0)}% used</span><strong>{money(remaining)} remaining</strong></div>
        </div>
        <div className="card macro-card">
          <div className="card-heading"><span className="icon-tile mint"><Activity size={18}/></span><span>Weekly macros</span></div>
          {([
            ['Protein',totals.protein,prefs.weeklyProtein,'protein'],
            ['Carbs',totals.carbs,prefs.weeklyCarbs,'carbs'],
            ['Fat',totals.fat,prefs.weeklyFat,'fat']
          ] as const).map(([name,value,target,key])=><div className="macro-row" key={key}>
            <div className="macro-meta"><span>{name}</span><strong>{Math.round(value)} <small>/ {target} g</small></strong></div>
            <div className="progress-track thin"><div className={`progress-fill ${key}-fill`} style={{width:`${pct(value,target)}%`}}/></div>
          </div>)}
        </div>
      </section>

      <section className="card week-card">
        <div className="section-heading"><div><h2>This week</h2><p className="muted">Select a day to see your food diary.</p></div><span className="pill"><CalendarDays size={13}/> {dayNames[prefs.weekStartsOn]} start</span></div>
        <div className="day-strip">
          {weekDates.map(d=>{
            const iso=toISO(d), dayLogs=weekLogs.filter(l=>l.date===iso)
            const cals=dayLogs.reduce((a,l)=>a+l.food.calories*l.servings,0)
            return <button key={iso} className={`day-button ${activeDate===iso?'selected':''} ${iso===todayISO()?'today':''}`} onClick={()=>setActiveDate(iso)}>
              <span>{dayNames[d.getDay()].slice(0,3)}</span><strong>{d.getDate()}</strong><i className={cals>0?'has-logs':''}/><small>{cals?money(cals):'—'}</small>
            </button>
          })}
        </div>
      </section>

      <section className="card diary-card">
        <div className="section-heading diary-heading"><div><p className="eyebrow">{fmt(fromISO(activeDate),{weekday:'long',month:'long',day:'numeric'})}</p><h2>Food diary</h2></div><button className="primary-button small desktop-add" onClick={()=>setShowAdd(true)}><Plus size={16}/> Add food</button></div>
        {MEALS.map(meal=>{
          const items=activeLogs.filter(l=>l.meal===meal)
          const mealCals=items.reduce((a,l)=>a+l.food.calories*l.servings,0)
          return <div className="meal-section" key={meal}>
            <div className="meal-heading"><div><h3>{meal}</h3><span>{items.length} {items.length===1?'item':'items'}</span></div><strong>{money(mealCals)} <small>kcal</small></strong></div>
            {items.length===0?<p className="empty-meal">Nothing logged yet.</p>:items.map(item=><div className="food-entry" key={item.id}>
              <div className="food-symbol"><Utensils size={16}/></div><div className="food-details"><strong>{item.food.name}</strong><span>{item.servings} × {item.food.servingLabel} · P {Math.round(item.food.protein*item.servings)}g · C {Math.round(item.food.carbs*item.servings)}g · F {Math.round(item.food.fat*item.servings)}g</span></div>
              <strong className="entry-calories">{money(item.food.calories*item.servings)}</strong>
              <button className="quiet-icon" onClick={()=>deleteLog(item.id)} aria-label={`Delete ${item.food.name}`}><Trash2 size={15}/></button>
            </div>)}
            <button className="add-meal" onClick={()=>{setSelectedMeal(meal);setShowAdd(true)}}><Plus size={15}/> Add to {meal.toLowerCase()}</button>
          </div>
        })}
      </section>
      <section className="privacy-note"><span><Check size={15}/></span><p>Your food diary is saved on this device, not in an online account. Export a backup in Settings to keep a copy.</p></section>
    </main>

    <nav className="mobile-nav"><button className="nav-active"><Activity size={19}/><span>Overview</span></button><button onClick={()=>setShowAdd(true)}><Plus size={20}/><span>Log food</span></button><button onClick={()=>setShowSettings(true)}><Settings2 size={19}/><span>Settings</span></button></nav>

    {(showAdd||selectedFood)&&<div className="modal-backdrop" onClick={()=>{setShowAdd(false);setSelectedFood(null)}}><div className="modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-top"><div><p className="eyebrow">FOOD DIARY</p><h2>{selectedFood?'Review food':'Add food'}</h2></div><button className="icon-button" onClick={()=>{setShowAdd(false);setSelectedFood(null)}}><X size={19}/></button></div>
      {selectedFood?<div className="selected-food">
        <h3>{selectedFood.name}</h3>{selectedFood.brand&&<p className="muted">{selectedFood.brand}</p>}
        <div className="nutrition-preview"><div><strong>{Math.round(selectedFood.calories)}</strong><span>kcal</span></div><div><strong>{selectedFood.protein}g</strong><span>protein</span></div><div><strong>{selectedFood.carbs}g</strong><span>carbs</span></div><div><strong>{selectedFood.fat}g</strong><span>fat</span></div></div>
        <label>Meal<select value={selectedMeal} onChange={e=>setSelectedMeal(e.target.value as MealType)}>{MEALS.map(m=><option key={m}>{m}</option>)}</select></label>
        <label>Number of servings<input type="number" min="0.1" step="0.1" value={servings} onChange={e=>setServings(Math.max(.1,Number(e.target.value)))}/></label>
        <button className="primary-button full" onClick={()=>addFood(selectedFood,selectedMeal,activeDate,servings)}><Check size={17}/> Add to diary</button>
      </div>:<div className="add-options">
        <button className="option-card" onClick={startScanner}><span className="option-icon"><Camera size={21}/></span><span><strong>Scan barcode</strong><small>Use your phone camera</small></span><ArrowRight size={17}/></button>
        {showScanner&&<div className="scanner-box"><video ref={videoRef} muted playsInline/><button className="secondary-button full" onClick={stopScanner}>Stop camera</button></div>}
        <div className="barcode-search"><label htmlFor="barcode">Or enter a barcode</label><div className="input-with-button"><input id="barcode" inputMode="numeric" placeholder="UPC / EAN number" value={lookupCode} onChange={e=>setLookupCode(e.target.value)} onKeyDown={e=>e.key==='Enter'&&searchBarcode()}/><button className="secondary-button" disabled={lookupBusy} onClick={()=>searchBarcode()}><Search size={16}/>{lookupBusy?'Looking…':'Look up'}</button></div></div>
        <button className="option-card" onClick={()=>setShowManual(true)}><span className="option-icon"><Plus size={21}/></span><span><strong>Enter food manually</strong><small>Add calories and macros yourself</small></span><ArrowRight size={17}/></button>
        {foods.length>0&&<div className="saved-foods"><label>Previously used foods</label><input placeholder="Search saved foods…" value={searchText} onChange={e=>setSearchText(e.target.value)}/>{savedFoods.slice(0,5).map(f=><button key={f.id} className="saved-food" onClick={()=>setSelectedFood(f)}><span>{f.name}</span><strong>{Math.round(f.calories)} kcal</strong></button>)}</div>}
        {error&&<p className="error-text">{error}</p>}
      </div>}
    </div></div>}

    {showManual&&<div className="modal-backdrop" onClick={()=>setShowManual(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-top"><div><p className="eyebrow">CUSTOM FOOD</p><h2>Enter nutrition</h2></div><button className="icon-button" onClick={()=>setShowManual(false)}><X size={19}/></button></div>
      <div className="form-grid">
        <label className="span-two">Food name<input value={manual.name} onChange={e=>setManual({...manual,name:e.target.value})} placeholder="e.g. Greek yogurt"/></label>
        <label className="span-two">Serving description<input value={manual.servingLabel} onChange={e=>setManual({...manual,servingLabel:e.target.value})}/></label>
        <label>Calories<input type="number" min="0" value={manual.calories} onChange={e=>setManual({...manual,calories:e.target.value})} placeholder="0"/></label>
        <label>Protein (g)<input type="number" min="0" value={manual.protein} onChange={e=>setManual({...manual,protein:e.target.value})} placeholder="0"/></label>
        <label>Carbs (g)<input type="number" min="0" value={manual.carbs} onChange={e=>setManual({...manual,carbs:e.target.value})} placeholder="0"/></label>
        <label>Fat (g)<input type="number" min="0" value={manual.fat} onChange={e=>setManual({...manual,fat:e.target.value})} placeholder="0"/></label>
      </div>
      <label className="field-label">Meal<select value={selectedMeal} onChange={e=>setSelectedMeal(e.target.value as MealType)}>{MEALS.map(m=><option key={m}>{m}</option>)}</select></label>
      <button className="primary-button full" disabled={!manual.name.trim()||manual.calories===''} onClick={createManualFood}><Check size={17}/> Save and log food</button>
    </div></div>}

    {showSettings&&<div className="modal-backdrop" onClick={()=>setShowSettings(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-top"><div><p className="eyebrow">PREFERENCES & DATA</p><h2>Settings</h2></div><button className="icon-button" onClick={()=>setShowSettings(false)}><X size={19}/></button></div>
      <div className="settings-section"><h3><CalendarDays size={17}/> Weekly setup</h3>
        <label>Week starts on<select value={prefs.weekStartsOn} onChange={e=>setPrefs({...prefs,weekStartsOn:Number(e.target.value)})}>{dayNames.map((d,i)=><option value={i} key={d}>{d}</option>)}</select></label>
        <p className="helper-text">Your week runs from the selected day through the day before it the following week. Existing food logs are kept and grouped into the correct week.</p>
      </div>
      <div className="settings-section"><h3><TargetIcon/> Weekly nutrition targets</h3>
        <div className="form-grid">
          <label className="span-two">Calories (kcal)<input type="number" min="0" value={prefs.weeklyCalories} onChange={e=>setPrefs({...prefs,weeklyCalories:Number(e.target.value)})}/></label>
          <label>Protein (g)<input type="number" min="0" value={prefs.weeklyProtein} onChange={e=>setPrefs({...prefs,weeklyProtein:Number(e.target.value)})}/></label>
          <label>Carbs (g)<input type="number" min="0" value={prefs.weeklyCarbs} onChange={e=>setPrefs({...prefs,weeklyCarbs:Number(e.target.value)})}/></label>
          <label>Fat (g)<input type="number" min="0" value={prefs.weeklyFat} onChange={e=>setPrefs({...prefs,weeklyFat:Number(e.target.value)})}/></label>
        </div>
        <p className="helper-text">Targets are weekly totals, not daily limits. Set them to whatever works for your plan.</p>
      </div>
      <div className="settings-section"><h3><Download size={17}/> Backup & restore</h3><p className="helper-text">Export your food diary, saved foods, and preferences to a JSON file. Keep a copy somewhere safe.</p>
        <div className="backup-actions"><button className="secondary-button" onClick={exportBackup}><Download size={16}/> Export backup</button><button className="secondary-button" onClick={()=>fileRef.current?.click()}><Upload size={16}/> Import backup</button><input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={handleImport}/></div>
      </div>
      <button className="primary-button full" onClick={()=>setShowSettings(false)}>Done</button>
    </div></div>}

    {(notice||error)&&<div className={`toast ${error?'toast-error':''}`}>{error||notice}<button onClick={()=>{setError('');setNotice('')}}><X size={15}/></button></div>}
  </div>
}

function TargetIcon(){return <Scale size={17}/>}

export default App
