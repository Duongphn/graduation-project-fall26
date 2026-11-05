/** Nguồn của câu trả lời trợ lý AI; cũng là trạng thái lưu trong AiRequest.status. */
export const ADVISOR_SOURCES = ['ai', 'faq', 'fallback', 'no_result', 'off_topic'] as const;
export type AdvisorSource = (typeof ADVISOR_SOURCES)[number];

/** Loại lượt gọi AI được ghi log; hiện chỉ có trợ lý tư vấn đồ chơi. */
export const AI_REQUEST_TYPES = ['advisor'] as const;
export type AiRequestType = (typeof AI_REQUEST_TYPES)[number];
