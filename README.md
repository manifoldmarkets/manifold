<div align="center">

<img src="web/public/sumcoin-logo.png" width="128" alt="Sumcoin Logo">

# SAGE

### Sumcoin Aggregated Group Expectations

**A Sumcoin-native prediction market platform**

[![Sumcoin](https://img.shields.io/badge/Sumcoin-SUM-0878FF?style=for-the-badge)](https://www.sumcoin.org)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=000000)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Ready-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)

**SAGE brings prediction markets into the Sumcoin ecosystem with a fast, responsive interface and a planned Sumcoin-backed accounting layer.**

</div>

---

## Overview

**SAGE** is an open-source prediction market platform being developed by **Sumcoin Labs** for the Sumcoin ecosystem.

The name stands for:

> **S**umcoin **A**ggregated **G**roup **E**xpectations

The name describes the underlying idea of a prediction market: combining the expectations of many participants into a continuously changing probability or market outcome.

The word **sage** also carries a secondary meaning associated with knowledge, judgment, forecasting, and foresight.

SAGE is being designed to provide a modern interface where users can participate in markets using **Sumcoin and Sumtoshi-denominated balances**.

---

## Development Status

SAGE is currently under active development.

The interface can already run locally and includes a substantial set of market, account, search, social, moderation, and administrative features.

The next major development phase is focused on creating a completely independent SAGE infrastructure and then integrating real Sumcoin accounting.

Production Sumcoin custody, deposits, withdrawals, and final financial settlement infrastructure are **not yet enabled**.

---

## Core Goals

SAGE is being built around several principles:

- Fast market discovery
- Simple market participation
- Sumcoin-native utility
- Sumtoshi-denominated balances
- Responsive desktop and mobile interfaces
- Clear market probabilities
- Secure financial accounting
- Auditable transaction history
- Strong administrative controls
- Strong moderation tools
- Self-hostable infrastructure
- Open-source components where practical
- Clear separation between public web services and wallet infrastructure

---

## Sumtoshi's

SAGE uses **Sumtoshi's** as the user-facing denomination for small-value activity.

Rather than forcing users to reason about very small decimal fractions of SUM, markets and account balances can be presented using Sumtoshi's.

Example onboarding language:

> To Get
> **5,000 Sumtoshi's**
> and start trading!

Examples of user-facing terminology include:

- Sumtoshi's balance
- Get Sumtoshi's
- Earn Sumtoshi's
- Spend Sumtoshi's
- Sumtoshi's transactions
- Sumtoshi's trading
- Sumtoshi's rewards
- Sumtoshi's market positions

The long-term accounting system should store financial values as integer units rather than floating-point values.

---

## Current Interface

The current SAGE interface includes functionality for:

- Prediction market discovery
- Search
- Topic navigation
- Category filtering
- Market sorting
- Binary markets
- Multiple-choice markets
- Numeric markets
- Probability displays
- Market detail pages
- User profiles
- Comments
- Social interaction
- Market creation
- Market activity
- User positions
- Responsive mobile layouts
- Administrative interfaces
- User management
- Market management
- Moderation
- Reports
- Platform controls
- Analytics-related administration

---

## SAGE Visual Identity

The interface has been redesigned around the Sumcoin visual identity.

The current design uses:

- Official Sumcoin logo
- Deep navy application backgrounds
- Near-black blue surfaces
- Sumcoin royal blue
- Electric blue accents
- Cyan highlights
- White primary text
- Muted blue secondary text
- Blue structural borders
- Blue gradient action buttons
- Distinct navigation surfaces
- Redesigned market cards
- Redesigned search controls
- Redesigned filter controls

The goal is to create a modern financial and cryptocurrency-oriented application rather than a generic social interface.

---

## Official Sumcoin Branding

The official Sumcoin logo is stored at:

    web/public/sumcoin-logo.png

It is used throughout the SAGE interface as the primary product and currency mark.

The application branding includes:

- Sumcoin logo
- SAGE wordmark
- Sumcoin browser icon
- Sumcoin currency artwork
- Sumcoin navigation identity
- Sumcoin blue color system

---

## Interface Redesign

SAGE includes a number of layout and visual changes intended to establish a distinct product identity.

### Sidebar

The desktop sidebar uses:

- Dedicated navy gradient
- Electric-blue accents
- Larger navigation targets
- Increased spacing
- Rounded navigation elements
- Distinct active-page state
- Blue icon surfaces
- Revised hover behavior
- Stronger content separation

### Main Content

The desktop content area has been expanded to make better use of available screen width.

Changes include:

- Wider market content
- Increased horizontal padding
- Increased vertical spacing
- Reduced unused space
- Clear separation between navigation and content
- Responsive spacing at different viewport sizes

### Search

The search interface includes:

- Larger search field
- Sumcoin blue border
- Electric-blue focus state
- Dark blue background
- Rounded geometry
- Dedicated search surface
- Improved grouping with market filters

### Filters

Market filters use:

- Electric-blue selected state
- Dark-blue inactive state
- White selected text
- Stronger visual hierarchy
- Rounded rectangular controls
- Improved hover states

### Market Feed

Individual markets are presented as separate visual cards rather than appearing as one continuous flat list.

Market cards include:

- Rounded surfaces
- Dark blue gradients
- Subtle borders
- Increased spacing
- Blue hover states
- Focus states
- Accent edges
- Subtle elevation

### Buttons

Primary actions use a Sumcoin-specific gradient incorporating:

- Deep blue
- Electric blue
- Cyan

---

## Responsive Design

SAGE is designed to remain usable across desktop, tablet, and mobile layouts.

Responsive behavior includes:

- Desktop sidebar hidden appropriately on smaller displays
- Main content expands to available mobile width
- Reduced mobile padding
- Fluid market cards
- Responsive search controls
- Responsive filters
- Existing mobile navigation behavior
- Desktop-specific layout changes activated only at larger breakpoints

The interface has been tested by resizing the development browser through desktop and mobile-style widths.

Additional physical-device testing will continue throughout development.

---

## Architecture

SAGE is organized as a TypeScript monorepo.

The long-term architecture is intended to remain relatively simple while maintaining a strong security boundary around Sumcoin infrastructure.

    ┌─────────────────────────┐
    │       SAGE Client       │
    │     Next.js / React     │
    └────────────┬────────────┘
                 │
                 │ HTTPS
                 ▼
    ┌─────────────────────────┐
    │        SAGE API         │
    │      Node / Express     │
    └────────────┬────────────┘
                 │
         ┌───────┼───────────────┐
         │       │               │
         ▼       ▼               ▼
    PostgreSQL  Cache      Market Engine
       │
       │ Reconciliation
       ▼
    ┌─────────────────────────┐
    │    Sumcoin Service      │
    │    Sumcoin Core RPC     │
    └─────────────────────────┘

---

## Security Boundary

Sumcoin Core RPC should never be exposed directly to browsers or the public internet.

The intended flow is:

    Browser
       ↓
    Authenticated SAGE API
       ↓
    Server-side validation
       ↓
    PostgreSQL ledger transaction
       ↓
    Restricted wallet service
       ↓
    Sumcoin Core

Public clients should never have permission to directly:

- Increase balances
- Decrease balances
- Modify account balances
- Create unauthorized withdrawals
- Modify market settlements
- Change escrow balances
- Modify transaction history
- Access private keys
- Access wallet credentials
- Access Sumcoin RPC

---

## Repository Structure

The project is organized into several major areas:

    .
    ├── web/
    ├── common/
    ├── client-common/
    ├── backend/
    │   ├── api/
    │   ├── scheduler/
    │   ├── scripts/
    │   ├── shared/
    │   └── supabase/
    ├── native/
    ├── docs/
    ├── scripts/
    └── package.json

### `web/`

The primary Next.js and React web application.

Contains:

- Market interface
- Navigation
- Search
- User profiles
- Market pages
- Administrative pages
- Authentication UI
- Responsive components
- SAGE styling
- Sumcoin branding

### `common/`

Shared application logic.

Contains reusable:

- Types
- Market logic
- Market mathematics
- Utilities
- Environment configuration
- Shared constants

### `client-common/`

Shared client-side code used by application interfaces.

### `backend/api/`

Server-side API implementation.

This area is expected to become increasingly important as SAGE transitions to server-authoritative Sumcoin accounting.

### `backend/scheduler/`

Scheduled and recurring backend operations.

### `backend/scripts/`

Backend administration and maintenance utilities.

### `backend/shared/`

Shared backend infrastructure and utilities.

### `backend/supabase/`

Database-related resources including:

- SQL
- Migrations
- Functions
- Data definitions

### `native/`

Native/mobile-related application code.

### `docs/`

Project documentation.

### `scripts/`

Repository and development utilities.

---

## Technology Stack

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- Responsive web components

### Backend

- Node.js
- Express
- TypeScript

### Data

- PostgreSQL
- SQL migrations

### Optional Infrastructure

- Redis
- Supabase-compatible tooling
- Docker
- Reverse proxy
- TLS termination

### Planned Sumcoin Layer

- Sumcoin Core
- JSON-RPC
- Deposit monitoring
- Confirmation tracking
- Sumtoshi ledger
- Withdrawal processing
- Wallet reconciliation
- Market escrow
- Settlement accounting

---

## Local Development

### Requirements

Recommended development environment:

- macOS or Linux
- Node.js 20+
- Yarn 1.x
- Git

Apple Silicon Macs are supported for frontend development.

### Install Yarn

    npm install -g yarn@1.22.22

### Install Dependencies

From the repository root:

    yarn

If working specifically inside the web application:

    cd web
    yarn

### Start the Web Application

From the `web` directory:

    yarn dev

The development interface should then be available at:

    http://localhost:3000

The development server supports hot reload, allowing most UI changes to appear automatically.

---

## Apple Silicon

SAGE has been successfully developed and run on Apple Silicon macOS.

The Next.js, React, TypeScript, and Node development environment operates normally on ARM64 Macs.

---

## Current Development Progress

### Product Identity

- [x] Establish SAGE name
- [x] Define SAGE acronym
- [x] Integrate official Sumcoin logo
- [x] Add SAGE wordmark
- [x] Update browser branding
- [x] Establish Sumcoin visual direction

### User Interface

- [x] Introduce Sumcoin navy application background
- [x] Introduce electric-blue accents
- [x] Introduce cyan highlights
- [x] Redesign desktop sidebar
- [x] Redesign navigation states
- [x] Improve navigation spacing
- [x] Expand desktop content area
- [x] Redesign search interface
- [x] Redesign market filters
- [x] Redesign primary buttons
- [x] Redesign market listings
- [x] Improve market card separation
- [x] Improve hover and focus states
- [x] Preserve responsive behavior

### Currency Presentation

- [x] Introduce Sumtoshi terminology
- [x] Introduce Sumcoin currency artwork
- [x] Update onboarding language
- [x] Begin removing user-facing legacy currency terminology
- [x] Replace primary currency artwork with Sumcoin branding

### Documentation

- [x] Rewrite project README
- [x] Add technology badges
- [x] Document project architecture
- [x] Document Sumcoin integration direction
- [x] Document security boundaries
- [x] Document development roadmap
- [x] Document planned accounting model

---

## Development Roadmap

### Phase 1: SAGE Identity

- [x] Establish SAGE branding
- [x] Integrate official Sumcoin logo
- [x] Establish Sumcoin color system
- [x] Redesign navigation
- [x] Redesign market feed
- [x] Redesign search interface
- [x] Redesign filter controls
- [x] Introduce Sumtoshi terminology
- [x] Preserve mobile responsiveness

### Phase 2: Independent Infrastructure

- [ ] Remove external production-data dependencies
- [ ] Establish local PostgreSQL environment
- [ ] Configure independent SAGE database
- [ ] Configure independent authentication
- [ ] Create local development users
- [ ] Seed local development markets
- [ ] Configure independent SAGE API
- [ ] Configure local administrative accounts
- [ ] Implement independent market search
- [ ] Implement independent market data APIs

### Phase 3: Sumtoshi Accounting

- [ ] Define canonical Sumtoshi integer representation
- [ ] Create immutable transaction ledger
- [ ] Implement server-authoritative balances
- [ ] Implement market-entry accounting
- [ ] Implement escrow accounting
- [ ] Implement settlement accounting
- [ ] Implement platform-fee accounting
- [ ] Implement balance reconciliation
- [ ] Implement transaction audit history

### Phase 4: Sumcoin Core

- [ ] Add isolated Sumcoin Core service
- [ ] Configure secure JSON-RPC
- [ ] Generate deposit addresses
- [ ] Monitor incoming transactions
- [ ] Track confirmations
- [ ] Credit confirmed deposits
- [ ] Implement withdrawals
- [ ] Implement withdrawal validation
- [ ] Implement hot-wallet limits
- [ ] Implement cold-wallet reserves
- [ ] Implement automated reconciliation

### Phase 5: Production Hardening

- [ ] Rate limiting
- [ ] API abuse protection
- [ ] Administrative role separation
- [ ] Audit logging
- [ ] Withdrawal limits
- [ ] Withdrawal approval thresholds
- [ ] Automated database backups
- [ ] Wallet backups
- [ ] Monitoring
- [ ] Alerting
- [ ] Application isolation
- [ ] Wallet isolation
- [ ] Security review
- [ ] Load testing
- [ ] Failure-recovery testing
- [ ] Reconciliation testing

---

## Planned Sumtoshi Ledger

Once real SUM is enabled, SAGE should use an auditable internal transaction ledger.

A conceptual user history might look like:

    DEPOSIT          +50,000 Sumtoshi's
    MARKET_ENTRY      -5,000 Sumtoshi's
    ESCROW            +5,000 Sumtoshi's
    SETTLEMENT        +8,750 Sumtoshi's
    PLATFORM_FEE        +250 Sumtoshi's
    WITHDRAWAL        -4,000 Sumtoshi's

Every balance-changing operation should be:

1. Authenticated
2. Authorized
3. Validated server-side
4. Written atomically
5. Auditable
6. Reconciled
7. Recoverable through compensating transactions when necessary

---

## Integer Accounting

Financial values should ultimately be represented using integer Sumtoshi units.

Floating-point arithmetic should not be used as the authoritative representation of customer funds.

The long-term design should derive balances from financial records rather than relying exclusively on arbitrary mutable balance values.

This improves:

- Precision
- Reconciliation
- Auditing
- Error detection
- Financial consistency

---

## Deposits

The planned deposit flow is:

    User requests deposit address
             ↓
    SAGE assigns Sumcoin address
             ↓
    SUM transaction appears
             ↓
    Sumcoin Core detects transaction
             ↓
    Required confirmations are reached
             ↓
    Ledger records deposit
             ↓
    User receives Sumtoshi's balance

Deposits should not be credited based solely on unconfirmed transactions.

---

## Withdrawals

The planned withdrawal flow is:

    User submits withdrawal
             ↓
    SAGE validates authentication
             ↓
    SAGE validates available balance
             ↓
    Ledger reserves withdrawal amount
             ↓
    Withdrawal policy checks run
             ↓
    Wallet service creates transaction
             ↓
    Sumcoin Core broadcasts transaction
             ↓
    Ledger records transaction ID
             ↓
    Withdrawal status updates

Additional controls may include:

- Withdrawal limits
- Rate limiting
- Address validation
- Administrative thresholds
- Delayed high-value withdrawals
- Risk controls

---

## Sumcoin Wallet Security

The wallet layer should remain isolated from the public application.

Recommended production principles include:

- No public Sumcoin RPC port
- RPC limited to trusted backend services
- Separate application and wallet credentials
- Limited hot-wallet balances
- Cold-storage reserves
- Withdrawal rate limits
- Administrative withdrawal thresholds
- Continuous liability reconciliation
- Encrypted backups
- Monitoring
- Audit logs
- Restricted server access

---

## Reserve and Liability Reconciliation

Once real SUM is introduced, the system should continuously compare:

    Sumcoin reserves

against:

    Total customer SUM liabilities

The system should be able to independently determine whether sufficient SUM exists to satisfy customer balances and pending obligations.

Reconciliation should cover:

- User balances
- Open positions
- Escrow
- Pending withdrawals
- Settlements
- Platform balances
- Confirmed deposits

---

## Market Types

SAGE is intended to support multiple market structures.

### Binary Markets

Example:

> Will Bitcoin close above $150,000 on December 31?

Possible outcomes:

- YES
- NO

### Multiple Choice Markets

Example:

> Which company will have the largest market capitalization at the end of the year?

Possible outcomes can be defined when the market is created.

### Numeric Markets

Example:

> What will the CPI reading be next month?

Numeric markets allow participants to express probability across a numerical outcome.

Additional market structures may be introduced as SAGE evolves.

---

## Market Settlement

Market settlement will eventually integrate directly with the Sumtoshi ledger.

A settlement process must correctly:

- Determine the final market outcome
- Close the market
- Finalize losing positions
- Credit winning positions
- Release escrow
- Record platform fees
- Create permanent ledger entries
- Preserve an audit trail

Settlement logic must remain server-authoritative.

---

## Market Resolution

SAGE is intended for markets with objectively resolvable outcomes.

Resolution sources and procedures should be clearly defined when appropriate.

Potential resolution mechanisms may include:

- Administrator resolution
- Trusted data sources
- External APIs
- Defined public records
- Automated oracle systems
- Community or dispute mechanisms

The final resolution architecture will evolve alongside the independent backend.

---

## Internal Currency Migration

The user-facing interface is being migrated to Sumcoin and Sumtoshi terminology before the internal accounting implementation is replaced.

This is intentional.

Existing internal identifiers may temporarily remain when they are connected to:

- Balance calculations
- Database structures
- API requests
- Market logic
- Transaction records
- Existing conversion logic
- Constants
- Legacy internal models

Examples may include identifiers such as:

- `manaBalance`
- `ManaCoin`
- `mana_purchases`
- `CASH_TO_MANA_CONVERSION_RATE`

These should not be blindly renamed.

A global search-and-replace could introduce errors into:

- API payloads
- Database queries
- Shared types
- Financial calculations
- Market logic
- Migration history
- Existing integrations

The migration strategy is therefore:

1. Replace user-facing currency terminology
2. Replace user-facing currency artwork
3. Establish Sumtoshi display behavior
4. Establish independent backend infrastructure
5. Implement Sumtoshi ledger
6. Integrate Sumcoin Core
7. Systematically migrate remaining internal currency identifiers

---

## Administration

The codebase includes substantial administrative functionality that can be adapted for SAGE operations.

Administrative areas include capabilities related to:

- User management
- Market management
- Market creation
- Reports
- Moderation
- Transaction views
- Platform controls
- Analytics
- User lookup
- Account management
- Payout-related workflows
- Operational tools

These interfaces provide a useful foundation for the future independent SAGE backend.

---

## Administrative Security

Administrative authorization must ultimately be enforced by the server.

Hiding administrative interfaces in the browser is not sufficient security.

Production administrative operations should require:

- Authenticated identity
- Server-side role validation
- Authorization checks
- Secure API requests
- Audit logging
- Appropriate privilege separation

Sensitive financial operations may require stronger controls than ordinary moderation operations.

---

## Authentication

The independent SAGE infrastructure will require its own authentication system.

Authentication should eventually support:

- Secure account creation
- Secure login
- Session management
- Password or identity-provider security
- Administrative roles
- Account recovery
- Abuse controls
- Session invalidation

Financial authorization should always occur on the server.

---

## Database Direction

PostgreSQL is the preferred primary datastore for the independent SAGE infrastructure.

The database is expected to contain records for areas such as:

- Users
- Markets
- Market outcomes
- Positions
- Transactions
- Ledger entries
- Deposits
- Withdrawals
- Comments
- Reports
- Administrative actions
- Resolution history
- Audit events

Financial tables should use appropriate constraints and transaction boundaries.

---

## Backend Direction

The SAGE backend is intended to provide server-authoritative operations for:

- Authentication
- Market creation
- Market trading
- Balance changes
- Ledger entries
- Settlements
- Deposits
- Withdrawals
- Administration
- Search
- Moderation

The client should be treated as an untrusted interface.

Every sensitive operation must be validated by the backend.

---

## Self-Hosting Direction

SAGE is intended to be deployable using primarily open-source infrastructure.

A future production deployment may include:

- Linux
- Docker
- Node.js
- PostgreSQL
- Redis
- Reverse proxy
- TLS
- Sumcoin Core

The exact production architecture will evolve as scalability and security requirements become clearer.

---

## Development Principles

Development should prioritize:

- Security
- Correct accounting
- Auditability
- Type safety
- Responsive design
- Mobile compatibility
- Clear server/client boundaries
- Minimal unnecessary infrastructure
- Small reviewable changes
- Predictable deployment
- Reproducible development environments

---

## Financial Development Principles

Any code handling real SUM should follow additional rules:

- Never trust client-provided balances
- Never use browser state as financial authority
- Never expose wallet credentials
- Never expose private keys
- Never expose RPC credentials
- Avoid floating-point financial accounting
- Use atomic database transactions
- Maintain immutable transaction history
- Reconcile liabilities against reserves
- Log privileged financial actions
- Validate all withdrawals server-side

---

## Security

Never commit sensitive information such as:

- Private keys
- Wallet files
- RPC usernames
- RPC passwords
- Database passwords
- API keys
- JWT secrets
- Seed phrases
- Production environment files
- Administrative credentials

Use environment configuration and secret-management systems for production credentials.

---

## Important Development Notice

SAGE is currently experimental software.

The development build should **not** be used to custody production cryptocurrency until the following systems have been implemented and reviewed:

- Independent database
- Authentication
- Financial ledger
- Market escrow
- Settlement infrastructure
- Sumcoin wallet service
- Deposit monitoring
- Withdrawal processing
- Reconciliation
- Administrative authorization
- Backup strategy
- Monitoring
- Security controls

---

## Testing

Development testing currently includes areas such as:

- Dependency installation
- Local Next.js startup
- Desktop interface rendering
- Dynamic browser resizing
- Responsive layout behavior
- Sidebar rendering
- Navigation states
- Search interface
- Market filtering
- Market-feed rendering
- Market hover states
- Market focus states
- Sumcoin logo rendering
- SAGE wordmark
- Signup interface
- Sumtoshi onboarding copy
- Dark-mode styling
- Apple Silicon macOS development

Testing will expand substantially as the independent backend and Sumcoin financial infrastructure are introduced.

---

## Future Testing

Future testing should include:

- Unit tests
- Market-math tests
- Ledger tests
- Deposit tests
- Withdrawal tests
- Settlement tests
- Double-spend scenarios
- Reconciliation tests
- Authentication tests
- Authorization tests
- Admin-security tests
- API abuse tests
- Load testing
- Failure recovery
- Database restore testing
- Wallet restore testing

---

## Contribution Guidelines

Contributions are welcome.

Before submitting substantial changes:

1. Keep changes focused where practical.
2. Document major architectural decisions.
3. Run available tests and type checks.
4. Preserve mobile compatibility.
5. Consider accounting implications for financial changes.
6. Consider security implications for backend changes.
7. Never commit secrets.
8. Avoid broad automated renames of financial identifiers without reviewing dependencies.

---

## Pull Request Guidelines

A useful pull request should explain:

- What changed
- Why it changed
- What was tested
- Whether database changes are involved
- Whether financial behavior changes
- Whether wallet behavior changes
- Whether security boundaries change
- Whether responsive behavior was tested

Financial or wallet-related pull requests should be kept separate from unrelated visual changes whenever practical.

---

## Project Roadmap Summary

The current development path is:

    SAGE Identity
          ↓
    Independent Backend
          ↓
    Independent Database
          ↓
    Authentication
          ↓
    Local Market Data
          ↓
    Sumtoshi Ledger
          ↓
    Market Escrow
          ↓
    Settlement Accounting
          ↓
    Sumcoin Core
          ↓
    Deposits
          ↓
    Withdrawals
          ↓
    Reconciliation
          ↓
    Production Hardening

---

## What Is Implemented Today

The current project includes or has begun implementing:

- SAGE identity
- Sumcoin branding
- Sumcoin visual design
- Sumtoshi terminology
- Responsive interface
- Market browsing
- Search
- Filtering
- Market presentation
- Market creation workflows
- User-facing account functionality
- Social functionality
- Administrative interfaces
- Moderation interfaces
- Development documentation

---

## What Is Not Yet Production Ready

The following should be considered future or incomplete infrastructure:

- Real SUM deposits
- Real SUM withdrawals
- Production SUM custody
- Final Sumtoshi ledger
- Final escrow accounting
- Final settlement accounting
- Independent production database
- Independent production authentication
- Production Sumcoin RPC integration
- Hot-wallet management
- Cold-wallet management
- Production reconciliation
- Production financial monitoring

---

## About Sumcoin

Sumcoin is a cryptocurrency designed around an indexed approach to digital-asset valuation.

SAGE is being developed as a Sumcoin ecosystem application intended to create additional practical transactional utility through prediction markets and collective expectations.

Learn more:

**https://www.sumcoin.org**

---

## Sumcoin Labs

SAGE is developed as part of the Sumcoin Labs ecosystem.

GitHub:

**https://github.com/sumcoinlabs**

---

## License

Refer to the repository license file for licensing terms.

---

<div align="center">

<img src="web/public/sumcoin-logo.png" width="72" alt="Sumcoin Logo">

## SAGE

### Sumcoin Aggregated Group Expectations

**Built for the Sumcoin ecosystem.**

</div>
