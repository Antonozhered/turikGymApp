import { renderCoachShell, bindCoachEvents } from './coach.js'
import {
    getWeeks,
    getActiveWeek,
    getSessionsForWeek,
    getBlocksForSession,
    getLogsForSession,
    createLog,
    updateLog
} from './api.js'

import {
    renderSession,
    renderLoading,
    renderNoWeek
} from './render.js'

// ---- STATE ----

const state = {
    mode: 'athlete',
    activeDay: null,
    allWeeks: [],       // all weeks sorted desc
    weekIndex: 0,        // 0 = most recent
    currentWeek: null,
    sessions: {},
    blocks: {},
    logs: {},
    drawerTarget: null
}

// ---- DOM REFS ----

const app = document.getElementById('app')
const modeToggle = document.getElementById('modeToggle')
const weekLabel = document.getElementById('weekLabel')
const prevWeekBtn = document.getElementById('prevWeek')
const nextWeekBtn = document.getElementById('nextWeek')
const dayTabs = document.querySelectorAll('.day-tab')
const editDrawer = document.getElementById('editDrawer')
const editOverlay = document.getElementById('editOverlay')
const drawerTitle = editDrawer.querySelector('.edit-drawer__title')
const drawerCancel = document.getElementById('drawerCancel')
const drawerConfirm = document.getElementById('drawerConfirm')
const inputKg = editDrawer.querySelector('input[data-field="kg"]')
const inputReps = editDrawer.querySelector('input[data-field="reps"]')
const inputRpe = editDrawer.querySelector('input[data-field="rpe"]')

// ---- WAKE STRAPI ----

async function wakeStrapi() {
    for (let i = 0; i < 5; i++) {
        try {
            const res = await fetch('https://favorable-eggs-2fd7a3264a.strapiapp.com/api/exercises')
            if (res.ok) { console.log('Strapi awake'); return }
        } catch (e) { }
        console.log(`Strapi not ready, retrying... (${i + 1}/5)`)
        await new Promise(r => setTimeout(r, 3000))
    }
    console.log('Strapi may still be waking, proceeding anyway')
}

// ---- INIT ----

async function init() {
    const dayMap = { 1: 'monday', 3: 'wednesday', 5: 'friday' }
    const todayDay = new Date().getDay()
    state.activeDay = dayMap[todayDay] || 'monday'

    setActiveTab(state.activeDay)
    bindEvents()

    await wakeStrapi()
    await loadAllWeeks()
}

// ---- LOAD WEEKS LIST ----

async function loadAllWeeks() {
    app.innerHTML = renderLoading()

    const weeks = await getWeeks()
    if (!weeks.length) {
        app.innerHTML = renderNoWeek()
        updateWeekNav()
        return
    }

    state.allWeeks = weeks

    // start on the active week if there is one, otherwise most recent
    const activeIdx = weeks.findIndex(w => w.is_active ?? w.attributes?.is_active)
    state.weekIndex = activeIdx >= 0 ? activeIdx : 0

    await loadWeekAtIndex(state.weekIndex)
}

// ---- LOAD WEEK BY INDEX ----

async function loadWeekAtIndex(index) {
    app.innerHTML = renderLoading()

    const week = state.allWeeks[index]
    if (!week) {
        app.innerHTML = renderNoWeek()
        return
    }

    state.currentWeek = week
    state.weekIndex = index

    // clear cached sessions/blocks/logs for fresh load
    state.sessions = {}
    state.blocks = {}
    state.logs = {}

    const d = new Date(week.start_date ?? week.attributes?.start_date)
    weekLabel.textContent = `Week of ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`

    updateWeekNav()

    const sessions = await getSessionsForWeek(week.documentId ?? week.attributes?.documentId)
    sessions.forEach(s => {
        const day = s.day ?? s.attributes?.day
        state.sessions[day] = s
    })

    await loadDay(state.activeDay)
}

function updateWeekNav() {
    prevWeekBtn.disabled = state.weekIndex >= state.allWeeks.length - 1
    nextWeekBtn.disabled = state.weekIndex <= 0
    prevWeekBtn.style.opacity = prevWeekBtn.disabled ? '0.3' : '1'
    nextWeekBtn.style.opacity = nextWeekBtn.disabled ? '0.3' : '1'
}

// ---- LOAD DAY ----

