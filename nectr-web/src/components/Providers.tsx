'use client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from 'react-hot-toast';
import { TooltipProvider } from '@/components/ui/tooltip';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: '#1A1A1A',
                color: '#FFFFFF',
                border: '1px solid #2A2A2A',
                borderRadius: '8px',
                fontSize: '13px',
                fontFamily: 'DM Sans, sans-serif',
              },
              success: {
                iconTheme: { primary: '#4ADB4A', secondary: '#1A1A1A' },
              },
              error: {
                iconTheme: { primary: '#DB4A4A', secondary: '#1A1A1A' },
              },
            }}
          />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
