// List of secrets that are available to the cloud functions.
// Edit them at:
// prod - https://console.cloud.google.com/security/secret-manager?project=mantic-markets
// dev - https://console.cloud.google.com/security/secret-manager?project=dev-mantic-markets
export const secrets = [
  'API_SECRET',
  'SUPABASE_KEY',
  'SUPABASE_PASSWORD',
  'MAILGUN_KEY',
  'DREAM_KEY',
  'OPENAI_API_KEY',
]
