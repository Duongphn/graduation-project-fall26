import { QueryClient } from '@tanstack/react-query'

/** Dùng chung cho React (QueryClientProvider) và loader của router — để dữ liệu router tải sẵn nằm trong cùng cache */
export const queryClient = new QueryClient()
