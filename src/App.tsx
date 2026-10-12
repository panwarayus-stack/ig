import { useState } from 'react';
import { AppProvider, useApp } from './store';
import { Layout } from './components/Layout';
import { SetupPage, LoginPage } from './pages/Setup';
import { OverviewPage } from './pages/Overview';
import { ConsolePage } from './pages/Console';
import { CommandsPage, AutomationPage } from './pages/Commands';
import { AIAssistantPage } from './pages/AIAssistant';
import { InstagramPage, SessionsPage } from './pages/Instagram';
import { SettingsPage, LogsPage, DeployPage, HelpPage } from './pages/Settings';

function AppContent() {
  const { state } = useApp();
  const [currentPage, setCurrentPage] = useState('overview');

  // First-time setup
  if (!state.setupComplete) {
    return <SetupPage />;
  }

  // Not logged in
  if (!state.dashboardSession) {
    return <LoginPage />;
  }

  // Main dashboard
  const renderPage = () => {
    switch (currentPage) {
      case 'overview': return <OverviewPage />;
      case 'console': return <ConsolePage />;
      case 'commands': return <CommandsPage />;
      case 'automation': return <AutomationPage />;
      case 'ai': return <AIAssistantPage />;
      case 'instagram': return <InstagramPage />;
      case 'sessions': return <SessionsPage />;
      case 'logs': return <LogsPage />;
      case 'settings': return <SettingsPage />;
      case 'deploy': return <DeployPage />;
      case 'help': return <HelpPage />;
      default: return <OverviewPage />;
    }
  };

  return (
    <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
      {renderPage()}
    </Layout>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
