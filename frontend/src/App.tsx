import { Center, Spinner } from '@chakra-ui/react'
import { AnimatePresence } from 'framer-motion'
import { lazy, Suspense } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'

import { Navbar } from './components/layout/Navbar'
import { PageWrapper } from './components/layout/PageWrapper'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
// Eager: small public pages on the critical path (first paint, login redirect, 404).
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'

// Lazy: everything behind auth or rarely visited becomes its own chunk.
// Pages use named exports, hence the `.then` shim to satisfy `lazy()`.
const RegisterPage = lazy(() =>
  import('./pages/RegisterPage').then((m) => ({ default: m.RegisterPage })),
)
const ForgotPasswordPage = lazy(() =>
  import('./pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })),
)
const OAuthCallbackPage = lazy(() =>
  import('./pages/OAuthCallbackPage').then((m) => ({ default: m.OAuthCallbackPage })),
)
const LeaderboardPage = lazy(() =>
  import('./pages/LeaderboardPage').then((m) => ({ default: m.LeaderboardPage })),
)
const SubmitPage = lazy(() => import('./pages/SubmitPage').then((m) => ({ default: m.SubmitPage })))
const SubmissionsPage = lazy(() =>
  import('./pages/SubmissionsPage').then((m) => ({ default: m.SubmissionsPage })),
)
const SubmissionDetailPage = lazy(() =>
  import('./pages/SubmissionDetailPage').then((m) => ({ default: m.SubmissionDetailPage })),
)
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const ProfilePage = lazy(() =>
  import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
)
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })))
const AdminUsersPage = lazy(() =>
  import('./pages/AdminUsersPage').then((m) => ({ default: m.AdminUsersPage })),
)
const AdminSubmissionsPage = lazy(() =>
  import('./pages/AdminSubmissionsPage').then((m) => ({ default: m.AdminSubmissionsPage })),
)

/** Shown while a lazy page chunk is downloading. */
const PageFallback = () => (
  <PageWrapper centered>
    <Center py={12}>
      <Spinner size="lg" color="brand.fg" borderWidth="3px" aria-label="Loading page" />
    </Center>
  </PageWrapper>
)

const App = () => {
  const location = useLocation()

  return (
    <>
      <Navbar />
      <AnimatePresence mode="wait">
        {/* Keyed so the outgoing page finishes its exit before the next chunk loads. */}
        <Suspense key={location.pathname} fallback={<PageFallback />}>
          <Routes location={location}>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/auth/callback" element={<OAuthCallbackPage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />

            <Route
              path="/submit"
              element={
                <ProtectedRoute>
                  <SubmitPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/submissions"
              element={
                <ProtectedRoute>
                  <SubmissionsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/submissions/:id"
              element={
                <ProtectedRoute>
                  <SubmissionDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <SettingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute adminOnly>
                  <AdminPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute adminOnly>
                  <AdminUsersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/submissions"
              element={
                <ProtectedRoute adminOnly>
                  <AdminSubmissionsPage />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </AnimatePresence>
    </>
  )
}

export default App
