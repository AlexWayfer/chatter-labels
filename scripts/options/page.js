import { logger } from '../logger.js'
import { Storage } from '../storage/storage.js'
import { LabelsForm } from './labels-form.js'

logger.debug('options/page.js')
logger.debug('document.readyState = ', document.readyState)

const storage = new Storage()

LabelsForm.create(document.querySelector('form[name="labels"]'), storage)

storage.listen()
