import { load as optionsLoad } from '../options/load.js'

async function injectLabelsUI(viewerCard) {
	const options = await optionsLoad()

	const container = document.createElement('div')
	container.classList.add('chatter-labels')

	const header = document.createElement('h5')
	header.textContent = 'Labels'
	container.append(header)

	const labelsForm = document.createElement('form')
	container.append(labelsForm)

	options.labels.forEach(label => {
		const
			fieldsetElement = document.createElement('fieldset'),
			labelElement = document.createElement('label'),
			checkboxElement = document.createElement('input'),
			labelTextElement = document.createElement('span')

		checkboxElement.type = 'checkbox'
		// checkboxElement.name = name

		labelTextElement.textContent = label.name

		labelElement.append(checkboxElement, labelTextElement)
		fieldsetElement.append(labelElement)
		labelsForm.append(fieldsetElement)
	})

	viewerCard.querySelector('.viewer-card-header__background').after(container)
}

const observer = new MutationObserver((mutations) => {
	for (const mutation of mutations) {
		if (mutation.addedNodes.length > 0) {
			const viewerCard = document.querySelector('[data-a-target="viewer-card"]')

			if (viewerCard && !viewerCard.hasAttribute('data-labels-injected')) {
				viewerCard.setAttribute('data-labels-injected', 'true')

				injectLabelsUI(viewerCard)
			}
		}
	}
});

observer.observe(document.body, { childList: true, subtree: true })
