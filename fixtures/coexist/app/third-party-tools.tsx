'use client'

import { useEffect } from 'react'
import { useWebMCP } from 'use-webmcp-tool'

const THIRD_PARTY_TOOLS = ['snapshot', 'act', 'query', 'pause_hmr', 'get_cart']

export function ThirdPartyTools() {
  useWebMCP({
    name: 'page_title',
    description: 'Read the title of the current page.',
    execute: () => ({ title: document.title }),
  })

  useEffect(() => {
    const controller = new AbortController()
    for (const name of THIRD_PARTY_TOOLS) {
      void document.modelContext?.registerTool(
        { name, description: `Third-party tool ${name}.`, execute: () => ({ owner: 'third-party', name }) },
        { signal: controller.signal },
      )
    }
    return () => controller.abort()
  }, [])

  return null
}
