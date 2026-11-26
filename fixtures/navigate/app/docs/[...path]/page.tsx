export default async function Page({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return (
    <main>
      <h1>Docs {path.join(' / ')}</h1>
    </main>
  )
}
