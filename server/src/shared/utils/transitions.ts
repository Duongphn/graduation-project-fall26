import { conflict } from '../errors/http-errors.js';

// Generic status-transition guard. Each feature declares its own map over the status values
// stored by develop's models (e.g. donation_requests: 'pending' | 'accepted' | ...).

export type TransitionMap<S extends string> = Readonly<Record<S, readonly S[]>>;

export const canTransition = <S extends string>(map: TransitionMap<S>, from: S, to: S): boolean =>
  map[from]?.includes(to) ?? false;

export const assertTransition = <S extends string>(map: TransitionMap<S>, from: S, to: S): void => {
  if (!canTransition(map, from, to)) {
    // A 409 for the client instead of an unhandled 500.
    throw conflict('INVALID_STATUS_TRANSITION', `Status cannot change from ${from} to ${to}.`, {
      from,
      to,
    });
  }
};
