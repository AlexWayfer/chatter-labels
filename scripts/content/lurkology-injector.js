import { OptionsStorage } from '../storage/options.js'
import { MainStorage } from '../storage/main.js'
import { Lurkology } from './lurkology.js'

window.dispatchEvent(new Event('chatter-labels:teardown'))

const optionsStorage = await OptionsStorage.create()
const mainStorage = await MainStorage.create(optionsStorage)
const integration = await Lurkology.create(mainStorage)

window.addEventListener('chatter-labels:teardown', () => integration.destroy(), { once: true })
