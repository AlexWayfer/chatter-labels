import { OptionsStorage } from '../storage/options.js'
import { MainStorage } from '../storage/main.js'
import { ChatterCard } from './chatter-card.js'
import { Chat } from './chat.js'

const
	optionsStorage = await OptionsStorage.create(),
	mainStorage = await MainStorage.create(optionsStorage),
	chat = await Chat.create(mainStorage)

const observer = new MutationObserver(mutations => {
	for (const mutation of mutations) {
		for (const addedNode of mutation.addedNodes) {
			ChatterCard.createIfNeeded(addedNode, mainStorage)
			chat.attachIfNeeded(addedNode)
		}

		for (const removedNode of mutation.removedNodes) {
			chat.detachIfNeeded(removedNode)
		}
	}
})

observer.observe(document.body, { childList: true, subtree: true })

chat.attachIfNeeded(document.body)