async function loadDay(day) {
    app.innerHTML = renderLoading()
    state.activeDay = day

    const session = state.sessions[day]
    if (!session) {
        app.innerHTML = '<div class="empty-state">No session programmed for this day.</div>'
        return
    }

    const sessionId = session.id
    const sessionDocId = session.documentId ?? session.attributes?.documentId

    const [blocks, logs] = await Promise.all([
        getBlocksForSession(sessionDocId),
        getLogsForSession(sessionDocId)
    ])

    state.blocks[sessionId] = blocks
    state.logs[sessionId] = logs

    app.innerHTML = `<section class="session">${renderSession(blocks, logs)}</section>`
    bindSetInteractions()
}

// ---- TAB SWITCHING ----

function setActiveTab(day) {
    dayTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.day === day)
    })
}

// ---- EVENTS ----

function bindEvents() {
    dayTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            setActiveTab(tab.dataset.day)
            loadDay(tab.dataset.day)
        })
    })

    prevWeekBtn.addEventListener('click', () => {
        if (state.weekIndex < state.allWeeks.length - 1) {
            loadWeekAtIndex(state.weekIndex + 1)
        }
    })

    nextWeekBtn.addEventListener('click', () => {
        if (state.weekIndex > 0) {
            loadWeekAtIndex(state.weekIndex - 1)
        }
    })

    modeToggle.addEventListener('click', () => {
        state.mode = state.mode === 'athlete' ? 'coach' : 'athlete'
        modeToggle.textContent = state.mode === 'coach' ? 'ATHLETE' : 'COACH'
        modeToggle.classList.toggle('active', state.mode === 'coach')
        if (state.mode === 'coach') {
            showCoachView()
        } else {
            loadAllWeeks()
        }
    })

    drawerCancel.addEventListener('click', closeDrawer)
    editOverlay.addEventListener('click', closeDrawer)
    drawerConfirm.addEventListener('click', confirmSet)
}

function bindSetInteractions() {
    document.querySelectorAll('.set-check').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation()
            const row = btn.closest('.set-row')
            await handleCheckboxTap(row)
        })
    })

    document.querySelectorAll('.set-row').forEach(row => {
        row.addEventListener('click', () => openDrawer(row))
    })
}

// ---- CHECKBOX FAST PATH ----

async function handleCheckboxTap(row) {
    const blockId = parseInt(row.dataset.blockId)
    const blockDocId = row.dataset.blockDocId
    const setIndex = parseInt(row.dataset.setIndex)
    const logId = row.dataset.logId ? parseInt(row.dataset.logId) : null
    const pKg = row.dataset.prescribedKg ? parseFloat(row.dataset.prescribedKg) : null
    const pReps = parseInt(row.dataset.prescribedReps)

    const session = state.sessions[state.activeDay]
    if (!session) return

    if (!logId) {
        updateRowOptimistic(row, pKg, pReps, null, false)
        createLog(blockDocId, blockId, setIndex, pKg, pReps, null, null).catch(err => {
            console.error('Failed to save log:', err)
            updateRowOptimistic(row, pKg, pReps, null, true)
        })
    }
}

// ---- DRAWER ----

function openDrawer(row) {
    const blockId = parseInt(row.dataset.blockId)
    const blockDocId = row.dataset.blockDocId
    const setIndex = parseInt(row.dataset.setIndex)
    const logId = row.dataset.logId ? parseInt(row.dataset.logId) : null
    const logDocId = row.dataset.logDocId || null
    const pKg = row.dataset.prescribedKg ? parseFloat(row.dataset.prescribedKg) : null
    const pReps = parseInt(row.dataset.prescribedReps)

    const session = state.sessions[state.activeDay]
    const sessionId = session?.id
    const logs = state.logs[sessionId] || []
    const existingLog = logs.find(l => {
        const bId = l._blockId ?? l.attributes?.exercise_block?.data?.id ?? l.exercise_block
        const idx = l.attributes?.set_index ?? l.set_index
        return bId === blockId && idx === setIndex
    })

    const blocks = state.blocks[sessionId] || []
    const block = blocks.find(b => b.id === blockId)
    const exName = block?.exercise?.name
        || block?.attributes?.exercise?.data?.attributes?.name
        || 'Exercise'

    state.drawerTarget = {
        blockId, blockDocId, setIndex,
        logId: existingLog?.id || null,
        logDocId: existingLog?.documentId || logDocId,
        pKg, pReps
    }

    drawerTitle.textContent = `Set ${setIndex + 1} · ${exName}`
    inputKg.value = existingLog ? (existingLog.actual_kg ?? existingLog.attributes?.actual_kg ?? pKg ?? '') : (pKg ?? '')
    inputReps.value = existingLog ? (existingLog.actual_reps ?? existingLog.attributes?.actual_reps ?? pReps) : pReps
    inputRpe.value = existingLog ? (existingLog.rpe ?? existingLog.attributes?.rpe ?? '') : ''

    editDrawer.classList.add('open')
    editOverlay.classList.add('visible')
    inputKg.focus()
}

