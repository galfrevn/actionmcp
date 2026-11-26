import { readTodos, type Todo } from '../lib/todos'
import { Chat } from './chat'
import { reset, start } from './demo-actions'
import { TodoList } from './todo-list'

const REPOSITORY = 'https://github.com/galfrevn/actionmcp'
const SOURCE = `${REPOSITORY}/tree/main/examples/demo`
const IMPLEMENTATION_STATUS = 'https://github.com/webmachinelearning/webmcp/blob/main/implementation-status.md'

const TOOLS = [
  { name: 'listTodos', annotations: 'read-only, untrusted output', asks: 'no' },
  { name: 'addTodo', annotations: 'consequential, untrusted output', asks: 'yes' },
  { name: 'toggleTodo', annotations: 'consequential, untrusted output', asks: 'yes' },
  { name: 'removeTodo', annotations: 'consequential', asks: 'yes' },
]

function Intro() {
  return (
    <main>
      <h1>Server Actions as WebMCP tools</h1>
      <p>
        This page is a Next.js app. Its todo list runs on four Server Actions, and actionmcp registers them as WebMCP tools. The assistant
        on the page calls the same tools that a browser agent sees, and the page asks you before a tool changes your list.
      </p>
      <form action={start}>
        <button type="submit">Start the demo</button>
      </form>
      <p className="muted">Your list is stored in a cookie in this browser for one day. Nobody else sees it.</p>
    </main>
  )
}

function Demo({ todos }: { todos: Todo[] }) {
  return (
    <main className="layout">
      <section>
        <h1>Your todos</h1>
        <TodoList todos={todos} />
      </section>
      <Chat />
      <section>
        <h2>What to try</h2>
        <ol>
          <li>
            Ask the assistant what is on your list. The todo that starts with “Ignore previous instructions” is a prompt injection. If the
            model follows it, the page asks you before anything is removed. Select Cancel, and the model receives a <code>declined</code>{' '}
            result.
          </li>
          <li>
            Ask it to add a todo or to mark one as done. Each change asks you first, because the tool is consequential. Reading the list
            does not ask, because <code>listTodos</code> is read-only.
          </li>
          <li>
            Open this page in a browser or an agent that implements WebMCP. It sees the same four tools. The{' '}
            <a href={IMPLEMENTATION_STATUS}>implementation status page</a> of the WebMCP draft lists them.
          </li>
        </ol>
      </section>
      <section>
        <h2>Tools on this page</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">Tool</th>
              <th scope="col">Annotations</th>
              <th scope="col">Asks you first</th>
            </tr>
          </thead>
          <tbody>
            {TOOLS.map((tool) => (
              <tr key={tool.name}>
                <td>
                  <code>{tool.name}</code>
                </td>
                <td>{tool.annotations}</td>
                <td>{tool.asks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  )
}

export default async function Page() {
  const todos = await readTodos()
  return (
    <>
      <header className="session">
        <strong>actionmcp demo</strong>
        <nav>
          <a href={REPOSITORY}>GitHub</a>
          {todos ? (
            <form action={reset} style={{ margin: 0 }}>
              <button type="submit">Reset the demo</button>
            </form>
          ) : null}
        </nav>
      </header>
      {todos ? <Demo todos={todos} /> : <Intro />}
      <footer className="muted">
        The source of this page is <a href={SOURCE}>examples/demo</a>.
      </footer>
    </>
  )
}
