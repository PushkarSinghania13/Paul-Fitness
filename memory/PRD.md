# PRD — Paul Fitness Gym Mobile App

## Overview
A React Native (Expo) mobile app for **PAUL FITNESS GYM** (Raghunathpur, West Bengal) that lets members view plans, pay online (Razorpay) or in cash, track their membership expiry, and lets the gym manager record cash payments, monitor members, and contact expired members.

## Roles
1. **User (member)** — Google Sign-In. Views gym info, photos, plans, pays online/cash, tracks expiry, updates phone number.
2. **Manager** — Pre-seeded email/password login. Manages members, records cash payments, calls expired/expiring members.

## Tech Stack
- Frontend: Expo SDK 54 + Expo Router + TypeScript (file-based routing)
- Backend: FastAPI + MongoDB (motor)
- Auth: Emergent-managed Google OAuth (users) + bcrypt password (manager)
- Payments: Razorpay (online) + manual cash recording by manager
- Notifications: Push-token registration ready; in-app expiry banners visible in preview

## Key Features
- Onboarding with Google + Manager Login
- User Dashboard: days-remaining hero, gym info (tap-to-call), photo gallery
- Plans listing (1/3/6/12 months, with savings badges) + Checkout (online/cash)
- User profile: phone, payment history, logout
- Manager Command Center: live stats (total/active/expiring/expired), search, filter chips, member list
- Member Detail: profile, current plan, record cash payment (any plan), tap-to-call, full payment history

## Seed Data
- 4 plans: ₹1000/month, ₹2500/3mo, ₹4500/6mo, ₹8000/year
- 1 manager: manager@paulfitness.com / Paul@Manager123

## Pending (post-MVP)
- Plug in real Razorpay test keys (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET) → online checkout activates
- Native build for real push notifications
- Gym photo & plan updates via manager dashboard
