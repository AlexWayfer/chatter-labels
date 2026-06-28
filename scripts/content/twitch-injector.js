import { OptionsStorage } from '../options/storage.js'
import { LabelsElement } from './labels-element.js'

let options = await OptionsStorage.load()

chrome.storage.onChanged.addListener((changes, area) => {
	if (area != 'sync' || !changes.options) return

	OptionsStorage.sync(changes.options.newValue)
})

const observer = new MutationObserver(mutations => {
	for (const mutation of mutations) {
		for (const addedNode of mutation.addedNodes) {
			if (addedNode.nodeType !== Node.ELEMENT_NODE) continue

			const
				chatterCard =
					addedNode.matches('[data-a-target]')
						? addedNode
						: addedNode.querySelector('[data-a-target]')

			if (!chatterCard) continue
			if (!['viewer-card', 'mod-view-user-details'].includes(chatterCard.dataset.aTarget)) continue
			if (chatterCard.querySelector(LabelsElement.CLASS_NAME)) continue

			new LabelsElement(chatterCard, options)
		}
	}
});

observer.observe(document.body, { childList: true, subtree: true })
