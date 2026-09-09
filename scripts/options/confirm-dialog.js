const dialog = document.querySelector('dialog.confirm')

dialog.addEventListener('click', event => {
	const rect = dialog.getBoundingClientRect()

	if (
		event.clientX < rect.left ||
		event.clientX > rect.right ||
		event.clientY < rect.top ||
		event.clientY > rect.bottom
	) {
		dialog.close()
	}
})

export async function confirm(message) {
	dialog.querySelector('.message').textContent = message
	dialog.showModal()

	await new Promise(resolve => {
		dialog.addEventListener('close', resolve, { once: true })
	})

	return dialog.returnValue == 'ok'
}
