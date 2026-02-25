import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';

interface Props {
  children: React.ReactNode;
  title?: string;
}

export function AppLayout({ children, title }: Props) {
  return (
    <div className="flex min-h-screen bg-black">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar title={title} />
        <main className="flex-1 p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
