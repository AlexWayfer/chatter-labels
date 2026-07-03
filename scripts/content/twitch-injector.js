import { Storage } from '../storage.js'
import { ChatterCard } from './chatter-card.js'

Storage.listenChanges()

const observer = new MutationObserver(mutations => {
	for (const mutation of mutations) {
		for (const addedNode of mutation.addedNodes) {
			ChatterCard.createIfNeeded(addedNode)
		}
	}
})

observer.observe(document.body, { childList: true, subtree: true })
