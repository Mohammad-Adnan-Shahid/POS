import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { User, Organization } from '../types'
import * as api from '../mockApi'

interface AuthState {
  token: string | null
  user: User | null
  organization: Organization | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  hasPermission: (permission: string) => boolean
  isAdmin: boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Restore session: validate stored token via /auth/me equivalent
    const session = api.readSession()
    const token = api.readToken()
    if (!session || !token) {
      setLoading(false)
      return
    }
    // In the mock, access token == user id. In real impl this calls GET /auth/me.
    api
      .me(token)
      .then(({ user: u, organization: o }) => {
        setUser(u)
        setOrganization(o)
        setToken(token)
      })
      .catch(() => api.clearSession())
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const payload = await api.login(email, password)
    setToken(payload.access_token)
    setUser(payload.user)
    setOrganization(payload.organization)
  }, [])

  const logout = useCallback(async () => {
    await api.logout()
    setToken(null)
    setUser(null)
    setOrganization(null)
  }, [])

  const hasPermission = useCallback(
    (permission: string) => {
      if (!user) return false
      return user.permissions.includes('*') || user.permissions.includes(permission)
    },
    [user],
  )

  const value = useMemo<AuthState>(
    () => ({
      token,
      user,
      organization,
      loading,
      login,
      logout,
      hasPermission,
      isAdmin: hasPermission('user.manage'),
    }),
    [token, user, organization, loading, login, logout, hasPermission],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
