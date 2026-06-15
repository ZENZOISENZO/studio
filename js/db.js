// Livre de Quête — Supabase data layer
//
// Public functions (getProjects, addClient, etc.) keep their original
// synchronous signatures so existing pages don't need to change. Data is
// loaded once per page load into an in-memory cache via a single blocking
// request (initDB, called at the bottom of this file), then every getter
// reads from that cache. Writes update the cache immediately and push the
// change to Supabase in the background.

const SUPABASE_URL = 'https://qvvqbsjuqszzfnsgjybp.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2dnFic2p1cXN6emZuc2dqeWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MTE4NzMsImV4cCI6MjA5Njk4Nzg3M30.clA0MrqG1jWXpjCi2uxs--4nEWipnA8-y_3F9c4Flds'
const SUPABASE_REST = SUPABASE_URL + '/rest/v1'

const _cache = {
  clients: [],
  projects: [],
  invoices: [],
  expenses: [],
  quests: [],
  production: {},
  app_state: {},
}

// Set to true only when initDB() successfully loads from Supabase. Used to
// guard seedIfEmpty() so a network hiccup (cache stays empty) never gets
// mistaken for "this is a brand new, empty database" and overwrites real
// data with the demo seed.
let _dbLoaded = false

function _supaHeaders(extra) {
  return Object.assign({
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  }, extra)
}

function _supaFetch(path, opts) {
  return fetch(SUPABASE_REST + '/' + path, Object.assign({}, opts, {
    headers: _supaHeaders(opts && opts.headers),
  })).catch(err => console.error('Supabase request failed:', path, err))
}

function _upsert(table, id, data) {
  _supaFetch(table + '?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ id, data }]),
  })
}

function _remove(table, id) {
  _supaFetch(table + '?id=eq.' + encodeURIComponent(id), { method: 'DELETE' })
}

function _upsertProd(projectId, data) {
  _supaFetch('production?on_conflict=project_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ project_id: projectId, data }]),
  })
}

function _upsertState(key, value) {
  _supaFetch('app_state?on_conflict=key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ key, value }]),
  })
}

// Single blocking call made once at script-load time so that by the time
// the page's own script runs, getProjects()/getClients()/etc. already have
// data. Uses a synchronous XHR (deprecated, but the simplest way to keep
// every existing page's code fully synchronous without a rewrite).
function initDB() {
  try {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', SUPABASE_REST + '/rpc/get_all_data', false)
    const headers = _supaHeaders()
    Object.keys(headers).forEach(k => xhr.setRequestHeader(k, headers[k]))
    xhr.send('{}')
    if (xhr.status >= 200 && xhr.status < 300) {
      const data = JSON.parse(xhr.responseText)
      _cache.clients    = (data.clients    || []).map(r => ({ ...r.data, id: r.id }))
      _cache.projects   = (data.projects   || []).map(r => ({ ...r.data, id: r.id }))
      _cache.invoices   = (data.invoices   || []).map(r => ({ ...r.data, id: r.id }))
      _cache.expenses   = (data.expenses   || []).map(r => ({ ...r.data, id: r.id }))
      _cache.quests     = (data.quests     || []).map(r => ({ ...r.data, id: r.id }))
      _cache.production = data.production || {}
      _cache.app_state  = data.app_state   || {}
      _dbLoaded = true
    } else {
      console.error('Supabase initDB error', xhr.status, xhr.responseText)
    }
  } catch (e) {
    console.error('Supabase initDB failed', e)
  }
}

// ─── Currency ──────────────────────────────────────────────
const CURRENCIES = {
  JPY: { symbol: '¥', locale: 'ja-JP', decimals: 0, label: '¥ JPY' },
  EUR: { symbol: '€', locale: 'fr-FR', decimals: 0, label: '€ EUR' },
  USD: { symbol: '$', locale: 'en-US', decimals: 0, label: '$ USD' },
  GBP: { symbol: '£', locale: 'en-GB', decimals: 0, label: '£ GBP' },
  KRW: { symbol: '₩', locale: 'ko-KR', decimals: 0, label: '₩ KRW' },
  CNY: { symbol: '¥', locale: 'zh-CN', decimals: 0, label: '¥ CNY' },
}

function getCurrency() {
  return localStorage.getItem('ldq_currency') || 'JPY'
}

function setCurrency(code) {
  if (CURRENCIES[code]) localStorage.setItem('ldq_currency', code)
}

function getTheme() {
  return localStorage.getItem('ldq_theme') || 'dark'
}

