import { apiGet, apiSendWithMessage } from '../../services/http'
import type { AdminSetting, PublicSettings, ResetSettingInput, UpdateSettingInput } from './types'

const ADMIN_URL = '/admin/settings'
const keyUrl = (key: string) => `${ADMIN_URL}/${encodeURIComponent(key)}`

// UC30 Configure System. Mutations keep the backend message for the success toast.
export const systemSettingsApi = {
  list: () => apiGet<AdminSetting[]>(ADMIN_URL),

  update: ({ key, value, note }: UpdateSettingInput) =>
    apiSendWithMessage<AdminSetting>('patch', keyUrl(key), { value, ...(note ? { note } : {}) }),

  reset: ({ key, note }: ResetSettingInput) =>
    apiSendWithMessage<AdminSetting>('post', `${keyUrl(key)}/reset`, note ? { note } : {}),

  // No sign-in needed (withdrawal limits on the wallet page).
  publicSettings: () => apiGet<PublicSettings>('/settings/public'),
}
