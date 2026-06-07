import { parseProgram } from './parser.js'
import {
    getWeeks,
    getSessionsForWeek,
    getBlocksForSession,
    getLogsForSession,
    getExercises,
    createExercise,
    createWeek,
    createSession,
    createBlock
} from './api.js'

// ---- RENDER COACH VIEW ----

export function renderCoachShell() {
    return `
    <section class="coach-view">

      <!-- ADD WEEK -->
      <div class="coach-card" id="addWeekCard">
        <div class="coach-card__header">
          <h2 class="coach-card__title">Add new week</h2>
          <button class="btn-add-week" id="btnAddWeek">+ NEW WEEK</button>
        </div>

        <!-- PASTE AREA (hidden by default) -->
        <div class="paste-area" id="pasteArea" style="display:none">
          <label class="paste-label">Paste the program</label>
          <textarea
            id="programInput"
            class="paste-input"
            placeholder="Понедельник:&#10;Присед:&#10;20х12х2&#10;..."
            rows="10"
          ></textarea>
          <button id="btnClearCache" style="font-size:11px;color:var(--grey-500);background:none;border:none;cursor:pointer;margin-bottom:8px">
             clear parse cache
            </button>
          <div class="paste-actions">
            <button class="btn-cancel" id="btnCancelPaste">CANCEL</button>
            <button class="btn-confirm" id="btnParse">PARSE →</button>
          </div>
        </div>
      </div>

      <!-- PREVIEW (hidden by default) -->
      <div class="coach-card" id="previewCard" style="display:none">
        <div class="coach-card__header">
          <h2 class="coach-card__title">Preview</h2>
          <span class="preview-week-label" id="previewWeekLabel"></span>
        </div>
        <div id="previewContent"></div>
        <div class="paste-actions" style="margin-top:16px">
          <button class="btn-cancel" id="btnCancelPreview">BACK</button>
          <button class="btn-confirm" id="btnConfirmWeek">SAVE WEEK</button>
        </div>
      </div>

      <!-- PAST WEEKS -->
      <div class="coach-card">
        <div class="coach-card__header">
          <h2 class="coach-card__title">Past weeks</h2>
        </div>
        <div id="pastWeeksList">
          <div class="empty-state" style="padding:24px">Loading...</div>
        </div>
      </div>

    </section>`
}

// ---- BIND COACH EVENTS ----

let parsedData = null  // holds parsed JSON between parse and confirm steps

export function bindCoachEvents(onWeekSaved) {
    document.getElementById('btnAddWeek').addEventListener('click', () => {
        document.getElementById('pasteArea').style.display = 'block'
        document.getElementById('btnAddWeek').style.display = 'none'
        document.getElementById('programInput').focus()
    })

    document.getElementById('btnCancelPaste').addEventListener('click', () => {
        document.getElementById('pasteArea').style.display = 'none'
        document.getElementById('btnAddWeek').style.display = 'block'
        document.getElementById('programInput').value = ''
    })
    
    document.getElementById('btnClearCache').addEventListener('click', () => {
        localStorage.removeItem('turik_last_parse')
        document.getElementById('btnClearCache').textContent = 'cache cleared'
    })

    document.getElementById('btnParse').addEventListener('click', handleParse)
    document.getElementById('btnCancelPreview').addEventListener('click', handleCancelPreview)
    document.getElementById('btnConfirmWeek').addEventListener('click', () => handleConfirmWeek(onWeekSaved))

    

    loadPastWeeks()
}

// ---- PARSE STEP ----

async function handleParse() {
    const btn = document.getElementById('btnParse')
    const input = document.getElementById('programInput').value.trim()

    if (!input) return

    btn.textContent = 'PARSING...'
    btn.disabled = true

    try {
        parsedData = await parseProgram(input)
        showPreview(parsedData)
    } catch (err) {
        console.error('Parse failed:', err)
        btn.textContent = 'ERROR — TRY AGAIN'
        btn.disabled = false
        return
    }

    btn.textContent = 'PARSE →'
    btn.disabled = false
}

// ---- PREVIEW ----

