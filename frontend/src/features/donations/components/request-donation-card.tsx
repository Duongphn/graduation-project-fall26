import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Alert, Form, Input } from 'antd'
import { Gift, LogIn } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { FormField } from '../../../components/common'
import { useIsSignedIn } from '../../../hooks/use-is-signed-in'
import { myDonationRequestPath, PATHS } from '../../../routes/paths'
import { profileQuery } from '../../profile/profile-queries'
import { useCreateDonationRequest } from '../receiver-queries'
import { requestToySchema, type RequestToyValues } from '../schemas'

interface RequestDonationCardProps {
  toyId: string
  ownerId: string
}

/** "Xin nhận đồ chơi này" trên trang chi tiết tin quyên góp (POST /donation-requests) */
export function RequestDonationCard({ toyId, ownerId }: RequestDonationCardProps) {
  const isSignedIn = useIsSignedIn()
  const profile = useQuery({ ...profileQuery, enabled: isSignedIn })
  const location = useLocation()
  const navigate = useNavigate()
  const [failure, setFailure] = useState<string | null>(null)
  const loginPath = `${PATHS.login}?redirect=${encodeURIComponent(location.pathname + location.search)}`

  const { control, handleSubmit } = useForm<RequestToyValues>({
    resolver: zodResolver(requestToySchema),
    defaultValues: { message: '' },
  })
  const create = useCreateDonationRequest({
    onCreated: (requestId) => navigate(myDonationRequestPath(requestId)),
    onFailed: setFailure,
    onUnauthorized: () => navigate(loginPath),
  })

  // Chủ tin không tự xin nhận đồ của mình
  if (isSignedIn && profile.data?.id === ownerId) return null

  const submit = handleSubmit(({ message }) => {
    if (!isSignedIn) {
      navigate(loginPath)
      return
    }
    setFailure(null)
    create.mutate({ toyId, ...(message ? { message } : {}) })
  })

  return (
    <section className="tf-card booking-card" aria-labelledby="request-donation-title">
      <h2 id="request-donation-title" className="tf-section-title tf-section-title--sm">
        Xin nhận đồ chơi này
      </h2>
      <p className="booking-card__note">
        Đồ chơi được tặng miễn phí. Người tặng xem lời nhắn và chọn người nhận phù hợp; số điện thoại hai bên
        chỉ hiện sau khi được đồng ý.
      </p>

      {isSignedIn ? (
        <Form layout="vertical" component="div" disabled={create.isPending}>
          <FormField control={control} name="message" label="Lời nhắn cho người tặng">
            {(field) => (
              <Input.TextArea
                {...field}
                rows={4}
                maxLength={1000}
                showCount
                placeholder="VD: Bé nhà mình 5 tuổi rất thích xếp hình, mình có thể qua lấy cuối tuần."
              />
            )}
          </FormField>
        </Form>
      ) : null}

      {failure && <Alert type="warning" showIcon title={failure} />}

      {isSignedIn ? (
        <button
          type="button"
          className="tf-btn tf-btn--primary"
          disabled={create.isPending}
          onClick={() => void submit()}
        >
          <Gift aria-hidden />
          {create.isPending ? 'Đang gửi…' : 'Gửi yêu cầu nhận'}
        </button>
      ) : (
        <Link to={loginPath} className="tf-btn tf-btn--primary">
          <LogIn aria-hidden /> Đăng nhập để xin nhận
        </Link>
      )}
    </section>
  )
}
