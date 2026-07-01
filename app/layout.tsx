import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import { WorkspaceProvider } from "./components/WorkspaceContext";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Private workspace. Sign in to continue.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="bg-gray-950 text-white min-h-screen antialiased">
        <WorkspaceProvider>
          <div className="flex flex-col h-screen">
            <TopBar />
            <div className="flex flex-1 min-h-0">
              <Sidebar />
              <main className="flex-1 p-8 lg:p-10 overflow-auto">{children}</main>
            </div>
          </div>
        </WorkspaceProvider>
      </body>
    </html>
  );
}
