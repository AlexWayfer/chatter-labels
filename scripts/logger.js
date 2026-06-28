const PREFIX = ['%c[Chatter Labels]%c', 'color: #9147ff;', '']

export const logger = {
	debug: (...args) => console.debug(...PREFIX, ...args)
}
