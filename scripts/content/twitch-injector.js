import { OptionsStorage } from '../storage/options.js'
import { MainStorage } from '../storage/main.js'
import { ChatterCard } from './chatter-card.js'
import { Chat } from './chat.js'

window.dispatchEvent(new Event('chatter-labels:teardown'))

const
	optionsStorage = await OptionsStorage.create(),
	mainStorage = await MainStorage.create(optionsStorage),
	chats = await Chat.createAll(mainStorage)

const observer = new MutationObserver(mutations => {
	for (const mutation of mutations) {
		for (const addedNode of mutation.addedNodes) {
			ChatterCard.createIfNeeded(addedNode, mainStorage)

			for (const chat of chats) chat.attachIfNeeded(addedNode)
		}

		for (const removedNode of mutation.removedNodes) {
			for (const chat of chats) chat.detachIfNeeded(removedNode)
		}
	}
})

const refreshChats = () => {
	for (const chat of chats) chat.refresh()
}

window.addEventListener(
	'chatter-labels:teardown',
	() => {
		observer.disconnect()
		document.removeEventListener('chatter-labels:user-id', refreshChats, true)
		for (const chat of chats) chat.destroy()
		ChatterCard.destroyAll()
	},
	{ once: true }
)

observer.observe(document.body, { childList: true, subtree: true })

document.addEventListener('chatter-labels:user-id', refreshChats, true)

for (const chat of chats) chat.attachIfNeeded(document.body)
ChatterCard.createIfNeeded(document.body, mainStorage)
