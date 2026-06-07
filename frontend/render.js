// render.js — pure functions that take data and return HTML strings

// ---- HELPERS ----

function movementBadge(movement, category) {
    if (category === 'sbd_main' || category === 'sbd_variation') {
        if (movement === 'squat') return { cls: 'squat', letter: 'S' }
        if (movement === 'bench') return { cls: 'bench', letter: 'B' }
        if (movement === 'deadlift') return { cls: 'deadlift', letter: 'D' }
    }
    return { cls: 'other', letter: 'A' }
}

function blockBorderClass(movement, category) {
    if (category !== 'sbd_main' && category !== 'sbd_variation') return ''
    if (movement === 'bench') return 'sbd bench-block'
    if (movement === 'deadlift') return 'sbd deadlift-block'
    if (movement === 'squat') return 'sbd'
    return ''
}

function formatKg(kg) {
    if (kg === null || kg === undefined) return '—'
    return `${kg}`
}

// ---- SET ROW ----
// log = null means not done yet
// log exists + matches prescribed = completed
// log exists + differs = deviated

export function renderSetRow(setIndex, prescribed, log, blockId) {
    const pKg = prescribed.kg
    const pReps = prescribed.reps

    let state, checkClass, valHtml, rpeHtml

    if (!log) {
        // PENDING
        state = 'pending'
        checkClass = ''
        valHtml = `
      <span class="set-val pending-val">${formatKg(pKg)} kg</span>
      <span class="set-sep">×</span>
      <span class="set-val pending-val">${pReps}</span>`
        rpeHtml = '<span class="set-rpe">—</span>'

    } else {
        const deviated = (log.actual_kg !== pKg) || (log.actual_reps !== pReps)

        if (deviated) {
            // DEVIATED — done but changed
            state = 'deviated'
            checkClass = 'checked'
            valHtml = `
        <span class="set-val actual-val">${formatKg(log.actual_kg)} kg</span>
        <span class="set-sep">×</span>
        <span class="set-val actual-val">${log.actual_reps}</span>
        <span class="set-prescribed">(${formatKg(pKg)}×${pReps})</span>`
        } else {
            // COMPLETED — exactly as prescribed
            state = 'completed'
            checkClass = 'checked'
            valHtml = `
        <span class="set-val">${formatKg(pKg)} kg</span>
        <span class="set-sep">×</span>
        <span class="set-val">${pReps}</span>`
        }

        rpeHtml = log.rpe
            ? `<span class="set-rpe rpe-val">${log.rpe}</span>`
            : '<span class="set-rpe">—</span>'
    }

    const logId = log ? log.id : ''

    return `
    <div class="set-row ${state}"
         data-set-index="${setIndex}"
         data-block-id="${blockId}"
         data-log-id="${logId}"
         data-prescribed-kg="${pKg ?? ''}"
         data-prescribed-reps="${pReps}">
      <span class="set-num">${setIndex + 1}</span>
      <div class="set-values">${valHtml}</div>
      ${rpeHtml}
      <button class="set-check ${checkClass}" aria-label="Toggle set">
        ${checkClass ? '✓' : '○'}
      </button>
    </div>`
}

// ---- EXERCISE BLOCK ----

export function renderExerciseBlock(block, logs) {
    const exercise = block.attributes?.exercise?.data?.attributes || block.exercise || {}
    const movement = exercise.movement || 'other'
    const category = exercise.category || 'accessory'
    const name = exercise.name || 'Exercise'
    const prescribed = block.attributes?.prescribed_sets || block.prescribed_sets || []
    const notes = block.attributes?.notes || block.notes || null
    const blockId = block.id

    const badge = movementBadge(movement, category)
    const borderClass = blockBorderClass(movement, category)

    // map logs by set_index for quick lookup
    const logMap = {}
    logs.forEach(l => {
        const idx = l.attributes?.set_index ?? l.set_index
        logMap[idx] = {
            id: l.id,
            actual_kg: l.attributes?.actual_kg ?? l.actual_kg,
            actual_reps: l.attributes?.actual_reps ?? l.actual_reps,
            rpe: l.attributes?.rpe ?? l.rpe,
            note: l.attributes?.note ?? l.note
        }
    })

    const setsHtml = prescribed.map((p, i) =>
        renderSetRow(i, p, logMap[i] || null, blockId)
    ).join('')

    const subLabel = category === 'sbd_main' ? 'Main lift'
        : category === 'sbd_variation' ? 'Variation'
            : 'Accessory'

    return `
    <div class="exercise-block ${borderClass}" data-block-id="${blockId}">
      <div class="exercise-header">
        <div class="exercise-badge ${badge.cls}">${badge.letter}</div>
        <div class="exercise-meta">
          <h2 class="exercise-name">${name}</h2>
          <span class="exercise-sub">${subLabel}${notes ? ` · ${notes}` : ''}</span>
        </div>
        <div class="exercise-total">${prescribed.length} sets</div>
      </div>
      <div class="sets-list">
        ${setsHtml}
      </div>
    </div>`
}

