import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders } from 'axios'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { profileQuery } from '../../profile/profile-queries'
import { PATHS } from '../../../routes/paths'
import { httpClient } from '../../../services/http-client'
import { createTestQueryClient, renderWithProviders } from '../../../test/render'
import { RequestDonationCard } from './request-donation-card'

// No network: the axios instance is replaced; each test decides what the server answers.
vi.mock('../../../services/http-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/http-client')>()),
  httpClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../../hooks/use-is-signed-in', () => ({ useIsSignedIn: () => true }))

const post = vi.mocked(httpClient.post)

const OWNER_ID = '64a000000000000000000001'
const TOY_ID = '64c000000000000000000001'

const renderCard = (verificationStatus: string) => {
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(profileQuery.queryKey, {
    id: '64a000000000000000000009',
    verificationStatus,
  } as never)
  const router = createMemoryRouter(
    [{ path: '/toys/:id', element: <RequestDonationCard toyId={TOY_ID} ownerId={OWNER_ID} /> }],
    { initialEntries: [`/toys/${TOY_ID}`] },
  )
  renderWithProviders(<RouterProvider router={router} />, queryClient)
  return { user: userEvent.setup() }
}

beforeEach(() => post.mockReset())

// GB-06 / MSG17: a Receiver is a verified User (R03 actors), like posting, renting and buying.
describe('RequestDonationCard', () => {
  it('asks an unverified user to verify their identity instead of sending the request', () => {
    renderCard('unverified')
    expect(screen.getByText('Vui lòng xác minh danh tính trước khi tiếp tục.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Xác minh danh tính/ })).toHaveAttribute(
      'href',
      PATHS.identityVerification,
    )
    expect(screen.queryByRole('button', { name: /Gửi yêu cầu nhận/ })).not.toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('lets a verified user send the request, and shows MSG17 if the server still refuses', async () => {
    post.mockRejectedValueOnce(
      new AxiosError('refused', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 403,
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: { success: false, error: { code: 'USER_NOT_VERIFIED', message: 'not verified' } },
      }),
    )
    const { user } = renderCard('verified')
    expect(screen.queryByText('Vui lòng xác minh danh tính trước khi tiếp tục.')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Gửi yêu cầu nhận/ }))
    expect(await screen.findByText('Vui lòng xác minh danh tính trước khi tiếp tục.')).toBeInTheDocument()
    expect(post).toHaveBeenCalledWith('/donation-requests', { toyId: TOY_ID })
  })
})
