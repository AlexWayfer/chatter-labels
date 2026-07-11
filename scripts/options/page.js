import { logger } from '../logger.js'
import { StorageClient } from '../storage/client.js'
import { LabelsForm } from './labels-form.js'

logger.debug('options/page.js')
logger.debug('document.readyState = ', document.readyState)

const storageClient = new StorageClient()

LabelsForm.create(document.querySelector('form[name="labels"]'), storageClient)

storageClient.listen()
