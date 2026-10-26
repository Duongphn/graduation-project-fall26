export const actorTypes = ['USER', 'ADMIN', 'SYSTEM', 'EXTERNAL_SERVICE'] as const;

export type ActorType = (typeof actorTypes)[number];

export interface ActorReference {
  actorType: ActorType;
  actorId?: string;
}
