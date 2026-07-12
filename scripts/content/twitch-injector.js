import { DataStorage } from '../storage/data.js'
import { ChatterCard } from './chatter-card.js'

const dataStorage = new DataStorage()

const observer = new MutationObserver(mutations => {
	for (const mutation of mutations) {
		for (const addedNode of mutation.addedNodes) {
			ChatterCard.createIfNeeded(addedNode, dataStorage)
		}
	}
})

observer.observe(document.body, { childList: true, subtree: true })

dataStorage.listen()
