import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { AppContext } from './context'
import { fakeApi, me } from './test/helpers'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

describe('the dashboard for people who are not on the commercial team', () => {
  it('tells a sales rep the app is for the phone and lets them sign out', async () => {
    const signOut = vi.fn()
    render(
      <MemoryRouter>
        <AppContext.Provider value={{ api: fakeApi({}), me: me('Rep', { fullName: 'Test Rep' }), signOut }}>
          <App />
        </AppContext.Provider>
      </MemoryRouter>,
    )
    expect(screen.getByText(/Sales representatives work in the DAS Engage mobile app/)).toBeInTheDocument()
    expect(screen.getByText('Signed in as Test Rep (Rep).')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalledOnce()
  })
})
