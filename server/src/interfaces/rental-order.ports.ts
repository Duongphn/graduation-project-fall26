import { type ToyImageStorage } from './toy-listing.ports.js';
import { type RentalSettings } from '../types/rental-order.types.js';

export type RentalPhotoStorage = ToyImageStorage;

export interface RentalNotification {
  userId: string;
  title: string;
  body: string;
}

export interface RentalNotifier {
  notify(n: RentalNotification): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export interface RentalSettingsProvider {
  getRentalSettings(): Promise<RentalSettings>;
}
