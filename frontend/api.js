import { ANTHROPIC_API_KEY } from './config.js'

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
    if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`)
    const json = await res.json()
    return json.data
}

async function put(path, data) {
    const res = await fetch(`${BASE_URL}${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data })
    })
    if (!res.ok) throw new Error(`PUT ${path} failed: ${res.status}`)
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
    // deactivate all existing weeks first
    const existing = await get('/weeks?filters[is_active][$eq]=true&pagination[limit]=100')
    await Promise.all(existing.map(w => put(`/weeks/${w.id}`, { is_active: false })))
    return post('/weeks', { start_date, is_active: true })
}

// ---- SESSIONS ----

export async function getSessionsForWeek(weekId) {
    return get(`/sessions?filters[week][id][$eq]=${weekId}&populate=week`)
}

export async function createSession(day, weekId) {
    return post('/sessions', { day, week: weekId })
}

// ---- EXERCISE BLOCKS ----

export async function getBlocksForSession(sessionId) {
    return get(
        `/exercise-blocks?filters[session][id][$eq]=${sessionId}` +
        `&populate[exercise]=true` +
        `&sort=order:asc` +
        `&pagination[limit]=100`
    )
}

export async function createBlock(sessionId, exerciseId, order, superset_group, prescribed_sets, notes) {
    return post('/exercise-blocks', {
        session: sessionId,
        exercise: exerciseId,
        order,
        superset_group: superset_group || null,
        prescribed_sets,
        notes: notes || null
    })
}

// ---- SET LOGS ----

export async function getLogsForBlock(blockId) {
    return get(`/set-logs?filters[exercise_block][id][$eq]=${blockId}&sort=set_index:asc&pagination[limit]=100`)
}

export async function getLogsForSession(sessionId) {
    // get all logs for all blocks in a session in one query
    return get(
        `/set-logs?filters[exercise_block][session][id][$eq]=${sessionId}` +
        `&populate[exercise_block]=true` +
        `&sort=set_index:asc` +
        `&pagination[limit]=500`
    )
}

export async function createLog(blockId, set_index, actual_kg, actual_reps, rpe, note) {
    return post('/set-logs', {
        exercise_block: blockId,
        set_index,
        actual_kg: actual_kg ?? null,
        actual_reps,
        rpe: rpe ?? null,
        note: note || null
    })
}

export async function updateLog(logId, actual_kg, actual_reps, rpe, note) {
    return put(`/set-logs/${logId}`, {
        actual_kg: actual_kg ?? null,
        actual_reps,
        rpe: rpe ?? null,
        note: note || null
    })
}