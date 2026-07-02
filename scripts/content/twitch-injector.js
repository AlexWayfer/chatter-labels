import { logger } from '../logger.js'
import { OptionsStorage } from '../options/storage.js'
import { ChatterCard } from './chatter-card.js'
import { LabelsElement } from './labels-element.js'

let options = await OptionsStorage.load()

chrome.storage.onChanged.addListener((changes, area) => {
	if (area != 'sync' || !changes.options) return

	options = OptionsStorage.parse(changes.options.newValue)

	ChatterCard.updateAll(options)

	logger.debug('Options synced for content script.')
})

const observer = new MutationObserver(mutations => {
	for (const mutation of mutations) {
		for (const addedNode of mutation.addedNodes) {
			if (addedNode.nodeType !== Node.ELEMENT_NODE) continue

			const
				chatterCardElement =
					addedNode.matches('[data-a-target]')
						? addedNode
						: addedNode.querySelector('[data-a-target]')

			if (
				chatterCardElement
					&& ['viewer-card', 'mod-view-user-details'].includes(chatterCardElement.dataset.aTarget)
					&& !chatterCardElement.querySelector(LabelsElement.CLASS_NAME)
			) {
				new ChatterCard(chatterCardElement, options)
			}
		}
	}
});

observer.observe(document.body, { childList: true, subtree: true })
