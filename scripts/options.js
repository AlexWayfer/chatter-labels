document.addEventListener('DOMContentLoaded', async _event => {
	const
		labelsForm = document.querySelector('form[name="labels"]'),
		labelFieldsetTemplate = labelsForm.querySelector('template#label'),
		addLabelFieldsetButtton = labelsForm.querySelector('button[name="add"]')

	addLabelFieldsetButtton
		.addEventListener('click', _event => {
			const fieldset = document.importNode(labelFieldsetTemplate.content, true)

			fieldset.querySelector('button[name="delete"]').addEventListener('click', event => {
				event.target.closest('fieldset').remove()
			})

			labelsForm.insertBefore(fieldset, addLabelFieldsetButtton)
		})
})
