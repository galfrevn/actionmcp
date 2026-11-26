import assert from 'node:assert/strict'
import { APP_URL, readDatabase, resetDatabase, startApp } from './lib/app.ts'
import { browser, browserJson } from './lib/browser.ts'
import { TASKS } from './lib/tasks.ts'

interface ToolList {
  tools: Array<{ name: string }>
}

interface Invocation {
  status: string
  output: { ok: boolean; data?: unknown; error?: { message: string } }
}

const options = { session: 'bench-smoke', webmcp: true }
const invoke = (tool: string, input: Record<string, unknown>) =>
  browserJson<Invocation>(options, ['webmcp', 'invoke', tool, JSON.stringify(input)])

const SCRIPTS: Record<string, () => Promise<string>> = {
  'invite-member': async () => {
    await invoke('team.inviteMember', { email: 'dana@example.com', role: 'owner' })
    return ''
  },
  'rename-account': async () => {
    await invoke('account.update', { name: 'Northwind Labs' })
    return ''
  },
  'remove-member': async () => {
    const { output } = await invoke('team.listMembers', {})
    const members = output.data as Array<{ id: string; name: string }>
    await invoke('team.removeMember', { memberId: members.find((member) => member.name === 'Priya Raman')?.id })
    return ''
  },
  'list-owners': async () => {
    const { output } = await invoke('team.listMembers', {})
    const members = output.data as Array<{ email: string; role: string }>
    return members
      .filter((member) => member.role === 'owner')
      .map((member) => member.email)
      .join(', ')
  },
  composite: async () => {
    const { output } = await invoke('team.listMembers', {})
    const members = output.data as Array<{ id: string; name: string }>
    await invoke('team.inviteMember', { email: 'sam@example.com', role: 'member' })
    await invoke('team.removeMember', { memberId: members.find((member) => member.name === 'Jonas Weber')?.id })
    await invoke('account.update', { name: 'Acme Research' })
    return ''
  },
}

const server = await startApp()
try {
  await browser(options, ['open', `${APP_URL}/team`])
  const { tools } = await browserJson<ToolList>(options, ['webmcp', 'list'])
  assert.deepEqual(tools.map((tool) => tool.name).toSorted(), [
    'account.delete',
    'account.update',
    'navigate',
    'team.inviteMember',
    'team.listMembers',
    'team.removeMember',
  ])
  for (const task of TASKS) {
    const seed = resetDatabase()
    const script = SCRIPTS[task.id]
    assert.ok(script, `No script for ${task.id}`)
    const answer = await script()
    assert.ok(task.verify(readDatabase(), answer, seed), `The verifier rejected the scripted run of ${task.id}`)
    assert.ok(!task.verify(seed, '', seed) || task.id === 'list-owners', `The verifier of ${task.id} accepts an untouched database`)
    console.log(`ok ${task.id}`)
  }
} finally {
  await browser(options, ['close'])
  server.kill()
}
