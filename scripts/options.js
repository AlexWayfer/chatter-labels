document.addEventListener('DOMContentLoaded', async _event => {
	const
		options = (await chrome.storage.sync.get('options')).options || {},
		labelFields = ['letter', 'name'],
		labelsForm = document.querySelector('form[name="labels"]'),
		labelFieldsetTemplate = labelsForm.querySelector('template#label'),
		addLabelFieldsetButtton = labelsForm.querySelector('button.add')

	const addLabelFieldset = (data = {}) => {
		const fieldset = document.importNode(labelFieldsetTemplate.content, true)

		labelFields.forEach(field => {
			fieldset.querySelector(`input[name="${field}[]"]`).value = data[field] ?? ''
		})

		fieldset.querySelector('button.delete').addEventListener('click', event => {
			event.target.closest('fieldset').remove()
		})

		labelsForm.insertBefore(fieldset, addLabelFieldsetButtton)
	}

	options.labels ??= []

	options.labels.forEach(label => {
		addLabelFieldset(label)
	})

	addLabelFieldsetButtton.addEventListener('click', _event => { addLabelFieldset() })

	labelsForm.addEventListener('submit', event => {
		event.preventDefault()

		options.labels = Array.from(labelsForm.querySelectorAll('fieldset')).map(fieldset => {
			return Object.fromEntries(
				labelFields.map(field => {
					return [field, fieldset.querySelector(`input[name="${field}[]"]`).value]
				})
			)
		})

		chrome.storage.sync.set({ options })
	})
})
