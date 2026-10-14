import { Tag, Typography } from 'antd'

import { USER_MIN_AGE_YEARS } from '../../constants/domain'

interface AgeTagProps {
  // Null when the user has not entered a date of birth.
  age: number | null | undefined
  // From the backend response when it sends one (minAgeYears); the shared constant otherwise.
  minAgeYears?: number
}

// A user's age with the GB-07 check: under the minimum age it is shown as an error tag.
export function AgeTag({ age, minAgeYears = USER_MIN_AGE_YEARS }: AgeTagProps) {
  if (age === null || age === undefined) {
    return <Typography.Text type="warning">Chưa khai báo ngày sinh</Typography.Text>
  }
  if (age < minAgeYears) {
    return (
      <Tag color="error" className="m-0">
        {age} tuổi (chưa đủ {minAgeYears})
      </Tag>
    )
  }
  return <span>{age} tuổi</span>
}
