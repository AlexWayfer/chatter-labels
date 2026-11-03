import { OptionsStorage } from '../storage/options.js'
import { MainStorage } from '../storage/main.js'
import { ChatterCard } from './chatter-card.js'
import { Chat } from './chat.js'
import { Profile } from './profile.js'

const teardownEvent = `chatter-labels:teardown:${chrome.runtime.id}`

window.dispatchEvent(new Event(teardownEvent))

const
	optionsStorage = await OptionsStorage.create(),
	mainStorage = await MainStorage.create(optionsStorage),
	chats = await Chat.createAll(mainStorage),
	profile = new Profile(mainStorage)

const observer = new MutationObserver(mutations => {
	profile.handleMutations(mutations)
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
	teardownEvent,
	() => {
		observer.disconnect()
		document.removeEventListener('chatter-labels:user-id', refreshChats, true)
		for (const chat of chats) chat.destroy()
		ChatterCard.destroyAll()
		profile.destroy()
	},
	{ once: true }
)

observer.observe(document.body, {
	childList: true, subtree: true, attributes: true, attributeFilter: ['href']
})

document.addEventListener('chatter-labels:user-id', refreshChats, true)

for (const chat of chats) chat.attachIfNeeded(document.body)
ChatterCard.createIfNeeded(document.body, mainStorage)
