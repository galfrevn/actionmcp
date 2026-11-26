export function generateStaticParams() {
  return [{ slug: 'hello-world' }]
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return (
    <main>
      <h1>Post {slug}</h1>
    </main>
  )
}
