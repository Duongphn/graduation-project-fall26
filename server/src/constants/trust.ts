// Trust Score tuning (UC24). Window is the look-back for reviews, cancellations and disputes.
export const TRUST_WINDOW_DAYS = 180;
export const TRUST_RATING_MULTIPLIER = 20; // average rating (1-5) x 20 = 0-100
export const TRUST_CANCEL_PENALTY = 5;
export const TRUST_DISPUTE_PENALTY = 10;
