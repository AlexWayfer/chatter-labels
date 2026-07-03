import { Storage } from '../storage.js'
import { LabelsForm } from './labels-form.js'

document.addEventListener('DOMContentLoaded', async _event => {
	const labels = await Storage.getLabels()

	new LabelsForm(document.querySelector('form[name="labels"]'), labels)
})
