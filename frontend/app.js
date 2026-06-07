import { renderCoachShell, bindCoachEvents } from './coach.js'
import {
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
    mode: 'athlete',   // 'athlete' | 'coach'
    activeDay: null,        // 'monday' | 'wednesday' | 'friday'
    currentWeek: null,
    sessions: {},          // { monday: sessionObj, ... }
    blocks: {},          // { sessionId: [blocks] }
    logs: {},          // { sessionId: [logs] }
    drawerTarget: null         // { blockId, setIndex, prescribed, log }
}

// ---- DOM REFS ----

const app = document.getElementById('app')
const modeToggle = document.getElementById('modeToggle')
const weekLabel = document.getElementById('weekLabel')
const dayTabs = document.querySelectorAll('.day-tab')
const editDrawer = document.getElementById('editDrawer')
const editOverlay = document.getElementById('editOverlay')
const drawerTitle = editDrawer.querySelector('.edit-drawer__title')
const drawerCancel = document.getElementById('drawerCancel')
const drawerConfirm = document.getElementById('drawerConfirm')
const inputKg = editDrawer.querySelector('input[data-field="kg"]')
const inputReps = editDrawer.querySelector('input[data-field="reps"]')
const inputRpe = editDrawer.querySelector('input[data-field="rpe"]')

// ---- INIT ----

async function init() {
    // determine today's day
    const dayMap = { 1: 'monday', 3: 'wednesday', 5: 'friday' }
    const todayDay = new Date().getDay()
    state.activeDay = dayMap[todayDay] || 'monday'

    setActiveTab(state.activeDay)
    bindEvents()
    await loadWeek()
}

// ---- LOAD DATA ----

async function loadWeek() {
    app.innerHTML = renderLoading()

    const week = await getActiveWeek()
    if (!week) {
        app.innerHTML = renderNoWeek()
        return
    }

    state.currentWeek = week

    // format week label
    const d = new Date(week.attributes?.start_date || week.start_date)
    weekLabel.textContent = `Week of ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`

    // load sessions for this week
    const sessions = await getSessionsForWeek(week.id)
    sessions.forEach(s => {
        const day = s.attributes?.day || s.day
        state.sessions[day] = s
    })

    await loadDay(state.activeDay)
}

async function loadDay(day) {
    app.innerHTML = renderLoading()
    state.activeDay = day

    const session = state.sessions[day]
    if (!session) {
        app.innerHTML = '<div class="empty-state">No session programmed for this day.</div>'
        return
    }

    const sessionId = session.id

    // fetch blocks and logs in parallel
    const [blocks, logs] = await Promise.all([
        getBlocksForSession(sessionId),
        getLogsForSession(sessionId)
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
    // day tabs
    dayTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            setActiveTab(tab.dataset.day)
            loadDay(tab.dataset.day)
        })
    })

    // mode toggle
    modeToggle.addEventListener('click', () => {
        state.mode = state.mode === 'athlete' ? 'coach' : 'athlete'
        modeToggle.textContent = state.mode === 'coach' ? 'ATHLETE' : 'COACH'
        modeToggle.classList.toggle('active', state.mode === 'coach')
        // coach view coming in next iteration
        if (state.mode === 'coach') {
            showCoachView()
        } else {
            loadWeek()
        }
    })

    // drawer cancel
    drawerCancel.addEventListener('click', closeDrawer)
    editOverlay.addEventListener('click', closeDrawer)

    // drawer confirm
    drawerConfirm.addEventListener('click', confirmSet)
}

function bindSetInteractions() {
    // tap checkbox = log as prescribed (fast path)
    document.querySelectorAll('.set-check').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation()
            const row = btn.closest('.set-row')
            await handleCheckboxTap(row)
        })
    })

    // tap row = open drawer to edit
    document.querySelectorAll('.set-row').forEach(row => {
        row.addEventListener('click', () => openDrawer(row))
    })
}

// ---- CHECKBOX FAST PATH ----
// tap checkbox on a pending set → log as prescribed
// tap checkbox on a done set → remove log (undo)

async function handleCheckboxTap(row) {
    const blockId = parseInt(row.dataset.blockId)
    const setIndex = parseInt(row.dataset.setIndex)
    const logId = row.dataset.logId ? parseInt(row.dataset.logId) : null
    const pKg = row.dataset.prescribedKg ? parseFloat(row.dataset.prescribedKg) : null
    const pReps = parseInt(row.dataset.prescribedReps)

    const session = state.sessions[state.activeDay]
    if (!session) return

    if (!logId) {
        // log as prescribed
        await createLog(blockId, setIndex, pKg, pReps, null, null)
    }
    // reload to reflect changes
    await loadDay(state.activeDay)
}

// ---- DRAWER ----

function openDrawer(row) {
    const blockId = parseInt(row.dataset.blockId)
    const setIndex = parseInt(row.dataset.setIndex)
    const logId = row.dataset.logId ? parseInt(row.dataset.logId) : null
    const pKg = row.dataset.prescribedKg ? parseFloat(row.dataset.prescribedKg) : null
    const pReps = parseInt(row.dataset.prescribedReps)

    // find existing log if any
    const session = state.sessions[state.activeDay]
    const sessionId = session?.id
    const logs = state.logs[sessionId] || []
    const existingLog = logs.find(l => {
        const bId = l.attributes?.exercise_block?.data?.id ?? l.exercise_block
        const idx = l.attributes?.set_index ?? l.set_index
        return bId === blockId && idx === setIndex
    })

    // find exercise name
    const blocks = state.blocks[sessionId] || []
    const block = blocks.find(b => b.id === blockId)
    const exName = block?.attributes?.exercise?.data?.attributes?.name
        || block?.exercise?.name
        || 'Exercise'

    state.drawerTarget = { blockId, setIndex, logId: existingLog?.id || null, pKg, pReps }

    drawerTitle.textContent = `Set ${setIndex + 1} · ${exName}`

    inputKg.value = existingLog ? (existingLog.attributes?.actual_kg ?? existingLog.actual_kg ?? pKg ?? '') : (pKg ?? '')
    inputReps.value = existingLog ? (existingLog.attributes?.actual_reps ?? existingLog.actual_reps ?? pReps) : pReps
    inputRpe.value = existingLog ? (existingLog.attributes?.rpe ?? existingLog.rpe ?? '') : ''

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
    const { blockId, setIndex, logId, pKg, pReps } = state.drawerTarget

    const kg = inputKg.value !== '' ? parseFloat(inputKg.value) : null
    const reps = inputReps.value !== '' ? parseInt(inputReps.value) : pReps
    const rpe = inputRpe.value !== '' ? parseFloat(inputRpe.value) : null

    drawerConfirm.textContent = '...'
    drawerConfirm.disabled = true

    try {
        if (logId) {
            await updateLog(logId, kg, reps, rpe, null)
        } else {
            await createLog(blockId, setIndex, kg, reps, rpe, null)
        }
        closeDrawer()
        await loadDay(state.activeDay)
    } catch (err) {
        console.error('Failed to save set:', err)
        drawerConfirm.textContent = 'ERROR'
        setTimeout(() => {
            drawerConfirm.textContent = 'CONFIRM'
            drawerConfirm.disabled = false
        }, 2000)
    }
}

// ---- COACH VIEW ----

function showCoachView() {
    app.innerHTML = renderCoachShell()
    bindCoachEvents(() => {
        state.mode = 'athlete'
        modeToggle.textContent = 'COACH'
        modeToggle.classList.remove('active')
        loadWeek()
    })
}

// ---- START ----
init()