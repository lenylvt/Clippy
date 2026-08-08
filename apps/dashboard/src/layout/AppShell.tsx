import { Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { Sidebar, Text, Button } from '@cloudflare/kumo';
import {
  ChartBarIcon,
  FilmStripIcon,
  GearSixIcon,
  HardDrivesIcon,
  ListChecksIcon,
  SignOutIcon,
  UsersIcon,
} from '@phosphor-icons/react';
import { clearAdminToken, getAdminToken } from '@/lib/api';

const NAV = [
  { to: '/', label: 'Overview', icon: ChartBarIcon },
  { to: '/users', label: 'Users', icon: UsersIcon },
  { to: '/jobs', label: 'Jobs', icon: ListChecksIcon },
  { to: '/clips', label: 'Clips', icon: FilmStripIcon },
  { to: '/devices', label: 'Devices', icon: HardDrivesIcon },
  { to: '/ops', label: 'Ops', icon: GearSixIcon },
] as const;

export function RequireAuth() {
  if (!getAdminToken()) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <Sidebar.Provider
      defaultOpen
      collapsible="icon"
      className="h-svh max-h-svh w-full overflow-hidden"
    >
      <Sidebar className="h-svh max-h-svh self-stretch" contentClassName="h-svh max-h-svh">
        <Sidebar.Header>
          <Text as="h1" variant="heading3" className="select-none px-2">
            Clippy
          </Text>
        </Sidebar.Header>
        <Sidebar.Content>
          <Sidebar.Group>
            <Sidebar.GroupLabel>Manage</Sidebar.GroupLabel>
            <Sidebar.Menu>
              {NAV.map((item) => {
                const active =
                  item.to === '/'
                    ? location.pathname === '/'
                    : location.pathname.startsWith(item.to);
                return (
                  <Sidebar.MenuButton
                    key={item.to}
                    icon={item.icon}
                    active={active}
                    tooltip={item.label}
                    onClick={() => navigate(item.to)}
                  >
                    {item.label}
                  </Sidebar.MenuButton>
                );
              })}
            </Sidebar.Menu>
          </Sidebar.Group>
        </Sidebar.Content>
        <Sidebar.Footer>
          <Button
            variant="ghost"
            icon={<SignOutIcon />}
            className="w-full justify-start"
            onClick={() => {
              clearAdminToken();
              navigate('/login');
            }}
          >
            Sign out
          </Button>
          <Sidebar.Trigger />
        </Sidebar.Footer>
      </Sidebar>

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-kumo-overlay">
        <Outlet />
      </main>
    </Sidebar.Provider>
  );
}