function setTheme(theme) {
  if (theme !== 'dark' && theme !== 'light') return
  localStorage.setItem('ldq_theme', theme)
  document.documentElement.setAttribute('data-theme', theme)
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

// ─── Projects ─────────────────────────────────────────────
function getProjects() { return _cache.projects }

function addProject(p) {
  const item = { ...p, id: uid(), createdAt: Date.now() }
  _cache.projects.unshift(item)
  _upsert('projects', item.id, item)
  return item
}

function updateProject(id, changes) {
  _cache.projects = _cache.projects.map(p => p.id === id ? { ...p, ...changes } : p)
  const item = getProjectById(id)
  if (item) _upsert('projects', id, item)
}

function deleteProject(id) {
  _cache.projects = _cache.projects.filter(p => p.id !== id)
  _remove('projects', id)
}

function getProjectById(id) {
  return _cache.projects.find(p => p.id === id) || null
}

// ─── Clients ──────────────────────────────────────────────
function getClients() { return _cache.clients }

function addClient(c) {
  const item = { ...c, id: uid(), createdAt: Date.now() }
  _cache.clients.unshift(item)
  _upsert('clients', item.id, item)
  return item
}

function updateClient(id, changes) {
  _cache.clients = _cache.clients.map(c => c.id === id ? { ...c, ...changes } : c)
  const item = getClientById(id)
  if (item) _upsert('clients', id, item)
}

function deleteClient(id) {
  _cache.clients = _cache.clients.filter(c => c.id !== id)
  _remove('clients', id)
}

function getClientById(id) {
  return _cache.clients.find(c => c.id === id) || null
}

function getClientName(id) {
  const c = getClientById(id)
  return c ? c.name : '—'
}

// ─── Invoices ─────────────────────────────────────────────
function getInvoices() { return _cache.invoices }

function addInvoice(inv) {
  const item = { ...inv, id: uid(), createdAt: Date.now() }
  _cache.invoices.unshift(item)
  _upsert('invoices', item.id, item)
  return item
}

function updateInvoice(id, changes) {
  _cache.invoices = _cache.invoices.map(i => i.id === id ? { ...i, ...changes } : i)
  const item = getInvoiceById(id)
  if (item) _upsert('invoices', id, item)
}

function deleteInvoice(id) {
  _cache.invoices = _cache.invoices.filter(i => i.id !== id)
  _remove('invoices', id)
}

function getInvoiceById(id) {
  return _cache.invoices.find(i => i.id === id) || null
}

// ─── Next invoice number ───────────────────────────────────
function nextInvoiceNumber() {
  const year = new Date().getFullYear()
  const prefix = `INV-${year}-`
  const nums = getInvoices()
    .filter(i => i.number && i.number.startsWith(prefix))
    .map(i => parseInt(i.number.replace(prefix, '')) || 0)
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1
  return `${prefix}${String(next).padStart(3, '0')}`
}

// ─── Monthly Goal (Objectif) ──────────────────────────────
function getMonthlyGoal() {
  return parseInt(localStorage.getItem('ldq_monthly_goal') || '700000')
}

function setMonthlyGoal(n) {
  const val = parseInt(n)
  if (val > 0) localStorage.setItem('ldq_monthly_goal', String(val))
}

function getCurrentMonthRevenue() {
  const now = new Date()
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return getInvoices()
    .filter(i => i.status === 'paid' && i.date && i.date.startsWith(key))
    .reduce((s, i) => s + (Number(i.amount) || 0), 0)
}

// ─── Stats ────────────────────────────────────────────────
function getStats() {
  const projects = getProjects()
  const invoices = getInvoices()
  const active = ['brief', 'preprod', 'shooting', 'post']
  return {
    totalProjects:   projects.length,
    activeProjects:  projects.filter(p => active.includes(p.status)).length,
    totalBilled:     invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (Number(i.amount) || 0), 0),
    pendingAmount:   invoices.filter(i => i.status === 'sent').reduce((s, i) => s + (Number(i.amount) || 0), 0),
    pendingCount:    invoices.filter(i => i.status === 'sent').length,
  }
}

// ─── Revenue by category ──────────────────────────────────
// Photo & Video are grouped; all other types are individual.
const REVENUE_GROUPS = [
  { id: 'film',    label: 'Photo & Video',    types: ['photo', 'video', 'hybrid'], color: '#1B1BD1' },
  { id: 'model',   label: 'Model',            types: ['model'],                    color: '#9A6B1E' },
  { id: 'producer',label: 'Producer',         types: ['producer'],                 color: '#3F5B79' },
  { id: 'casting', label: 'Casting Director', types: ['casting'],                  color: '#3A6E48' },
]

function getRevenueByCategory() {
  const projects   = getProjects()
  const paid       = getInvoices().filter(i => i.status === 'paid')
  const pending    = getInvoices().filter(i => i.status === 'sent')
  const totalEarned = paid.reduce((s, i) => s + (Number(i.amount) || 0), 0)

  return REVENUE_GROUPS.map(g => {
    const groupProjects  = projects.filter(p => g.types.includes(p.type))
    const groupIds       = new Set(groupProjects.map(p => p.id))
    const groupPaid      = paid.filter(i => groupIds.has(i.projectId))
    const groupPending   = pending.filter(i => groupIds.has(i.projectId))
    const earned         = groupPaid.reduce((s, i) => s + (Number(i.amount) || 0), 0)
    const pendingAmount  = groupPending.reduce((s, i) => s + (Number(i.amount) || 0), 0)
    const share          = totalEarned > 0 ? Math.round((earned / totalEarned) * 100) : 0

    // Sub-breakdown only for the grouped category (film)
    const sub = g.types.length > 1
      ? g.types.map(type => {
          const tp    = projects.filter(p => p.type === type)
          const tIds  = new Set(tp.map(p => p.id))
          const tPaid = paid.filter(i => tIds.has(i.projectId))
          const tAmt  = tPaid.reduce((s, i) => s + (Number(i.amount) || 0), 0)
          return { type, earned: tAmt, count: tp.length }
        }).filter(s => s.count > 0 || s.earned > 0)
      : null

    return { ...g, projectCount: groupProjects.length, invoiceCount: groupPaid.length,
             earned, pendingAmount, share, sub }
  })
}

