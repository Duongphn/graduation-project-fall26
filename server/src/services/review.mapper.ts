import type { IReview, ReviewDirection } from '../models/review.model.js';

export interface ReviewerDto {
  id: string;
  fullName: string;
  avatar?: string;
}

export interface ReviewDto {
  id: string;
  direction: ReviewDirection;
  reviewer: ReviewerDto;
  userRating: number;
  toyRating?: number;
  comment?: string;
  createdAt: string;
}

export interface RatingSummary {
  average: number | null;
  count: number;
}

/** The only place the average is computed: 1 decimal, null with no ratings (also for toys that predate `rating`). */
export function toRatingSummary(rating?: { sum: number; count: number } | null): RatingSummary {
  const count = rating?.count ?? 0;
  if (!rating || count <= 0) return { average: null, count: 0 };
  return { average: Math.round((rating.sum / count) * 10) / 10, count };
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface OrderReviewsDto {
  myReview: ReviewDto | null;
  theirReview: ReviewDto | null;
  canReview: boolean;
  reviewDeadline: string | null;
}

/** Only id, name and avatar of the reviewer: never phone or email. */
export function toReviewDto(review: IReview, reviewer: ReviewerDto): ReviewDto {
  return {
    id: review._id.toString(),
    direction: review.direction,
    reviewer,
    userRating: review.userRating,
    ...(review.toyRating !== undefined && review.toyRating !== null
      ? { toyRating: review.toyRating }
      : {}),
    ...(review.comment ? { comment: review.comment } : {}),
    createdAt: review.createdAt.toISOString(),
  };
}
