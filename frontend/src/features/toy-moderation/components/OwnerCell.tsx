import { UserSummary } from '../../../components/common'
import type { ModerationOwner } from '../types'

// Owner of a post in the queue: name, masked phone (GB-35) and identity check status.
export function OwnerCell({ owner }: { owner: ModerationOwner | null }) {
  return (
    <UserSummary
      user={
        owner && {
          fullName: owner.fullName,
          phone: owner.maskedPhone,
          identityStatus: owner.verificationStatus,
        }
      }
    />
  )
}
