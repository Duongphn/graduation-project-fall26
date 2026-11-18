import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Form, Input } from 'antd'
import { useForm } from 'react-hook-form'
import { describe, expect, it } from 'vitest'

import { FormField } from './FormField'

interface Values {
  name: string
  point: { street: string }
}

function Fields({ ownId }: { ownId?: string }) {
  const { control } = useForm<Values>({ defaultValues: { name: '', point: { street: '' } } })
  return (
    <Form layout="vertical" component={false}>
      <FormField control={control} name="name" label="Tên tổ chức" required>
        {(field) => <Input {...field} />}
      </FormField>
      <FormField control={control} name="point.street" label="Số nhà, tên đường">
        {(field) => <Input {...field} id={ownId} />}
      </FormField>
    </Form>
  )
}

describe('FormField', () => {
  it('links each label to its input, also for a nested field name', async () => {
    render(<Fields />)
    const name = screen.getByLabelText('Tên tổ chức')
    const street = screen.getByLabelText('Số nhà, tên đường')
    expect(name.tagName).toBe('INPUT')
    expect(street).not.toBe(name)

    await userEvent.setup().click(screen.getByText('Số nhà, tên đường'))
    expect(street).toHaveFocus()
  })

  it('keeps an id the child sets itself', () => {
    render(<Fields ownId="street-input" />)
    expect(screen.getByLabelText('Số nhà, tên đường')).toHaveAttribute('id', 'street-input')
  })
})
