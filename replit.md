# BukkaPay

## Overview

BukkaPay is a modern mobile wallet application that enables users to manage money through smart budgeting cards and fast P2P payments. The application provides features including wallet management, QR code payments, money transfers, merchant services, loyalty rewards, spending analytics, payment links with business branding, invoicing, and **Send Money to Anyone** (claim-based payments with PIN security, bank/wallet/cash pickup, and escrow).

The project has been converted from a React web app to a **React Native (Expo)** mobile app with an Express.js backend API and PostgreSQL database.

## User Preferences

Preferred communication style: Simple, everyday language.

## Project Structure

```
/
├── frontend/          # React Native (Expo) mobile app
│   ├── app/           # Expo Router file-based routes
│   │   ├── _layout.tsx        # Root layout with auth context
│   │   ├── index.tsx          # Entry point (auth redirect)
│   │   ├── (auth)/            # Auth screens (login, signup)
│   │   ├── (tabs)/            # Bottom tab navigation (5 tabs)
│   │   │   ├── _layout.tsx    # Tab bar config
│   │   │   ├── index.tsx      # Home/Dashboard
│   │   │   ├── cards.tsx      # Wallet Cards
│   │   │   ├── scan.tsx       # QR Scanner
│   │   │   ├── transfer.tsx   # Send Money
│   │   │   └── profile.tsx    # Profile/Settings
│   │   ├── (screens)/         # Stack screens (detail pages)
│   │   ├── pages/             # Page components
│   │   ├── components/        # Reusable UI components
│   │   ├── lib/               # Utilities (auth, api, config, queryClient)
│   │   └── hooks/             # Custom React hooks
│   ├── assets/                # Images and static files
│   ├── app.json               # Expo config
│   ├── package.json           # Frontend dependencies
│   └── tsconfig.json          # TypeScript config
│
├── backend/           # Express.js TypeScript API server
│   ├── src/           # All TypeScript source files
│   │   ├── index.ts           # Server entry point
│   │   ├── routes.ts          # API route definitions
│   │   ├── storage.ts         # Database access layer (repository pattern)
│   │   ├── auth.ts            # Authentication logic (crypto-based)
│   │   ├── stripe-client.ts   # Stripe client setup
│   │   ├── stripe-service.ts  # Stripe service logic
│   │   ├── stripe-webhooks.ts # Stripe webhook handlers
│   │   ├── supabase.ts        # Supabase client
│   │   ├── seed.ts            # Database seeder
│   │   ├── db/
│   │   │   └── index.ts       # Drizzle/PostgreSQL connection
│   │   └── shared/
│   │       └── schema.ts      # Database schema + Zod types
│   ├── dist/                  # Compiled output (Railway deploy)
│   ├── package.json           # Backend dependencies + scripts
│   └── tsconfig.json          # TypeScript config (CommonJS, rootDir=src)
```

## System Architecture

### Frontend Architecture (Mobile)

**Technology Stack:**
- React Native with Expo SDK
- Expo Router for file-based navigation
- TypeScript
- StyleSheet.create() for all styling
- TanStack Query (React Query) for server state management
- AsyncStorage for local auth token persistence
- @expo/vector-icons (Ionicons) for icons

**Navigation:**
- 5 bottom tabs: Home, Cards/Wallet, Scan (center button), Transfer, Profile
- Auth flow: Login/Signup screens with token-based auth
- Stack navigation for detail screens

**Color Scheme:**
- Primary: #7C3AED (purple)
- Background: #FFFFFF
- Card: #F8F9FA
- Text: #1A1A2E
- Muted: #6B7280
- Border: #E5E7EB
- Success: #10B981
- Danger: #EF4444

**API Configuration:**
- `frontend/app/lib/config.ts` - API_BASE URL configuration
- Uses EXPO_PUBLIC_API_URL env var or defaults to deployed backend URL

### Backend Architecture

**Technology Stack:**
- Express.js with TypeScript
- PostgreSQL database with Drizzle ORM
- CORS enabled for mobile app access
- Zod for schema validation (integrated with Drizzle via drizzle-zod)

**API Design:**
- RESTful endpoints under `/api/` prefix
- Token-based authentication using Bearer tokens
- In-memory session management
- API-only server (no static file serving)

**Database Schema:**
The PostgreSQL database includes tables for:
- Users (with wallet IDs, loyalty points)
- Wallet cards (budgeting cards with balances)
- Transactions
- Contacts
- Payment requests
- Merchants and merchant transactions
- Loyalty rewards, challenges, achievements
- Properties, units, tenants, rent_payments (rental system)
- Gift cards (personalized gift cards with unique codes)
- Contribution groups and contributions (crowdfunding/fundraising)
- Purchase transactions
- Various other payment and social features

### Build and Development

**Development:**
- Backend: `cd backend && PORT=3000 npm run dev` → `tsx watch src/index.ts` on port 3000
- Frontend: `cd frontend && npx expo start --web --port 5000` on port 5000

**Workflows:**
- "Start application" - Frontend Expo web (port 5000, webview)
- "Backend API" - Backend Express API (port 3000, console)

**Backend Build for Production (Railway):**
- `cd backend && npm run build` → `tsc --skipLibCheck`
- Output: `backend/dist/` (CommonJS, rootDir=src)
- Start: `node dist/index.js`
- Required env vars: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `STRIPE_SECRET_KEY`

**Path Aliases (Backend):**
- `@shared/*` maps to `backend/src/shared/*` (baseUrl=./src)
- TypeScript: module=CommonJS, rootDir=./src, skipLibCheck=true

## External Dependencies

### Database
- **PostgreSQL** - Primary data store
- **Drizzle ORM** - Database toolkit with type-safe queries
- Connection via `DATABASE_URL` environment variable with SSL required

### Supabase
- **@supabase/supabase-js** - Supabase client library
- Server client: `backend/server/supabase.ts` - uses `SUPABASE_URL` and `SUPABASE_ANON_KEY` secrets

### Payment Processing
- **Stripe** - Payment processing integration
- Uses `stripe-replit-sync` for schema migrations and webhook management
- Webhook handling for real-time payment events

### Frontend Libraries (Mobile)
- **Expo** - React Native development platform
- **Expo Router** - File-based navigation
- **@expo/vector-icons** - Icon library (Ionicons)
- **@tanstack/react-query** - Server state management
- **@react-native-async-storage/async-storage** - Local storage
- **expo-camera** - QR code scanning with animated scan line
- **react-native-qrcode-svg** - QR code generation (user + merchant payment codes)

### Theme System (Dark Mode)
- **lib/theme.ts** - Light/dark color palettes with semantic tokens
- **lib/ThemeContext.tsx** - React Context wrapping useDarkMode, used throughout the app
- Dark mode toggle is on the Profile page and persists via AsyncStorage
- AppBar, tabs nav, home page, buy page, profile page all respect dark mode
- Merchant QR code dialog: replaced icon placeholder with real react-native-qrcode-svg QR card
- Marketplace: "Hot Deals" horizontal deals strip, theme-aware product cards

### Development Tools
- **tsx** - TypeScript execution for backend
- **esbuild** - Server bundling for production
- **drizzle-kit** - Database migration tooling
