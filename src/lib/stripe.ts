import { loadStripe } from '@stripe/stripe-js';

const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
if (!stripeKey) {
  console.error('VITE_STRIPE_PUBLISHABLE_KEY is not set. The payment card field will not work.');
}

// Initialized at module load time so Stripe.js begins fetching immediately
// when the app starts, not when the user navigates to /checkout.
export const stripePromise = stripeKey ? loadStripe(stripeKey) : null;
