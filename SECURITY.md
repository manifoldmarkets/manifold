# Security policy

## Reporting a vulnerability

Please report security issues by emailing **info@manifold.markets** with the
subject line prefixed `[security]`. We will acknowledge receipt within 3
business days.

Please do not open public GitHub issues, post to Discord, or otherwise
disclose vulnerabilities publicly until we've had a chance to investigate
and ship a fix. We may ask that you give us up to 90 days to address the 
issue before public disclosure.

When reporting, please include:

- A description of the issue and its impact
- Steps to reproduce or a proof-of-concept
- Any suggested mitigations you've identified

## Development

If you are doing security research that may impact other users of the site,
please utilize our dev instance at https://dev.manifold.markets/ instead of
the production instance. Disruption to the prod instance may be grounds for 
an account ban even if the research is otherwise legitimate.

## Scope

In scope:

- The Manifold web app at https://manifold.markets/
- The Manifold production API at https://api.manifold.markets/

Out of scope:

- Issues solely present on the dev instance
- Reports that require physical access to a user's device
- Social engineering of Manifold staff or users
- Denial-of-service attacks (please don't run them)
- Issues in third-party services we depend on (Vercel, Supabase, Firebase, etc.)

## Acknowledgement

We don't currently run a formal bug bounty program, but we appreciate
disclosures and are happy to credit reporters if they'd like. We may also 
grant a mana bounty on-site for helpful reports, with up to 10,000 mana for
severe issues.
