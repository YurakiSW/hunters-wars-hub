import "./globals.css";
import CookieNotice from "../components/CookieNotice";

export const metadata = {
  title: "Hunters Wars — Counter Siege",
  description: "Hub di gilda per i counter di Guild Siege",
};

export default function RootLayout({ children }) {
  return (
    <html lang="it">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700;800&family=Cinzel+Decorative:wght@700;900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <CookieNotice />
      </body>
    </html>
  );
}
