import { z } from 'zod'

export const GIDX_REGISTATION_ENABLED = false

export const verificationParams = z.object({
  FirstName: z.string(),
  LastName: z.string(),
  DeviceGPS: z.object({
    Latitude: z.number(),
    Longitude: z.number(),
    Radius: z.number(),
    Altitude: z.number(),
    Speed: z.number(),
    DateTime: z.string(),
  }),
  DateOfBirth: z.string(),
  CitizenshipCountryCode: z.string(),
  // Must supply address or ID info
  AddressLine1: z.string().optional(),
  AddressLine2: z.string().optional(),
  City: z.string().optional(),
  StateCode: z.string().optional(),
  PostalCode: z.string().optional(),
  CountryCode: z.string().optional(),
  IdentificationTypeCode: z.number().gte(1).lte(4).optional(),
  IdentificationNumber: z.string().optional(),
  // TODO: remove these in production
  DeviceIpAddress: z.string(),
  EmailAddress: z.string(),
  MerchantCustomerID: z.string(),
})

export type GIDXVerificationResponse = {
  ReasonCodes: string[]
  SessionID: string
  SessionURL: string
  SessionExpirationTime: string
}

export type DocumentRegistrationResponse = {
  ResponseCode: number
  ResponseMessage: string
  MerchantCustomerID: string
  Document: GIDXDocument
}
export type GIDXDocument = {
  DocumentID: string
  CategoryType: number
  DocumentStatus: number
  FileName: string
  FileSize: number
  DateTime: string
  DocumentNotes: {
    AuthorName: string
    NoteText: string
    DateTime: string
  }[]
}

export type GPSData = {
  Radius: number
  Altitude: number
  Latitude: number
  Longitude: number
  Speed: number
  DateTime: string
}
