import { logger } from '../logger.js'
import { Storage } from '../storage.js'
import { LabelsForm } from './labels-form.js'

logger.debug('options/page.js')
logger.debug('document.readyState = ', document.readyState)

const
	labels = await Storage.get('labels'),
	assignments = await Storage.get('assignments')

new LabelsForm(document.querySelector('form[name="labels"]'), labels, assignments)
