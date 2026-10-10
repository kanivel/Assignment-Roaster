import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SubmitForm } from '../../components/submissions/SubmitForm'
import * as submissionsService from '../../services/submissions'
import { renderWithProviders } from '../test-utils'
import { makeSubmission } from './fixtures'

vi.mock('../../services/submissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/submissions')>()
  return { ...actual, createSubmission: vi.fn() }
})

const mockedCreate = vi.mocked(submissionsService.createSubmission)

const getInput = (): HTMLInputElement =>
  screen.getByLabelText(/github repository url/i) as HTMLInputElement

const getSubmitButton = (): HTMLButtonElement =>
  screen.getByRole('button', { name: /roast it/i }) as HTMLButtonElement

describe('SubmitForm', () => {
  beforeEach(() => {
    mockedCreate.mockReset()
  })

  it('disables submit while the URL is empty', () => {
    renderWithProviders(<SubmitForm />)
    expect(getSubmitButton()).toBeDisabled()
  })

  it('shows a validation error and keeps submit disabled for an invalid URL', () => {
    renderWithProviders(<SubmitForm />)
    fireEvent.change(getInput(), { target: { value: 'https://gitlab.com/foo/bar' } })
    expect(screen.getByText(/enter a public github repo url/i)).toBeInTheDocument()
    expect(getSubmitButton()).toBeDisabled()
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  it('enables submit for a valid URL', () => {
    renderWithProviders(<SubmitForm />)
    fireEvent.change(getInput(), { target: { value: 'https://github.com/octocat/hello-world' } })
    expect(screen.queryByText(/enter a public github repo url/i)).not.toBeInTheDocument()
    expect(getSubmitButton()).toBeEnabled()
  })

  it('submits a valid URL and reports the new submission id', async () => {
    mockedCreate.mockResolvedValueOnce(makeSubmission({ id: 42 }))
    const onSubmitted = vi.fn()
    renderWithProviders(<SubmitForm onSubmitted={onSubmitted} />)
    fireEvent.change(getInput(), { target: { value: 'https://github.com/octocat/hello-world/' } })
    fireEvent.submit(screen.getByRole('form', { name: /submit a repository/i }))
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(42))
    expect(mockedCreate).toHaveBeenCalledWith({
      github_url: 'https://github.com/octocat/hello-world',
    })
  })

  it('shows the API error detail when the backend rejects the repo', async () => {
    mockedCreate.mockRejectedValueOnce(new Error('Repository not found or is private'))
    renderWithProviders(<SubmitForm />)
    fireEvent.change(getInput(), { target: { value: 'https://github.com/octocat/missing' } })
    fireEvent.submit(screen.getByRole('form', { name: /submit a repository/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/repository not found or is private/i)
  })
})
