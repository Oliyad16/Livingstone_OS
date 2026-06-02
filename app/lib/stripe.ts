import Stripe from 'stripe'

const key = process.env.STRIPE_SECRET_KEY

export const stripe = key ? new Stripe(key) : null
