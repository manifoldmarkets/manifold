#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js'
import { API } from 'common/api/schema'
import { NON_POINTS_BETS_LIMIT } from 'common/supabase/bets'
import { Request, Response } from 'express'
import { log, metrics } from 'shared/utils'
import { z } from 'zod'
import { getBets } from './get-bets'
import { getMarket } from './get-market'
import { getUser } from './get-user'
import { searchMarketsLite } from './search-contracts'

function getServer(): Server {
  const server = new Server(
    {
      name: 'manifold-markets',
      version: '0.2.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  )

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'search-markets',
        description: 'Search for prediction markets with optional filters',
        inputSchema: {
          type: 'object',
          properties: {
            term: { type: 'string', description: 'Search query' },
            contractType: {
              type: 'string',
              enum: [
                'ALL',
                'BINARY',
                'MULTIPLE_CHOICE',
                'POLL',
                'MULTI_NUMERIC',
                'DATE',
              ],
              description: 'Question type (default: ALL)',
            },
            filter: {
              type: 'string',
              enum: ['open', 'resolved', 'all'],
              description:
                'Filter by question state. Resolved means the event has happened. (default: all)',
            },
            limit: {
              type: 'number',
              minimum: 1,
              maximum: 1000,
              description: 'Max number of results (default: 100)',
            },
            offset: {
              type: 'number',
              description: 'Offset for pagination (default: 0)',
            },
            creatorId: {
              type: 'string',
              description: 'Optional. Creator (user) ID to filter by',
            },
            sort: {
              type: 'string',
              enum: ['newest', 'score', 'liquidity'],
              description: 'Sort order (default: score)',
            },
          },
          required: ['term'],
        },
      },
      {
        name: 'get-market',
        description: 'Get detailed information about a specific market',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Market ID' },
          },
          required: ['id'],
        },
      },
      {
        name: 'get-user',
        description: 'Get user information by username',
        inputSchema: {
          type: 'object',
          properties: {
            username: { type: 'string', description: 'Username' },
          },
          required: ['username'],
        },
      },
      {
        name: 'get-bets',
        description:
          'Get bets from markets or for users with various filtering options',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Optional. Bet ID to filter by',
            },
            userId: {
              type: 'string',
              description: 'Optional. User ID to filter by',
            },
            username: {
              type: 'string',
              description: 'Optional. Username to filter by',
            },
            contractId: {
              oneOf: [
                { type: 'string' },
                { type: 'array', items: { type: 'string' } },
              ],
              description: 'Optional. Contract ID(s) to filter by',
            },
            contractSlug: {
              type: 'string',
              description: 'Optional. Contract slug to filter by',
            },
            answerId: {
              type: 'string',
              description: 'Optional. Answer ID to filter by',
            },
            limit: {
              type: 'number',
              minimum: 0,
              maximum: NON_POINTS_BETS_LIMIT,
              description: 'Optional. Number of bets to return (default: 1000)',
            },
            before: {
              type: 'string',
              description: 'Optional. Get bets before this bet ID',
            },
            after: {
              type: 'string',
              description: 'Optional. Get bets after this bet ID',
            },
            beforeTime: {
              type: 'number',
              description: 'Optional. Get bets before this timestamp',
            },
            afterTime: {
              type: 'number',
              description: 'Optional. Get bets after this timestamp',
            },
            order: {
              type: 'string',
              enum: ['asc', 'desc'],
              description: 'Optional. Sort order by creation time',
            },
            kinds: {
              type: 'string',
              enum: ['open-limit'],
              description: 'Optional. Filter by bet kind',
            },
            minAmount: {
              type: 'number',
              minimum: 0,
              description: 'Optional. Minimum bet amount',
            },
            filterRedemptions: {
              type: 'boolean',
              description: 'Optional. Filter redemptions',
            },
          },
          required: [],
        },
      },
    ],
  }))

  // Handle tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    metrics.inc('mcp/request_count', { name })
    try {
      switch (name) {
        case 'search-markets': {
          const params = API['search-markets'].props.parse(args)

          // Map the params to match the search-markets API schema
          const searchParams = {
            term: params.term,
            limit: params.limit,
            filter: params.filter,
            sort: params.sort,
            contractType: params.contractType,
            offset: params.offset,
            token: 'MANA' as const,
            forYou: '0' as const,
            isPrizeMarket: '0' as const,
            includeLiteAnswers: true,
          }

          try {
            const markets = await searchMarketsLite(
              searchParams,
              undefined, // auth not required for this endpoint
              {} as Request // minimal request object since it's not used
            )
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(markets, null, 2),
                },
              ],
            }
          } catch (error: any) {
            throw new McpError(
              ErrorCode.InternalError,
              `Search markets error: ${error.message}`
            )
          }
        }

        case 'get-market': {
          const { id } = API['market/:id'].props.parse(args)

          try {
            const market = await getMarket({ id })
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(market, null, 2),
                },
              ],
            }
          } catch (error: any) {
            throw new McpError(
              ErrorCode.InternalError,
              `Get market error: ${error.message}`
            )
          }
        }

        case 'get-user': {
          const { username } = API['user/:username'].props.parse(args)

          try {
            const user = await getUser({ username })
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(user, null, 2),
                },
              ],
            }
          } catch (error: any) {
            throw new McpError(
              ErrorCode.InternalError,
              `Get user error: ${error.message}`
            )
          }
        }

        case 'get-bets': {
          const params = API.bets.props.parse(args)

          try {
            const bets = await getBets(
              params,
              undefined, // auth not required for this endpoint
              {} as Request // minimal request object since it's not used
            )
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(bets, null, 2),
                },
              ],
            }
          } catch (error: any) {
            throw new McpError(
              ErrorCode.InternalError,
              `Get bets error: ${error.message}`
            )
          }
        }

        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`)
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid parameters: ${error.errors
            .map((e) => `${e.path.join('.')}: ${e.message}`)
            .join(', ')}`
        )
      }
      throw error
    }
  })

  return server
}

export const handleMcpRequest = async (req: Request, res: Response) => {
  try {
    const server = getServer()
    const transport: StreamableHTTPServerTransport =
      new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      })
    res.on('close', () => {
      transport.close()
      server.close()
    })
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  } catch (error) {
    log.error('Error handling MCP request:', { error })
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      })
    }
  }
}
