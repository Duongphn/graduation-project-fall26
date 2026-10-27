import { Alert, Button } from 'antd'

import { getErrorMessage } from '../../services/api-error'

interface QueryErrorAlertProps {
  error: unknown
  onRetry?: () => void
}

// Shows the backend error message (or a generic one) with an optional retry button.
export function QueryErrorAlert({ error, onRetry }: QueryErrorAlertProps) {
  return (
    <Alert
      type="error"
      showIcon
      title={getErrorMessage(error)}
      action={
        onRetry && (
          <Button size="small" onClick={onRetry}>
            Thử lại
          </Button>
        )
      }
    />
  )
}
