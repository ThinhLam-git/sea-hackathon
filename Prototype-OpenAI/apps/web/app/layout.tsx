import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Order Rescue · GPT Operations",
  description: "Make every remaining delivery attempt count. A policy-controlled OpenAI agent for delivery recovery.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}
