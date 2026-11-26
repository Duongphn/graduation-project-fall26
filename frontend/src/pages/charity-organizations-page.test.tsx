import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { parseOrganizationSearch, toOrganizationSearch } from '../features/organizations/public-queries'
import type { PublicOrganization } from '../features/organizations/types'
import type { Category } from '../features/toy-listings/toy-listing-api'
import { categoriesQuery } from '../features/toy-listings/toy-listing-queries'
import { PATHS } from '../routes/paths'
import { httpClient } from '../services/http-client'
import { createTestQueryClient, renderWithProviders } from '../test/render'
import { CharityOrganizationsPage } from './charity-organizations-page'

// No network: the axios instance is replaced; each test decides what the server answers.
vi.mock('../services/http-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/http-client')>()),
  httpClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../layouts/site/site-layout', () => ({
  SiteLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

const get = vi.mocked(httpClient.get)

const BEARS: Category = { id: '64b000000000000000000001', name: 'Gấu bông', slug: 'gau-bong', parentId: null }
const WOOD: Category = { id: '64b000000000000000000002', name: 'Đồ chơi gỗ', slug: 'do-choi-go', parentId: null }

const school: PublicOrganization = {
  id: '66a000000000000000000002',
  name: 'Trường vùng cao Mù Cang Chải',
  address: 'Bản Lìm, Lào Cai',
  supportCriteria: 'Điểm trường vùng cao, 60 học sinh mầm non.',
  ageGroups: [{ minAge: 3, maxAge: 6 }],
  categoryIds: [BEARS.id, WOOD.id],
  areaProvince: 'Lào Cai',
  isRemoteArea: true,
  isAccepting: true,
  receivingPoint: {
    province: 'Lào Cai',
    ward: 'Xã Mù Cang Chải',
    street: 'Bản Lìm',
    openingHours: '8:00–16:00',
    acceptsDropOff: false,
    acceptsParcel: true,
  },
}

/** The params of each GET /organizations call. */
const listCalls = () =>
  get.mock.calls.filter(([url]) => url === '/organizations').map(([, config]) => config?.params as object)

const renderPage = (url = PATHS.charityOrganizations) => {
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(categoriesQuery.queryKey, [BEARS, WOOD])
  const router = createMemoryRouter([{ path: PATHS.charityOrganizations, element: <CharityOrganizationsPage /> }], {
    initialEntries: [url],
  })
  renderWithProviders(<RouterProvider router={router} />, queryClient)
  return { router, user: userEvent.setup() }
}

beforeEach(() => {
  get.mockReset()
  get.mockImplementation(async (url) => {
    if (url === '/organizations') {
      return { data: { data: [school], pagination: { page: 1, limit: 12, totalItems: 1, totalPages: 1 } } }
    }
    if (url === '/categories') return { data: [BEARS, WOOD] }
    throw new Error(`unexpected GET ${url}`)
  })
})

// GB-52, R03 III.5.2.3: filters by province, age group, category and remote areas only; each card
// shows the accepted age groups and categories, the province of the receiving point and the badge.
describe('CharityOrganizationsPage', () => {
  it('shows the needs of each organization on its card', async () => {
    renderPage()
    const card = (await screen.findByRole('heading', { name: school.name, level: 3 })).closest('article') as HTMLElement
    expect(within(card).getByText('3–6 tuổi')).toBeInTheDocument()
    expect(within(card).getByText('Gấu bông')).toBeInTheDocument()
    expect(within(card).getByText('Đồ chơi gỗ')).toBeInTheDocument()
    expect(within(card).getAllByText('Lào Cai').length).toBeGreaterThan(0)
    expect(within(card).getByText('Vùng khó khăn')).toBeInTheDocument()
  })

  it('sends the GB-52 filters to GET /organizations and keeps them in the URL', async () => {
    const { router, user } = renderPage()
    await screen.findByRole('heading', { name: school.name, level: 3 })

    await user.click(screen.getByRole('checkbox', { name: 'Chỉ vùng khó khăn' }))
    await waitFor(() => expect(listCalls().at(-1)).toMatchObject({ remoteOnly: true }))

    await user.click(screen.getByRole('combobox', { name: 'Lọc theo nhóm tuổi' }))
    await user.click(await screen.findByTitle('3–6 tuổi'))
    await waitFor(() => expect(listCalls().at(-1)).toMatchObject({ minAge: 3, maxAge: 6, remoteOnly: true }))

    await user.click(screen.getByRole('combobox', { name: 'Lọc theo danh mục đồ chơi' }))
    await user.click(await screen.findByTitle(WOOD.name))
    await waitFor(() => expect(listCalls().at(-1)).toMatchObject({ categoryId: WOOD.id }))

    const province = screen.getByRole('combobox', { name: 'Lọc theo tỉnh/thành của điểm nhận' })
    await user.type(province, 'lao cai{Enter}')
    await waitFor(() => expect(listCalls().at(-1)).toMatchObject({ province: 'lao cai' }))

    expect(Object.fromEntries(new URLSearchParams(router.state.location.search))).toEqual({
      remote: '1',
      age: '3-6',
      category: WOOD.id,
      province: 'lao cai',
    })
  }, 30_000)

  it('reads the filters from the URL and ignores unknown values', () => {
    const filters = parseOrganizationSearch(
      new URLSearchParams('province=Lào Cai&age=3-6&category=64b000000000000000000002&remote=1&page=2'),
    )
    expect(filters).toEqual({
      q: undefined,
      province: 'Lào Cai',
      age: '3-6',
      categoryId: '64b000000000000000000002',
      remoteOnly: true,
      page: 2,
    })
    expect(toOrganizationSearch(filters).toString()).toBe(
      'province=L%C3%A0o+Cai&age=3-6&category=64b000000000000000000002&remote=1&page=2',
    )
    expect(parseOrganizationSearch(new URLSearchParams('province=x&age=2-4&category=abc&remote=yes'))).toEqual({
      q: undefined,
      province: undefined,
      age: undefined,
      categoryId: undefined,
      remoteOnly: undefined,
      page: 1,
    })
  })
})