function getRevenueStats() {
  const paid = getInvoices().filter(i => i.status === 'paid')
  const totalEarned = paid.reduce((s, i) => s + (Number(i.amount) || 0), 0)

  // Current month
  const now = new Date()
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const thisMonth = paid
    .filter(i => i.date && i.date.startsWith(monthKey))
    .reduce((s, i) => s + (Number(i.amount) || 0), 0)

  // Average per paid project
  const paidProjectIds = new Set(paid.map(i => i.projectId).filter(Boolean))
  const avgPerProject = paidProjectIds.size > 0 ? Math.round(totalEarned / paidProjectIds.size) : 0

  // Peak month (last 12 months)
  let peakAmount = 0, peakLabel = '—'
  for (let i = 11; i >= 0; i--) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const amt = paid.filter(inv => inv.date && inv.date.startsWith(key))
                    .reduce((s, inv) => s + (Number(inv.amount) || 0), 0)
    if (amt > peakAmount) { peakAmount = amt; peakLabel = d.toLocaleString('default', { month: 'short', year: '2-digit' }).toUpperCase() }
  }

  return { totalEarned, thisMonth, avgPerProject, peakAmount, peakLabel }
}

// ─── Monthly revenue (last 12 months) ─────────────────────
function getMonthlyRevenue12() {
  const paid = getInvoices().filter(i => i.status === 'paid')
  const now  = new Date()
  return Array.from({ length: 12 }, (_, i) => {
    const d     = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1)
    const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleString('default', { month: 'short' }).toUpperCase()
    const amount = paid.filter(inv => inv.date && inv.date.startsWith(key))
                       .reduce((s, inv) => s + (Number(inv.amount) || 0), 0)
    return { key, label, amount }
  })
}

// ─── Monthly revenue (last 6 months) ──────────────────────
function getMonthlyRevenue() {
  const paid = getInvoices().filter(i => i.status === 'paid')
  const now = new Date()
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleString('default', { month: 'short' }).toUpperCase()
    const amount = paid
      .filter(inv => inv.date && inv.date.startsWith(key))
      .reduce((s, inv) => s + (Number(inv.amount) || 0), 0)
    return { key, label, amount }
  })
}

// ─── Expenses ─────────────────────────────────────────────
const EXPENSE_CATEGORIES = [
  { id: 'equipment',     label: 'Equipment & Rentals', color: '#3F5B79' },
  { id: 'film',          label: 'Film & Lab',           color: '#9A6B1E' },
  { id: 'travel',        label: 'Travel',               color: '#1B1BD1' },
  { id: 'accommodation', label: 'Accommodation',        color: '#3A6E48' },
  { id: 'software',      label: 'Software & Tools',     color: '#6B3F79' },
  { id: 'marketing',     label: 'Marketing',            color: '#8A2B2B' },
  { id: 'office',        label: 'Office & Admin',       color: '#555555' },
  { id: 'food',          label: 'Food & Catering',      color: '#7A6B1E' },
  { id: 'misc',          label: 'Miscellaneous',        color: '#3A3A3A' },
]

function getExpenses() { return _cache.expenses }

function addExpense(e) {
  const item = { ...e, id: uid(), createdAt: Date.now() }
  _cache.expenses.unshift(item)
  _upsert('expenses', item.id, item)
  return item
}

function updateExpense(id, changes) {
  _cache.expenses = _cache.expenses.map(e => e.id === id ? { ...e, ...changes } : e)
  const item = getExpenseById(id)
  if (item) _upsert('expenses', id, item)
}

function deleteExpense(id) {
  _cache.expenses = _cache.expenses.filter(e => e.id !== id)
  _remove('expenses', id)
}

function getExpenseById(id) {
  return _cache.expenses.find(e => e.id === id) || null
}

function getCurrentMonthExpenses() {
  const now = new Date()
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return getExpenses()
    .filter(e => e.date && e.date.startsWith(key))
    .reduce((s, e) => s + (Number(e.amount) || 0), 0)
}

function getMonthlyExpenses12() {
  const expenses = getExpenses()
  const now = new Date()
  return Array.from({ length: 12 }, (_, i) => {
    const d     = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1)
    const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleString('default', { month: 'short' }).toUpperCase()
    const amount = expenses
      .filter(e => e.date && e.date.startsWith(key))
      .reduce((s, e) => s + (Number(e.amount) || 0), 0)
    return { key, label, amount }
  })
}

