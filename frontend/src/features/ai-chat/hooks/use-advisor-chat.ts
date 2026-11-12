import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { toAdvisorHistory } from '../advisor-filters'
import {
  getToyAdvice,
  getAdvisorErrorMessage,
  type AdvisorFilters,
  type AdvisorRequest,
  type AdvisorToy,
} from '../ai-chat-api'

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  text: string
  /** Tin báo lỗi: hiển thị khác màu và không gửi lại cho AI làm ngữ cảnh */
  isError?: boolean
  /** Đồ chơi Robo gợi ý kèm câu trả lời */
  toys?: AdvisorToy[]
}

/**
 * Hội thoại với trợ lý AI. Ngữ cảnh là bộ lọc server trả về (gửi lại mỗi lượt) cộng 2 tin gần nhất,
 * không gửi cả lịch sử. Bộ lọc chọn bằng nút gửi kèm filtersFromButtons để server chỉ gọi AI một lần.
 */
export function useAdvisorChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [filters, setFilters] = useState<AdvisorFilters>()
  const nextId = useRef(0)

  const appendMessage = (message: Omit<ChatMessage, 'id'>) =>
    setMessages((current) => [...current, { ...message, id: nextId.current++ }])

  const advisor = useMutation({ mutationFn: getToyAdvice })

  const request = (userText: string, payload: Omit<AdvisorRequest, 'history'>) => {
    if (advisor.isPending) return
    const history = toAdvisorHistory(messages)
    appendMessage({ role: 'user', text: userText })
    // Callback theo từng lượt: bấm "Bắt đầu lại" khi đang chờ thì câu trả lời cũ bị bỏ qua
    advisor.mutate(
      { ...payload, history },
      {
        onSuccess: (data) => {
          setFilters(data.filters)
          appendMessage({
            role: 'assistant',
            text: data.advice,
            toys: data.listings,
          })
        },
        onError: (error) =>
          appendMessage({
            role: 'assistant',
            text: getAdvisorErrorMessage(error),
            isError: true,
          }),
      },
    )
  }

  const send = (text: string) => {
    const message = text.trim()
    if (!message) return
    request(message, { message, filters, filtersFromButtons: false })
  }

  /** Nút lọc nhanh: `label` hiện thành tin của phụ huynh trong khung chat */
  const applyFilters = (next: AdvisorFilters, label: string) =>
    request(label, { message: '', filters: next, filtersFromButtons: true })

  const reset = () => {
    advisor.reset()
    setMessages([])
    setFilters(undefined)
  }

  return {
    messages,
    filters,
    send,
    applyFilters,
    reset,
    isPending: advisor.isPending,
  }
}