// ---- SUPERSET GROUP ----

export function renderSupersetGroup(blocks, allLogs) {
    const groupLabel = blocks[0].attributes?.superset_group || blocks[0].superset_group

    const blocksHtml = blocks.map(block => {
        const exercise = block.attributes?.exercise?.data?.attributes || block.exercise || {}
        const name = exercise.name || 'Exercise'
        const movement = exercise.movement || 'other'
        const category = exercise.category || 'accessory'
        const badge = movementBadge(movement, category)
        return `
      <div class="exercise-header">
        <div class="exercise-badge ${badge.cls}">${badge.letter}</div>
        <div class="exercise-meta">
          <h2 class="exercise-name">${name}</h2>
        </div>
      </div>`
    }).join('')

    // use sets from first block (supersets share set count)
    const primaryBlock = blocks[0]
    const prescribed = primaryBlock.attributes?.prescribed_sets || primaryBlock.prescribed_sets || []
    const notes = primaryBlock.attributes?.notes || primaryBlock.notes || null

    // logs keyed per block
    const setRowsHtml = prescribed.map((p, i) => {
        return blocks.map(block => {
            const blockLogs = allLogs.filter(l => {
                const bId = l.attributes?.exercise_block?.data?.id ?? l.exercise_block
                return bId === block.id
            })
            const logMap = {}
            blockLogs.forEach(l => {
                const idx = l.attributes?.set_index ?? l.set_index
                logMap[idx] = {
                    id: l.id,
                    actual_kg: l.attributes?.actual_kg ?? l.actual_kg,
                    actual_reps: l.attributes?.actual_reps ?? l.actual_reps,
                    rpe: l.attributes?.rpe ?? l.rpe,
                }
            })
            const blockPrescribed = block.attributes?.prescribed_sets || block.prescribed_sets || []
            return renderSetRow(i, blockPrescribed[i] || p, logMap[i] || null, block.id)
        }).join('')
    }).join('')

    return `
    <div class="exercise-block accessory superset-block" data-superset="${groupLabel}">
      <div class="superset-label">SUPERSET ${groupLabel}</div>
      ${blocksHtml}
      ${notes ? `<p class="superset-note">${notes}</p>` : ''}
      <div class="sets-list">${setRowsHtml}</div>
    </div>`
}

// ---- FULL SESSION ----

export function renderSession(blocks, allLogs) {
    if (!blocks.length) {
        return '<div class="empty-state">No exercises programmed for this day.</div>'
    }

    // group by superset_group
    const groups = {}
    const ordered = []

    blocks.forEach(block => {
        const sg = block.attributes?.superset_group || block.superset_group || null
        if (sg) {
            if (!groups[sg]) {
                groups[sg] = []
                ordered.push({ type: 'superset', key: sg })
            }
            groups[sg].push(block)
        } else {
            ordered.push({ type: 'solo', block })
        }
    })

    return ordered.map(item => {
        if (item.type === 'solo') {
            const blockLogs = allLogs.filter(l => {
                const bId = l.attributes?.exercise_block?.data?.id ?? l.exercise_block
                return bId === item.block.id
            })
            return renderExerciseBlock(item.block, blockLogs)
        } else {
            return renderSupersetGroup(groups[item.key], allLogs)
        }
    }).join('')
}

// ---- EMPTY / LOADING STATES ----

export function renderLoading() {
    return `<div class="empty-state">Loading...</div>`
}

export function renderNoWeek() {
    return `
    <div class="empty-state">
      <p>No active week.</p>
      <p style="color:var(--grey-400);font-size:14px;margin-top:8px">Switch to Coach mode to add a program.</p>
    </div>`
}