function getExpenseStats() {
  const expenses  = getExpenses()
  const total     = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const now       = new Date()
  const key       = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const thisMonth = expenses
    .filter(e => e.date && e.date.startsWith(key))
    .reduce((s, e) => s + (Number(e.amount) || 0), 0)

  const byCat = {}
  expenses.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + (Number(e.amount) || 0) })
  const topId  = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0]?.[0] || null
  const topCat = topId ? (EXPENSE_CATEGORIES.find(c => c.id === topId)?.label || topId) : '—'
  const topAmt = topId ? (byCat[topId] || 0) : 0

  const months12   = getMonthlyExpenses12()
  const avgPerMonth = Math.round(total / 12)

  return { total, thisMonth, topCat, topAmt, avgPerMonth }
}

function getExpensesByCategory() {
  const expenses = getExpenses()
  const total    = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  return EXPENSE_CATEGORIES.map(cat => {
    const items  = expenses.filter(e => e.category === cat.id)
    const amount = items.reduce((s, e) => s + (Number(e.amount) || 0), 0)
    const share  = total > 0 ? Math.round((amount / total) * 100) : 0
    return { ...cat, amount, share, count: items.length }
  }).filter(c => c.count > 0)
}

// Tax reserve (Japanese freelancer: ~30% of revenue for taxes)
function getTaxPct() { return parseFloat(localStorage.getItem('ldq_tax_pct') || '30') }
function setTaxPct(pct) {
  const v = parseFloat(pct)
  if (v >= 0 && v <= 100) localStorage.setItem('ldq_tax_pct', String(v))
}

// Overdue detection
function isOverdue(invoice) {
  if (!invoice.dueDate) return false
  if (['paid', 'cancelled', 'draft'].includes(invoice.status)) return false
  return new Date(invoice.dueDate + 'T23:59:59') < new Date()
}

function getOverdueInvoices() { return getInvoices().filter(isOverdue) }

function daysOverdue(invoice) {
  if (!isOverdue(invoice)) return 0
  const diff = new Date() - new Date(invoice.dueDate + 'T23:59:59')
  return Math.floor(diff / 86400e3)
}

// Upcoming events (next N days)
function getUpcomingEvents(days) {
  days = days || 30
  const now    = new Date(); now.setHours(0, 0, 0, 0)
  const cutoff = new Date(now.getTime() + days * 86400e3)
  const events = []

  getProjects()
    .filter(p => p.date && !['delivered', 'archived'].includes(p.status))
    .forEach(p => {
      const d = new Date(p.date)
      if (d >= now && d <= cutoff)
        events.push({ date: p.date, type: 'shoot', title: p.title,
                      sub: getClientName(p.clientId), href: 'production.html?id=' + p.id })
    })

  getInvoices()
    .filter(i => i.status === 'sent' && i.dueDate)
    .forEach(i => {
      const d = new Date(i.dueDate)
      if (d >= now && d <= cutoff)
        events.push({ date: i.dueDate, type: 'invoice-due', title: i.number || 'Invoice',
                      sub: getClientName(i.clientId), href: 'invoices.html', amount: i.amount })
    })

  return events.sort((a, b) => a.date.localeCompare(b.date))
}

// P&L helpers
function getMonthlyNetProfit() {
  return getCurrentMonthRevenue() - getCurrentMonthExpenses()
}

function getAnnualStats() {
  const yr       = String(new Date().getFullYear())
  const paid     = getInvoices().filter(i => i.status === 'paid' && (i.date || '').startsWith(yr))
  const expenses = getExpenses().filter(e => (e.date || '').startsWith(yr))
  const revenue  = paid.reduce((s, i) => s + (Number(i.amount) || 0), 0)
  const spent    = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  return { revenue, expenses: spent, net: revenue - spent,
           margin: revenue > 0 ? Math.round(((revenue - spent) / revenue) * 100) : 0 }
}

// Calendar events for a given month
function getCalendarMonthEvents(year, month) {
  const key   = `${year}-${String(month + 1).padStart(2, '0')}`
  const evts  = {}
  const push  = (day, obj) => { if (!evts[day]) evts[day] = []; evts[day].push(obj) }

  getProjects().forEach(p => {
    if (p.date && p.date.startsWith(key))
      push(+p.date.split('-')[2], { type: 'shoot', title: p.title, href: 'production.html?id=' + p.id })
  })

  getInvoices().filter(i => i.status !== 'cancelled').forEach(i => {
    if (i.dueDate && i.dueDate.startsWith(key))
      push(+i.dueDate.split('-')[2], {
        type: isOverdue(i) ? 'overdue' : 'due',
        title: i.number || 'Invoice',
        href: 'invoices.html', amount: i.amount
      })
  })

  getProjects().forEach(p => {
    getTasks(p.id).forEach(t => {
      if (t.dueDate && t.dueDate.startsWith(key) && t.status !== 'done')
        push(+t.dueDate.split('-')[2], { type: 'task', title: t.title, href: 'production.html?id=' + p.id })
    })
  })

  return evts
}

