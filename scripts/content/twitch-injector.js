import { Storage } from '../storage/storage.js'
import { ChatterCard } from './chatter-card.js'

const storage = new Storage()

const observer = new MutationObserver(mutations => {
	for (const mutation of mutations) {
		for (const addedNode of mutation.addedNodes) {
			ChatterCard.createIfNeeded(addedNode, storage)
		}
	}
})

observer.observe(document.body, { childList: true, subtree: true })

storage.listen()