function closeDrawer() {
    editDrawer.classList.remove('open')
    editOverlay.classList.remove('visible')
    state.drawerTarget = null
}

async function confirmSet() {
    const { blockId, blockDocId, setIndex, logId, logDocId, pKg, pReps } = state.drawerTarget

    const kg = inputKg.value !== '' ? parseFloat(inputKg.value) : null
    const reps = inputReps.value !== '' ? parseInt(inputReps.value) : pReps
    const rpe = inputRpe.value !== '' ? parseFloat(inputRpe.value) : null

    const row = document.querySelector(`.set-row[data-block-id="${blockId}"][data-set-index="${setIndex}"]`)
    const deviated = (kg !== pKg) || (reps !== pReps)
    closeDrawer()
    if (row) updateRowOptimistic(row, kg, reps, rpe, false, deviated, pKg, pReps)

    try {
        if (logDocId) {
            await updateLog(logDocId, kg, reps, rpe, null)
        } else {
            await createLog(blockDocId, blockId, setIndex, kg, reps, rpe, null)
        }
        // refresh logs in state so next drawer open pre-fills correctly
        const sessionDocId = state.sessions[state.activeDay]?.documentId
            ?? state.sessions[state.activeDay]?.attributes?.documentId
        if (sessionDocId) {
            const sessionId = state.sessions[state.activeDay]?.id
            state.logs[sessionId] = await getLogsForSession(sessionDocId)
        }
    } catch (err) {
        console.error('Failed to save set:', err)
        if (row) row.style.outline = '2px solid var(--danger)'
    }
}

// ---- OPTIMISTIC UI ----

function updateRowOptimistic(row, kg, reps, rpe, revert, deviated = false, pKg = null, pReps = null) {
    if (revert) {
        row.classList.remove('completed', 'deviated')
        row.classList.add('pending')
        const btn = row.querySelector('.set-check')
        btn.classList.remove('checked')
        btn.textContent = '○'
        row.querySelector('.set-values').innerHTML = `
      <span class="set-val pending-val">${kg ?? '—'} kg</span>
      <span class="set-sep">×</span>
      <span class="set-val pending-val">${reps}</span>`
        return
    }

    const btn = row.querySelector('.set-check')
    btn.classList.add('checked')
    btn.textContent = '✓'

    if (deviated) {
        row.classList.remove('pending', 'completed')
        row.classList.add('deviated')
        row.querySelector('.set-values').innerHTML = `
      <span class="set-val actual-val">${kg ?? '—'} kg</span>
      <span class="set-sep">×</span>
      <span class="set-val actual-val">${reps}</span>
      <span class="set-prescribed">(${pKg ?? '—'}×${pReps})</span>`
    } else {
        row.classList.remove('pending', 'deviated')
        row.classList.add('completed')
        row.querySelector('.set-values').innerHTML = `
      <span class="set-val">${kg ?? '—'} kg</span>
      <span class="set-sep">×</span>
      <span class="set-val">${reps}</span>`
    }

    if (rpe) {
        const rpeEl = row.querySelector('.set-rpe')
        if (rpeEl) { rpeEl.textContent = rpe; rpeEl.classList.add('rpe-val') }
    }
}

// ---- COACH VIEW ----

function showCoachView() {
    app.innerHTML = renderCoachShell()
    bindCoachEvents(() => {
        state.mode = 'athlete'
        modeToggle.textContent = 'COACH'
        modeToggle.classList.remove('active')
        loadAllWeeks()
    })
}

// ---- START ----
init()