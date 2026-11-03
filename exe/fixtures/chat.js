import { Chat } from '/scripts/content/chat.js'
import { MainStorage } from '/scripts/storage/main.js'
import { OptionsStorage } from '/scripts/storage/options.js'

const fixture = await (await fetch('/screenshots/chat.json')).json()
const container = document.querySelector('main')
const template = document.querySelector('template')

for (const message of fixture.messages) {
	const user = fixture.users.find(user => user.id === message.userId)
	const line = template.content.firstElementChild.cloneNode(true)

	line.dataset.userId = user.id
	line.style.setProperty('--username-color', user.color)
	line.classList.toggle('highlighted', !!message.highlighted)
	line.querySelector('.chat-line__username').textContent = user.username
	line.querySelector('.message-text').textContent = message.text
	if (user.badge) {
		const badge = line.querySelector('.badge')
		const image = document.createElement('img')

		badge.hidden = false
		image.src = `/screenshots/assets/${user.badge}.png`
		image.alt = ''
		badge.append(image)
	}
	if (message.replyTo) {
		const reply = line.querySelector('.reply-context')

		reply.hidden = false
		reply.textContent = `↪ Replying to @${message.replyTo}`
	}
	container.append(line)
}

const options = await OptionsStorage.create()
const storage = await MainStorage.create(options)
const chats = await Chat.createAll(storage)

for (const chat of chats) chat.attachIfNeeded(container)
