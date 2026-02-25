import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';

import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Logs from './pages/Logs';
import ReviewDetail from './pages/ReviewDetail';
import Analytics from './pages/Analytics';
import Repos from './pages/Repos';
import Settings from './pages/Settings';
import ApiKeys from './pages/ApiKeys';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/logs" element={<ProtectedRoute><Logs /></ProtectedRoute>} />
            <Route path="/logs/:id" element={<ProtectedRoute><ReviewDetail /></ProtectedRoute>} />
            <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
            <Route path="/repos" element={<ProtectedRoute><Repos /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/context" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/api-keys" element={<ProtectedRoute><ApiKeys /></ProtectedRoute>} />
            <Route path="*" element={
              <div className="flex items-center justify-center h-screen bg-black">
                <p className="text-[#333] uppercase tracking-widest text-sm">Coming Soon</p>
              </div>
            } />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
