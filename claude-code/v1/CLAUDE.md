This file provides guidance to Claude Code (claude.ai/code) when working with this repository.
Project Overview
Frontend for a Proposal Application — a web app for creating, editing, and sending business proposals (rich text content, line items, PDF export, e-signature-ready).
Tech Stack
Framework: React 18 + TypeScript
Build Tool: Vite
Routing: React Router
Styling: Tailwind CSS + shadcn/ui (Radix-based components)
Server State: TanStack Query (React Query)
Client State: Zustand
Forms: React Hook Form + Zod
Rich Text Editor: TipTap
PDF Generation: react-pdf / pdf-lib
Drag & Drop: @dnd-kit
Auth: JWT-based (own backend) or Clerk/Auth0
HTTP Client: fetch wrapper / Axios
Testing: Vitest + React Testing Library
Linting/Formatting: ESLint + Prettier
Commands
npm run dev          # Start dev server
npm run build         # Production build
npm run preview        # Preview production build locally
npm run lint           # Run ESLint
npm run test           # Run Vitest tests
npm run type-check      # TypeScript check
Project Structure
src/
├── main.tsx            # App entry point
├── App.tsx              # Root component + router setup
├── routes/              # Route-level page components
├── components/
│   ├── ui/              # shadcn/ui primitives
│   └── proposal/        # Proposal-specific components (editor, line-items, preview)
├── features/             # Feature-based modules (proposals, clients, templates)
├── hooks/                 # Custom React hooks
├── lib/                   # Utilities, API client, validation schemas
├── store/                 # Zustand stores
└── types/                 # Shared TypeScript types
Conventions
Components: Functional components only, colocate component + styles + tests
Forms: All forms use React Hook Form + Zod schemas (define schema in lib/schemas/)
Server state: Fetch/mutate via TanStack Query hooks in hooks/, never fetch directly in components
Styling: Tailwind utility classes; use shadcn/ui components before building custom ones
Type safety: No any; derive types from Zod schemas where possible (z.infer<>)
File naming: kebab-case for files, PascalCase for component exports
Notes for Claude Code
Prefer editing existing shadcn/ui components in components/ui/ over introducing new UI libraries
When adding new proposal fields, update the Zod schema first, then the form, then the API type
PDF generation logic lives in lib/pdf/ — keep it decoupled from UI components
Run npm run lint and npm run type-check before considering a task complete
