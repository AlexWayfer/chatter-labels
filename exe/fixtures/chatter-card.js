import { MainStorage } from '/scripts/storage/main.js'
import { OptionsStorage } from '/scripts/storage/options.js'
import { ChatterCard } from '/scripts/content/chatter-card.js'

const options = await OptionsStorage.create()
const storage = await MainStorage.create(options)

await ChatterCard.create(document.querySelector('[data-a-target="viewer-card"]'), storage)
