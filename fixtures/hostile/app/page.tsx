import { store } from '../lib/store'

export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <main>
      <h1>Account</h1>
      <p data-testid="account">{store.accountDeleted ? 'deleted' : 'active'}</p>
      <ul>
        {store.comments.map((comment) => (
          <li key={comment}>{comment}</li>
        ))}
      </ul>
    </main>
  )
}
