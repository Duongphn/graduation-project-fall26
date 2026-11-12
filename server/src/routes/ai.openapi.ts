import {
  bearerAuthSecurity,
  errorResponses,
  jsonContent,
  openApiRegistry,
} from '../config/openapi.js';
import { successResponseSchema } from '../validations/common.validation.js';
import { advisorAskBodySchema, toyAdviceSchema } from '../validations/ai-advisor.validation.js';

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/v1/ai/toy-advice',
  tags: ['AI Advisor'],
  security: bearerAuthSecurity,
  summary: 'Trợ lý AI tư vấn đồ chơi',
  description:
    'Trả lời ngắn và tối đa 5 đồ chơi có thật trên ToyFlow (đã duyệt, còn sẵn). `filters` trả về là ngữ cảnh hội thoại: client gửi lại ở lượt sau. `source`: ai | faq | fallback | no_result | off_topic. Gemini lỗi hoặc quá thời gian vẫn trả 200 với `source: fallback`. AI chỉ gợi ý, phụ huynh tự quyết định.',
  request: { body: { content: jsonContent(advisorAskBodySchema) } },
  responses: {
    200: {
      description: 'Lời tư vấn và đồ chơi gợi ý',
      content: jsonContent(successResponseSchema(toyAdviceSchema)),
    },
    ...errorResponses(400, 401, 403, 429, 503),
  },
});
