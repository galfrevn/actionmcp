import { readDatabase } from '../../lib/db'
import { ActionForm } from '../action-form'
import { deleteAccount, updateAccount } from '../actions'

export default function AccountPage() {
  const { account } = readDatabase()
  return (
    <main>
      <h1>Account</h1>
      <ActionForm action={updateAccount} submitLabel="Save">
        <input name="name" defaultValue={account.name} aria-label="Account name" required />
      </ActionForm>
      <h2>Delete account</h2>
      <ActionForm action={deleteAccount} submitLabel="Delete account">
        <input name="confirmation" placeholder="Type DELETE" aria-label="Confirmation" required />
      </ActionForm>
    </main>
  )
}
