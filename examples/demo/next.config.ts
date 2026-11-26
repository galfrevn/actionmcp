import { withAgentTools } from 'actionmcp/config'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {}

export default withAgentTools({ auth: ['requireTodos'] })(nextConfig)
