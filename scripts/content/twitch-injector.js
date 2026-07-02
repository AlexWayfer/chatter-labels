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

function findElementForChatterCard(node) {
	if (node.nodeType !== Node.ELEMENT_NODE) return null

	const element = node.matches('[data-a-target]') ? node : node.querySelector('[data-a-target]')

	if (!element) return null
	if (!['viewer-card', 'mod-view-user-details'].includes(element.dataset.aTarget)) return null
	if (element.querySelector(LabelsElement.CLASS_NAME)) return null

	return element
}

const observer = new MutationObserver(mutations => {
	for (const mutation of mutations) {
		for (const addedNode of mutation.addedNodes) {
			const chatterCardElement = findElementForChatterCard(addedNode)

			if (chatterCardElement) new ChatterCard(chatterCardElement, options)
		}
	}
})

observer.observe(document.body, { childList: true, subtree: true })
