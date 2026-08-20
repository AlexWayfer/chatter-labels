import { OptionsStorage } from '../storage/options.js'
import { MainStorage } from '../storage/main.js'
import { ChatterCard } from './chatter-card.js'

const
	optionsStorage = await OptionsStorage.create(),
	mainStorage = await MainStorage.create(optionsStorage)

window.addEventListener('pageshow', event => {
	if (event.persisted) {
		optionsStorage.reconnect()
		mainStorage.reconnect()
	}
})

const observer = new MutationObserver(mutations => {
	for (const mutation of mutations) {
		for (const addedNode of mutation.addedNodes) {
			ChatterCard.createIfNeeded(addedNode, mainStorage)
		}
	}
})

observer.observe(document.body, { childList: true, subtree: true })
