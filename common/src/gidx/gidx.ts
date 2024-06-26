import { z } from 'zod'

export const GIDX_REGISTATION_ENABLED = false
export const GIDX_DOCUMENTS_REQUIRED = 2

export const GPSProps = z.object({
  Latitude: z.number(),
  Longitude: z.number(),
  Radius: z.number(),
  Altitude: z.number(),
  Speed: z.number(),
  DateTime: z.string(),
})

export const verificationParams = z.object({
  FirstName: z.string(),
  LastName: z.string(),
  DeviceGPS: GPSProps,
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
  DocumentNotes: DocumentNote[]
}

export type DocumentNote = {
  AuthorName: string
  NoteText: string
  DateTime: string
}

export type GPSData = {
  Radius: number
  Altitude: number
  Latitude: number
  Longitude: number
  Speed: number
  DateTime: string
}

export const idNameToCategoryType = {
  'Drivers License': 2,
  Passport: 3,
  'Military Id': 4,
  'Government Photo Id': 5,
  'Student Photo Id': 6,
  'Utility Bill': 7,
  Other: 1,
}

export type GIDXCustomerProfile = {
  MerchantCustomerID: string
  ReasonCodes: string[]
  ProfileVerificationStatus: string
  FraudConfidenceScore: number
  IdentityConfidenceScore: number
  ResponseCode: number
  ResponseMessage: string
  // There are many more at https://www.tsevo.com/Docs/CustomerIdentity
}

export type GIDXRegistrationResponse = {
  MerchantCustomerID: string
  ReasonCodes: string[]
  WatchChecks: WatchCheckType[]
  ProfileMatch: ProfileMatchType
  IdentityConfidenceScore: number
  FraudConfidenceScore: number
  CustomerRegistrationLink: string
  LocationDetail: LocationDetailType
  ResponseCode: number
  ResponseMessage: string
  ProfileMatches: ProfileMatchType[]
}

type WatchCheckType = {
  SourceCode: string
  SourceScore: number
  MatchResult: boolean
  MatchScore: number
}

type ProfileMatchType = {
  NameMatch: boolean
  AddressMatch: boolean
  EmailMatch: boolean
  IdDocumentMatch: boolean
  PhoneMatch: boolean
  MobilePhoneMatch: boolean
  DateOfBirthMatch: boolean
  CitizenshipMatch: boolean
}

type LocationDetailType = {
  Latitude: number
  Longitude: number
  Radius: number
  Altitude: number
  Speed: number
  LocationDateTime: string
  LocationStatus: number
  LocationServiceLevel: string
  ReasonCodes: string[]
  ComplianceLocationStatus: boolean
  ComplianceLocationServiceStatus: string
  IdentifierType: string
  IdentifierUsed: string
}

export type GIDXMonitorResponse = {
  MerchantCustomerID: string
  ReasonCodes: string[]
  WatchChecks: WatchCheckType[]
  ProfileVerificationStatus: string
  IdentityConfidenceScore: number
  FraudConfidenceScore: number
  LocationDetail: LocationDetailType
  ResponseCode: number
  ResponseMessage: string
}

export const ID_ERROR_MSG =
  'Registration failed, identity error. Check your identifying information.'

export const exampleCustomers = [
  {
    EmailAddress: 'mradamgibbs@gmail.com',
    MobilePhoneNumber: '5785785789',
    DeviceIpAddress: '194.207.197.157',
    FirstName: 'Adam',
    LastName: 'Gibbs',
    DateOfBirth: '01/11/1979',
    CitizenshipCountryCode: 'GB',
    IdentificationTypeCode: 2,
    IdentificationNumber: '123456789',
    AddressLine1: '133 Hall Road',
    City: 'Hull',
    StateCode: '',
    PostalCode: 'Hu6 8qj',
    DeviceGPS: {
      Latitude: 53.744339,
      Longitude: -0.33244,
      Radius: 11.484,
      Altitude: 0,
      Speed: 0,
      DateTime: new Date().toISOString(),
    },
  },
  {
    EmailAddress: 'gochanman@yahoo.com',
    MobilePhoneNumber: '4042818372',
    DeviceIpAddress: '24.147.127.6',
    FirstName: 'Corey',
    LastName: 'Chandler',
    DateOfBirth: '09/28/1987',
    CitizenshipCountryCode: 'US',
    IdentificationTypeCode: 2,
    IdentificationNumber: '123456789',
    AddressLine1: '66 Forest Street',
    City: 'Reading',
    StateCode: 'MA',
    PostalCode: '01867',
    DeviceGPS: {
      // utah (blocked):
      // Latitude: 40.7608,
      // Longitude: -111.891,
      Latitude: 39.615342,
      Longitude: -112.183449,
      Radius: 11.484,
      Altitude: 0,
      Speed: 0,
      DateTime: new Date().toISOString(),
    },
  },
  {
    EmailAddress: 'andsief123@yahoo.com',
    MobilePhoneNumber: '4042818372',
    DeviceIpAddress: '73.16.248.173',
    FirstName: 'Andrew',
    LastName: 'Siegfried',
    DateOfBirth: '01/27/1978',
    CitizenshipCountryCode: 'US',
    IdentificationTypeCode: 2,
    IdentificationNumber: '123456789',
    AddressLine1: '321 Greenwood Lane',
    City: 'Williston',
    StateCode: 'VT',
    PostalCode: '05495',
    DeviceGPS: {
      // utah (blocked):
      // Latitude: 40.7608,
      // Longitude: -111.891,
      Latitude: 44.064107,
      Longitude: -72.545022,
      Radius: 11.484,
      Altitude: 0,
      Speed: 0,
      DateTime: new Date().toISOString(),
    },
  },
]
