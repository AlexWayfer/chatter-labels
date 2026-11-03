import { OptionsStorage } from '../storage/options.js'
import { MainStorage } from '../storage/main.js'
import { Lurkology } from './lurkology.js'

const teardownEvent = `chatter-labels:teardown:${chrome.runtime.id}`

window.dispatchEvent(new Event(teardownEvent))

const optionsStorage = await OptionsStorage.create()
const mainStorage = await MainStorage.create(optionsStorage)
const integration = await Lurkology.create(mainStorage)

window.addEventListener(teardownEvent, () => integration.destroy(), { once: true })
