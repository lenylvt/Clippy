import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import './index.css';
import { AppShell, RequireAuth } from '@/layout/AppShell';
import { LoginPage } from '@/pages/LoginPage';
import { OverviewPage } from '@/pages/OverviewPage';
import { UsersPage } from '@/pages/UsersPage';
import { JobsPage } from '@/pages/JobsPage';
import { ClipsPage } from '@/pages/ClipsPage';
import { DevicesPage } from '@/pages/DevicesPage';
import { OpsPage } from '@/pages/OpsPage';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/dashboard">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route index element={<OverviewPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="jobs" element={<JobsPage />} />
            <Route path="clips" element={<ClipsPage />} />
            <Route path="devices" element={<DevicesPage />} />
            <Route path="ops" element={<OpsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
