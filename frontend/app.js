import { getExercises } from './api.js'
import { parseProgram } from './parser.js'

const app = document.getElementById('app')

const testProgram = `Понедельник:
Присед:
20х12х2
40х8
60х4
75х2
90х2
100х2/3
Жим:
20х12/2
40х8/2
60х8
70х8/2`


async function init() {
    const exercises = await getExercises()
    app.innerHTML = `<p>Connected. ${exercises.length} exercises in DB.</p>`

    const parsed = await parseProgram(testProgram)
    console.log(parsed)
    app.innerHTML += `<pre>${JSON.stringify(parsed, null, 2)}</pre>`
}

init()