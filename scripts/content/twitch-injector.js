import { OptionsStorage } from '../storage/options.js'
import { MainStorage } from '../storage/main.js'
import { ChatterCard } from './chatter-card.js'
import { Chat } from './chat.js'

window.dispatchEvent(new Event('chatter-labels:teardown'))

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

window.addEventListener(
	'chatter-labels:teardown',
	() => {
		observer.disconnect()
		chat.destroy()
		ChatterCard.destroyAll()
	},
	{ once: true }
)

observer.observe(document.body, { childList: true, subtree: true })

chat.attachIfNeeded(document.body)
ChatterCard.createIfNeeded(document.body, mainStorage)