// ─── Production (tasks + estimate per project) ───────────
function _getProd(projectId) {
  return _cache.production[projectId] || { tasks: [], estimate: null }
}

function _saveProd(projectId, data) {
  _cache.production[projectId] = data
  _upsertProd(projectId, data)
}

const TASK_CATEGORIES = [
  { id: 'admin',     label: 'Admin & Contracts',  color: 'var(--text-mid)' },
  { id: 'preprod',   label: 'Pre-Production',      color: 'var(--accent)' },
  { id: 'equipment', label: 'Equipment',            color: 'var(--warning)' },
  { id: 'location',  label: 'Location',             color: 'var(--success)' },
  { id: 'cast',      label: 'Cast & Crew',          color: '#3F5B79' },
  { id: 'post',      label: 'Post-Production',      color: '#9A6B1E' },
]

function getTasks(projectId) { return _getProd(projectId).tasks }

function addTask(projectId, t) {
  const p = _getProd(projectId)
  const item = { ...t, id: uid(), createdAt: Date.now() }
  p.tasks.push(item)
  _saveProd(projectId, p)
  return item
}

function updateTask(projectId, taskId, changes) {
  const p = _getProd(projectId)
  p.tasks = p.tasks.map(t => t.id === taskId ? { ...t, ...changes } : t)
  _saveProd(projectId, p)
}

function deleteTask(projectId, taskId) {
  const p = _getProd(projectId)
  p.tasks = p.tasks.filter(t => t.id !== taskId)
  _saveProd(projectId, p)
}

const ESTIMATE_SECTION_DEFAULTS = [
  'Creative & Pre-Production',
  'Cast & Crew',
  'Equipment Rental',
  'Location & Studio',
  'Transportation & Logistics',
  'Post-Production',
  'Miscellaneous',
]

function getEstimate(projectId) {
  return _getProd(projectId).estimate || _makeDefaultEstimate()
}

function saveEstimate(projectId, estimate) {
  const p = _getProd(projectId)
  p.estimate = estimate
  _saveProd(projectId, p)
}

function _makeDefaultEstimate() {
  return {
    sections: ESTIMATE_SECTION_DEFAULTS.map(title => ({ id: uid(), title, items: [] })),
    markup: 15,
    notes: '',
  }
}

// ─── Quests ───────────────────────────────────────────────
const QUEST_DIFFICULTIES = [
  { id: 'easy',   label: 'Easy',   xp: 10, color: 'var(--success)' },
  { id: 'medium', label: 'Medium', xp: 25, color: 'var(--warning)' },
  { id: 'hard',   label: 'Hard',   xp: 50, color: 'var(--danger)' },
]

const QUEST_TIMEFRAMES = [
  { id: 'day',   label: 'Day' },
  { id: 'week',  label: 'Week' },
  { id: 'month', label: 'Month' },
]

const QUEST_CATEGORIES = [
  { id: 'work',     label: 'Work',     color: 'var(--accent)' },
  { id: 'personal', label: 'Personal', color: '#3F5B79' },
  { id: 'health',   label: 'Health',   color: 'var(--success)' },
  { id: 'admin',    label: 'Admin',    color: 'var(--text-mid)' },
  { id: 'creative', label: 'Creative', color: '#9A6B1E' },
  { id: 'home',     label: 'Home',     color: '#6B3F79' },
]

