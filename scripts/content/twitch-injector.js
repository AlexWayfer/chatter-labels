import { StorageClient } from '../storage/client.js'
import { ChatterCard } from './chatter-card.js'

const storageClient = new StorageClient()

const observer = new MutationObserver(mutations => {
	for (const mutation of mutations) {
		for (const addedNode of mutation.addedNodes) {
			ChatterCard.createIfNeeded(addedNode, storageClient)
		}
	}
})

observer.observe(document.body, { childList: true, subtree: true })

storageClient.listen()
