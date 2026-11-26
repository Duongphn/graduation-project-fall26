import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders } from 'axios'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { addressesQuery } from '../../profile/profile-queries'
import { MyListingRow } from '../../toy-listings/components/my-listing-row'
import type { ToyListing } from '../../toy-listings/toy-listing-api'
import { categoriesQuery } from '../../toy-listings/toy-listing-queries'
import type { PublicOrganization } from '../../organizations/types'
import { httpClient } from '../../../services/http-client'
import { createTestQueryClient, renderWithProviders } from '../../../test/render'
import type { DonationToyState } from '../donor-queries'

// No network: the axios instance is replaced; each test decides what the server answers.
vi.mock('../../../services/http-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/http-client')>()),
  httpClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

const get = vi.mocked(httpClient.get)
const post = vi.mocked(httpClient.post)

const CATEGORY_ID = '64b000000000000000000001'
const REQUEST_ID = '64d000000000000000000001'

const donationPost: ToyListing = {
  id: '64c000000000000000000001',
  ownerId: '64a000000000000000000001',
  categoryId: CATEGORY_ID,
  categoryName: 'Đồ chơi gỗ',
  title: 'Xe ben gỗ',
  description: 'Xe ben gỗ còn tốt, đủ bánh, đã vệ sinh sạch sẽ và còn hộp đựng như lúc mới mua.',
  condition: 'Tốt (70–89%)',
  listingType: 'donate',
  priceOrRate: 0,
  ageRange: { minAge: 3, maxAge: 6 },
  images: [],
  quantity: 1,
  status: 'active',
  createdAt: '2026-11-20T00:00:00.000Z',
  updatedAt: '2026-11-20T00:00:00.000Z',
}

const organization = (id: string, name: string, point: { acceptsDropOff: boolean; acceptsParcel: boolean }) =>
  ({
    id,
    name,
    address: '12 Lê Lợi, Huế',
    supportCriteria: null,
    receivingPoint: { province: 'Huế', ward: 'Phú Hội', street: '12 Lê Lợi', openingHours: '8:00–17:00', ...point },
    ageGroups: [{ minAge: 3, maxAge: 6 }],
    categoryIds: [CATEGORY_ID],
    areaProvince: null,
    isRemoteArea: false,
    isAccepting: true,
  }) satisfies PublicOrganization

const dropOffOnly = organization('64e000000000000000000001', 'Mái ấm Hoa Hồng', { acceptsDropOff: true, acceptsParcel: false })
const both = organization('64e000000000000000000002', 'Làng trẻ Bình Minh', { acceptsDropOff: true, acceptsParcel: true })

const suggestionCalls = () => get.mock.calls.filter(([url]) => url === '/organizations/suggestions')

// GET /organizations/suggestions answers `organizations`; GET /categories (refetch) an empty list.
const answerSuggestions = (organizations: PublicOrganization[]) =>
  get.mockImplementation(async (url) => {
    if (url === '/organizations/suggestions') return { data: { success: true, data: organizations } }
    return { data: [] }
  })

const conflict = (code: string, message: string) =>
  new AxiosError('refused', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 409,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { success: false, error: { code, message } },
  })

const renderRow = (listing: ToyListing = donationPost, donationState?: DonationToyState) => {
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(addressesQuery.queryKey, [{ id: 'a1', province: 'Huế', isDefault: true }] as never)
  queryClient.setQueryData(categoriesQuery.queryKey, [{ id: CATEGORY_ID, name: 'Đồ chơi gỗ', slug: 'do-choi-go', parentId: null }])
  const router = createMemoryRouter(
    [
      { path: '/listings', element: <MyListingRow listing={listing} donationState={donationState} /> },
      { path: '/donations/:requestId', element: <h1>Chi tiết phiếu quyên góp</h1> },
    ],
    { initialEntries: ['/listings'] },
  )
  renderWithProviders(<RouterProvider router={router} />, queryClient)
  return { user: userEvent.setup() }
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
})

