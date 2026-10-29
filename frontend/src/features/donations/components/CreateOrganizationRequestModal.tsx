import { zodResolver } from '@hookform/resolvers/zod'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Input, Select } from 'antd'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'

import { FormField, FormModal } from '../../../components/common'
import { useApiMutation } from '../../../hooks/useApiMutation'
import { adminPaths } from '../../../routes/paths'
import { organizationsApi } from '../../organizations/api'
import { toyModerationApi } from '../../toy-moderation/api'
import { donationRequestsApi } from '../api'
import { donationKeys } from '../hooks'
import { createOrganizationRequestSchema, type CreateOrganizationRequestValues } from '../schemas'

const PICKER_LIMIT = 20

/** Gõ tìm: chờ người dùng ngừng gõ 300 ms rồi mới gọi API */
function useDebounced(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}

interface CreateOrganizationRequestModalProps {
  open: boolean
  onClose: () => void
}

// Admin creates a request on behalf of an organization (POST /admin/donation-requests): an
// active donation toy (GET /admin/toys?listingType=donate&status=active) and an active organization.
export function CreateOrganizationRequestModal({ open, onClose }: CreateOrganizationRequestModalProps) {
  const navigate = useNavigate()
  const [toySearch, setToySearch] = useState('')
  const [organizationSearch, setOrganizationSearch] = useState('')
  const toyQ = useDebounced(toySearch.trim())
  const organizationQ = useDebounced(organizationSearch.trim())

  const toys = useQuery({
    queryKey: ['admin-donate-toys', toyQ],
    queryFn: () =>
      toyModerationApi.queue({
        status: 'active',
        listingType: 'donate',
        limit: PICKER_LIMIT,
        ...(toyQ ? { q: toyQ } : {}),
      }),
    enabled: open,
    placeholderData: keepPreviousData,
  })
  const organizations = useQuery({
    queryKey: ['admin-active-organizations', organizationQ],
    queryFn: () =>
      organizationsApi.list({ status: 'active', limit: PICKER_LIMIT, ...(organizationQ ? { q: organizationQ } : {}) }),
    enabled: open,
    placeholderData: keepPreviousData,
  })

  const { control, handleSubmit, reset } = useForm<CreateOrganizationRequestValues>({
    resolver: zodResolver(createOrganizationRequestSchema),
    defaultValues: { toyId: '', organizationId: '', message: '' },
  })

  const close = () => {
    reset()
    setToySearch('')
    setOrganizationSearch('')
    onClose()
  }

  const create = useApiMutation({
    mutationFn: ({ toyId, organizationId, message }: CreateOrganizationRequestValues) =>
      donationRequestsApi.create({ toyId, organizationId, ...(message ? { message } : {}) }),
    successMessage: 'Đã tạo yêu cầu nhận đồ cho tổ chức. Người tặng sẽ được thông báo.',
    invalidate: [donationKeys.all],
    onSuccess: (data) => {
      close()
      navigate(adminPaths.donationRequest(data.id))
    },
  })

  return (
    <FormModal
      open={open}
      title="Tạo yêu cầu cho tổ chức"
      okText="Tạo yêu cầu"
      loading={create.isPending}
      width={560}
      onCancel={close}
      onSubmit={handleSubmit((values) => create.mutate(values))}
    >
      <FormField control={control} name="toyId" label="Đồ chơi quyên góp đang hiển thị" required>
        {(field) => (
          <Select
            showSearch={{ filterOption: false, onSearch: setToySearch }}
            value={field.value || undefined}
            onChange={field.onChange}
            onBlur={field.onBlur}
            loading={toys.isFetching}
            placeholder="Tìm theo tên đồ chơi"
            notFoundContent={toys.isFetching ? 'Đang tìm…' : 'Không có đồ chơi quyên góp phù hợp'}
            options={(toys.data?.items ?? []).map((toy) => ({
              value: toy.id,
              label: toy.owner ? `${toy.title} — ${toy.owner.fullName}` : toy.title,
            }))}
          />
        )}
      </FormField>
      <FormField control={control} name="organizationId" label="Tổ chức tiếp nhận" required>
        {(field) => (
          <Select
            showSearch={{ filterOption: false, onSearch: setOrganizationSearch }}
            value={field.value || undefined}
            onChange={field.onChange}
            onBlur={field.onBlur}
            loading={organizations.isFetching}
            placeholder="Tìm theo tên tổ chức"
            notFoundContent={organizations.isFetching ? 'Đang tìm…' : 'Không có tổ chức đang hoạt động phù hợp'}
            options={(organizations.data?.items ?? []).map((organization) => ({
              value: organization.id,
              label: organization.name,
            }))}
          />
        )}
      </FormField>
      <FormField control={control} name="message" label="Lời nhắn cho người tặng">
        {(field) => (
          <Input.TextArea
            {...field}
            rows={3}
            maxLength={1000}
            showCount
            placeholder="VD: Mái ấm đang cần đồ chơi cho các bé 3–6 tuổi."
          />
        )}
      </FormField>
    </FormModal>
  )
}
