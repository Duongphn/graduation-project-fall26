import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { askAdvisor, getAdvisorErrorMessage, type AdvisorRequest } from '../ai-chat-api'

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  text: string
  /** Tin báo lỗi: hiển thị khác màu và không gửi lại cho AI làm ngữ cảnh */
  isError?: boolean
}

/** Hội thoại với trợ lý AI: danh sách tin, gửi câu hỏi (kèm lịch sử làm ngữ cảnh), bắt đầu lại */
export function useAdvisorChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const nextId = useRef(0)

  const appendMessage = (message: Omit<ChatMessage, 'id'>) =>
    setMessages((current) => [...current, { ...message, id: nextId.current++ }])

  const advisor = useMutation({
    mutationFn: (payload: AdvisorRequest) => askAdvisor(payload),
    onSuccess: ({ reply }) => appendMessage({ role: 'assistant', text: reply }),
    onError: (error) => appendMessage({ role: 'assistant', text: getAdvisorErrorMessage(error), isError: true }),
  })

  const send = (text: string) => {
    const message = text.trim()
    if (!message || advisor.isPending) return

    const history = messages.filter((item) => !item.isError).map(({ role, text: content }) => ({ role, text: content }))
    appendMessage({ role: 'user', text: message })
    advisor.mutate({ message, history })
  }

  const reset = () => {
    advisor.reset()
    setMessages([])
  }

  return { messages, send, reset, isPending: advisor.isPending }
}