// Period key (used to know whether a recurring quest's completion is still current)
function _periodKey(dateStr, timeframe) {
  const d = new Date(dateStr + 'T12:00:00')
  if (timeframe === 'month') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  if (timeframe === 'week') {
    const date = new Date(d)
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7))
    const week1 = new Date(date.getFullYear(), 0, 4)
    const weekNo = 1 + Math.round(((date - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
    return `${date.getFullYear()}-W${String(weekNo).padStart(2, '0')}`
  }
  return d.toISOString().slice(0, 10) // day
}

function _currentPeriodKey(timeframe) {
  return _periodKey(new Date().toISOString().slice(0, 10), timeframe)
}

function getQuests() {
  const quests = _cache.quests
  // Recurring quests reset automatically once their period (day/week/month) has passed
  quests.forEach(q => {
    if (q.repeat && q.done && q.lastCompleted &&
        _periodKey(q.lastCompleted, q.timeframe) !== _currentPeriodKey(q.timeframe)) {
      q.done = false
      _upsert('quests', q.id, q)
    }
  })
  return quests
}

function addQuest(q) {
  const item = { ...q, id: uid(), done: false, lastCompleted: null, createdAt: Date.now() }
  _cache.quests.unshift(item)
  _upsert('quests', item.id, item)
  return item
}

function updateQuest(id, changes) {
  _cache.quests = _cache.quests.map(q => q.id === id ? { ...q, ...changes } : q)
  const item = getQuestById(id)
  if (item) _upsert('quests', id, item)
}

function deleteQuest(id) {
  _cache.quests = _cache.quests.filter(q => q.id !== id)
  _remove('quests', id)
}

function getQuestById(id) {
  return _cache.quests.find(q => q.id === id) || null
}

function toggleQuestDone(id) {
  const q = getQuestById(id)
  if (!q) return
  const xp = (QUEST_DIFFICULTIES.find(d => d.id === q.difficulty) || {}).xp || 0
  if (!q.done) {
    q.done = true
    q.lastCompleted = new Date().toISOString().slice(0, 10)
    addQuestXp(xp)
  } else {
    q.done = false
    addQuestXp(-xp)
  }
  _upsert('quests', id, q)
}

function getQuestXp() {
  return Number(_cache.app_state.quest_xp) || 0
}

function addQuestXp(delta) {
  const xp = Math.max(0, getQuestXp() + delta)
  _cache.app_state.quest_xp = xp
  _upsertState('quest_xp', xp)
}

// ─── Ranks ────────────────────────────────────────────────
const RANKS = [
  { id: 'rookie',     label: 'Rookie',     minLevel: 1,  color: 'var(--text-mid)' },
  { id: 'adventurer', label: 'Adventurer', minLevel: 5,  color: 'var(--accent)' },
  { id: 'veteran',    label: 'Veteran',    minLevel: 10, color: 'var(--warning)' },
  { id: 'master',     label: 'Master',     minLevel: 20, color: 'var(--success)' },
  { id: 'legend',     label: 'Legend',     minLevel: 35, color: 'var(--danger)' },
]

function getRank(level) {
  let current = RANKS[0]
  let next = null
  for (let i = 0; i < RANKS.length; i++) {
    if (level >= RANKS[i].minLevel) {
      current = RANKS[i]
      next = RANKS[i + 1] || null
    }
  }
  return { ...current, next }
}

function getQuestLevel() {
  const xp = getQuestXp()
  const level = Math.floor(xp / 100) + 1
  return { level, xp, xpIntoLevel: xp % 100, xpForNext: 100, rank: getRank(level) }
}

function getQuestStats() {
  const quests = getQuests()
  const byTf = tf => {
    const items = quests.filter(q => q.timeframe === tf)
    return { total: items.length, done: items.filter(q => q.done).length }
  }
  return {
    total: quests.length,
    done:  quests.filter(q => q.done).length,
    day:   byTf('day'),
    week:  byTf('week'),
    month: byTf('month'),
  }
}

// ─── Formatting helpers ────────────────────────────────────
function fmtMoney(n) {
  if (n === undefined || n === null || n === '') return '—'
  const c = CURRENCIES[getCurrency()] || CURRENCIES.JPY
  return c.symbol + Number(n).toLocaleString(c.locale, { minimumFractionDigits: 0, maximumFractionDigits: c.decimals })
}

function fmtDate(str) {
  if (!str) return '—'
  const d = new Date(str)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function escHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function showToast(msg, duration = 2200) {
  let el = document.getElementById('toast')
  if (!el) {
    el = document.createElement('div')
    el.id = 'toast'
    el.className = 'toast'
    document.body.appendChild(el)
  }
  el.textContent = msg
  el.classList.add('show')
  clearTimeout(el._t)
  el._t = setTimeout(() => el.classList.remove('show'), duration)
}

// ─── Seed demo data ────────────────────────────────────────
// Only runs the very first time the database is genuinely empty — never
// wipes existing data, so a missing flag can no longer cause data loss.
function seedIfEmpty() {
  // If initDB() couldn't reach Supabase, _cache is empty but that doesn't
  // mean the database is empty — don't seed (and don't overwrite real data).
  if (!_dbLoaded) return

  if (_cache.clients.length || _cache.projects.length || _cache.invoices.length ||
      _cache.expenses.length || _cache.quests.length) return

  const clients = [
    { id: 'c1', name: 'Yuki Tanaka',   company: 'Palladium Japan',  email: 'yuki@palladium.jp',    phone: '+81 90-1234-5678', location: 'Tokyo',   address: '〒107-0062 1-2-3 Minami-Aoyama, Minato-ku, Tokyo', notes: 'Campaign director, SS25.', createdAt: Date.now() - 9e7 },
    { id: 'c2', name: 'Lena Müller',   company: 'HAST Paris',       email: 'lena@hast.fr',         phone: '+33 6 12 34 56 78', location: 'Paris',  address: '12 Rue Saint-Honoré, 75001 Paris, France', notes: 'Creative lead for SS25 collection.', createdAt: Date.now() - 7e7 },
    { id: 'c3', name: 'Hiroshi Sato',  company: 'ASICS EMEA',       email: 'h.sato@asics.com',     phone: '+81 3-5678-9012',  location: 'Osaka',   address: '1-1 Minatomachi, Naniwa-ku, Osaka', notes: 'Global campaigns team.', createdAt: Date.now() - 5e7 },
    { id: 'c4', name: 'Sara Chen',     company: 'PeachyDen',        email: 'sara@peachyden.com',   phone: '+44 7700 123456',  location: 'London',  address: '45 Shoreditch High St, London E1 6PN, UK', notes: 'SS25 editorial.', createdAt: Date.now() - 3e7 },
    { id: 'c5', name: 'Kenji Ishida',  company: 'Maven Outdoors',   email: 'kenji@maven.co.jp',    phone: '+81 3-9012-3456',  location: 'Tokyo',   address: '2-4-1 Jingumae, Shibuya-ku, Tokyo', notes: 'Outdoor / lifestyle projects.', createdAt: Date.now() - 1.2e8 },
  ]
  _cache.clients = clients
  clients.forEach(c => _upsert('clients', c.id, c))

  const yr = new Date().getFullYear()
  const projects = [
    { id: 'p1', title: 'Palladium SS25 Campaign',     clientId: 'c1', type: 'video', format: '16mm',   status: 'delivered', date: `${yr}-02-10`, amount: 680000,  description: 'Full campaign shoot for SS25 collection.', createdAt: Date.now() - 8e7 },
    { id: 'p2', title: 'HAST High Fashion Editorial', clientId: 'c2', type: 'photo', format: '35mm',   status: 'post',      date: `${yr}-03-22`, amount: 450000,  description: 'Paris editorial, 3-day shoot.', createdAt: Date.now() - 4e7 },
    { id: 'p3', title: 'ASICS Tokyo Campaign',        clientId: 'c3', type: 'video', format: '16mm',   status: 'shooting',  date: `${yr}-04-05`, amount: 950000,  description: 'Urban lifestyle campaign.', createdAt: Date.now() - 2.5e7 },
    { id: 'p4', title: 'PeachyDen Streetwear',        clientId: 'c4', type: 'photo', format: '35mm',   status: 'brief',     date: `${yr}-05-01`, amount: 380000,  description: 'Streetwear lookbook, 2 days.', createdAt: Date.now() - 1e7 },
    { id: 'p5', title: 'Maven Outdoor Series',        clientId: 'c5', type: 'photo', format: 'medium', status: 'delivered', date: `${yr}-01-14`, amount: 320000,  description: 'Outdoor lifestyle series.', createdAt: Date.now() - 1.1e8 },
    { id: 'p6', title: 'JOE Capsule Drop',            clientId: 'c4', type: 'photo', format: '35mm',   status: 'preprod',   date: `${yr}-05-20`, amount: 260000,  description: 'Capsule collection lookbook.', createdAt: Date.now() - 8e6 },
  ]
  _cache.projects = projects
  projects.forEach(p => _upsert('projects', p.id, p))

  const invoices = [
    { id: 'i1', number: `INV-${yr}-001`, clientId: 'c5', projectId: 'p5', type: 'invoice', status: 'paid',  amount: 320000, date: `${yr}-01-20`, dueDate: `${yr}-02-20`, items: [{ description: 'Maven Outdoor Series — Photography', qty: 1, price: 320000 }], createdAt: Date.now() - 1.05e8 },
    { id: 'i2', number: `INV-${yr}-002`, clientId: 'c1', projectId: 'p1', type: 'invoice', status: 'paid',  amount: 680000, date: `${yr}-02-18`, dueDate: `${yr}-03-18`, items: [{ description: 'Palladium SS25 — Video Production', qty: 1, price: 680000 }], createdAt: Date.now() - 7.5e7 },
    { id: 'i3', number: `INV-${yr}-003`, clientId: 'c2', projectId: 'p2', type: 'invoice', status: 'sent',  amount: 450000, date: `${yr}-04-01`, dueDate: `${yr}-05-01`, items: [{ description: 'HAST Editorial — Photography', qty: 3, price: 150000 }], createdAt: Date.now() - 3.5e7 },
    { id: 'i4', number: `QTE-${yr}-001`, clientId: 'c4', projectId: 'p4', type: 'quote',   status: 'sent',  amount: 380000, date: `${yr}-04-15`, dueDate: `${yr}-04-30`, items: [{ description: 'PeachyDen Lookbook — Photography', qty: 1, price: 380000 }], createdAt: Date.now() - 2e7 },
    { id: 'i5', number: `INV-${yr}-004`, clientId: 'c3', projectId: 'p3', type: 'invoice', status: 'draft', amount: 950000, date: `${yr}-05-10`, dueDate: `${yr}-06-10`, items: [{ description: 'ASICS Tokyo — Video Production', qty: 1, price: 950000 }], createdAt: Date.now() - 1.2e7 },
    { id: 'i6', number: `QTE-${yr}-002`, clientId: 'c4', projectId: 'p6', type: 'quote',   status: 'draft', amount: 260000, date: `${yr}-05-18`, dueDate: `${yr}-05-25`, items: [{ description: 'JOE Capsule Drop — Photography', qty: 1, price: 260000 }], createdAt: Date.now() - 6e6 },
  ]
  _cache.invoices = invoices
  invoices.forEach(i => _upsert('invoices', i.id, i))

  const expenses = [
    { id: 'ex1',  date: `${yr}-01-08`, category: 'equipment',     description: 'Medium format kit rental — Maven shoot',     amount: 45000, projectId: 'p5', createdAt: Date.now() - 1.09e8 },
    { id: 'ex2',  date: `${yr}-01-10`, category: 'film',          description: 'Kodak Portra 400 (10 rolls)',                  amount: 18000, projectId: 'p5', createdAt: Date.now() - 1.07e8 },
    { id: 'ex3',  date: `${yr}-01-28`, category: 'film',          description: 'Film processing & scanning — Maven',           amount: 24000, projectId: 'p5', createdAt: Date.now() - 1.01e8 },
    { id: 'ex4',  date: `${yr}-02-03`, category: 'equipment',     description: '16mm Bolex + lenses rental — Palladium',       amount: 85000, projectId: 'p1', createdAt: Date.now() - 7.9e7  },
    { id: 'ex5',  date: `${yr}-02-06`, category: 'film',          description: 'Kodak Vision3 500T (20 rolls)',                 amount: 56000, projectId: 'p1', createdAt: Date.now() - 7.7e7  },
    { id: 'ex6',  date: `${yr}-02-22`, category: 'film',          description: 'Lab processing + telecine — Palladium',        amount: 42000, projectId: 'p1', createdAt: Date.now() - 6.9e7  },
    { id: 'ex7',  date: `${yr}-03-01`, category: 'software',      description: 'Adobe Creative Cloud (annual)',                 amount: 72000, projectId: null, createdAt: Date.now() - 5.1e7  },
    { id: 'ex8',  date: `${yr}-03-22`, category: 'travel',        description: 'Shinkansen Tokyo–Paris connection (CDG)',       amount: 38000, projectId: 'p2', createdAt: Date.now() - 4.1e7  },
    { id: 'ex9',  date: `${yr}-04-02`, category: 'equipment',     description: '35mm Leica M6 kit rental — HAST editorial',    amount: 38000, projectId: 'p2', createdAt: Date.now() - 3.3e7  },
    { id: 'ex10', date: `${yr}-04-12`, category: 'food',          description: 'Catering — HAST 3-day Paris shoot',            amount: 45000, projectId: 'p2', createdAt: Date.now() - 2.7e7  },
    { id: 'ex11', date: `${yr}-05-01`, category: 'software',      description: 'Capture One Pro subscription',                  amount: 6000,  projectId: null, createdAt: Date.now() - 2.1e7  },
    { id: 'ex12', date: `${yr}-05-06`, category: 'equipment',     description: 'Lighting package — ASICS Tokyo campaign',      amount: 62000, projectId: 'p3', createdAt: Date.now() - 1.6e7  },
    { id: 'ex13', date: `${yr}-05-08`, category: 'travel',        description: 'Transport Tokyo logistics — ASICS',            amount: 18000, projectId: 'p3', createdAt: Date.now() - 1.4e7  },
    { id: 'ex14', date: `${yr}-05-15`, category: 'office',        description: 'Portfolio printing — client presentations',     amount: 12000, projectId: null, createdAt: Date.now() - 8e6   },
  ]
  _cache.expenses = expenses
  expenses.forEach(e => _upsert('expenses', e.id, e))

  const quests = [
    { id: 'q1', title: 'Reply to client emails',          difficulty: 'easy',   category: 'work',     timeframe: 'day',   repeat: true,  done: false, lastCompleted: null, createdAt: Date.now() - 9e7 },
    { id: 'q2', title: 'Backup yesterday\'s shoot files',  difficulty: 'medium', category: 'work',     timeframe: 'day',   repeat: true,  done: false, lastCompleted: null, createdAt: Date.now() - 8.9e7 },
    { id: 'q3', title: 'Morning workout',                  difficulty: 'easy',   category: 'health',   timeframe: 'day',   repeat: true,  done: false, lastCompleted: null, createdAt: Date.now() - 8.8e7 },
    { id: 'q4', title: 'Edit HAST editorial selects',      difficulty: 'hard',   category: 'creative', timeframe: 'week',  repeat: false, done: false, lastCompleted: null, dueDate: `${yr}-04-25`, createdAt: Date.now() - 5e7 },
    { id: 'q5', title: 'Plan ASICS Tokyo shoot logistics', difficulty: 'medium', category: 'work',     timeframe: 'week',  repeat: false, done: false, lastCompleted: null, dueDate: `${yr}-04-28`, createdAt: Date.now() - 4.5e7 },
    { id: 'q6', title: 'Clean & organize studio space',    difficulty: 'medium', category: 'home',     timeframe: 'week',  repeat: true,  done: false, lastCompleted: null, createdAt: Date.now() - 4e7 },
    { id: 'q7', title: 'Pay studio rent',                  difficulty: 'medium', category: 'admin',    timeframe: 'month', repeat: true,  done: false, lastCompleted: null, createdAt: Date.now() - 3e7 },
    { id: 'q8', title: 'Update portfolio website',         difficulty: 'hard',   category: 'creative', timeframe: 'month', repeat: false, done: false, lastCompleted: null, createdAt: Date.now() - 2e7 },
  ]
  _cache.quests = quests
  quests.forEach(q => _upsert('quests', q.id, q))
}

// Bootstrap: populate the cache before any page script runs.
initDB()
