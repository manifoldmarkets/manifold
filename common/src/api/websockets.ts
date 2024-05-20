import { z } from 'zod'

export const CLIENT_MESSAGE_SCHEMAS = {
  identify: z.object({
    type: z.literal('identify'),
    txid: z.number(),
    uid: z.string(),
  }),
  subscribe: z.object({
    type: z.literal('subscribe'),
    txid: z.number(),
    topics: z.array(z.string()),
  }),
  unsubscribe: z.object({
    type: z.literal('unsubscribe'),
    txid: z.number(),
    topics: z.array(z.string()),
  }),
  ping: z.object({
    type: z.literal('ping'),
    txid: z.number(),
  }),
} as const

export const CLIENT_MESSAGE_SCHEMA = z.union([
  CLIENT_MESSAGE_SCHEMAS.identify,
  CLIENT_MESSAGE_SCHEMAS.subscribe,
  CLIENT_MESSAGE_SCHEMAS.unsubscribe,
  CLIENT_MESSAGE_SCHEMAS.ping,
])

export const SERVER_MESSAGE_SCHEMAS = {
  ack: z.object({
    type: z.literal('ack'),
    txid: z.number().optional(),
    success: z.boolean(),
    error: z.string().optional(),
  }),
  broadcast: z.object({
    type: z.literal('broadcast'),
    topic: z.string(),
    data: z.record(z.unknown()),
  }),
}

export const SERVER_MESSAGE_SCHEMA = z.union([
  SERVER_MESSAGE_SCHEMAS.ack,
  SERVER_MESSAGE_SCHEMAS.broadcast,
])

export type ClientMessageType = keyof typeof CLIENT_MESSAGE_SCHEMAS
export type ClientMessage<T extends ClientMessageType = ClientMessageType> =
  z.infer<(typeof CLIENT_MESSAGE_SCHEMAS)[T]>

export type ServerMessageType = keyof typeof SERVER_MESSAGE_SCHEMAS
export type ServerMessage<T extends ServerMessageType = ServerMessageType> =
  z.infer<(typeof SERVER_MESSAGE_SCHEMAS)[T]>
