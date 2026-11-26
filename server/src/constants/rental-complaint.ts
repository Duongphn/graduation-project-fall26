// Khiếu nại của người thuê khi nhận đồ (UC17) và phản hồi của bên bị khiếu nại (UC18).

/** Lý do người thuê khiếu nại trong lúc thuê; chủ đồ khiếu nại qua quyết toán "Hư hỏng" (DAMAGED_ON_RETURN). */
export const renterComplaintReasons = [
  'DAMAGED_ON_RECEIPT',
  'MISSING_PARTS',
  'NOT_AS_DESCRIBED',
  'OTHER',
] as const;
export type RenterComplaintReason = (typeof renterComplaintReasons)[number];

export const COMPLAINT_DESCRIPTION_MIN = 10;
export const COMPLAINT_DESCRIPTION_MAX = 1000;
export const DISPUTE_RESPONSE_MIN = 10;
export const DISPUTE_RESPONSE_MAX = 1000;
