const BASE_URL = 'https://favorable-eggs-2fd7a3264a.strapiapp.com/api'

// ---- HELPERS ----

async function get(path) {
    const res = await fetch(`${BASE_URL}${path}`)
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
    const json = await res.json()
    return json.data
}

async function post(path, data) {
    const res = await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data })
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.error('POST error:', JSON.stringify(err))
        throw new Error(`POST ${path} failed: ${res.status}`)
    }
    const json = await res.json()
    return json.data
}

async function put(path, data) {
    const res = await fetch(`${BASE_URL}${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data })
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.error('PUT error:', JSON.stringify(err))
        throw new Error(`PUT ${path} failed: ${res.status}`)
    }
    const json = await res.json()
    return json.data
}

// ---- EXERCISES ----

export async function getExercises() {
    return get('/exercises?pagination[limit]=100')
}

export async function createExercise(name, category, movement) {
    return post('/exercises', { name, category, movement })
}

// ---- WEEKS ----

export async function getWeeks() {
    return get('/weeks?sort=start_date:desc&pagination[limit]=20')
}

export async function getActiveWeek() {
    const weeks = await get('/weeks?filters[is_active][$eq]=true&pagination[limit]=1')
    return weeks[0] || null
}

export async function createWeek(start_date) {
    return post('/weeks', { start_date, is_active: true })
}

// ---- SESSIONS ----
// Strapi v5: filter by documentId, use documentId for relations

export async function getSessionsForWeek(weekDocumentId) {
    return get(`/gym-sessions?filters[week][documentId][$eq]=${weekDocumentId}&populate=week`)
}

export async function createSession(day, weekDocumentId) {
    const result = await post('/gym-sessions', {
        day,
        week: { connect: [{ documentId: weekDocumentId }] }
    })
    console.log('created session:', JSON.stringify(result))
    return result
}

// ---- EXERCISE BLOCKS ----

export async function getBlocksForSession(sessionDocumentId) {
    return get(
        `/exercise-blocks?filters[gym_session][documentId][$eq]=${sessionDocumentId}` +
        `&populate[exercise]=true` +
        `&sort=order:asc` +
        `&pagination[limit]=100`
    )
}

export async function createBlock(sessionDocumentId, exerciseDocumentId, order, superset_group, prescribed_sets, notes) {
    const result = await post('/exercise-blocks', {
        gym_session: { connect: [{ documentId: sessionDocumentId }] },
        exercise: { connect: [{ documentId: exerciseDocumentId }] },
        order,
        superset_group: superset_group || null,
        prescribed_sets,
        notes: notes || null
    })
    console.log('created block:', JSON.stringify(result))
    return result
}

// ---- SET LOGS ----

export async function getLogsForSession(sessionDocumentId) {
    const blocks = await get(
        `/exercise-blocks?filters[gym_session][documentId][$eq]=${sessionDocumentId}&pagination[limit]=100`
    )
    if (!blocks.length) return []

    const allLogs = await Promise.all(
        blocks.map(b =>
            get(`/set-logs?filters[exercise_block][documentId][$eq]=${b.documentId}&sort=set_index:asc&pagination[limit]=100`)
                .catch(() => [])
        )
    )

    // tag each log with its block numeric id for render.js matching
    const tagged = []
    allLogs.forEach((blockLogs, i) => {
        blockLogs.forEach(log => {
            tagged.push({ ...log, _blockId: blocks[i].id })
        })
    })
    return tagged
}

export async function createLog(blockDocumentId, blockNumericId, set_index, actual_kg, actual_reps, rpe, notes) {
    const result = await post('/set-logs', {
        exercise_block: { connect: [{ documentId: blockDocumentId }] },
        set_index,
        actual_kg: actual_kg ?? null,
        actual_reps,
        rpe: rpe ?? null,
        notes: notes || null
    })
    // tag with numeric blockId so render.js can match it
    return { ...result, _blockId: blockNumericId }
}

export async function updateLog(logDocumentId, actual_kg, actual_reps, rpe, notes) {
    return put(`/set-logs/${logDocumentId}`, {
        actual_kg: actual_kg ?? null,
        actual_reps,
        rpe: rpe ?? null,
        notes: notes || null
    })
}