function showPreview(data) {
    document.getElementById('addWeekCard').style.display = 'none'
    document.getElementById('previewCard').style.display = 'block'

    // figure out start date = next monday
    const today = new Date()
    const day = today.getDay()
    const diff = day === 0 ? 1 : 8 - day  // days until next monday
    const nextMonday = new Date(today)
    nextMonday.setDate(today.getDate() + (day === 1 ? 0 : diff))

    document.getElementById('previewWeekLabel').textContent =
        `Week of ${nextMonday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`

    const days = ['monday', 'wednesday', 'friday']
    const dayLabels = { monday: 'Понедельник', wednesday: 'Среда', friday: 'Пятница' }

    let html = ''
    days.forEach(day => {
        const exercises = data.days?.[day] || []
        if (!exercises.length) return

        html += `<div class="preview-day">`
        html += `<div class="preview-day__label">${dayLabels[day]}</div>`

        exercises.forEach(ex => {
            const setsStr = ex.prescribed_sets
                .map(s => `${s.kg ?? '—'}×${s.reps}`)
                .join('  ')

            html += `
        <div class="preview-exercise">
          <div class="preview-ex-name">
            ${ex.superset_group ? `<span class="preview-superset-tag">SS ${ex.superset_group}</span>` : ''}
            ${ex.name}
          </div>
          <div class="preview-ex-sets">${setsStr}</div>
          ${ex.notes ? `<div class="preview-ex-notes">${ex.notes}</div>` : ''}
        </div>`
        })

        html += `</div>`
    })

    document.getElementById('previewContent').innerHTML = html
}

function handleCancelPreview() {
    document.getElementById('previewCard').style.display = 'none'
    document.getElementById('addWeekCard').style.display = 'block'
    parsedData = null
}

// ---- CONFIRM & SAVE ----

async function handleConfirmWeek(onWeekSaved) {
    const btn = document.getElementById('btnConfirmWeek')
    btn.textContent = 'SAVING...'
    btn.disabled = true

    try {
        await saveWeekToStrapi(parsedData)
        btn.textContent = 'SAVED ✓'

        setTimeout(() => {
            document.getElementById('previewCard').style.display = 'none'
            document.getElementById('addWeekCard').style.display = 'block'
            document.getElementById('btnAddWeek').style.display = 'block'
            document.getElementById('pasteArea').style.display = 'none'
            document.getElementById('programInput').value = ''
            parsedData = null
            btn.textContent = 'SAVE WEEK'
            btn.disabled = false
            loadPastWeeks()
            if (onWeekSaved) onWeekSaved()
        }, 1500)

    } catch (err) {
        console.error('Save failed:', err)
        btn.textContent = 'ERROR — RETRY'
        btn.disabled = false
    }
}

// ---- SAVE TO STRAPI ----

async function saveWeekToStrapi(data) {
    // 1. get exercise library (for find-or-create)
    const existingExercises = await getExercises()
    const exerciseCache = {}
    existingExercises.forEach(e => {
        const name = (e.attributes?.name || e.name || '').toLowerCase().trim()
        exerciseCache[name] = e.id
    })

    async function findOrCreateExercise(ex) {
        const key = ex.name.toLowerCase().trim()
        if (exerciseCache[key]) return exerciseCache[key]

        const created = await createExercise(ex.name, ex.category, ex.movement)
        exerciseCache[key] = created.id
        return created.id
    }

    // 2. create the week (deactivates old ones automatically)
    const today = new Date()
    const day = today.getDay()
    const diff = day === 1 ? 0 : (8 - day) % 7 || 7
    const monday = new Date(today)
    monday.setDate(today.getDate() + (day === 1 ? 0 : diff))
    const startDate = monday.toISOString().split('T')[0]

    const week = await createWeek(startDate)

    // 3. create sessions + blocks for each day
    const days = ['monday', 'wednesday', 'friday']

    for (const dayName of days) {
        const exercises = data.days?.[dayName] || []
        if (!exercises.length) continue

        const session = await createSession(dayName, week.id)

        for (let i = 0; i < exercises.length; i++) {
            const ex = exercises[i]
            const exId = await findOrCreateExercise(ex)

            await createBlock(
                session.id,
                exId,
                i,
                ex.superset_group || null,
                ex.prescribed_sets,
                ex.notes || null
            )
        }
    }
}

// ---- PAST WEEKS LIST ----

async function loadPastWeeks() {
    const container = document.getElementById('pastWeeksList')
    if (!container) return

    try {
        const weeks = await getWeeks()
        if (!weeks.length) {
            container.innerHTML = '<div class="empty-state" style="padding:20px">No weeks yet.</div>'
            return
        }

        container.innerHTML = weeks.map(w => {
            const d = new Date(w.attributes?.start_date || w.start_date)
            const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
            const active = w.attributes?.is_active ?? w.is_active

            return `
        <div class="past-week-row ${active ? 'past-week-row--active' : ''}">
          <span class="past-week-date">${label}</span>
          ${active ? '<span class="past-week-badge">ACTIVE</span>' : ''}
        </div>`
        }).join('')

    } catch (err) {
        container.innerHTML = '<div class="empty-state" style="padding:20px">Failed to load.</div>'
    }
}