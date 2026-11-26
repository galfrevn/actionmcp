import { withAgentTools } from 'actionmcp/config'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = { agentRules: false }

export default withAgentTools()(nextConfig)
