import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Assignment } from '../scripts/models/assignment.js'
import { User } from '../scripts/models/user.js'

test('normalizes comment line breaks and supports older data', () => {
	const label = { id: 'friend' }
	const assignment = new Assignment({
		user: new User({ id: 'one', login: 'one' }),
		label,
		assignedAt: '2026-11-03T12:00:00.000Z',
		comment: 'Helpful\r\nchatter\n<not HTML>'
	})

	assert.equal(Assignment.fromJSON(assignment.toJSON(), label).comment, 'Helpful chatter <not HTML>')
	assert.equal(assignment.toJSON().comment, 'Helpful chatter <not HTML>')
	assert.equal(Assignment.fromJSON({ userId: 'one', comment: 'Old\rcomment' }, label).comment, 'Old comment')
	assert.equal(Assignment.fromJSON({ userId: 'one' }, label).comment, '')
})