// UC33 (GB-56): the Donor picks one of their own Active donation posts and sends it to an organization.
describe('Gửi tới tổ chức (UC33)', () => {
  it('sends the post to a suggested organization with a method its receiving point accepts', async () => {
    answerSuggestions([dropOffOnly, both])
    post.mockResolvedValueOnce({
      data: { success: true, data: { id: REQUEST_ID, organization: { name: dropOffOnly.name } } },
    })
    const { user } = renderRow()

    await user.click(screen.getByRole('button', { name: 'Gửi tới tổ chức' }))
    const dialog = await screen.findByRole('dialog')
    // GB-54: suggestions for the toy's category and ages, the Donor's default province first.
    await user.click(await within(dialog).findByRole('radio', { name: new RegExp(dropOffOnly.name) }))
    expect(suggestionCalls()[0]?.[1]).toEqual({
      params: { categoryId: CATEGORY_ID, minAge: 3, maxAge: 6, province: 'Huế' },
    })
    // GB-51: this receiving point takes no parcel, so the drop-off is chosen instead.
    expect(within(dialog).getByRole('radio', { name: /Gửi qua đơn vị vận chuyển/ })).toBeDisabled()
    expect(within(dialog).getByRole('radio', { name: /Tự mang đến tận nơi/ })).toBeChecked()
    await user.type(within(dialog).getByLabelText('Ghi chú cho tổ chức'), 'Thiếu một bánh xe nhỏ')
    await user.click(within(dialog).getByRole('button', { name: 'Gửi tới tổ chức' }))

    expect(await screen.findByRole('heading', { name: 'Chi tiết phiếu quyên góp' })).toBeInTheDocument()
    expect(post).toHaveBeenCalledWith('/donation-requests/to-organization', {
      toyId: donationPost.id,
      organizationId: dropOffOnly.id,
      handoverMethod: 'drop_off',
      message: 'Thiếu một bánh xe nhỏ',
    })
  }, 15_000)

  it('asks for an organization before sending', async () => {
    answerSuggestions([both])
    const { user } = renderRow()

    await user.click(screen.getByRole('button', { name: 'Gửi tới tổ chức' }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByRole('radio', { name: new RegExp(both.name) })
    await user.click(within(dialog).getByRole('button', { name: 'Gửi tới tổ chức' }))

    expect(await within(dialog).findByText('Chọn tổ chức tiếp nhận.')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  // MSG51: the organization stopped taking toys meanwhile: the reason shows and the list reloads.
  it('shows why the organization refused and reloads the suggestions', async () => {
    answerSuggestions([both])
    post.mockRejectedValueOnce(
      conflict('ORGANIZATION_NOT_ACCEPTING', 'Tổ chức này hiện không nhận đồ chơi. Vui lòng chọn tổ chức khác.'),
    )
    const { user } = renderRow()

    await user.click(screen.getByRole('button', { name: 'Gửi tới tổ chức' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(await within(dialog).findByRole('radio', { name: new RegExp(both.name) }))
    await user.click(within(dialog).getByRole('button', { name: 'Gửi tới tổ chức' }))

    expect(
      await within(dialog).findByText('Tổ chức này hiện không nhận đồ chơi. Vui lòng chọn tổ chức khác.'),
    ).toBeInTheDocument()
    await vi.waitFor(() => expect(suggestionCalls()).toHaveLength(2))
  }, 15_000)

  it('says when no organization takes the toy and does not send', async () => {
    answerSuggestions([])
    const { user } = renderRow()

    await user.click(screen.getByRole('button', { name: 'Gửi tới tổ chức' }))
    const dialog = await screen.findByRole('dialog')

    expect(await within(dialog).findByText(/Hiện chưa có tổ chức nào nhận/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Gửi tới tổ chức' })).toBeDisabled()
  })

  it.each([
    ['a pending donation post', { ...donationPost, status: 'pending' } as ToyListing, undefined],
    ['a donation post being given away', donationPost, 'giving' as const],
    ['a rent listing', { ...donationPost, listingType: 'rent', priceOrRate: 20_000 } as ToyListing, undefined],
  ])('offers no "Gửi tới tổ chức" on %s', (_, listing, donationState) => {
    renderRow(listing, donationState)
    expect(screen.queryByRole('button', { name: 'Gửi tới tổ chức' })).not.toBeInTheDocument()
  })
})
