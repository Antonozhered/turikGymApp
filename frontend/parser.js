const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
import { ANTHROPIC_API_KEY } from './config.js'
const API_KEY = ANTHROPIC_API_KEY // we'll move this to an env variable later



export async function parseProgram(rawText) {
    const CACHE_KEY = 'turik_last_parse'

    const cached = localStorage.getItem(CACHE_KEY)
    if (cached) {
        const { input, result } = JSON.parse(cached)
        if (input === rawText) {
            console.log('Using cached parse result')
            return result
        }
    }

    const res = await fetch(ANTHROPIC_API_URL, {    
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 4000,
            messages: [{
                role: 'user',
                content: `Parse this powerlifting program into JSON. The program is in Russian.

Rules:
- days are monday, wednesday, friday
- each exercise has: name (keep original language, do not translate), category (sbd_main / sbd_variation / accessory), movement (squat / bench / deadlift / other)
- sets format "weightxreps/sets" or "weightxreps" — e.g. "100x2/3" means 3 sets of 2 reps at 100kg
- if weight is missing (e.g. "15x2") it means bodyweight or unspecified — set kg to null
- exercises joined with + are a superset — give them the same superset_group letter (A, B, C...)
- solo exercises have superset_group: null
- ignore the warmup section (joint mobility, stretching descriptions) but keep ALL weighted sets including lighter warmup sets
- prescribed_sets is an array of {kg, reps} objects

Return ONLY valid JSON, no explanation, no markdown:
{
  "days": {
    "monday": [
      {
        "name": "Squat",
        "category": "sbd_main",
        "movement": "squat",
        "superset_group": null,
        "notes": null,
        "prescribed_sets": [
          {"kg": 100, "reps": 2}
        ]
      }
    ],
    "wednesday": [],
    "friday": []
  }
}

Program:
${rawText}`
            }]
        })
    })

    if (!res.ok) {
        const err = await res.json()
        console.error('API error:', err)
        throw new Error(`API ${res.status}`)
    }

    const data = await res.json()
    const text = data.content[0].text
    const clean = text.replace(/```json\n?|\n?```/g, '').trim()
    return JSON.parse(clean)

    const result = JSON.parse(clean)
    localStorage.setItem(CACHE_KEY, JSON.stringify({ input: rawText, result }))
    return result
}

