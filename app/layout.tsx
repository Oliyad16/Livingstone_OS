import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import { WorkspaceProvider } from "./components/WorkspaceContext";

export const metadata: Metadata = {
  title: "Livingstone Dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-white min-h-screen antialiased">
        <WorkspaceProvider>
          <div className="flex flex-col h-screen">
            <TopBar />
            <div className="flex flex-1 min-h-0">
              <Sidebar />
              <main className="flex-1 p-8 overflow-auto">{children}</main>
            </div>
          </div>
        </WorkspaceProvider>
      </body>
    </html>
  );
}
