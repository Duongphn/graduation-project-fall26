import { useQuery } from '@tanstack/react-query'

import { useApiMutation } from '../../hooks/useApiMutation'
import type { WithMessage } from '../../types/api'
import { systemSettingsApi } from './api'
import type { AdminSetting } from './types'

export const systemSettingKeys = {
  all: ['system-settings'] as const,
  adminList: () => [...systemSettingKeys.all, 'admin-list'] as const,
  public: () => [...systemSettingKeys.all, 'public'] as const,
}

// The audit log shows each change: refresh it too after a save.
const AUDIT_LOG_KEY = ['audit-logs'] as const

export const useAdminSettings = () =>
  useQuery({ queryKey: systemSettingKeys.adminList(), queryFn: systemSettingsApi.list })

// Withdrawal limits and other public values; they change rarely.
export const usePublicSettings = () =>
  useQuery({
    queryKey: systemSettingKeys.public(),
    queryFn: systemSettingsApi.publicSettings,
    staleTime: 60_000,
  })

const useSettingMutation = <TVariables,>(
  mutationFn: (variables: TVariables) => Promise<WithMessage<AdminSetting>>,
  fallbackMessage: string,
  onError?: (error: unknown) => boolean,
) =>
  useApiMutation<WithMessage<AdminSetting>, TVariables>({
    mutationFn,
    successMessage: (result) => result.message ?? fallbackMessage,
    invalidate: [systemSettingKeys.all, AUDIT_LOG_KEY],
    // 404/409: the list is out of date (another Admin saved meanwhile).
    refetchOnStale: true,
    ...(onError ? { onError } : {}),
  })

export const useUpdateSetting = (onError?: (error: unknown) => boolean) =>
  useSettingMutation(systemSettingsApi.update, 'Đã lưu cấu hình.', onError)

export const useResetSetting = () =>
  useSettingMutation(systemSettingsApi.reset, 'Đã đặt lại giá trị mặc định.')
