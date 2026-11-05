import { ADVISOR_SOURCES } from '../constants/ai-advisor.js';
import { objectIdSchema } from './common.validation.js';
import { z } from './zod.js';

export const ADVISOR_MESSAGE_MAX = 500;

const listingTypeSchema = z.enum(['any', 'rent', 'sell', 'donate']).openapi({ example: 'rent' });

const ageYearsSchema = z
  .number()
  .int()
  .min(0)
  .max(18)
  .nullable()
  .openapi({ description: 'Tuổi của bé (năm); null: chưa biết.', example: 4 });

const maxPriceSchema = z.number().min(0).max(1_000_000_000).nullable().openapi({
  description: 'Giá tối đa (VND), với tin thuê là giá mỗi ngày; 0 hoặc null: không giới hạn.',
  example: 150000,
});

const categorySchema = z
  .string()
  .trim()
  .max(80)
  .openapi({
    description: "Slug danh mục đang hoạt động, hoặc 'any'.",
    example: 'lap-rap-xep-hinh',
  });

const areaSchema = z
  .string()
  .trim()
  .max(100)
  .openapi({ description: 'Khu vực phụ huynh nhắc tới (chưa dùng để lọc).', example: 'Cầu Giấy' });

/** Bộ lọc client gửi lại mỗi lượt (ngữ cảnh hội thoại); server làm sạch thêm một lần nữa. */
export const advisorFiltersInputSchema = z
  .object({
    ageYears: ageYearsSchema.optional(),
    category: categorySchema.optional(),
    listingType: listingTypeSchema.optional(),
    maxPrice: maxPriceSchema.optional(),
    area: areaSchema.optional(),
  })
  .openapi('AdvisorFiltersInput');

// History dài vẫn hợp lệ: server tự cắt còn 2 tin, mỗi tin 300 ký tự trước khi gửi AI (mục 8.2).
const historyItemSchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string().max(2000),
});

export const advisorAskBodySchema = z
  .object({
    message: z
      .string()
      .trim()
      .max(ADVISOR_MESSAGE_MAX, `Câu hỏi tối đa ${ADVISOR_MESSAGE_MAX} ký tự.`)
      .default('')
      .openapi({ example: 'Bé 4 tuổi thích xếp hình, muốn thuê dưới 150k gần Cầu Giấy' }),
    filters: advisorFiltersInputSchema.optional(),
    history: z.array(historyItemSchema).max(20).default([]),
    filtersFromButtons: z
      .boolean()
      .default(false)
      .openapi({ description: 'true: bộ lọc chọn bằng nút bấm, bỏ qua bước AI trích bộ lọc.' }),
  })
  .refine((body) => body.filtersFromButtons || body.message.length > 0, {
    path: ['message'],
    message: `Vui lòng nhập câu hỏi (1–${ADVISOR_MESSAGE_MAX} ký tự).`,
  })
  .openapi('AdvisorAskRequest');
export type AdvisorAskBody = z.infer<typeof advisorAskBodySchema>;

// ---------- Response (chỉ để tài liệu OpenAPI) ----------

const advisorFiltersSchema = z
  .object({
    ageYears: ageYearsSchema,
    category: categorySchema,
    listingType: listingTypeSchema,
    maxPrice: maxPriceSchema,
    area: areaSchema,
  })
  .openapi('AdvisorFilters');

const advisorToySchema = z
  .object({
    id: objectIdSchema,
    name: z.string().openapi({ example: 'Bộ xếp hình Duplo 60 chi tiết' }),
    listingType: z.enum(['rent', 'sell', 'donate']),
    priceOrRate: z
      .number()
      .openapi({ description: 'Tin thuê: giá mỗi ngày (VND).', example: 40000 }),
    condition: z.string().openapi({ example: 'Tốt (70–89%)' }),
    image: z.string().openapi({ description: 'Ảnh bìa; chuỗi rỗng khi không có ảnh.' }),
    reason: z.string().openapi({ example: 'Chi tiết to, an toàn cho bé 4 tuổi tập lắp ghép.' }),
  })
  .openapi('AdvisorToy');

export const advisorReplySchema = z
  .object({
    reply: z.string(),
    toys: z.array(advisorToySchema).max(5),
    filters: advisorFiltersSchema,
    source: z.enum(ADVISOR_SOURCES),
  })
  .openapi('AdvisorReply');
