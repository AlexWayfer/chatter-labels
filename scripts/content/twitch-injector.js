import { MainStorage } from '../storage/main.js'
import { ChatterCard } from './chatter-card.js'

const mainStorage = new MainStorage()

const observer = new MutationObserver(mutations => {
	for (const mutation of mutations) {
		for (const addedNode of mutation.addedNodes) {
			ChatterCard.createIfNeeded(addedNode, mainStorage)
		}
	}
})

observer.observe(document.body, { childList: true, subtree: true })

mainStorage.listen()
