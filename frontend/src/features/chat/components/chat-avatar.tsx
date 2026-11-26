import type { ChatPerson } from '../chat-api'

/** "Mẹ Bảo Anh" → "BA": chữ cái đầu của hai từ cuối, như cách gọi tên tiếng Việt */
const initialsOf = (fullName: string) =>
  fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((word) => word.charAt(0))
    .join('')
    .toLocaleUpperCase('vi')

/** Ảnh đại diện người kia; chưa có ảnh (hoặc tài khoản đã xoá) thì hiện chữ cái đầu */
export function ChatAvatar({ person, size = 40 }: { person: ChatPerson | null; size?: number }) {
  const style = { width: size, height: size }
  if (person?.avatarUrl) return <img src={person.avatarUrl} alt="" className="chat-avatar" style={style} />
  return (
    <span className="chat-avatar chat-avatar--empty" style={style} aria-hidden>
      {person ? initialsOf(person.fullName) : '?'}
    </span>
  )
}

