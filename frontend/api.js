const BASE_URL = 'https://favorable-eggs-2fd7a3264a.strapiapp.com/api'

export async function getExercises() {
    const res = await fetch(`${BASE_URL}/exercises`)
    const json = await res.json()
    return json.data
}

export async function createExercise(name, category, movement) {
    const res = await fetch(`${BASE_URL}/exercises`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { name, category, movement } })
    })
    const json = await res.json()
    return json.data
}