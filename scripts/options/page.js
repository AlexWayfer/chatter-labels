import { logger } from '../logger.js'
import { DataStorage } from '../storage/data.js'
import { GitHubGistForm } from './github-gist-form.js'
import { LabelsForm } from './labels-form.js'

logger.debug('options/page.js')
logger.debug('document.readyState = ', document.readyState)

const dataStorage = new DataStorage()

GitHubGistForm.create(document.querySelector('form[name="github-gist"]'), dataStorage)

LabelsForm.create(document.querySelector('form[name="labels"]'), dataStorage)

dataStorage.listen()
